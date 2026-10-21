/**
 * @file test_port_timing.c
 * @brief The timing self-test of the port conformance suite on the POSIX port (IO-013).
 *
 * SPDX-License-Identifier: MIT
 *
 * Two parts. The first runs the self-test against the clock of the POSIX HAL, which is the point. The second hands
 * the same function a clock that is broken in each way the self-test claims to find, so that a port whose clock is
 * wrong cannot pass because the check never looked.
 *
 * tools/wasm-core/suites.ts runs this file on the WebAssembly HAL, with ZPLC_TEST_PORT_NAME naming that port.
 */

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <zplc_hal.h>

#include "zplc_port_timing_suite.h"

#ifndef ZPLC_TEST_PORT_NAME
#define ZPLC_TEST_PORT_NAME "POSIX"
#endif

static int test_count = 0;
static int fail_count = 0;

#define TEST_ASSERT(cond, msg)                                \
  do {                                                        \
    test_count++;                                             \
    if (!(cond)) {                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      fail_count++;                                           \
    } else {                                                  \
      printf("PASS: %s\n", msg);                              \
    }                                                         \
  } while (0)

/* ---- clocks that are wrong, each in the way a port can be wrong ---- */
static uint32_t fake_now;
static uint32_t fake_step;  /* what one read of the tick adds */
static uint32_t fake_scale; /* what a sleep adds, for each millisecond it is asked for */
static uint32_t fake_extra; /* what a sleep of more than a millisecond adds on top */
static int fake_flip;

static uint32_t fake_tick(void) {
  fake_now += fake_step;
  return fake_now;
}
static uint32_t backwards_tick(void) {
  fake_flip = !fake_flip;
  return fake_flip ? 1000U : 900U;
}
static void fake_sleep(uint32_t ms) { fake_now += ms * fake_scale + (ms > 1U ? fake_extra : 0U); }

static void configure(uint32_t step, uint32_t scale, uint32_t extra) {
  fake_now = 100000U;
  fake_step = step;
  fake_scale = scale;
  fake_extra = extra;
  fake_flip = 0;
}

static void test_the_clock_of_the_posix_port(void) {
  char why[128] = "";
  zplc_port_timing_report_t report;
  zplc_port_clock_t clock = {zplc_hal_tick, zplc_hal_sleep};
  int code = zplc_port_timing_selftest(&clock, why, sizeof(why), &report);

  printf("\n=== Test: the clock of the " ZPLC_TEST_PORT_NAME " HAL (resolution %lu ms, a sleep of 50 ms took %lu ms) ===\n",
         (unsigned long)report.resolution_ms, (unsigned long)report.sleep_50_ms);
  TEST_ASSERT(code == ZPLC_PORT_TIMING_OK, why[0] != '\0' ? why : "the clock of the port passes the timing self-test");
  TEST_ASSERT(report.resolution_ms >= 1U && report.resolution_ms <= ZPLC_PORT_TIMING_MAX_RESOLUTION_MS,
              "the smallest advance of a sleep of 1 ms on the tick of the port is between 1 ms and the floor of the suite");
  TEST_ASSERT(report.sleep_50_ms >= 50U, "a sleep of 50 ms takes at least 50 ms by the tick");
}

static void test_the_self_test_finds_a_broken_clock(void) {
  char why[128];
  zplc_port_clock_t clock;
  zplc_port_timing_report_t report;

  printf("\n=== Test: the self-test finds a clock that is wrong ===\n");

  clock.tick = fake_tick;
  clock.sleep_ms = fake_sleep;
  configure(0U, 1U, 0U);
  TEST_ASSERT(zplc_port_timing_selftest(&clock, why, sizeof(why), &report) == ZPLC_PORT_TIMING_OK && report.resolution_ms == 1U &&
                  report.sleep_50_ms == 50U,
              "a clock that counts milliseconds and sleeps what it is told passes");

  clock.tick = backwards_tick;
  configure(0U, 1U, 0U);
  TEST_ASSERT(zplc_port_timing_selftest(&clock, why, sizeof(why), NULL) == ZPLC_PORT_TIMING_NOT_MONOTONIC &&
                  strstr(why, "backwards") != NULL,
              "a tick that goes backwards is refused, and says so");

  clock.tick = fake_tick;
  configure(5000U, 1U, 0U);
  TEST_ASSERT(zplc_port_timing_selftest(&clock, why, sizeof(why), NULL) == ZPLC_PORT_TIMING_NOT_MONOTONIC &&
                  strstr(why, "does not count milliseconds") != NULL,
              "a tick that jumps by seconds between two reads is not in milliseconds");

  configure(0U, 0U, 0U);
  TEST_ASSERT(zplc_port_timing_selftest(&clock, why, sizeof(why), NULL) == ZPLC_PORT_TIMING_STANDS_STILL,
              "a tick that does not advance, even through a sleep, is stopped");

  configure(0U, 100U, 0U);
  TEST_ASSERT(zplc_port_timing_selftest(&clock, why, sizeof(why), NULL) == ZPLC_PORT_TIMING_TOO_COARSE,
              "a sleep of 1 ms that moves the tick by 100 ms is too coarse to time a scan");

  configure(0U, 1U, 0U);
  fake_scale = 0U;
  fake_step = 1U; /* the tick moves by itself, one millisecond a read, and a sleep adds nothing: it returns at once */
  TEST_ASSERT(zplc_port_timing_selftest(&clock, why, sizeof(why), NULL) == ZPLC_PORT_TIMING_SLEEP_TOO_SHORT,
              "a sleep that returns at once is refused");

  configure(0U, 1U, ZPLC_PORT_TIMING_MAX_OVERSLEEP_MS + 1U);
  TEST_ASSERT(zplc_port_timing_selftest(&clock, why, sizeof(why), NULL) == ZPLC_PORT_TIMING_SLEEP_TOO_LONG,
              "a sleep that takes more than a second beyond what it was given is refused");
}

int main(void) {
  printf("ZPLC port conformance: timing self-test (" ZPLC_TEST_PORT_NAME ")\n");
  test_the_clock_of_the_posix_port();
  test_the_self_test_finds_a_broken_clock();
  printf("\n%d tests, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
