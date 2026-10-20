/**
 * @file zplc_scheduler_freertos.h
 * @brief The FreeRTOS adapter of the portable scheduler core (zplc_sched_core).
 *
 * SPDX-License-Identifier: MIT
 *
 * What the adapter owns, and what the core owns:
 *
 *   core     admission, the order of a batch, the phases of a scan, deadline accounting, the fault latch and the safe
 *            state (RT-008 to RT-020). The adapter does not decide any of it.
 *   adapter  the release of a task (one auto-reload software timer of the kernel for each task), the thread that runs
 *            a batch (one FreeRTOS task, woken by a task notification), the locks (kernel mutexes, a critical section
 *            for the core's own state) and the clock in microseconds.
 *
 * A timer callback stamps the release, asks the core to admit it and wakes the scheduler task. The scheduler task
 * collects the tasks that are pending, in the order the core fixes, and runs one scan. A release that arrives while
 * its task is still pending is merged by the core, never queued twice.
 *
 * One scheduler per process: the state is static, as on the Zephyr port. This header is the port's own; it is not part
 * of the public interface of the core (include/).
 */

#ifndef ZPLC_SCHEDULER_FREERTOS_H
#define ZPLC_SCHEDULER_FREERTOS_H

#include <stddef.h>
#include <stdint.h>

#include <zplc_scheduler.h>
#include <zplc_sched_core.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Create the locks and the scheduler task. The HAL must be initialised and the kernel running.
 * @return 0, ZPLC_SCHED_ERR_LOCK when a lock or the task cannot be created, or -1 when already initialised
 */
int zplc_fr_sched_init(void);

/** @brief Stop the scheduler, delete its task and locks. The state is UNINIT again. */
void zplc_fr_sched_shutdown(void);

/**
 * @brief Verify and load a program with tasks, and register one task of the core for each task definition.
 * @return the number of tasks, or a negative ZPLC_LOADER_* code. A program that is refused changes nothing.
 */
int zplc_fr_sched_load(const uint8_t *binary, size_t size);

/** @brief Start the run: every task is released at its interval from now. 0, or negative when it cannot start. */
int zplc_fr_sched_start(void);

/** @brief Stop the run: no release is pending, the outputs are in their safe state. A latched fault stays latched. */
int zplc_fr_sched_stop(void);

/** @brief What the runtime is doing. */
zplc_sched_state_t zplc_fr_sched_state(void);

/** @brief A copy of the task in a slot of the core, with its statistics. 0, or -1 for a slot that holds no task. */
int zplc_fr_sched_get_task(int slot, zplc_task_t *task);

/** @brief The core the adapter drives: for a test to read its counters and install a trace sink. */
zplc_sched_core_t *zplc_fr_sched_core(void);

/** @brief The reason and the task of the first fault of the run, kept in RAM (RT-020). 0 when a fault is latched. */
int zplc_fr_sched_fault(uint8_t *reason, uint16_t *task_id);

/* ---- test seams (RT-008): the same task set and clock through this adapter and through the host session ---------- */

/** @brief Replace the clock of the scheduler with one the test owns (microseconds); NULL restores it. */
void zplc_fr_sched_test_set_clock(uint64_t (*clock_us)(void));
/** @brief Admit a release of a slot at an instant of the test's clock. 1 admitted, 0 merged or refused, -1 no slot. */
int zplc_fr_sched_test_admit_release_at(int slot, uint64_t release_us);
/** @brief Run the batch that is due, from the calling task, as the scheduler task would. */
int zplc_fr_sched_test_run_batch(void);
/** @brief Stop the timers of the tasks and leave the state as it is: releases then come from the test. */
void zplc_fr_sched_test_stop_timers(void);
/** @brief Make the next @p count scan parts miss their deadline, whatever the clock says. */
void zplc_fr_sched_test_force_deadline_misses(uint32_t count);
/** @brief Release timers that are running. */
uint32_t zplc_fr_sched_test_active_timers(void);
/** @brief Batches the scheduler task ran since init. */
uint32_t zplc_fr_sched_test_batches_run(void);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_SCHEDULER_FREERTOS_H */
