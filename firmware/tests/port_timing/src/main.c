/*
 * IO-013: the timing self-test of the port conformance suite, on the clock of the Zephyr port.
 *
 * The function is the one that the POSIX host runs (firmware/lib/zplc_core/tests/test_port_timing.c): it sees the
 * port through zplc_hal_tick() and zplc_hal_sleep() and nothing else. Here those are the functions of the Zephyr HAL
 * that the product links, on whatever the suite runs on: the simulated kernel of native_sim, or QEMU.
 */
#include <zephyr/ztest.h>

#include <zplc_hal.h>

#include "zplc_port_timing_suite.h"

ZTEST(port_timing, test_the_clock_of_the_zephyr_port_passes_the_timing_self_test)
{
	char why[128] = "";
	zplc_port_timing_report_t report = {0};
	const zplc_port_clock_t clock = {zplc_hal_tick, zplc_hal_sleep};
	const int code = zplc_port_timing_selftest(&clock, why, sizeof(why), &report);

	TC_PRINT("tick resolution %u ms, a sleep of 50 ms took %u ms\n", report.resolution_ms, report.sleep_50_ms);
	zassert_equal(code, ZPLC_PORT_TIMING_OK, "%s", why);
	zassert_true(report.resolution_ms >= 1U, "a resolution of %u ms", report.resolution_ms);
	zassert_true(report.sleep_50_ms >= 50U, "a sleep of 50 ms took %u ms", report.sleep_50_ms);
}

ZTEST(port_timing, test_the_tick_is_a_wrap_safe_unsigned_count_of_milliseconds)
{
	/* the scheduler measures elapsed time as (uint32_t)(now - then): the difference of two reads that follow
	 * each other is small and non-negative whatever the absolute value of the tick is */
	const uint32_t first = zplc_hal_tick();
	const uint32_t second = zplc_hal_tick();

	zassert_true((uint32_t)(second - first) < 1000U, "two reads differ by %u ms", (uint32_t)(second - first));
}

ZTEST_SUITE(port_timing, NULL, NULL, NULL, NULL, NULL);
