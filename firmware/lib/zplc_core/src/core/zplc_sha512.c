/**
 * @file zplc_sha512.c
 * @brief SHA-512. See zplc_sha512.h.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_sha512.h"

#include <string.h>

#include "zplc_sha256.h" /* zplc_secure_zero */

static const uint64_t K[80] = {
    0x428a2f98d728ae22ULL, 0x7137449123ef65cdULL,
    0xb5c0fbcfec4d3b2fULL, 0xe9b5dba58189dbbcULL,
    0x3956c25bf348b538ULL, 0x59f111f1b605d019ULL,
    0x923f82a4af194f9bULL, 0xab1c5ed5da6d8118ULL,
    0xd807aa98a3030242ULL, 0x12835b0145706fbeULL,
    0x243185be4ee4b28cULL, 0x550c7dc3d5ffb4e2ULL,
    0x72be5d74f27b896fULL, 0x80deb1fe3b1696b1ULL,
    0x9bdc06a725c71235ULL, 0xc19bf174cf692694ULL,
    0xe49b69c19ef14ad2ULL, 0xefbe4786384f25e3ULL,
    0x0fc19dc68b8cd5b5ULL, 0x240ca1cc77ac9c65ULL,
    0x2de92c6f592b0275ULL, 0x4a7484aa6ea6e483ULL,
    0x5cb0a9dcbd41fbd4ULL, 0x76f988da831153b5ULL,
    0x983e5152ee66dfabULL, 0xa831c66d2db43210ULL,
    0xb00327c898fb213fULL, 0xbf597fc7beef0ee4ULL,
    0xc6e00bf33da88fc2ULL, 0xd5a79147930aa725ULL,
    0x06ca6351e003826fULL, 0x142929670a0e6e70ULL,
    0x27b70a8546d22ffcULL, 0x2e1b21385c26c926ULL,
    0x4d2c6dfc5ac42aedULL, 0x53380d139d95b3dfULL,
    0x650a73548baf63deULL, 0x766a0abb3c77b2a8ULL,
    0x81c2c92e47edaee6ULL, 0x92722c851482353bULL,
    0xa2bfe8a14cf10364ULL, 0xa81a664bbc423001ULL,
    0xc24b8b70d0f89791ULL, 0xc76c51a30654be30ULL,
    0xd192e819d6ef5218ULL, 0xd69906245565a910ULL,
    0xf40e35855771202aULL, 0x106aa07032bbd1b8ULL,
    0x19a4c116b8d2d0c8ULL, 0x1e376c085141ab53ULL,
    0x2748774cdf8eeb99ULL, 0x34b0bcb5e19b48a8ULL,
    0x391c0cb3c5c95a63ULL, 0x4ed8aa4ae3418acbULL,
    0x5b9cca4f7763e373ULL, 0x682e6ff3d6b2b8a3ULL,
    0x748f82ee5defb2fcULL, 0x78a5636f43172f60ULL,
    0x84c87814a1f0ab72ULL, 0x8cc702081a6439ecULL,
    0x90befffa23631e28ULL, 0xa4506cebde82bde9ULL,
    0xbef9a3f7b2c67915ULL, 0xc67178f2e372532bULL,
    0xca273eceea26619cULL, 0xd186b8c721c0c207ULL,
    0xeada7dd6cde0eb1eULL, 0xf57d4f7fee6ed178ULL,
    0x06f067aa72176fbaULL, 0x0a637dc5a2c898a6ULL,
    0x113f9804bef90daeULL, 0x1b710b35131c471bULL,
    0x28db77f523047d84ULL, 0x32caab7b40c72493ULL,
    0x3c9ebe0a15c9bebcULL, 0x431d67c49c100d4cULL,
    0x4cc5d4becb3e42b6ULL, 0x597f299cfc657e2aULL,
    0x5fcb6fab3ad6faecULL, 0x6c44198c4a475817ULL,
};

static uint64_t rotr(uint64_t value, unsigned bits) {
  return (value >> bits) | (value << (64U - bits));
}

static void compress(uint64_t state[8], const uint8_t block[ZPLC_SHA512_BLOCK_BYTES]) {
  uint64_t w[80];
  uint64_t a, b, c, d, e, f, g, h;
  unsigned i;

  for (i = 0U; i < 16U; i++) {
    uint64_t value = 0U;
    unsigned k;

    for (k = 0U; k < 8U; k++) {
      value = (value << 8) | block[8U * i + k];
    }
    w[i] = value;
  }
  for (i = 16U; i < 80U; i++) {
    const uint64_t s0 = rotr(w[i - 15U], 1U) ^ rotr(w[i - 15U], 8U) ^ (w[i - 15U] >> 7);
    const uint64_t s1 = rotr(w[i - 2U], 19U) ^ rotr(w[i - 2U], 61U) ^ (w[i - 2U] >> 6);

    w[i] = w[i - 16U] + s0 + w[i - 7U] + s1;
  }
  a = state[0]; b = state[1]; c = state[2]; d = state[3];
  e = state[4]; f = state[5]; g = state[6]; h = state[7];
  for (i = 0U; i < 80U; i++) {
    const uint64_t big1 = rotr(e, 14U) ^ rotr(e, 18U) ^ rotr(e, 41U);
    const uint64_t choose = (e & f) ^ (~e & g);
    const uint64_t t1 = h + big1 + choose + K[i] + w[i];
    const uint64_t big0 = rotr(a, 28U) ^ rotr(a, 34U) ^ rotr(a, 39U);
    const uint64_t majority = (a & b) ^ (a & c) ^ (b & c);
    const uint64_t t2 = big0 + majority;

    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  state[0] += a; state[1] += b; state[2] += c; state[3] += d;
  state[4] += e; state[5] += f; state[6] += g; state[7] += h;
}

void zplc_sha512_init(zplc_sha512_t *context) {
  static const uint64_t H0[8] = {
    0x6a09e667f3bcc908ULL, 0xbb67ae8584caa73bULL,
    0x3c6ef372fe94f82bULL, 0xa54ff53a5f1d36f1ULL,
    0x510e527fade682d1ULL, 0x9b05688c2b3e6c1fULL,
    0x1f83d9abfb41bd6bULL, 0x5be0cd19137e2179ULL,
  };

  memcpy(context->state, H0, sizeof(H0));
  context->bytes = 0U;
  context->fill = 0U;
}

void zplc_sha512_update(zplc_sha512_t *context, const uint8_t *data, size_t length) {
  size_t index = 0U;

  context->bytes += (uint64_t)length;
  while (index < length) {
    const size_t room = ZPLC_SHA512_BLOCK_BYTES - context->fill;
    const size_t take = (length - index) < room ? (length - index) : room;

    (void)memcpy(context->block + context->fill, data + index, take);
    context->fill += (uint32_t)take;
    index += take;
    if (context->fill == ZPLC_SHA512_BLOCK_BYTES) {
      compress(context->state, context->block);
      context->fill = 0U;
    }
  }
}

void zplc_sha512_final(zplc_sha512_t *context, uint8_t digest[ZPLC_SHA512_DIGEST_BYTES]) {
  const uint64_t bits_low = context->bytes << 3;
  const uint64_t bits_high = context->bytes >> 61;
  unsigned i;

  context->block[context->fill++] = 0x80U;
  if (context->fill > 112U) {
    (void)memset(context->block + context->fill, 0, ZPLC_SHA512_BLOCK_BYTES - context->fill);
    compress(context->state, context->block);
    context->fill = 0U;
  }
  (void)memset(context->block + context->fill, 0, 112U - context->fill);
  for (i = 0U; i < 8U; i++) {
    context->block[112U + i] = (uint8_t)(bits_high >> (56U - 8U * i));
    context->block[120U + i] = (uint8_t)(bits_low >> (56U - 8U * i));
  }
  compress(context->state, context->block);
  for (i = 0U; i < 8U; i++) {
    unsigned k;

    for (k = 0U; k < 8U; k++) {
      digest[8U * i + k] = (uint8_t)(context->state[i] >> (56U - 8U * k));
    }
  }
  zplc_secure_zero(context, sizeof(*context));
}
