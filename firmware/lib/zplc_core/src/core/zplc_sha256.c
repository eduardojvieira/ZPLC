/**
 * @file zplc_sha256.c
 * @brief SHA-256 and HMAC-SHA-256. See zplc_sha256.h.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_sha256.h"

#include <string.h>

static const uint32_t K[64] = {
    0x428a2f98U, 0x71374491U, 0xb5c0fbcfU, 0xe9b5dba5U, 0x3956c25bU, 0x59f111f1U, 0x923f82a4U, 0xab1c5ed5U,
    0xd807aa98U, 0x12835b01U, 0x243185beU, 0x550c7dc3U, 0x72be5d74U, 0x80deb1feU, 0x9bdc06a7U, 0xc19bf174U,
    0xe49b69c1U, 0xefbe4786U, 0x0fc19dc6U, 0x240ca1ccU, 0x2de92c6fU, 0x4a7484aaU, 0x5cb0a9dcU, 0x76f988daU,
    0x983e5152U, 0xa831c66dU, 0xb00327c8U, 0xbf597fc7U, 0xc6e00bf3U, 0xd5a79147U, 0x06ca6351U, 0x14292967U,
    0x27b70a85U, 0x2e1b2138U, 0x4d2c6dfcU, 0x53380d13U, 0x650a7354U, 0x766a0abbU, 0x81c2c92eU, 0x92722c85U,
    0xa2bfe8a1U, 0xa81a664bU, 0xc24b8b70U, 0xc76c51a3U, 0xd192e819U, 0xd6990624U, 0xf40e3585U, 0x106aa070U,
    0x19a4c116U, 0x1e376c08U, 0x2748774cU, 0x34b0bcb5U, 0x391c0cb3U, 0x4ed8aa4aU, 0x5b9cca4fU, 0x682e6ff3U,
    0x748f82eeU, 0x78a5636fU, 0x84c87814U, 0x8cc70208U, 0x90befffaU, 0xa4506cebU, 0xbef9a3f7U, 0xc67178f2U,
};

static uint32_t rotr(uint32_t value, unsigned bits) {
  return (value >> bits) | (value << (32U - bits));
}

static void compress(uint32_t state[8], const uint8_t block[ZPLC_SHA256_BLOCK_BYTES]) {
  uint32_t w[64];
  uint32_t a, b, c, d, e, f, g, h;
  size_t i;

  for (i = 0U; i < 16U; i++) {
    w[i] = ((uint32_t)block[4U * i] << 24) | ((uint32_t)block[4U * i + 1U] << 16) |
           ((uint32_t)block[4U * i + 2U] << 8) | (uint32_t)block[4U * i + 3U];
  }
  for (i = 16U; i < 64U; i++) {
    const uint32_t s0 = rotr(w[i - 15U], 7U) ^ rotr(w[i - 15U], 18U) ^ (w[i - 15U] >> 3);
    const uint32_t s1 = rotr(w[i - 2U], 17U) ^ rotr(w[i - 2U], 19U) ^ (w[i - 2U] >> 10);

    w[i] = w[i - 16U] + s0 + w[i - 7U] + s1;
  }
  a = state[0]; b = state[1]; c = state[2]; d = state[3];
  e = state[4]; f = state[5]; g = state[6]; h = state[7];
  for (i = 0U; i < 64U; i++) {
    const uint32_t big1 = rotr(e, 6U) ^ rotr(e, 11U) ^ rotr(e, 25U);
    const uint32_t choose = (e & f) ^ (~e & g);
    const uint32_t t1 = h + big1 + choose + K[i] + w[i];
    const uint32_t big0 = rotr(a, 2U) ^ rotr(a, 13U) ^ rotr(a, 22U);
    const uint32_t majority = (a & b) ^ (a & c) ^ (b & c);
    const uint32_t t2 = big0 + majority;

    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  state[0] += a; state[1] += b; state[2] += c; state[3] += d;
  state[4] += e; state[5] += f; state[6] += g; state[7] += h;
  zplc_secure_zero(w, sizeof(w));
}

void zplc_sha256_init(zplc_sha256_t *context) {
  context->state[0] = 0x6a09e667U; context->state[1] = 0xbb67ae85U;
  context->state[2] = 0x3c6ef372U; context->state[3] = 0xa54ff53aU;
  context->state[4] = 0x510e527fU; context->state[5] = 0x9b05688cU;
  context->state[6] = 0x1f83d9abU; context->state[7] = 0x5be0cd19U;
  context->bits = 0U;
  context->fill = 0U;
}

void zplc_sha256_update(zplc_sha256_t *context, const uint8_t *data, size_t length) {
  size_t index = 0U;

  context->bits += (uint64_t)length * 8U;
  while (index < length) {
    size_t room = ZPLC_SHA256_BLOCK_BYTES - context->fill;
    const size_t take = (length - index) < room ? (length - index) : room;

    (void)memcpy(context->block + context->fill, data + index, take);
    context->fill += (uint32_t)take;
    index += take;
    if (context->fill == ZPLC_SHA256_BLOCK_BYTES) {
      compress(context->state, context->block);
      context->fill = 0U;
    }
  }
}

void zplc_sha256_final(zplc_sha256_t *context, uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]) {
  const uint64_t bits = context->bits;
  size_t i;

  context->block[context->fill++] = 0x80U;
  if (context->fill > 56U) {
    (void)memset(context->block + context->fill, 0, ZPLC_SHA256_BLOCK_BYTES - context->fill);
    compress(context->state, context->block);
    context->fill = 0U;
  }
  (void)memset(context->block + context->fill, 0, 56U - context->fill);
  for (i = 0U; i < 8U; i++) {
    context->block[56U + i] = (uint8_t)(bits >> (56U - 8U * i));
  }
  compress(context->state, context->block);
  for (i = 0U; i < 8U; i++) {
    digest[4U * i] = (uint8_t)(context->state[i] >> 24);
    digest[4U * i + 1U] = (uint8_t)(context->state[i] >> 16);
    digest[4U * i + 2U] = (uint8_t)(context->state[i] >> 8);
    digest[4U * i + 3U] = (uint8_t)context->state[i];
  }
  zplc_secure_zero(context, sizeof(*context));
}

void zplc_sha256(const uint8_t *data, size_t length, uint8_t digest[ZPLC_SHA256_DIGEST_BYTES]) {
  zplc_sha256_t context;

  zplc_sha256_init(&context);
  zplc_sha256_update(&context, data, length);
  zplc_sha256_final(&context, digest);
}

void zplc_hmac_sha256_init(zplc_hmac_sha256_t *context, const uint8_t *key, size_t key_length) {
  uint8_t pad[ZPLC_SHA256_BLOCK_BYTES];
  unsigned i;

  (void)memset(pad, 0, sizeof(pad));
  if (key_length > ZPLC_SHA256_BLOCK_BYTES) {
    zplc_sha256(key, key_length, pad);
  } else if (key_length != 0U) {
    (void)memcpy(pad, key, key_length);
  }
  for (i = 0U; i < ZPLC_SHA256_BLOCK_BYTES; i++) {
    context->outer_pad[i] = (uint8_t)(pad[i] ^ 0x5cU);
    pad[i] = (uint8_t)(pad[i] ^ 0x36U);
  }
  zplc_sha256_init(&context->inner);
  zplc_sha256_update(&context->inner, pad, sizeof(pad));
  zplc_secure_zero(pad, sizeof(pad));
}

void zplc_hmac_sha256_update(zplc_hmac_sha256_t *context, const uint8_t *data, size_t length) {
  zplc_sha256_update(&context->inner, data, length);
}

void zplc_hmac_sha256_final(zplc_hmac_sha256_t *context, uint8_t mac[ZPLC_SHA256_DIGEST_BYTES]) {
  uint8_t inner[ZPLC_SHA256_DIGEST_BYTES];
  zplc_sha256_t outer;

  zplc_sha256_final(&context->inner, inner);
  zplc_sha256_init(&outer);
  zplc_sha256_update(&outer, context->outer_pad, sizeof(context->outer_pad));
  zplc_sha256_update(&outer, inner, sizeof(inner));
  zplc_sha256_final(&outer, mac);
  zplc_secure_zero(inner, sizeof(inner));
  zplc_secure_zero(context, sizeof(*context));
}

void zplc_hmac_sha256(const uint8_t *key, size_t key_length, const uint8_t *data, size_t length,
                      uint8_t mac[ZPLC_SHA256_DIGEST_BYTES]) {
  zplc_hmac_sha256_t context;

  zplc_hmac_sha256_init(&context, key, key_length);
  zplc_hmac_sha256_update(&context, data, length);
  zplc_hmac_sha256_final(&context, mac);
}

int zplc_ct_equal(const uint8_t *a, const uint8_t *b, size_t length) {
  uint8_t difference = 0U;
  size_t i;

  for (i = 0U; i < length; i++) {
    difference = (uint8_t)(difference | (uint8_t)(a[i] ^ b[i]));
  }
  return difference == 0U;
}

void zplc_secure_zero(void *buffer, size_t length) {
  volatile uint8_t *p = (volatile uint8_t *)buffer;

  while (length-- > 0U) {
    *p++ = 0U;
  }
}
