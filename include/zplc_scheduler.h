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
 *   - Timer callbacks submit work items to priority-based work queues
 *   - Work queue threads execute the actual PLC program cycles
 *   - Shared memory (IPI/OPI) is protected by a mutex
 */

#ifndef ZPLC_SCHEDULER_H
#define ZPLC_SCHEDULER_H

#include <stdint.h>
#include <stddef.h>
#include <zplc_isa.h>

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

/** @brief Minimum task interval in microseconds (100us) */
#define ZPLC_MIN_INTERVAL_US 100

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
 * @param def Task definition (from .zplc file or manual config)
 * @param code Pointer to bytecode for this task
 * @param code_size Size of bytecode
 * @return Task handle (0-based index) on success, negative error code on failure
 */
int zplc_sched_register_task(const zplc_task_def_t *def,
                              const uint8_t *code,
                              size_t code_size);

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

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_SCHEDULER_H */
