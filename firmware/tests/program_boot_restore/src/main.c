#include <string.h>

#include <zephyr/ztest.h>

#include "program_boot_restore.h"
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>

#define PROGRAM_CAPACITY 256U
#define WORKSPACE_CAPACITY (PROGRAM_CAPACITY + ZPLC_PROGRAM_STORE_FOOTER_SIZE)

static uint8_t stored_program[WORKSPACE_CAPACITY];
static size_t stored_size;
static zplc_program_store_restore_t stored_result;
static int stored_commit_result;

static zplc_program_store_restore_t test_store_restore(uint8_t *workspace,
                                                        size_t workspace_capacity,
                                                        size_t *program_size) {
  if (stored_result == ZPLC_PROGRAM_STORE_OK ||
      stored_result == ZPLC_PROGRAM_STORE_LEGACY) {
    if (stored_size > workspace_capacity)
      return ZPLC_PROGRAM_STORE_ERROR;
    memcpy(workspace, stored_program, stored_size);
    *program_size = stored_size;
  } else {
    *program_size = 0U;
  }
  return stored_result;
}

static int test_store_commit(uint8_t *workspace, size_t program_size,
                             size_t workspace_capacity) {
  if (stored_commit_result == ZPLC_PROGRAM_STORE_COMMIT_OK) {
    zassert_true(program_size <= workspace_capacity, "valid migration input");
    memcpy(stored_program, workspace, program_size);
    stored_size = program_size;
    stored_result = ZPLC_PROGRAM_STORE_OK;
  }
  return stored_commit_result;
}

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length) {
  size_t index;
  for (index = 0U; index < length; ++index) {
    uint32_t bit;
    crc ^= data[index];
    for (bit = 0U; bit < 8U; ++bit)
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
  }
  return crc;
}

static void put_u16(uint8_t *data, uint16_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
}

static void put_u32(uint8_t *data, uint32_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
  data[2] = (uint8_t)(value >> 16);
  data[3] = (uint8_t)(value >> 24);
}

static size_t build_program(uint8_t *program, uint8_t output_value) {
  uint8_t code[] = {OP_PUSH8, output_value, OP_STORE8,
                    (uint8_t)ZPLC_MEM_OPI_BASE,
                    (uint8_t)(ZPLC_MEM_OPI_BASE >> 8), OP_HALT};
  const size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t task_offset = code_offset + sizeof(code);
  const size_t total = task_offset + ZPLC_TASK_DEF_SIZE;
  uint32_t crc;

  memset(program, 0, total);
  memcpy(program, "ZPLC", 4U);
  put_u16(program + 4U, ZPLC_VERSION_MAJOR);
  put_u16(program + 6U, ZPLC_VERSION_MINOR);
  put_u32(program + 16U, sizeof(code));
  put_u32(program + 20U, ZPLC_TASK_DEF_SIZE);
  put_u16(program + 26U, 2U);
  put_u16(program + 32U, ZPLC_SEG_CODE);
  put_u32(program + 36U, sizeof(code));
  put_u16(program + 40U, ZPLC_SEG_TASK);
  put_u32(program + 44U, ZPLC_TASK_DEF_SIZE);
  memcpy(program + code_offset, code, sizeof(code));
  put_u16(program + task_offset, 1U);
  program[task_offset + 2U] = ZPLC_TASK_CYCLIC;
  put_u32(program + task_offset + 4U, 10000U);
  put_u16(program + task_offset + 10U, 32U);
  crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, total - 16U) ^ 0xFFFFFFFFU;
  put_u32(program + 12U, crc);
  return total;
}

static void refresh_program_crc(uint8_t *program, size_t size) {
  uint32_t crc = crc32_update(0xFFFFFFFFU, program, 12U);

  crc = crc32_update(crc, program + 16U, size - 16U) ^ 0xFFFFFFFFU;
  put_u32(program + 12U, crc);
}

static void boot_setup(void) {
  memset(stored_program, 0, sizeof(stored_program));
  stored_size = 0U;
  stored_result = ZPLC_PROGRAM_STORE_EMPTY;
  stored_commit_result = ZPLC_PROGRAM_STORE_COMMIT_OK;
  zplc_boot_restore_test_set_store(test_store_restore, test_store_commit);
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "HAL init");
  zassert_ok(zplc_core_init(), "core init");
  zassert_ok(zplc_sched_init(), "scheduler init");
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_OK);
}

static void boot_teardown(void) {
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_OK);
  zplc_boot_restore_test_set_store(NULL, NULL);
  zassert_ok(zplc_sched_shutdown(), "scheduler shutdown");
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "HAL shutdown");
}

static int restore(uint8_t *resident, size_t *resident_size) {
  uint8_t staging[WORKSPACE_CAPACITY];
  return zplc_boot_restore_scheduler(staging, sizeof(staging), resident,
                                     PROGRAM_CAPACITY, resident_size);
}

ZTEST(program_boot_restore, test_verified_active_is_ready_idle_and_safe) {
  uint8_t resident[PROGRAM_CAPACITY];
  zplc_task_t task;
  size_t resident_size;
  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_equal(restore(resident, &resident_size), 1, "one task restored");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "restore never auto-starts");
  zassert_equal(resident_size, stored_size, "resident published after validation");
  zassert_mem_equal(resident, stored_program, stored_size, "resident artifact");
  zassert_ok(zplc_sched_get_task(0, &task), "read restored task");
  zassert_equal(task.stats.cycle_count, 0U, "restore never executes a cycle");
  zassert_equal(zplc_core_get_opi(0U), 0U, "outputs remain safe");
  zassert_equal(zplc_force_get_count(), 0U, "no forces on boot");
  boot_teardown();
}

ZTEST(program_boot_restore, test_verified_fallback_stays_idle) {
  uint8_t resident[PROGRAM_CAPACITY];
  uint8_t expected[PROGRAM_CAPACITY];
  size_t resident_size;
  size_t expected_size;
  boot_setup();
  expected_size = build_program(expected, 1U);
  memcpy(stored_program, expected, expected_size);
  stored_size = expected_size;
  stored_result = ZPLC_PROGRAM_STORE_OK; /* Store has selected verified A. */
  zassert_equal(restore(resident, &resident_size), 1, "verified fallback restores");
  zassert_equal(resident_size, expected_size, "fallback size");
  zassert_mem_equal(resident, expected, expected_size, "only verified A published");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "still not running");
  boot_teardown();
}

ZTEST(program_boot_restore, test_invalid_payload_latches_safe_error) {
  uint8_t resident[PROGRAM_CAPACITY];
  size_t resident_size = 99U;
  size_t invalid_size;
  boot_setup();
  invalid_size = build_program(stored_program, 1U);
  stored_size = invalid_size;
  stored_program[ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE] = 0xFFU;
  refresh_program_crc(stored_program, invalid_size);
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_equal(restore(resident, &resident_size), ZPLC_BOOT_RESTORE_ERROR,
                "invalid payload rejected");
  zassert_equal(resident_size, 0U, "nothing published");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR, "safe error");
  zassert_true(zplc_sched_start() != 0, "start rejected after restore fault");
  zassert_equal(zplc_core_get_opi(0U), 0U, "outputs remain safe");
  stored_size = build_program(stored_program, 1U);
  zassert_equal(restore(resident, &resident_size), 1,
                "verified replacement recovers empty error scheduler");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "recovered idle");
  zassert_ok(zplc_sched_start(), "recovered candidate may start explicitly");
  boot_teardown();
}

ZTEST(program_boot_restore, test_legacy_commit_unknown_latches_safe_error) {
  uint8_t resident[PROGRAM_CAPACITY];
  size_t resident_size = 99U;
  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_LEGACY;
  stored_commit_result = ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN;
  zassert_equal(restore(resident, &resident_size),
                ZPLC_BOOT_RESTORE_COMMIT_UNKNOWN,
                "ambiguous legacy migration fails closed");
  zassert_equal(resident_size, 0U, "legacy artifact never published");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR, "safe error");
  zassert_true(zplc_sched_start() != 0, "start remains rejected");
  boot_teardown();
}

ZTEST(program_boot_restore, test_empty_store_keeps_scheduler_safe_and_unloaded) {
  uint8_t resident[PROGRAM_CAPACITY];
  size_t resident_size = 99U;

  boot_setup();
  zassert_equal(restore(resident, &resident_size), ZPLC_BOOT_RESTORE_EMPTY,
                "empty store is an explicit safe boot");
  zassert_equal(resident_size, 0U, "no resident program");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "idle safely");
  zassert_equal(zplc_core_get_opi(0U), 0U, "outputs safe");
  zassert_equal(zplc_force_get_count(), 0U, "forces clear");
  zassert_true(zplc_sched_start() != 0, "start rejected without tasks");
  boot_teardown();
}

ZTEST(program_boot_restore, test_legacy_prepare_confirms_migration_before_ready) {
  uint8_t staging[WORKSPACE_CAPACITY];
  uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
  size_t program_size = 99U;
  uint32_t interval_ms = 0U;

  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_LEGACY;
  zassert_equal(zplc_boot_restore_legacy_prepare(
                    staging, sizeof(staging), workspace, sizeof(workspace),
                    &program_size, &interval_ms),
                ZPLC_BOOT_RESTORE_READY, "confirmed migration is ready");
  zassert_equal(program_size, stored_size, "legacy artifact size");
  zassert_equal(interval_ms, 10U, "legacy interval in milliseconds");
  zassert_equal(stored_result, ZPLC_PROGRAM_STORE_OK,
                "migration is committed before publication");
  boot_teardown();
}

ZTEST(program_boot_restore, test_legacy_prepare_commit_unknown_clears_staging) {
  uint8_t staging[WORKSPACE_CAPACITY];
  uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
  size_t program_size = 99U;
  uint32_t interval_ms = 0U;
  size_t index;

  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_LEGACY;
  stored_commit_result = ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN;
  memset(staging, 0xA5, sizeof(staging));
  zassert_equal(zplc_boot_restore_legacy_prepare(
                    staging, sizeof(staging), workspace, sizeof(workspace),
                    &program_size, &interval_ms),
                ZPLC_BOOT_RESTORE_COMMIT_UNKNOWN,
                "ambiguous publication stays distinguishable");
  zassert_equal(program_size, 0U, "nothing published");
  for (index = 0U; index < sizeof(staging); ++index)
    zassert_equal(staging[index], 0U, "staging is cleared");
  boot_teardown();
}

ZTEST_SUITE(program_boot_restore, NULL, NULL, NULL, NULL, NULL);
