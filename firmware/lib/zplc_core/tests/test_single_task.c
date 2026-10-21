/**
 * @file test_single_task.c
 * @brief The single-task configuration runs on the scheduler core, with the same decisions (RT-018).
 *
 * SPDX-License-Identifier: MIT
 *
 * One program on the default VM is released from the caller's loop. Its scan is the core's: this test drives it
 * with the one-task scenario of zplc_sched_trace_cases.h and compares the decisions with the golden trace the host
 * session and the multitask scheduler of the firmware are held to. The input latch of the pins is checked on the
 * Zephyr emulator, in firmware/tests/single_task, because the host has no pins.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_isa.h>
#include <zplc_single_task.h>
#include <zplc_test_hooks.h>

#include "zplc_sched_trace_cases.h"

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                      \
  do {                                                        \
    test_count++;                                             \
    if (!(cond)) {                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      fail_count++;                                           \
    } else {                                                  \
      printf("PASS: %s\n", msg);                              \
    }                                                         \
  } while (0)

static zplc_single_task_t single;

/* The clock: a list of microsecond values, one per read; the last repeats. */
static uint64_t clock_values[8];
static unsigned clock_length;
static unsigned clock_next;

static uint64_t scripted_clock(void) {
  const uint64_t value = clock_values[clock_next];

  if (clock_next + 1U < clock_length) {
    clock_next++;
  }
  return value;
}

static void set_clock(const uint32_t *ms, unsigned count) {
  unsigned index;

  for (index = 0U; index < count; index++) {
    clock_values[index] = (uint64_t)ms[index] * 1000U;
  }
  clock_length = count;
  clock_next = 0U;
}

static void write_u16(uint8_t *out, uint16_t value) {
  out[0] = (uint8_t)value;
  out[1] = (uint8_t)(value >> 8);
}

/* PUSH8 value; STORE8 OPI0; HALT. With a breakpoint: PUSH8 value; BREAK; STORE8 OPI0; HALT. */
static void load_program(uint8_t value, int breakpoint, int fault) {
  uint8_t code[16];
  size_t n = 0U;

  zplc_core_init();
  if (fault != 0) {
    code[n++] = OP_ADD; /* nothing on the stack */
    code[n++] = OP_HALT;
  } else {
    code[n++] = OP_PUSH8;
    code[n++] = value;
    if (breakpoint != 0) {
      code[n++] = OP_BREAK;
    }
    code[n++] = OP_STORE8;
    write_u16(code + n, ZPLC_MEM_OPI_BASE);
    n += 2U;
    code[n++] = OP_HALT;
  }
  CHECK(zplc_test_load_raw(code, n) == 0, "the program is loaded on the default VM");
  zplc_single_task_init(&single, ZPLC_TRACE_ONE_INTERVAL_MS, 0U);
  single.clock_us = scripted_clock;
}

static void test_the_one_task_decides_the_golden_trace(void) {
  static zplc_trace_log_t log;
  unsigned batch;
  unsigned line;
  int all_equal = 1;
  int result = 0;

  printf("\n=== Test: the single-task configuration decides the golden trace (RT-018) ===\n");
  memset(&log, 0, sizeof(log));
  load_program(ZPLC_TRACE_ONE_OUTPUT, 0, 0);
  CHECK(single.core.miss_limit == ZPLC_SCHED_DEFAULT_MISS_LIMIT, "it runs with the default limit of the core");
  zplc_sched_core_set_trace(&single.core, zplc_trace_render, &log);
  zplc_single_task_begin(&single);

  for (batch = 0U; batch < ZPLC_TRACE_ONE_BATCH_COUNT; batch++) {
    const uint32_t reads[3] = {ZPLC_TRACE_ONE_BATCHES[batch].at_ms, ZPLC_TRACE_ONE_BATCHES[batch].start_ms,
                               ZPLC_TRACE_ONE_BATCHES[batch].end_ms};

    set_clock(reads, 3U);
    result = zplc_single_task_scan(&single, 0, NULL);
    if (batch < ZPLC_TRACE_ONE_BATCH_COUNT - 1U) {
      CHECK(result == 0, "a scan that is in time, or the first miss, is not a fault");
    }
  }
  CHECK(result == ZPLC_SCHED_ERR_DEADLINE, "the third miss in a row is the fault");
  CHECK(log.count == ZPLC_TRACE_ONE_GOLDEN_COUNT, "as many decisions as the golden trace");
  for (line = 0U; line < log.count && line < ZPLC_TRACE_ONE_GOLDEN_COUNT; line++) {
    if (strcmp(log.line[line], ZPLC_TRACE_ONE_GOLDEN[line]) != 0) {
      fprintf(stderr, "line %u: got \"%s\", want \"%s\"\n", line, log.line[line], ZPLC_TRACE_ONE_GOLDEN[line]);
      all_equal = 0;
    }
  }
  CHECK(all_equal != 0, "every decision is the golden one");
  CHECK(single.core.fault_latched == 1U && single.core.fault_reason == (uint8_t)ZPLC_SCHED_FAULT_DEADLINE_MISS,
        "the fault is latched with its reason");
  CHECK(zplc_opi_read8(0U) == 0U, "and the output image is at its safe state");
}

static void test_a_vm_fault_drives_the_outputs_safe(void) {
  const uint32_t reads[3] = {100U, 100U, 110U};
  uint8_t forced = 0x5AU;
  int result;

  printf("\n=== Test: a VM fault resets the image and latches ===\n");
  load_program(0U, 0, 1);
  zplc_mem_get_region(ZPLC_MEM_OPI_BASE)[0] = 0xFFU;
  CHECK(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE + 1U, &forced, 1U) == 0, "a force is set");
  set_clock(reads, 3U);
  result = zplc_single_task_scan(&single, 0, NULL);
  CHECK(result < 0 && single.core.fault_reason == (uint8_t)ZPLC_SCHED_FAULT_VM, "the scan fails with a VM fault");
  CHECK(zplc_opi_read8(0U) == 0U && zplc_force_get_count() == 0U, "the image is zero and the forces are cleared");
  set_clock(reads, 3U);
  CHECK(zplc_single_task_scan(&single, 0, NULL) == 0 && single.core.output_commit_count == 0U,
        "a latched fault runs nothing until it is cleared");
  zplc_single_task_clear(&single);
  CHECK(single.core.fault_latched == 0U, "a load or a reset clears it");
}

static void test_a_step_has_no_deadline_and_ends_paused(void) {
  const uint32_t reads[3] = {100U, 100U, 9000U};
  zplc_sched_scan_report_t report;

  printf("\n=== Test: a step (RT-017) ===\n");
  load_program(0x21U, 0, 0);
  set_clock(reads, 3U);
  CHECK(zplc_single_task_scan(&single, 1, &report) == 0 && report.paused == 1U && single.core.fault_latched == 0U,
        "a step takes as long as it takes and ends paused");
  CHECK(zplc_opi_read8(0U) == 0x21U, "the image is kept for the debugger");
}

static void test_a_breakpoint_pauses_and_the_next_scan_continues(void) {
  const uint32_t reads[3] = {100U, 100U, 120U};
  zplc_sched_scan_report_t report;

  printf("\n=== Test: a breakpoint stops the scan and the next one continues it ===\n");
  load_program(0x33U, 1, 0);
  set_clock(reads, 3U);
  CHECK(zplc_single_task_scan(&single, 0, &report) == 0 && report.paused == 1U && report.paused_task == 0,
        "the scan stops at the breakpoint");
  CHECK(zplc_opi_read8(0U) == 0U, "the part before the breakpoint wrote nothing to the output");
  set_clock(reads, 3U);
  CHECK(zplc_single_task_scan(&single, 0, &report) == 0 && report.paused == 0U && zplc_opi_read8(0U) == 0x33U,
        "the next scan continues from the breakpoint instead of starting over");
}

int main(void) {
  printf("==== test_single_task ====\n");
  test_the_one_task_decides_the_golden_trace();
  test_a_vm_fault_drives_the_outputs_safe();
  test_a_step_has_no_deadline_and_ends_paused();
  test_a_breakpoint_pauses_and_the_next_scan_continues();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
