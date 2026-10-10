/**
 * @file test_bytes_crc.c
 * @brief The one CRC-32 and the little-endian byte helpers of the runtime (RT-032).
 *
 * SPDX-License-Identifier: MIT
 *
 * The loader, the RETAIN module, the program store of the firmware and the program store of the host runtime all
 * take their CRC-32 and their little-endian reads and writes from zplc_crc32.h and zplc_bytes.h. This suite is the
 * oracle for both: the CRC against the published check value and against a bit-reflected table-free reference
 * written here, the helpers at every alignment and with a buffer that is not word aligned.
 */

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <zplc_bytes.h>
#include <zplc_crc32.h>

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                                      \
  do {                                                                        \
    test_count++;                                                             \
    if (!(cond)) {                                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__);                 \
      fail_count++;                                                           \
    } else {                                                                  \
      printf("PASS: %s\n", msg);                                              \
    }                                                                         \
  } while (0)

/* The reference: the reflected polynomial 0xEDB88320 one bit at a time, written differently from the product. */
static uint32_t reference_crc32(const uint8_t *data, size_t length) {
  uint32_t crc = 0xFFFFFFFFU;
  size_t i;
  int bit;

  for (i = 0; i < length; i++) {
    for (bit = 0; bit < 8; bit++) {
      const uint32_t input = (data[i] >> bit) & 1U;
      const uint32_t feedback = (crc ^ input) & 1U;
      crc >>= 1;
      if (feedback != 0U) {
        crc ^= 0xEDB88320U;
      }
    }
  }
  return ~crc;
}

static void test_crc32_check_values(void) {
  static const uint8_t digits[] = "123456789";
  uint8_t zeros[32];
  uint8_t noise[300];
  size_t i;
  uint32_t state = 12345U;

  /* The CRC-32/ISO-HDLC check value, the one zlib, PNG and the container header use. */
  CHECK(zplc_crc32(digits, 9U) == 0xCBF43926U, "crc32(\"123456789\") is the published check value");
  CHECK(zplc_crc32(NULL, 0U) == 0U, "crc32 of nothing is zero");
  memset(zeros, 0, sizeof zeros);
  CHECK(zplc_crc32(zeros, sizeof zeros) == 0x190A55ADU, "crc32 of 32 zero bytes is the published value");

  for (i = 0; i < sizeof noise; i++) {
    state = state * 1103515245U + 12345U;
    noise[i] = (uint8_t)(state >> 16);
  }
  CHECK(zplc_crc32(noise, sizeof noise) == reference_crc32(noise, sizeof noise),
        "crc32 of 300 pseudo-random bytes equals the bitwise reference");
}

static void test_crc32_update_chains(void) {
  static const uint8_t text[] = "The quick brown fox jumps over the lazy dog";
  const size_t length = sizeof text - 1U;
  size_t split;
  int all_equal = 1;

  CHECK(zplc_crc32(text, length) == 0x414FA339U, "crc32 of the pangram is the published value");
  for (split = 0; split <= length; split++) {
    uint32_t crc = 0xFFFFFFFFU;

    crc = zplc_crc32_update(crc, text, split);
    crc = zplc_crc32_update(crc, text + split, length - split);
    if ((crc ^ 0xFFFFFFFFU) != zplc_crc32(text, length)) {
      all_equal = 0;
    }
  }
  CHECK(all_equal, "updating in two parts at every split gives the one-shot result");
}

static void test_little_endian_helpers(void) {
  /* One spare byte in front makes every access below start at an odd address. */
  uint8_t buffer[16];
  uint8_t *odd = buffer + 1;
  uint8_t before;

  memset(buffer, 0xA5, sizeof buffer);
  before = buffer[0];

  zplc_put_u16_le(odd, 0x1234U);
  CHECK(odd[0] == 0x34U && odd[1] == 0x12U, "put_u16 writes the low byte first");
  CHECK(zplc_get_u16_le(odd) == 0x1234U, "get_u16 reads what put_u16 wrote");

  zplc_put_u32_le(odd + 2, 0xDEADBEEFU);
  CHECK(odd[2] == 0xEFU && odd[3] == 0xBEU && odd[4] == 0xADU && odd[5] == 0xDEU,
        "put_u32 writes the low byte first");
  CHECK(zplc_get_u32_le(odd + 2) == 0xDEADBEEFU, "get_u32 reads what put_u32 wrote");

  zplc_put_u32_le(odd + 6, 0x80000001U);
  CHECK(zplc_get_u32_le(odd + 6) == 0x80000001U, "a value with the top bit set survives (no sign extension)");
  CHECK(buffer[0] == before && buffer[1 + 10] == 0xA5U, "the bytes around the written ones are untouched");
}

int main(void) {
  printf("=== CRC-32 and byte helpers (RT-032) ===\n");
  test_crc32_check_values();
  test_crc32_update_chains();
  test_little_endian_helpers();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
