/**
 * @file test_ed25519.c
 * @brief SHA-512 against FIPS 180-4, and Ed25519 verification against RFC 8032 and against the signatures that the
 *        Python reference computed, valid and damaged (COM-026).
 *
 * SPDX-License-Identifier: MIT
 */

#include <stdio.h>
#include <string.h>

#include <zplc_ed25519.h>
#include <zplc_sha512.h>

#include "zplc_proto_vectors.h"

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                                       \
  do {                                                                         \
    test_count++;                                                              \
    if (!(cond)) {                                                             \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__);                  \
      fail_count++;                                                            \
    }                                                                          \
  } while (0)

static void to_hex(const uint8_t *data, size_t length, char *out) {
  static const char digits[] = "0123456789abcdef";
  size_t i;

  for (i = 0U; i < length; i++) {
    out[2U * i] = digits[data[i] >> 4];
    out[2U * i + 1U] = digits[data[i] & 0x0FU];
  }
  out[2U * length] = '\0';
}

static int sha512_is(const uint8_t *data, size_t length, const char *expected) {
  zplc_sha512_t context;
  uint8_t digest[64];
  char text[129];

  zplc_sha512_init(&context);
  zplc_sha512_update(&context, data, length);
  zplc_sha512_final(&context, digest);
  to_hex(digest, sizeof(digest), text);
  return strcmp(text, expected) == 0;
}

static void test_sha512(void) {
  static const char *long_message =
      "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu";
  zplc_sha512_t context;
  uint8_t digest[64];
  uint8_t chunk[1000];
  char text[129];
  unsigned round;
  size_t split;

  CHECK(sha512_is((const uint8_t *)"abc", 3U, "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"), "SHA-512 of abc");
  CHECK(sha512_is((const uint8_t *)"", 0U, "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e"), "SHA-512 of the empty string");
  CHECK(sha512_is((const uint8_t *)long_message, strlen(long_message), "8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909"), "SHA-512 of 896 bits");
  zplc_sha512_init(&context);
  memset(chunk, 'a', sizeof(chunk));
  for (round = 0U; round < 1000U; round++) {
    zplc_sha512_update(&context, chunk, sizeof(chunk));
  }
  zplc_sha512_final(&context, digest);
  to_hex(digest, sizeof(digest), text);
  CHECK(strcmp(text, "e718483d0ce769644e2e42c7bc15b4638e1f98b13b2044285632a803afa973ebde0ff244877ea60a4cb0432ce577c31beb009c5c2c49aa2e4eadb217ad8cc09b") == 0, "SHA-512 of one million a, in chunks");
  for (split = 0U; split <= strlen(long_message); split += 7U) {
    zplc_sha512_init(&context);
    zplc_sha512_update(&context, (const uint8_t *)long_message, split);
    zplc_sha512_update(&context, (const uint8_t *)long_message + split, strlen(long_message) - split);
    zplc_sha512_final(&context, digest);
    to_hex(digest, sizeof(digest), text);
    if (strcmp(text, "8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909") != 0) {
      CHECK(0, "a split of the message changes the digest");
      return;
    }
  }
  CHECK(1, "no split of the message changes the digest");
}

/* ---- COM-026: valid and damaged signatures of the reference get the reference's answer ---- */
static void test_the_signatures_of_the_reference(void) {
  size_t i;
  unsigned accepted = 0U;
  unsigned refused = 0U;

  for (i = 0U; i < ZPLC_PROTO_SIGNATURE_CASE_COUNT; i++) {
    const zplc_proto_signature_case_t *c = &zplc_proto_signature_cases[i];
    const int result = zplc_ed25519_verify(c->signature, c->public_key, c->message, c->message_length);

    if (c->valid) {
      accepted++;
    } else {
      refused++;
    }
    CHECK((result == 0) == (c->valid != 0U), c->name);
  }
  CHECK(accepted >= 15U && refused >= 8U, "the vectors have both kinds");
}

static void test_rfc_8032(void) {
  /* TEST 1 of RFC 8032 section 7.1: the empty message */
  static const uint8_t public_key[32] = {
      0xd7, 0x5a, 0x98, 0x01, 0x82, 0xb1, 0x0a, 0xb7, 0xd5, 0x4b, 0xfe, 0xd3, 0xc9, 0x64, 0x07, 0x3a,
      0x0e, 0xe1, 0x72, 0xf3, 0xda, 0xa6, 0x23, 0x25, 0xaf, 0x02, 0x1a, 0x68, 0xf7, 0x07, 0x51, 0x1a};
  static const uint8_t signature[64] = {
      0xe5, 0x56, 0x43, 0x00, 0xc3, 0x60, 0xac, 0x72, 0x90, 0x86, 0xe2, 0xcc, 0x80, 0x6e, 0x82, 0x8a,
      0x84, 0x87, 0x7f, 0x1e, 0xb8, 0xe5, 0xd9, 0x74, 0xd8, 0x73, 0xe0, 0x65, 0x22, 0x49, 0x01, 0x55,
      0x5f, 0xb8, 0x82, 0x15, 0x90, 0xa3, 0x3b, 0xac, 0xc6, 0x1e, 0x39, 0x70, 0x1c, 0xf9, 0xb4, 0x6b,
      0xd2, 0x5b, 0xf5, 0xf0, 0x59, 0x5b, 0xbe, 0x24, 0x65, 0x51, 0x41, 0x43, 0x8e, 0x7a, 0x10, 0x0b};
  uint8_t damaged[64];

  CHECK(zplc_ed25519_verify(signature, public_key, NULL, 0U) == 0, "RFC 8032 test 1");
  memcpy(damaged, signature, sizeof(damaged));
  damaged[10] ^= 0x04U;
  CHECK(zplc_ed25519_verify(damaged, public_key, NULL, 0U) != 0, "and a bit of it flipped");
  CHECK(zplc_ed25519_verify(signature, public_key, (const uint8_t *)"x", 1U) != 0, "and another message");
}

int main(void) {
  test_sha512();
  test_rfc_8032();
  test_the_signatures_of_the_reference();
  printf("%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
