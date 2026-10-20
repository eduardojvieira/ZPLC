/**
 * @file zplc_scheduler_freertos.c
 * @brief The FreeRTOS adapter of the portable scheduler core. See zplc_scheduler_freertos.h.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_scheduler_freertos.h"

#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_loader.h>

#include "zplc_freertos_port.h"

#include <FreeRTOS.h>
#include <semphr.h>
#include <task.h>
#include <timers.h>

#include <string.h>

#define MAX_TASKS ZPLC_SCHED_CORE_MAX_SLOTS
#define COORDINATOR_PRIORITY (tskIDLE_PRIORITY + 3U)
#define COORDINATOR_STACK_WORDS ((configSTACK_DEPTH_TYPE)8192)

/* ============================================================================
 * State
 * ============================================================================ */

static zplc_sched_core_t core;
static zplc_sched_slot_t slots[MAX_TASKS];
static zplc_vm_t vms[MAX_TASKS];
static TimerHandle_t timers[MAX_TASKS];
static TaskHandle_t coordinator;
static zplc_hal_mutex_t image_lock;   /* the process image (RT-010) */
static zplc_hal_mutex_t io_lock;      /* the pins and the watchdog */
static zplc_hal_mutex_t scan_lock;    /* a batch, or a change of the task table: never both at once */
static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

static uint64_t (*test_clock_us)(void);
static volatile uint8_t test_force_miss;
static volatile uint32_t batches_run;
static uint8_t fault_kept;
static uint8_t fault_reason;
static uint16_t fault_task;

/* What a scan holds on its stack: the samples of its inputs and the values of its outputs. */
typedef struct {
    zplc_io_samples_t samples;
    zplc_io_outputs_t outputs;
} scan_buffers_t;

/* ============================================================================
 * The port the core is handed
 * ============================================================================ */

static uint64_t scheduler_now_us(void)
{
    return test_clock_us != NULL ? test_clock_us() : zplc_freertos_now_us();
}

static uint64_t port_now_us(void *ctx)
{
    (void)ctx;
    return scheduler_now_us();
}

/* The core's own state is changed in a critical section of the kernel; it nests, so the key carries nothing. */
static unsigned int port_enter(void *ctx)
{
    (void)ctx;
    taskENTER_CRITICAL();
    return 0U;
}

static void port_leave(void *ctx, unsigned int key)
{
    (void)ctx;
    (void)key;
    taskEXIT_CRITICAL();
}

static int port_lock_image(void *ctx)
{
    (void)ctx;
    return zplc_hal_mutex_lock(image_lock) == ZPLC_HAL_OK ? 0 : ZPLC_SCHED_ERR_LOCK;
}

static void port_unlock_image(void *ctx)
{
    (void)ctx;
    (void)zplc_hal_mutex_unlock(image_lock);
}

static int port_lock_io(void *ctx)
{
    (void)ctx;
    return zplc_hal_mutex_lock(io_lock) == ZPLC_HAL_OK ? 0 : ZPLC_SCHED_ERR_LOCK;
}

static void port_unlock_io(void *ctx)
{
    (void)ctx;
    (void)zplc_hal_mutex_unlock(io_lock);
}

static int port_sample_inputs(void *ctx)
{
    return (int)zplc_io_sample(&((scan_buffers_t *)ctx)->samples, NULL);
}

static void port_latch_inputs(void *ctx)
{
    zplc_io_apply_samples(&((scan_buffers_t *)ctx)->samples);
}

static void port_capture_outputs(void *ctx)
{
    zplc_io_capture_outputs(&((scan_buffers_t *)ctx)->outputs);
}

static void port_publish(void *ctx)
{
    (void)ctx;
}

static int port_write_outputs(void *ctx)
{
    return (int)zplc_io_write_outputs(&((scan_buffers_t *)ctx)->outputs, NULL);
}

static int port_reset_image(void *ctx)
{
    (void)ctx;
    return zplc_io_reset_image();
}

static int port_drive_safe_pins(void *ctx)
{
    (void)ctx;
    /* Takes the output lock itself (the contract of the core). */
    if (zplc_hal_mutex_lock(io_lock) != ZPLC_HAL_OK) {
        return ZPLC_SCHED_ERR_LOCK;
    }
    {
        const int result = (int)zplc_io_drive_safe(NULL);

        (void)zplc_hal_mutex_unlock(io_lock);
        return result;
    }
}

static void stop_all_timers(void)
{
    int index;

    for (index = 0; index < (int)MAX_TASKS; ++index) {
        if (timers[index] != NULL) {
            (void)xTimerStop(timers[index], pdMS_TO_TICKS(100));
        }
    }
}

static void port_stop_releases(void *ctx)
{
    (void)ctx;
    stop_all_timers();
}

/* The first fault of a run is kept in RAM where a task that restarts will not clear it. A board keeps it in a
 * no-init section or a backup register so that a watchdog reset does not erase it (RT-020). */
static void port_fault_latched(void *ctx, zplc_sched_fault_reason_t reason, uint16_t task_id)
{
    (void)ctx;
    fault_reason = (uint8_t)reason;
    fault_task = task_id;
    fault_kept = 1U;
}

static int port_probe(void *ctx, zplc_sched_probe_t point, uint16_t task_id)
{
    (void)ctx;
    (void)task_id;
    if (point == ZPLC_SCHED_PROBE_FORCE_MISS && test_force_miss != 0U) {
        test_force_miss = 0U;
        return 1;
    }
    return 0;
}

static const zplc_sched_port_t freertos_port = {
    .ctx = NULL,
    .now_us = port_now_us,
    .enter = port_enter,
    .leave = port_leave,
    .lock_image = port_lock_image,
    .unlock_image = port_unlock_image,
    .lock_io = port_lock_io,
    .unlock_io = port_unlock_io,
    .sample_inputs = port_sample_inputs,
    .latch_inputs = port_latch_inputs,
    .capture_outputs = port_capture_outputs,
    .publish = port_publish,
    .write_outputs = port_write_outputs,
    /* No hardware watchdog on the simulator: feed_watchdog and watchdog_state stay absent. */
    .reset_image = port_reset_image,
    .drive_safe_pins = port_drive_safe_pins,
    .stop_releases = port_stop_releases,
    .probe = port_probe,
    .fault_latched = port_fault_latched,
};

/* ============================================================================
 * Releases and batches
 * ============================================================================ */

static int execute_batch(const uint8_t *order, uint8_t count)
{
    scan_buffers_t buffers;
    zplc_sched_port_t port = freertos_port;
    zplc_sched_scan_report_t report;
    int result;

    memset(&buffers, 0, sizeof(buffers));
    port.ctx = &buffers;
    if (zplc_hal_mutex_lock(scan_lock) != ZPLC_HAL_OK) {
        return ZPLC_SCHED_ERR_LOCK;
    }
    result = zplc_sched_core_scan(&core, &port, order, count, 0, &report);
    (void)zplc_hal_mutex_unlock(scan_lock);
    batches_run++;
    if (report.deadline_task >= 0) {
        zplc_hal_log("[SCHED] Deadline miss limit reached by task slot %d\n", report.deadline_task);
    }
    if (report.error_task >= 0) {
        zplc_hal_log("[SCHED] Task slot %d failed: %d\n", report.error_task, report.error_code);
    }
    return result;
}

static uint8_t collect_due(uint8_t *order)
{
    uint8_t count;

    taskENTER_CRITICAL();
    count = zplc_sched_core_collect(&core, order, MAX_TASKS);
    taskEXIT_CRITICAL();
    return count;
}

/* The timer callback runs in the timer service task: it stamps the release, which is also the instant the deadline is
 * counted from, and wakes the scheduler task if the core admitted it. */
static void release_timer_callback(TimerHandle_t timer)
{
    const int slot = (int)(intptr_t)pvTimerGetTimerID(timer);
    const uint64_t release = scheduler_now_us();
    int admitted;

    taskENTER_CRITICAL();
    admitted = zplc_sched_core_admit(&core, slot, release, release);
    taskEXIT_CRITICAL();
    if (admitted != 0 && coordinator != NULL) {
        (void)xTaskNotifyGive(coordinator);
    }
}

static void coordinator_task(void *arg)
{
    uint8_t order[MAX_TASKS];

    (void)arg;
    for (;;) {
        (void)ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
        (void)execute_batch(order, collect_due(order));
    }
}

/* ============================================================================
 * Life cycle
 * ============================================================================ */

int zplc_fr_sched_init(void)
{
    if (core.state != ZPLC_SCHED_STATE_UNINIT) {
        return -1;
    }
    image_lock = zplc_hal_mutex_create();
    io_lock = zplc_hal_mutex_create();
    scan_lock = zplc_hal_mutex_create();
    if (image_lock == NULL || io_lock == NULL || scan_lock == NULL) {
        return ZPLC_SCHED_ERR_LOCK;
    }
    zplc_sched_core_init(&core, slots, MAX_TASKS, 0U);
    core.keep_halted_vm = 1U;
    memset(timers, 0, sizeof(timers));
    test_clock_us = NULL;
    test_force_miss = 0U;
    batches_run = 0U;
    fault_kept = 0U;
    if (xTaskCreate(coordinator_task, "zplc-sched", COORDINATOR_STACK_WORDS, NULL, COORDINATOR_PRIORITY,
                    &coordinator) != pdPASS) {
        return ZPLC_SCHED_ERR_LOCK;
    }
    return 0;
}

static void delete_timers(void)
{
    int index;

    for (index = 0; index < (int)MAX_TASKS; ++index) {
        if (timers[index] != NULL) {
            (void)xTimerDelete(timers[index], pdMS_TO_TICKS(100));
            timers[index] = NULL;
        }
    }
}

void zplc_fr_sched_shutdown(void)
{
    if (core.state == ZPLC_SCHED_STATE_UNINIT) {
        return;
    }
    (void)zplc_fr_sched_stop();
    delete_timers();
    if (coordinator != NULL) {
        TaskHandle_t task = coordinator;

        coordinator = NULL;
        vTaskDelete(task);
    }
    (void)zplc_hal_mutex_destroy(image_lock);
    (void)zplc_hal_mutex_destroy(io_lock);
    (void)zplc_hal_mutex_destroy(scan_lock);
    memset(&core, 0, sizeof(core));
}

int zplc_fr_sched_load(const uint8_t *binary, size_t size)
{
    zplc_task_def_t defs[MAX_TASKS];
    uint32_t code_size;
    int count;
    int index;

    if (core.state == ZPLC_SCHED_STATE_UNINIT || binary == NULL) {
        return -1;
    }
    if (zplc_hal_mutex_lock(scan_lock) != ZPLC_HAL_OK) {
        return ZPLC_SCHED_ERR_LOCK;
    }
    if (zplc_hal_mutex_lock(image_lock) != ZPLC_HAL_OK) {
        (void)zplc_hal_mutex_unlock(scan_lock);
        return ZPLC_SCHED_ERR_LOCK;
    }
    /* The loader verifies the whole artifact before it changes anything, and a load is a cold start (RT-016). */
    count = zplc_core_load_tasks(binary, size, defs, MAX_TASKS, workspace, sizeof(workspace));
    (void)zplc_hal_mutex_unlock(image_lock);
    if (count < 0) {
        (void)zplc_hal_mutex_unlock(scan_lock);
        return count;
    }

    delete_timers();
    taskENTER_CRITICAL();
    for (index = 0; index < (int)MAX_TASKS; ++index) {
        (void)zplc_sched_core_remove_task(&core, index);
    }
    zplc_sched_core_reset_counters(&core);
    taskEXIT_CRITICAL();
    fault_kept = 0U;

    code_size = zplc_mem_get_code_size();
    for (index = 0; index < count; ++index) {
        const zplc_task_def_t *def = &defs[index];
        zplc_vm_t *vm = &vms[index];

        zplc_vm_init(vm);
        (void)zplc_vm_set_entry(vm, def->entry_point, code_size - def->entry_point);
        vm->task_id = def->id;
        vm->priority = def->priority;
        vm->stack_limit = def->stack_size;
        taskENTER_CRITICAL();
        {
            const int slot = zplc_sched_core_add_task(&core, def, vm);

            if (slot >= 0) {
                slots[slot].task.code = zplc_mem_get_code(def->entry_point, code_size - def->entry_point);
                slots[slot].task.code_size = code_size - def->entry_point;
            }
        }
        taskEXIT_CRITICAL();
    }
    (void)zplc_hal_mutex_unlock(scan_lock);
    return count;
}

int zplc_fr_sched_start(void)
{
    int index;
    int started = 0;

    if (core.state == ZPLC_SCHED_STATE_UNINIT) {
        return -1;
    }
    if (zplc_hal_mutex_lock(scan_lock) != ZPLC_HAL_OK) {
        return ZPLC_SCHED_ERR_LOCK;
    }
    if (core.state != ZPLC_SCHED_STATE_IDLE || core.fault_latched != 0U) {
        (void)zplc_hal_mutex_unlock(scan_lock);
        return -1;
    }
    if (core.count == 0U) {
        (void)zplc_hal_mutex_unlock(scan_lock);
        return -2;
    }
    taskENTER_CRITICAL();
    zplc_sched_core_begin_run(&core);
    (void)zplc_sched_core_set_running(&core);
    taskEXIT_CRITICAL();
    for (index = 0; index < (int)MAX_TASKS; ++index) {
        if (slots[index].registered != 0U) {
            const uint32_t interval_ms = slots[index].task.config.interval_us / 1000U;
            TickType_t period = pdMS_TO_TICKS(interval_ms);

            if (period == 0U) {
                period = 1U; /* an interval below one tick is released at the tick */
            }
            zplc_vm_reset_cycle(&vms[index]);
            memset(&slots[index].task.stats, 0, sizeof(zplc_task_stats_t));
            if (timers[index] == NULL) {
                timers[index] = xTimerCreate("zplc-task", period, pdTRUE, (void *)(intptr_t)index,
                                             release_timer_callback);
            } else {
                (void)xTimerChangePeriod(timers[index], period, pdMS_TO_TICKS(100));
            }
            if (timers[index] != NULL && xTimerStart(timers[index], pdMS_TO_TICKS(100)) == pdPASS) {
                started++;
            }
        }
    }
    (void)zplc_hal_mutex_unlock(scan_lock);
    return started > 0 ? 0 : -3;
}

int zplc_fr_sched_stop(void)
{
    int index;
    int result;

    if (core.state == ZPLC_SCHED_STATE_UNINIT) {
        return -1;
    }
    stop_all_timers();
    /* Waits for the batch that is running: it holds the scan lock. */
    if (zplc_hal_mutex_lock(scan_lock) != ZPLC_HAL_OK) {
        return ZPLC_SCHED_ERR_LOCK;
    }
    taskENTER_CRITICAL();
    zplc_sched_core_set_stopped(&core);
    taskEXIT_CRITICAL();
    if (core.fault_latched == 0U) {
        for (index = 0; index < (int)MAX_TASKS; ++index) {
            if (slots[index].registered != 0U) {
                zplc_vm_reset_cycle(&vms[index]);
                vms[index].resume_skip_breakpoint_once = 0U;
            }
        }
    }
    result = zplc_sched_core_apply_safe_outputs(&core, &freertos_port);
    (void)zplc_hal_mutex_unlock(scan_lock);
    return result;
}

zplc_sched_state_t zplc_fr_sched_state(void)
{
    return core.state;
}

int zplc_fr_sched_get_task(int slot, zplc_task_t *task)
{
    if (slot < 0 || slot >= (int)MAX_TASKS || task == NULL || slots[slot].registered == 0U) {
        return -1;
    }
    taskENTER_CRITICAL();
    *task = slots[slot].task;
    taskEXIT_CRITICAL();
    return 0;
}

zplc_sched_core_t *zplc_fr_sched_core(void)
{
    return &core;
}

int zplc_fr_sched_fault(uint8_t *reason, uint16_t *task_id)
{
    if (fault_kept == 0U) {
        return -1;
    }
    if (reason != NULL) {
        *reason = fault_reason;
    }
    if (task_id != NULL) {
        *task_id = fault_task;
    }
    return 0;
}

/* ============================================================================
 * Test seams
 * ============================================================================ */

void zplc_fr_sched_test_set_clock(uint64_t (*clock_us)(void))
{
    test_clock_us = clock_us;
}

int zplc_fr_sched_test_admit_release_at(int slot, uint64_t release_us)
{
    int admitted;

    if (slot < 0 || slot >= (int)MAX_TASKS || slots[slot].registered == 0U) {
        return -1;
    }
    taskENTER_CRITICAL();
    admitted = zplc_sched_core_admit(&core, slot, release_us, release_us);
    taskEXIT_CRITICAL();
    return admitted;
}

int zplc_fr_sched_test_run_batch(void)
{
    uint8_t order[MAX_TASKS];
    const uint8_t count = collect_due(order);

    return execute_batch(order, count);
}

void zplc_fr_sched_test_stop_timers(void)
{
    stop_all_timers();
}

void zplc_fr_sched_test_force_next_deadline_miss(void)
{
    test_force_miss = 1U;
}

uint32_t zplc_fr_sched_test_batches_run(void)
{
    return batches_run;
}
