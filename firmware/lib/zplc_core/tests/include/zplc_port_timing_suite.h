/**
 * @file zplc_port_timing_suite.h
 * @brief The timing self-test of the port conformance suite (IO-013).
 *
 * SPDX-License-Identifier: MIT
 *
 * A port gives the portable core a millisecond clock (zplc_hal_tick) and a blocking sleep (zplc_hal_sleep). The
 * scheduler cannot decide anything correct on a clock that goes backwards, that stands still, that counts in the
 * wrong unit or that is coarser than the shortest task interval, and nothing else in the suites would notice: they
 * drive the core with a clock of their own. This is the one test that asks the clock of the port, with nothing
 * but the HAL header.
 *
 * The same function runs on every port that has a HAL: the POSIX host (test_port_timing.c, under ctest) and the
 * Zephyr HAL on native_sim and QEMU (firmware/tests/port_timing). The clock is passed in, so that the test of the
 * suite can hand it a clock that is broken in each of the ways it claims to find.
 *
 * It measures the clock against itself and bounds what it measures generously: a sleep of 50 ms must take 50 ms
 * and not more than a second. It makes no claim about jitter or about the cost of a scan (that is the bench,
 * HIL-010).
 */

#ifndef ZPLC_PORT_TIMING_SUITE_H
#define ZPLC_PORT_TIMING_SUITE_H

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

/** @brief The clock of a port: what the portable core reads. */
typedef struct {
  uint32_t (*tick)(void);
  void (*sleep_ms)(uint32_t ms);
} zplc_port_clock_t;

/** @brief What the self-test measured, for the log of the run. */
typedef struct {
  uint32_t resolution_ms; /**< the smallest advance of the tick that a sleep of 1 ms was seen to make */
  uint32_t sleep_50_ms;   /**< how long a sleep of 50 ms took, by the clock itself */
} zplc_port_timing_report_t;

#define ZPLC_PORT_TIMING_OK 0
#define ZPLC_PORT_TIMING_NOT_MONOTONIC (-1)
#define ZPLC_PORT_TIMING_STANDS_STILL (-2)
#define ZPLC_PORT_TIMING_TOO_COARSE (-3)
#define ZPLC_PORT_TIMING_SLEEP_TOO_SHORT (-4)
#define ZPLC_PORT_TIMING_SLEEP_TOO_LONG (-5)

/**
 * @brief The coarsest advance of a sleep of 1 ms that the self-test accepts.
 *
 * A floor, not a promise: a clock that cannot do better than 50 ms cannot time a scan at all. The value that a port
 * reaches is reported, and written in docs/docs/runtime/port-interface.md: the Zephyr targets of the suite report
 * 20 ms, because their kernel tick is 10 ms and k_msleep() rounds a sleep up by one tick, so a task interval
 * below that is released at the tick and not at the interval.
 */
#define ZPLC_PORT_TIMING_MAX_RESOLUTION_MS 50U
/** @brief The slack that a sleep of 50 ms may take on top of its time before the port is called wrong. */
#define ZPLC_PORT_TIMING_MAX_OVERSLEEP_MS 1000U

/**
 * @brief Run the timing self-test against a clock.
 * @param why        receives the first check that failed, in a sentence; may be NULL
 * @param report     receives what was measured; may be NULL
 * @return ZPLC_PORT_TIMING_OK, or the code of the first check that failed
 */
static inline int zplc_port_timing_selftest(const zplc_port_clock_t *clock, char *why, size_t why_size, zplc_port_timing_report_t *report) {
  uint32_t previous;
  uint32_t now;
  uint32_t step;
  uint32_t start;
  uint32_t elapsed;
  uint32_t reads;
  zplc_port_timing_report_t local = {0U, 0U};
  zplc_port_timing_report_t *out = (report != NULL) ? report : &local;

#define ZPLC_PORT_TIMING_FAIL(code, ...)          \
  do {                                            \
    if (why != NULL && why_size > 0U) {           \
      (void)snprintf(why, why_size, __VA_ARGS__); \
    }                                             \
    return (code);                                \
  } while (0)

  /* 1. The clock never goes backwards, and never jumps by a second between two reads that follow each other.
   *    Differences are taken as unsigned 32-bit values, which is what the scheduler does across a wrap. */
  previous = clock->tick();
  for (reads = 0U; reads < 2000U; reads++) {
    now = clock->tick();
    step = now - previous;
    if (step > 0x7FFFFFFFU) {
      ZPLC_PORT_TIMING_FAIL(ZPLC_PORT_TIMING_NOT_MONOTONIC, "the tick went backwards: %lu then %lu", (unsigned long)previous,
                            (unsigned long)now);
    }
    if (step > 1000U) {
      ZPLC_PORT_TIMING_FAIL(ZPLC_PORT_TIMING_NOT_MONOTONIC, "the tick jumped by %lu ms between two reads: it does not count milliseconds",
                            (unsigned long)step);
    }
    previous = now;
  }

  /* 2. The clock advances, and in steps the scheduler can use. A sleep of 1 ms moves a millisecond clock by at least
   *    1 ms and never by less, so a step of zero is a clock that stands still. The smallest advance over ten sleeps
   *    is the resolution of the clock: a thread that is descheduled during a sleep sees a larger step, never a
   *    smaller one, so the minimum does not depend on the load of the machine. The clock is not read in a spin,
   *    because a simulated kernel (native_sim) does not advance its time while the thread runs. A resolution above
   *    ZPLC_PORT_TIMING_MAX_RESOLUTION_MS is a clock that cannot time a scan. */
  out->resolution_ms = UINT32_MAX;
  for (reads = 0U; reads < 10U; reads++) {
    start = clock->tick();
    clock->sleep_ms(1U);
    step = clock->tick() - start;
    if (step == 0U) {
      ZPLC_PORT_TIMING_FAIL(ZPLC_PORT_TIMING_STANDS_STILL, "the tick stood still at %lu through a sleep of 1 ms", (unsigned long)start);
    }
    if (step < out->resolution_ms) {
      out->resolution_ms = step;
    }
  }
  if (out->resolution_ms > ZPLC_PORT_TIMING_MAX_RESOLUTION_MS) {
    ZPLC_PORT_TIMING_FAIL(ZPLC_PORT_TIMING_TOO_COARSE, "the smallest step of the tick is %lu ms; the scheduler needs %lu ms or finer",
                          (unsigned long)out->resolution_ms, (unsigned long)ZPLC_PORT_TIMING_MAX_RESOLUTION_MS);
  }

  /* 3. A blocking sleep takes the time it was given, by the clock itself: not less (a task would run early),
   *    and not a second more (a task would be late for no reason the program can see). */
  start = clock->tick();
  clock->sleep_ms(50U);
  elapsed = clock->tick() - start;
  out->sleep_50_ms = elapsed;
  if (elapsed < 50U) {
    ZPLC_PORT_TIMING_FAIL(ZPLC_PORT_TIMING_SLEEP_TOO_SHORT, "a sleep of 50 ms took %lu ms by the tick", (unsigned long)elapsed);
  }
  if (elapsed > 50U + ZPLC_PORT_TIMING_MAX_OVERSLEEP_MS) {
    ZPLC_PORT_TIMING_FAIL(ZPLC_PORT_TIMING_SLEEP_TOO_LONG, "a sleep of 50 ms took %lu ms by the tick", (unsigned long)elapsed);
  }
#undef ZPLC_PORT_TIMING_FAIL
  return ZPLC_PORT_TIMING_OK;
}

#endif /* ZPLC_PORT_TIMING_SUITE_H */
