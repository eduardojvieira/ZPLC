/**
 * @file zplc_sha256.h
 * @brief SHA-256 and HMAC-SHA-256 (FIPS 180-4, RFC 2104), and the two helpers that key material needs (COM-021).
 *
 * SPDX-License-Identifier: MIT
 *
 * The authentication code of a frame in a network session is HMAC-SHA-256 under a key that was provisioned over
 * the local serial link. This is a small portable implementation, no table but the 64 round constants and no
 * allocation, that the core and every port share; the test of it runs the vectors of FIPS 180-4 and RFC 4231.
 *
 * Two helpers belong to it because of what they protect: zplc_ct_equal() compares two codes in time that does
 * not depend on where they differ, and zplc_secure_zero() clears key material in a way the compiler may not
 * remove.
 */

#ifndef ZPLC_SHA256_H
#define ZPLC_SHA256_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define ZPLC_SHA256_DIGEST_BYTES 32U
#define ZPLC_SHA256_BLOCK_BYTES 64U

typedef struct {
  uint32_t state[8];
  uint64_t bits;
  uint8_t block[ZPLC_SHA256_BLOCK_BYTES];
  uint32_t fill;
} zplc_sha256_t;

typedef struct {
  zplc_sha256_t inner;
  uint8_t outer_pad[ZPLC_SHA256_BLOCK_BYTES];
} zplc_hmac_sha256_t;

void zplc_sha256_init(zplc_sha256_t *context);
void zplc_sha256_update(zplc_sha256_t *context, const uint8_t *data, size_t length);
/** @brief Write the digest and clear the context. */
void zplc_sha256_final(zplc_sha256_t *context, uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]);
void zplc_sha256(const uint8_t *data, size_t length, uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]);

void zplc_hmac_sha256_init(zplc_hmac_sha256_t *context, const uint8_t *key, size_t key_length);
void zplc_hmac_sha256_update(zplc_hmac_sha256_t *context, const uint8_t *data, size_t length);
/** @brief Write the code and clear the context (the key pads included). */
void zplc_hmac_sha256_final(zplc_hmac_sha256_t *context, uint8_t mac[ZPLC_SHA256_DIGEST_BYTES]);
void zplc_hmac_sha256(const uint8_t *key, size_t key_length, const uint8_t *data, size_t length,
                      uint8_t mac[ZPLC_SHA256_DIGEST_BYTES]);

/** @brief 1 when the two buffers are equal; the time taken depends on @p length only. */
int zplc_ct_equal(const uint8_t *a, const uint8_t *b, size_t length);

/** @brief Clear @p length bytes in a way the compiler does not optimise away. */
void zplc_secure_zero(void *buffer, size_t length);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_SHA256_H */
