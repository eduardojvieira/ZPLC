/**
 * @file zplc_single_task.h
 * @brief The single-task configuration of the scheduler core (RT-018).
 *
 * SPDX-License-Identifier: MIT
 *
 * A firmware built without the multitask scheduler runs one program on the default VM of the core, from a loop
 * that releases it once per interval. That loop used to have a scan of its own: no input latch, no deadline
 * check, and the outputs written from the middle of the loop. It now runs on the same core as the multitask
 * scheduler, as a core with one task: the same phases, the same input latch, the same deadline accounting and the
 * same fault latch and safe state.
 *
 * What the caller keeps: the release of the task (its own sleep until the next interval), the lock around a scan
 * (the single-task runtime holds its runtime lock for the whole scan, so the image lock of the core is not
 * needed here) and its own run states.
 */

#ifndef ZPLC_SINGLE_TASK_H
#define ZPLC_SINGLE_TASK_H

#include <stdint.h>

#include "zplc_sched_core.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  zplc_sched_slot_t slot[1];
  zplc_sched_core_t core;
  zplc_io_samples_t samples;
  zplc_io_outputs_t outputs;
  /** A clock a test supplies after init, in microseconds; NULL is the HAL tick in whole milliseconds. */
  uint64_t (*clock_us)(void);
} zplc_single_task_t;

/**
 * @brief Prepare the one-task configuration over the default VM of the core.
 * @param interval_ms the task's interval, in whole milliseconds, at least 1
 * @param miss_limit  consecutive deadline misses that latch the fault; 0 selects ZPLC_SCHED_DEFAULT_MISS_LIMIT
 */
void zplc_single_task_init(zplc_single_task_t *single, uint32_t interval_ms, uint32_t miss_limit);

/** @brief The interval of the task changed (a program with another scan interval was loaded). */
void zplc_single_task_set_interval(zplc_single_task_t *single, uint32_t interval_ms);

/** @brief A start: the next scan is the first one, and a run of misses does not carry over. */
void zplc_single_task_begin(zplc_single_task_t *single);

/** @brief A load or a reset: the misses, the run of them and a latched fault are forgotten. */
void zplc_single_task_clear(zplc_single_task_t *single);

/**
 * @brief One scan of the task: the inputs are sampled and latched, the program runs, the outputs are captured
 *        and written (RT-009). A step (@p step_mode) has no deadline and ends paused, with the pins safe (RT-017).
 *
 * The caller holds its runtime lock. On a VM fault, a failed input or output, or the miss limit, the image is
 * reset and the pins are driven safe before this returns, and the result is negative.
 *
 * @param report what happened (breakpoint, committed, warning); may be NULL
 * @return 0, or the first failure
 */
int zplc_single_task_scan(zplc_single_task_t *single, int step_mode, zplc_sched_scan_report_t *report);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_SINGLE_TASK_H */
