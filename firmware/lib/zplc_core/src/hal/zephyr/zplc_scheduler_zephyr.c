/**
 * @file zplc_scheduler_zephyr.c
 * @brief ZPLC Multitask Scheduler - Zephyr adapter of the portable scheduler core
 *
 * SPDX-License-Identifier: MIT
 *
 * What a release, an order, a deadline miss, a fault and a safe state mean is decided once, in
 * src/core/zplc_sched_core.c (RT-008). This file is what the Zephyr runtime adds to it:
 *
 *   - k_timer: one per task, fires at the task's interval and only admits a release;
 *   - one k_work coordinator: runs each ordered due-set as one batch through the core;
 *   - k_mutex / k_spinlock: the image lock, the output lock, the control lock and the admission lock;
 *   - the physical I/O of the board table, the hardware watchdog, the RETAIN persistence and the log.
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │                    ZPLC Task Scheduler                       │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  task k_timers ──► core admission ──► one k_work coordinator│
 *   │                                      │                      │
 *   │              core scan: ordered due-set process-image batch │
 *   │                                                              │
 *   │  Shared Memory: IPI/OPI/Work (protected by mutex)           │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Timer ISRs only admit releases. The coordinator takes one input snapshot, orders all releases, runs them, then
 * performs at most one output commit; the core does all of it, with the locks and the hardware behind the port
 * below.
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
#include <zplc_bytes.h>
#include <zplc_core.h>
#include <zplc_debug.h>
#include <zplc_exchange.h>
#include <zplc_failsafe.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_sched_core.h>
#include <zplc_scheduler.h>
#include <zplc_verify_scratch.h>
#ifdef CONFIG_ZPLC_RETAIN_PERSIST
#include <zplc_retain.h>
#endif

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

/* RT-014: consecutive deadline misses of one task that latch the fault. */
#ifdef CONFIG_ZPLC_DEADLINE_MISS_LIMIT
#define ZPLC_DEADLINE_MISS_LIMIT ((uint32_t)CONFIG_ZPLC_DEADLINE_MISS_LIMIT)
#else
#define ZPLC_DEADLINE_MISS_LIMIT ZPLC_SCHED_DEFAULT_MISS_LIMIT
#endif

BUILD_ASSERT(CONFIG_ZPLC_MAX_TASKS <= ZPLC_SCHED_CORE_MAX_SLOTS,
             "CONFIG_ZPLC_MAX_TASKS exceeds the slots of the scheduler core");

/* ============================================================================
 * Static Data
 * ============================================================================
 */

/* The tasks: the core owns the slots, the adapter owns the VMs and the timers of the same index. */
static zplc_sched_slot_t slots[CONFIG_ZPLC_MAX_TASKS];
static zplc_vm_t vms[CONFIG_ZPLC_MAX_TASKS];
static struct k_timer timers[CONFIG_ZPLC_MAX_TASKS];

/* What the scheduler is doing, the fault latch and the counters. UNINIT until zplc_sched_init(); the latch holds
 * until a validated program is materialized into an empty scheduler. */
static zplc_sched_core_t core;

/* Serializes thread-context control-plane operations. The verifier scratch is not owned here: the image has one,
 * with its own leaf lock, shared with the program store (zplc_verify_scratch.h). */
static struct k_mutex control_mutex;

/* Serializes timer admission against stop/unregister on SMP and in ISRs. It is the critical section of the core. */
static struct k_spinlock admission_lock;

/** @brief Shared memory mutex: the lock of the process image (RT-012: never held across hardware I/O or a log). */
static struct k_mutex mem_mutex;

/* Serialises every write of the physical outputs and the watchdog feed: the commit of a scan, the safe state of a
 * stop, a pause or a fault. It is taken with the image lock released, so the image is never held while a pin is
 * written, and a stop that races a commit finds the commit finished or refused: the pins end in the safe state. */
static struct k_mutex io_mutex;

#define ZPLC_LOCK_MEMORY 0
#define ZPLC_LOCK_CONTROL 1
#define ZPLC_LOCK_IO 2

#ifdef CONFIG_ZTEST
/* Test seam (RT-030): the next take of the selected mutex fails with this result. */
static int test_lock_failure;
static uint8_t test_lock_failure_kind;
#endif

/* One non-reentrant Zephyr work item owns every normal scheduler batch. */
static struct k_work coordinator_work;
/* This is deliberately owned by the coordinator, never by a timer or ISR. */
/* -1 is disarmed; Zephyr watchdog channels are int and must not truncate. */
static int hardware_watchdog_channel = -1;

/* The instant the scheduler clock counts from: the core's microseconds are those since this stamp, added to the
 * uptime it was taken at, so that the uptime register of a scan is the kernel's. */
typedef struct {
  int64_t uptime_ms;
  uint32_t cycle32;
} scheduler_stamp_t;

static scheduler_stamp_t clock_base;

#ifdef CONFIG_ZTEST
/* Native-sim seam: hold one coordinator after task execution, before commit. */
static struct k_sem test_before_commit_entered;
static struct k_sem test_before_commit_release;
static uint8_t test_hold_before_commit;
/* Holds the scan with the pins about to be written: the image lock must be free there (RT-012). */
static struct k_sem test_output_write_entered;
static struct k_sem test_output_write_release;
static uint8_t test_hold_output_write;
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
/* A clock a test supplies: microseconds, replaces the kernel's while set. */
static uint64_t (*test_clock_us)(void);
#endif

#ifdef CONFIG_ZPLC_RETAIN_PERSIST
/*
 * RETAIN persistence (RT-025, RT-026).
 *
 * A record is cut into chunks of ZPLC_RETAIN_CHUNK_SIZE; every chunk is one
 * backend entry (NVS entry header and alignment included, estimated at
 * CONFIG_ZPLC_RETAIN_ENTRY_OVERHEAD bytes). The wear budget is an engineering
 * estimate from the Kconfig values of the board, not a measurement:
 *
 *   saves the flash takes   = ENDURANCE_CYCLES * WEAR_BYTES / flash bytes per save
 *   life of the board       = saves * SAVE_INTERVAL_S
 *
 * and the build fails when that life is shorter than ZPLC_RETAIN_LIFE_YEARS. A
 * save that finds the region unchanged writes nothing, so this is the worst case:
 * a region that changes in every interval.
 */
#define ZPLC_RETAIN_RECORD_BYTES                                               \
  ((uint64_t)ZPLC_RETAIN_HEADER_SIZE + ZPLC_MEM_RETAIN_SIZE +                  \
   ZPLC_RETAIN_TRAILER_SIZE)
#define ZPLC_RETAIN_RECORD_CHUNKS                                              \
  ((ZPLC_RETAIN_RECORD_BYTES + ZPLC_RETAIN_CHUNK_SIZE - 1U) /                  \
   ZPLC_RETAIN_CHUNK_SIZE)
#define ZPLC_RETAIN_FLASH_BYTES_PER_SAVE                                       \
  (ZPLC_RETAIN_RECORD_BYTES +                                                  \
   ZPLC_RETAIN_RECORD_CHUNKS * CONFIG_ZPLC_RETAIN_ENTRY_OVERHEAD)
#define ZPLC_RETAIN_SECONDS_PER_YEAR 31557600ULL

BUILD_ASSERT(ZPLC_RETAIN_RECORD_CHUNKS <= ZPLC_RETAIN_MAX_CHUNKS,
             "CONFIG_ZPLC_RETAIN_CHUNK_SIZE is too small: the RETAIN region "
             "needs more than the eight chunks a slot can name");
BUILD_ASSERT(CONFIG_ZPLC_RETAIN_SAVE_INTERVAL_S == 0 ||
                 (uint64_t)CONFIG_ZPLC_RETAIN_FLASH_ENDURANCE_CYCLES *
                         CONFIG_ZPLC_RETAIN_FLASH_WEAR_BYTES *
                         CONFIG_ZPLC_RETAIN_SAVE_INTERVAL_S >=
                     (uint64_t)CONFIG_ZPLC_RETAIN_LIFE_YEARS *
                         ZPLC_RETAIN_SECONDS_PER_YEAR *
                         ZPLC_RETAIN_FLASH_BYTES_PER_SAVE,
             "CONFIG_ZPLC_RETAIN_SAVE_INTERVAL_S wears the storage flash out "
             "before CONFIG_ZPLC_RETAIN_LIFE_YEARS: raise the interval, or fix "
             "the endurance and wear-bytes values of the board");

/* The identity and the periodic save belong to the program that zplc_sched_load()
 * admitted; both are owned by the control plane (control_mutex). */
static zplc_retain_identity_t retain_identity;
static bool retain_active;
static struct k_work_delayable retain_work;
#endif

/** @brief Normal priority work queue */
K_THREAD_STACK_DEFINE(normal_workq_stack, CONFIG_ZPLC_SCHED_WORKQ_STACK_SIZE);
static struct k_work_q normal_workq;

#ifdef CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ
/** @brief High priority work queue */
K_THREAD_STACK_DEFINE(high_workq_stack, CONFIG_ZPLC_SCHED_HIGH_PRIO_STACK_SIZE);
static struct k_work_q high_workq;
#endif

/** @brief The work queue threads exist; they are started once per boot. */
static bool workqueues_started;

/* ============================================================================
 * Locks (RT-030)
 * ============================================================================
 *
 * Taking a lock with K_FOREVER fails only when the mutex object is not valid. The scheduler never continues past a
 * lock it did not get: a control-plane call returns ZPLC_SCHED_ERR_LOCK having changed nothing, and a path that
 * needs the memory lock to reach the safe state puts the physical outputs in it without the lock and latches the
 * fault (lock_failure_fault).
 */

static int take_lock(struct k_mutex *mutex, int kind) {
  int result;

#ifndef CONFIG_ZTEST
  ARG_UNUSED(kind);
#endif
#ifdef CONFIG_ZTEST
  if (test_lock_failure != 0 && test_lock_failure_kind == (uint8_t)kind) {
    result = test_lock_failure;
    test_lock_failure = 0;
    zplc_hal_log("[SCHED] Lock could not be taken: %d\n", result);
    return result;
  }
#endif
  result = k_mutex_lock(mutex, K_FOREVER);
  if (result != 0) {
    zplc_hal_log("[SCHED] Lock could not be taken: %d\n", result);
  }
  return result;
}

static void release_lock(struct k_mutex *mutex) {
  int result = k_mutex_unlock(mutex);

  if (result != 0) {
    zplc_hal_log("[SCHED] Lock could not be released: %d\n", result);
  }
}

static int control_lock(void) { return take_lock(&control_mutex, ZPLC_LOCK_CONTROL); }
static void control_unlock(void) { release_lock(&control_mutex); }
static int mem_lock(void) { return take_lock(&mem_mutex, ZPLC_LOCK_MEMORY); }
static void mem_unlock(void) { release_lock(&mem_mutex); }
static int io_lock(void) { return take_lock(&io_mutex, ZPLC_LOCK_IO); }
static void io_unlock(void) { release_lock(&io_mutex); }

static int scheduler_slots_empty(void) {
  return core.count == 0U;
}

/* ============================================================================
 * I/O Synchronization
 * ============================================================================
 */

/*
 * The channels that are synchronized are the I/O table of the board (zplc_io_table(), generated from the board
 * description): every input channel is written to the input image at its address and every output channel is
 * read from the output image, so a channel added to a board needs no change here. The synchronization itself,
 * zplc_io_sample() and its siblings, is the portable core's, and so is the one the single-task configuration
 * uses. What this file adds is, in a test build, the failures a test makes the channels have.
 */

#ifdef CONFIG_ZTEST
static size_t channel_ordinal(const zplc_io_channel_t *channel, int direction, int digital_only) {
  const size_t count = zplc_io_channel_count();
  size_t ordinal = 0U;
  size_t index;

  for (index = 0U; index < count; index++) {
    const zplc_io_channel_t *candidate = zplc_io_channel_at(index);

    if (candidate == channel) {
      break;
    }
    if (candidate != NULL && candidate->direction == direction &&
        (!digital_only || candidate->kind == ZPLC_IO_KIND_DIGITAL)) {
      ordinal++;
    }
  }
  return ordinal;
}

/* The ordinal of a digital input channel in table order fails its read, or marks it unavailable. */
static zplc_hal_result_t test_read_channel(const zplc_io_channel_t *channel, uint16_t *value) {
  if (channel->kind == ZPLC_IO_KIND_DIGITAL) {
    const size_t ordinal = channel_ordinal(channel, ZPLC_IO_DIR_INPUT, 1);
    k_spinlock_key_t key = k_spin_lock(&admission_lock);
    zplc_hal_result_t result = ZPLC_HAL_OK;

    if (test_gpio_read_failure != ZPLC_HAL_OK && test_gpio_read_failure_channel == ordinal) {
      result = test_gpio_read_failure;
      test_gpio_read_failure = ZPLC_HAL_OK;
    }
    k_spin_unlock(&admission_lock, key);
    if (result != ZPLC_HAL_OK) {
      return result;
    }
  }
  return zplc_io_read_channel(channel, value);
}

/* The ordinal of an output channel in table order fails its commit; every real write is counted. */
static zplc_hal_result_t test_commit_channel(const zplc_io_channel_t *channel, uint16_t value) {
  const size_t ordinal = channel_ordinal(channel, ZPLC_IO_DIR_OUTPUT, 0);
  k_spinlock_key_t key = k_spin_lock(&admission_lock);
  zplc_hal_result_t result = ZPLC_HAL_OK;

  if (test_output_commit_failure != ZPLC_HAL_OK && test_output_commit_failure_channel == ordinal) {
    result = test_output_commit_failure;
    test_output_commit_failure = ZPLC_HAL_OK;
  }
  k_spin_unlock(&admission_lock, key);
  if (result != ZPLC_HAL_OK) {
    return result;
  }
  result = zplc_io_write_channel(channel, value);
  key = k_spin_lock(&admission_lock);
  if (test_output_commit_write_count != UINT8_MAX) {
    test_output_commit_write_count++;
  }
  k_spin_unlock(&admission_lock, key);
  return result;
}

/* The safe state of every digital output fails with the result a test set. */
static zplc_hal_result_t test_safe_channel(const zplc_io_channel_t *channel, uint16_t value) {
  if (test_safe_output_failure != 0) {
    return (zplc_hal_result_t)test_safe_output_failure;
  }
  return zplc_io_write_channel(channel, value);
}

static const zplc_io_ops_t read_ops = {.read = test_read_channel, .write = NULL};
static const zplc_io_ops_t commit_ops = {.read = NULL, .write = test_commit_channel};
static const zplc_io_ops_t safe_ops = {.read = NULL, .write = test_safe_channel};
#define READ_OPS (&read_ops)
#define COMMIT_OPS (&commit_ops)
#define SAFE_OPS (&safe_ops)
#else
#define READ_OPS NULL
#define COMMIT_OPS NULL
#define SAFE_OPS NULL
#endif

/* ============================================================================
 * Forward Declarations
 * ============================================================================
 */

static int drive_safe_pins(void);
static int reset_image_locked(void);
#ifdef CONFIG_ZTEST
static void increment_counter(uint32_t *counter);
#endif
static int watchdog_disarm(void);
static int watchdog_apply_state(zplc_wdt_state_t state);
static int watchdog_prepare(void);

/* ============================================================================
 * The hardware watchdog (RT-020)
 * ============================================================================
 *
 * The physical watchdog is intentionally opt-in per exact board profile: boards.json says, for each board, whether
 * its profile has a hardware record (HIL-010), and CONFIG_ZPLC_HARDWARE_WATCHDOG is set in exactly the profiles
 * that do; the build fails when the two disagree. No board has a record today, so none arms it. Tests use the
 * narrow ztest model below rather than pretending native_sim owns a physical watchdog.
 *
 * Where it is enabled it is fed from one place: after the outputs of a scan were written (the commit of the
 * core). A runtime that waits (STOP, a pause or a breakpoint) is kept fed by a work item of the control path,
 * when the profile's policy says so; a latched fault is left to expire, so that the board resets into STOP with
 * the cause recorded (zplc_failsafe_note_scheduler_fault). Nothing feeds it from a timer, an ISR or the shell.
 */

#ifdef CONFIG_ZTEST
#define ZPLC_TEST_WATCHDOG_TIMEOUT_MS 1000U
/* The longest timeout the model of the part accepts: a task set whose interval is over half of it is refused. */
#define ZPLC_TEST_WATCHDOG_MAX_MS 1000U

/* The model of the part: it expires when it is not fed within the timeout it was armed with. */
static struct k_timer test_watchdog_timer;
static uint32_t test_watchdog_expired_count;
static uint32_t test_watchdog_timeout_ms;
static zplc_wdt_policy_t test_watchdog_policy;
static uint8_t test_watchdog_policy_set;

static void test_watchdog_expired(struct k_timer *timer) {
  ARG_UNUSED(timer);
  test_watchdog_expired_count++;
}
#endif

static struct k_work_delayable keepalive_work;
static bool keepalive_running;

/* The policy of this profile: the design default, changed by the three options of the profile. */
static zplc_wdt_policy_t watchdog_policy(void) {
  zplc_wdt_policy_t policy = zplc_wdt_policy_default();

#ifdef CONFIG_ZTEST
  if (test_watchdog_policy_set != 0U) {
    return test_watchdog_policy;
  }
#endif
#ifdef CONFIG_ZPLC_WATCHDOG_STOP_FEED
  policy.stop = (uint8_t)ZPLC_WDT_FEED;
#endif
#ifdef CONFIG_ZPLC_WATCHDOG_PAUSE_DISARM
  policy.pause = (uint8_t)ZPLC_WDT_DISARM;
#endif
#ifdef CONFIG_ZPLC_WATCHDOG_FAULT_DISARM
  policy.fault = (uint8_t)ZPLC_WDT_DISARM;
#endif
  return policy;
}

/* The timeout the part is armed with for the registered task set: the profile's, or the two intervals of the
 * slowest task when that is longer. 0 when the part cannot be given one that fits. */
static uint32_t watchdog_timeout_for_tasks(void) {
  uint32_t longest_interval_us = 0U;
  uint32_t profile_ms;
  uint32_t hardware_max_ms;
  int index;

#if defined(CONFIG_ZTEST)
  profile_ms = ZPLC_TEST_WATCHDOG_TIMEOUT_MS;
  hardware_max_ms = ZPLC_TEST_WATCHDOG_MAX_MS;
#elif defined(CONFIG_ZPLC_HARDWARE_WATCHDOG)
  profile_ms = CONFIG_ZPLC_HARDWARE_WATCHDOG_TIMEOUT_MS;
  hardware_max_ms = CONFIG_ZPLC_HARDWARE_WATCHDOG_TIMEOUT_MAX_MS;
#else
  return 0U;
#endif
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; ++index) {
    if (slots[index].registered != 0U && slots[index].task.config.interval_us > longest_interval_us) {
      longest_interval_us = slots[index].task.config.interval_us;
    }
  }
  return zplc_wdt_timeout_for(profile_ms, hardware_max_ms, longest_interval_us);
}

static int watchdog_timeout_admits_tasks(void) {
#if defined(CONFIG_ZTEST) || defined(CONFIG_ZPLC_HARDWARE_WATCHDOG)
  return watchdog_timeout_for_tasks() != 0U ? 0 : -ERANGE;
#else
  return 0;
#endif
}

static int watchdog_prepare(void) {
  int admission;
  uint32_t timeout_ms;

  if (hardware_watchdog_channel >= 0) {
    /* Already armed (a pause or a STOP of a feeding profile): a part cannot be installed twice. */
    return 0;
  }
  admission = watchdog_timeout_admits_tasks();
  if (admission != 0) {
    return admission;
  }
  timeout_ms = watchdog_timeout_for_tasks();
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
  test_watchdog_timeout_ms = timeout_ms;
  k_timer_start(&test_watchdog_timer, K_MSEC(timeout_ms), K_NO_WAIT);
  return 0;
#elif defined(CONFIG_ZPLC_HARDWARE_WATCHDOG)
#if DT_HAS_CHOSEN(zephyr_watchdog)
  static const struct device *const watchdog =
      DEVICE_DT_GET(DT_CHOSEN(zephyr_watchdog));
  struct wdt_timeout_cfg timeout = {
      .window = {.min = 0U, .max = timeout_ms},
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
  ARG_UNUSED(timeout_ms);
  return 0;
#endif
}

static int watchdog_feed_hardware(void) {
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
  k_timer_start(&test_watchdog_timer, K_MSEC(test_watchdog_timeout_ms), K_NO_WAIT);
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

/* The feed after the outputs of a scan were written (the commit phase, output lock held). */
static int watchdog_feed_after_commit(void) { return watchdog_feed_hardware(); }

/* Safe output application precedes disarm.  If a driver cannot disarm, the
 * already-safe system deliberately receives no more feeds and will reset. */
static int watchdog_disarm(void) {
  int result = 0;
  int locked;

  if (hardware_watchdog_channel < 0) {
    return 0;
  }
  /* The feed is made with io_mutex held; a disarm does not interleave with it. The mutex is recursive. */
  locked = io_lock();
#ifdef CONFIG_ZTEST
  increment_counter(&test_watchdog_disarm_count);
  k_timer_stop(&test_watchdog_timer);
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
  if (locked == 0) {
    io_unlock();
  }
  return result;
}

/* The wait of the runtime (STOP, a pause or a breakpoint) under a profile that feeds. This is the control path:
 * it feeds only while the runtime waits, never while it scans (the scan feeds after its commit) and never in a
 * latched fault. Its period is a third of the timeout the part was armed with. */
static void keepalive_schedule(void) {
#if defined(CONFIG_ZTEST) || defined(CONFIG_ZPLC_HARDWARE_WATCHDOG)
  uint32_t timeout_ms = watchdog_timeout_for_tasks();

  if (timeout_ms == 0U) {
    timeout_ms = 3U;
  }
  keepalive_running = true;
  (void)k_work_reschedule_for_queue(&normal_workq, &keepalive_work, K_MSEC(timeout_ms / 3U > 0U ? timeout_ms / 3U : 1U));
#endif
}

static void keepalive_stop(void) {
  struct k_work_sync sync;

  keepalive_running = false;
  (void)k_work_cancel_delayable_sync(&keepalive_work, &sync);
}

static void keepalive_handler(struct k_work *work) {
  zplc_sched_state_t state;
  int fault;
  int feed = 0;
  k_spinlock_key_t key;
  zplc_wdt_policy_t policy;

  ARG_UNUSED(work);
  policy = watchdog_policy();
  key = k_spin_lock(&admission_lock);
  state = core.state;
  fault = core.fault_latched != 0U;
  k_spin_unlock(&admission_lock, key);
  if (!keepalive_running || hardware_watchdog_channel < 0 || fault) {
    return;
  }
  if (state == ZPLC_SCHED_STATE_PAUSED) {
    feed = zplc_wdt_action(&policy, ZPLC_WDT_STATE_PAUSED) == ZPLC_WDT_FEED;
  } else if (state == ZPLC_SCHED_STATE_IDLE) {
    feed = zplc_wdt_action(&policy, ZPLC_WDT_STATE_STOP) == ZPLC_WDT_FEED;
  }
  if (feed != 0) {
    if (io_lock() == 0) {
      (void)watchdog_feed_hardware();
      io_unlock();
    }
    keepalive_schedule();
  }
}

/* The watchdog is stopped whatever the policy says: a scheduler that is shut down, or a start that failed. */
static int watchdog_force_disarm(void) {
  keepalive_stop();
  return watchdog_disarm();
}

/* The runtime entered a state of the policy: the watchdog is disarmed, kept fed or left to expire (RT-020). */
static int watchdog_apply_state(zplc_wdt_state_t state) {
  const zplc_wdt_policy_t policy = watchdog_policy();

  switch (zplc_wdt_action(&policy, state)) {
  case ZPLC_WDT_FEED:
    if (hardware_watchdog_channel >= 0) {
      keepalive_schedule();
    }
    return 0;
  case ZPLC_WDT_LET_EXPIRE:
    keepalive_stop();
    return 0;
  case ZPLC_WDT_DISARM:
  default:
    keepalive_stop();
    return watchdog_disarm();
  }
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

#ifdef CONFIG_ZTEST
static uint32_t scheduler_duration_us_u32(uint64_t duration_us) {
  return duration_us > UINT32_MAX ? UINT32_MAX : (uint32_t)duration_us;
}
#endif


/* ============================================================================
 * The port of the scheduler core
 * ============================================================================
 */

/* The time of the core: microseconds since boot, from the kernel's coarse uptime and its cycle counter. Safe in
 * an ISR. A test may replace it with a clock of its own (CONFIG_ZTEST). */
static uint64_t scheduler_now_us(void) {
#ifdef CONFIG_ZTEST
  if (test_clock_us != NULL) {
    return test_clock_us();
  }
#endif
  {
    scheduler_stamp_t now = scheduler_stamp_now();

    return (uint64_t)clock_base.uptime_ms * 1000U + scheduler_elapsed_us(&clock_base, &now);
  }
}

/* What a scan holds on its stack: the samples of its inputs and the values of its outputs. The core calls the
 * port with a pointer to it, so no scan buffer is static. */
typedef struct {
  zplc_io_samples_t samples;
  zplc_io_outputs_t outputs;
} scan_buffers_t;

static uint64_t port_now_us(void *ctx) {
  ARG_UNUSED(ctx);
  return scheduler_now_us();
}

static unsigned int port_enter(void *ctx) {
  k_spinlock_key_t key = k_spin_lock(&admission_lock);

  ARG_UNUSED(ctx);
  return (unsigned int)key.key;
}

static void port_leave(void *ctx, unsigned int key) {
  k_spinlock_key_t restored;

  ARG_UNUSED(ctx);
  restored.key = (int)key;
  k_spin_unlock(&admission_lock, restored);
}

static int port_lock_image(void *ctx) {
  ARG_UNUSED(ctx);
  return mem_lock();
}

static void port_unlock_image(void *ctx) {
  ARG_UNUSED(ctx);
  mem_unlock();
}

static int port_lock_io(void *ctx) {
  ARG_UNUSED(ctx);
  return io_lock();
}

static void port_unlock_io(void *ctx) {
  ARG_UNUSED(ctx);
  io_unlock();
}

static int port_sample_inputs(void *ctx) {
  scan_buffers_t *buffers = ctx;

  return (int)zplc_io_sample(&buffers->samples, READ_OPS);
}

static void port_latch_inputs(void *ctx) {
  scan_buffers_t *buffers = ctx;

  (void)zplc_exchange_latch();
  zplc_io_apply_samples(&buffers->samples);
}

static void port_capture_outputs(void *ctx) {
  scan_buffers_t *buffers = ctx;

  zplc_io_capture_outputs(&buffers->outputs);
}

static void port_publish(void *ctx) {
  ARG_UNUSED(ctx);
  zplc_exchange_publish();
}

static int port_write_outputs(void *ctx) {
  scan_buffers_t *buffers = ctx;

  return (int)zplc_io_write_outputs(&buffers->outputs, COMMIT_OPS);
}

static int port_feed_watchdog(void *ctx) {
  ARG_UNUSED(ctx);
  if (watchdog_feed_after_commit() != 0) {
    zplc_hal_log("[SCHED] Hardware watchdog feed failed\n");
    return -EIO;
  }
  return 0;
}

static int port_reset_image(void *ctx) {
  ARG_UNUSED(ctx);
  return reset_image_locked();
}

static int port_drive_safe_pins(void *ctx) {
  ARG_UNUSED(ctx);
  return drive_safe_pins();
}

static int port_watchdog_state(void *ctx, zplc_wdt_state_t state) {
  ARG_UNUSED(ctx);
  return watchdog_apply_state(state);
}

static void port_fault_latched(void *ctx, zplc_sched_fault_reason_t reason, uint16_t task_id) {
  ARG_UNUSED(ctx);
  /* A watchdog reset that follows must not erase what the scheduler latched (RT-020). */
  zplc_failsafe_note_scheduler_fault((uint8_t)reason, task_id);
}

static void stop_all_task_timers(void) {
  int index;

  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; ++index) {
    if (slots[index].registered != 0U) {
      k_timer_stop(&timers[index]);
    }
  }
}

static void port_stop_releases(void *ctx) {
  ARG_UNUSED(ctx);
  stop_all_task_timers();
}

#ifdef CONFIG_ZTEST
static int port_probe(void *ctx, zplc_sched_probe_t point, uint16_t task_id) {
  k_spinlock_key_t key;
  int armed;

  ARG_UNUSED(ctx);
  ARG_UNUSED(task_id);
  switch (point) {
  case ZPLC_SCHED_PROBE_BEFORE_COMMIT:
    key = k_spin_lock(&admission_lock);
    armed = test_hold_before_commit != 0U;
    test_hold_before_commit = 0U;
    k_spin_unlock(&admission_lock, key);
    if (armed) {
      k_sem_give(&test_before_commit_entered);
      (void)k_sem_take(&test_before_commit_release, K_SECONDS(1));
    }
    return 0;
  case ZPLC_SCHED_PROBE_BEFORE_OUTPUT_WRITE:
    key = k_spin_lock(&admission_lock);
    armed = test_hold_output_write != 0U;
    test_hold_output_write = 0U;
    k_spin_unlock(&admission_lock, key);
    if (armed) {
      k_sem_give(&test_output_write_entered);
      (void)k_sem_take(&test_output_write_release, K_SECONDS(1));
    }
    return 0;
  case ZPLC_SCHED_PROBE_FORCE_MISS:
    key = k_spin_lock(&admission_lock);
    armed = test_force_next_deadline_miss != 0U;
    test_force_next_deadline_miss = 0U;
    k_spin_unlock(&admission_lock, key);
    return armed;
  default:
    return 0;
  }
}
#endif

static const zplc_sched_port_t zephyr_port = {
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
    .feed_watchdog = port_feed_watchdog,
    .reset_image = port_reset_image,
    .drive_safe_pins = port_drive_safe_pins,
    .watchdog_state = port_watchdog_state,
    .stop_releases = port_stop_releases,
#ifdef CONFIG_ZTEST
    .probe = port_probe,
#endif
    .fault_latched = port_fault_latched,
};

/* The exchange (RT-010) asks the scheduler three things: whether scans are running, so that an external write
 * waits for the input latch; and, when none are, the image lock to apply a write at once. */
static int exchange_scan_active(void) {
  int active;
  k_spinlock_key_t key = k_spin_lock(&admission_lock);

  active = zplc_sched_core_is_running(&core);
  k_spin_unlock(&admission_lock, key);
  return active;
}

static int exchange_lock_image(void) { return mem_lock(); }
static void exchange_unlock_image(void) { mem_unlock(); }

static int scheduler_fault_is_latched(void) {
  int latched;
  k_spinlock_key_t key = k_spin_lock(&admission_lock);

  latched = core.fault_latched != 0U;
  k_spin_unlock(&admission_lock, key);
  return latched;
}

#ifdef CONFIG_ZPLC_RETAIN_PERSIST
/* The module copies the region under the memory lock, which is held by a scan
 * batch from input latch to output commit: a copy is always at a scan boundary.
 * It never holds the lock across a backend call (RT-012). */
static int retain_lock(void) { return mem_lock(); }
static void retain_unlock(void) { mem_unlock(); }

static void retain_arm_periodic(void) {
  if (CONFIG_ZPLC_RETAIN_SAVE_INTERVAL_S > 0) {
    (void)k_work_reschedule_for_queue(
        &normal_workq, &retain_work,
        K_SECONDS(CONFIG_ZPLC_RETAIN_SAVE_INTERVAL_S));
  }
}

/* Runs on the normal work queue, which the coordinator does not use while the
 * high-priority queue exists (CONFIG_ZPLC_RETAIN_PERSIST depends on it), so a
 * slow flash write never delays a scan batch from the queue side. A busy
 * control plane (load, stop, start) defers the round instead of blocking. */
static void retain_work_handler(struct k_work *work) {
  ARG_UNUSED(work);
  if (k_mutex_lock(&control_mutex, K_NO_WAIT) == 0) {
    if (retain_active && core.state == ZPLC_SCHED_STATE_RUNNING &&
        !scheduler_fault_is_latched()) {
      (void)zplc_retain_save(&retain_identity, k_uptime_get_32(),
                             ZPLC_RETAIN_SAVE_PERIODIC);
    }
    control_unlock();
  }
  retain_arm_periodic();
}

/* Caller owns control_mutex and the program was just materialized: the core
 * zeroed the region, so restore brings the values back or leaves it initialised. */
static void retain_program_loaded(const uint8_t *binary, size_t size) {
  retain_active = false;
  if (zplc_retain_identity_from_artifact(binary, size, &retain_identity) == 0) {
    (void)zplc_retain_restore(&retain_identity, k_uptime_get_32());
    retain_active = true;
    retain_arm_periodic();
  }
}
#endif


/* ============================================================================
 * Helper Functions
 * ============================================================================
 */

/**
 * @brief Get the appropriate work queue for the coordinator.
 */
static struct k_work_q *get_coordinator_workq(void) {
#ifdef CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ
  return &high_workq;
#endif
  return &normal_workq;
}

/* ============================================================================
 * Timer and Work Handlers
 * ============================================================================
 */

/**
 * @brief Timer expiry handler (runs in ISR context).
 *
 * This is called when a task's timer expires. The core decides whether the release is admitted; an admitted
 * one wakes the coordinator.
 */
static void task_timer_handler(struct k_timer *timer) {
  const int index = (int)(timer - timers);
  uint64_t release;
  k_spinlock_key_t key;

  if (index < 0 || index >= CONFIG_ZPLC_MAX_TASKS) {
    return;
  }

  /* The target stamps the release in the timer callback, and counts the deadline from the same instant. */
  release = scheduler_now_us();
  key = k_spin_lock(&admission_lock);
  if (zplc_sched_core_admit(&core, index, release, release) != 0) {
    (void)k_work_submit_to_queue(get_coordinator_workq(), &coordinator_work);
  }
  k_spin_unlock(&admission_lock, key);
}

#ifdef CONFIG_ZTEST
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

  return zplc_sched_core_overrun_us(0U, scheduler_elapsed_us(&release, &end), interval_us) != 0U;
}

int zplc_sched_test_admit_release(int task_id) {
  uint64_t release;
  k_spinlock_key_t key;
  int admitted;

  if (task_id < 0 || task_id >= CONFIG_ZPLC_MAX_TASKS) {
    return -1;
  }
  release = scheduler_now_us();
  key = k_spin_lock(&admission_lock);
  if (slots[task_id].registered == 0U) {
    k_spin_unlock(&admission_lock, key);
    return -2;
  }
  slots[task_id].task.state = ZPLC_TASK_STATE_RUNNING;
  admitted = zplc_sched_core_admit(&core, task_id, release, release);
  k_spin_unlock(&admission_lock, key);
  return admitted;
}

int zplc_sched_test_admit_release_at(int task_id, uint64_t release_us) {
  k_spinlock_key_t key;
  int admitted;

  if (task_id < 0 || task_id >= CONFIG_ZPLC_MAX_TASKS) {
    return -1;
  }
  key = k_spin_lock(&admission_lock);
  if (slots[task_id].registered == 0U) {
    k_spin_unlock(&admission_lock, key);
    return -2;
  }
  admitted = zplc_sched_core_admit(&core, task_id, release_us, release_us);
  k_spin_unlock(&admission_lock, key);
  return admitted;
}

void zplc_sched_test_set_clock(uint64_t (*clock_us)(void)) { test_clock_us = clock_us; }

void zplc_sched_test_set_miss_limit(uint32_t limit) {
  k_spinlock_key_t key = k_spin_lock(&admission_lock);

  core.miss_limit = limit != 0U ? limit : 1U;
  k_spin_unlock(&admission_lock, key);
}

zplc_sched_core_t *zplc_sched_test_core(void) { return &core; }
#endif

#ifdef CONFIG_ZTEST
static void increment_counter(uint32_t *counter) {
  if (*counter != UINT32_MAX) {
    (*counter)++;
  }
}
#endif

/* The fault, the pins and the watchdog from the control path. The first failure is returned and logged; the
 * memory lock could not be taken only when the result is ZPLC_SCHED_ERR_LOCK (RT-030). */
static int latch_fault_with_mem_lock(zplc_sched_fault_reason_t reason) {
  const int result = zplc_sched_core_fault(&core, &zephyr_port, reason, 0U);

  if (result == ZPLC_SCHED_ERR_LOCK) {
    zplc_hal_log("[SCHED] Safe state after a lock failure\n");
  } else if (result != 0) {
    zplc_hal_log("[SCHED] Failed to apply safe outputs: %d\n", result);
  }
  return result;
}

/* The memory lock could not be taken, so the output image cannot be touched coherently: the core drives the pins
 * to their safe level without it, latches the fault and stops the timers. Returns ZPLC_SCHED_ERR_LOCK. */
static int lock_failure_fault(void) {
  zplc_hal_log("[SCHED] Lock could not be taken: the runtime is latched safe\n");
  return zplc_sched_core_lock_failure(&core, &zephyr_port);
}

/* Control path: the safe state of a STOP or of the removal of the last task. Returns 0 only when the outputs are
 * safe. */
static int apply_safe_outputs_with_mem_lock(void) {
  return zplc_sched_core_apply_safe_outputs(&core, &zephyr_port);
}

/* The same for a pause: the pins only, the image and the forces stay. */
static int drive_safe_outputs_with_mem_lock(void) {
  return zplc_sched_core_drive_safe_outputs(&core, &zephyr_port);
}

/* Prints what a scan recorded while it held the image lock. */
static void print_scan_report(const zplc_sched_scan_report_t *report) {
  if (report->error_task >= 0) {
    zplc_hal_log("[SCHED] Task %d error: %d\n", report->error_task, report->error_code);
  }
  if (report->paused_task >= 0) {
    zplc_hal_log("[SCHED] Task %d paused at PC=%u\n", report->paused_task, report->paused_pc);
  }
  if (report->deadline_task >= 0) {
    zplc_hal_log("[SCHED] Task %d exceeded its activation deadline\n", report->deadline_task);
  }
  if (report->warning_task >= 0) {
    zplc_hal_log("[SCHED] Task %d missed its deadline (warning)\n", report->warning_task);
  }
}

/* Runs one ordered process-image batch through the core.
 *
 * The scan has three phases, and the image lock is held in one of them only (RT-012):
 *
 *   1. the physical inputs are read, with no lock: a pin or a converter can block;
 *   2. under the image lock: the input latch (the queued external writes, then the inputs), every task of the
 *      batch, the publication of the snapshot (RT-010) and the copy of the output byte. No hardware I/O and no
 *      log line runs here;
 *   3. with the lock released, under io_mutex: the physical outputs and the watchdog feed.
 *
 * A stop, a pause or a fault that arrives between 2 and 3 takes io_mutex after the commit or before it, and the
 * commit re-checks the state under io_mutex: the pins end in the state the later of the two decided. */
static int execute_batch(const uint8_t *order, uint8_t count, bool single_step_mode) {
  scan_buffers_t buffers;
  zplc_sched_port_t port = zephyr_port;
  zplc_sched_scan_report_t report;
  int result;

  memset(&buffers, 0, sizeof(buffers));
  port.ctx = &buffers;
  result = zplc_sched_core_scan(&core, &port, order, count, single_step_mode ? 1 : 0, &report);
  print_scan_report(&report);
  switch (result) {
  case ZPLC_SCHED_ERR_DEADLINE:
    return -ETIMEDOUT;
  case ZPLC_SCHED_ERR_IO:
    return -EIO;
  default:
    return result;
  }
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

void zplc_sched_test_hold_output_write(void) {
  k_sem_reset(&test_output_write_entered);
  k_sem_reset(&test_output_write_release);
  k_spinlock_key_t key = k_spin_lock(&admission_lock);

  test_hold_output_write = 1U;
  k_spin_unlock(&admission_lock, key);
}

int zplc_sched_test_wait_output_write(int timeout_ms) {
  return k_sem_take(&test_output_write_entered, K_MSEC(timeout_ms));
}

void zplc_sched_test_release_output_write(void) {
  k_sem_give(&test_output_write_release);
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

  if (mem_lock() != 0) {
    return;
  }
  key = k_spin_lock(&admission_lock);
  test_output_commit_failure_channel = channel;
  test_output_commit_failure = result;
  test_output_commit_write_count = 0U;
  k_spin_unlock(&admission_lock, key);
  mem_unlock();
}

void zplc_sched_test_fail_next_gpio_read(uint8_t channel,
                                         zplc_hal_result_t result) {
  k_spinlock_key_t key;

  if (mem_lock() != 0) {
    return;
  }
  key = k_spin_lock(&admission_lock);
  test_gpio_read_failure_channel = channel;
  test_gpio_read_failure = result;
  k_spin_unlock(&admission_lock, key);
  mem_unlock();
}

uint8_t zplc_sched_test_output_commit_write_count(void) {
  uint8_t count;
  k_spinlock_key_t key;

  if (mem_lock() != 0) {
    return 0U;
  }
  key = k_spin_lock(&admission_lock);
  count = test_output_commit_write_count;
  k_spin_unlock(&admission_lock, key);
  mem_unlock();
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

uint32_t zplc_sched_test_watchdog_expired_count(void) { return test_watchdog_expired_count; }

uint32_t zplc_sched_test_watchdog_timeout_ms(void) { return test_watchdog_timeout_ms; }

void zplc_sched_test_set_watchdog_policy(uint8_t stop, uint8_t pause, uint8_t fault) {
  test_watchdog_policy.stop = stop;
  test_watchdog_policy.pause = pause;
  test_watchdog_policy.fault = fault;
  test_watchdog_policy_set = 1U;
}

void zplc_sched_test_force_next_deadline_miss(void) {
  test_force_next_deadline_miss = 1U;
}

void zplc_sched_test_fail_next_lock(int result, int which) {
  test_lock_failure_kind = (uint8_t)which;
  test_lock_failure = result;
}

/* Run the batch that is due now, from the calling thread, as the coordinator would. A test that has stopped the
 * timers (zplc_sched_test_stop_timers) drives the scheduler with admissions and a clock of its own. */
int zplc_sched_test_run_batch(void) {
  uint8_t order[CONFIG_ZPLC_MAX_TASKS];
  uint8_t count;
  k_spinlock_key_t key = k_spin_lock(&admission_lock);

  count = zplc_sched_core_collect(&core, order, CONFIG_ZPLC_MAX_TASKS);
  k_spin_unlock(&admission_lock, key);
  return execute_batch(order, count, false);
}

void zplc_sched_test_stop_timers(void) { stop_all_task_timers(); }
#endif


static void coordinator_work_handler(struct k_work *work) {
  uint8_t order[CONFIG_ZPLC_MAX_TASKS];
  uint8_t count;
  k_spinlock_key_t key;

  ARG_UNUSED(work);
  key = k_spin_lock(&admission_lock);
  count = zplc_sched_core_collect(&core, order, CONFIG_ZPLC_MAX_TASKS);
  k_spin_unlock(&admission_lock, key);
  (void)execute_batch(order, count, false);
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
  uint8_t *workspace;
  uint32_t index;
  int result;

  workspace = zplc_verify_scratch_take();
  if (workspace == NULL) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  /* The view points into the artifact, not into the workspace: it is read after the scratch is given back. */
  result = zplc_loader_verify(binary, size, workspace,
                              ZPLC_LOADER_VERIFY_WORKSPACE_SIZE, &view);
  zplc_verify_scratch_give();
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
    uint32_t interval_us = zplc_get_u32_le(task + 4U);

    if (type != ZPLC_TASK_CYCLIC || interval_us < ZPLC_MIN_INTERVAL_US ||
        interval_us > ZPLC_MAX_INTERVAL_US || interval_us % 1000U != 0U ||
        zplc_get_u16_le(task + 8U) >= view.code_size) {
      return ZPLC_LOADER_ERR_TASK;
    }
  }
  /* A safe value for an output this board does not have is a project for another board: refused here, before
   * anything is stored or committed, so that no program runs with a safe state that does not exist (RT-023). */
  return zplc_io_declared_safe_fits_board(view.safe, view.safe_count);
}

/* Drives every physical output channel to its safe level and touches nothing else: the output process image and
 * the force table are the logical state of the program, not the physical one, and stay as they are. io_mutex is
 * held by the caller; the image lock is not (RT-012).
 * This is the whole safe state of a paused runtime (RT-017): the commit that copies the image to the pins does
 * not run while paused, so the pins stay at the safe level until the next normal commit after a resume.
 * The level is the board description's `safe` of each channel; the choice is made in zplc_io_drive_safe() and
 * nowhere else. */
static int drive_safe_pins_io_locked(void) { return (int)zplc_io_drive_safe(SAFE_OPS); }

/* The safe state of the pins, taking io_mutex. Hardware I/O: never call it with the image lock held. A lock that
 * cannot be taken does not leave an output energised: the pins are driven all the same, and the failure is
 * reported (RT-030). */
static int drive_safe_pins(void) {
  int locked = io_lock();
  int result = drive_safe_pins_io_locked();

  if (locked == 0) {
    io_unlock();
  }
  if (result == 0 && locked != 0) {
    result = ZPLC_SCHED_ERR_LOCK;
  }
  return result;
}

/* mem_mutex is held after admission was closed or a local fault was latched.
 * STOP, a fault and the removal of the last task end the run: the program's logical state is discarded (the
 * output image is zeroed and the force table cleared) and the snapshot follows it. The physical outputs go safe
 * after the image lock is released, with drive_safe_pins(). A pause does not end the run and only drives the pins. */
static int reset_image_locked(void) {
  const int result = zplc_io_reset_image();

  zplc_exchange_publish();
  return result;
}


static int stop_locked(void) {
  int index;
  int safe_result;
  int faulted;
  struct k_work_sync sync;

  if (mem_lock() != 0) {
    return lock_failure_fault();
  }
  {
    k_spinlock_key_t key = k_spin_lock(&admission_lock);

    faulted = core.fault_latched != 0U;
    zplc_sched_core_set_stopped(&core);
    k_spin_unlock(&admission_lock, key);
  }
  /* STOP ends the run: every task starts its next scan from its entry point.
   * A scan that a breakpoint interrupted, or that a resume armed before any
   * task ran, must not survive. A latched fault keeps its VM untouched so the
   * program counter and error it reports stay readable until a reload. */
  for (index = 0; !faulted && index < CONFIG_ZPLC_MAX_TASKS; index++) {
    if (slots[index].registered != 0U) {
      zplc_vm_reset_cycle(&vms[index]);
      /* reset_cycle keeps this mark for a restart inside one run; a stopped
       * task has no pc left to skip a breakpoint at. */
      vms[index].resume_skip_breakpoint_once = 0U;
    }
  }
  safe_result = reset_image_locked();
  mem_unlock();
  {
    /* The pins follow the image, with the lock released (RT-012). */
    int pins_result = drive_safe_pins();

    if (safe_result == 0) {
      safe_result = pins_result;
    }
  }
  stop_all_task_timers();
  (void)k_work_cancel_sync(&coordinator_work, &sync);
  if (safe_result != 0) {
    (void)latch_fault_with_mem_lock(ZPLC_SCHED_FAULT_IO);
  } else if (watchdog_apply_state(ZPLC_WDT_STATE_STOP) != 0) {
    /* Outputs are already safe; no further feed makes an unsupported WDT
     * reset fail-safe rather than silently remaining armed. */
    (void)latch_fault_with_mem_lock(ZPLC_SCHED_FAULT_IO);
    if (safe_result == 0) {
      safe_result = -EIO;
    }
  }
  zplc_hal_log("[SCHED] Scheduler stopped\n");
  return safe_result;
}

static int unregister_task_locked(int task_id) {
  k_spinlock_key_t key;
  struct k_work_sync sync;
  int last_task;

  if (task_id < 0 || task_id >= CONFIG_ZPLC_MAX_TASKS) {
    return -1;
  }
  key = k_spin_lock(&admission_lock);
  if (!slots[task_id].registered) {
    k_spin_unlock(&admission_lock, key);
    return -2;
  }
  slots[task_id].task.state = ZPLC_TASK_STATE_IDLE;
  slots[task_id].pending = 0U;
  k_spin_unlock(&admission_lock, key);
  k_timer_stop(&timers[task_id]);
  (void)k_work_cancel_sync(&coordinator_work, &sync);
  key = k_spin_lock(&admission_lock);
  (void)zplc_sched_core_remove_task(&core, task_id);
  last_task = core.count == 0U;
  if (last_task && core.fault_latched != 0U) {
    core.state = ZPLC_SCHED_STATE_IDLE;
  }
  k_spin_unlock(&admission_lock, key);
  if (last_task) {
    int safe_result;
    int pins_result;

    if (mem_lock() != 0) {
      return lock_failure_fault();
    }
    safe_result = reset_image_locked();
    mem_unlock();
    pins_result = drive_safe_pins();
    if (safe_result == 0) {
      safe_result = pins_result;
    }
    if (safe_result != 0 || watchdog_apply_state(ZPLC_WDT_STATE_STOP) != 0) {
      (void)latch_fault_with_mem_lock(ZPLC_SCHED_FAULT_IO);
      return safe_result != 0 ? safe_result : -EIO;
    }
    key = k_spin_lock(&admission_lock);
    core.state = ZPLC_SCHED_STATE_IDLE;
    k_spin_unlock(&admission_lock, key);
#ifdef CONFIG_ZPLC_RETAIN_PERSIST
    retain_active = false;
#endif
    zplc_hal_log("[SCHED] Last task unregistered; outputs safe\n");
    return 0;
  }
  key = k_spin_lock(&admission_lock);
  if (zplc_sched_core_is_running(&core)) {
    int index;

    for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; ++index) {
      if (slots[index].registered != 0U && slots[index].pending != 0U) {
        (void)k_work_submit_to_queue(get_coordinator_workq(),
                                     &coordinator_work);
        break;
      }
    }
  }
  k_spin_unlock(&admission_lock, key);
  zplc_hal_log("[SCHED] Task %d unregistered\n", slots[task_id].task.config.id);
  return 0;
}

static int pause_locked(void) {
  int safe_result;
  struct k_work_sync sync;

  if (mem_lock() != 0) {
    return lock_failure_fault();
  }
  {
    k_spinlock_key_t key = k_spin_lock(&admission_lock);

    if (!zplc_sched_core_is_running(&core)) {
      k_spin_unlock(&admission_lock, key);
      mem_unlock();
      return -1;
    }
    zplc_sched_core_set_paused(&core);
    k_spin_unlock(&admission_lock, key);
  }
  mem_unlock();
  /* RT-017: pause keeps the output image and the force table; only the pins go safe, with the lock released. */
  safe_result = drive_safe_pins();
  stop_all_task_timers();
  (void)k_work_cancel_sync(&coordinator_work, &sync);
  if (safe_result != 0) {
    (void)latch_fault_with_mem_lock(ZPLC_SCHED_FAULT_IO);
  } else if (watchdog_apply_state(ZPLC_WDT_STATE_PAUSED) != 0) {
    (void)latch_fault_with_mem_lock(ZPLC_SCHED_FAULT_IO);
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
  if (core.state != ZPLC_SCHED_STATE_UNINIT) {
    return -1; /* Already initialized */
  }

  /* Initialize mutexes; a scheduler without them cannot run (RT-030). */
  if (k_mutex_init(&mem_mutex) != 0 || k_mutex_init(&control_mutex) != 0 ||
      k_mutex_init(&io_mutex) != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }

  /* The work queue threads are started once and keep running across
   * shutdown and init: they use static stacks and static queue objects, and
   * starting them again would re-create a live thread over its own stack and
   * thread object. */
  if (!workqueues_started) {
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
    workqueues_started = true;
  }

  k_work_init(&coordinator_work, coordinator_work_handler);
  k_work_init_delayable(&keepalive_work, keepalive_handler);
  keepalive_running = false;
  hardware_watchdog_channel = -1;
  clock_base = scheduler_stamp_now();
#ifdef CONFIG_ZTEST
  k_sem_init(&test_before_commit_entered, 0U, 1U);
  k_sem_init(&test_before_commit_release, 0U, 1U);
  test_hold_before_commit = 0U;
  k_sem_init(&test_output_write_entered, 0U, 1U);
  k_sem_init(&test_output_write_release, 0U, 1U);
  test_hold_output_write = 0U;
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
  test_clock_us = NULL;
  k_timer_init(&test_watchdog_timer, test_watchdog_expired, NULL);
  test_watchdog_expired_count = 0U;
  test_watchdog_timeout_ms = 0U;
  test_watchdog_policy_set = 0U;
  test_lock_failure = 0;
  test_lock_failure_kind = 0U;
#endif

  /* Initialize shared memory */
  zplc_mem_init();

  /* The exchange between the scan and the threads outside it: a write queue applied at the input latch and a
   * snapshot published at the commit (RT-010, RT-011). */
  {
    const zplc_exchange_hooks_t exchange_hooks = {
        .lock_image = exchange_lock_image,
        .unlock_image = exchange_unlock_image,
        .scan_active = exchange_scan_active,
    };

    if (zplc_exchange_init(&exchange_hooks) != 0) {
      return ZPLC_SCHED_ERR_LOCK;
    }
  }

#ifdef CONFIG_ZPLC_RETAIN_PERSIST
  {
    zplc_retain_config_t retain_config = {0};

    retain_active = false;
    k_work_init_delayable(&retain_work, retain_work_handler);
    retain_config.region = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
    retain_config.region_size = ZPLC_MEM_RETAIN_SIZE;
    retain_config.lock = retain_lock;
    retain_config.unlock = retain_unlock;
    retain_config.min_interval_ms =
        (uint32_t)CONFIG_ZPLC_RETAIN_SAVE_INTERVAL_S * 1000U;
    (void)zplc_retain_init(&retain_config);
  }
#endif

  /* Clear the task table; the state becomes IDLE: the scheduler is initialized. */
  memset(vms, 0, sizeof(vms));
  zplc_sched_core_init(&core, slots, CONFIG_ZPLC_MAX_TASKS, ZPLC_DEADLINE_MISS_LIMIT);

  zplc_hal_log("[SCHED] Scheduler initialized\n");

  return 0;
}

int zplc_sched_shutdown(void) {
  int index;
  int result;

  if (core.state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue()) {
    return -1;
  }
  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  result = stop_locked();
  if (result != 0) {
    control_unlock();
    return result;
  }
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    if (slots[index].registered) {
      (void)unregister_task_locked(index);
    }
  }
  /* A scheduler that is gone cannot feed: whatever the policy of STOP says, the watchdog stops. */
  (void)watchdog_force_disarm();
  core.state = ZPLC_SCHED_STATE_UNINIT;
#ifdef CONFIG_ZPLC_RETAIN_PERSIST
  {
    struct k_work_sync retain_sync;

    /* The handler only try-locks the control plane, so waiting for it here
     * cannot deadlock; init re-initialises the work item afterwards. */
    retain_active = false;
    (void)k_work_cancel_delayable_sync(&retain_work, &retain_sync);
  }
#endif
  control_unlock();

  zplc_hal_log("[SCHED] Scheduler shutdown\n");

  return 0;
}

int zplc_sched_register_task(const zplc_task_def_t *def, const uint8_t *code,
                             size_t code_size) {
  int slot = -1;
  uint32_t total_code_size;

  if (core.state == ZPLC_SCHED_STATE_UNINIT) {
    return -1;
  }

  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }

  if (def == NULL || code != NULL || code_size != 0U ||
      core.state != ZPLC_SCHED_STATE_IDLE) {
    control_unlock();
    return -2;
  }

  if (core.count >= CONFIG_ZPLC_MAX_TASKS) {
    control_unlock();
    return -3; /* No slots available */
  }

  /* Validate task configuration before materializing scheduler state. */
  if (def->type != ZPLC_TASK_CYCLIC ||
      def->interval_us < ZPLC_MIN_INTERVAL_US ||
      def->interval_us > ZPLC_MAX_INTERVAL_US ||
      def->interval_us % 1000U != 0U || def->stack_size == 0U ||
      def->stack_size > ZPLC_STACK_MAX_DEPTH) {
    control_unlock();
    return -4;
  }

  /* Find free slot */
  slot = zplc_sched_core_free_slot(&core);
  if (slot < 0) {
    control_unlock();
    return -3;
  }

  total_code_size = zplc_mem_get_code_size();
  if (total_code_size == 0U || def->entry_point >= total_code_size) {
    control_unlock();
    return -2;
  }
  {
    zplc_vm_t *vm = &vms[slot];
    k_spinlock_key_t key;

    zplc_vm_init(vm);
    if (zplc_vm_set_entry(vm, def->entry_point,
                          total_code_size - def->entry_point) != 0) {
      control_unlock();
      return -2;
    }
    vm->task_id = def->id;
    vm->priority = def->priority;
    vm->stack_limit = def->stack_size;

    /* Initialize timer (but don't start yet) */
    k_timer_init(&timers[slot], task_timer_handler, NULL);

    key = k_spin_lock(&admission_lock);
    (void)zplc_sched_core_add_task(&core, def, vm);
    slots[slot].task.code =
        zplc_mem_get_code(def->entry_point, total_code_size - def->entry_point);
    slots[slot].task.code_size = total_code_size - def->entry_point;
    k_spin_unlock(&admission_lock, key);
  }

  zplc_hal_log("[SCHED] Task %d registered: interval=%u us, priority=%d\n",
               def->id, def->interval_us, def->priority);

  control_unlock();
  return slot;
}

int zplc_sched_validate_program(const uint8_t *binary, size_t size) {
  int result;

  if (core.state == ZPLC_SCHED_STATE_UNINIT) {
    return ZPLC_LOADER_ERR_SIZE;
  }
  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  result = validate_program_locked(binary, size);
  control_unlock();
  return result;
}

int zplc_sched_load(const uint8_t *binary, size_t size) {
  zplc_task_def_t defs[CONFIG_ZPLC_MAX_TASKS];
  uint8_t *workspace;
  int count;
  uint32_t total_code_size;
  k_spinlock_key_t key;

  if (core.state == ZPLC_SCHED_STATE_UNINIT) {
    return -1;
  }

  if (binary == NULL || size == 0) {
    return -2;
  }

  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }

  if ((core.state != ZPLC_SCHED_STATE_IDLE &&
       core.state != ZPLC_SCHED_STATE_ERROR) ||
      !scheduler_slots_empty()) {
    control_unlock();
    return -4;
  }

  if (validate_program_locked(binary, size) != ZPLC_LOADER_OK) {
    control_unlock();
    return -3;
  }

  /* Validation above makes this one core commit and task materialization safe. The commit is a cold start of the
   * variable memory (RT-016), so it is made under the image lock, with no external writer in the middle of it. */
  if (mem_lock() != 0) {
    control_unlock();
    return ZPLC_SCHED_ERR_LOCK;
  }
  workspace = zplc_verify_scratch_take();
  if (workspace == NULL) {
    mem_unlock();
    control_unlock();
    return ZPLC_SCHED_ERR_LOCK;
  }
  count = zplc_core_load_tasks(binary, size, defs, CONFIG_ZPLC_MAX_TASKS,
                               workspace, ZPLC_LOADER_VERIFY_WORKSPACE_SIZE);
  zplc_verify_scratch_give();
  mem_unlock();
  if (count < 0) {
    zplc_hal_log("[SCHED] Failed to parse .zplc file: %d\n", count);
    control_unlock();
    return -3;
  }
  if (core.state == ZPLC_SCHED_STATE_ERROR && count == 0) {
    control_unlock();
    return -3;
  }

  /* Get total code size (loaded by zplc_core_load_tasks) */
  total_code_size = zplc_mem_get_code_size();

  zplc_hal_log("[SCHED] Loading %d tasks (code size: %u bytes)\n", count,
               total_code_size);

  /* Every descriptor was validated before the core commit. */
  for (int i = 0; i < count; i++) {
    const zplc_task_def_t *def = &defs[i];
    zplc_vm_t *vm = &vms[i];

    /* Initialize VM with entry point */
    zplc_vm_init(vm);
    (void)zplc_vm_set_entry(vm, def->entry_point,
                            total_code_size - def->entry_point);
    vm->task_id = def->id;
    vm->priority = def->priority;
    vm->stack_limit = def->stack_size;

    /* Initialize timer (but don't start yet) */
    k_timer_init(&timers[i], task_timer_handler, NULL);

    key = k_spin_lock(&admission_lock);
    (void)zplc_sched_core_add_task(&core, def, vm);
    /* Point to code in shared segment (already loaded) */
    slots[i].task.code =
        zplc_mem_get_code(def->entry_point, total_code_size - def->entry_point);
    slots[i].task.code_size = total_code_size - def->entry_point;
    k_spin_unlock(&admission_lock, key);

    zplc_hal_log(
        "[SCHED] Task %d loaded: entry=%u, interval=%u us, priority=%d\n",
        def->id, def->entry_point, def->interval_us, def->priority);
  }

  /* A successful, fully materialized replacement is the only recovery path. */
  key = k_spin_lock(&admission_lock);
  zplc_sched_core_reset_counters(&core);
  core.state = ZPLC_SCHED_STATE_IDLE;
  k_spin_unlock(&admission_lock, key);

#ifdef CONFIG_ZPLC_RETAIN_PERSIST
  retain_program_loaded(binary, size);
#endif

  /* What a reader of the exchange sees is the new program's initial memory, RETAIN as restored. */
  if (mem_lock() == 0) {
    zplc_exchange_publish();
    mem_unlock();
  }

  /* The safe state of the program that was just committed is in force from here: its declared values (RT-023)
   * are on the pins before the first scan and for as long as the program waits in STOP. A pin that cannot be
   * driven leaves the runtime latched, as at every other place the safe state is established. */
  {
    const int pins_result = drive_safe_pins();

    if (pins_result != 0) {
      (void)latch_fault_with_mem_lock(ZPLC_SCHED_FAULT_IO);
      control_unlock();
      return pins_result;
    }
  }

  control_unlock();
  return count;
}

int zplc_sched_unregister_task(int task_id) {
  int result;

  if (core.state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue()) {
    return -1;
  }
  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  result = unregister_task_locked(task_id);
  control_unlock();
  return result;
}

int zplc_sched_start(void) {
  int started_count = 0;
  int index;
  k_spinlock_key_t key;

  if (core.state == ZPLC_SCHED_STATE_UNINIT) {
    return -1;
  }
  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  if (core.state != ZPLC_SCHED_STATE_IDLE || scheduler_fault_is_latched()) {
    control_unlock();
    return -1;
  }
  if (core.count == 0U) {
    control_unlock();
    return -2;
  }
  /* Arm before RUN/timers. A failed prepare leaves the logical scheduler idle
   * and explicitly re-applies safe outputs; no background feeder exists. */
  if (watchdog_prepare() != 0) {
    int safe_result = apply_safe_outputs_with_mem_lock();

    if (safe_result == 0) {
      (void)watchdog_force_disarm();
    }
    control_unlock();
    return -3;
  }
  if (mem_lock() != 0) {
    control_unlock();
    return lock_failure_fault();
  }
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    if (slots[index].registered != 0U &&
        (slots[index].task.state == ZPLC_TASK_STATE_READY ||
         slots[index].task.state == ZPLC_TASK_STATE_PAUSED)) {
      zplc_vm_reset_cycle(&vms[index]);
      memset(&slots[index].task.stats, 0, sizeof(zplc_task_stats_t));
      k_timer_start(&timers[index],
                    K_MSEC(slots[index].task.config.interval_us / 1000U),
                    K_MSEC(slots[index].task.config.interval_us / 1000U));
      started_count++;
    }
  }
  mem_unlock();
  key = k_spin_lock(&admission_lock);
  if (core.fault_latched != 0U || core.state != ZPLC_SCHED_STATE_IDLE) {
    int safe_result;

    k_spin_unlock(&admission_lock, key);
    stop_all_task_timers();
    safe_result = apply_safe_outputs_with_mem_lock();
    if (safe_result == 0) {
      (void)watchdog_force_disarm();
    }
    control_unlock();
    return -1;
  }
  zplc_sched_core_begin_run(&core);
  (void)zplc_sched_core_set_running(&core);
  k_spin_unlock(&admission_lock, key);

  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    if (slots[index].registered != 0U) {
      zplc_hal_log("[SCHED] Task %d started (interval=%u ms)\n",
                   slots[index].task.config.id,
                   slots[index].task.config.interval_us / 1000U);
    }
  }

  if (started_count > 0 || core.state != ZPLC_SCHED_STATE_RUNNING) {
    zplc_hal_log("[SCHED] Scheduler started with %d tasks\n", core.count);
  }

  control_unlock();
  return 0;
}

/* STOP ends the run: physical outputs safe, output image zeroed, force table
 * cleared and every task back at its entry point, so a scan that a breakpoint
 * interrupted, or that a resume armed, is discarded. A pause keeps all of that
 * except the physical outputs. See "Pause, resume, step and stop" in
 * docs/docs/runtime/scheduler.md. */
int zplc_sched_stop(void) {
  int result;

  if (core.state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue()) {
    return -1;
  }
  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  result = stop_locked();
#ifdef CONFIG_ZPLC_RETAIN_PERSIST
  /* The timers are stopped and the coordinator cancelled: no scan runs, so the
   * region holds the values of the last complete scan. A fault stores nothing. */
  if (retain_active && !scheduler_fault_is_latched()) {
    (void)zplc_retain_save(&retain_identity, k_uptime_get_32(),
                           ZPLC_RETAIN_SAVE_FORCED);
  }
#endif
  control_unlock();
  return result;
}

int zplc_sched_enter_safe_error(void) {
  int safe_result;
  struct k_work_sync sync;

  if (core.state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue()) {
    return -1;
  }

  /* Control-plane ownership is control -> memory -> admission. The
   * coordinator only owns memory -> admission, so it cannot deadlock here. */
  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  safe_result = latch_fault_with_mem_lock(ZPLC_SCHED_FAULT_RUNTIME);
  stop_all_task_timers();
  (void)k_work_cancel_sync(&coordinator_work, &sync);
  control_unlock();
  return safe_result;
}

/* Pause (RT-017): the physical outputs go safe; the output image, the force
 * table and every task's interrupted scan are kept. Returns -1 unless the
 * scheduler is running. */
int zplc_sched_pause(void) {
  int result;

  if (core.state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue()) {
    return -1;
  }
  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  result = pause_locked();
  control_unlock();
  return result;
}

/* Resume (RT-017): a task whose scan stopped at a breakpoint continues that
 * scan at its next release, from the preserved program counter and stacks. The
 * pins are not driven here: the first normal commit does it, from the kept
 * output image with the force table applied. */
int zplc_sched_resume(void) {
  int index;
  k_spinlock_key_t key;

  if (core.state != ZPLC_SCHED_STATE_PAUSED) {
    return -1;
  }
  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  if (core.state != ZPLC_SCHED_STATE_PAUSED || scheduler_fault_is_latched()) {
    control_unlock();
    return -1;
  }
  if (watchdog_prepare() != 0) {
    int safe_result;

    /* The scheduler stays paused: its image and forces stay with it. */
    safe_result = drive_safe_outputs_with_mem_lock();
    if (safe_result == 0) {
      (void)watchdog_force_disarm();
    }
    control_unlock();
    return -2;
  }
  if (mem_lock() != 0) {
    control_unlock();
    return lock_failure_fault();
  }
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    if (slots[index].registered != 0U &&
        slots[index].task.state == ZPLC_TASK_STATE_PAUSED) {
      /* Only a VM that stopped at a breakpoint holds an interrupted scan; one
       * paused between scans must keep its breakpoints armed. */
      if (zplc_vm_is_paused(&vms[index]) != 0) {
        (void)zplc_vm_resume(&vms[index]);
      }
      k_timer_start(&timers[index],
                    K_MSEC(slots[index].task.config.interval_us / 1000U),
                    K_MSEC(slots[index].task.config.interval_us / 1000U));
    }
  }
  mem_unlock();
  key = k_spin_lock(&admission_lock);
  if (core.fault_latched != 0U || core.state != ZPLC_SCHED_STATE_PAUSED) {
    int safe_result;

    k_spin_unlock(&admission_lock, key);
    stop_all_task_timers();
    safe_result = apply_safe_outputs_with_mem_lock();
    if (safe_result == 0) {
      (void)watchdog_force_disarm();
    }
    control_unlock();
    return -1;
  }
  zplc_sched_core_restart_schedule(&core);
  (void)zplc_sched_core_set_running(&core);
  k_spin_unlock(&admission_lock, key);

  control_unlock();
  return 0;
}

/* Step (RT-017): one ordered batch. A task stopped at a breakpoint finishes
 * its scan, any other task runs one whole scan; the batch commits once and the
 * scheduler pauses again with the pins safe and the image and forces kept. */
int zplc_sched_step(void) {
  uint8_t order[CONFIG_ZPLC_MAX_TASKS];
  uint8_t count;
  int result;
  int index;

  if (core.state != ZPLC_SCHED_STATE_PAUSED &&
      core.state != ZPLC_SCHED_STATE_IDLE) {
    return -1;
  }
  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  if (core.state != ZPLC_SCHED_STATE_PAUSED &&
      core.state != ZPLC_SCHED_STATE_IDLE) {
    control_unlock();
    return -1;
  }
  if (scheduler_fault_is_latched()) {
    control_unlock();
    return -1;
  }
  {
    k_spinlock_key_t key = k_spin_lock(&admission_lock);

    if (core.fault_latched != 0U) {
      k_spin_unlock(&admission_lock, key);
      control_unlock();
      return -1;
    }
    count = zplc_sched_core_begin_step(&core, scheduler_now_us(), order,
                                       CONFIG_ZPLC_MAX_TASKS);
    k_spin_unlock(&admission_lock, key);
  }
  if (count == 0U) {
    control_unlock();
    return -2;
  }
  /* A task that is stopped at a breakpoint finishes its scan in this step;
   * one between scans runs a whole scan. Either way the step ends at the next
   * cycle boundary, or at a breakpoint the rest of the scan reaches. */
  if (mem_lock() != 0) {
    control_unlock();
    return lock_failure_fault();
  }
  for (index = 0; index < count; ++index) {
    if (zplc_vm_is_paused(&vms[order[index]]) != 0) {
      (void)zplc_vm_resume(&vms[order[index]]);
    }
  }
  mem_unlock();
  result = execute_batch(order, count, true);
  control_unlock();
  return result < 0 ? result : 0;
}

zplc_sched_state_t zplc_sched_get_state(void) {
  zplc_sched_state_t state;
  k_spinlock_key_t key = k_spin_lock(&admission_lock);
  state = core.state;
  k_spin_unlock(&admission_lock, key);
  return state;
}

int zplc_sched_get_stats(zplc_sched_stats_t *stats) {
  if (stats == NULL) {
    return -1;
  }

  memset(stats, 0, sizeof(zplc_sched_stats_t));
  if (mem_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  {
    k_spinlock_key_t key = k_spin_lock(&admission_lock);
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
      if (!slots[i].registered) {
        continue;
      }
      stats->active_tasks++;
      stats->total_cycles += slots[i].task.stats.cycle_count;
    }
    stats->total_overruns = zplc_sched_core_total_misses(&core);
    stats->consecutive_misses = zplc_sched_core_consecutive_misses(&core);
    stats->miss_limit = core.miss_limit;
    stats->last_overrun_us = core.last_overrun_us;
    stats->fault_reason = core.fault_reason;
    stats->fault_task_id = core.fault_task_id;
    stats->uptime_ms = k_uptime_get_32();
    stats->input_latch_count = core.input_latch_count;
    stats->output_commit_count = core.output_commit_count;
    k_spin_unlock(&admission_lock, key);
  }
  mem_unlock();

  return 0;
}

int zplc_sched_get_task(int task_id, zplc_task_t *task) {
  k_spinlock_key_t key;
  if (task_id < 0 || task_id >= CONFIG_ZPLC_MAX_TASKS) {
    return -1;
  }

  if (task == NULL) {
    return -2;
  }

  if (mem_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
  key = k_spin_lock(&admission_lock);
  if (!slots[task_id].registered) {
    k_spin_unlock(&admission_lock, key);
    mem_unlock();
    return -3;
  }

  memcpy(task, &slots[task_id].task, sizeof(zplc_task_t));
  k_spin_unlock(&admission_lock, key);
  mem_unlock();

  return 0;
}

int zplc_sched_get_task_count(void) {
  int count;
  k_spinlock_key_t key = k_spin_lock(&admission_lock);
  count = core.count;
  k_spin_unlock(&admission_lock, key);
  return count;
}

static int scheduler_debug_lock_task(int task_id, zplc_vm_t **vm) {
  k_spinlock_key_t key;

  if (core.state == ZPLC_SCHED_STATE_UNINIT ||
      scheduler_called_from_workqueue() || task_id < 0 ||
      task_id >= CONFIG_ZPLC_MAX_TASKS) {
    return -1;
  }
  if (control_lock() != 0) {
    return ZPLC_SCHED_ERR_LOCK;
  }
#ifdef CONFIG_ZTEST
  k_sem_give(&test_debug_before_mem_entered);
#endif
  if (mem_lock() != 0) {
    control_unlock();
    return ZPLC_SCHED_ERR_LOCK;
  }
  key = k_spin_lock(&admission_lock);
  if (!slots[task_id].registered) {
    k_spin_unlock(&admission_lock, key);
    mem_unlock();
    control_unlock();
    return -2;
  }
  *vm = &vms[task_id];
  k_spin_unlock(&admission_lock, key);
  return 0;
}

static void scheduler_debug_unlock_task(void) {
  mem_unlock();
  control_unlock();
}

int zplc_sched_debug_snapshot(int task_id, zplc_sched_vm_snapshot_t *snapshot) {
  zplc_vm_t *vm;
  int result;

  if (snapshot == NULL) {
    return -1;
  }
  result = scheduler_debug_lock_task(task_id, &vm);
  if (result != 0) {
    return result;
  }
  snapshot->task_id = slots[task_id].task.config.id;
  snapshot->pc = vm->pc;
  snapshot->sp = vm->sp;
  snapshot->error = vm->error;
  snapshot->halted = vm->halted;
  snapshot->paused = vm->paused;
  snapshot->breakpoint_count = vm->breakpoint_count;
  memcpy(snapshot->breakpoints, vm->breakpoints,
         sizeof(snapshot->breakpoints));
  scheduler_debug_unlock_task();
  return 0;
}

int zplc_sched_debug_add_breakpoint(int task_id, uint16_t pc) {
  zplc_vm_t *vm;
  int result = scheduler_debug_lock_task(task_id, &vm);
  if (result == 0) {
    result = zplc_vm_add_breakpoint(vm, pc);
    scheduler_debug_unlock_task();
  }
  return result;
}

int zplc_sched_debug_remove_breakpoint(int task_id, uint16_t pc) {
  zplc_vm_t *vm;
  int result = scheduler_debug_lock_task(task_id, &vm);
  if (result == 0) {
    result = zplc_vm_remove_breakpoint(vm, pc);
    scheduler_debug_unlock_task();
  }
  return result;
}

int zplc_sched_debug_clear_breakpoints(int task_id) {
  zplc_vm_t *vm;
  int result = scheduler_debug_lock_task(task_id, &vm);
  if (result == 0) {
    result = zplc_vm_clear_breakpoints(vm);
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
