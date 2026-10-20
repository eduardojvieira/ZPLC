/*
 * SPDX-License-Identifier: MIT
 *
 * LRN-024: the board's per-scan I/O trace, fed by the Zephyr scheduler. A program counts its scans into output byte 0
 * every 10 ms; the trace keeps one sample per scan with the scan's number in its run, so the first scan after a start
 * is told apart from a scan of a program that was already running. Emulator evidence, not hardware.
 */

#include <string.h>
#include <zephyr/ztest.h>
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_io_trace.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>

#define INTERVAL_US 10000U
#define COUNTER (ZPLC_MEM_WORK_BASE + 0U)
#define LOW(address) ((uint8_t)((address) & 0xFFU))
#define HIGH(address) ((uint8_t)(((address) >> 8) & 0xFFU))

/* WORK0 := WORK0 + 1; OPI0 := WORK0 */
static const uint8_t counter_code[] = {
    OP_LOAD8,  LOW(COUNTER),           HIGH(COUNTER),           OP_PUSH8, 1U, OP_ADD,
    OP_STORE8, LOW(COUNTER),           HIGH(COUNTER),           OP_LOAD8, LOW(COUNTER), HIGH(COUNTER),
    OP_STORE8, LOW(ZPLC_MEM_OPI_BASE), HIGH(ZPLC_MEM_OPI_BASE), OP_HALT,
};

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length) {
  for (size_t index = 0U; index < length; index++) {
    crc ^= data[index];
    for (uint32_t bit = 0U; bit < 8U; bit++) {
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
  }
  return crc;
}

static void put_u16(uint8_t *data, uint16_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
}

static void put_u32(uint8_t *data, uint32_t value) {
  put_u16(data, (uint16_t)value);
  put_u16(data + 2, (uint16_t)(value >> 16));
}

/* A container with the code segment and one cyclic task. */
static void load_counter_program(void) {
  static uint8_t program[128];
  const size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t task_offset = code_offset + sizeof(counter_code);
  const size_t total = task_offset + ZPLC_TASK_DEF_SIZE;
  uint8_t *task = program + task_offset;
  uint32_t crc;

  zassert_true(total <= sizeof(program), "the program fits");
  memset(program, 0, total);
  memcpy(program, "ZPLC", 4U);
  put_u16(program + 4U, ZPLC_VERSION_MAJOR);
  put_u16(program + 6U, ZPLC_VERSION_MINOR);
  put_u32(program + 28U, ZPLC_DRAFT_COUNTER);
  put_u32(program + 16U, (uint32_t)sizeof(counter_code));
  put_u32(program + 20U, ZPLC_TASK_DEF_SIZE);
  put_u16(program + 26U, 2U);
  put_u16(program + 32U, ZPLC_SEG_CODE);
  put_u32(program + 36U, (uint32_t)sizeof(counter_code));
  put_u16(program + 40U, ZPLC_SEG_TASK);
  put_u32(program + 44U, ZPLC_TASK_DEF_SIZE);
  memcpy(program + code_offset, counter_code, sizeof(counter_code));
  put_u16(task, 1U);
  task[2] = ZPLC_TASK_CYCLIC;
  task[3] = 1U;
  put_u32(task + 4U, INTERVAL_US);
  put_u16(task + 10U, 64U);
  crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, total - 16U) ^ 0xFFFFFFFFU;
  put_u32(program + 12U, crc);
  {
    const int loaded = zplc_sched_load(program, total);

    zassert_equal(loaded, 1, "the counter program is loaded (%d)", loaded);
  }
  memset(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), 0, 1U);
  memset(zplc_mem_get_region(ZPLC_MEM_OPI_BASE), 0, 1U);
}

static void *io_trace_setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "initialize the HAL");
  zassert_ok(zplc_sched_init(), "initialize the scheduler");
  return NULL;
}

static void io_trace_before(void *fixture) {
  ARG_UNUSED(fixture);
  zassert_ok(zplc_sched_stop(), "stop");
  for (int index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    const int result = zplc_sched_unregister_task(index);

    zassert_true(result == 0 || result == -2, "unregister task %d", index);
  }
  zplc_io_trace_clear(zplc_io_trace_board());
  load_counter_program();
}

static void io_trace_after(void *fixture) {
  ARG_UNUSED(fixture);
  (void)zplc_sched_stop();
}

ZTEST(zplc_io_trace, test_armed_in_stop_the_first_sample_is_the_first_scan_of_the_run) {
  zplc_io_trace_t *trace = zplc_io_trace_board();
  zplc_io_trace_status_t status;
  zplc_io_trace_sample_t sample;
  zplc_io_trace_sample_t previous;

  zassert_true(zplc_io_trace_arm(trace, 0U, 1U, 1U) > 0, "the scheduler feeds the trace, so it can be armed");
  zassert_ok(zplc_sched_start(), "start");
  k_msleep(200);
  zassert_ok(zplc_sched_stop(), "stop");

  zplc_io_trace_get_status(trace, &status);
  zassert_true(status.written >= 5U, "a sample for each scan (%u kept)", status.written);
  zassert_ok(zplc_io_trace_get(trace, 0U, &previous), "sample 0 is held");
  zassert_equal(previous.batch, 1U, "the first sample is the first scan after the start");
  zassert_equal(previous.out[0], 1U, "with the output that scan wrote");
  for (uint32_t seq = 1U; seq < status.written; seq++) {
    zassert_ok(zplc_io_trace_get(trace, seq, &sample), "sample %u is held", seq);
    zassert_equal(sample.batch, previous.batch + 1U, "one sample per scan, in order");
    zassert_equal(sample.out[0], (uint8_t)sample.batch, "each sample has its own scan's output");
    zassert_true(sample.t_us >= previous.t_us, "time does not go back");
    previous = sample;
  }
}

ZTEST(zplc_io_trace, test_armed_while_running_the_first_sample_is_not_a_start) {
  zplc_io_trace_t *trace = zplc_io_trace_board();
  zplc_io_trace_sample_t sample;

  zassert_ok(zplc_sched_start(), "start");
  k_msleep(50);
  zassert_true(zplc_io_trace_arm(trace, 0U, 1U, 1U) > 0, "armed while the program runs");
  k_msleep(50);
  zassert_ok(zplc_sched_stop(), "stop");
  zassert_ok(zplc_io_trace_get(trace, 0U, &sample), "sample 0 is held");
  zassert_true(sample.batch > 1U, "a scan of a program that was already running is not 1 (%u)", sample.batch);
}

ZTEST_SUITE(zplc_io_trace, NULL, io_trace_setup, io_trace_before, io_trace_after, NULL);
