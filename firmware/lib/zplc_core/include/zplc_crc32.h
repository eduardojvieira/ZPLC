/**
 * @file zplc_crc32.h
 * @brief The one CRC-32 of the runtime (RT-032).
 *
 * SPDX-License-Identifier: MIT
 *
 * CRC-32/ISO-HDLC: reflected polynomial 0xEDB88320, initial value 0xFFFFFFFF, final exclusive-or 0xFFFFFFFF. It is
 * the CRC of the artifact container (zplc_loader.c), of the RETAIN records (zplc_retain.c) and of the records of
 * the program store on the host and on the target. It is a bitwise loop with no table: a few bytes of code and no
 * RAM, which is what a 16 KB core can afford, and the artifact it checks is small and read once per load.
 */

#ifndef ZPLC_CRC32_H
#define ZPLC_CRC32_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Add bytes to a running CRC state.
 *
 * Start from 0xFFFFFFFF and exclusive-or the result with 0xFFFFFFFF when the last byte is in. The state is the
 * register itself, so one value can be carried across several calls.
 */
static inline uint32_t zplc_crc32_update(uint32_t crc, const uint8_t *data,
                                         size_t length) {
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

/** @brief CRC-32 of a buffer in one call. */
static inline uint32_t zplc_crc32(const uint8_t *data, size_t length) {
  return zplc_crc32_update(0xFFFFFFFFU, data, length) ^ 0xFFFFFFFFU;
}

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_CRC32_H */
