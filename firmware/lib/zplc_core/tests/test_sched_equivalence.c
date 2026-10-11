/**
 * @file test_sched_equivalence.c
 * @brief The host runtime decides what the firmware decides (RT-008).
 *
 * SPDX-License-Identifier: MIT
 *
 * The POSIX session is driven with the scenario of zplc_sched_trace_cases.h: three tasks of 100 ms and 200 ms, a clock
 * the test scripts, and five batches, the last three late. The decisions of the portable scheduler core are
 * written down and compared with the golden trace. The Zephyr runtime runs the same scenario in
 * firmware/tests/scheduler_equivalence and compares against the same trace.
 */

#define _DARWIN_C_SOURCE 1
#define _POSIX_C_SOURCE 200809L

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <zplc_bytes.h>
#include <zplc_core.h>
#include <zplc_crc32.h>
#include <zplc_isa.h>

#include "native_runtime_session.h"
#include "zplc_sched_trace_cases.h"

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                                       \
  do {                                                                         \
    test_count++;                                                              \
    if (!(cond)) {                                                             \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__);                  \
      fail_count++;                                                            \
    } else {                                                                   \
      printf("PASS: %s\n", msg);                                               \
    }                                                                          \
  } while (0)

#define CODE_PER_TASK 6U /* PUSH8 value, STORE8 address(2), HALT */

/* A container with CODE and TASK segments: the tasks of the scenario, each storing its value in its output byte. */
static size_t build_artifact(uint8_t *out, size_t capacity) {
  const size_t code_size = ZPLC_TRACE_TASK_COUNT * CODE_PER_TASK;
  const size_t task_size = ZPLC_TRACE_TASK_COUNT * ZPLC_TASK_DEF_SIZE;
  const size_t total = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size + task_size;
  size_t offset;
  unsigned index;
  uint32_t crc;

  if (total > capacity) {
    return 0U;
  }
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
  for (index = 0U; index < ZPLC_TRACE_TASK_COUNT; index++) {
    uint8_t *code = out + offset + (size_t)index * CODE_PER_TASK;

    code[0] = OP_PUSH8;
    code[1] = ZPLC_TRACE_TASKS[index].output;
    code[2] = OP_STORE8;
    zplc_put_u16_le(code + 3U, (uint16_t)(ZPLC_MEM_OPI_BASE + index));
    code[5] = OP_HALT;
  }
  offset += code_size;
  for (index = 0U; index < ZPLC_TRACE_TASK_COUNT; index++) {
    uint8_t *task = out + offset + (size_t)index * ZPLC_TASK_DEF_SIZE;

    zplc_put_u16_le(task, ZPLC_TRACE_TASKS[index].id);
    task[2] = ZPLC_TASK_CYCLIC;
    task[3] = ZPLC_TRACE_TASKS[index].priority;
    zplc_put_u32_le(task + 4U, ZPLC_TRACE_TASKS[index].interval_ms * 1000U);
    zplc_put_u16_le(task + 8U, (uint16_t)(index * CODE_PER_TASK));
    zplc_put_u16_le(task + 10U, 16U);
  }
  crc = zplc_crc32_update(0xFFFFFFFFU, out, 12U);
  crc = zplc_crc32_update(crc, out + 16U, total - 16U) ^ 0xFFFFFFFFU;
  zplc_put_u32_le(out + 12U, crc);
  return total;
}

static int load_artifact(zplc_native_runtime_session_t *session, const uint8_t *artifact, size_t size) {
  static char request[2U * 512U + 128U];
  char response[512];
  char event[512];
  size_t used;
  size_t index;

  used = (size_t)snprintf(request, sizeof(request),
                          "{\"id\":\"1\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"");
  for (index = 0U; index < size; index++) {
    used += (size_t)snprintf(request + used, sizeof(request) - used, "%02X", artifact[index]);
  }
  (void)snprintf(request + used, sizeof(request) - used, "\"}}");
  (void)zplc_native_runtime_session_handle_request(session, request, response, sizeof(response), event, sizeof(event));
  return session->program_loaded != 0U && strstr(response, "\"error\":{") == NULL;
}

/* The clock of the scenario: the reads of the batch that is running, in order. */
static const zplc_trace_batch_t *current_batch;
static unsigned current_read;

static uint32_t scripted_clock(void) {
  const uint32_t value = current_batch->read_ms[current_read];

  if (current_read + 1U < current_batch->read_count) {
    current_read++;
  }
  return value;
}

static void test_the_session_decides_the_golden_trace(void) {
  zplc_native_runtime_session_t session;
  uint8_t artifact[512];
  char template[] = "/tmp/zplc_sched_equivalence_XXXXXX";
  char response[1024];
  char event[1024];
  zplc_trace_log_t log;
  unsigned batch;
  unsigned line;
  size_t size;
  int all_lines_equal = 1;

  printf("\n=== Test: the host session decides the golden trace (RT-008) ===\n");
  if (mkdtemp(template) == NULL) {
    CHECK(0, "a directory for the program store");
    return;
  }
  setenv("ZPLC_PERSIST_ROOT", template, 1);
  unsetenv("ZPLC_DEADLINE_MISS_LIMIT");
  memset(&log, 0, sizeof(log));

  zplc_native_runtime_session_init(&session);
  CHECK(session.deadline_miss_limit == ZPLC_SCHED_DEFAULT_MISS_LIMIT, "the host runs with the default limit");
  size = build_artifact(artifact, sizeof(artifact));
  CHECK(size != 0U && load_artifact(&session, artifact, size), "the three tasks load");
  CHECK(session.task_count == 3U && session.multirate == 1U, "they are a multirate program");
  zplc_sched_core_set_trace(&session.core, zplc_trace_render, &log);
  session.clock_ms = scripted_clock;

  (void)zplc_native_runtime_session_handle_request(&session,
                                                   "{\"id\":\"2\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
                                                   response, sizeof(response), event, sizeof(event));
  CHECK(session.state == ZPLC_NATIVE_SESSION_RUNNING, "the session runs");

  for (batch = 0U; batch < ZPLC_TRACE_BATCH_COUNT; batch++) {
    current_batch = &ZPLC_TRACE_BATCHES[batch];
    current_read = 0U;
    (void)zplc_native_runtime_session_tick(&session, ZPLC_TRACE_BATCHES[batch].at_ms, event, sizeof(event));
  }

  CHECK(log.count == ZPLC_TRACE_GOLDEN_COUNT, "the trace has as many decisions as the golden one");
  for (line = 0U; line < log.count && line < ZPLC_TRACE_GOLDEN_COUNT; line++) {
    if (strcmp(log.line[line], ZPLC_TRACE_GOLDEN[line]) != 0) {
      fprintf(stderr, "line %u: got \"%s\", want \"%s\"\n", line, log.line[line], ZPLC_TRACE_GOLDEN[line]);
      all_lines_equal = 0;
    }
  }
  CHECK(all_lines_equal != 0, "every decision is the golden one");
  CHECK(session.state == ZPLC_NATIVE_SESSION_ERROR && session.fault_reason == ZPLC_NATIVE_FAULT_DEADLINE_MISS &&
            session.fault_task_id == 1U,
        "the session is latched on the third miss of task 1");
  CHECK(session.task_misses[2] == 3U && session.task_misses[0] == 0U && session.task_misses[1] == 0U,
        "the misses are those of task 1 (the third task of the sorted table)");
  zplc_native_runtime_session_shutdown(&session);
}

int main(void) {
  printf("==== test_sched_equivalence ====\n");
  test_the_session_decides_the_golden_trace();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
