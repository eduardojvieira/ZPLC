/**
 * @file zplc_sched_trace_cases.h
 * @brief One scheduler scenario, and the decisions it must produce, for every runtime (RT-008, RT-018).
 *
 * SPDX-License-Identifier: MIT
 *
 * The Zephyr runtime and the POSIX host runtime are driven with the same task set and the same clock, through
 * their own control surfaces, and the portable scheduler core writes down what it decided: which releases it
 * admitted, in which order a batch ran, how long each task took, which deadlines were missed and when the fault
 * latched. Each runtime's test renders that trace with zplc_trace_render() and compares it, line by line, with
 * ZPLC_TRACE_GOLDEN. Two runtimes that both match the same golden trace decide the same.
 *
 * The tasks have intervals of 100 and 200 ms. The Zephyr test stops the kernel timers of the tasks right after the
 * start, and the whole scenario takes microseconds of real time; 200 ms is also what a hardware watchdog of the test
 * build (1 s, twice the longest interval) admits.
 *
 * The one thing the two runtimes are allowed to differ in is where a deadline is counted from when a host is
 * late for a task; every release of this scenario is dispatched on its grid point, so that choice does not show
 * (docs/docs/runtime/scheduler.md, "What is not identical in simulation").
 */

#ifndef ZPLC_SCHED_TRACE_CASES_H
#define ZPLC_SCHED_TRACE_CASES_H

#include <stdint.h>
#include <stdio.h>

#include <zplc_sched_core.h>

/** @brief The tasks, in the order the host sorts them: priority number, then task id. */
typedef struct {
  uint16_t id;
  uint8_t priority;
  uint32_t interval_ms;
  uint8_t output; /**< the value the task stores in its output byte */
} zplc_trace_task_t;

#define ZPLC_TRACE_TASK_COUNT 3U

static const zplc_trace_task_t ZPLC_TRACE_TASKS[ZPLC_TRACE_TASK_COUNT] = {
    {3U, 0U, 200U, 0x33U},
    {2U, 1U, 100U, 0x22U},
    {1U, 2U, 100U, 0x11U},
};

/** @brief One batch: the instant it is dispatched, the tasks released, and what the clock reads while it runs. */
typedef struct {
  uint32_t at_ms;
  uint8_t due_mask;      /**< bit i: ZPLC_TRACE_TASKS[i] is released */
  uint8_t read_count;    /**< clock reads of the batch: one at its start and one after each task */
  uint32_t read_ms[4];
} zplc_trace_batch_t;

/**
 * Batch 0: every task, in time. Batch 1: the two 100 ms tasks, in time. Batch 2: every task; task 1 ends 130 ms
 * after the batch started, 30 ms late. Batch 3: task 1 is 10 ms late again. Batch 4: task 1 is 20 ms late a third
 * time in a row, and with the limit of three the fault latches.
 */
#define ZPLC_TRACE_BATCH_COUNT 5U

static const zplc_trace_batch_t ZPLC_TRACE_BATCHES[ZPLC_TRACE_BATCH_COUNT] = {
    {0U, 0x7U, 4U, {0U, 30U, 60U, 90U}},
    {100U, 0x6U, 3U, {100U, 140U, 180U, 0U}},
    {200U, 0x7U, 4U, {200U, 220U, 240U, 330U}},
    {300U, 0x6U, 3U, {300U, 310U, 410U, 0U}},
    {400U, 0x7U, 4U, {400U, 410U, 420U, 520U}},
};

/** @brief The decisions, as zplc_trace_render() writes them. Times are microseconds. */
static const char *const ZPLC_TRACE_GOLDEN[] = {
    /* batch 0 */
    "ADMIT t3 0",        "ADMIT t2 0",        "ADMIT t1 0",         "LATCH 1",
    "ORDER t3 0",        "ORDER t2 1",        "ORDER t1 2",
    "TASK t3 30000 0",   "TASK t2 30000 0",   "TASK t1 30000 0",    "COMMIT 1",
    /* batch 1 */
    "ADMIT t2 100000",   "ADMIT t1 100000",   "LATCH 2",
    "ORDER t2 0",        "ORDER t1 1",
    "TASK t2 40000 0",   "TASK t1 40000 0",   "COMMIT 2",
    /* batch 2: task 1 misses by 30 ms */
    "ADMIT t3 200000",   "ADMIT t2 200000",   "ADMIT t1 200000",    "LATCH 3",
    "ORDER t3 0",        "ORDER t2 1",        "ORDER t1 2",
    "TASK t3 20000 0",   "TASK t2 20000 0",   "TASK t1 90000 0",
    "MISS t1 30000 1",   "COMMIT 3",
    /* batch 3: a second miss in a row */
    "ADMIT t2 300000",   "ADMIT t1 300000",   "LATCH 4",
    "ORDER t2 0",        "ORDER t1 1",
    "TASK t2 10000 0",   "TASK t1 100000 0",
    "MISS t1 10000 2",   "COMMIT 4",
    /* batch 4: the third latches the fault, and nothing is committed */
    "ADMIT t3 400000",   "ADMIT t2 400000",   "ADMIT t1 400000",    "LATCH 5",
    "ORDER t3 0",        "ORDER t2 1",        "ORDER t1 2",
    "TASK t3 10000 0",   "TASK t2 10000 0",   "TASK t1 100000 0",
    "MISS t1 20000 3",   "FAULT t1 1",
};

#define ZPLC_TRACE_GOLDEN_COUNT (sizeof(ZPLC_TRACE_GOLDEN) / sizeof(ZPLC_TRACE_GOLDEN[0]))

/** @brief The trace one runtime wrote. */
typedef struct {
  char line[96][40];
  unsigned count;
} zplc_trace_log_t;

/** @brief A sink for zplc_sched_core_set_trace(): ctx is a zplc_trace_log_t. */
static inline void zplc_trace_render(void *ctx, zplc_sched_trace_kind_t kind, uint16_t task_id, uint64_t a,
                                     uint64_t b) {
  zplc_trace_log_t *log = (zplc_trace_log_t *)ctx;
  char *out;

  if (log->count >= sizeof(log->line) / sizeof(log->line[0])) {
    return;
  }
  out = log->line[log->count];
  switch (kind) {
  case ZPLC_SCHED_TRACE_ADMIT:
    /* The release instant only: where the deadline counts from is the one declared difference. */
    (void)snprintf(out, sizeof(log->line[0]), "ADMIT t%u %llu", (unsigned)task_id, (unsigned long long)a);
    break;
  case ZPLC_SCHED_TRACE_COALESCE:
    (void)snprintf(out, sizeof(log->line[0]), "COALESCE t%u", (unsigned)task_id);
    break;
  case ZPLC_SCHED_TRACE_ORDER:
    (void)snprintf(out, sizeof(log->line[0]), "ORDER t%u %llu", (unsigned)task_id, (unsigned long long)a);
    break;
  case ZPLC_SCHED_TRACE_LATCH:
    (void)snprintf(out, sizeof(log->line[0]), "LATCH %llu", (unsigned long long)a);
    break;
  case ZPLC_SCHED_TRACE_TASK:
    (void)snprintf(out, sizeof(log->line[0]), "TASK t%u %llu %llu", (unsigned)task_id, (unsigned long long)a,
                   (unsigned long long)b);
    break;
  case ZPLC_SCHED_TRACE_MISS:
    (void)snprintf(out, sizeof(log->line[0]), "MISS t%u %llu %llu", (unsigned)task_id, (unsigned long long)a,
                   (unsigned long long)b);
    break;
  case ZPLC_SCHED_TRACE_FAULT:
    (void)snprintf(out, sizeof(log->line[0]), "FAULT t%u %llu", (unsigned)task_id, (unsigned long long)a);
    break;
  case ZPLC_SCHED_TRACE_COMMIT:
    (void)snprintf(out, sizeof(log->line[0]), "COMMIT %llu", (unsigned long long)a);
    break;
  case ZPLC_SCHED_TRACE_PAUSE:
    (void)snprintf(out, sizeof(log->line[0]), "PAUSE");
    break;
  default:
    (void)snprintf(out, sizeof(log->line[0]), "?");
    break;
  }
  log->count++;
}

#endif /* ZPLC_SCHED_TRACE_CASES_H */
