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
  uint8_t due_mask;   /**< bit i: ZPLC_TRACE_TASKS[i] is released */
  uint8_t read_count; /**< clock reads of the batch: one at its start and one after each task */
  uint32_t read_ms[4];
} zplc_trace_batch_t;

/**
 * Batch 0: every task, in time. Batch 1: the two 100 ms tasks, in time. Batch 2: every task; task 1 ends 130 ms
 * after the batch started, 30 ms late. Batch 3: task 1 is 10 ms late again. Batch 4: task 1 is 20 ms late a third
 * time in a row, and with the limit of three the fault latches.
 */
#define ZPLC_TRACE_BATCH_COUNT 5U

static const zplc_trace_batch_t ZPLC_TRACE_BATCHES[ZPLC_TRACE_BATCH_COUNT] = {
    {0U, 0x7U, 4U, {0U, 30U, 60U, 90U}},      {100U, 0x6U, 3U, {100U, 140U, 180U, 0U}},   {200U, 0x7U, 4U, {200U, 220U, 240U, 330U}},
    {300U, 0x6U, 3U, {300U, 310U, 410U, 0U}}, {400U, 0x7U, 4U, {400U, 410U, 420U, 520U}},
};

/** @brief The decisions, as zplc_trace_render() writes them. Times are microseconds. */
static const char *const ZPLC_TRACE_GOLDEN[] = {
    /* batch 0 */
    "ADMIT t3 0",
    "ADMIT t2 0",
    "ADMIT t1 0",
    "LATCH 1",
    "ORDER t3 0",
    "ORDER t2 1",
    "ORDER t1 2",
    "TASK t3 30000 0",
    "TASK t2 30000 0",
    "TASK t1 30000 0",
    "COMMIT 1",
    /* batch 1 */
    "ADMIT t2 100000",
    "ADMIT t1 100000",
    "LATCH 2",
    "ORDER t2 0",
    "ORDER t1 1",
    "TASK t2 40000 0",
    "TASK t1 40000 0",
    "COMMIT 2",
    /* batch 2: task 1 misses by 30 ms */
    "ADMIT t3 200000",
    "ADMIT t2 200000",
    "ADMIT t1 200000",
    "LATCH 3",
    "ORDER t3 0",
    "ORDER t2 1",
    "ORDER t1 2",
    "TASK t3 20000 0",
    "TASK t2 20000 0",
    "TASK t1 90000 0",
    "MISS t1 30000 1",
    "COMMIT 3",
    /* batch 3: a second miss in a row */
    "ADMIT t2 300000",
    "ADMIT t1 300000",
    "LATCH 4",
    "ORDER t2 0",
    "ORDER t1 1",
    "TASK t2 10000 0",
    "TASK t1 100000 0",
    "MISS t1 10000 2",
    "COMMIT 4",
    /* batch 4: the third latches the fault, and nothing is committed */
    "ADMIT t3 400000",
    "ADMIT t2 400000",
    "ADMIT t1 400000",
    "LATCH 5",
    "ORDER t3 0",
    "ORDER t2 1",
    "ORDER t1 2",
    "TASK t3 10000 0",
    "TASK t2 10000 0",
    "TASK t1 100000 0",
    "MISS t1 20000 3",
    "FAULT t1 1",
};

#define ZPLC_TRACE_GOLDEN_COUNT (sizeof(ZPLC_TRACE_GOLDEN) / sizeof(ZPLC_TRACE_GOLDEN[0]))

/*
 * The same decisions for a program of ONE task (RT-018): the single-task configuration of the firmware, the host
 * session with one task and the multitask scheduler with one task are driven through it. The task has id 0, an
 * interval of 100 ms and a body of PUSH8, STORE8 and HALT. A one-interval program is dispatched by a host only
 * once an interval has gone by, so the first batch is at 100 ms.
 *
 * Batch 0, 1 and 3 are in time; 2 is 20 ms late; 4, 5 and 6 are late three times in a row: with a limit of three
 * the fault latches at batch 6.
 */
#define ZPLC_TRACE_ONE_TASK_ID 0U
#define ZPLC_TRACE_ONE_INTERVAL_MS 100U
#define ZPLC_TRACE_ONE_OUTPUT 0x44U
#define ZPLC_TRACE_ONE_BATCH_COUNT 7U

typedef struct {
  uint32_t at_ms;
  uint32_t start_ms; /**< the clock when the batch starts */
  uint32_t end_ms;   /**< the clock when the task ended */
} zplc_trace_one_batch_t;

static const zplc_trace_one_batch_t ZPLC_TRACE_ONE_BATCHES[ZPLC_TRACE_ONE_BATCH_COUNT] = {
    {100U, 100U, 140U}, /* 40 ms: in time */
    {200U, 200U, 290U}, /* 90 ms: in time */
    {300U, 300U, 420U}, /* 120 ms: 20 ms late */
    {400U, 400U, 480U}, /* 80 ms: in time, the run of misses ends */
    {500U, 500U, 620U}, /* 120 ms: 20 ms late */
    {600U, 600U, 730U}, /* 130 ms: 30 ms late, a second in a row */
    {700U, 700U, 850U}, /* 150 ms: 50 ms late, the third in a row */
};

static const char *const ZPLC_TRACE_ONE_GOLDEN[] = {
    "ADMIT t0 100000", "LATCH 1",          "ORDER t0 0",       "TASK t0 40000 0",  "COMMIT 1",        "ADMIT t0 200000", "LATCH 2",
    "ORDER t0 0",      "TASK t0 90000 0",  "COMMIT 2",         "ADMIT t0 300000",  "LATCH 3",         "ORDER t0 0",      "TASK t0 120000 0",
    "MISS t0 20000 1", "COMMIT 3",         "ADMIT t0 400000",  "LATCH 4",          "ORDER t0 0",      "TASK t0 80000 0", "COMMIT 4",
    "ADMIT t0 500000", "LATCH 5",          "ORDER t0 0",       "TASK t0 120000 0", "MISS t0 20000 1", "COMMIT 5",        "ADMIT t0 600000",
    "LATCH 6",         "ORDER t0 0",       "TASK t0 130000 0", "MISS t0 30000 2",  "COMMIT 6",        "ADMIT t0 700000", "LATCH 7",
    "ORDER t0 0",      "TASK t0 150000 0", "MISS t0 50000 3",  "FAULT t0 1",
};

#define ZPLC_TRACE_ONE_GOLDEN_COUNT (sizeof(ZPLC_TRACE_ONE_GOLDEN) / sizeof(ZPLC_TRACE_ONE_GOLDEN[0]))

/** @brief The trace one runtime wrote. */
typedef struct {
  char line[96][40];
  unsigned count;
} zplc_trace_log_t;

/** @brief A sink for zplc_sched_core_set_trace(): ctx is a zplc_trace_log_t. */
static inline void zplc_trace_render(void *ctx, zplc_sched_trace_kind_t kind, uint16_t task_id, uint64_t a, uint64_t b) {
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
    (void)snprintf(out, sizeof(log->line[0]), "TASK t%u %llu %llu", (unsigned)task_id, (unsigned long long)a, (unsigned long long)b);
    break;
  case ZPLC_SCHED_TRACE_MISS:
    (void)snprintf(out, sizeof(log->line[0]), "MISS t%u %llu %llu", (unsigned)task_id, (unsigned long long)a, (unsigned long long)b);
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
