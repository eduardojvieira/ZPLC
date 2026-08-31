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
 *   - Each batch takes one IPI snapshot and performs at most one normal OPI commit
 *   - Shared memory (IPI/OPI) is protected by a mutex
 */

#ifndef ZPLC_SCHEDULER_H
#define ZPLC_SCHEDULER_H

#include <stdint.h>
#include <stddef.h>
#include "zplc_isa.h"
#include "zplc_core.h"
#include "zplc_hal.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * Configuration
 * ============================================================================ */

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
 * ============================================================================ */

/**
 * @brief Task runtime state.
 */
typedef enum {
    ZPLC_TASK_STATE_IDLE = 0,      /**< Not configured */
    ZPLC_TASK_STATE_READY,         /**< Configured, waiting to start */
    ZPLC_TASK_STATE_RUNNING,       /**< Actively executing cycles */
    ZPLC_TASK_STATE_PAUSED,        /**< Paused for debugging */
    ZPLC_TASK_STATE_ERROR          /**< Error occurred */
} zplc_task_state_t;

/**
 * @brief Task runtime statistics.
 */
typedef struct {
    uint32_t cycle_count;          /**< Total cycles executed */
    uint32_t overrun_count;        /**< Number of deadline misses */
    uint32_t last_exec_time_us;    /**< Last execution time in us */
    uint32_t max_exec_time_us;     /**< Maximum execution time seen */
    uint32_t avg_exec_time_us;     /**< Average execution time */
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
 * ============================================================================ */

/**
 * @brief Scheduler runtime state.
 */
typedef enum {
    ZPLC_SCHED_STATE_UNINIT = 0,   /**< Not initialized */
    ZPLC_SCHED_STATE_IDLE,         /**< Initialized but not running */
    ZPLC_SCHED_STATE_RUNNING,      /**< Tasks are executing */
    ZPLC_SCHED_STATE_PAUSED,       /**< All tasks paused */
    ZPLC_SCHED_STATE_ERROR         /**< Error occurred */
} zplc_sched_state_t;

/**
 * @brief Scheduler statistics.
 */
typedef struct {
  uint32_t total_cycles;         /**< Sum of all task cycles */
  uint32_t total_overruns;       /**< Sum of all overruns */
  uint32_t uptime_ms;            /**< Time since start */
  uint8_t active_tasks;          /**< Number of active tasks */
  /** Logical input process-image latches since scheduler initialization. */
  uint32_t input_latch_count;
  /** Logical normal output process-image commits since initialization. */
  uint32_t output_commit_count;
} zplc_sched_stats_t;

/* ============================================================================
 * Scheduler API
 * ============================================================================ */

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
 * @return Task handle (0-based index) on success, negative error code on failure
 */
int zplc_sched_register_task(const zplc_task_def_t *def,
                              const uint8_t *code,
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
 * Stops all tasks but keeps them registered.
 *
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_stop(void);

/**
 * @brief Pause the scheduler (for debugging).
 *
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_pause(void);

/**
 * @brief Resume the scheduler from pause.
 *
 * @return 0 on success, negative error code on failure
 */
int zplc_sched_resume(void);

/**
 * @brief Execute exactly one cycle for each paused/ready task.
 *
 * Used by the debugger when the scheduler is paused. Tasks remain paused after
 * the stepped cycle unless a task enters error state.
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

#ifdef CONFIG_ZTEST
void zplc_sched_test_hold_before_commit(void);
int zplc_sched_test_wait_before_commit(int timeout_ms);
void zplc_sched_test_release_before_commit(void);
void zplc_sched_test_reset_debug_before_mem(void);
int zplc_sched_test_wait_debug_before_mem(int timeout_ms);
void zplc_sched_test_fail_next_output_commit(uint8_t channel,
                                             zplc_hal_result_t result);
uint8_t zplc_sched_test_output_commit_write_count(void);
void zplc_sched_test_fail_next_gpio_read(uint8_t channel,
                                         zplc_hal_result_t result);
#endif

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
 * ============================================================================ */

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

#ifdef CONFIG_ZTEST
/* Test-only seams for portable release and duration arithmetic. */
int zplc_sched_test_release_before(uint64_t left_uptime_ms,
                                   uint32_t left_cycle32, uint8_t left_priority,
                                   uint16_t left_id, uint64_t right_uptime_ms,
                                   uint32_t right_cycle32,
                                   uint8_t right_priority, uint16_t right_id);
uint32_t zplc_sched_test_elapsed_us(uint64_t start_uptime_ms,
                                    uint32_t start_cycle32,
                                    uint64_t end_uptime_ms,
                                    uint32_t end_cycle32);
int zplc_sched_test_deadline_missed(uint64_t release_uptime_ms,
                                    uint32_t release_cycle32,
                                    uint64_t end_uptime_ms,
                                    uint32_t end_cycle32, uint32_t interval_us);
int zplc_sched_test_admit_release(int task_id);
#endif

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_SCHEDULER_H */
