/**
 * @file zplc_ed25519.c
 * @brief Ed25519 verification. See zplc_ed25519.h.
 *
 * The arithmetic is that of TweetNaCl (public domain, Bernstein, Lange, Schwabe et al.): elements of GF(2^255-19)
 * as sixteen signed 64-bit limbs of sixteen bits, points in extended twisted Edwards coordinates.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_ed25519.h"

#include <string.h>

#include "zplc_sha512.h"

typedef int64_t gf[16];

static const gf GF0 = {0};
static const gf GF1 = {1};
static const gf D = {0x78a3, 0x1359, 0x4dca, 0x75eb, 0xd8ab, 0x4141, 0x0a4d, 0x0070,
                     0xe898, 0x7779, 0x4079, 0x8cc7, 0xfe73, 0x2b6f, 0x6cee, 0x5203};
static const gf D2 = {0xf159, 0x26b2, 0x9b94, 0xebd6, 0xb156, 0x8283, 0x149a, 0x00e0,
                      0xd130, 0xeef3, 0x80f2, 0x198e, 0xfce7, 0x56df, 0xd9dc, 0x2406};
static const gf X = {0xd51a, 0x8f25, 0x2d60, 0xc956, 0xa7b2, 0x9525, 0xc760, 0x692c,
                     0xdc5c, 0xfdd6, 0xe231, 0xc0a4, 0x53fe, 0xcd6e, 0x36d3, 0x2169};
static const gf Y = {0x6658, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666,
                     0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666};
static const gf I = {0xa0b0, 0x4a0e, 0x1b27, 0xc4ee, 0xe478, 0xad2f, 0x1806, 0x2f43,
                     0xd7a7, 0x3dfb, 0x0099, 0x2b4d, 0xdf0b, 0x4fc1, 0x2480, 0x2b83};

/* The order of the group, 2^252 + 27742317777372353535851937790883648493, little-endian. */
static const uint64_t L[32] = {0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14,
                               0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0x10};

static void set25519(gf r, const gf a) {
  int i;

  for (i = 0; i < 16; i++) {
    r[i] = a[i];
  }
}

static void car25519(gf o) {
  int i;

  for (i = 0; i < 16; i++) {
    int64_t c;

    o[i] += (int64_t)1 << 16;
    c = o[i] >> 16;
    o[(i < 15) ? (i + 1) : 0] += c - 1 + 37 * (c - 1) * (i == 15);
    o[i] -= c * 65536;
  }
}

static void sel25519(gf p, gf q, int b) {
  const int64_t c = ~((int64_t)b - 1);
  int i;

  for (i = 0; i < 16; i++) {
    const int64_t t = c & (p[i] ^ q[i]);

    p[i] ^= t;
    q[i] ^= t;
  }
}

static void pack25519(uint8_t *o, const gf n) {
  int i;
  int j;
  size_t k;
  gf m;
  gf t;

  for (i = 0; i < 16; i++) {
    t[i] = n[i];
  }
  car25519(t);
  car25519(t);
  car25519(t);
  for (j = 0; j < 2; j++) {
    int b;

    m[0] = t[0] - 0xffed;
    for (i = 1; i < 15; i++) {
      m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
      m[i - 1] &= 0xffff;
    }
    m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
    b = (int)((m[15] >> 16) & 1);
    m[14] &= 0xffff;
    sel25519(t, m, 1 - b);
  }
  for (k = 0U; k < 16U; k++) {
    o[2U * k] = (uint8_t)(t[k] & 0xff);
    o[2U * k + 1U] = (uint8_t)(t[k] >> 8);
  }
}

static int neq25519(const gf a, const gf b) {
  uint8_t c[32];
  uint8_t d[32];
  uint8_t difference = 0U;
  int i;

  pack25519(c, a);
  pack25519(d, b);
  for (i = 0; i < 32; i++) {
    difference = (uint8_t)(difference | (uint8_t)(c[i] ^ d[i]));
  }
  return difference != 0U;
}

static uint8_t par25519(const gf a) {
  uint8_t d[32];

  pack25519(d, a);
  return (uint8_t)(d[0] & 1U);
}

static void unpack25519(gf o, const uint8_t *n) {
  size_t i;

  for (i = 0U; i < 16U; i++) {
    o[i] = n[2U * i] + ((int64_t)n[2U * i + 1U] << 8);
  }
  o[15] &= 0x7fff;
}

static void A(gf o, const gf a, const gf b) {
  int i;

  for (i = 0; i < 16; i++) {
    o[i] = a[i] + b[i];
  }
}

static void Z(gf o, const gf a, const gf b) {
  int i;

  for (i = 0; i < 16; i++) {
    o[i] = a[i] - b[i];
  }
}

static void M(gf o, const gf a, const gf b) {
  int64_t t[31];
  int i;
  int j;

  for (i = 0; i < 31; i++) {
    t[i] = 0;
  }
  for (i = 0; i < 16; i++) {
    for (j = 0; j < 16; j++) {
      t[i + j] += a[i] * b[j];
    }
  }
  for (i = 0; i < 15; i++) {
    t[i] += 38 * t[i + 16];
  }
  for (i = 0; i < 16; i++) {
    o[i] = t[i];
  }
  car25519(o);
  car25519(o);
}

static void S(gf o, const gf a) { M(o, a, a); }

static void pow2523(gf o, const gf i) {
  gf c;
  int a;

  for (a = 0; a < 16; a++) {
    c[a] = i[a];
  }
  for (a = 250; a >= 0; a--) {
    S(c, c);
    if (a != 1) {
      M(c, c, i);
    }
  }
  for (a = 0; a < 16; a++) {
    o[a] = c[a];
  }
}

static void inv25519(gf o, const gf i) {
  gf c;
  int a;

  for (a = 0; a < 16; a++) {
    c[a] = i[a];
  }
  for (a = 253; a >= 0; a--) {
    S(c, c);
    if (a != 2 && a != 4) {
      M(c, c, i);
    }
  }
  for (a = 0; a < 16; a++) {
    o[a] = c[a];
  }
}

static void add(gf p[4], gf q[4]) {
  gf a, b, c, d, t, e, f, g, h;

  Z(a, p[1], p[0]);
  Z(t, q[1], q[0]);
  M(a, a, t);
  A(b, p[0], p[1]);
  A(t, q[0], q[1]);
  M(b, b, t);
  M(c, p[3], q[3]);
  M(c, c, D2);
  M(d, p[2], q[2]);
  A(d, d, d);
  Z(e, b, a);
  Z(f, d, c);
  A(g, d, c);
  A(h, b, a);
  M(p[0], e, f);
  M(p[1], h, g);
  M(p[2], g, f);
  M(p[3], e, h);
}

static void cswap(gf p[4], gf q[4], uint8_t b) {
  int i;

  for (i = 0; i < 4; i++) {
    sel25519(p[i], q[i], b);
  }
}

static void pack(uint8_t *r, gf p[4]) {
  gf tx, ty, zi;

  inv25519(zi, p[2]);
  M(tx, p[0], zi);
  M(ty, p[1], zi);
  pack25519(r, ty);
  r[31] ^= (uint8_t)(par25519(tx) << 7);
}

static void scalarmult(gf p[4], gf q[4], const uint8_t *s) {
  int i;

  set25519(p[0], GF0);
  set25519(p[1], GF1);
  set25519(p[2], GF1);
  set25519(p[3], GF0);
  for (i = 255; i >= 0; --i) {
    const uint8_t b = (uint8_t)((s[i / 8] >> (i & 7)) & 1);

    cswap(p, q, b);
    add(q, p);
    add(p, p);
    cswap(p, q, b);
  }
}

static void scalarbase(gf p[4], const uint8_t *s) {
  gf q[4];

  set25519(q[0], X);
  set25519(q[1], Y);
  set25519(q[2], GF1);
  M(q[3], X, Y);
  scalarmult(p, q, s);
}

static void modL(uint8_t *r, int64_t x[64]) {
  int64_t carry;
  int64_t i;
  int64_t j;

  for (i = 63; i >= 32; --i) {
    carry = 0;
    for (j = i - 32; j < i - 12; ++j) {
      x[j] += carry - 16 * x[i] * (int64_t)L[j - (i - 32)];
      carry = (x[j] + 128) >> 8;
      x[j] -= carry * 256;
    }
    x[j] += carry;
    x[i] = 0;
  }
  carry = 0;
  for (j = 0; j < 32; j++) {
    x[j] += carry - (x[31] >> 4) * (int64_t)L[j];
    carry = x[j] >> 8;
    x[j] &= 255;
  }
  for (j = 0; j < 32; j++) {
    x[j] -= carry * (int64_t)L[j];
  }
  for (i = 0; i < 32; i++) {
    x[i + 1] += x[i] >> 8;
    r[i] = (uint8_t)(x[i] & 255);
  }
}

static void reduce(uint8_t *r) {
  int64_t x[64];
  int i;

  for (i = 0; i < 64; i++) {
    x[i] = (int64_t)r[i];
  }
  for (i = 0; i < 64; i++) {
    r[i] = 0;
  }
  modL(r, x);
}

/* Decode a point and negate it: -A, as the check R = s*B - h*A needs. */
static int unpackneg(gf r[4], const uint8_t p[32]) {
  gf t, chk, num, den, den2, den4, den6;

  set25519(r[2], GF1);
  unpack25519(r[1], p);
  S(num, r[1]);
  M(den, num, D);
  Z(num, num, r[2]);
  A(den, r[2], den);

  S(den2, den);
  S(den4, den2);
  M(den6, den4, den2);
  M(t, den6, num);
  M(t, t, den);

  pow2523(t, t);
  M(t, t, num);
  M(t, t, den);
  M(t, t, den);
  M(r[0], t, den);

  S(chk, r[0]);
  M(chk, chk, den);
  if (neq25519(chk, num)) {
    M(r[0], r[0], I);
  }
  S(chk, r[0]);
  M(chk, chk, den);
  if (neq25519(chk, num)) {
    return -1;
  }
  if (par25519(r[0]) == (p[31] >> 7)) {
    Z(r[0], GF0, r[0]);
  }
  M(r[3], r[0], r[1]);
  return 0;
}

/* S < L, as RFC 8032 requires: a signature with S + L is not another signature of the same message. */
static int scalar_is_canonical(const uint8_t s[32]) {
  int i;

  for (i = 31; i >= 0; i--) {
    if (s[i] < (uint8_t)L[i]) {
      return 1;
    }
    if (s[i] > (uint8_t)L[i]) {
      return 0;
    }
  }
  return 0; /* equal to L */
}

int zplc_ed25519_verify(const uint8_t signature[ZPLC_ED25519_SIGNATURE_BYTES], const uint8_t public_key[ZPLC_ED25519_PUBLIC_BYTES],
                        const uint8_t *message, size_t length) {
  uint8_t h[64];
  uint8_t t[32];
  gf p[4];
  gf q[4];
  zplc_sha512_t hash;
  int difference = 0;
  int i;

  if (!scalar_is_canonical(signature + 32)) {
    return -1;
  }
  if (unpackneg(q, public_key) != 0) {
    return -1;
  }
  zplc_sha512_init(&hash);
  zplc_sha512_update(&hash, signature, 32U);
  zplc_sha512_update(&hash, public_key, 32U);
  if (length != 0U) {
    zplc_sha512_update(&hash, message, length);
  }
  zplc_sha512_final(&hash, h);
  reduce(h);

  scalarmult(p, q, h);
  scalarbase(q, signature + 32);
  add(p, q);
  pack(t, p);

  for (i = 0; i < 32; i++) {
    difference |= t[i] ^ signature[i];
  }
  return difference == 0 ? 0 : -1;
}
