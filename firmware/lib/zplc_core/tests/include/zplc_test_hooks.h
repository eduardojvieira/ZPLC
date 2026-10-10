/**
 * @file zplc_test_hooks.h
 * @brief Test-only entry points of the core, the schedulers and the HALs (RT-033).
 *
 * SPDX-License-Identifier: MIT
 *
 * These functions exist so that a test can inject a failure, hold a scan at a
 * known point or read a counter. They are not part of the runtime interface:
 * no header under `firmware/lib/zplc_core/include` declares them, and a
 * product build does not define most of them (each definition is behind
 * `CONFIG_ZTEST`, `ZPLC_CORE_TESTING` or `ZPLC_HAL_PERSIST_TESTING`). A test
 * includes this header; the include directory is `firmware/lib/zplc_core/tests/include`.
 *
 * The suite `test_public_headers` fails when a name of `zplc_test_hook_names.def`
 * is declared by a public header again.
 */

#ifndef ZPLC_TEST_HOOKS_H
#define ZPLC_TEST_HOOKS_H

#include <stddef.h>
#include <stdint.h>

#include <zplc_hal.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * Core (defined when ZPLC_CORE_TESTING is set for zplc_core.c)
 * ============================================================================
 */

/** @brief Copy code into the code region at an offset, without the loader. */
int zplc_test_mem_load_code(const uint8_t *code, size_t size, uint16_t offset);

/** @brief Load raw bytecode into the default VM without the loader. */
int zplc_test_load_raw(const uint8_t *bytecode, size_t size);

/** @brief Work (steps) and iterations of the last loader verification. */
uint32_t zplc_test_verify_work(void);
uint32_t zplc_test_verify_iterations(void);

/* ============================================================================
 * POSIX HAL persistence (defined when ZPLC_HAL_PERSIST_TESTING is set)
 * ============================================================================
 */

/** @brief Fail the n-th persistence operation (1-based; 0 clears). */
void zplc_hal_persist_test_fail_at(unsigned long operation);
/** @brief Result the injected failure returns (default ZPLC_HAL_ERROR). */
void zplc_hal_persist_test_fail_result(zplc_hal_result_t result);
/** @brief Number of persistence operations since the last fail_at call. */
unsigned long zplc_hal_persist_test_operation_count(void);
/**
 * @brief Cut the power at the n-th persistence operation (1-based): that operation and every later one fail,
 *        until zplc_hal_persist_test_fail_at(0) is called (RT-031).
 */
void zplc_hal_persist_test_power_cut_at(unsigned long operation);
/**
 * @brief The save at the n-th operation leaves only the first @p bytes of its data in the final file, and the
 *        power is cut as for zplc_hal_persist_test_power_cut_at (a torn write, RT-031).
 */
void zplc_hal_persist_test_tear_at(unsigned long operation, size_t bytes);
/** @brief 1 when the injected failure fired. */
int zplc_hal_persist_test_failure_triggered(void);
/** @brief Fail every parent-directory sync (enabled) or none. */
void zplc_hal_persist_test_parent_sync_fail(int enabled);
/** @brief Fail the n-th parent-directory sync. */
void zplc_hal_persist_test_parent_sync_fail_at(unsigned long attempt);
/** @brief Number of parent-directory syncs since the last fail call. */
unsigned long zplc_hal_persist_test_parent_sync_attempts(void);

/* ============================================================================
 * Zephyr HAL and scheduler (defined when CONFIG_ZTEST is set)
 * ============================================================================
 */

#ifdef CONFIG_ZTEST

/** @brief One-shot failure of the next shutdown GPIO safe-off write. */
void zplc_hal_test_fail_next_safe_off(void);

/** @brief Hold the next scan batch after its tasks ran, before the commit. */
void zplc_sched_test_hold_before_commit(void);
int zplc_sched_test_wait_before_commit(int timeout_ms);
void zplc_sched_test_release_before_commit(void);
void zplc_sched_test_reset_debug_before_mem(void);
int zplc_sched_test_wait_debug_before_mem(int timeout_ms);
void zplc_sched_test_fail_next_output_commit(uint8_t channel,
                                             zplc_hal_result_t result);
uint8_t zplc_sched_test_output_commit_write_count(void);
void zplc_sched_test_fail_next_gpio_read(uint8_t channel,
                                         zplc_hal_result_t result);
void zplc_sched_test_fail_next_watchdog_prepare(int result);
void zplc_sched_test_fail_next_watchdog_setup(int result);
void zplc_sched_test_fail_next_watchdog_feed(int result);
void zplc_sched_test_fail_next_watchdog_disarm(int result);
void zplc_sched_test_fail_safe_outputs(int result);
uint32_t zplc_sched_test_watchdog_prepare_count(void);
uint32_t zplc_sched_test_watchdog_feed_count(void);
uint32_t zplc_sched_test_watchdog_disarm_count(void);
void zplc_sched_test_force_next_deadline_miss(void);
/** @brief Make the next take of the control (non-zero) or memory (zero) mutex fail with result (RT-030). */
void zplc_sched_test_fail_next_lock(int result, int control_lock);

/* Seams for the portable release and duration arithmetic. */
int zplc_sched_test_release_before(uint64_t left_uptime_ms,
                                   uint32_t left_cycle32, uint8_t left_priority,
                                   uint16_t left_id, uint64_t right_uptime_ms,
                                   uint32_t right_cycle32,
                                   uint8_t right_priority, uint16_t right_id);
uint32_t zplc_sched_test_elapsed_us(uint64_t start_uptime_ms,
                                    uint32_t start_cycle32,
                                    uint64_t end_uptime_ms,
                                    uint32_t end_cycle32);
int zplc_sched_test_deadline_missed(uint64_t release_uptime_ms,
                                    uint32_t release_cycle32,
                                    uint64_t end_uptime_ms,
                                    uint32_t end_cycle32, uint32_t interval_us);
int zplc_sched_test_admit_release(int task_id);

#endif /* CONFIG_ZTEST */

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_TEST_HOOKS_H */
