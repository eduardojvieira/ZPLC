/**
 * @file zplc_test_safe.h
 * @brief Test helper: declare safe values (RT-023) in an artifact a suite already builds.
 *
 * SPDX-License-Identifier: MIT
 *
 * The suites each build their own artifacts. This takes a whole one and appends a SAFE segment to it, so that a
 * suite states the declaration it wants (offset, bit, value) and keeps the program it already had. The header,
 * the segment table and the CRC-32 are rewritten; nothing else of the artifact moves.
 */

#ifndef ZPLC_TEST_SAFE_H
#define ZPLC_TEST_SAFE_H

#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include <zplc_isa.h>

/** @brief One SAFE entry as the bytes the loader reads: output image offset, bit, value. */
#define ZPLC_TEST_SAFE(offset, bit, value) \
  (uint8_t)((offset) & 0xFFU), (uint8_t)(((offset) >> 8) & 0xFFU), (uint8_t)(bit), (uint8_t)(value)

static inline uint32_t zplc_test_safe_crc(const uint8_t *data, size_t length, uint32_t crc) {
  size_t index;

  for (index = 0U; index < length; index++) {
    unsigned bit;

    crc ^= data[index];
    for (bit = 0U; bit < 8U; bit++) {
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
  }
  return crc;
}

static inline void zplc_test_safe_put16(uint8_t *out, uint16_t value) {
  out[0] = (uint8_t)value;
  out[1] = (uint8_t)(value >> 8);
}

static inline void zplc_test_safe_put32(uint8_t *out, uint32_t value) {
  zplc_test_safe_put16(out, (uint16_t)value);
  zplc_test_safe_put16(out + 2U, (uint16_t)(value >> 16));
}

/**
 * @brief The smallest whole artifact: CODE (HALT) and one cyclic task of 10 ms. For a suite that has no program of
 *        its own and wants to say only what it declares.
 * @return its length, 54 bytes: @p file must hold at least that
 */
static inline size_t zplc_test_minimal_program(uint8_t *file) {
  const size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t task_offset = code_offset + 1U;
  const size_t length = task_offset + ZPLC_TASK_DEF_SIZE;
  uint32_t crc;

  memset(file, 0, length);
  memcpy(file, "ZPLC", 4U);
  zplc_test_safe_put16(file + 4U, ZPLC_VERSION_MAJOR);
  zplc_test_safe_put16(file + 6U, ZPLC_VERSION_MINOR);
  zplc_test_safe_put32(file + 16U, 1U);
  zplc_test_safe_put32(file + 20U, ZPLC_TASK_DEF_SIZE);
  zplc_test_safe_put16(file + 26U, 2U);
  zplc_test_safe_put32(file + 28U, ZPLC_DRAFT_COUNTER);
  file[32U] = (uint8_t)ZPLC_SEG_CODE;
  zplc_test_safe_put32(file + 36U, 1U);
  file[40U] = (uint8_t)ZPLC_SEG_TASK;
  zplc_test_safe_put32(file + 44U, ZPLC_TASK_DEF_SIZE);
  file[code_offset] = (uint8_t)OP_HALT;
  zplc_test_safe_put32(file + task_offset + 4U, 10000U);
  zplc_test_safe_put16(file + task_offset + 10U, 1U);
  crc = zplc_test_safe_crc(file, 12U, 0xFFFFFFFFU);
  crc = zplc_test_safe_crc(file + 16U, length - 16U, crc) ^ 0xFFFFFFFFU;
  zplc_test_safe_put32(file + 12U, crc);
  return length;
}

/**
 * @brief Append a SAFE segment of @p entries_size bytes to the whole artifact in @p file.
 * @return the new length, or 0 when the artifact is not whole or the result does not fit @p capacity
 */
static inline size_t zplc_test_append_safe(uint8_t *file, size_t length, size_t capacity, const uint8_t *entries,
                                           size_t entries_size) {
  const size_t grown = length + ZPLC_SEGMENT_ENTRY_SIZE + entries_size;
  uint16_t count;
  size_t table_end;
  uint32_t data_size;
  uint32_t crc;

  if (file == NULL || length < ZPLC_FILE_HEADER_SIZE || grown > capacity) {
    return 0U;
  }
  count = (uint16_t)((uint16_t)file[26] | (uint16_t)((uint16_t)file[27] << 8));
  table_end = ZPLC_FILE_HEADER_SIZE + (size_t)count * ZPLC_SEGMENT_ENTRY_SIZE;
  if (table_end > length) {
    return 0U;
  }
  memmove(file + table_end + ZPLC_SEGMENT_ENTRY_SIZE, file + table_end, length - table_end);
  memset(file + table_end, 0, ZPLC_SEGMENT_ENTRY_SIZE);
  file[table_end] = (uint8_t)ZPLC_SEG_SAFE;
  file[table_end + 4U] = (uint8_t)entries_size;
  file[table_end + 5U] = (uint8_t)(entries_size >> 8);
  memcpy(file + length + ZPLC_SEGMENT_ENTRY_SIZE, entries, entries_size);
  count = (uint16_t)(count + 1U);
  file[26] = (uint8_t)count;
  file[27] = (uint8_t)(count >> 8);
  data_size = (uint32_t)file[20] | ((uint32_t)file[21] << 8) | ((uint32_t)file[22] << 16) | ((uint32_t)file[23] << 24);
  data_size += (uint32_t)entries_size;
  file[20] = (uint8_t)data_size;
  file[21] = (uint8_t)(data_size >> 8);
  file[22] = (uint8_t)(data_size >> 16);
  file[23] = (uint8_t)(data_size >> 24);
  crc = zplc_test_safe_crc(file, 12U, 0xFFFFFFFFU);
  crc = zplc_test_safe_crc(file + 16U, grown - 16U, crc) ^ 0xFFFFFFFFU;
  file[12] = (uint8_t)crc;
  file[13] = (uint8_t)(crc >> 8);
  file[14] = (uint8_t)(crc >> 16);
  file[15] = (uint8_t)(crc >> 24);
  return grown;
}

#endif /* ZPLC_TEST_SAFE_H */
