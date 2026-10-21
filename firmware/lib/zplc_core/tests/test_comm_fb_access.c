/**
 * @file test_comm_fb_access.c
 * @brief The bounded accessors of a function-block instance (COM-001).
 *
 * Every block is allocated with exactly the length the handler is given, so
 * that a read or a write outside it is trapped by the address sanitizer; the
 * assertions pin the defined results.
 *
 * SPDX-License-Identifier: MIT
 */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "zplc_comm_fb_access.h"

static uint8_t *block(uint16_t length) {
  uint8_t *memory = (uint8_t *)malloc(length);
  assert(memory != NULL);
  memset(memory, 0, length);
  return memory;
}

static void set_u16(uint8_t *memory, uint16_t offset, uint16_t value) {
  memory[offset] = (uint8_t)value;
  memory[offset + 1U] = (uint8_t)(value >> 8);
}

static void test_fits(void) {
  printf("test_fits...\n");
  assert(zplc_fb_fits(110U, 0U, 110U));          /* the whole block */
  assert(!zplc_fb_fits(110U, 0U, 111U));         /* one byte too many */
  assert(zplc_fb_fits(110U, 109U, 1U));          /* the last byte */
  assert(!zplc_fb_fits(110U, 110U, 1U));         /* the first byte past */
  assert(zplc_fb_fits(110U, 110U, 0U));          /* an empty range at the end */
  assert(!zplc_fb_fits(110U, 111U, 0U));         /* an offset past the end */
  assert(!zplc_fb_fits(110U, 15U, 0xFFFFFFFFU)); /* a count that would wrap */
  assert(!zplc_fb_fits(110U, 0xFFFFFFFFU, 2U));  /* an offset that would wrap */
  assert(!zplc_fb_fits(0U, 0U, 1U));             /* no block at all */
}

static void test_get_u16(void) {
  uint8_t *memory = block(10U);
  printf("test_get_u16...\n");
  set_u16(memory, 8U, 0xBEEFU);
  assert(zplc_fb_get_u16(memory, 10U, 8U) == 0xBEEFU); /* the last two bytes */
  assert(zplc_fb_get_u16(memory, 10U, 9U) == 0U);      /* straddles the end */
  assert(zplc_fb_get_u16(memory, 10U, 10U) == 0U);
  assert(zplc_fb_get_u16(memory, 10U, 0xFFFFU) == 0U);
  free(memory);
}

static void test_string_chars(void) {
  /* a block of 20 bytes with a STRING member of 12 bytes at 4: header 4, up
   * to 7 characters, terminator */
  uint8_t *memory = block(20U);
  printf("test_string_chars...\n");

  set_u16(memory, 4U, 3U);
  assert(zplc_fb_string_chars(memory, 20U, 4U, 12U) == 3U);

  set_u16(memory, 4U, 0xFFFFU); /* a length from PLC memory is not trusted */
  assert(zplc_fb_string_chars(memory, 20U, 4U, 12U) == 7U);

  /* the block ends before the member does: the block wins */
  set_u16(memory, 14U, 0xFFFFU);
  assert(zplc_fb_string_chars(memory, 20U, 14U, 85U) == 2U); /* 20 - 14 - 4 */

  /* the header does not fit */
  assert(zplc_fb_string_chars(memory, 20U, 17U, 85U) == 0U);
  assert(zplc_fb_string_chars(memory, 20U, 20U, 85U) == 0U);
  assert(zplc_fb_string_chars(memory, 20U, 0xFFFFU, 85U) == 0U);

  /* a member too small to hold a character */
  assert(zplc_fb_string_chars(memory, 20U, 4U, 5U) == 0U);
  free(memory);
}

static void test_string_copy(void) {
  uint8_t *memory = block(20U);
  char out[16];
  printf("test_string_copy...\n");

  set_u16(memory, 4U, 5U);
  memcpy(&memory[8], "HELLO", 5U);
  assert(zplc_fb_string_copy(out, sizeof(out), memory, 20U, 4U, 12U) == 5U);
  assert(strcmp(out, "HELLO") == 0);

  /* a destination smaller than the string: truncated and terminated */
  assert(zplc_fb_string_copy(out, 4U, memory, 20U, 4U, 12U) == 3U);
  assert(strcmp(out, "HEL") == 0);
  assert(zplc_fb_string_copy(out, 1U, memory, 20U, 4U, 12U) == 0U);
  assert(out[0] == '\0');
  assert(zplc_fb_string_copy(out, 0U, memory, 20U, 4U, 12U) == 0U);

  /* a length far beyond the member: no byte is read past the block */
  set_u16(memory, 4U, 0xFFFFU);
  assert(zplc_fb_string_copy(out, sizeof(out), memory, 20U, 4U, 85U) == 12U); /* 20 - 4 - 4 */
  free(memory);
}

static void test_string_set(void) {
  uint8_t *memory = block(20U);
  const uint8_t text[] = "0123456789ABCDEF0123456789";
  printf("test_string_set...\n");

  /* the capacity field says 65535: it is program data and is not used; what is written is the room of the
   * member, so that the program can copy the value on (STRCPY reads it) */
  set_u16(memory, 6U, 0xFFFFU);
  assert(zplc_fb_string_set(memory, 20U, 4U, 12U, text, 26U) == 7U);
  assert(memory[0] == 0U && memory[3] == 0U); /* before: untouched */
  assert(memory[4] == 7U && memory[5] == 0U); /* length */
  assert(memory[6] == 7U && memory[7] == 0U); /* capacity */
  assert(memory[8 + 7] == 0U);                /* terminator */
  assert(memcmp(&memory[8], "0123456", 7U) == 0);
  assert(memory[16] == 0U && memory[19] == 0U); /* after: untouched */

  /* a member that runs past the block is cut at the block end */
  assert(zplc_fb_string_set(memory, 20U, 12U, 85U, text, 26U) == 3U);
  assert(memory[12] == 3U && memory[14] == 3U && memory[16] == '0' && memory[18] == '2' && memory[19] == 0U); /* length 3, capacity 3 */

  /* a header that does not fit writes nothing */
  memset(memory, 0xA5, 20U);
  assert(zplc_fb_string_set(memory, 20U, 16U, 85U, text, 4U) == 0U);
  assert(memory[16] == 0xA5 && memory[19] == 0xA5);
  free(memory);
}

int main(void) {
  printf("Running comm function-block accessor tests...\n");
  test_fits();
  test_get_u16();
  test_string_chars();
  test_string_copy();
  test_string_set();
  printf("All comm function-block accessor tests passed.\n");
  return 0;
}
