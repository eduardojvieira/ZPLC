/**
 * @file zplc_scheduler_zephyr.c
 * @brief ZPLC Multitask Scheduler - Zephyr Implementation
 *
 * SPDX-License-Identifier: MIT
 *
 * This module implements the ZPLC multitask scheduler using Zephyr primitives:
 *   - k_timer: Fires at each task's configured interval
 *   - k_work_q: Executes task cycles on work queue threads
 *   - k_mutex: Protects shared memory access
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │                    ZPLC Task Scheduler                       │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  k_timer (10ms)  ──►  k_work (High Priority)  ──► FastTask  │
 *   │  k_timer (100ms) ──►  k_work (Normal Priority)──► SlowTask  │
 *   │                                                              │
 *   │  Shared Memory: IPI/OPI/Work (protected by mutex)           │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Each registered task gets:
 *   - Its own zplc_vm_t instance (private stack, PC, state)
 *   - A k_timer that fires at the task's interval
 *   - A k_work item that executes the task on a work queue
 *
 * Timer ISR submits work to appropriate queue based on task priority.
 * Work handler runs the VM cycle and updates statistics.
 */

#include <zephyr/kernel.h>
#include <zplc_scheduler.h>
#include <zplc_core.h>
#include <zplc_hal.h>
#include <string.h>

/* ============================================================================
 * Configuration
 * ============================================================================ */

#ifndef CONFIG_ZPLC_MAX_TASKS
#define CONFIG_ZPLC_MAX_TASKS 8
#endif

#ifndef CONFIG_ZPLC_SCHED_WORKQ_STACK_SIZE
#define CONFIG_ZPLC_SCHED_WORKQ_STACK_SIZE 2048
#endif

#ifndef CONFIG_ZPLC_SCHED_WORKQ_PRIORITY
#define CONFIG_ZPLC_SCHED_WORKQ_PRIORITY 5
#endif

#ifndef CONFIG_ZPLC_SCHED_HIGH_PRIO_STACK_SIZE
#define CONFIG_ZPLC_SCHED_HIGH_PRIO_STACK_SIZE 2048
#endif

#ifndef CONFIG_ZPLC_SCHED_HIGH_PRIO_PRIORITY
#define CONFIG_ZPLC_SCHED_HIGH_PRIO_PRIORITY 2
#endif

/* Priority threshold: tasks with priority <= this use high-priority queue */
#define ZPLC_HIGH_PRIO_THRESHOLD 1

/* ============================================================================
 * Internal Task Structure
 * ============================================================================ */

/**
 * @brief Internal task runtime data.
 *
 * Extends zplc_task_t with Zephyr-specific fields.
 */
typedef struct {
    /* Public task data */
    zplc_task_t task;
    
    /* VM instance for this task */
    zplc_vm_t vm;
    
    /* Zephyr primitives */
    struct k_timer timer;
    struct k_work work;
    
    /* Timing */
    uint32_t last_start_tick;
    uint32_t deadline_tick;
    
    /* Flags */
    uint8_t registered;
    uint8_t timer_running;
    uint8_t work_pending;
    uint8_t reserved;
} zplc_task_internal_t;

/* ============================================================================
 * Static Data
 * ============================================================================ */

/** @brief Task array */
static zplc_task_internal_t tasks[CONFIG_ZPLC_MAX_TASKS];

/** @brief Number of registered tasks */
static uint8_t task_count = 0;

/** @brief Scheduler state */
static zplc_sched_state_t sched_state = ZPLC_SCHED_STATE_UNINIT;

/** @brief Shared memory mutex */
static struct k_mutex mem_mutex;

/** @brief Normal priority work queue */
K_THREAD_STACK_DEFINE(normal_workq_stack, CONFIG_ZPLC_SCHED_WORKQ_STACK_SIZE);
static struct k_work_q normal_workq;

#ifdef CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ
/** @brief High priority work queue */
K_THREAD_STACK_DEFINE(high_workq_stack, CONFIG_ZPLC_SCHED_HIGH_PRIO_STACK_SIZE);
static struct k_work_q high_workq;
#endif

/* ============================================================================
 * I/O Synchronization
 * ============================================================================ */

/** @brief Number of digital I/O channels to sync */
#define ZPLC_DIO_CHANNEL_COUNT  4

/**
 * @brief Synchronize inputs from GPIO to IPI (Input Process Image).
 *
 * Reads physical GPIO inputs and writes them to the shared memory IPI region.
 * Called at the beginning of each task cycle.
 */
static void sync_inputs_to_ipi(void)
{
    uint8_t *ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    uint8_t value;
    
    if (ipi == NULL) {
        return;
    }
    
    /* Read GPIO inputs (channels 4-7 are inputs) */
    for (int i = 0; i < ZPLC_DIO_CHANNEL_COUNT; i++) {
        if (zplc_hal_gpio_read(4 + i, &value) == ZPLC_HAL_OK) {
            ipi[i] = value;
        }
    }
}

/**
 * @brief Synchronize outputs from OPI (Output Process Image) to GPIO.
 *
 * Reads the OPI region and writes to physical GPIO outputs.
 * Called at the end of each task cycle.
 */
static void sync_opi_to_outputs(void)
{
    uint8_t *opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    
    if (opi == NULL) {
        return;
    }
    
    /* Write GPIO outputs (channels 0-3 are outputs) */
    for (int i = 0; i < ZPLC_DIO_CHANNEL_COUNT; i++) {
        zplc_hal_gpio_write(i, opi[i]);
    }
}

/* ============================================================================
 * Forward Declarations
 * ============================================================================ */

static void task_timer_handler(struct k_timer *timer);
static void task_work_handler(struct k_work *work);

/* ============================================================================
 * Helper Functions
 * ============================================================================ */

/**
 * @brief Get the appropriate work queue for a task based on priority.
 */
static struct k_work_q *get_workq_for_priority(uint8_t priority)
{
#ifdef CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ
    if (priority <= ZPLC_HIGH_PRIO_THRESHOLD) {
        return &high_workq;
    }
#endif
    return &normal_workq;
}

/**
 * @brief Find task by timer pointer.
 */
static zplc_task_internal_t *find_task_by_timer(struct k_timer *timer)
{
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
        if (&tasks[i].timer == timer) {
            return &tasks[i];
        }
    }
    return NULL;
}

/**
 * @brief Find task by work pointer.
 */
static zplc_task_internal_t *find_task_by_work(struct k_work *work)
{
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
        if (&tasks[i].work == work) {
            return &tasks[i];
        }
    }
    return NULL;
}

/* ============================================================================
 * Timer and Work Handlers
 * ============================================================================ */

/**
 * @brief Timer expiry handler (runs in ISR context).
 *
 * This is called when a task's timer expires.
 * We submit work to the appropriate work queue.
 */
static void task_timer_handler(struct k_timer *timer)
{
    zplc_task_internal_t *t = find_task_by_timer(timer);
    
    if (t == NULL || !t->registered) {
        return;
    }
    
    if (t->task.state != ZPLC_TASK_STATE_RUNNING) {
        return;
    }
    
    /* Check for overrun (previous cycle not complete) */
    if (t->work_pending) {
        t->task.stats.overrun_count++;
        return; /* Skip this cycle */
    }
    
    /* Record deadline */
    t->deadline_tick = k_uptime_get_32() + (t->task.config.interval_us / 1000);
    
    /* Submit work */
    t->work_pending = 1;
    k_work_submit_to_queue(
        get_workq_for_priority(t->task.config.priority),
        &t->work
    );
}

/**
 * @brief Work handler (runs in work queue thread context).
 *
 * This executes the actual PLC task cycle.
 */
static void task_work_handler(struct k_work *work)
{
    zplc_task_internal_t *t = find_task_by_work(work);
    uint32_t start_tick, end_tick, exec_time;
    int result;
    
    if (t == NULL || !t->registered) {
        return;
    }
    
    if (t->task.state != ZPLC_TASK_STATE_RUNNING) {
        t->work_pending = 0;
        return;
    }
    
    /* Record start time */
    start_tick = k_uptime_get_32();
    t->last_start_tick = start_tick;
    
    /* Lock shared memory */
    k_mutex_lock(&mem_mutex, K_FOREVER);
    
    /* Sync inputs from GPIO to IPI before execution */
    sync_inputs_to_ipi();
    
    /* Execute one VM cycle */
    result = zplc_vm_run_cycle(&t->vm);
    
    /* Sync outputs from OPI to GPIO after execution */
    sync_opi_to_outputs();
    
    /* Unlock shared memory */
    k_mutex_unlock(&mem_mutex);
    
    /* Record end time */
    end_tick = k_uptime_get_32();
    exec_time = (end_tick - start_tick) * 1000; /* Convert to microseconds */
    
    /* Update statistics */
    t->task.stats.cycle_count++;
    t->task.stats.last_exec_time_us = exec_time;
    
    if (exec_time > t->task.stats.max_exec_time_us) {
        t->task.stats.max_exec_time_us = exec_time;
    }
    
    /* Update average (exponential moving average) */
    if (t->task.stats.avg_exec_time_us == 0) {
        t->task.stats.avg_exec_time_us = exec_time;
    } else {
        t->task.stats.avg_exec_time_us = 
            (t->task.stats.avg_exec_time_us * 7 + exec_time) / 8;
    }
    
    /* Check for deadline miss */
    if (end_tick > t->deadline_tick) {
        t->task.stats.overrun_count++;
    }
    
    /* Handle errors */
    if (result < 0) {
        t->task.state = ZPLC_TASK_STATE_ERROR;
        zplc_hal_log("[SCHED] Task %d error: %d\n", 
                     t->task.config.id, t->vm.error);
    }
    
    /* Clear work pending flag */
    t->work_pending = 0;
}

/* ============================================================================
 * Public API Implementation
 * ============================================================================ */

int zplc_sched_init(void)
{
    if (sched_state != ZPLC_SCHED_STATE_UNINIT) {
        return -1; /* Already initialized */
    }
    
    /* Initialize mutex */
    k_mutex_init(&mem_mutex);
    
    /* Initialize normal priority work queue */
    k_work_queue_init(&normal_workq);
    k_work_queue_start(
        &normal_workq,
        normal_workq_stack,
        K_THREAD_STACK_SIZEOF(normal_workq_stack),
        CONFIG_ZPLC_SCHED_WORKQ_PRIORITY,
        NULL
    );
    
#ifdef CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ
    /* Initialize high priority work queue */
    k_work_queue_init(&high_workq);
    k_work_queue_start(
        &high_workq,
        high_workq_stack,
        K_THREAD_STACK_SIZEOF(high_workq_stack),
        CONFIG_ZPLC_SCHED_HIGH_PRIO_PRIORITY,
        NULL
    );
#endif
    
    /* Clear task array */
    memset(tasks, 0, sizeof(tasks));
    task_count = 0;
    
    /* Initialize shared memory */
    zplc_mem_init();
    
    sched_state = ZPLC_SCHED_STATE_IDLE;
    
    zplc_hal_log("[SCHED] Scheduler initialized\n");
    
    return 0;
}

int zplc_sched_shutdown(void)
{
    if (sched_state == ZPLC_SCHED_STATE_UNINIT) {
        return -1;
    }
    
    /* Stop all tasks */
    zplc_sched_stop();
    
    /* Clear tasks */
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
        if (tasks[i].registered) {
            k_timer_stop(&tasks[i].timer);
            tasks[i].registered = 0;
        }
    }
    
    task_count = 0;
    sched_state = ZPLC_SCHED_STATE_UNINIT;
    
    zplc_hal_log("[SCHED] Scheduler shutdown\n");
    
    return 0;
}

int zplc_sched_register_task(const zplc_task_def_t *def,
                              const uint8_t *code,
                              size_t code_size)
{
    int slot = -1;
    uint16_t code_offset;
    
    if (sched_state == ZPLC_SCHED_STATE_UNINIT) {
        return -1;
    }
    
    if (def == NULL || code == NULL || code_size == 0) {
        return -2;
    }
    
    if (task_count >= CONFIG_ZPLC_MAX_TASKS) {
        return -3; /* No slots available */
    }
    
    /* Validate interval */
    if (def->interval_us < ZPLC_MIN_INTERVAL_US ||
        def->interval_us > ZPLC_MAX_INTERVAL_US) {
        return -4;
    }
    
    /* Find free slot */
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
        if (!tasks[i].registered) {
            slot = i;
            break;
        }
    }
    
    if (slot < 0) {
        return -3;
    }
    
    zplc_task_internal_t *t = &tasks[slot];
    
    /* Load code into shared segment */
    /* Calculate offset: each task's code is placed sequentially */
    code_offset = (uint16_t)zplc_mem_get_code_size();
    
    if (zplc_mem_load_code(code, code_size, code_offset) != 0) {
        return -5;
    }
    
    /* Initialize task data */
    memset(t, 0, sizeof(zplc_task_internal_t));
    memcpy(&t->task.config, def, sizeof(zplc_task_def_t));
    t->task.state = ZPLC_TASK_STATE_READY;
    t->task.code = zplc_mem_get_code(code_offset, code_size);
    t->task.code_size = code_size;
    
    /* Initialize VM for this task */
    zplc_vm_init(&t->vm);
    zplc_vm_set_entry(&t->vm, code_offset, (uint32_t)code_size);
    t->vm.task_id = def->id;
    t->vm.priority = def->priority;
    
    /* Initialize timer (but don't start yet) */
    k_timer_init(&t->timer, task_timer_handler, NULL);
    
    /* Initialize work item */
    k_work_init(&t->work, task_work_handler);
    
    t->registered = 1;
    task_count++;
    
    zplc_hal_log("[SCHED] Task %d registered: interval=%u us, priority=%d\n",
                 def->id, def->interval_us, def->priority);
    
    return slot;
}

int zplc_sched_load(const uint8_t *binary, size_t size)
{
    zplc_task_def_t defs[CONFIG_ZPLC_MAX_TASKS];
    int count;
    int slot;
    uint32_t total_code_size;
    
    if (sched_state == ZPLC_SCHED_STATE_UNINIT) {
        return -1;
    }
    
    if (binary == NULL || size == 0) {
        return -2;
    }
    
    /* Parse the .zplc file and load code segment */
    count = zplc_core_load_tasks(binary, size, defs, CONFIG_ZPLC_MAX_TASKS);
    if (count < 0) {
        zplc_hal_log("[SCHED] Failed to parse .zplc file: %d\n", count);
        return -3;
    }
    
    if (count == 0) {
        zplc_hal_log("[SCHED] No tasks found in .zplc file\n");
        return 0;
    }
    
    /* Get total code size (loaded by zplc_core_load_tasks) */
    total_code_size = zplc_mem_get_code_size();
    
    zplc_hal_log("[SCHED] Loading %d tasks (code size: %u bytes)\n", 
                 count, total_code_size);
    
    /* Register each task with its entry point */
    for (int i = 0; i < count; i++) {
        const zplc_task_def_t *def = &defs[i];
        zplc_task_internal_t *t;
        
        /* Validate interval */
        if (def->interval_us < ZPLC_MIN_INTERVAL_US ||
            def->interval_us > ZPLC_MAX_INTERVAL_US) {
            zplc_hal_log("[SCHED] Task %d has invalid interval %u us\n",
                         def->id, def->interval_us);
            continue; /* Skip invalid tasks */
        }
        
        /* Find free slot */
        slot = -1;
        for (int j = 0; j < CONFIG_ZPLC_MAX_TASKS; j++) {
            if (!tasks[j].registered) {
                slot = j;
                break;
            }
        }
        
        if (slot < 0) {
            zplc_hal_log("[SCHED] No slots available for task %d\n", def->id);
            return -4;
        }
        
        t = &tasks[slot];
        
        /* Initialize task data */
        memset(t, 0, sizeof(zplc_task_internal_t));
        memcpy(&t->task.config, def, sizeof(zplc_task_def_t));
        t->task.state = ZPLC_TASK_STATE_READY;
        
        /* Point to code in shared segment (already loaded) */
        t->task.code = zplc_mem_get_code(def->entry_point, 
                                          total_code_size - def->entry_point);
        t->task.code_size = total_code_size - def->entry_point;
        
        /* Initialize VM with entry point */
        zplc_vm_init(&t->vm);
        /* Pass total_code_size (not task size) - zplc_vm_set_entry sets
         * vm->code_size = entry_point + task_code_size, so for multi-task
         * we need: code_size = total_code_size, meaning task_code_size
         * should be (total_code_size - entry_point) */
        if (zplc_vm_set_entry(&t->vm, def->entry_point, 
                              total_code_size - def->entry_point) != 0) {
            zplc_hal_log("[SCHED] Failed to set entry for task %d\n", def->id);
            continue; /* Skip this task */
        }
        t->vm.task_id = def->id;
        t->vm.priority = def->priority;
        
        /* Initialize timer (but don't start yet) */
        k_timer_init(&t->timer, task_timer_handler, NULL);
        
        /* Initialize work item */
        k_work_init(&t->work, task_work_handler);
        
        t->registered = 1;
        task_count++;
        
        zplc_hal_log("[SCHED] Task %d loaded: entry=%u, interval=%u us, priority=%d\n",
                     def->id, def->entry_point, def->interval_us, def->priority);
    }
    
    return count;
}

int zplc_sched_unregister_task(int task_id)
{
    if (task_id < 0 || task_id >= CONFIG_ZPLC_MAX_TASKS) {
        return -1;
    }
    
    zplc_task_internal_t *t = &tasks[task_id];
    
    if (!t->registered) {
        return -2;
    }
    
    /* Stop timer if running */
    if (t->timer_running) {
        k_timer_stop(&t->timer);
        t->timer_running = 0;
    }
    
    /* Wait for pending work to complete */
    k_work_flush(&t->work, NULL);
    
    t->registered = 0;
    t->task.state = ZPLC_TASK_STATE_IDLE;
    task_count--;
    
    zplc_hal_log("[SCHED] Task %d unregistered\n", t->task.config.id);
    
    return 0;
}

int zplc_sched_start(void)
{
    if (sched_state == ZPLC_SCHED_STATE_UNINIT) {
        return -1;
    }
    
    if (sched_state == ZPLC_SCHED_STATE_RUNNING) {
        return 0; /* Already running */
    }
    
    /* Start all ready tasks */
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
        zplc_task_internal_t *t = &tasks[i];
        
        if (!t->registered) {
            continue;
        }
        
        if (t->task.state != ZPLC_TASK_STATE_READY &&
            t->task.state != ZPLC_TASK_STATE_PAUSED) {
            continue;
        }
        
        /* Reset VM for fresh start */
        zplc_vm_reset_cycle(&t->vm);
        
        /* Clear statistics */
        memset(&t->task.stats, 0, sizeof(zplc_task_stats_t));
        
        /* Start timer */
        uint32_t interval_ms = t->task.config.interval_us / 1000;
        if (interval_ms == 0) {
            interval_ms = 1; /* Minimum 1ms */
        }
        
        k_timer_start(&t->timer, K_MSEC(interval_ms), K_MSEC(interval_ms));
        t->timer_running = 1;
        t->task.state = ZPLC_TASK_STATE_RUNNING;
        
        zplc_hal_log("[SCHED] Task %d started (interval=%u ms)\n",
                     t->task.config.id, interval_ms);
    }
    
    sched_state = ZPLC_SCHED_STATE_RUNNING;
    
    zplc_hal_log("[SCHED] Scheduler started with %d tasks\n", task_count);
    
    return 0;
}

int zplc_sched_stop(void)
{
    if (sched_state == ZPLC_SCHED_STATE_UNINIT) {
        return -1;
    }
    
    if (sched_state == ZPLC_SCHED_STATE_IDLE) {
        return 0;
    }
    
    /* Stop all timers */
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
        zplc_task_internal_t *t = &tasks[i];
        
        if (!t->registered) {
            continue;
        }
        
        if (t->timer_running) {
            k_timer_stop(&t->timer);
            t->timer_running = 0;
        }
        
        /* Wait for pending work */
        k_work_flush(&t->work, NULL);
        
        if (t->task.state == ZPLC_TASK_STATE_RUNNING) {
            t->task.state = ZPLC_TASK_STATE_READY;
        }
    }
    
    sched_state = ZPLC_SCHED_STATE_IDLE;
    
    zplc_hal_log("[SCHED] Scheduler stopped\n");
    
    return 0;
}

int zplc_sched_pause(void)
{
    if (sched_state != ZPLC_SCHED_STATE_RUNNING) {
        return -1;
    }
    
    /* Pause all running tasks */
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
        zplc_task_internal_t *t = &tasks[i];
        
        if (!t->registered) {
            continue;
        }
        
        if (t->task.state == ZPLC_TASK_STATE_RUNNING) {
            t->task.state = ZPLC_TASK_STATE_PAUSED;
        }
    }
    
    sched_state = ZPLC_SCHED_STATE_PAUSED;
    
    return 0;
}

int zplc_sched_resume(void)
{
    if (sched_state != ZPLC_SCHED_STATE_PAUSED) {
        return -1;
    }
    
    /* Resume all paused tasks */
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
        zplc_task_internal_t *t = &tasks[i];
        
        if (!t->registered) {
            continue;
        }
        
        if (t->task.state == ZPLC_TASK_STATE_PAUSED) {
            t->task.state = ZPLC_TASK_STATE_RUNNING;
        }
    }
    
    sched_state = ZPLC_SCHED_STATE_RUNNING;
    
    return 0;
}

zplc_sched_state_t zplc_sched_get_state(void)
{
    return sched_state;
}

int zplc_sched_get_stats(zplc_sched_stats_t *stats)
{
    if (stats == NULL) {
        return -1;
    }
    
    memset(stats, 0, sizeof(zplc_sched_stats_t));
    
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
        zplc_task_internal_t *t = &tasks[i];
        
        if (!t->registered) {
            continue;
        }
        
        stats->active_tasks++;
        stats->total_cycles += t->task.stats.cycle_count;
        stats->total_overruns += t->task.stats.overrun_count;
    }
    
    stats->uptime_ms = k_uptime_get_32();
    
    return 0;
}

int zplc_sched_get_task(int task_id, zplc_task_t *task)
{
    if (task_id < 0 || task_id >= CONFIG_ZPLC_MAX_TASKS) {
        return -1;
    }
    
    if (task == NULL) {
        return -2;
    }
    
    zplc_task_internal_t *t = &tasks[task_id];
    
    if (!t->registered) {
        return -3;
    }
    
    memcpy(task, &t->task, sizeof(zplc_task_t));
    
    return 0;
}

int zplc_sched_get_task_count(void)
{
    return task_count;
}

int zplc_sched_lock(int timeout_ms)
{
    k_timeout_t timeout;
    
    if (timeout_ms < 0) {
        timeout = K_FOREVER;
    } else if (timeout_ms == 0) {
        timeout = K_NO_WAIT;
    } else {
        timeout = K_MSEC(timeout_ms);
    }
    
    return k_mutex_lock(&mem_mutex, timeout);
}

int zplc_sched_unlock(void)
{
    return k_mutex_unlock(&mem_mutex);
}
