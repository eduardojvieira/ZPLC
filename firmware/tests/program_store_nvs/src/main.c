/*
 * The program store on the Zephyr HAL and NVS (RT-028, RT-031).
 *
 * The firmware's program store (firmware/app/src/program_store.c) is the core's shared store (RT-032) over
 * zplc_hal_persist_*, which on a board is NVS in the storage partition. The partition here is 128 KB of simulated
 * flash in 4 KB sectors, which is what two program slots of the default code size need. The artifacts are real:
 * the loader verifies each of them.
 *
 * This is simulator evidence: it shows that the largest artifact is stored in chunks that NVS accepts, restored,
 * replaced and rolled back, and that the build-time rule of the HAL holds for this partition. It does not show that
 * a board's flash survives a power cut mid-write.
 */
#include <stdio.h>
#include <string.h>

#include <zephyr/ztest.h>

#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_loader.h>

#include "program_store.h"

#define LARGEST ((size_t)ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE)
#define CHUNK ((size_t)ZPLC_PROGRAM_STORE_CHUNK_SIZE)

static uint8_t store_workspace[LARGEST + ZPLC_PROGRAM_STORE_FOOTER_SIZE];
static uint8_t expected_a[LARGEST];
static uint8_t expected_b[LARGEST];

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

/* A container with a single CODE segment of `total - header - one entry` bytes: NOPs ending with the instruction
 * that carries `tag`, so that two programs of the same size differ. The CRC is the loader's. */
static void build_artifact(uint8_t *out, size_t total, uint8_t tag) {
  const size_t header = ZPLC_FILE_HEADER_SIZE + ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t code_size = total - header;
  uint32_t crc;

  memset(out, 0, total);
  memcpy(out, "ZPLC", 4U);
  put_u16(out + 4U, ZPLC_VERSION_MAJOR);
  put_u16(out + 6U, ZPLC_VERSION_MINOR);
  put_u32(out + 28U, ZPLC_DRAFT_COUNTER);
  put_u32(out + 16U, (uint32_t)code_size);
  put_u16(out + 26U, 1U);
  put_u16(out + 32U, ZPLC_SEG_CODE);
  put_u32(out + 36U, (uint32_t)code_size);
  memset(out + header, OP_NOP, code_size);
  out[header + code_size - 3U] = OP_PUSH8;
  out[header + code_size - 2U] = tag;
  out[header + code_size - 1U] = OP_HALT;
  crc = crc32_update(0xFFFFFFFFU, out, 12U);
  crc = crc32_update(crc, out + 16U, total - 16U) ^ 0xFFFFFFFFU;
  put_u32(out + 12U, crc);
}

static int commit(const uint8_t *program, size_t size) {
  memset(store_workspace, 0xA5, sizeof(store_workspace));
  memcpy(store_workspace, program, size);
  return zplc_program_store_commit(store_workspace, size, sizeof(store_workspace));
}

static zplc_program_store_restore_t restore(size_t *size) {
  memset(store_workspace, 0x5A, sizeof(store_workspace));
  return zplc_program_store_restore(store_workspace, sizeof(store_workspace), size);
}

static void *suite_setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "HAL init");
  return NULL;
}

ZTEST(program_store_nvs, test_the_largest_artifact_is_the_configured_code_size) {
  zassert_equal(LARGEST, (size_t)ZPLC_MEM_CODE_SIZE, "largest artifact is the code region");
  zassert_equal(ZPLC_MEM_CODE_SIZE, CONFIG_ZPLC_CODE_SIZE_MAX, "and the configured code size");
  zassert_true(LARGEST > CHUNK, "so it is stored in chunks");
}

ZTEST(program_store_nvs, test_largest_artifact_deploys_restores_and_rolls_back) {
  size_t restored = 0U;
  size_t size;

  build_artifact(expected_a, LARGEST, 0x11U);
  zassert_ok(commit(expected_a, LARGEST), "the largest artifact commits to NVS");
  zassert_equal(restore(&restored), ZPLC_PROGRAM_STORE_OK, "and restores");
  zassert_equal(restored, LARGEST, "at its full size");
  zassert_mem_equal(store_workspace, expected_a, LARGEST, "byte for byte");

  build_artifact(expected_b, LARGEST, 0x22U);
  zassert_ok(commit(expected_b, LARGEST), "a second one of the same size goes to the other slot");
  zassert_equal(restore(&restored), ZPLC_PROGRAM_STORE_OK, "and restores");
  zassert_mem_equal(store_workspace, expected_b, LARGEST, "the new program is the one restored");

  /* Many deploys in a row rotate NVS through its sectors: garbage collection keeps both slots. */
  for (size = 0U; size < 6U; size++) {
    build_artifact(expected_a, LARGEST, (uint8_t)(0x30U + size));
    zassert_ok(commit(expected_a, LARGEST), "a repeated deploy commits");
  }
  zassert_equal(restore(&restored), ZPLC_PROGRAM_STORE_OK, "and restores after the sectors rotated");
  zassert_mem_equal(store_workspace, expected_a, LARGEST, "the last one");
}

ZTEST(program_store_nvs, test_chunk_boundaries_round_trip) {
  const size_t footer = ZPLC_PROGRAM_STORE_FOOTER_SIZE;
  const size_t sizes[] = {ZPLC_FILE_HEADER_SIZE + ZPLC_SEGMENT_ENTRY_SIZE + 3U,
                          CHUNK - footer - 1U, CHUNK - footer, CHUNK - footer + 1U,
                          2U * CHUNK - footer, 2U * CHUNK - footer + 1U, 7U * CHUNK + 5U};
  size_t restored = 0U;
  size_t index;

  for (index = 0U; index < ARRAY_SIZE(sizes); index++) {
    build_artifact(expected_a, sizes[index], (uint8_t)index);
    zassert_ok(commit(expected_a, sizes[index]), "commit at %u bytes", (unsigned)sizes[index]);
    zassert_equal(restore(&restored), ZPLC_PROGRAM_STORE_OK, "restore at %u bytes", (unsigned)sizes[index]);
    zassert_equal(restored, sizes[index], "size at %u bytes", (unsigned)sizes[index]);
    zassert_mem_equal(store_workspace, expected_a, sizes[index], "bytes at %u bytes", (unsigned)sizes[index]);
  }
}

ZTEST(program_store_nvs, test_a_damaged_chunk_falls_back_to_the_previous_program) {
  uint8_t junk[64];
  uint8_t active[16];
  char key[48];
  size_t restored = 0U;

  build_artifact(expected_a, 5U * CHUNK, 0x41U);
  build_artifact(expected_b, 6U * CHUNK, 0x42U);
  zassert_ok(commit(expected_a, 5U * CHUNK), "first program");
  zassert_ok(commit(expected_b, 6U * CHUNK), "second program");
  zassert_equal(restore(&restored), ZPLC_PROGRAM_STORE_OK, "restore");
  zassert_equal(restored, 6U * CHUNK, "the second is restored");

  /* A chunk in the middle of the slot the active record names is damaged. */
  memset(active, 0, sizeof(active));
  zassert_equal(zplc_hal_persist_load("program_v1_active", active, sizeof(active)), ZPLC_HAL_OK,
                "the active record is read");
  zassert_true(active[6] <= 1U, "it names a slot");
  (void)snprintf(key, sizeof(key), "program_v1_slot_%c_payload_2", active[6] == 0U ? 'a' : 'b');
  memset(junk, 0x77, sizeof(junk));
  zassert_equal(zplc_hal_persist_save(key, junk, sizeof(junk)), ZPLC_HAL_OK, "a chunk is overwritten");
  zassert_equal(restore(&restored), ZPLC_PROGRAM_STORE_OK, "the store still restores");
  zassert_equal(restored, 5U * CHUNK, "the previous program");
  zassert_mem_equal(store_workspace, expected_a, 5U * CHUNK, "complete, byte for byte");
}

ZTEST(program_store_nvs, test_only_the_keys_of_the_store_are_mapped) {
  uint8_t junk[8] = {0};

  zassert_equal(zplc_hal_persist_save("program_v1_slot_c_payload_2", junk, sizeof(junk)), ZPLC_HAL_ERROR,
                "a slot that does not exist");
  zassert_equal(zplc_hal_persist_save("program_v1_slot_a_payload_0", junk, sizeof(junk)), ZPLC_HAL_ERROR,
                "chunk 0 is the unnumbered key");
  zassert_equal(zplc_hal_persist_save("program_v1_slot_a_payload_x", junk, sizeof(junk)), ZPLC_HAL_ERROR,
                "a chunk number is decimal");
  zassert_equal(zplc_hal_persist_save("program_v1_slot_a_payload_9999", junk, sizeof(junk)), ZPLC_HAL_ERROR,
                "and below the number of chunks of the largest artifact");
}

ZTEST_SUITE(program_store_nvs, NULL, suite_setup, NULL, NULL, NULL);
