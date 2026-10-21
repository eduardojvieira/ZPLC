/*
 * The Zephyr scheduler decides what the host runtime decides (RT-008).
 *
 * The scenario and the decisions it must produce are those of zplc_sched_trace_cases.h, which the host session is
 * driven with in firmware/lib/zplc_core/tests/test_sched_equivalence.c: three tasks of 100 ms and 200 ms, a clock the
 * test scripts, five batches, the last three late. Here the Zephyr adapter of the portable scheduler core runs
 * them, with its timers stopped and its releases and its clock supplied by the test, and the decisions it writes
 * down are compared with the same golden trace.
 */

#include <string.h>
#include <zephyr/ztest.h>
#include <zplc_bytes.h>
#include <zplc_core.h>
#include <zplc_crc32.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_sched_core.h>
#include <zplc_scheduler.h>
#include <zplc_test_hooks.h>

#include "zplc_sched_trace_cases.h"

#define CODE_PER_TASK 6U /* PUSH8 value, STORE8 address(2), HALT */
#define PROGRAM_CAPACITY 160U

/* A container with CODE and TASK segments: the tasks of the scenario, each storing its value in its output byte. */
static size_t build_artifact(uint8_t *out, size_t capacity, const zplc_trace_task_t *tasks, unsigned count) {
  const size_t code_size = (size_t)count * CODE_PER_TASK;
  const size_t task_size = (size_t)count * ZPLC_TASK_DEF_SIZE;
  const size_t total = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size + task_size;
  size_t offset;
  unsigned index;
  uint32_t crc;

  zassert_true(total <= capacity, "program buffer overflow");
  memset(out, 0, total);
  memcpy(out, "ZPLC", 4U);
  zplc_put_u16_le(out + 4U, ZPLC_VERSION_MAJOR);
  zplc_put_u16_le(out + 6U, ZPLC_VERSION_MINOR);
  zplc_put_u32_le(out + 16U, (uint32_t)code_size);
  zplc_put_u32_le(out + 20U, (uint32_t)task_size);
  zplc_put_u16_le(out + 26U, 2U);
  zplc_put_u32_le(out + 28U, ZPLC_DRAFT_COUNTER);
  offset = ZPLC_FILE_HEADER_SIZE;
  zplc_put_u16_le(out + offset, ZPLC_SEG_CODE);
  zplc_put_u32_le(out + offset + 4U, (uint32_t)code_size);
  offset += ZPLC_SEGMENT_ENTRY_SIZE;
  zplc_put_u16_le(out + offset, ZPLC_SEG_TASK);
  zplc_put_u32_le(out + offset + 4U, (uint32_t)task_size);
  offset += ZPLC_SEGMENT_ENTRY_SIZE;
  for (index = 0U; index < count; index++) {
    uint8_t *code = out + offset + (size_t)index * CODE_PER_TASK;

    code[0] = OP_PUSH8;
    code[1] = tasks[index].output;
    code[2] = OP_STORE8;
    zplc_put_u16_le(code + 3U, (uint16_t)(ZPLC_MEM_OPI_BASE + index));
    code[5] = OP_HALT;
  }
  offset += code_size;
  for (index = 0U; index < count; index++) {
    uint8_t *task = out + offset + (size_t)index * ZPLC_TASK_DEF_SIZE;

    zplc_put_u16_le(task, tasks[index].id);
    task[2] = ZPLC_TASK_CYCLIC;
    task[3] = tasks[index].priority;
    zplc_put_u32_le(task + 4U, tasks[index].interval_ms * 1000U);
    zplc_put_u16_le(task + 8U, (uint16_t)(index * CODE_PER_TASK));
    zplc_put_u16_le(task + 10U, 16U);
  }
  crc = zplc_crc32_update(0xFFFFFFFFU, out, 12U);
  crc = zplc_crc32_update(crc, out + 16U, total - 16U) ^ 0xFFFFFFFFU;
  zplc_put_u32_le(out + 12U, crc);
  return total;
}

/* The clock of the scenario: the reads of the batch that is running, in order, in microseconds. */
static const zplc_trace_batch_t *current_batch;
static unsigned current_read;

static uint64_t scripted_clock_us(void) {
  const uint64_t value = (uint64_t)current_batch->read_ms[current_read] * 1000U;

  if (current_read + 1U < current_batch->read_count) {
    current_read++;
  }
  return value;
}

static void clear_scheduler(void) {
  int index;

  zplc_sched_test_set_clock(NULL);
  zassert_ok(zplc_sched_stop(), "stop scheduler");
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    int result = zplc_sched_unregister_task(index);

    zassert_true(result == 0 || result == -2, "unregister task");
  }
}

static void *suite_setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "initialize HAL");
  zassert_ok(zplc_sched_init(), "initialize scheduler");
  return NULL;
}

static void suite_teardown(void *fixture) {
  ARG_UNUSED(fixture);
  clear_scheduler();
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "shutdown HAL");
}

/* One log for every test: it is 3.8 KB, and the RAM of qemu_cortex_m3 holds the regions of the core as well. Each test
 * clears it when it starts its scenario. */
static zplc_trace_log_t trace_log;

static void load_and_start_tasks(zplc_trace_log_t *trace, const zplc_trace_task_t *tasks, unsigned count) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;

  clear_scheduler();
  size = build_artifact(program, sizeof(program), tasks, count);
  zassert_equal(zplc_sched_load(program, size), (int)count, "load the tasks");
  memset(trace, 0, sizeof(*trace));
  zplc_sched_core_set_trace(zplc_sched_test_core(), zplc_trace_render, trace);
  zplc_sched_test_set_clock(scripted_clock_us);
  zassert_ok(zplc_sched_start(), "start the scheduler");
  /* The releases of this test come from the test: the kernel timers must not add any. They are 100 ms and
   * 200 ms timers and the test takes microseconds, but they are stopped at once all the same. */
  zplc_sched_test_stop_timers();
}

static void load_and_start(zplc_trace_log_t *trace) { load_and_start_tasks(trace, ZPLC_TRACE_TASKS, ZPLC_TRACE_TASK_COUNT); }

static void run_batch(unsigned batch) {
  unsigned slot;

  current_batch = &ZPLC_TRACE_BATCHES[batch];
  current_read = 0U;
  for (slot = 0U; slot < ZPLC_TRACE_TASK_COUNT; slot++) {
    if ((ZPLC_TRACE_BATCHES[batch].due_mask & (1U << slot)) != 0U) {
      zassert_equal(zplc_sched_test_admit_release_at((int)slot, (uint64_t)ZPLC_TRACE_BATCHES[batch].at_ms * 1000U), 1,
                    "a release is admitted");
    }
  }
  (void)zplc_sched_test_run_batch();
}

ZTEST(zplc_scheduler_equivalence, test_the_zephyr_adapter_decides_the_golden_trace) {
  zplc_sched_stats_t stats;
  zplc_sched_stats_t before;
  unsigned batch;
  unsigned line;
  zplc_task_t task;

  load_and_start(&trace_log);
  zassert_ok(zplc_sched_get_stats(&before), "read the baseline");
  zassert_equal(zplc_sched_test_core()->miss_limit, ZPLC_SCHED_DEFAULT_MISS_LIMIT, "the firmware runs with the default limit of the core");
  zassert_equal(ZPLC_SCHED_DEFAULT_MISS_LIMIT, 3U, "which is three misses in a row");

  for (batch = 0U; batch < ZPLC_TRACE_BATCH_COUNT; batch++) {
    run_batch(batch);
  }

  zassert_equal(trace_log.count, ZPLC_TRACE_GOLDEN_COUNT, "as many decisions as the golden trace");
  for (line = 0U; line < trace_log.count && line < ZPLC_TRACE_GOLDEN_COUNT; line++) {
    zassert_true(strcmp(trace_log.line[line], ZPLC_TRACE_GOLDEN[line]) == 0, "line %u: got \"%s\", want \"%s\"", line, trace_log.line[line],
                 ZPLC_TRACE_GOLDEN[line]);
  }

  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR, "the third miss in a row latches");
  zassert_ok(zplc_sched_get_stats(&stats), "read the stats");
  zassert_equal(stats.fault_reason, (uint8_t)ZPLC_SCHED_FAULT_DEADLINE_MISS, "the status names the reason");
  zassert_equal(stats.fault_task_id, 1U, "and the task");
  zassert_equal(stats.total_overruns, 3U, "three misses were counted");
  zassert_equal(stats.consecutive_misses, 3U, "in a row");
  zassert_equal(stats.miss_limit, 3U, "of a limit of three");
  zassert_equal(stats.last_overrun_us, 20000U, "and the last overrun was 20 ms");
  zassert_equal(stats.input_latch_count - before.input_latch_count, 5U, "five batches latched their inputs");
  zassert_equal(stats.output_commit_count - before.output_commit_count, 4U, "and four of them committed");
  zassert_ok(zplc_sched_get_task(2, &task), "read task 1");
  zassert_equal(task.state, ZPLC_TASK_STATE_ERROR, "the tasks are in error");
  zassert_equal(zplc_opi_read8(0U), 0U, "the fault applies the safe state to the image");
}

/* RT-018: a program of one task is a one-task configuration of the same scheduler, and decides what the
 * single-task configuration of the firmware and the host session decide for it. */
ZTEST(zplc_scheduler_equivalence, test_one_task_decides_the_one_task_golden_trace) {
  static const zplc_trace_task_t one = {ZPLC_TRACE_ONE_TASK_ID, 0U, ZPLC_TRACE_ONE_INTERVAL_MS, ZPLC_TRACE_ONE_OUTPUT};
  unsigned batch;
  unsigned line;

  load_and_start_tasks(&trace_log, &one, 1U);
  for (batch = 0U; batch < ZPLC_TRACE_ONE_BATCH_COUNT; batch++) {
    static zplc_trace_batch_t scripted;

    scripted.at_ms = ZPLC_TRACE_ONE_BATCHES[batch].at_ms;
    scripted.due_mask = 1U;
    scripted.read_count = 2U;
    scripted.read_ms[0] = ZPLC_TRACE_ONE_BATCHES[batch].start_ms;
    scripted.read_ms[1] = ZPLC_TRACE_ONE_BATCHES[batch].end_ms;
    current_batch = &scripted;
    current_read = 0U;
    zassert_equal(zplc_sched_test_admit_release_at(0, (uint64_t)scripted.at_ms * 1000U), 1, "the release is admitted");
    (void)zplc_sched_test_run_batch();
  }
  zassert_equal(trace_log.count, ZPLC_TRACE_ONE_GOLDEN_COUNT, "as many decisions as the one-task golden trace");
  for (line = 0U; line < trace_log.count && line < ZPLC_TRACE_ONE_GOLDEN_COUNT; line++) {
    zassert_true(strcmp(trace_log.line[line], ZPLC_TRACE_ONE_GOLDEN[line]) == 0, "line %u: got \"%s\", want \"%s\"", line,
                 trace_log.line[line], ZPLC_TRACE_ONE_GOLDEN[line]);
  }
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR, "the third miss in a row latches");
}

ZTEST(zplc_scheduler_equivalence, test_a_second_release_of_a_pending_task_is_merged) {

  load_and_start(&trace_log);
  zassert_equal(zplc_sched_test_admit_release_at(0, 1000U), 1, "the first release is admitted");
  zassert_equal(zplc_sched_test_admit_release_at(0, 2000U), 0, "the second merges into it");
  zassert_equal(trace_log.count, 2U, "two decisions");
  zassert_true(strcmp(trace_log.line[0], "ADMIT t3 1000") == 0, "admitted at the first instant");
  zassert_true(strcmp(trace_log.line[1], "COALESCE t3") == 0, "merged, not queued");
}

ZTEST_SUITE(zplc_scheduler_equivalence, NULL, suite_setup, NULL, NULL, suite_teardown);
