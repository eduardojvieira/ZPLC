/*
 * The single-task configuration of the firmware runs on the scheduler core (RT-018).
 *
 * A firmware built without the multitask scheduler used to scan from a loop of its own: it never latched the
 * input pins and never checked a deadline. This suite drives the configuration that replaced that loop,
 * zplc_single_task_*, on native_sim:
 *
 *   - the input pin is sampled and latched once at the start of a scan, and the output pin is written once, at its
 *     end, from the image (the same latch and commit as the multitask scheduler, RT-009);
 *   - a deadline miss is counted, and the fault latches after the same number of misses in a row, with the pins
 *     and the image safe (RT-014, RT-007);
 *   - a step keeps the image and drives the pins safe (RT-017);
 *   - the decisions are the golden trace of the one-task scenario the host session and the multitask scheduler are
 *     held to.
 *
 * The physical pins are the emulated LED and switch of native_sim (the board's DO0 and DI0). A target without the
 * emulator (qemu_cortex_m3) checks the same decisions through the process image only; its pins are not observed.
 */

#include <string.h>
#include <zephyr/devicetree.h>
#include <zephyr/ztest.h>
#include <zplc_bytes.h>
#include <zplc_core.h>
#include <zplc_crc32.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_loader.h>
#include <zplc_single_task.h>

#include "zplc_sched_trace_cases.h"

#if DT_NODE_EXISTS(DT_ALIAS(led0)) && DT_NODE_EXISTS(DT_ALIAS(sw0))
#if DT_NODE_HAS_COMPAT(DT_GPIO_CTLR(DT_ALIAS(led0), gpios), zephyr_gpio_emul)
#include <zephyr/drivers/gpio/gpio_emul.h>
#define HAVE_EMULATED_PINS 1
#endif
#endif

#ifdef HAVE_EMULATED_PINS
#define LED0_CONTROLLER DEVICE_DT_GET(DT_GPIO_CTLR(DT_ALIAS(led0), gpios))
#define LED0_PIN DT_GPIO_PIN(DT_ALIAS(led0), gpios)
#define SW0_CONTROLLER DEVICE_DT_GET(DT_GPIO_CTLR(DT_ALIAS(sw0), gpios))
#define SW0_PIN DT_GPIO_PIN(DT_ALIAS(sw0), gpios)
#define assert_led(expected, message) zassert_equal(gpio_emul_output_get(LED0_CONTROLLER, LED0_PIN), (expected), message)
#define set_switch(level) zassert_ok(gpio_emul_input_set(SW0_CONTROLLER, SW0_PIN, (level)), "set the switch")
#else
#define assert_led(expected, message) ((void)(expected))
#define set_switch(level) ((void)(level))
#endif

#define PROGRAM_CAPACITY 128U

static zplc_single_task_t single;
static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

/* The clock a test scripts: microsecond values, one per read; the last one repeats. */
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

static void set_clock_ms(const uint32_t *ms, unsigned count) {
  unsigned index;

  for (index = 0U; index < count; index++) {
    clock_values[index] = (uint64_t)ms[index] * 1000U;
  }
  clock_length = count;
  clock_next = 0U;
}

/* One scan with the clock reads of one batch: the release, the start of the batch and the end of the task. */
static int scan_with(const uint32_t *reads, int step_mode) {
  set_clock_ms(reads, 3U);
  return zplc_single_task_scan(&single, step_mode, NULL);
}

/* A container with a CODE segment and one cyclic task, id 0, entry 0. */
static size_t build_artifact(uint8_t *out, const uint8_t *code, size_t code_size) {
  const size_t total = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size + ZPLC_TASK_DEF_SIZE;
  size_t offset;
  uint32_t crc;

  zassert_true(total <= PROGRAM_CAPACITY, "program buffer overflow");
  memset(out, 0, total);
  memcpy(out, "ZPLC", 4U);
  zplc_put_u16_le(out + 4U, ZPLC_VERSION_MAJOR);
  zplc_put_u16_le(out + 6U, ZPLC_VERSION_MINOR);
  zplc_put_u32_le(out + 16U, (uint32_t)code_size);
  zplc_put_u32_le(out + 20U, ZPLC_TASK_DEF_SIZE);
  zplc_put_u16_le(out + 26U, 2U);
  zplc_put_u32_le(out + 28U, ZPLC_DRAFT_COUNTER);
  offset = ZPLC_FILE_HEADER_SIZE;
  zplc_put_u16_le(out + offset, ZPLC_SEG_CODE);
  zplc_put_u32_le(out + offset + 4U, (uint32_t)code_size);
  offset += ZPLC_SEGMENT_ENTRY_SIZE;
  zplc_put_u16_le(out + offset, ZPLC_SEG_TASK);
  zplc_put_u32_le(out + offset + 4U, ZPLC_TASK_DEF_SIZE);
  offset += ZPLC_SEGMENT_ENTRY_SIZE;
  memcpy(out + offset, code, code_size);
  offset += code_size;
  zplc_put_u16_le(out + offset, ZPLC_TRACE_ONE_TASK_ID);
  out[offset + 2U] = ZPLC_TASK_CYCLIC;
  zplc_put_u32_le(out + offset + 4U, ZPLC_TRACE_ONE_INTERVAL_MS * 1000U);
  zplc_put_u16_le(out + offset + 8U, 0U);
  zplc_put_u16_le(out + offset + 10U, 16U);
  crc = zplc_crc32_update(0xFFFFFFFFU, out, 12U);
  crc = zplc_crc32_update(crc, out + 16U, total - 16U) ^ 0xFFFFFFFFU;
  zplc_put_u32_le(out + 12U, crc);
  return total;
}

static void load_program(const uint8_t *code, size_t code_size) {
  uint8_t artifact[PROGRAM_CAPACITY];
  const size_t size = build_artifact(artifact, code, code_size);

  zassert_ok(zplc_core_init(), "core init");
  zassert_equal(zplc_core_load(artifact, size, workspace, sizeof(workspace)), 0, "load the artifact");
  zplc_single_task_init(&single, ZPLC_TRACE_ONE_INTERVAL_MS, 0U);
  single.clock_us = scripted_clock;
  zplc_single_task_begin(&single);
}

/* OPI[0] := IPI[0]; HALT: the output follows the input the scan latched. */
static const uint8_t follow_code[] = {
    OP_LOAD8, (uint8_t)(ZPLC_MEM_IPI_BASE & 0xFFU), (uint8_t)(ZPLC_MEM_IPI_BASE >> 8),
    OP_STORE8, (uint8_t)(ZPLC_MEM_OPI_BASE & 0xFFU), (uint8_t)(ZPLC_MEM_OPI_BASE >> 8),
    OP_HALT,
};

/* OPI[0] := 1; HALT */
static const uint8_t set_code[] = {
    OP_PUSH8, 1U,
    OP_STORE8, (uint8_t)(ZPLC_MEM_OPI_BASE & 0xFFU), (uint8_t)(ZPLC_MEM_OPI_BASE >> 8),
    OP_HALT,
};

/* The task of the golden scenario: PUSH8 0x44; STORE8 OPI[0]; HALT. */
static const uint8_t trace_code[] = {
    OP_PUSH8, ZPLC_TRACE_ONE_OUTPUT,
    OP_STORE8, (uint8_t)(ZPLC_MEM_OPI_BASE & 0xFFU), (uint8_t)(ZPLC_MEM_OPI_BASE >> 8),
    OP_HALT,
};

/* A loop that never ends: the instruction budget of the scan is a VM fault (the loader refuses a certain stack
 * underflow, so this is the fault a verified program can still have). */
static const uint8_t fault_code[] = {OP_JMP, 0U, 0U, OP_HALT};

static void *suite_setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "initialize HAL");
  return NULL;
}

static void suite_teardown(void *fixture) {
  ARG_UNUSED(fixture);
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "shutdown HAL");
}

ZTEST(zplc_single_task, test_a_scan_latches_the_input_once_and_commits_the_output_once) {
  static const uint32_t reads[3] = {100U, 100U, 120U};
  zplc_sched_scan_report_t report;

#ifndef HAVE_EMULATED_PINS
  /* There is no pin to drive on this target: the latch is checked where the emulator is. */
  ztest_test_skip();
#endif
  load_program(follow_code, sizeof(follow_code));
  set_switch(1);
  set_clock_ms(reads, 3U);
  zassert_ok(zplc_single_task_scan(&single, 0, &report), "scan");
  zassert_equal(zplc_ipi_read8(0U) & 1U, 1U, "the input pin was latched into the input image");
  zassert_equal(zplc_opi_read8(0U) & 1U, 1U, "the program saw it");
  assert_led(1, "and the output pin was written from the image at the end of the scan");
  zassert_equal(report.committed, 1U, "once");
  zassert_equal(single.core.input_latch_count, 1U, "one input latch");
  zassert_equal(single.core.output_commit_count, 1U, "one output commit");

  /* The pin changed; the image does not follow it until the next scan latches it. */
  set_switch(0);
  zassert_equal(zplc_ipi_read8(0U) & 1U, 1U, "the input image holds what the last scan latched");
  set_clock_ms(reads, 3U);
  zassert_ok(zplc_single_task_scan(&single, 0, NULL), "scan again");
  zassert_equal(zplc_ipi_read8(0U) & 1U, 0U, "the next scan latches the new level");
  assert_led(0, "and the output follows it");
}

ZTEST(zplc_single_task, test_a_deadline_miss_is_counted_and_the_third_in_a_row_latches_safe) {
  static const uint32_t late[3] = {100U, 100U, 250U}; /* 150 ms for a 100 ms task */
  static const uint32_t in_time[3] = {100U, 100U, 150U};

  load_program(set_code, sizeof(set_code));
  zassert_ok(scan_with(late, 0), "the first miss is a warning");
  assert_led(1, "the output was committed");
  zassert_equal(single.slot[0].task.stats.overrun_count, 1U, "and counted");
  zassert_equal(single.core.last_overrun_us, 50000U, "with its overrun");
  zassert_ok(scan_with(in_time, 0), "a scan in time");
  zassert_equal(single.slot[0].consecutive_misses, 0U, "ends the run of misses");
  zassert_ok(scan_with(late, 0), "first of a new run");
  zassert_ok(scan_with(late, 0), "second");
  zassert_equal(scan_with(late, 0), ZPLC_SCHED_ERR_DEADLINE, "the third latches the fault");
  zassert_equal(single.core.fault_reason, (uint8_t)ZPLC_SCHED_FAULT_DEADLINE_MISS, "with its reason");
  assert_led(0, "the pin is safe");
  zassert_equal(zplc_opi_read8(0U), 0U, "and the image is zero");
}

ZTEST(zplc_single_task, test_a_vm_fault_drives_the_pin_safe_before_the_scan_returns) {
  static const uint32_t reads[3] = {100U, 100U, 110U};

  load_program(set_code, sizeof(set_code));
  zassert_ok(scan_with(reads, 0), "a good scan lights the output");
  assert_led(1, "the pin is on");

  load_program(fault_code, sizeof(fault_code));
  /* The first program left the pin on; the new one has not written it. A fault must still make it safe. */
  zassert_true(scan_with(reads, 0) < 0, "the scan fails");
  zassert_equal(single.core.fault_reason, (uint8_t)ZPLC_SCHED_FAULT_VM, "with a VM fault");
  assert_led(0, "the pin is safe");
}

ZTEST(zplc_single_task, test_a_step_keeps_the_image_and_makes_the_pin_safe) {
  static const uint32_t reads[3] = {100U, 100U, 900U};
  zplc_sched_scan_report_t report;

  load_program(set_code, sizeof(set_code));
  set_clock_ms(reads, 3U);
  zassert_ok(zplc_single_task_scan(&single, 1, &report), "a step, however long it takes");
  zassert_equal(report.paused, 1U, "ends paused");
  zassert_equal(zplc_opi_read8(0U), 1U, "the image is kept");
  assert_led(0, "and the pin is safe (RT-017)");
  zassert_equal(single.slot[0].task.stats.overrun_count, 0U, "no deadline applies to a step");
}

ZTEST(zplc_single_task, test_the_one_task_decides_the_golden_trace) {
  static zplc_trace_log_t log;
  unsigned batch;
  unsigned line;

  load_program(trace_code, sizeof(trace_code));
  zplc_sched_core_set_trace(&single.core, zplc_trace_render, &log);
  memset(&log, 0, sizeof(log));
  for (batch = 0U; batch < ZPLC_TRACE_ONE_BATCH_COUNT; batch++) {
    const uint32_t reads[3] = {ZPLC_TRACE_ONE_BATCHES[batch].at_ms, ZPLC_TRACE_ONE_BATCHES[batch].start_ms,
                               ZPLC_TRACE_ONE_BATCHES[batch].end_ms};

    set_clock_ms(reads, 3U);
    (void)zplc_single_task_scan(&single, 0, NULL);
  }
  zassert_equal(log.count, ZPLC_TRACE_ONE_GOLDEN_COUNT, "as many decisions as the one-task golden trace");
  for (line = 0U; line < log.count && line < ZPLC_TRACE_ONE_GOLDEN_COUNT; line++) {
    zassert_true(strcmp(log.line[line], ZPLC_TRACE_ONE_GOLDEN[line]) == 0, "line %u: got \"%s\", want \"%s\"", line,
                 log.line[line], ZPLC_TRACE_ONE_GOLDEN[line]);
  }
}

ZTEST_SUITE(zplc_single_task, NULL, suite_setup, NULL, NULL, suite_teardown);
