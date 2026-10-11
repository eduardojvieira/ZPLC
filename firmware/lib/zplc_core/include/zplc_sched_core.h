/**
 * @file zplc_sched_core.h
 * @brief The portable scheduler core: task admission, ordering, the phases of a scan, deadline handling, the
 *        fault latch and the safe state, written once (RT-008, RT-018).
 *
 * SPDX-License-Identifier: MIT
 *
 * Three runtimes run PLC tasks: the Zephyr firmware, the POSIX host runtime and the single-task configuration of
 * the firmware. They differ in the mechanism that releases a task (a kernel timer, a polled host clock, a sleep),
 * in how they lock and in what hardware they touch. They do not differ in what a release, an order, a deadline
 * miss or a fault means. That meaning is this file and zplc_sched_core.c, which compile without any Zephyr or POSIX
 * header; each runtime is an adapter that supplies a zplc_sched_port_t.
 *
 * What the core owns:
 *
 *   - admission:      one pending release per task; a release that arrives while the task is pending coalesces;
 *   - ordering:       a batch runs the task released earlier first, then the lower priority number, then the
 *                     lower task id;
 *   - scan phases:    inputs are sampled with no lock, latched under the image lock together with the queued
 *                     external writes, every task of the batch runs, the output image is captured and the
 *                     snapshot published under the image lock, and the physical outputs are written after it
 *                     is released, under the output lock (RT-009, RT-010, RT-012);
 *   - deadlines:      a task misses its deadline when it ends more than its interval after its reference
 *                     instant; a miss raises the warning, is counted and its overrun recorded; the configured
 *                     number of consecutive misses latches the fault (RT-014);
 *   - fault latch:    the first fault is the reason that is kept until a program is loaded;
 *   - safe state:     what happens to the image, the pins and the hardware watchdog when a fault latches, a
 *                     task stops or the runtime pauses (RT-007, RT-017).
 *
 * What an adapter owns: its clock, its locks, the physical I/O, the timers or the poll loop that call
 * zplc_sched_core_admit(), the logging, the persistence and the control plane (load, start, stop, pause).
 *
 * Synchronization: the core has none of its own. Every function documented "critical" must be called with the
 * adapter's state lock held (a spin lock on a target, nothing on a single thread). zplc_sched_core_scan() takes
 * that lock itself through the port, and never holds it across a callback that can block.
 */

#ifndef ZPLC_SCHED_CORE_H
#define ZPLC_SCHED_CORE_H

#include <stddef.h>
#include <stdint.h>

#include "zplc_core.h"
#include "zplc_hal.h"
#include "zplc_isa.h"
#include "zplc_scheduler.h"

#ifdef __cplusplus
extern "C" {
#endif

/** @brief The most task slots a core can drive (the loader admits at most this many tasks). */
#define ZPLC_SCHED_CORE_MAX_SLOTS 16U

/**
 * @brief Consecutive deadline misses of one task that latch the fault, unless the profile says otherwise.
 *
 * One late activation is a warning and a count, not a stopped machine (RT-014). A task that is late three times
 * in a row has a scan that does not fit its interval, and the fault latches. This is a design default; the
 * Zephyr option CONFIG_ZPLC_DEADLINE_MISS_LIMIT and the host variable ZPLC_DEADLINE_MISS_LIMIT change it.
 */
#define ZPLC_SCHED_DEFAULT_MISS_LIMIT 3U

/** @brief A scan whose task missed its deadline the configured number of times in a row. */
#define ZPLC_SCHED_ERR_DEADLINE (-110)
/** @brief A task returned a VM error. */
#define ZPLC_SCHED_ERR_VM (-111)
/** @brief A physical input, a physical output or the watchdog failed. */
#define ZPLC_SCHED_ERR_IO (-112)

/** @brief Why the runtime latched its fault. The first reason is the one that is kept. */
typedef enum {
  ZPLC_SCHED_FAULT_NONE = 0,
  ZPLC_SCHED_FAULT_DEADLINE_MISS, /**< a task missed its deadline the configured number of times in a row */
  ZPLC_SCHED_FAULT_VM,            /**< a task faulted: a VM error or the instruction budget */
  ZPLC_SCHED_FAULT_IO,            /**< a physical input or output, or the watchdog, failed */
  ZPLC_SCHED_FAULT_LOCK,          /**< a lock the scan needs could not be taken (RT-030) */
  ZPLC_SCHED_FAULT_RUNTIME        /**< any other failure of the runtime */
} zplc_sched_fault_reason_t;

/** @brief The name the status reports for a fault reason ("none", "deadline_miss", "vm_fault", ...). */
const char *zplc_sched_fault_reason_name(zplc_sched_fault_reason_t reason);

/* ============================================================================
 * Trace
 * ============================================================================
 */

/**
 * @brief What the core decided, in the order it decided it.
 *
 * The trace is how two adapters are shown to decide the same: a test drives each with the same task set and the
 * same clock and compares the lines (see tests/include/zplc_sched_trace_cases.h). It costs a null check when no
 * sink is set.
 */
typedef enum {
  ZPLC_SCHED_TRACE_ADMIT = 1, /**< a release was admitted: a = release instant, b = deadline reference (us) */
  ZPLC_SCHED_TRACE_COALESCE,  /**< a release arrived while the task was pending and was merged */
  ZPLC_SCHED_TRACE_ORDER,     /**< position a of the batch is this task */
  ZPLC_SCHED_TRACE_LATCH,     /**< the inputs of the batch were latched: a = number of batches so far */
  ZPLC_SCHED_TRACE_TASK,      /**< a scan part ended: a = duration (us), b = 0 finished, 1 stopped at a breakpoint */
  ZPLC_SCHED_TRACE_MISS,      /**< a deadline miss: a = overrun (us), b = consecutive misses of the task */
  ZPLC_SCHED_TRACE_FAULT,     /**< the fault latched: a = zplc_sched_fault_reason_t */
  ZPLC_SCHED_TRACE_COMMIT,    /**< the outputs were written: a = commits so far */
  ZPLC_SCHED_TRACE_PAUSE      /**< the batch ended at a breakpoint or a step: the runtime paused */
} zplc_sched_trace_kind_t;

typedef void (*zplc_sched_trace_fn)(void *ctx, zplc_sched_trace_kind_t kind, uint16_t task_id, uint64_t a,
                                    uint64_t b);

/* ============================================================================
 * Port: what an adapter supplies
 * ============================================================================
 */

/** @brief Points at which a test may look at, or steer, a scan. A product adapter leaves the probe NULL. */
typedef enum {
  ZPLC_SCHED_PROBE_BEFORE_COMMIT = 1,       /**< tasks ran, the outputs are not captured yet (image lock held) */
  ZPLC_SCHED_PROBE_BEFORE_OUTPUT_WRITE = 2, /**< the pins are about to be written (image lock released) */
  ZPLC_SCHED_PROBE_FORCE_MISS = 3           /**< return non-zero to make this scan part miss its deadline */
} zplc_sched_probe_t;

/**
 * @brief The services of the platform. Every member is optional except now_us; an absent callback is a step the
 *        platform does not have (the host runtime has no pins, a single thread has no locks).
 */
typedef struct zplc_sched_port {
  void *ctx; /**< passed to every callback */

  /** Monotonic time in microseconds. It is read twice per task part: before it runs and after. */
  uint64_t (*now_us)(void *ctx);

  /** The critical section of the core's own state. Returns a key that leave() gets back. */
  unsigned int (*enter)(void *ctx);
  void (*leave)(void *ctx, unsigned int key);

  /** The process-image lock. A lock that cannot be taken is a fault, not a retry (RT-030). 0 when held. */
  int (*lock_image)(void *ctx);
  void (*unlock_image)(void *ctx);
  /** The lock of the output I/O: held while the pins are written and the watchdog is fed. 0 when held. */
  int (*lock_io)(void *ctx);
  void (*unlock_io)(void *ctx);

  /** Phase 1, no lock held: read the physical inputs into the adapter's buffer. 0 or a failure. */
  int (*sample_inputs)(void *ctx);
  /** Phase 2, image lock held: apply the queued external writes, then the sampled inputs, to the image. */
  void (*latch_inputs)(void *ctx);
  /** Phase 2, image lock held: copy the output image, forces applied, into the adapter's buffer. */
  void (*capture_outputs)(void *ctx);
  /** Phase 2, image lock held: publish the image as the snapshot other threads read (RT-010). */
  void (*publish)(void *ctx);
  /** Phase 3, output lock held, image lock released: write the captured outputs to the pins. 0 or a failure. */
  int (*write_outputs)(void *ctx);
  /** Phase 3, output lock held, only after a successful write of a running scan: feed the watchdog. */
  int (*feed_watchdog)(void *ctx);

  /** Safe state: zero the output image, clear the forces and publish. Image lock held. 0 or a failure. */
  int (*reset_image)(void *ctx);
  /** Safe state: drive every physical output to its safe level. Takes the output lock itself. 0 or a failure. */
  int (*drive_safe_pins)(void *ctx);
  /** Safe state: stop the hardware watchdog, when the profile says it is stopped. 0 or a failure. */
  int (*disarm_watchdog)(void *ctx);
  /** Stop the platform's release mechanism (the kernel timers). Called once the fault is latched. */
  void (*stop_releases)(void *ctx);

  /** A test hook; see zplc_sched_probe_t. */
  int (*probe)(void *ctx, zplc_sched_probe_t point, uint16_t task_id);
} zplc_sched_port_t;

/* ============================================================================
 * Core state
 * ============================================================================
 */

/** @brief One task as the core sees it. The VM belongs to the adapter; the core runs it. */
typedef struct {
  zplc_task_t task;                /**< configuration, state and statistics (the public view) */
  zplc_vm_t *vm;                   /**< the task's VM */
  uint64_t release_us;             /**< when the pending release happened: the order key */
  uint64_t deadline_ref_us;        /**< the instant the deadline is counted from */
  uint32_t consecutive_misses;     /**< deadline misses since the last scan that was in time */
  uint8_t registered;              /**< the slot holds a task */
  uint8_t pending;                 /**< a release is admitted and not yet run */
  uint8_t first_scan_interrupted;  /**< a breakpoint stopped the task's first scan: its rest is still the first */
} zplc_sched_slot_t;

typedef struct {
  zplc_sched_slot_t *slot;         /**< the adapter's array */
  uint8_t capacity;                /**< entries of slot */
  uint8_t count;                   /**< registered tasks */
  uint8_t keep_halted_vm;          /**< leave a VM that ended its scan halted, for a debugger to read */
  uint8_t fault_latched;           /**< a fault is latched: no scan runs until a program is loaded */
  uint8_t fault_reason;            /**< zplc_sched_fault_reason_t of the first fault */
  uint16_t fault_task_id;          /**< the task the first fault belongs to */
  zplc_sched_state_t state;        /**< what the runtime is doing */
  uint32_t miss_limit;             /**< consecutive misses of a task that latch the fault, at least one */
  uint32_t last_overrun_us;        /**< how far past its deadline the last late task ended */
  uint32_t batch_count;            /**< batches whose inputs were latched */
  uint32_t input_latch_count;      /**< logical input latches since init */
  uint32_t output_commit_count;    /**< logical output commits since init */
  zplc_sched_trace_fn trace;
  void *trace_ctx;
} zplc_sched_core_t;

/** @brief What a scan has to say: kept while the image lock is held and printed after it is released. */
typedef struct {
  int error_task;    /**< a task returned an error; -1 when none */
  int error_code;
  int paused_task;   /**< a task stopped at a breakpoint; -1 when none */
  unsigned paused_pc;
  int deadline_task; /**< a task latched the fault by missing its deadline; -1 when none */
  int warning_task;  /**< a task missed a deadline below the limit; -1 when none */
  uint8_t faulted;   /**< the scan latched the fault */
  uint8_t paused;    /**< the runtime paused at the end of the scan (a breakpoint or a step) */
  uint8_t committed; /**< the outputs were written */
} zplc_sched_scan_report_t;

/* ============================================================================
 * Table (critical)
 * ============================================================================
 */

/**
 * @brief Prepare a core over the adapter's slot array. Every slot is cleared; the state is IDLE.
 * @param miss_limit consecutive misses that latch the fault; 0 selects ZPLC_SCHED_DEFAULT_MISS_LIMIT.
 */
void zplc_sched_core_init(zplc_sched_core_t *core, zplc_sched_slot_t *slots, uint8_t capacity, uint32_t miss_limit);

/** @brief Install or remove the trace sink. */
void zplc_sched_core_set_trace(zplc_sched_core_t *core, zplc_sched_trace_fn trace, void *ctx);

/**
 * @brief Register a task in the first free slot. The slot is cleared first; its state is READY.
 * @return the slot index, or -1 when every slot is taken
 */
int zplc_sched_core_add_task(zplc_sched_core_t *core, const zplc_task_def_t *def, zplc_vm_t *vm);

/** @brief Free a slot. @return 0, or -1 when the slot is not registered */
int zplc_sched_core_remove_task(zplc_sched_core_t *core, int slot);

/* ============================================================================
 * Admission and order (critical)
 * ============================================================================
 */

/**
 * @brief Admit a release of a task.
 *
 * @param release_us      the instant the release happened; tasks of one batch are ordered by it
 * @param deadline_ref_us the instant the deadline of this scan is counted from. A target stamps the release in the
 *                        timer callback and passes it twice; the host stamps the instant it dispatches the batch.
 * @return 1 when the release was admitted, 0 when it was refused (a fault is latched, the task is not running)
 *         or merged into the release that is already pending
 */
int zplc_sched_core_admit(zplc_sched_core_t *core, int slot, uint64_t release_us, uint64_t deadline_ref_us);

/**
 * @brief The pending tasks of a running core, in the order they run.
 * @return the number of slots written to @p order
 */
uint8_t zplc_sched_core_collect(const zplc_sched_core_t *core, uint8_t *order, uint8_t capacity);

/**
 * @brief True when task @p a runs before task @p b: released earlier, then lower priority number, then lower id.
 */
int zplc_sched_core_before(const zplc_sched_slot_t *a, const zplc_sched_slot_t *b);

/** @brief Sort @p order (slot indices) by zplc_sched_core_before(). A stable insertion sort. */
void zplc_sched_core_sort(const zplc_sched_core_t *core, uint8_t *order, uint8_t count);

/* ============================================================================
 * Scan
 * ============================================================================
 */

/**
 * @brief Run one batch: the phases of a scan in the order that RT-009, RT-010 and RT-012 fix.
 *
 * Does nothing (returns 0) when the core is not RUNNING or has latched a fault. A single-step scan
 * (@p step_mode) does no deadline accounting and ends paused (RT-017).
 *
 * On a fault the image is reset under the lock, the pins are driven safe after it is released, the watchdog is
 * handled by the profile's policy and the fault is latched; the port's stop_releases() is called.
 *
 * @return 0, or the first failure: ZPLC_SCHED_ERR_DEADLINE, the VM error of a task (negative),
 *         ZPLC_SCHED_ERR_IO, or ZPLC_SCHED_ERR_LOCK when the image lock could not be taken
 */
int zplc_sched_core_scan(zplc_sched_core_t *core, const zplc_sched_port_t *port, const uint8_t *order,
                         uint8_t count, int step_mode, zplc_sched_scan_report_t *report);

/* ============================================================================
 * Fault latch and safe state
 * ============================================================================
 */

/** @brief The outcome of putting the outputs in their safe state. */
typedef struct {
  int safe_result;      /**< the image's failure, else the pins', else 0 */
  int watchdog_result;  /**< the disarm's failure; 0 when it was not attempted */
} zplc_sched_safe_result_t;

/**
 * @brief Latch the fault and reset the output image. The image lock is held by the caller (a scan in progress).
 * @return the failure of the image reset, or 0. The pins are the caller's next step: zplc_sched_core_settle().
 */
int zplc_sched_core_latch_fault_image(zplc_sched_core_t *core, const zplc_sched_port_t *port,
                                      zplc_sched_fault_reason_t reason, uint16_t task_id);

/**
 * @brief The pins and the watchdog after the image was reset. No lock held.
 * @param image_result what zplc_sched_core_latch_fault_image() or the image reset returned
 */
zplc_sched_safe_result_t zplc_sched_core_settle(const zplc_sched_core_t *core, const zplc_sched_port_t *port,
                                                int image_result);

/**
 * @brief Latch the fault from the control plane: take the image lock, latch, reset the image, release it, then
 *        settle the pins and the watchdog.
 * @return the first failure of the safe state, or ZPLC_SCHED_ERR_LOCK when the lock failed (the pins were still
 *         driven safe)
 */
int zplc_sched_core_fault(zplc_sched_core_t *core, const zplc_sched_port_t *port, zplc_sched_fault_reason_t reason,
                          uint16_t task_id);

/**
 * @brief The image lock could not be taken, so the image cannot be touched coherently: latch the fault, stop
 *        the releases and put the pins in their safe state without it.
 * @return ZPLC_SCHED_ERR_LOCK
 */
int zplc_sched_core_lock_failure(zplc_sched_core_t *core, const zplc_sched_port_t *port);

/**
 * @brief The safe state of a STOP or of the removal of the last task: reset the image under the lock, drive the
 *        pins after it is released, and latch the fault when that failed.
 * @return 0 only when the outputs are safe
 */
int zplc_sched_core_apply_safe_outputs(zplc_sched_core_t *core, const zplc_sched_port_t *port);

/**
 * @brief The safe state of a pause: the pins only; the image and the forces stay (RT-017). Latches the fault
 *        when the pins could not be driven.
 * @return 0 only when the outputs are safe
 */
int zplc_sched_core_drive_safe_outputs(zplc_sched_core_t *core, const zplc_sched_port_t *port);

/* ============================================================================
 * State transitions (critical)
 * ============================================================================
 */

/** @brief True while a scan may run: the state is RUNNING and no fault is latched. */
int zplc_sched_core_is_running(const zplc_sched_core_t *core);

/**
 * @brief Start or resume: every READY or PAUSED task runs, with no release pending, and the state is RUNNING.
 * @return the number of tasks moved
 */
uint8_t zplc_sched_core_set_running(zplc_sched_core_t *core);

/** @brief Pause: running tasks are PAUSED, releases are dropped, the state is PAUSED. Image and forces stay. */
void zplc_sched_core_set_paused(zplc_sched_core_t *core);

/**
 * @brief Stop: tasks are READY again with no release pending, the state is IDLE. A latched fault stays latched,
 *        with its tasks in ERROR, so that what it reports stays readable until a program is loaded.
 */
void zplc_sched_core_set_stopped(zplc_sched_core_t *core);

/**
 * @brief A manual step: every READY or PAUSED task is released now, in one batch, and the state is RUNNING.
 * @return the number of tasks written to @p order, in the order they run; 0 when none is ready or a fault is
 *         latched
 */
uint8_t zplc_sched_core_begin_step(zplc_sched_core_t *core, uint64_t release_us, uint8_t *order, uint8_t capacity);

/** @brief Misses of every registered task, saturating. */
uint32_t zplc_sched_core_total_misses(const zplc_sched_core_t *core);

/** @brief The longest run of consecutive misses that is still going on. */
uint32_t zplc_sched_core_consecutive_misses(const zplc_sched_core_t *core);

/** @brief Forget the misses, the run of misses, the last overrun and the fault: a program is (re)loaded. */
void zplc_sched_core_reset_counters(zplc_sched_core_t *core);

/** @brief A start or a resume begins a new run of the schedule: a run of misses does not carry over. */
void zplc_sched_core_restart_schedule(zplc_sched_core_t *core);

/**
 * @brief How far past its deadline a scan ended: 0 when it ended in time. The deadline is the interval after the
 *        reference instant, and ending exactly on it is in time.
 */
uint64_t zplc_sched_core_overrun_us(uint64_t ref_us, uint64_t end_us, uint32_t interval_us);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_SCHED_CORE_H */
