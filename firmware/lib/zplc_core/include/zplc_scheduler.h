/**
 * @file zplc_scheduler.h
 * @brief ZPLC Multitask Scheduler API
 *
 * SPDX-License-Identifier: MIT
 *
 * This header defines the API for the ZPLC multitask scheduler.
 * The scheduler supports multiple PLC tasks with different intervals
 * and priorities, following IEC 61131-3 task model.
 *
 * Architecture (Zephyr implementation):
 *   - Each task has a k_timer that fires at the configured interval
 *   - Timer callbacks admit due task releases without executing PLC code
 *   - One coordinator executes each ordered due-set as a batch
 *   - Each batch takes one IPI snapshot and performs at most one normal OPI
 * commit
 *   - Shared memory (IPI/OPI) is protected by a mutex
 */

#ifndef ZPLC_SCHEDULER_H
#define ZPLC_SCHEDULER_H

#include "zplc_core.h"
#include "zplc_hal.h"
#include "zplc_isa.h"
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * Configuration
 * ============================================================================
 */

/** @brief Maximum number of concurrent tasks */
#ifdef CONFIG_ZPLC_MAX_TASKS
#define ZPLC_MAX_TASKS CONFIG_ZPLC_MAX_TASKS
#else
#define ZPLC_MAX_TASKS 8
#endif

/** @brief Minimum task interval in microseconds (1ms) */
#define ZPLC_MIN_INTERVAL_US 1000

/** @brief Maximum task interval in microseconds (1 hour) */
#define ZPLC_MAX_INTERVAL_US 3600000000UL

/* ============================================================================
 * Task State
 * ============================================================================
 */

/**
 * @brief Task runtime state.
 */
typedef enum {
  ZPLC_TASK_STATE_IDLE = 0, /**< Not configured */
  ZPLC_TASK_STATE_READY,    /**< Configured, waiting to start */
  ZPLC_TASK_STATE_RUNNING,  /**< Actively executing cycles */
  ZPLC_TASK_STATE_PAUSED,   /**< Paused for debugging */
  ZPLC_TASK_STATE_ERROR     /**< Error occurred */
} zplc_task_state_t;

/**
 * @brief Task runtime statistics.
 */
typedef struct {
  uint32_t cycle_count;       /**< Total cycles executed */
  uint32_t overrun_count;     /**< Number of deadline misses */
  uint32_t last_exec_time_us; /**< Last execution time in us */
  uint32_t max_exec_time_us;  /**< Maximum execution time seen */
  uint32_t avg_exec_time_us;  /**< Average execution time */
} zplc_task_stats_t;

/**
 * @brief Task runtime instance.
 *
 * This extends zplc_task_def_t with runtime state.
 * The scheduler maintains an array of these.
 */
typedef struct {
  /* Configuration (from .zplc file) */
  zplc_task_def_t config;

  /* Runtime state */
  zplc_task_state_t state;

  /* Statistics */
  zplc_task_stats_t stats;

  /* Bytecode pointer (within shared code segment) */
  const uint8_t *code;
  size_t code_size;

  /* Platform-specific data (opaque) */
  void *platform_data;
} zplc_task_t;

/* ============================================================================
 * Scheduler State
 * ============================================================================
 */

/**
 * @brief Scheduler runtime state.
 */
typedef enum {
  ZPLC_SCHED_STATE_UNINIT = 0, /**< Not initialized */
  ZPLC_SCHED_STATE_IDLE,       /**< Initialized but not running */
  ZPLC_SCHED_STATE_RUNNING,    /**< Tasks are executing */
  ZPLC_SCHED_STATE_PAUSED,     /**< All tasks paused */
  ZPLC_SCHED_STATE_ERROR       /**< Error occurred */
} zplc_sched_state_t;

/**
 * @brief Scheduler statistics.
 */
typedef struct {
  uint32_t total_cycles;   /**< Sum of all task cycles */
  uint32_t total_overruns; /**< Sum of all overruns */
  uint32_t uptime_ms;      /**< Time since start */
  uint8_t active_tasks;    /**< Number of active tasks */
  /** Logical input process-image latches since scheduler initialization. */
  uint32_t input_latch_count;
  /** Logical normal output process-image commits since initialization. */
  uint32_t output_commit_count;
} zplc_sched_stats_t;

/* ============================================================================
 * Scheduler API
 * ============================================================================
 */

/**
 * @brief Initialize the scheduler.
 *
 * Must be called before any other scheduler functions.
 * Creates work queues and initializes synchronization primitives.
 *
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_init(void);

/**
 * @brief Shutdown the scheduler.
 *
 * Stops all tasks, releases resources.
 *
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_shutdown(void);

/**
 * @brief Register a task with the scheduler.
 *
 * The scheduler accepts only a reference to code already loaded in the core.
 * Raw code buffers are rejected.
 *
 * @param def Task definition (from .zplc file or manual config)
 * @param code Must be NULL
 * @param code_size Must be zero
 * @return Task handle (0-based index) on success, negative error code on
 * failure
 */
int zplc_sched_register_task(const zplc_task_def_t *def, const uint8_t *code,
                             size_t code_size);

/**
 * @brief Validate whether a .zplc program can be admitted by this scheduler.
 *
 * This does not alter scheduler, core, process-image, timer, or persistence
 * state. Only cyclic tasks aligned to the scheduler's millisecond timer are
 * accepted.
 *
 * @return ZPLC_LOADER_OK on success, otherwise a ZPLC_LOADER_* error code.
 */
int zplc_sched_validate_program(const uint8_t *binary, size_t size);

/**
 * @brief Load a multi-task .zplc binary and register all tasks.
 *
 * This is the preferred way to load multi-task PLC programs.
 * It parses the .zplc file, loads the shared code segment, and
 * registers each task defined in the TASK segment.
 *
 * The function internally uses zplc_core_load_tasks() to parse
 * the binary and then configures VMs with appropriate entry points.
 *
 * @note The scheduler must be IDLE with no registered tasks.
 *
 * @param binary Pointer to .zplc file contents
 * @param size Size of binary data
 *
 * @return Number of tasks loaded on success, negative error code on failure:
 *         -1: Scheduler not initialized
 *         -2: Invalid arguments
 *         -3: Program rejected by the verifier or scheduler policy
 *         -4: Scheduler is not empty or not idle
 */
int zplc_sched_load(const uint8_t *binary, size_t size);

/**
 * @brief Unregister a task.
 *
 * @param task_id Task handle returned by register_task
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_unregister_task(int task_id);

/**
 * @brief Start the scheduler.
 *
 * Begins executing all registered tasks according to their intervals.
 *
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_start(void);

/**
 * @brief Stop the scheduler.
 *
 * Stops all tasks but keeps them registered. Unlike a pause, a stop ends the
 * run: the physical outputs go to their safe state, the output process image
 * is zeroed, the force table is cleared, every task is back at its entry point
 * and a scan interrupted by a breakpoint is discarded (RT-017).
 *
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_stop(void);

/**
 * @brief Latch the scheduler in ERROR and de-energize its outputs.
 *
 * For a control-plane failure whose durable outcome is ambiguous. This stops
 * timers and pending work, clears forces and the OPI, and rejects start until
 * a fully validated replacement is loaded into an empty scheduler.
 *
 * @return 0 when safe outputs were applied, otherwise the first HAL error;
 *         the ERROR latch is retained in either case.
 */
int zplc_sched_enter_safe_error(void);

/**
 * @brief Pause the scheduler (for debugging).
 *
 * Pauses between scans: a batch in flight finishes first. The physical outputs
 * are driven to their safe state before the call returns; the output process
 * image and the force table are kept, so a later resume or step continues the
 * program from where it stopped (RT-017).
 *
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_pause(void);

/**
 * @brief Resume the scheduler from pause.
 *
 * Does not drive the pins itself. A scan stopped at a breakpoint continues
 * from its program counter at the next release; a pause between scans starts
 * a new scan. The first normal commit copies the output image, with the force
 * table applied, to the pins.
 *
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_resume(void);

/**
 * @brief Execute exactly one scan for each paused/ready task.
 *
 * Used by the debugger when the scheduler is paused. A scan stopped at a
 * breakpoint is finished; otherwise one whole scan runs. The scan is committed
 * to the pins once and the pins are then driven safe again. The output image
 * and the force table are kept. Tasks remain paused after the stepped cycle
 * unless a task enters error state.
 *
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_step(void);

/**
 * @brief Get scheduler state.
 *
 * @return Current scheduler state
 */
zplc_sched_state_t zplc_sched_get_state(void);

/**
 * @brief Get scheduler statistics.
 *
 * @param stats Pointer to stats structure to fill
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_get_stats(zplc_sched_stats_t *stats);


/**
 * @brief Get task information.
 *
 * @param task_id Task handle
 * @param task Pointer to task structure to fill
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_get_task(int task_id, zplc_task_t *task);

/**
 * @brief Get task count.
 *
 * @return Number of registered tasks
 */
int zplc_sched_get_task_count(void);

/**
 * @brief Copy debugger-visible VM state for a registered task slot.
 *
 * The scheduler retains ownership of VM storage. Callers must use these
 * copy/mutation APIs instead of retaining VM pointers across scheduler work.
 */
typedef struct {
  uint16_t task_id;
  uint16_t pc;
  uint16_t sp;
  int error;
  uint8_t halted;
  uint8_t paused;
  uint8_t breakpoint_count;
  uint16_t breakpoints[ZPLC_MAX_BREAKPOINTS];
} zplc_sched_vm_snapshot_t;

/** @return 0 on success, -1 for invalid state/arguments, -2 for no task. */
int zplc_sched_debug_snapshot(int task_id, zplc_sched_vm_snapshot_t *snapshot);

/** @return 0 on success, or the underlying breakpoint error. */
int zplc_sched_debug_add_breakpoint(int task_id, uint16_t pc);

/** @return 0 on success, or the underlying breakpoint error. */
int zplc_sched_debug_remove_breakpoint(int task_id, uint16_t pc);

/** @return 0 on success, -1 for invalid state/arguments, -2 for no task. */
int zplc_sched_debug_clear_breakpoints(int task_id);

/* ============================================================================
 * Memory Synchronization
 * ============================================================================
 */

/**
 * @brief Lock shared memory for exclusive access.
 *
 * Call this before reading/writing IPI/OPI from outside task context.
 * Must be paired with zplc_sched_unlock().
 *
 * @param timeout_ms Maximum time to wait (-1 = forever, 0 = try)
 * @return 0 on success, -ETIMEDOUT on timeout, other negative on error
 */
int zplc_sched_lock(int timeout_ms);

/**
 * @brief Unlock shared memory.
 *
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_unlock(void);


#ifdef __cplusplus
}
#endif

#endif /* ZPLC_SCHEDULER_H */
