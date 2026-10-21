/**
 * @file test_core_start.c
 * @brief Cold and warm start are defined in the core, and a program load is a cold start (RT-016).
 *
 * SPDX-License-Identifier: MIT
 *
 * Loading a program replaced the variable memory on the host runtime and left it as it was on the Zephyr
 * scheduler, so a new program started on the old program's variables there. The definition is now the core's:
 *
 *   cold start   IPI, OPI, WORK and RETAIN are zero, the force table is empty
 *   warm start   IPI, OPI and WORK are zero, the force table is empty, RETAIN keeps its bytes
 *
 * and a program load (zplc_core_load, zplc_core_load_tasks) is a cold start, on every runtime that uses them.
 * Neither start touches the CODE region or the tags.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_bytes.h>
#include <zplc_core.h>
#include <zplc_crc32.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_loader.h>

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

static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

static void fill_memory(void) {
  memset(zplc_mem_get_region(ZPLC_MEM_IPI_BASE), 0x11, ZPLC_MEM_IPI_SIZE);
  memset(zplc_mem_get_region(ZPLC_MEM_OPI_BASE), 0x22, ZPLC_MEM_OPI_SIZE);
  memset(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), 0x33, ZPLC_MEM_WORK_SIZE);
  memset(zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), 0x44, ZPLC_MEM_RETAIN_SIZE);
}

static int all_equal(const uint8_t *bytes, size_t size, uint8_t value) {
  size_t index;

  for (index = 0U; index < size; index++) {
    if (bytes[index] != value) {
      return 0;
    }
  }
  return 1;
}

/* A container with a CODE segment and one cyclic task. */
static size_t build_artifact(uint8_t *out, size_t capacity, const uint8_t *code, size_t code_size) {
  const size_t total = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size + ZPLC_TASK_DEF_SIZE;
  size_t offset;
  uint32_t crc;

  if (total > capacity) {
    return 0U;
  }
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
  zplc_put_u16_le(out + offset, 0U); /* task id */
  out[offset + 2U] = ZPLC_TASK_CYCLIC;
  out[offset + 3U] = 1U;                      /* priority */
  zplc_put_u32_le(out + offset + 4U, 10000U); /* interval, us */
  zplc_put_u16_le(out + offset + 8U, 0U);     /* entry point */
  zplc_put_u16_le(out + offset + 10U, 16U);   /* stack */
  crc = zplc_crc32_update(0xFFFFFFFFU, out, 12U);
  crc = zplc_crc32_update(crc, out + 16U, total - 16U) ^ 0xFFFFFFFFU;
  zplc_put_u32_le(out + 12U, crc);
  return total;
}

static void test_cold_and_warm_start(void) {
  const uint8_t value = 0x7EU;

  printf("\n=== Test: cold start and warm start (RT-016) ===\n");
  CHECK(zplc_core_init() == 0, "core init");

  fill_memory();
  CHECK(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &value, 1U) == 0, "a force is set");
  zplc_core_cold_start();
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_IPI_BASE), ZPLC_MEM_IPI_SIZE, 0U), "cold start clears IPI");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_OPI_BASE), ZPLC_MEM_OPI_SIZE, 0U), "and OPI");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), ZPLC_MEM_WORK_SIZE, 0U), "and WORK");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), ZPLC_MEM_RETAIN_SIZE, 0U), "and RETAIN");
  CHECK(zplc_force_get_count() == 0U, "and clears the force table");

  fill_memory();
  CHECK(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &value, 1U) == 0, "a force is set again");
  zplc_core_warm_start();
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_IPI_BASE), ZPLC_MEM_IPI_SIZE, 0U), "warm start clears IPI");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_OPI_BASE), ZPLC_MEM_OPI_SIZE, 0U), "and OPI");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), ZPLC_MEM_WORK_SIZE, 0U), "and WORK");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), ZPLC_MEM_RETAIN_SIZE, 0x44U), "but keeps RETAIN");
  CHECK(zplc_force_get_count() == 0U, "and clears the force table");
}

static void test_a_program_load_is_a_cold_start(void) {
  static uint8_t artifact[256];
  const uint8_t code[] = {OP_NOP, OP_HALT};
  zplc_task_def_t tasks[ZPLC_LOADER_MAX_TASKS];
  const size_t size = build_artifact(artifact, sizeof(artifact), code, sizeof(code));
  const uint8_t value = 1U;

  printf("\n=== Test: loading a program is a cold start (RT-016) ===\n");
  CHECK(size != 0U, "a container is built");

  /* The load that the schedulers use. */
  fill_memory();
  CHECK(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &value, 1U) == 0, "a force is set");
  CHECK(zplc_core_load_tasks(artifact, size, tasks, ZPLC_LOADER_MAX_TASKS, workspace, sizeof(workspace)) == 1,
        "the program is loaded with its task");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), ZPLC_MEM_WORK_SIZE, 0U),
        "WORK starts at zero, not on the variables of the program it replaced");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), ZPLC_MEM_RETAIN_SIZE, 0U), "RETAIN starts at zero");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_OPI_BASE), ZPLC_MEM_OPI_SIZE, 0U), "OPI starts at zero");
  CHECK(zplc_force_get_count() == 0U, "no force survives");
  CHECK(zplc_mem_get_code_size() == sizeof(code), "and the new code is in place");

  /* The single-program load. */
  fill_memory();
  CHECK(zplc_core_load(artifact, size, workspace, sizeof(workspace)) == 0, "the single-program load");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), ZPLC_MEM_WORK_SIZE, 0U), "gives the same cold start");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), ZPLC_MEM_RETAIN_SIZE, 0U), "RETAIN included");
}

static void test_a_rejected_load_changes_nothing(void) {
  static uint8_t artifact[256];
  const uint8_t code[] = {OP_NOP, OP_HALT};
  zplc_task_def_t tasks[ZPLC_LOADER_MAX_TASKS];
  size_t size;

  printf("\n=== Test: a program the loader rejects does not touch the variables of the running one ===\n");
  size = build_artifact(artifact, sizeof(artifact), code, sizeof(code));
  fill_memory();
  artifact[ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE] ^= 0x01U; /* CRC-32 no longer matches */
  CHECK(zplc_core_load_tasks(artifact, size, tasks, ZPLC_LOADER_MAX_TASKS, workspace, sizeof(workspace)) < 0,
        "a damaged artifact is rejected");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), ZPLC_MEM_WORK_SIZE, 0x33U), "WORK is as it was");
  CHECK(all_equal(zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), ZPLC_MEM_RETAIN_SIZE, 0x44U), "and RETAIN");
}

int main(void) {
  test_cold_and_warm_start();
  test_a_program_load_is_a_cold_start();
  test_a_rejected_load_changes_nothing();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
