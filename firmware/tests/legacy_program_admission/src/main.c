#include <string.h>

#include <zephyr/ztest.h>

#include "program_admission.h"
#include <zplc_isa.h>
#include <zplc_loader.h>

#define PROGRAM_CAPACITY 128U

static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length) {
  size_t index;

  for (index = 0U; index < length; index++) {
    uint32_t bit;

    crc ^= data[index];
    for (bit = 0U; bit < 8U; bit++) {
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
  }
  return crc;
}

static void write_u16_le(uint8_t *data, uint16_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
}

static void write_u32_le(uint8_t *data, uint32_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
  data[2] = (uint8_t)(value >> 16);
  data[3] = (uint8_t)(value >> 24);
}

static size_t build_program(uint8_t *program, uint8_t task_count,
                            uint8_t task_type, uint32_t interval_us) {
  const uint8_t code[] = {OP_NOP, OP_HALT};
  size_t task_bytes = (size_t)task_count * ZPLC_TASK_DEF_SIZE;
  uint16_t segment_count = task_count == 0U ? 1U : 2U;
  size_t offset =
      ZPLC_FILE_HEADER_SIZE + (size_t)segment_count * ZPLC_SEGMENT_ENTRY_SIZE;
  size_t total = offset + sizeof(code) + task_bytes;
  uint8_t index;
  uint32_t crc;

  zassert_true(total <= PROGRAM_CAPACITY, "program too large");
  memset(program, 0, total);
  memcpy(program, "ZPLC", 4U);
  write_u16_le(program + 4U, ZPLC_VERSION_MAJOR);
  write_u16_le(program + 6U, ZPLC_VERSION_MINOR);
  write_u32_le(program + 16U, sizeof(code));
  write_u32_le(program + 20U, (uint32_t)task_bytes);
  write_u16_le(program + 26U, segment_count);
  write_u16_le(program + 32U, ZPLC_SEG_CODE);
  write_u32_le(program + 36U, sizeof(code));
  if (task_count != 0U) {
    write_u16_le(program + 40U, ZPLC_SEG_TASK);
    write_u32_le(program + 44U, (uint32_t)task_bytes);
  }
  memcpy(program + offset, code, sizeof(code));
  for (index = 0U; index < task_count; index++) {
    uint8_t *task =
        program + offset + sizeof(code) + (size_t)index * ZPLC_TASK_DEF_SIZE;

    write_u16_le(task, index);
    task[2] = task_type;
    write_u32_le(task + 4U, interval_us);
    write_u16_le(task + 10U, 16U);
  }
  crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, total - 16U) ^ 0xFFFFFFFFU;
  write_u32_le(program + 12U, crc);
  return total;
}

ZTEST(legacy_program_admission, test_accepts_single_cyclic_task) {
  uint8_t program[PROGRAM_CAPACITY];
  uint32_t interval_ms = 0U;
  size_t size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 13000U);

  zassert_ok(zplc_program_admit_legacy(program, size, workspace,
                                       sizeof(workspace), &interval_ms),
             "single cyclic program must be admitted");
  zassert_equal(interval_ms, 13U, "cyclic interval must be preserved in ms");
}

ZTEST(legacy_program_admission, test_accepts_program_without_tasks) {
  uint8_t program[PROGRAM_CAPACITY];
  uint32_t interval_ms = 0U;
  size_t size = build_program(program, 0U, ZPLC_TASK_CYCLIC, 0U);

  zassert_ok(zplc_program_admit_legacy(program, size, workspace,
                                       sizeof(workspace), &interval_ms),
             "entry-point-only program must be admitted");
  zassert_equal(interval_ms, 100U, "code-only programs use the legacy default");
}

ZTEST(legacy_program_admission, test_rejects_raw_crc_multitask_and_event) {
  uint8_t program[PROGRAM_CAPACITY];
  uint32_t interval_ms = 0xA5A5A5A5U;
  size_t size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U);

  zassert_equal(zplc_program_admit_legacy(program + 1U, size - 1U, workspace,
                                          sizeof(workspace), &interval_ms),
                ZPLC_LOADER_ERR_MAGIC, "raw bytes must be rejected");
  zassert_equal(interval_ms, 0xA5A5A5A5U, "rejection must preserve interval");
  program[12U] ^= 1U;
  zassert_equal(zplc_program_admit_legacy(program, size, workspace,
                                          sizeof(workspace), &interval_ms),
                ZPLC_LOADER_ERR_CRC32, "bad CRC must be rejected");

  size = build_program(program, 2U, ZPLC_TASK_CYCLIC, 1000U);
  zassert_equal(zplc_program_admit_legacy(program, size, workspace,
                                          sizeof(workspace), &interval_ms),
                ZPLC_LOADER_ERR_TASK, "multiple tasks must be rejected");
  size = build_program(program, 1U, ZPLC_TASK_EVENT, 1000U);
  zassert_equal(zplc_program_admit_legacy(program, size, workspace,
                                          sizeof(workspace), &interval_ms),
                ZPLC_LOADER_ERR_TASK, "event task must be rejected");
  size = build_program(program, 1U, ZPLC_TASK_INIT, 1000U);
  zassert_equal(zplc_program_admit_legacy(program, size, workspace,
                                          sizeof(workspace), &interval_ms),
                ZPLC_LOADER_ERR_TASK, "init task must be rejected");
  zassert_equal(interval_ms, 0xA5A5A5A5U,
                "task rejection must preserve interval");
}

ZTEST(legacy_program_admission, test_accepts_exact_millisecond_intervals) {
  uint8_t program[PROGRAM_CAPACITY];
  uint32_t interval_ms;
  size_t size;

  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U);
  zassert_ok(zplc_program_admit_legacy(program, size, workspace,
                                       sizeof(workspace), &interval_ms),
             "one millisecond interval must be admitted");
  zassert_equal(interval_ms, 1U, "one millisecond must be preserved");

  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 3600000000U);
  zassert_ok(zplc_program_admit_legacy(program, size, workspace,
                                       sizeof(workspace), &interval_ms),
             "one hour interval must be admitted");
  zassert_equal(interval_ms, 3600000U, "one hour must be preserved");
}

ZTEST(legacy_program_admission, test_rejects_non_millisecond_intervals) {
  static const uint32_t invalid_intervals[] = {999U, 1500U, 3600001000U,
                                               UINT32_MAX};
  uint8_t program[PROGRAM_CAPACITY];
  size_t index;

  for (index = 0U; index < ARRAY_SIZE(invalid_intervals); index++) {
    uint32_t interval_ms = 0xA5A5A5A5U;
    size_t size =
        build_program(program, 1U, ZPLC_TASK_CYCLIC, invalid_intervals[index]);

    zassert_equal(zplc_program_admit_legacy(program, size, workspace,
                                            sizeof(workspace), &interval_ms),
                  ZPLC_LOADER_ERR_TASK, "invalid interval must be rejected");
    zassert_equal(interval_ms, 0xA5A5A5A5U,
                  "rejection must preserve interval output");
  }
}

ZTEST_SUITE(legacy_program_admission, NULL, NULL, NULL, NULL, NULL);
