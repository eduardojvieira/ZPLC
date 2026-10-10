/**
 * @file fuzz_common.h
 * @brief Helpers shared by the two libFuzzer targets (VF-014).
 *
 * SPDX-License-Identifier: MIT
 *
 * Header-only on purpose: the fuzz targets are separate executables and the
 * contract (header layout, CRC rule, opcode table) is read from the generated
 * headers, never copied.
 */

#ifndef ZPLC_FUZZ_COMMON_H
#define ZPLC_FUZZ_COMMON_H

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "zplc_isa.h"
#include "zplc_loader.h"

/* Provided by libFuzzer: the engine's own byte mutations. */
size_t LLVMFuzzerMutate(uint8_t *data, size_t size, size_t max_size);

#define FZ_CRC_OFFSET 12U

static inline uint16_t fz_get16(const uint8_t *p)
{
    return (uint16_t)((uint16_t)p[0] | ((uint16_t)p[1] << 8));
}

static inline uint32_t fz_get32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static inline void fz_put16(uint8_t *p, uint16_t v)
{
    p[0] = (uint8_t)v;
    p[1] = (uint8_t)(v >> 8);
}

static inline void fz_put32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)v;
    p[1] = (uint8_t)(v >> 8);
    p[2] = (uint8_t)(v >> 16);
    p[3] = (uint8_t)(v >> 24);
}

/**
 * Store the CRC the loader expects: CRC32 (IEEE 802.3, reflected 0xEDB88320) over the whole file except the four
 * bytes of the field. Without it a mutation stops at the first check of the verifier.
 */
static inline void fz_repair_crc(uint8_t *file, size_t length)
{
    uint32_t crc = 0xFFFFFFFFU;
    size_t i;
    unsigned bit;

    if (length < ZPLC_FILE_HEADER_SIZE) {
        return;
    }
    for (i = 0; i < length; i++) {
        if (i >= FZ_CRC_OFFSET && i < FZ_CRC_OFFSET + 4U) {
            continue;
        }
        crc ^= file[i];
        for (bit = 0; bit < 8U; bit++) {
            crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
        }
    }
    fz_put32(file + FZ_CRC_OFFSET, ~crc);
}

/* xorshift64*: small, seedable, good enough to choose mutations. */
typedef struct {
    uint64_t s;
} fz_rng_t;

static inline void fz_rng_seed(fz_rng_t *r, uint64_t seed)
{
    r->s = seed * 0x9E3779B97F4A7C15ULL + 0x1234567ULL;
    if (r->s == 0U) {
        r->s = 0x2545F4914F6CDD1DULL;
    }
}

static inline uint32_t fz_rand(fz_rng_t *r)
{
    uint64_t x = r->s;

    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    r->s = x;
    return (uint32_t)((x * 0x2545F4914F6CDD1DULL) >> 32);
}

static inline uint32_t fz_below(fz_rng_t *r, uint32_t bound)
{
    return bound == 0U ? 0U : fz_rand(r) % bound;
}

/* The opcode table of the contract, as data: code, operand size and stack effect of every instruction. */
typedef struct {
    uint8_t code;
    uint8_t operand;
    uint8_t pops;
    uint8_t pushes;
    uint8_t min_depth;
} fz_op_t;

#define FZ_OP_ENTRY(NAME, CODE, OPERAND, POPS, PUSHES, DEPTH) \
    { (uint8_t)(CODE), (uint8_t)(OPERAND), (uint8_t)(POPS), (uint8_t)(PUSHES), (uint8_t)(DEPTH) },
static const fz_op_t FZ_OPS[] = { ZPLC_OPCODE_TABLE(FZ_OP_ENTRY) };
#define FZ_OP_COUNT (sizeof(FZ_OPS) / sizeof(FZ_OPS[0]))

static inline const fz_op_t *fz_op_find(uint8_t code)
{
    size_t i;

    for (i = 0; i < FZ_OP_COUNT; i++) {
        if (FZ_OPS[i].code == code) {
            return &FZ_OPS[i];
        }
    }
    return NULL;
}

/**
 * Make the size fields of a mutated file agree with its segment table, the way
 * a producer would, so that the checks behind them are reachable: the header
 * code_size is the CODE segment, data_size is the sum of the others, and the
 * last segment takes whatever the file has left.
 */
static inline void fz_repair_sizes(uint8_t *file, size_t length)
{
    uint16_t count;
    size_t table_end;
    size_t index;
    uint64_t others = 0;
    uint64_t used;
    int have_code = 0;
    uint32_t code_size = 0;

    if (length < ZPLC_FILE_HEADER_SIZE) {
        return;
    }
    count = fz_get16(file + 26);
    if (count == 0U || (size_t)count > (length - ZPLC_FILE_HEADER_SIZE) / ZPLC_SEGMENT_ENTRY_SIZE) {
        return;
    }
    table_end = ZPLC_FILE_HEADER_SIZE + (size_t)count * ZPLC_SEGMENT_ENTRY_SIZE;
    used = table_end;
    for (index = 0; index + 1U < count; index++) {
        const uint8_t *entry = file + ZPLC_FILE_HEADER_SIZE + index * ZPLC_SEGMENT_ENTRY_SIZE;

        used += fz_get32(entry + 4);
    }
    if (used <= length) {
        /* The last segment takes the rest. */
        fz_put32(file + ZPLC_FILE_HEADER_SIZE + (size_t)(count - 1U) * ZPLC_SEGMENT_ENTRY_SIZE + 4, (uint32_t)(length - used));
    }
    for (index = 0; index < count; index++) {
        const uint8_t *entry = file + ZPLC_FILE_HEADER_SIZE + index * ZPLC_SEGMENT_ENTRY_SIZE;

        if (fz_get16(entry) == ZPLC_SEG_CODE && !have_code) {
            have_code = 1;
            code_size = fz_get32(entry + 4);
        } else {
            others += fz_get32(entry + 4);
        }
    }
    if (have_code) {
        fz_put32(file + 16, code_size);
    }
    fz_put32(file + 20, (uint32_t)others);
}

#define FZ_REQUIRE(cond, what) do { \
    if (!(cond)) { \
        fprintf(stderr, "INVARIANT VIOLATED: %s (%s:%d)\n", (what), __FILE__, __LINE__); \
        abort(); \
    } \
} while (0)

#endif /* ZPLC_FUZZ_COMMON_H */
