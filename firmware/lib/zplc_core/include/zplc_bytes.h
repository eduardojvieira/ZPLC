/**
 * @file zplc_bytes.h
 * @brief Little-endian reads and writes of bytes, with no alignment assumption (RT-004, RT-032).
 *
 * SPDX-License-Identifier: MIT
 *
 * Every module of the runtime that reads or writes a multi-byte field of an artifact, a record or PLC memory uses
 * these functions: they work at any address, on any byte order and on a core that traps on unaligned access.
 * The host and the target share this one implementation.
 */

#ifndef ZPLC_BYTES_H
#define ZPLC_BYTES_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

static inline uint16_t zplc_get_u16_le(const uint8_t *p) { return (uint16_t)((uint16_t)p[0] | ((uint16_t)p[1] << 8)); }

static inline uint32_t zplc_get_u32_le(const uint8_t *p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static inline void zplc_put_u16_le(uint8_t *p, uint16_t value) {
  p[0] = (uint8_t)value;
  p[1] = (uint8_t)(value >> 8);
}

static inline void zplc_put_u32_le(uint8_t *p, uint32_t value) {
  p[0] = (uint8_t)value;
  p[1] = (uint8_t)(value >> 8);
  p[2] = (uint8_t)(value >> 16);
  p[3] = (uint8_t)(value >> 24);
}

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_BYTES_H */
