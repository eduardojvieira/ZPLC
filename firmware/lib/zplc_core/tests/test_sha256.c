/**
 * @file test_sha256.c
 * @brief SHA-256 and HMAC-SHA-256 against FIPS 180-4 and RFC 4231, and against the codes of the generated frames
 *        (COM-021).
 *
 * SPDX-License-Identifier: MIT
 *
 * The codes of the authenticated frames in zplc_proto_vectors.h were computed by Python's hmac module: the C
 * implementation, written separately, has to give the same bytes over the same covered bytes.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_proto.h>
#include <zplc_sha256.h>

#include "zplc_proto_vectors.h"

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                      \
  do {                                                        \
    test_count++;                                             \
    if (!(cond)) {                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      fail_count++;                                           \
    }                                                         \
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

static int digest_is(const uint8_t *data, size_t length, const char *expected) {
  uint8_t digest[ZPLC_SHA256_DIGEST_BYTES];
  char text[2U * ZPLC_SHA256_DIGEST_BYTES + 1U];

  zplc_sha256(data, length, digest);
  to_hex(digest, sizeof(digest), text);
  return strcmp(text, expected) == 0;
}

static int mac_is(const uint8_t *key, size_t key_length, const uint8_t *data, size_t length, const char *expected) {
  uint8_t mac[ZPLC_SHA256_DIGEST_BYTES];
  char text[2U * ZPLC_SHA256_DIGEST_BYTES + 1U];

  zplc_hmac_sha256(key, key_length, data, length, mac);
  to_hex(mac, sizeof(mac), text);
  return strcmp(text, expected) == 0;
}

static void test_fips_180_4(void) {
  static const char *two_blocks = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
  static const char *long_message =
      "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu";
  zplc_sha256_t context;
  uint8_t digest[ZPLC_SHA256_DIGEST_BYTES];
  char text[2U * ZPLC_SHA256_DIGEST_BYTES + 1U];
  uint8_t chunk[1000];
  size_t split;
  unsigned round;

  CHECK(digest_is((const uint8_t *)"abc", 3U, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), "SHA-256 of abc");
  CHECK(digest_is((const uint8_t *)"", 0U, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
        "SHA-256 of the empty string");
  CHECK(digest_is((const uint8_t *)two_blocks, strlen(two_blocks), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"),
        "SHA-256 of 448 bits (the padding needs a second block)");
  CHECK(digest_is((const uint8_t *)long_message, strlen(long_message), "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1"),
        "SHA-256 of 896 bits");

  zplc_sha256_init(&context);
  memset(chunk, 'a', sizeof(chunk));
  for (round = 0U; round < 1000U; round++) {
    zplc_sha256_update(&context, chunk, sizeof(chunk));
  }
  zplc_sha256_final(&context, digest);
  to_hex(digest, sizeof(digest), text);
  CHECK(strcmp(text, "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0") == 0, "SHA-256 of one million a, in chunks");

  for (split = 0U; split <= strlen(two_blocks); split++) {
    zplc_sha256_init(&context);
    zplc_sha256_update(&context, (const uint8_t *)two_blocks, split);
    zplc_sha256_update(&context, (const uint8_t *)two_blocks + split, strlen(two_blocks) - split);
    zplc_sha256_final(&context, digest);
    to_hex(digest, sizeof(digest), text);
    if (strcmp(text, "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1") != 0) {
      CHECK(0, "a split of the message changes the digest");
      return;
    }
  }
  CHECK(1, "no split of the message changes the digest");
}

static void test_rfc_4231(void) {
  uint8_t key[131];
  uint8_t data[150];
  size_t i;
  static const char *text7 = "This is a test using a larger than block-size key and a larger than block-size data. The key needs to be "
                             "hashed before being used by the HMAC algorithm.";

  memset(key, 0x0B, 20U);
  CHECK(mac_is(key, 20U, (const uint8_t *)"Hi There", 8U, "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"),
        "RFC 4231 case 1");
  CHECK(mac_is((const uint8_t *)"Jefe", 4U, (const uint8_t *)"what do ya want for nothing?", 28U,
               "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"),
        "RFC 4231 case 2");
  memset(key, 0xAA, 20U);
  memset(data, 0xDD, 50U);
  CHECK(mac_is(key, 20U, data, 50U, "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe"), "RFC 4231 case 3");
  for (i = 0U; i < 25U; i++) {
    key[i] = (uint8_t)(i + 1U);
  }
  memset(data, 0xCD, 50U);
  CHECK(mac_is(key, 25U, data, 50U, "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b"), "RFC 4231 case 4");
  memset(key, 0xAA, sizeof(key));
  CHECK(mac_is(key, 131U, (const uint8_t *)"Test Using Larger Than Block-Size Key - Hash Key First", 54U,
               "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"),
        "RFC 4231 case 6: a key longer than the block is hashed first");
  CHECK(mac_is(key, 131U, (const uint8_t *)text7, strlen(text7), "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2"),
        "RFC 4231 case 7");
}

static void test_streaming_hmac_equals_one_shot(void) {
  uint8_t key[32];
  uint8_t data[300];
  uint8_t whole[ZPLC_SHA256_DIGEST_BYTES];
  uint8_t parts[ZPLC_SHA256_DIGEST_BYTES];
  zplc_hmac_sha256_t context;
  size_t i;

  for (i = 0U; i < sizeof(key); i++) {
    key[i] = (uint8_t)i;
  }
  for (i = 0U; i < sizeof(data); i++) {
    data[i] = (uint8_t)(i * 7U);
  }
  zplc_hmac_sha256(key, sizeof(key), data, sizeof(data), whole);
  zplc_hmac_sha256_init(&context, key, sizeof(key));
  zplc_hmac_sha256_update(&context, data, 11U);
  zplc_hmac_sha256_update(&context, data + 11U, 200U);
  zplc_hmac_sha256_update(&context, data + 211U, sizeof(data) - 211U);
  zplc_hmac_sha256_final(&context, parts);
  CHECK(memcmp(whole, parts, sizeof(whole)) == 0, "an HMAC computed in parts is the HMAC of the whole");
}

/* ---- COM-021: the HMAC-SHA-256 of C is the one Python computed for the generated frames ---- */
static void test_the_codes_of_the_generated_frames(void) {
  size_t i;
  unsigned authenticated = 0U;

  for (i = 0U; i < ZPLC_PROTO_VECTOR_FRAME_COUNT; i++) {
    const zplc_proto_vector_frame_t *vf = &zplc_proto_vector_frames[i];
    zplc_proto_frame_t frame;
    uint8_t mac[ZPLC_SHA256_DIGEST_BYTES];

    if (vf->auth == 0U) {
      continue;
    }
    authenticated++;
    CHECK(zplc_proto_parse(vf->wire, vf->wire_len, ZPLC_PROTO_VECTOR_PAYLOAD_MAX, &frame) == 0 && frame.mac != NULL,
          "an authenticated frame parses");
    zplc_hmac_sha256(zplc_proto_vector_key, sizeof(zplc_proto_vector_key), frame.covered, frame.covered_length, mac);
    CHECK(zplc_ct_equal(mac, frame.mac, sizeof(mac)) == 1, "the code of the generated frame is the one C computes");
    mac[0] ^= 0x01U;
    CHECK(zplc_ct_equal(mac, frame.mac, sizeof(mac)) == 0, "and one flipped bit is a different code");
  }
  CHECK(authenticated >= 3U, "there are authenticated frames in the vectors");
}

static void test_helpers(void) {
  uint8_t a[16];
  uint8_t b[16];
  size_t i;

  memset(a, 0x5A, sizeof(a));
  memcpy(b, a, sizeof(b));
  CHECK(zplc_ct_equal(a, b, sizeof(a)) == 1, "equal buffers");
  for (i = 0U; i < sizeof(a); i++) {
    b[i] ^= 0x80U;
    CHECK(zplc_ct_equal(a, b, sizeof(a)) == 0, "a difference at any position is seen");
    b[i] ^= 0x80U;
  }
  CHECK(zplc_ct_equal(a, b, 0U) == 1, "no bytes are equal");
  zplc_secure_zero(a, sizeof(a));
  for (i = 0U; i < sizeof(a) && a[i] == 0U; i++) {
  }
  CHECK(i == sizeof(a), "zeroed");
}

int main(void) {
  test_fips_180_4();
  test_rfc_4231();
  test_streaming_hmac_equals_one_shot();
  test_the_codes_of_the_generated_frames();
  test_helpers();
  printf("%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
