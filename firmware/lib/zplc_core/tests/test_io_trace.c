/**
 * @file test_io_trace.c
 * @brief The per-scan I/O trace, fed by the scheduler core's trace port (LRN-024).
 *
 * SPDX-License-Identifier: MIT
 *
 * A program copies input byte 0 to output byte 0 and adds 1 into output byte 1. The single-task configuration scans it
 * on the portable scheduler core with a scripted clock, and the trace is the sink of the core's trace port: what it
 * keeps is checked sample by sample. The cost of the hook per scan is measured and printed (host evidence only).
 */

#define _POSIX_C_SOURCE 200809L /* clock_gettime, for the measurement */

#include <stdio.h>
#include <string.h>
#include <time.h>

#include <zplc_core.h>
#include <zplc_io_trace.h>
#include <zplc_isa.h>
#include <zplc_single_task.h>
#include <zplc_test_hooks.h>

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

static zplc_single_task_t single;
static zplc_io_trace_t trace;
static uint8_t storage[256];

/* One clock for the scan and the trace: what the scan reads, the trace reads. */
static uint64_t now_us_value;

static uint64_t scan_clock(void) { return now_us_value; }

static uint64_t trace_clock(void *ctx) {
  (void)ctx;
  return now_us_value;
}

/* The host reads the image itself. */
static int read_image(uint16_t addr, uint8_t *out, uint16_t size) {
  const uint8_t *base = zplc_mem_get_region(addr >= ZPLC_MEM_OPI_BASE ? ZPLC_MEM_OPI_BASE : ZPLC_MEM_IPI_BASE);
  const uint16_t region = addr >= ZPLC_MEM_OPI_BASE ? ZPLC_MEM_OPI_BASE : ZPLC_MEM_IPI_BASE;

  if (base == NULL) {
    return -1;
  }
  memcpy(out, base + (addr - region), size);
  return 0;
}

static void put_u16(uint8_t *out, uint16_t value) {
  out[0] = (uint8_t)value;
  out[1] = (uint8_t)(value >> 8);
}

/* LOAD8 IPI0; STORE8 OPI0; LOAD8 OPI1; PUSH8 1; ADD; STORE8 OPI1; HALT */
static void load_copy_program(void) {
  uint8_t code[16];
  size_t n = 0U;

  zplc_core_init();
  code[n++] = OP_LOAD8;
  put_u16(code + n, ZPLC_MEM_IPI_BASE);
  n += 2U;
  code[n++] = OP_STORE8;
  put_u16(code + n, ZPLC_MEM_OPI_BASE);
  n += 2U;
  code[n++] = OP_LOAD8;
  put_u16(code + n, ZPLC_MEM_OPI_BASE + 1U);
  n += 2U;
  code[n++] = OP_PUSH8;
  code[n++] = 1U;
  code[n++] = OP_ADD;
  code[n++] = OP_STORE8;
  put_u16(code + n, ZPLC_MEM_OPI_BASE + 1U);
  n += 2U;
  code[n++] = OP_HALT;
  CHECK(zplc_test_load_raw(code, n) == 0, "the copy program is loaded");
  zplc_single_task_init(&single, 10U, 0U);
  single.clock_us = scan_clock;
  zplc_io_trace_init(&trace, storage, (uint32_t)sizeof(storage), trace_clock, NULL, read_image);
  zplc_sched_core_set_trace(&single.core, zplc_io_trace_sched_hook, zplc_io_trace_attach(&trace));
}

/* One scan at time ms, with input byte 0 set to input. */
static int scan_at(uint32_t ms, uint8_t input) {
  now_us_value = (uint64_t)ms * 1000U;
  (void)zplc_ipi_write8(0U, input);
  return zplc_single_task_scan(&single, 0, NULL);
}

static void test_an_armed_trace_keeps_one_sample_per_scan(void) {
  zplc_io_trace_sample_t sample;
  zplc_io_trace_status_t status;

  printf("\n=== Test: an armed trace keeps one sample per scan ===\n");
  load_copy_program();
  now_us_value = 5000U;
  CHECK(zplc_io_trace_arm(&trace, 0U, 1U, 2U) == (int)(sizeof(storage) / (ZPLC_IO_TRACE_SAMPLE_HEADER + 3U)),
        "capacity 0 arms as many samples as the buffer holds");
  zplc_single_task_begin(&single);
  CHECK(scan_at(100U, 0x11U) == 0, "the first scan runs");
  CHECK(scan_at(110U, 0x22U) == 0, "the second scan runs");
  CHECK(scan_at(121U, 0x33U) == 0, "the third scan runs");

  zplc_io_trace_get_status(&trace, &status);
  CHECK(status.fed == 1U && status.armed == 1U, "the status says fed and armed");
  CHECK(status.written == 3U && status.first == 0U, "three samples were kept, from sequence 0");
  CHECK(status.in_bytes == 1U && status.out_bytes == 2U, "the status gives the armed shape");

  CHECK(zplc_io_trace_get(&trace, 0U, &sample) == 0, "sample 0 is held");
  CHECK(sample.t_us == 95000U, "its time is the input latch, from the arm (100 ms - 5 ms)");
  CHECK(sample.batch == 1U, "it is the first scan of the run");
  CHECK(sample.in[0] == 0x11U, "it has the input the scan latched");
  CHECK(sample.out[0] == 0x11U && sample.out[1] == 1U, "and the outputs the scan wrote");
  CHECK(zplc_io_trace_get(&trace, 2U, &sample) == 0 && sample.t_us == 116000U && sample.batch == 3U &&
            sample.in[0] == 0x33U && sample.out[0] == 0x33U && sample.out[1] == 3U,
        "sample 2 is the third scan");
  CHECK(zplc_io_trace_get(&trace, 3U, &sample) == -1, "a sample not yet written is not held");
}

static void test_a_trace_that_is_not_armed_keeps_nothing(void) {
  zplc_io_trace_status_t status;

  printf("\n=== Test: a trace that is not armed keeps nothing ===\n");
  load_copy_program();
  zplc_single_task_begin(&single);
  CHECK(scan_at(100U, 1U) == 0 && scan_at(110U, 2U) == 0, "two scans run");
  zplc_io_trace_get_status(&trace, &status);
  CHECK(status.armed == 0U && status.written == 0U, "nothing was kept");
  CHECK(zplc_opi_read8(0U) == 2U, "and the program ran as it does without a trace");
}

static void test_the_ring_keeps_the_newest_samples(void) {
  zplc_io_trace_sample_t sample;
  zplc_io_trace_status_t status;
  uint32_t ms;

  printf("\n=== Test: a full ring keeps the newest samples ===\n");
  load_copy_program();
  now_us_value = 0U;
  CHECK(zplc_io_trace_arm(&trace, 4U, 1U, 1U) == 4, "a capacity of 4 is armed");
  zplc_single_task_begin(&single);
  for (ms = 10U; ms <= 60U; ms += 10U) {
    (void)scan_at(ms, (uint8_t)ms);
  }
  zplc_io_trace_get_status(&trace, &status);
  CHECK(status.written == 6U && status.first == 2U && status.capacity == 4U, "6 written, the oldest held is 2");
  CHECK(zplc_io_trace_get(&trace, 1U, &sample) == -1, "an overwritten sample is not held");
  CHECK(zplc_io_trace_get(&trace, 2U, &sample) == 0 && sample.in[0] == 30U && sample.batch == 3U,
        "sample 2 is the third scan");
  CHECK(zplc_io_trace_get(&trace, 5U, &sample) == 0 && sample.in[0] == 60U && sample.t_us == 60000U,
        "sample 5 is the sixth scan");
}

static void test_a_new_run_counts_its_scans_from_one(void) {
  zplc_io_trace_sample_t sample;

  printf("\n=== Test: a new run counts its scans from one ===\n");
  load_copy_program();
  zplc_single_task_begin(&single);
  (void)scan_at(10U, 1U);
  (void)scan_at(20U, 2U);
  now_us_value = 25000U;
  CHECK(zplc_io_trace_arm(&trace, 0U, 1U, 1U) > 0, "the trace is armed while the program runs");
  (void)scan_at(30U, 3U);
  zplc_single_task_begin(&single); /* a STOP and a RUN */
  (void)scan_at(40U, 4U);
  CHECK(zplc_io_trace_get(&trace, 0U, &sample) == 0 && sample.batch == 3U, "a scan of a running program is not 1");
  CHECK(zplc_io_trace_get(&trace, 1U, &sample) == 0 && sample.batch == 1U && sample.t_us == 15000U,
        "the first scan after the start is 1: the start of the run");
}

static void test_arm_refuses_what_it_cannot_record(void) {
  zplc_io_trace_t unfed;
  zplc_io_trace_status_t status;

  printf("\n=== Test: arm refuses what it cannot record ===\n");
  load_copy_program();
  CHECK(zplc_io_trace_arm(&trace, 0U, 0U, 0U) == ZPLC_IO_TRACE_ERR_ARGS, "a sample of no bytes is refused");
  CHECK(zplc_io_trace_arm(&trace, 0U, ZPLC_IO_TRACE_MAX_IO_BYTES + 1U, 1U) == ZPLC_IO_TRACE_ERR_ARGS,
        "more input bytes than a sample holds are refused");
  CHECK(zplc_io_trace_arm(&trace, 1000U, 1U, 1U) == ZPLC_IO_TRACE_ERR_ARGS,
        "a capacity the buffer cannot hold is refused");
  zplc_io_trace_init(&unfed, storage, (uint32_t)sizeof(storage), trace_clock, NULL, read_image);
  CHECK(zplc_io_trace_arm(&unfed, 0U, 1U, 1U) == ZPLC_IO_TRACE_ERR_UNFED, "a trace no scheduler feeds is refused");
  CHECK(zplc_io_trace_arm(&trace, 2U, 1U, 1U) == 2, "a trace that fits is armed");
  zplc_io_trace_clear(&trace);
  zplc_io_trace_get_status(&trace, &status);
  CHECK(status.armed == 0U && status.written == 0U && status.capacity == 0U, "clear disarms and forgets");
}

static void test_a_faulted_scan_keeps_no_sample(void) {
  zplc_io_trace_status_t status;
  const uint8_t code[2] = {OP_ADD, OP_HALT};

  printf("\n=== Test: a scan that faults writes no outputs and keeps no sample ===\n");
  load_copy_program();
  CHECK(zplc_test_load_raw(code, sizeof(code)) == 0, "a faulting program is loaded");
  CHECK(zplc_io_trace_arm(&trace, 0U, 1U, 1U) > 0, "the trace is armed");
  zplc_single_task_begin(&single);
  CHECK(scan_at(10U, 1U) < 0, "the scan faults");
  zplc_io_trace_get_status(&trace, &status);
  CHECK(status.written == 0U, "no sample was kept");
}

/* The cost of the hook on this host: the two calls of one scan (latch and commit), many times. */
static void measure_the_cost_per_scan(void) {
  struct timespec start;
  struct timespec end;
  const uint32_t rounds = 200000U;
  uint32_t round;
  double ns;

  printf("\n=== Measure: the cost of the hook per scan on this host ===\n");
  load_copy_program();
  CHECK(zplc_io_trace_arm(&trace, 0U, ZPLC_IO_TRACE_MAX_IO_BYTES, ZPLC_IO_TRACE_MAX_IO_BYTES) > 0,
        "armed with the widest sample");
  (void)clock_gettime(CLOCK_MONOTONIC, &start);
  for (round = 0U; round < rounds; round++) {
    zplc_io_trace_sched_hook(&trace, ZPLC_SCHED_TRACE_LATCH, 0U, round + 1U, 0U);
    zplc_io_trace_sched_hook(&trace, ZPLC_SCHED_TRACE_COMMIT, 0U, round + 1U, 0U);
  }
  (void)clock_gettime(CLOCK_MONOTONIC, &end);
  ns = ((double)(end.tv_sec - start.tv_sec) * 1e9 + (double)(end.tv_nsec - start.tv_nsec)) / (double)rounds;
  printf("io-trace cost per scan: %.1f ns (widest sample, %u rounds)\n", ns, (unsigned)rounds);
  CHECK(trace.written == rounds, "every round kept one sample");
}

int main(void) {
  test_an_armed_trace_keeps_one_sample_per_scan();
  test_a_trace_that_is_not_armed_keeps_nothing();
  test_the_ring_keeps_the_newest_samples();
  test_a_new_run_counts_its_scans_from_one();
  test_arm_refuses_what_it_cannot_record();
  test_a_faulted_scan_keeps_no_sample();
  measure_the_cost_per_scan();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
