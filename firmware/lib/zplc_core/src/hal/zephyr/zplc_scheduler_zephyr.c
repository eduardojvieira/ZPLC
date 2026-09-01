/**
 * @file zplc_scheduler_zephyr.c
 * @brief ZPLC Multitask Scheduler - Zephyr Implementation
 *
 * SPDX-License-Identifier: MIT
 *
 * This module implements the ZPLC multitask scheduler using Zephyr primitives:
 *   - k_timer: Fires at each task's configured interval
 *   - one k_work coordinator: executes each due-set as one process-image batch
 *   - k_mutex: Protects shared memory access
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │                    ZPLC Task Scheduler                       │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  task k_timers ──► admission ──► one k_work coordinator    │
 *   │                                      │                      │
 *   │                         ordered due-set process-image batch │
 *   │                                                              │
 *   │  Shared Memory: IPI/OPI/Work (protected by mutex)           │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Each registered task gets:
 *   - Its own zplc_vm_t instance (private stack, PC, state)
 *   - A k_timer that fires at the task's interval
 *   - admission state consumed by the single coordinator work item
 *
 * Timer ISRs only admit releases. The coordinator takes one input snapshot,
 * orders all releases, runs them, then performs at most one output commit.
 */

#include <errno.h>
#include <stdbool.h>
#include <string.h>
#include <zephyr/kernel.h>
#if defined(CONFIG_ZPLC_HARDWARE_WATCHDOG)
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/watchdog.h>
#endif
#include <zplc_core.h>
#include <zplc_debug.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>

/* ============================================================================
 * Configuration
 * ============================================================================
 */

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

/* ============================================================================
 * Internal Task Structure
 * ============================================================================
 */

typedef struct {
  int64_t uptime_ms;
  uint32_t cycle32;
} scheduler_stamp_t;

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
  /* Release timestamp captured by the timer admission path. */
  scheduler_stamp_t release;

  /* Flags */
  uint8_t registered;
  uint8_t timer_running;
  uint8_t work_pending;
  uint8_t reserved;
} zplc_task_internal_t;

/* ============================================================================
 * Static Data
 * ============================================================================
 */

/** @brief Task array */
static zplc_task_internal_t tasks[CONFIG_ZPLC_MAX_TASKS];

/* Caller-owned verifier scratch; never allocate this from a task stack. */
static uint8_t load_workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

/** @brief Number of registered tasks */
static uint8_t task_count = 0;

/** @brief Scheduler state */
static zplc_sched_state_t sched_state = ZPLC_SCHED_STATE_UNINIT;

/* Latched until a validated program is materialized into an empty scheduler. */
static uint8_t scheduler_fault_latched;

/* Serializes thread-context control-plane operations and verifier scratch. */
static struct k_mutex control_mutex;

/* Serializes timer admission against stop/unregister on SMP and in ISRs. */
static struct k_spinlock admission_lock;

/** @brief Shared memory mutex */
static struct k_mutex mem_mutex;

/* One non-reentrant Zephyr work item owns every normal scheduler batch. */
static struct k_work coordinator_work;
static uint32_t input_latch_count;
static uint32_t output_commit_count;
/* This is deliberately owned by the coordinator, never by a timer or ISR. */
/* -1 is disarmed; Zephyr watchdog channels are int and must not truncate. */
static int hardware_watchdog_channel = -1;

#ifdef CONFIG_ZTEST
/* Native-sim seam: hold one coordinator after task execution, before commit. */
static struct k_sem test_before_commit_entered;
static struct k_sem test_before_commit_release;
static uint8_t test_hold_before_commit;
static struct k_sem test_debug_before_mem_entered;
static zplc_hal_result_t test_output_commit_failure;
static uint8_t test_output_commit_failure_channel;
static uint8_t test_output_commit_write_count;
static zplc_hal_result_t test_gpio_read_failure;
static uint8_t test_gpio_read_failure_channel;
static int test_watchdog_prepare_failure;
static int test_watchdog_setup_failure;
static int test_watchdog_feed_failure;
static int test_watchdog_disarm_failure;
static int test_safe_output_failure;
static uint32_t test_watchdog_prepare_count;
static uint32_t test_watchdog_feed_count;
static uint32_t test_watchdog_disarm_count;
static uint8_t test_force_next_deadline_miss;
#endif

/** @brief Normal priority work queue */
K_THREAD_STACK_DEFINE(normal_workq_stack, CONFIG_ZPLC_SCHED_WORKQ_STACK_SIZE);
static struct k_work_q normal_workq;

#ifdef CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ
/** @brief High priority work queue */
K_THREAD_STACK_DEFINE(high_workq_stack, CONFIG_ZPLC_SCHED_HIGH_PRIO_STACK_SIZE);
static struct k_work_q high_workq;
#endif

static uint16_t read_u16_le(const uint8_t *data) {
  return (uint16_t)data[0] | ((uint16_t)data[1] << 8);
}

static uint32_t read_u32_le(const uint8_t *data) {
  return (uint32_t)data[0] | ((uint32_t)data[1] << 8) |
         ((uint32_t)data[2] << 16) | ((uint32_t)data[3] << 24);
}

static int scheduler_slots_empty(void) {
  int index;

  if (task_count != 0U) {
    return 0;
  }
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    if (tasks[index].registered) {
      return 0;
    }
  }
  return 1;
}

/* ============================================================================
 * I/O Synchronization
 * ============================================================================
 */

/** @brief Number of digital I/O channels to sync */
#define ZPLC_DIO_CHANNEL_COUNT 4

/** @brief Number of ADC channels to sync (0-4) */
#define ZPLC_ADC_CHANNEL_COUNT 5

/**
 * @brief Synchronize inputs from GPIO to IPI (Input Process Image).
 *
 * Reads physical GPIO inputs and writes them to the shared memory IPI region.
 * Called once at the beginning of an ordered scheduler batch.
 */
static zplc_hal_result_t sync_inputs_to_ipi(void) {
  uint8_t value;
  uint16_t adc_val;

  /* Read GPIO inputs (channels 4-7 are inputs) */
  /* Maps to IPI[0] bits 0-3 -> %IX0.0..%IX0.3 (or %I0..%I3) */
  for (int i = 0; i < ZPLC_DIO_CHANNEL_COUNT; i++) {
    zplc_hal_result_t result;

#ifdef CONFIG_ZTEST
    {
      k_spinlock_key_t key = k_spin_lock(&admission_lock);

      result = ZPLC_HAL_OK;
      if (test_gpio_read_failure != ZPLC_HAL_OK &&
          test_gpio_read_failure_channel == (uint8_t)i) {
        result = test_gpio_read_failure;
        test_gpio_read_failure = ZPLC_HAL_OK;
      }
      k_spin_unlock(&admission_lock, key);
    }
    if (result != ZPLC_HAL_OK && result != ZPLC_HAL_NOT_IMPL) {
      return result;
    }
    if (result == ZPLC_HAL_NOT_IMPL) {
      continue;
    }
#endif
    result = zplc_hal_gpio_read(4 + i, &value);
    if (result != ZPLC_HAL_OK && result != ZPLC_HAL_NOT_IMPL) {
      return result;
    }
    if (result == ZPLC_HAL_OK) {
      uint8_t current = zplc_ipi_read8(0);
      if (value) {
        current = (uint8_t)(current | (uint8_t)(1U << i));
      } else {
        current = (uint8_t)(current & (uint8_t)~(1U << i));
      }
      (void)zplc_ipi_write8(0, current);
    }
  }

  /* Read ADC inputs (channels 0-4) */
  /* Maps to IPI[8..] -> %IW4 (Offset 8), %IW5 (Offset 10), etc. */
  /* We start at offset 8 to avoid overlapping with digital inputs (Bytes 0-3)
   */
  /* and alignment padding. */
  for (int ch = 0; ch < ZPLC_ADC_CHANNEL_COUNT; ch++) {
    zplc_hal_result_t result = zplc_hal_adc_read(ch, &adc_val);

    if (result != ZPLC_HAL_OK && result != ZPLC_HAL_NOT_IMPL) {
      return result;
    }
    if (result == ZPLC_HAL_OK) {
      /* 16-bit Little Endian store */
      int offset = 8 + (ch * 2);
      /* Check bounds */
      if (offset + 1 < ZPLC_MEM_IPI_SIZE) {
        (void)zplc_ipi_write16((uint16_t)offset, adc_val);
      }
    }
  }
  return ZPLC_HAL_OK;
}

/**
 * @brief Synchronize outputs from OPI (Output Process Image) to GPIO.
 *
 * Reads the OPI region and writes to physical GPIO outputs.
 * Called once at the end of an ordered scheduler batch.
 */
static zplc_hal_result_t sync_opi_to_outputs(void) {
  uint8_t *opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);

  if (opi == NULL) {
    return ZPLC_HAL_ERROR;
  }

  /* Write GPIO outputs (channels 0-3 are outputs) */
  /* Maps %QX0.0..%QX0.3 to physical channels 0-3 */
  for (int i = 0; i < ZPLC_DIO_CHANNEL_COUNT; i++) {
    zplc_hal_result_t result;

#ifdef CONFIG_ZTEST
    {
      k_spinlock_key_t key = k_spin_lock(&admission_lock);
      result = ZPLC_HAL_OK;
      if (test_output_commit_failure != ZPLC_HAL_OK &&
          test_output_commit_failure_channel == (uint8_t)i) {
        result = test_output_commit_failure;
        test_output_commit_failure = ZPLC_HAL_OK;
      }
      k_spin_unlock(&admission_lock, key);
    }
    if (result != ZPLC_HAL_OK && result != ZPLC_HAL_NOT_IMPL) {
      return result;
    }
    if (result == ZPLC_HAL_NOT_IMPL) {
      continue;
    }
#endif
    result = zplc_hal_gpio_write(i, (opi[0] & (1 << i)) ? 1 : 0);
#ifdef CONFIG_ZTEST
    {
      k_spinlock_key_t key = k_spin_lock(&admission_lock);
      if (test_output_commit_write_count != UINT8_MAX) {
        test_output_commit_write_count++;
      }
      k_spin_unlock(&admission_lock, key);
    }
#endif
    if (result != ZPLC_HAL_OK && result != ZPLC_HAL_NOT_IMPL) {
      return result;
    }
  }
  return ZPLC_HAL_OK;
}

/**
 * @brief Update system registers in IPI.
 *
 * Writes cycle time, uptime, task ID, and flags to the reserved
 * system register area at the end of IPI (0x0FF0-0x0FFF).
 *
 * @param task_id Current task ID
 * @param cycle_time_us Cycle execution time in microseconds
 * @param first_scan True if this is the first scan
 */
static void update_system_registers(uint8_t task_id, uint32_t cycle_time_us,
                                    bool first_scan) {
  uint8_t flags = 0;

  /* Write cycle time at offset 0x0FF0 (4 bytes, little-endian) */
  (void)zplc_ipi_write32(0x0FF0, cycle_time_us);

  /* Write uptime at offset 0x0FF4 (4 bytes, little-endian) */
  uint32_t uptime_ms = k_uptime_get_32();
  (void)zplc_ipi_write32(0x0FF4, uptime_ms);

  /* Write task ID at offset 0x0FF8 */
  (void)zplc_ipi_write8(0x0FF8, task_id);

  /* Build flags byte */
  if (first_scan) {
    flags |= ZPLC_SYS_FLAG_FIRST_SCAN;
  }
  if (sched_state == ZPLC_SCHED_STATE_RUNNING) {
    flags |= ZPLC_SYS_FLAG_RUNNING;
  }

  /* Write flags at offset 0x0FF9 */
  (void)zplc_ipi_write8(0x0FF9, flags);
}

/* ============================================================================
 * Forward Declarations
 * ============================================================================
 */

static void task_timer_handler(struct k_timer *timer);
static void coordinator_work_handler(struct k_work *work);
static int execute_task_cycle_locked(zplc_task_internal_t *t,
                                     bool single_step_mode,
                                     bool *deadline_missed);
static int apply_safe_outputs_with_mem_locked(void);
static void increment_counter(uint32_t *counter);
static int watchdog_disarm(void);

#ifdef CONFIG_ZTEST
#define ZPLC_TEST_WATCHDOG_TIMEOUT_MS 1000U
#endif

static int watchdog_timeout_admits_tasks(void) {
  uint64_t max_interval_us = 0U;
  uint64_t timeout_us;
  int index;

#if defined(CONFIG_ZTEST)
  timeout_us = (uint64_t)ZPLC_TEST_WATCHDOG_TIMEOUT_MS * 1000U;
#elif defined(CONFIG_ZPLC_HARDWARE_WATCHDOG)
  timeout_us = (uint64_t)CONFIG_ZPLC_HARDWARE_WATCHDOG_TIMEOUT_MS * 1000U;
#else
  return 0;
#endif
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; ++index) {
    if (tasks[index].registered != 0U &&
        tasks[index].task.config.interval_us > max_interval_us) {
      max_interval_us = tasks[index].task.config.interval_us;
    }
  }
  return timeout_us > max_interval_us * 2U ? 0 : -ERANGE;
}

/*
 * The physical watchdog is intentionally opt-in per exact board profile.
 * No public profile enables CONFIG_ZPLC_HARDWARE_WATCHDOG until HIL proves
 * reset timing and electrical safe-state behavior.  Tests use the narrow
 * ztest seam below rather than pretending native_sim owns a physical WDT.
 */
static int watchdog_prepare(void) {
  int admission = watchdog_timeout_admits_tasks();

  if (admission != 0) {
    return admission;
  }
#ifdef CONFIG_ZTEST
  increment_counter(&test_watchdog_prepare_count);
  if (test_watchdog_prepare_failure != 0) {
    int failure = test_watchdog_prepare_failure;
    test_watchdog_prepare_failure = 0;
    return failure;
  }
  hardware_watchdog_channel = 0;
  if (test_watchdog_setup_failure != 0) {
    int failure = test_watchdog_setup_failure;
    test_watchdog_setup_failure = 0;
    return failure;
  }
  return 0;
#elif defined(CONFIG_ZPLC_HARDWARE_WATCHDOG)
#if DT_HAS_CHOSEN(zephyr_watchdog)
  static const struct device *const watchdog =
      DEVICE_DT_GET(DT_CHOSEN(zephyr_watchdog));
  struct wdt_timeout_cfg timeout = {
      .window = {.min = 0U, .max = CONFIG_ZPLC_HARDWARE_WATCHDOG_TIMEOUT_MS},
      .flags = WDT_FLAG_RESET_SOC,
  };
  int channel;

  if (!device_is_ready(watchdog)) {
    return -ENODEV;
  }
  channel = wdt_install_timeout(watchdog, &timeout);
  if (channel < 0) {
    return channel;
  }
  hardware_watchdog_channel = channel;
  {
    int setup_result = wdt_setup(watchdog, 0U);
    if (setup_result != 0) {
      return setup_result;
    }
  }
  return 0;
#else
  return -ENODEV;
#endif
#else
  return 0;
#endif
}

static int watchdog_feed_after_commit(void) {
  if (hardware_watchdog_channel < 0) {
    return 0;
  }
#ifdef CONFIG_ZTEST
  increment_counter(&test_watchdog_feed_count);
  if (test_watchdog_feed_failure != 0) {
    int failure = test_watchdog_feed_failure;
    test_watchdog_feed_failure = 0;
    return failure;
  }
  return 0;
#elif defined(CONFIG_ZPLC_HARDWARE_WATCHDOG)
#if DT_HAS_CHOSEN(zephyr_watchdog)
  const struct device *const watchdog =
      DEVICE_DT_GET(DT_CHOSEN(zephyr_watchdog));
  return wdt_feed(watchdog, hardware_watchdog_channel);
#else
  return -ENODEV;
#endif
#else
  return 0;
#endif
}

/* Safe output application precedes disarm.  If a driver cannot disarm, the
 * already-safe system deliberately receives no more feeds and will reset. */
static int watchdog_disarm(void) {
  int result = 0;

  if (hardware_watchdog_channel < 0) {
    return 0;
  }
#ifdef CONFIG_ZTEST
  increment_counter(&test_watchdog_disarm_count);
  if (test_watchdog_disarm_failure != 0) {
    result = test_watchdog_disarm_failure;
    test_watchdog_disarm_failure = 0;
  }
#elif defined(CONFIG_ZPLC_HARDWARE_WATCHDOG)
#if DT_HAS_CHOSEN(zephyr_watchdog)
  result = wdt_disable(DEVICE_DT_GET(DT_CHOSEN(zephyr_watchdog)));
#else
  result = -ENODEV;
#endif
#endif
  hardware_watchdog_channel = -1;
  return result;
}

/*
 * k_cycle_get_64() is not available on every supported Zephyr target.  Pair
 * the portable 32-bit cycle counter with the monotonic uptime clock instead.
 */
static scheduler_stamp_t scheduler_stamp_now(void) {
  scheduler_stamp_t stamp;
  int64_t after;

  do {
    stamp.uptime_ms = k_uptime_get();
    stamp.cycle32 = k_cycle_get_32();
    after = k_uptime_get();
  } while (after != stamp.uptime_ms);
  return stamp;
}

static uint64_t scheduler_elapsed_cycles(const scheduler_stamp_t *start,
                                         const scheduler_stamp_t *end) {
  const uint64_t wrap = UINT64_C(1) << 32;
  uint64_t coarse_cycles;
  uint64_t candidate;
  uint64_t fine_cycles;

  if (end->uptime_ms < start->uptime_ms) {
    return 0U;
  }
  coarse_cycles =
      k_ms_to_cyc_floor64((uint64_t)(end->uptime_ms - start->uptime_ms));
  fine_cycles = (uint64_t)(uint32_t)(end->cycle32 - start->cycle32);
  candidate = (coarse_cycles & ~(wrap - 1U)) | fine_cycles;

  /* Pick the cycle32 epoch nearest the coarse monotonic uptime duration. */
  if (candidate < coarse_cycles && coarse_cycles - candidate > wrap / 2U &&
      candidate <= UINT64_MAX - wrap) {
    candidate += wrap;
  } else if (candidate > coarse_cycles &&
             candidate - coarse_cycles > wrap / 2U && candidate >= wrap) {
    candidate -= wrap;
  }
  return candidate;
}

static uint64_t scheduler_elapsed_us(const scheduler_stamp_t *start,
                                     const scheduler_stamp_t *end) {
  return k_cyc_to_us_floor64(scheduler_elapsed_cycles(start, end));
}

static uint32_t scheduler_duration_us_u32(uint64_t duration_us) {
  return duration_us > UINT32_MAX ? UINT32_MAX : (uint32_t)duration_us;
}

static int scheduler_deadline_missed(const scheduler_stamp_t *release,
                                     const scheduler_stamp_t *end,
                                     uint32_t interval_us) {
  return scheduler_elapsed_us(release, end) > interval_us;
}

/* admission_lock is held. Returns one only for a newly admitted activation. */
static int admit_task_release_locked(zplc_task_internal_t *t,
                                     const scheduler_stamp_t *release) {
  if (t->work_pending != 0U) {
    /* Periodic releases coalesce; completion owns deadline-overrun accounting.
     */
    return 0;
  }
  t->release = *release;
  t->work_pending = 1U;
  return 1;
}

static int scheduler_fault_is_latched(void) {
  int latched;
  k_spinlock_key_t key = k_spin_lock(&admission_lock);
  latched = scheduler_fault_latched != 0U;
  k_spin_unlock(&admission_lock, key);
  return latched;
}

/* ============================================================================
 * Helper Functions
 * ============================================================================
 */

/**
 * @brief Get the appropriate work queue for a task based on priority.
 */
static struct k_work_q *get_coordinator_workq(void) {
#ifdef CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ
  return &high_workq;
#endif
  return &normal_workq;
}

/**
 * @brief Find task by timer pointer.
 */
static zplc_task_internal_t *find_task_by_timer(struct k_timer *timer) {
  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    if (&tasks[i].timer == timer) {
      return &tasks[i];
    }
  }
  return NULL;
}

/* ============================================================================
 * Timer and Work Handlers
 * ============================================================================
 */

/**
 * @brief Timer expiry handler (runs in ISR context).
 *
 * This is called when a task's timer expires.
 * We submit work to the appropriate work queue.
 */
static void task_timer_handler(struct k_timer *timer) {
  zplc_task_internal_t *t = find_task_by_timer(timer);
  scheduler_stamp_t release;
  k_spinlock_key_t key;

  if (t == NULL) {
    return;
  }

  release = scheduler_stamp_now();
  key = k_spin_lock(&admission_lock);

  if (scheduler_fault_latched != 0U || !t->registered ||
      t->task.state != ZPLC_TASK_STATE_RUNNING) {
    k_spin_unlock(&admission_lock, key);
    return;
  }

  if (admit_task_release_locked(t, &release) == 0) {
    k_spin_unlock(&admission_lock, key);
    return;
  }

  (void)k_work_submit_to_queue(get_coordinator_workq(), &coordinator_work);
  k_spin_unlock(&admission_lock, key);
}

static int execute_task_cycle_locked(zplc_task_internal_t *t,
                                     bool single_step_mode,
                                     bool *deadline_missed) {
  scheduler_stamp_t start_stamp;
  scheduler_stamp_t end_stamp;
  uint64_t exec_time_us;
  uint32_t exec_time;
  int result;
  bool first_scan;
  bool continue_from_current_pc;

  if (deadline_missed == NULL) {
    return -EINVAL;
  }
  *deadline_missed = false;

  /* Check if this is the first scan */
  first_scan = (t->task.stats.cycle_count == 0);
  continue_from_current_pc = (!single_step_mode) &&
                             (t->vm.pc != t->vm.entry_point) &&
                             (t->vm.halted == 0U);

  /* Record start time */
  start_stamp = scheduler_stamp_now();

  /* Update system registers BEFORE execution so program can read them */
  update_system_registers(t->task.config.id, t->task.stats.last_exec_time_us,
                          first_scan);

  /* Execute from the current PC when resuming from a breakpoint, otherwise run
   * a fresh PLC scan cycle from the task entry point.
   */
  if (continue_from_current_pc) {
    result = zplc_vm_run_bounded(&t->vm, ZPLC_VM_CYCLE_INSTRUCTION_BUDGET);
  } else {
    result = zplc_vm_run_cycle(&t->vm);
  }

  /* Record end time */
  end_stamp = scheduler_stamp_now();
  exec_time_us = scheduler_elapsed_us(&start_stamp, &end_stamp);
  exec_time = scheduler_duration_us_u32(exec_time_us);

  /* admission_lock also serializes timer-ISR overrun accounting. */
  {
    bool overrun = false;
    k_spinlock_key_t key = k_spin_lock(&admission_lock);

    t->task.stats.cycle_count++;
    t->task.stats.last_exec_time_us = exec_time;
    if (exec_time > t->task.stats.max_exec_time_us) {
      t->task.stats.max_exec_time_us = exec_time;
    }
    if (t->task.stats.avg_exec_time_us == 0U) {
      t->task.stats.avg_exec_time_us = exec_time;
    } else {
      t->task.stats.avg_exec_time_us =
          (uint32_t)(((uint64_t)t->task.stats.avg_exec_time_us * 7U +
                      exec_time) /
                     8U);
    }
    if (!single_step_mode &&
        scheduler_deadline_missed(&t->release, &end_stamp,
                                  t->task.config.interval_us)) {
      increment_counter(&t->task.stats.overrun_count);
      overrun = true;
      *deadline_missed = true;
    }
#ifdef CONFIG_ZTEST
    if (!single_step_mode && test_force_next_deadline_miss != 0U) {
      test_force_next_deadline_miss = 0U;
      increment_counter(&t->task.stats.overrun_count);
      overrun = true;
      *deadline_missed = true;
    }
#endif
    k_spin_unlock(&admission_lock, key);
    hil_trace_task(t->task.config.id, (uint32_t)start_stamp.uptime_ms,
                   (uint32_t)end_stamp.uptime_ms, exec_time, overrun);
  }

  if (result >= 0 && t->vm.error == ZPLC_VM_HALTED && !single_step_mode) {
    zplc_vm_reset_cycle(&t->vm);
    result = 0;
  }

  /* Handle errors */
  if (result < 0) {
    zplc_hal_log("[SCHED] Task %d error: %d\n", t->task.config.id, t->vm.error);
    return result;
  }

  if (zplc_vm_is_paused(&t->vm)) {
    zplc_hal_log("[SCHED] Task %d paused at PC=%u\n", t->task.config.id,
                 zplc_vm_get_pc(&t->vm));
    return ZPLC_VM_PAUSED;
  }
  return result;
}

static int task_release_before(const zplc_task_internal_t *left,
                               const zplc_task_internal_t *right) {
  if (left->release.uptime_ms != right->release.uptime_ms) {
    return left->release.uptime_ms < right->release.uptime_ms;
  }
  if (left->release.cycle32 != right->release.cycle32) {
    int32_t cycle_delta =
        (int32_t)(left->release.cycle32 - right->release.cycle32);

    return cycle_delta < 0;
  }
  if (left->task.config.priority != right->task.config.priority) {
    return left->task.config.priority < right->task.config.priority;
  }
  return left->task.config.id < right->task.config.id;
}

#ifdef CONFIG_ZTEST
int zplc_sched_test_release_before(uint64_t left_uptime_ms,
                                   uint32_t left_cycle32, uint8_t left_priority,
                                   uint16_t left_id, uint64_t right_uptime_ms,
                                   uint32_t right_cycle32,
                                   uint8_t right_priority, uint16_t right_id) {
  zplc_task_internal_t left = {0};
  zplc_task_internal_t right = {0};

  left.release.uptime_ms = (int64_t)left_uptime_ms;
  left.release.cycle32 = left_cycle32;
  left.task.config.priority = left_priority;
  left.task.config.id = left_id;
  right.release.uptime_ms = (int64_t)right_uptime_ms;
  right.release.cycle32 = right_cycle32;
  right.task.config.priority = right_priority;
  right.task.config.id = right_id;
  return task_release_before(&left, &right);
}

uint32_t zplc_sched_test_elapsed_us(uint64_t start_uptime_ms,
                                    uint32_t start_cycle32,
                                    uint64_t end_uptime_ms,
                                    uint32_t end_cycle32) {
  scheduler_stamp_t start = {.uptime_ms = (int64_t)start_uptime_ms,
                             .cycle32 = start_cycle32};
  scheduler_stamp_t end = {.uptime_ms = (int64_t)end_uptime_ms,
                           .cycle32 = end_cycle32};

  return scheduler_duration_us_u32(scheduler_elapsed_us(&start, &end));
}

int zplc_sched_test_deadline_missed(uint64_t release_uptime_ms,
                                    uint32_t release_cycle32,
                                    uint64_t end_uptime_ms,
                                    uint32_t end_cycle32,
                                    uint32_t interval_us) {
  scheduler_stamp_t release = {.uptime_ms = (int64_t)release_uptime_ms,
                               .cycle32 = release_cycle32};
  scheduler_stamp_t end = {.uptime_ms = (int64_t)end_uptime_ms,
                           .cycle32 = end_cycle32};

  return scheduler_deadline_missed(&release, &end, interval_us);
}

int zplc_sched_test_admit_release(int task_id) {
  zplc_task_internal_t *task;
  scheduler_stamp_t release;
  k_spinlock_key_t key;
  int admitted;

  if (task_id < 0 || task_id >= CONFIG_ZPLC_MAX_TASKS) {
    return -1;
  }
  release = scheduler_stamp_now();
  key = k_spin_lock(&admission_lock);
  task = &tasks[task_id];
  if (task->registered == 0U) {
    k_spin_unlock(&admission_lock, key);
    return -2;
  }
  task->task.state = ZPLC_TASK_STATE_RUNNING;
  admitted = admit_task_release_locked(task, &release);
  k_spin_unlock(&admission_lock, key);
  return admitted;
}
#endif

static void increment_counter(uint32_t *counter) {
  if (*counter != UINT32_MAX) {
    (*counter)++;
  }
}

static void stop_all_task_timers(void) {
  int index;

  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; ++index) {
    if (tasks[index].registered != 0U) {
      k_timer_stop(&tasks[index].timer);
    }
  }
}

/* mem_mutex is held. The caller stops timers after releasing admission_lock. */
static int latch_fault_locked(void) {
  int index;
  k_spinlock_key_t key = k_spin_lock(&admission_lock);

  scheduler_fault_latched = 1U;
  sched_state = ZPLC_SCHED_STATE_ERROR;
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; ++index) {
    if (tasks[index].registered != 0U) {
      tasks[index].task.state = ZPLC_TASK_STATE_ERROR;
      tasks[index].timer_running = 0U;
      tasks[index].work_pending = 0U;
    }
  }
  k_spin_unlock(&admission_lock, key);
  {
    int safe_result = apply_safe_outputs_with_mem_locked();
    int watchdog_result = safe_result == 0 ? watchdog_disarm() : 0;
    if (safe_result != 0) {
      zplc_hal_log("[SCHED] Failed to apply safe outputs: %d\n", safe_result);
    }
    if (watchdog_result != 0) {
      zplc_hal_log("[SCHED] Failed to disarm hardware watchdog: %d\n",
                   watchdog_result);
    }
    return safe_result != 0 ? safe_result : watchdog_result;
  }
}

/* Executes one ordered process-image batch. mem_mutex is acquired once. */
static int execute_batch(zplc_task_internal_t *const *batch, uint8_t count,
                         bool single_step_mode) {
  uint8_t index;
  int result = 0;
  int faulted = 0;
  int paused = 0;

  if (count == 0U) {
    return 0;
  }

  k_mutex_lock(&mem_mutex, K_FOREVER);
  {
    k_spinlock_key_t key = k_spin_lock(&admission_lock);
    if (scheduler_fault_latched != 0U ||
        sched_state != ZPLC_SCHED_STATE_RUNNING) {
      k_spin_unlock(&admission_lock, key);
      k_mutex_unlock(&mem_mutex);
      return 0;
    }
    k_spin_unlock(&admission_lock, key);
  }

  result = (int)sync_inputs_to_ipi();
  if (result != ZPLC_HAL_OK) {
    latch_fault_locked();
    faulted = 1;
  } else {
    increment_counter(&input_latch_count);
  }
  for (index = 0U; !faulted && index < count; ++index) {
    zplc_task_internal_t *t = batch[index];
    int admitted;

    {
      k_spinlock_key_t key = k_spin_lock(&admission_lock);
      admitted = scheduler_fault_latched == 0U &&
                 sched_state == ZPLC_SCHED_STATE_RUNNING &&
                 t->registered != 0U &&
                 t->task.state == ZPLC_TASK_STATE_RUNNING;
      k_spin_unlock(&admission_lock, key);
    }
    if (!admitted) {
      continue;
    }

    bool deadline_missed;

    result = execute_task_cycle_locked(t, single_step_mode, &deadline_missed);
    {
      k_spinlock_key_t key = k_spin_lock(&admission_lock);
      t->work_pending = 0U;
      k_spin_unlock(&admission_lock, key);
    }
    if (result < 0 || deadline_missed) {
      if (deadline_missed) {
        result = -ETIMEDOUT;
        zplc_hal_log("[SCHED] Task %d exceeded its activation deadline\n",
                     t->task.config.id);
      }
      latch_fault_locked();
      faulted = 1;
      break;
    }
    if (result == ZPLC_VM_PAUSED) {
      paused = 1;
      break;
    }
  }

  if (single_step_mode && !faulted) {
    paused = 1;
  }

#ifdef CONFIG_ZTEST
  if (!faulted) {
    int hold_batch;
    k_spinlock_key_t key = k_spin_lock(&admission_lock);

    hold_batch = test_hold_before_commit != 0U;
    test_hold_before_commit = 0U;
    k_spin_unlock(&admission_lock, key);
    if (hold_batch) {
      k_sem_give(&test_before_commit_entered);
      (void)k_sem_take(&test_before_commit_release, K_SECONDS(1));
    }
  }
#endif

  if (!faulted) {
    int commit_allowed;
    k_spinlock_key_t key = k_spin_lock(&admission_lock);
    /* mem_mutex prevents stop/pause from closing admission before this commit.
     */
    commit_allowed = scheduler_fault_latched == 0U &&
                     sched_state == ZPLC_SCHED_STATE_RUNNING;
    k_spin_unlock(&admission_lock, key);
    if (commit_allowed) {
      result = (int)sync_opi_to_outputs();
      if (result == ZPLC_HAL_OK) {
        increment_counter(&output_commit_count);
        if (!paused && watchdog_feed_after_commit() != 0) {
          zplc_hal_log("[SCHED] Hardware watchdog feed failed\n");
          result = -EIO;
          latch_fault_locked();
          faulted = 1;
        }
      } else {
        latch_fault_locked();
        faulted = 1;
      }
    }
  }
  k_mutex_unlock(&mem_mutex);

  if (faulted) {
    stop_all_task_timers();
    return result;
  }
  if (paused) {
    int task_index;
    int safe_result = 0;
    k_spinlock_key_t key = k_spin_lock(&admission_lock);
    if (scheduler_fault_latched == 0U &&
        sched_state == ZPLC_SCHED_STATE_RUNNING) {
      sched_state = ZPLC_SCHED_STATE_PAUSED;
      for (task_index = 0; task_index < CONFIG_ZPLC_MAX_TASKS; ++task_index) {
        if (tasks[task_index].registered != 0U) {
          tasks[task_index].task.state = ZPLC_TASK_STATE_PAUSED;
          tasks[task_index].timer_running = 0U;
          tasks[task_index].work_pending = 0U;
        }
      }
    }
    k_spin_unlock(&admission_lock, key);
    k_mutex_lock(&mem_mutex, K_FOREVER);
    safe_result = apply_safe_outputs_with_mem_locked();
    if (safe_result != 0) {
      (void)latch_fault_locked();
    }
    k_mutex_unlock(&mem_mutex);
    stop_all_task_timers();
    if (safe_result == 0 && watchdog_disarm() != 0) {
      k_mutex_lock(&mem_mutex, K_FOREVER);
      (void)latch_fault_locked();
      k_mutex_unlock(&mem_mutex);
      result = -EIO;
    }
  }
  return result;
}

#ifdef CONFIG_ZTEST
void zplc_sched_test_hold_before_commit(void) {
  k_sem_reset(&test_before_commit_entered);
  k_sem_reset(&test_before_commit_release);
  k_spinlock_key_t key = k_spin_lock(&admission_lock);

  test_hold_before_commit = 1U;
  k_spin_unlock(&admission_lock, key);
}

int zplc_sched_test_wait_before_commit(int timeout_ms) {
  return k_sem_take(&test_before_commit_entered, K_MSEC(timeout_ms));
}

void zplc_sched_test_release_before_commit(void) {
  k_sem_give(&test_before_commit_release);
}

void zplc_sched_test_reset_debug_before_mem(void) {
  k_sem_reset(&test_debug_before_mem_entered);
}

int zplc_sched_test_wait_debug_before_mem(int timeout_ms) {
  return k_sem_take(&test_debug_before_mem_entered, K_MSEC(timeout_ms));
}

void zplc_sched_test_fail_next_output_commit(uint8_t channel,
                                             zplc_hal_result_t result) {
  k_spinlock_key_t key;

  k_mutex_lock(&mem_mutex, K_FOREVER);
  key = k_spin_lock(&admission_lock);
  test_output_commit_failure_channel = channel;
  test_output_commit_failure = result;
  test_output_commit_write_count = 0U;
  k_spin_unlock(&admission_lock, key);
  k_mutex_unlock(&mem_mutex);
}

void zplc_sched_test_fail_next_gpio_read(uint8_t channel,
                                         zplc_hal_result_t result) {
  k_spinlock_key_t key;

  k_mutex_lock(&mem_mutex, K_FOREVER);
  key = k_spin_lock(&admission_lock);
  test_gpio_read_failure_channel = channel;
  test_gpio_read_failure = result;
  k_spin_unlock(&admission_lock, key);
  k_mutex_unlock(&mem_mutex);
}

uint8_t zplc_sched_test_output_commit_write_count(void) {
  uint8_t count;
  k_spinlock_key_t key;

  k_mutex_lock(&mem_mutex, K_FOREVER);
  key = k_spin_lock(&admission_lock);
  count = test_output_commit_write_count;
  k_spin_unlock(&admission_lock, key);
  k_mutex_unlock(&mem_mutex);
  return count;
}

void zplc_sched_test_fail_next_watchdog_prepare(int result) {
  test_watchdog_prepare_failure = result;
}

void zplc_sched_test_fail_next_watchdog_setup(int result) {
  test_watchdog_setup_failure = result;
}

void zplc_sched_test_fail_next_watchdog_feed(int result) {
  test_watchdog_feed_failure = result;
}

void zplc_sched_test_fail_next_watchdog_disarm(int result) {
  test_watchdog_disarm_failure = result;
}

void zplc_sched_test_fail_safe_outputs(int result) {
  test_safe_output_failure = result;
}

uint32_t zplc_sched_test_watchdog_prepare_count(void) {
  return test_watchdog_prepare_count;
}

uint32_t zplc_sched_test_watchdog_feed_count(void) {
  return test_watchdog_feed_count;
}

uint32_t zplc_sched_test_watchdog_disarm_count(void) {
  return test_watchdog_disarm_count;
}

void zplc_sched_test_force_next_deadline_miss(void) {
  test_force_next_deadline_miss = 1U;
}
#endif

static void coordinator_work_handler(struct k_work *work) {
  zplc_task_internal_t *batch[CONFIG_ZPLC_MAX_TASKS];
  uint8_t count = 0U;
  int index;

  ARG_UNUSED(work);
  {
    k_spinlock_key_t key = k_spin_lock(&admission_lock);
    if (scheduler_fault_latched == 0U &&
        sched_state == ZPLC_SCHED_STATE_RUNNING) {
      for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; ++index) {
        zplc_task_internal_t *t = &tasks[index];
        if (t->registered != 0U && t->task.state == ZPLC_TASK_STATE_RUNNING &&
            t->work_pending != 0U) {
          batch[count++] = t;
        }
      }
    }
    k_spin_unlock(&admission_lock, key);
  }
  for (index = 1; index < count; ++index) {
    zplc_task_internal_t *current = batch[index];
    int previous = index - 1;
    while (previous >= 0 && task_release_before(current, batch[previous])) {
      batch[previous + 1] = batch[previous];
      --previous;
    }
    batch[previous + 1] = current;
  }
  (void)execute_batch(batch, count, false);
}

static int scheduler_called_from_workqueue(void) {
  k_tid_t current = k_current_get();

  if (current == k_work_queue_thread_get(&normal_workq)) {
    return 1;
  }
#ifdef CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ
  if (current == k_work_queue_thread_get(&high_workq)) {
    return 1;
  }
#endif
  return 0;
}

static int validate_program_locked(const uint8_t *binary, size_t size) {
  zplc_program_view_t view;
  uint32_t index;
  int result;

  result = zplc_loader_verify(binary, size, load_workspace,
                              sizeof(load_workspace), &view);
  if (result != ZPLC_LOADER_OK) {
    return result;
  }
  if (view.tasks == NULL || view.task_count == 0U ||
      view.task_count > CONFIG_ZPLC_MAX_TASKS) {
    return ZPLC_LOADER_ERR_TASK;
  }
  for (index = 0U; index < view.task_count; index++) {
    const uint8_t *task = view.tasks + index * ZPLC_TASK_DEF_SIZE;
    uint8_t type = task[2];
    uint32_t interval_us = read_u32_le(task + 4U);

    if (type != ZPLC_TASK_CYCLIC || interval_us < ZPLC_MIN_INTERVAL_US ||
        interval_us > ZPLC_MAX_INTERVAL_US || interval_us % 1000U != 0U ||
        read_u16_le(task + 8U) >= view.code_size) {
      return ZPLC_LOADER_ERR_TASK;
    }
  }
  return ZPLC_LOADER_OK;
}

/* mem_mutex is held after admission was closed or a local fault was latched. */
static int apply_safe_outputs_with_mem_locked(void) {
  uint8_t *opi;
  int first_error = 0;
  int index;

  zplc_force_clear_all();
  opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
  if (opi == NULL) {
    first_error = -1;
  } else {
    memset(opi, 0, ZPLC_MEM_OPI_SIZE);
  }
  for (index = 0; index < ZPLC_DIO_CHANNEL_COUNT; ++index) {
    zplc_hal_result_t result;

#ifdef CONFIG_ZTEST
    result = test_safe_output_failure != 0 ? test_safe_output_failure
                                           : zplc_hal_gpio_write(index, 0U);
#else
    result = zplc_hal_gpio_write(index, 0U);
#endif
    if (result != ZPLC_HAL_OK && result != ZPLC_HAL_NOT_IMPL &&
        first_error == 0) {
      first_error = (int)result;
    }
  }
  return first_error;
}

static int stop_locked(void) {
  int index;
  int safe_result;
  struct k_work_sync sync;

  k_mutex_lock(&mem_mutex, K_FOREVER);
  {
    k_spinlock_key_t key = k_spin_lock(&admission_lock);
    if (scheduler_fault_latched == 0U) {
      sched_state = ZPLC_SCHED_STATE_IDLE;
    }
    for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
      zplc_task_internal_t *t = &tasks[index];
      if (t->registered != 0U) {
        if (scheduler_fault_latched == 0U) {
          t->task.state = ZPLC_TASK_STATE_READY;
        }
        t->timer_running = 0U;
        t->work_pending = 0U;
      }
    }
    k_spin_unlock(&admission_lock, key);
  }
  safe_result = apply_safe_outputs_with_mem_locked();
  k_mutex_unlock(&mem_mutex);
  stop_all_task_timers();
  (void)k_work_cancel_sync(&coordinator_work, &sync);
  if (safe_result != 0) {
    k_mutex_lock(&mem_mutex, K_FOREVER);
    (void)latch_fault_locked();
    k_mutex_unlock(&mem_mutex);
  } else if (watchdog_disarm() != 0) {
    /* Outputs are already safe; no further feed makes an unsupported WDT
     * reset fail-safe rather than silently remaining armed. */
    k_mutex_lock(&mem_mutex, K_FOREVER);
    (void)latch_fault_locked();
    k_mutex_unlock(&mem_mutex);
    if (safe_result == 0) {
      safe_result = -EIO;
    }
  }
  zplc_hal_log("[SCHED] Scheduler stopped\n");
  return safe_result;
}

static int unregister_task_locked(int task_id) {
  zplc_task_internal_t *t;
  k_spinlock_key_t key;
  struct k_work_sync sync;
  int last_task;

  if (task_id < 0 || task_id >= CONFIG_ZPLC_MAX_TASKS) {
    return -1;
  }
  t = &tasks[task_id];
  key = k_spin_lock(&admission_lock);
  if (!t->registered) {
    k_spin_unlock(&admission_lock, key);
    return -2;
  }
  t->task.state = ZPLC_TASK_STATE_IDLE;
  t->timer_running = 0U;
  t->work_pending = 0U;
  k_spin_unlock(&admission_lock, key);
  k_timer_stop(&t->timer);
  (void)k_work_cancel_sync(&coordinator_work, &sync);
  key = k_spin_lock(&admission_lock);
  t->registered = 0U;
  task_count--;
  last_task = task_count == 0U;
  if (task_count == 0U && scheduler_fault_latched != 0U) {
    sched_state = ZPLC_SCHED_STATE_IDLE;
  }
  k_spin_unlock(&admission_lock, key);
  if (last_task) {
    int safe_result;

    k_mutex_lock(&mem_mutex, K_FOREVER);
    safe_result = apply_safe_outputs_with_mem_locked();
    if (safe_result != 0 || watchdog_disarm() != 0) {
      (void)latch_fault_locked();
      k_mutex_unlock(&mem_mutex);
      return safe_result != 0 ? safe_result : -EIO;
    }
    key = k_spin_lock(&admission_lock);
    sched_state = ZPLC_SCHED_STATE_IDLE;
    k_spin_unlock(&admission_lock, key);
    k_mutex_unlock(&mem_mutex);
    zplc_hal_log("[SCHED] Last task unregistered; outputs safe\n");
    return 0;
  }
  key = k_spin_lock(&admission_lock);
  if (sched_state == ZPLC_SCHED_STATE_RUNNING &&
      scheduler_fault_latched == 0U) {
    int index;
    for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; ++index) {
      if (tasks[index].registered != 0U && tasks[index].work_pending != 0U) {
        (void)k_work_submit_to_queue(get_coordinator_workq(),
                                     &coordinator_work);
        break;
      }
    }
  }
  k_spin_unlock(&admission_lock, key);
  zplc_hal_log("[SCHED] Task %d unregistered\n", t->task.config.id);
  return 0;
}

static int pause_locked(void) {
  int index;
  int safe_result;
  struct k_work_sync sync;

  k_mutex_lock(&mem_mutex, K_FOREVER);
  {
    k_spinlock_key_t key = k_spin_lock(&admission_lock);
    if (scheduler_fault_latched != 0U ||
        sched_state != ZPLC_SCHED_STATE_RUNNING) {
      k_spin_unlock(&admission_lock, key);
      k_mutex_unlock(&mem_mutex);
      return -1;
    }
    sched_state = ZPLC_SCHED_STATE_PAUSED;
    for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
      zplc_task_internal_t *t = &tasks[index];

      if (!t->registered) {
        continue;
      }
      if (t->task.state == ZPLC_TASK_STATE_RUNNING) {
        t->task.state = ZPLC_TASK_STATE_PAUSED;
      }
      t->timer_running = 0U;
      t->work_pending = 0U;
    }
    k_spin_unlock(&admission_lock, key);
  }
  safe_result = apply_safe_outputs_with_mem_locked();
  k_mutex_unlock(&mem_mutex);
  stop_all_task_timers();
  (void)k_work_cancel_sync(&coordinator_work, &sync);
  if (safe_result != 0) {
    k_mutex_lock(&mem_mutex, K_FOREVER);
    (void)latch_fault_locked();
    k_mutex_unlock(&mem_mutex);
  } else if (watchdog_disarm() != 0) {
    k_mutex_lock(&mem_mutex, K_FOREVER);
    (void)latch_fault_locked();
    k_mutex_unlock(&mem_mutex);
    if (safe_result == 0) {
      safe_result = -EIO;
    }
  }
  return safe_result;
}

/* ============================================================================
 * Public API Implementation
 * ============================================================================
 */

int zplc_sched_init(void) {
  if (sched_state != ZPLC_SCHED_STATE_UNINIT) {
    return -1; /* Already initialized */
  }

  /* Initialize mutex */
  k_mutex_init(&mem_mutex);
  k_mutex_init(&control_mutex);

  /* Initialize normal priority work queue */
  k_work_queue_init(&normal_workq);
  k_work_queue_start(&normal_workq, normal_workq_stack,
                     K_THREAD_STACK_SIZEOF(normal_workq_stack),
                     CONFIG_ZPLC_SCHED_WORKQ_PRIORITY, NULL);

#ifdef CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ
  /* Initialize high priority work queue */
  k_work_queue_init(&high_workq);
  k_work_queue_start(&high_workq, high_workq_stack,
                     K_THREAD_STACK_SIZEOF(high_workq_stack),
                     CONFIG_ZPLC_SCHED_HIGH_PRIO_PRIORITY, NULL);
#endif

  /* Clear task array */
  memset(tasks, 0, sizeof(tasks));
  k_work_init(&coordinator_work, coordinator_work_handler);
  task_count = 0;
  scheduler_fault_latched = 0U;
  input_latch_count = 0U;
  output_commit_count = 0U;
  hardware_watchdog_channel = -1;
#ifdef CONFIG_ZTEST
  k_sem_init(&test_before_commit_entered, 0U, 1U);
  k_sem_init(&test_before_commit_release, 0U, 1U);
  test_hold_before_commit = 0U;
  k_sem_init(&test_debug_before_mem_entered, 0U, 1U);
  test_output_commit_failure = ZPLC_HAL_OK;
  test_output_commit_failure_channel = 0U;
  test_output_commit_write_count = 0U;
  test_gpio_read_failure = ZPLC_HAL_OK;
  test_gpio_read_failure_channel = 0U;
  test_watchdog_prepare_failure = 0;
  test_watchdog_setup_failure = 0;
  test_watchdog_feed_failure = 0;
  test_watchdog_disarm_failure = 0;
  test_safe_output_failure = 0;
  test_watchdog_prepare_count = 0U;
  test_watchdog_feed_count = 0U;
  test_watchdog_disarm_count = 0U;
  test_force_next_deadline_miss = 0U;
#endif

  /* Initialize shared memory */
  zplc_mem_init();

  sched_state = ZPLC_SCHED_STATE_IDLE;

  zplc_hal_log("[SCHED] Scheduler initialized\n");

  return 0;
}

int zplc_sched_shutdown(void) {
  int index;
  int result;

  if (sched_state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue()) {
    return -1;
  }
  k_mutex_lock(&control_mutex, K_FOREVER);
  result = stop_locked();
  if (result != 0) {
    k_mutex_unlock(&control_mutex);
    return result;
  }
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    if (tasks[index].registered) {
      (void)unregister_task_locked(index);
    }
  }
  sched_state = ZPLC_SCHED_STATE_UNINIT;
  k_mutex_unlock(&control_mutex);

  zplc_hal_log("[SCHED] Scheduler shutdown\n");

  return 0;
}

int zplc_sched_register_task(const zplc_task_def_t *def, const uint8_t *code,
                             size_t code_size) {
  int slot = -1;
  uint32_t total_code_size;
  zplc_vm_t vm;

  if (sched_state == ZPLC_SCHED_STATE_UNINIT) {
    return -1;
  }

  k_mutex_lock(&control_mutex, K_FOREVER);

  if (def == NULL || code != NULL || code_size != 0U ||
      sched_state != ZPLC_SCHED_STATE_IDLE) {
    k_mutex_unlock(&control_mutex);
    return -2;
  }

  if (task_count >= CONFIG_ZPLC_MAX_TASKS) {
    k_mutex_unlock(&control_mutex);
    return -3; /* No slots available */
  }

  /* Validate task configuration before materializing scheduler state. */
  if (def->type != ZPLC_TASK_CYCLIC ||
      def->interval_us < ZPLC_MIN_INTERVAL_US ||
      def->interval_us > ZPLC_MAX_INTERVAL_US ||
      def->interval_us % 1000U != 0U || def->stack_size == 0U ||
      def->stack_size > ZPLC_STACK_MAX_DEPTH) {
    k_mutex_unlock(&control_mutex);
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
    k_mutex_unlock(&control_mutex);
    return -3;
  }

  total_code_size = zplc_mem_get_code_size();
  if (total_code_size == 0U || def->entry_point >= total_code_size) {
    k_mutex_unlock(&control_mutex);
    return -2;
  }
  zplc_vm_init(&vm);
  if (zplc_vm_set_entry(&vm, def->entry_point,
                        total_code_size - def->entry_point) != 0) {
    k_mutex_unlock(&control_mutex);
    return -2;
  }

  zplc_task_internal_t *t = &tasks[slot];

  /* Initialize task data */
  memset(t, 0, sizeof(zplc_task_internal_t));
  memcpy(&t->task.config, def, sizeof(zplc_task_def_t));
  t->task.state = ZPLC_TASK_STATE_READY;
  t->task.code =
      zplc_mem_get_code(def->entry_point, total_code_size - def->entry_point);
  t->task.code_size = total_code_size - def->entry_point;

  /* Initialize VM for this task */
  t->vm = vm;
  t->vm.task_id = def->id;
  t->vm.priority = def->priority;
  t->vm.stack_limit = def->stack_size;

  /* Initialize timer (but don't start yet) */
  k_timer_init(&t->timer, task_timer_handler, NULL);

  {
    k_spinlock_key_t key = k_spin_lock(&admission_lock);
    t->registered = 1;
    task_count++;
    k_spin_unlock(&admission_lock, key);
  }

  zplc_hal_log("[SCHED] Task %d registered: interval=%u us, priority=%d\n",
               def->id, def->interval_us, def->priority);

  k_mutex_unlock(&control_mutex);
  return slot;
}

int zplc_sched_validate_program(const uint8_t *binary, size_t size) {
  int result;

  if (sched_state == ZPLC_SCHED_STATE_UNINIT) {
    return ZPLC_LOADER_ERR_SIZE;
  }
  k_mutex_lock(&control_mutex, K_FOREVER);
  result = validate_program_locked(binary, size);
  k_mutex_unlock(&control_mutex);
  return result;
}

int zplc_sched_load(const uint8_t *binary, size_t size) {
  zplc_task_def_t defs[CONFIG_ZPLC_MAX_TASKS];
  int count;
  uint32_t total_code_size;
  k_spinlock_key_t key;

  if (sched_state == ZPLC_SCHED_STATE_UNINIT) {
    return -1;
  }

  if (binary == NULL || size == 0) {
    return -2;
  }

  k_mutex_lock(&control_mutex, K_FOREVER);

  if ((sched_state != ZPLC_SCHED_STATE_IDLE &&
       sched_state != ZPLC_SCHED_STATE_ERROR) ||
      !scheduler_slots_empty()) {
    k_mutex_unlock(&control_mutex);
    return -4;
  }

  if (validate_program_locked(binary, size) != ZPLC_LOADER_OK) {
    k_mutex_unlock(&control_mutex);
    return -3;
  }

  /* Validation above makes this one core commit and task materialization safe.
   */
  count = zplc_core_load_tasks(binary, size, defs, CONFIG_ZPLC_MAX_TASKS,
                               load_workspace, sizeof(load_workspace));
  if (count < 0) {
    zplc_hal_log("[SCHED] Failed to parse .zplc file: %d\n", count);
    k_mutex_unlock(&control_mutex);
    return -3;
  }
  if (sched_state == ZPLC_SCHED_STATE_ERROR && count == 0) {
    k_mutex_unlock(&control_mutex);
    return -3;
  }

  /* Get total code size (loaded by zplc_core_load_tasks) */
  total_code_size = zplc_mem_get_code_size();

  zplc_hal_log("[SCHED] Loading %d tasks (code size: %u bytes)\n", count,
               total_code_size);

  /* Every descriptor was validated before the core commit. */
  for (int i = 0; i < count; i++) {
    const zplc_task_def_t *def = &defs[i];
    zplc_task_internal_t *t = &tasks[i];

    /* Initialize task data */
    memset(t, 0, sizeof(zplc_task_internal_t));
    memcpy(&t->task.config, def, sizeof(zplc_task_def_t));
    t->task.state = ZPLC_TASK_STATE_READY;

    /* Point to code in shared segment (already loaded) */
    t->task.code =
        zplc_mem_get_code(def->entry_point, total_code_size - def->entry_point);
    t->task.code_size = total_code_size - def->entry_point;

    /* Initialize VM with entry point */
    zplc_vm_init(&t->vm);
    (void)zplc_vm_set_entry(&t->vm, def->entry_point,
                            total_code_size - def->entry_point);
    t->vm.task_id = def->id;
    t->vm.priority = def->priority;
    t->vm.stack_limit = def->stack_size;

    /* Initialize timer (but don't start yet) */
    k_timer_init(&t->timer, task_timer_handler, NULL);

    key = k_spin_lock(&admission_lock);
    t->registered = 1;
    task_count++;
    k_spin_unlock(&admission_lock, key);

    zplc_hal_log(
        "[SCHED] Task %d loaded: entry=%u, interval=%u us, priority=%d\n",
        def->id, def->entry_point, def->interval_us, def->priority);
  }

  /* A successful, fully materialized replacement is the only recovery path. */
  key = k_spin_lock(&admission_lock);
  scheduler_fault_latched = 0U;
  sched_state = ZPLC_SCHED_STATE_IDLE;
  k_spin_unlock(&admission_lock, key);

  k_mutex_unlock(&control_mutex);
  return count;
}

int zplc_sched_unregister_task(int task_id) {
  int result;

  if (sched_state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue()) {
    return -1;
  }
  k_mutex_lock(&control_mutex, K_FOREVER);
  result = unregister_task_locked(task_id);
  k_mutex_unlock(&control_mutex);
  return result;
}

int zplc_sched_start(void) {
  int started_count = 0;
  int index;
  k_spinlock_key_t key;

  if (sched_state == ZPLC_SCHED_STATE_UNINIT) {
    return -1;
  }
  k_mutex_lock(&control_mutex, K_FOREVER);
  if (sched_state != ZPLC_SCHED_STATE_IDLE || scheduler_fault_is_latched()) {
    k_mutex_unlock(&control_mutex);
    return -1;
  }
  if (task_count == 0U) {
    k_mutex_unlock(&control_mutex);
    return -2;
  }
  /* Arm before RUN/timers. A failed prepare leaves the logical scheduler idle
   * and explicitly re-applies safe outputs; no background feeder exists. */
  if (watchdog_prepare() != 0) {
    int safe_result;

    k_mutex_lock(&mem_mutex, K_FOREVER);
    safe_result = apply_safe_outputs_with_mem_locked();
    if (safe_result != 0) {
      (void)latch_fault_locked();
    }
    k_mutex_unlock(&mem_mutex);
    if (safe_result == 0) {
      (void)watchdog_disarm();
    }
    k_mutex_unlock(&control_mutex);
    return -3;
  }
  k_mutex_lock(&mem_mutex, K_FOREVER);
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    if (tasks[index].registered != 0U &&
        (tasks[index].task.state == ZPLC_TASK_STATE_READY ||
         tasks[index].task.state == ZPLC_TASK_STATE_PAUSED)) {
      zplc_vm_reset_cycle(&tasks[index].vm);
      memset(&tasks[index].task.stats, 0, sizeof(zplc_task_stats_t));
      k_timer_start(&tasks[index].timer,
                    K_MSEC(tasks[index].task.config.interval_us / 1000U),
                    K_MSEC(tasks[index].task.config.interval_us / 1000U));
      started_count++;
    }
  }
  k_mutex_unlock(&mem_mutex);
  key = k_spin_lock(&admission_lock);
  if (scheduler_fault_latched != 0U || sched_state != ZPLC_SCHED_STATE_IDLE) {
    int safe_result;

    k_spin_unlock(&admission_lock, key);
    stop_all_task_timers();
    k_mutex_lock(&mem_mutex, K_FOREVER);
    safe_result = apply_safe_outputs_with_mem_locked();
    if (safe_result != 0) {
      (void)latch_fault_locked();
    }
    k_mutex_unlock(&mem_mutex);
    if (safe_result == 0) {
      (void)watchdog_disarm();
    }
    k_mutex_unlock(&control_mutex);
    return -1;
  }
  sched_state = ZPLC_SCHED_STATE_RUNNING;
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    if (tasks[index].registered != 0U &&
        (tasks[index].task.state == ZPLC_TASK_STATE_READY ||
         tasks[index].task.state == ZPLC_TASK_STATE_PAUSED)) {
      tasks[index].task.state = ZPLC_TASK_STATE_RUNNING;
      tasks[index].timer_running = 1U;
      tasks[index].work_pending = 0U;
      zplc_hal_log("[SCHED] Task %d started (interval=%u ms)\n",
                   tasks[index].task.config.id,
                   tasks[index].task.config.interval_us / 1000U);
    }
  }
  k_spin_unlock(&admission_lock, key);

  if (started_count > 0 || sched_state != ZPLC_SCHED_STATE_RUNNING) {
    zplc_hal_log("[SCHED] Scheduler started with %d tasks\n", task_count);
  }

  k_mutex_unlock(&control_mutex);
  return 0;
}

int zplc_sched_stop(void) {
  int result;

  if (sched_state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue()) {
    return -1;
  }
  k_mutex_lock(&control_mutex, K_FOREVER);
  result = stop_locked();
  k_mutex_unlock(&control_mutex);
  return result;
}

int zplc_sched_enter_safe_error(void) {
  int safe_result;
  struct k_work_sync sync;

  if (sched_state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue()) {
    return -1;
  }

  /* Control-plane ownership is control -> memory -> admission. The
   * coordinator only owns memory -> admission, so it cannot deadlock here. */
  k_mutex_lock(&control_mutex, K_FOREVER);
  k_mutex_lock(&mem_mutex, K_FOREVER);
  safe_result = latch_fault_locked();
  k_mutex_unlock(&mem_mutex);
  stop_all_task_timers();
  (void)k_work_cancel_sync(&coordinator_work, &sync);
  k_mutex_unlock(&control_mutex);
  return safe_result;
}

int zplc_sched_pause(void) {
  int result;

  if (sched_state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue()) {
    return -1;
  }
  k_mutex_lock(&control_mutex, K_FOREVER);
  result = pause_locked();
  k_mutex_unlock(&control_mutex);
  return result;
}

int zplc_sched_resume(void) {
  int index;
  k_spinlock_key_t key;

  if (sched_state != ZPLC_SCHED_STATE_PAUSED) {
    return -1;
  }
  k_mutex_lock(&control_mutex, K_FOREVER);
  if (sched_state != ZPLC_SCHED_STATE_PAUSED || scheduler_fault_is_latched()) {
    k_mutex_unlock(&control_mutex);
    return -1;
  }
  if (watchdog_prepare() != 0) {
    int safe_result;

    k_mutex_lock(&mem_mutex, K_FOREVER);
    safe_result = apply_safe_outputs_with_mem_locked();
    if (safe_result != 0) {
      (void)latch_fault_locked();
    }
    k_mutex_unlock(&mem_mutex);
    if (safe_result == 0) {
      (void)watchdog_disarm();
    }
    k_mutex_unlock(&control_mutex);
    return -2;
  }
  k_mutex_lock(&mem_mutex, K_FOREVER);
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    if (tasks[index].registered != 0U &&
        tasks[index].task.state == ZPLC_TASK_STATE_PAUSED) {
      (void)zplc_vm_resume(&tasks[index].vm);
      k_timer_start(&tasks[index].timer,
                    K_MSEC(tasks[index].task.config.interval_us / 1000U),
                    K_MSEC(tasks[index].task.config.interval_us / 1000U));
    }
  }
  k_mutex_unlock(&mem_mutex);
  key = k_spin_lock(&admission_lock);
  if (scheduler_fault_latched != 0U || sched_state != ZPLC_SCHED_STATE_PAUSED) {
    int safe_result;

    k_spin_unlock(&admission_lock, key);
    stop_all_task_timers();
    k_mutex_lock(&mem_mutex, K_FOREVER);
    safe_result = apply_safe_outputs_with_mem_locked();
    if (safe_result != 0) {
      (void)latch_fault_locked();
    }
    k_mutex_unlock(&mem_mutex);
    if (safe_result == 0) {
      (void)watchdog_disarm();
    }
    k_mutex_unlock(&control_mutex);
    return -1;
  }
  sched_state = ZPLC_SCHED_STATE_RUNNING;
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    if (tasks[index].registered != 0U &&
        tasks[index].task.state == ZPLC_TASK_STATE_PAUSED) {
      tasks[index].task.state = ZPLC_TASK_STATE_RUNNING;
      tasks[index].timer_running = 1U;
      tasks[index].work_pending = 0U;
    }
  }
  k_spin_unlock(&admission_lock, key);

  k_mutex_unlock(&control_mutex);
  return 0;
}

int zplc_sched_step(void) {
  zplc_task_internal_t *batch[CONFIG_ZPLC_MAX_TASKS];
  scheduler_stamp_t release;
  uint8_t count = 0U;
  int result;
  int index;

  if (sched_state != ZPLC_SCHED_STATE_PAUSED &&
      sched_state != ZPLC_SCHED_STATE_IDLE) {
    return -1;
  }
  k_mutex_lock(&control_mutex, K_FOREVER);
  if (sched_state != ZPLC_SCHED_STATE_PAUSED &&
      sched_state != ZPLC_SCHED_STATE_IDLE) {
    k_mutex_unlock(&control_mutex);
    return -1;
  }
  if (scheduler_fault_is_latched()) {
    k_mutex_unlock(&control_mutex);
    return -1;
  }
  {
    k_spinlock_key_t key = k_spin_lock(&admission_lock);
    if (scheduler_fault_latched != 0U) {
      k_spin_unlock(&admission_lock, key);
      k_mutex_unlock(&control_mutex);
      return -1;
    }
    release = scheduler_stamp_now();
    for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
      zplc_task_internal_t *t = &tasks[index];

      if (!t->registered || (t->task.state != ZPLC_TASK_STATE_PAUSED &&
                             t->task.state != ZPLC_TASK_STATE_READY)) {
        continue;
      }
      t->task.state = ZPLC_TASK_STATE_RUNNING;
      t->release = release;
      t->work_pending = 1U;
      batch[count++] = t;
    }
    if (count != 0U) {
      sched_state = ZPLC_SCHED_STATE_RUNNING;
    }
    k_spin_unlock(&admission_lock, key);
  }
  if (count == 0U) {
    k_mutex_unlock(&control_mutex);
    return -2;
  }
  for (index = 1; index < count; ++index) {
    zplc_task_internal_t *current = batch[index];
    int previous = index - 1;
    while (previous >= 0 && task_release_before(current, batch[previous])) {
      batch[previous + 1] = batch[previous];
      --previous;
    }
    batch[previous + 1] = current;
  }
  result = execute_batch(batch, count, true);
  k_mutex_unlock(&control_mutex);
  return result < 0 ? result : 0;
}

zplc_sched_state_t zplc_sched_get_state(void) {
  zplc_sched_state_t state;
  k_spinlock_key_t key = k_spin_lock(&admission_lock);
  state = sched_state;
  k_spin_unlock(&admission_lock, key);
  return state;
}

int zplc_sched_get_stats(zplc_sched_stats_t *stats) {
  if (stats == NULL) {
    return -1;
  }

  memset(stats, 0, sizeof(zplc_sched_stats_t));
  k_mutex_lock(&mem_mutex, K_FOREVER);
  {
    k_spinlock_key_t key = k_spin_lock(&admission_lock);
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
    stats->input_latch_count = input_latch_count;
    stats->output_commit_count = output_commit_count;
    k_spin_unlock(&admission_lock, key);
  }
  k_mutex_unlock(&mem_mutex);

  return 0;
}

int zplc_sched_get_task(int task_id, zplc_task_t *task) {
  zplc_task_internal_t *t;
  k_spinlock_key_t key;
  if (task_id < 0 || task_id >= CONFIG_ZPLC_MAX_TASKS) {
    return -1;
  }

  if (task == NULL) {
    return -2;
  }

  t = &tasks[task_id];
  k_mutex_lock(&mem_mutex, K_FOREVER);
  key = k_spin_lock(&admission_lock);
  if (!t->registered) {
    k_spin_unlock(&admission_lock, key);
    k_mutex_unlock(&mem_mutex);
    return -3;
  }

  memcpy(task, &t->task, sizeof(zplc_task_t));
  k_spin_unlock(&admission_lock, key);
  k_mutex_unlock(&mem_mutex);

  return 0;
}

int zplc_sched_get_task_count(void) {
  int count;
  k_spinlock_key_t key = k_spin_lock(&admission_lock);
  count = task_count;
  k_spin_unlock(&admission_lock, key);
  return count;
}

static int scheduler_debug_lock_task(int task_id, zplc_task_internal_t **task) {
  k_spinlock_key_t key;

  if (sched_state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue() || task_id < 0 ||
      task_id >= CONFIG_ZPLC_MAX_TASKS) {
    return -1;
  }
  k_mutex_lock(&control_mutex, K_FOREVER);
#ifdef CONFIG_ZTEST
  k_sem_give(&test_debug_before_mem_entered);
#endif
  k_mutex_lock(&mem_mutex, K_FOREVER);
  key = k_spin_lock(&admission_lock);
  if (!tasks[task_id].registered) {
    k_spin_unlock(&admission_lock, key);
    k_mutex_unlock(&mem_mutex);
    k_mutex_unlock(&control_mutex);
    return -2;
  }
  *task = &tasks[task_id];
  k_spin_unlock(&admission_lock, key);
  return 0;
}

static void scheduler_debug_unlock_task(void) {
  k_mutex_unlock(&mem_mutex);
  k_mutex_unlock(&control_mutex);
}

int zplc_sched_debug_snapshot(int task_id, zplc_sched_vm_snapshot_t *snapshot) {
  zplc_task_internal_t *task;
  int result;

  if (snapshot == NULL) {
    return -1;
  }
  result = scheduler_debug_lock_task(task_id, &task);
  if (result != 0) {
    return result;
  }
  snapshot->task_id = task->task.config.id;
  snapshot->pc = task->vm.pc;
  snapshot->sp = task->vm.sp;
  snapshot->error = task->vm.error;
  snapshot->halted = task->vm.halted;
  snapshot->paused = task->vm.paused;
  snapshot->breakpoint_count = task->vm.breakpoint_count;
  memcpy(snapshot->breakpoints, task->vm.breakpoints,
         sizeof(snapshot->breakpoints));
  scheduler_debug_unlock_task();
  return 0;
}

int zplc_sched_debug_add_breakpoint(int task_id, uint16_t pc) {
  zplc_task_internal_t *task;
  int result = scheduler_debug_lock_task(task_id, &task);
  if (result == 0) {
    result = zplc_vm_add_breakpoint(&task->vm, pc);
    scheduler_debug_unlock_task();
  }
  return result;
}

int zplc_sched_debug_remove_breakpoint(int task_id, uint16_t pc) {
  zplc_task_internal_t *task;
  int result = scheduler_debug_lock_task(task_id, &task);
  if (result == 0) {
    result = zplc_vm_remove_breakpoint(&task->vm, pc);
    scheduler_debug_unlock_task();
  }
  return result;
}

int zplc_sched_debug_clear_breakpoints(int task_id) {
  zplc_task_internal_t *task;
  int result = scheduler_debug_lock_task(task_id, &task);
  if (result == 0) {
    result = zplc_vm_clear_breakpoints(&task->vm);
    scheduler_debug_unlock_task();
  }
  return result;
}

int zplc_sched_lock(int timeout_ms) {
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

int zplc_sched_unlock(void) { return k_mutex_unlock(&mem_mutex); }
