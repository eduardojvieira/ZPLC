/**
 * @file zplc_comm_fb_access.h
 * @brief Bounded access to a communication function-block instance (COM-001).
 *
 * The core hands a handler a block and its length (zplc_comm_handler_t). A
 * handler reads counts, lengths and strings that the PLC program wrote into
 * that block, so none of them can be trusted: every read goes through these
 * helpers, which never touch a byte outside [fb_mem, fb_mem + fb_len) and
 * never use a length larger than the member that holds it has room for.
 *
 * Pure C99, no Zephyr or HAL dependency: the helpers are tested on the host
 * (firmware/lib/zplc_core/tests/test_comm_fb_access.c).
 *
 * SPDX-License-Identifier: MIT
 */

#ifndef ZPLC_COMM_FB_ACCESS_H
#define ZPLC_COMM_FB_ACCESS_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include <zplc_isa.h>

/* STRING layout of the contract: [len u16][cap u16][data...][terminator], from
 * the generated string table (COM-005). */
#define ZPLC_FB_STR_LEN ((uint16_t)ZPLC_STRING_LEN_OFFSET)
#define ZPLC_FB_STR_CAP ((uint16_t)ZPLC_STRING_CAP_OFFSET)
#define ZPLC_FB_STR_DATA ((uint16_t)ZPLC_STRING_DATA_OFFSET)

/**
 * @brief True when [offset, offset + count) lies inside a block of fb_len bytes.
 *
 * The arithmetic cannot wrap: count is compared with what is left after offset.
 */
static inline bool zplc_fb_fits(uint16_t fb_len, uint32_t offset,
                                uint32_t count) {
  return offset <= fb_len && count <= (uint32_t)fb_len - offset;
}

/**
 * @brief Read an unsigned 16-bit member, little endian; 0 when it is outside
 *        the block.
 */
static inline uint16_t zplc_fb_get_u16(const uint8_t *fb_mem, uint16_t fb_len,
                                       uint16_t offset) {
  if (!zplc_fb_fits(fb_len, offset, 2U)) {
    return 0U;
  }
  return (uint16_t)(fb_mem[offset] | (fb_mem[offset + 1U] << 8));
}

/**
 * @brief Characters of the STRING member at @p offset a reader may use.
 *
 * The length is the one in the block, limited by the room of the member
 * (@p member_bytes is what the layout table reserves for it, header and
 * terminator included) and by what is left of the block after its header.
 * A header that does not fit gives 0.
 */
static inline uint16_t zplc_fb_string_chars(const uint8_t *fb_mem,
                                            uint16_t fb_len, uint16_t offset,
                                            uint16_t member_bytes) {
  uint32_t length;
  uint32_t room;

  if (member_bytes <= ZPLC_FB_STR_DATA + 1U ||
      !zplc_fb_fits(fb_len, offset, ZPLC_FB_STR_DATA)) {
    return 0U;
  }
  length = zplc_fb_get_u16(fb_mem, fb_len, (uint16_t)(offset + ZPLC_FB_STR_LEN));
  room = (uint32_t)member_bytes - ZPLC_FB_STR_DATA - 1U;
  if (length > room) {
    length = room;
  }
  room = (uint32_t)fb_len - offset - ZPLC_FB_STR_DATA;
  if (length > room) {
    length = room;
  }
  return (uint16_t)length;
}

/**
 * @brief Copy the characters of a STRING member to a C buffer and terminate
 *        it; at most dest_size - 1 characters are copied.
 *
 * @return number of characters copied
 */
static inline uint16_t zplc_fb_string_copy(char *dest, size_t dest_size,
                                           const uint8_t *fb_mem,
                                           uint16_t fb_len, uint16_t offset,
                                           uint16_t member_bytes) {
  uint16_t chars = zplc_fb_string_chars(fb_mem, fb_len, offset, member_bytes);

  if (dest_size == 0U) {
    return 0U;
  }
  if (chars > dest_size - 1U) {
    chars = (uint16_t)(dest_size - 1U);
  }
  if (chars > 0U) {
    memcpy(dest, &fb_mem[offset + ZPLC_FB_STR_DATA], chars);
  }
  dest[chars] = '\0';
  return chars;
}

/**
 * @brief Store text into a STRING member: as much as the member has room for
 *        and the block holds, then the length, the capacity and the terminator.
 *
 * Nothing is written when the member header does not fit the block. The
 * capacity written is what the member has room for, so that the program can
 * copy the value on (STRCPY reads it); a read does not consult it, because it
 * is program data.
 *
 * @return number of characters stored
 */
static inline uint16_t zplc_fb_string_set(uint8_t *fb_mem, uint16_t fb_len,
                                          uint16_t offset,
                                          uint16_t member_bytes,
                                          const uint8_t *src, size_t len) {
  uint32_t room;

  if (member_bytes <= ZPLC_FB_STR_DATA + 1U ||
      !zplc_fb_fits(fb_len, offset, ZPLC_FB_STR_DATA + 1U)) {
    return 0U;
  }
  room = (uint32_t)member_bytes - ZPLC_FB_STR_DATA - 1U;
  if (room > (uint32_t)fb_len - offset - ZPLC_FB_STR_DATA - 1U) {
    room = (uint32_t)fb_len - offset - ZPLC_FB_STR_DATA - 1U;
  }
  if (len > room) {
    len = room;
  }
  if (len > 0U) {
    memcpy(&fb_mem[offset + ZPLC_FB_STR_DATA], src, len);
  }
  fb_mem[offset + ZPLC_FB_STR_DATA + len] = 0U;
  fb_mem[offset + ZPLC_FB_STR_LEN] = (uint8_t)(len & 0xFFU);
  fb_mem[offset + ZPLC_FB_STR_LEN + 1U] = (uint8_t)((len >> 8) & 0xFFU);
  fb_mem[offset + ZPLC_FB_STR_CAP] = (uint8_t)(room & 0xFFU);
  fb_mem[offset + ZPLC_FB_STR_CAP + 1U] = (uint8_t)((room >> 8) & 0xFFU);
  return (uint16_t)len;
}

#endif /* ZPLC_COMM_FB_ACCESS_H */
