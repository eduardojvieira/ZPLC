/**
 * @file zplc_sha512.h
 * @brief SHA-512 (FIPS 180-4), the hash of Ed25519 (COM-026).
 *
 * SPDX-License-Identifier: MIT
 */

#ifndef ZPLC_SHA512_H
#define ZPLC_SHA512_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define ZPLC_SHA512_DIGEST_BYTES 64U
#define ZPLC_SHA512_BLOCK_BYTES 128U

typedef struct {
  uint64_t state[8];
  uint64_t bytes;
  uint8_t block[ZPLC_SHA512_BLOCK_BYTES];
  uint32_t fill;
} zplc_sha512_t;

void zplc_sha512_init(zplc_sha512_t *context);
void zplc_sha512_update(zplc_sha512_t *context, const uint8_t *data, size_t length);
/** @brief Write the digest and clear the context. */
void zplc_sha512_final(zplc_sha512_t *context, uint8_t digest[ZPLC_SHA512_DIGEST_BYTES]);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_SHA512_H */
