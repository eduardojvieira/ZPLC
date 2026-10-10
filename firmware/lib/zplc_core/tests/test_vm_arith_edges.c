/**
 * @file test_vm_arith_edges.c
 * @brief Defined results for the integer and float edge cases of the VM (RT-005, CMP-016)
 *
 * SPDX-License-Identifier: MIT
 *
 * Every case runs one arithmetic opcode on operands that used to invoke
 * undefined behaviour in C (INT32_MIN / -1, negating INT32_MIN, a shift by
 * the width or more, a REAL that does not fit an integer) and checks the one
 * result the table in zplc_core.c defines. Build with
 * -fsanitize=undefined,float-cast-overflow -fno-sanitize-recover=undefined so
 * that a regression is a failure of the test, not a silent wrong value.
 *
 * The 64-bit integer and double-precision opcodes (CMP-015) have their own
 * table of two-word operands. Its results were computed with Python integers
 * and struct, which share no code with the VM. A two-word value has its low
 * word deeper on the stack, as LOAD64 leaves it.
 *
 * The last test stores and loads 16, 32 and 64-bit values at odd work memory
 * addresses. A Cortex-M0 faults on an unaligned access and the undefined
 * behaviour sanitizer reports one on the host, so this file is the part of
 * the core suites that the 16 KB qemu_cortex_m0 target runs for alignment
 * (VF-005, VF-015).
 */

#include <zplc_core.h>
#include <zplc_isa.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <zplc_test_hooks.h>

static int test_count = 0;
static int fail_count = 0;

#define INT_MIN32 0x80000000U
#define INT_MAX32 0x7FFFFFFFU
#define MINUS_ONE 0xFFFFFFFFU

typedef struct {
    const char *name;
    uint8_t opcode;
    int operands; /* 1 or 2 values pushed before the opcode */
    uint32_t a;
    uint32_t b;
    uint32_t expect;
} arith_case_t;

static size_t emit_push32(uint8_t *buf, size_t n, uint32_t value)
{
    buf[n++] = OP_PUSH32;
    buf[n++] = (uint8_t)value;
    buf[n++] = (uint8_t)(value >> 8);
    buf[n++] = (uint8_t)(value >> 16);
    buf[n++] = (uint8_t)(value >> 24);
    return n;
}

/** Run `a [b] opcode HALT` and return the top of the stack; *error gets the VM error. */
static uint32_t run_case(const arith_case_t *c, uint8_t *error, uint16_t *sp, uint8_t *halted)
{
    uint8_t code[16];
    size_t len = 0;
    const zplc_vm_state_t *state;

    len = emit_push32(code, len, c->a);
    if (c->operands == 2) {
        len = emit_push32(code, len, c->b);
    }
    code[len++] = c->opcode;
    code[len++] = OP_HALT;

    zplc_core_init();
    if (zplc_test_load_raw(code, len) != 0) {
        *error = 0xFF;
        *sp = 0;
        *halted = 0;
        return 0;
    }
    (void)zplc_core_run(0);
    state = zplc_core_get_state();
    *error = state->error;
    *sp = state->sp;
    *halted = state->halted;
    return state->sp > 0 ? state->stack[state->sp - 1U] : 0U;
}

static void check(const arith_case_t *c)
{
    uint8_t error;
    uint16_t sp;
    uint8_t halted;
    uint32_t got = run_case(c, &error, &sp, &halted);

    test_count++;
    if (error != ZPLC_VM_HALTED || sp != 1 || !halted || got != c->expect) {
        fprintf(stderr, "FAIL: %s - expected 0x%08X, got 0x%08X (error %u, sp %u, halted %u)\n",
                c->name, (unsigned)c->expect, (unsigned)got, (unsigned)error, (unsigned)sp, (unsigned)halted);
        fail_count++;
    } else {
        printf("PASS: %s = 0x%08X\n", c->name, (unsigned)got);
    }
}

static const arith_case_t cases[] = {
    /* ADD, SUB, MUL wrap in two's complement at 32 bits. */
    { "ADD INT32_MAX + 1 wraps to INT32_MIN",  OP_ADD, 2, INT_MAX32, 1U, INT_MIN32 },
    { "ADD -1 + 1 is 0",                       OP_ADD, 2, MINUS_ONE, 1U, 0U },
    { "SUB INT32_MIN - 1 wraps to INT32_MAX",  OP_SUB, 2, INT_MIN32, 1U, INT_MAX32 },
    { "SUB 0 - 1 is -1",                       OP_SUB, 2, 0U, 1U, MINUS_ONE },
    { "MUL 65536 * 65536 wraps to 0",          OP_MUL, 2, 0x10000U, 0x10000U, 0U },
    { "MUL INT32_MAX * 2 wraps to -2",         OP_MUL, 2, INT_MAX32, 2U, 0xFFFFFFFEU },
    { "MUL INT32_MIN * -1 wraps to INT32_MIN", OP_MUL, 2, INT_MIN32, MINUS_ONE, INT_MIN32 },
    { "MUL -3 * 4 is -12",                     OP_MUL, 2, 0xFFFFFFFDU, 4U, 0xFFFFFFF4U },

    /* DIV and MOD: INT32_MIN / -1 is INT32_MIN and INT32_MIN MOD -1 is 0. */
    { "DIV INT32_MIN / -1 is INT32_MIN",       OP_DIV, 2, INT_MIN32, MINUS_ONE, INT_MIN32 },
    { "DIV 7 / -1 is -7",                      OP_DIV, 2, 7U, MINUS_ONE, 0xFFFFFFF9U },
    { "DIV INT32_MIN / 1 is INT32_MIN",        OP_DIV, 2, INT_MIN32, 1U, INT_MIN32 },
    { "DIV -7 / 2 truncates toward zero",      OP_DIV, 2, 0xFFFFFFF9U, 2U, 0xFFFFFFFDU },
    { "MOD INT32_MIN MOD -1 is 0",             OP_MOD, 2, INT_MIN32, MINUS_ONE, 0U },
    { "MOD 7 MOD -1 is 0",                     OP_MOD, 2, 7U, MINUS_ONE, 0U },
    { "MOD -7 MOD 3 takes the dividend sign",  OP_MOD, 2, 0xFFFFFFF9U, 3U, MINUS_ONE },

    /* NEG and ABS of the most negative value return it. */
    { "NEG INT32_MIN is INT32_MIN",            OP_NEG, 1, INT_MIN32, 0U, INT_MIN32 },
    { "NEG 5 is -5",                           OP_NEG, 1, 5U, 0U, 0xFFFFFFFBU },
    { "ABS INT32_MIN is INT32_MIN",            OP_ABS, 1, INT_MIN32, 0U, INT_MIN32 },
    { "ABS -5 is 5",                           OP_ABS, 1, 0xFFFFFFFBU, 0U, 5U },
    { "ABS 5 is 5",                            OP_ABS, 1, 5U, 0U, 5U },

    /* ABSF clears the sign bit, as IEEE-754 absolute value does: also of -0.0 and of a NaN. */
    { "ABSF -0.0 is +0.0",                     OP_ABSF, 1, 0x80000000U, 0U, 0U },
    { "ABSF -NaN is +NaN",                     OP_ABSF, 1, 0xFFC00000U, 0U, 0x7FC00000U },
    { "ABSF -Inf is +Inf",                     OP_ABSF, 1, 0xFF800000U, 0U, 0x7F800000U },
    { "ABSF -1.5 is 1.5",                      OP_ABSF, 1, 0xBFC00000U, 0U, 0x3FC00000U },
    { "ABSF 1.5 is 1.5",                       OP_ABSF, 1, 0x3FC00000U, 0U, 0x3FC00000U },

    /* Shifts by the width or more give 0 (-1 for an arithmetic shift of a negative value). */
    { "SHL 1 << 31",                           OP_SHL, 2, 1U, 31U, INT_MIN32 },
    { "SHL 1 << 32 is 0",                      OP_SHL, 2, 1U, 32U, 0U },
    { "SHL 1 << 33 is 0",                      OP_SHL, 2, 1U, 33U, 0U },
    { "SHL by a negative count is 0",          OP_SHL, 2, 1U, MINUS_ONE, 0U },
    { "SHR 0x80000000 >> 31 is 1",             OP_SHR, 2, INT_MIN32, 31U, 1U },
    { "SHR >> 32 is 0",                        OP_SHR, 2, INT_MIN32, 32U, 0U },
    { "SHR by a negative count is 0",          OP_SHR, 2, INT_MIN32, MINUS_ONE, 0U },
    { "SAR INT32_MIN >> 31 is -1",             OP_SAR, 2, INT_MIN32, 31U, MINUS_ONE },
    { "SAR INT32_MIN >> 32 is -1",             OP_SAR, 2, INT_MIN32, 32U, MINUS_ONE },
    { "SAR negative by a negative count is -1", OP_SAR, 2, INT_MIN32, MINUS_ONE, MINUS_ONE },
    { "SAR positive >> 32 is 0",               OP_SAR, 2, 0x40000000U, 32U, 0U },
    { "SAR positive by a negative count is 0", OP_SAR, 2, 0x40000000U, MINUS_ONE, 0U },
    { "SAR -8 >> 1 is -4",                     OP_SAR, 2, 0xFFFFFFF8U, 1U, 0xFFFFFFFCU },
    { "SAR -1 >> 5 is -1",                     OP_SAR, 2, MINUS_ONE, 5U, MINUS_ONE },

    /* The same pattern orders differently signed and unsigned: the compiler picks LT/GT or LTU/GTU by type (CMP-012). */
    { "LT 0xFFFFFFFF < 0 is true (signed -1 < 0)", OP_LT, 2, MINUS_ONE, 0U, 1U },
    { "GT INT32_MIN > INT32_MAX is false",     OP_GT, 2, INT_MIN32, INT_MAX32, 0U },
    { "LTU 0xFFFFFFFF < 0 is false",           OP_LTU, 2, MINUS_ONE, 0U, 0U },
    { "LTU 0 < 0xFFFFFFFF is true",            OP_LTU, 2, 0U, MINUS_ONE, 1U },
    { "LTU INT32_MAX < INT32_MIN is true",     OP_LTU, 2, INT_MAX32, INT_MIN32, 1U },
    { "LTU equal operands is false",           OP_LTU, 2, INT_MIN32, INT_MIN32, 0U },
    { "GTU 0xFFFFFFFF > 0 is true",            OP_GTU, 2, MINUS_ONE, 0U, 1U },
    { "GTU INT32_MIN > INT32_MAX is true",     OP_GTU, 2, INT_MIN32, INT_MAX32, 1U },
    { "GTU 0 > 0xFFFFFFFF is false",           OP_GTU, 2, 0U, MINUS_ONE, 0U },
    { "GTU equal operands is false",           OP_GTU, 2, 5U, 5U, 0U },

    /* REAL to integer: NaN is 0, out of range saturates, in range truncates toward zero. */
    { "F2I NaN is 0",                          OP_F2I, 1, 0x7FC00000U, 0U, 0U },
    { "F2I negative NaN is 0",                 OP_F2I, 1, 0xFFC00000U, 0U, 0U },
    { "F2I +Inf saturates to INT32_MAX",       OP_F2I, 1, 0x7F800000U, 0U, INT_MAX32 },
    { "F2I -Inf saturates to INT32_MIN",       OP_F2I, 1, 0xFF800000U, 0U, INT_MIN32 },
    { "F2I 3.0e9 saturates to INT32_MAX",      OP_F2I, 1, 0x4F32D05EU, 0U, INT_MAX32 },
    { "F2I -3.0e9 saturates to INT32_MIN",     OP_F2I, 1, 0xCF32D05EU, 0U, INT_MIN32 },
    { "F2I 2^31 saturates to INT32_MAX",       OP_F2I, 1, 0x4F000000U, 0U, INT_MAX32 },
    { "F2I -2^31 is INT32_MIN",                OP_F2I, 1, 0xCF000000U, 0U, INT_MIN32 },
    { "F2I the largest float below 2^31",      OP_F2I, 1, 0x4EFFFFFFU, 0U, 2147483520U },
    { "F2I 1.9 truncates to 1",                OP_F2I, 1, 0x3FF33333U, 0U, 1U },
    { "F2I -1.9 truncates to -1",              OP_F2I, 1, 0xBFF33333U, 0U, MINUS_ONE },
    { "F2I 0.5 is 0",                          OP_F2I, 1, 0x3F000000U, 0U, 0U },
    { "F2I -0.0 is 0",                         OP_F2I, 1, 0x80000000U, 0U, 0U },
};

static void test_defined_results(void)
{
    size_t i;

    printf("\n=== Test: defined results of the arithmetic edge cases ===\n");
    for (i = 0; i < sizeof(cases) / sizeof(cases[0]); i++) {
        check(&cases[i]);
    }
}

/* A 64-bit value as the two words the stack holds, low word first. */
#define W(v) (uint32_t)((v) & 0xFFFFFFFFU), (uint32_t)(((v) >> 32) & 0xFFFFFFFFU)

typedef struct {
    const char *name;
    uint8_t opcode;
    unsigned in_words;
    uint32_t in[5];
    unsigned out_words;
    uint32_t out[2];
} wide_case_t;

static const wide_case_t wide_cases[] = {
    { "MUL64 3 * 4 is 12", OP_MUL64, 4, { W(0x0000000000000003ULL), W(0x0000000000000004ULL) }, 2, { W(0x000000000000000CULL) } },
    { "MUL64 0xFFFFFFFF * 0xFFFFFFFF carries into the high word", OP_MUL64, 4, { W(0x00000000FFFFFFFFULL), W(0x00000000FFFFFFFFULL) }, 2, { W(0xFFFFFFFE00000001ULL) } },
    { "MUL64 2^32 * 2^32 wraps to 0", OP_MUL64, 4, { W(0x0000000100000000ULL), W(0x0000000100000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "MUL64 INT64_MAX * 2 wraps to -2", OP_MUL64, 4, { W(0x7FFFFFFFFFFFFFFFULL), W(0x0000000000000002ULL) }, 2, { W(0xFFFFFFFFFFFFFFFEULL) } },
    { "MUL64 INT64_MIN * -1 wraps to INT64_MIN", OP_MUL64, 4, { W(0x8000000000000000ULL), W(0xFFFFFFFFFFFFFFFFULL) }, 2, { W(0x8000000000000000ULL) } },
    { "MUL64 -3 * 4 is -12", OP_MUL64, 4, { W(0xFFFFFFFFFFFFFFFDULL), W(0x0000000000000004ULL) }, 2, { W(0xFFFFFFFFFFFFFFF4ULL) } },
    { "DIVS64 INT64_MIN / -1 is INT64_MIN", OP_DIVS64, 4, { W(0x8000000000000000ULL), W(0xFFFFFFFFFFFFFFFFULL) }, 2, { W(0x8000000000000000ULL) } },
    { "DIVS64 INT64_MAX / -1 is -INT64_MAX", OP_DIVS64, 4, { W(0x7FFFFFFFFFFFFFFFULL), W(0xFFFFFFFFFFFFFFFFULL) }, 2, { W(0x8000000000000001ULL) } },
    { "DIVS64 -7 / 2 truncates toward zero", OP_DIVS64, 4, { W(0xFFFFFFFFFFFFFFF9ULL), W(0x0000000000000002ULL) }, 2, { W(0xFFFFFFFFFFFFFFFDULL) } },
    { "DIVS64 7 / -2 truncates toward zero", OP_DIVS64, 4, { W(0x0000000000000007ULL), W(0xFFFFFFFFFFFFFFFEULL) }, 2, { W(0xFFFFFFFFFFFFFFFDULL) } },
    { "DIVS64 2^40 / 3", OP_DIVS64, 4, { W(0x0000010000000000ULL), W(0x0000000000000003ULL) }, 2, { W(0x0000005555555555ULL) } },
    { "DIVU64 0xFFFFFFFFFFFFFFFF / 2", OP_DIVU64, 4, { W(0xFFFFFFFFFFFFFFFFULL), W(0x0000000000000002ULL) }, 2, { W(0x7FFFFFFFFFFFFFFFULL) } },
    { "DIVU64 2^63 / 2^63 is 1", OP_DIVU64, 4, { W(0x8000000000000000ULL), W(0x8000000000000000ULL) }, 2, { W(0x0000000000000001ULL) } },
    { "DIVU64 2^63 / 3 reads the dividend as unsigned", OP_DIVU64, 4, { W(0x8000000000000000ULL), W(0x0000000000000003ULL) }, 2, { W(0x2AAAAAAAAAAAAAAAULL) } },
    { "MODS64 INT64_MIN MOD -1 is 0", OP_MODS64, 4, { W(0x8000000000000000ULL), W(0xFFFFFFFFFFFFFFFFULL) }, 2, { W(0x0000000000000000ULL) } },
    { "MODS64 -7 MOD 3 takes the dividend sign", OP_MODS64, 4, { W(0xFFFFFFFFFFFFFFF9ULL), W(0x0000000000000003ULL) }, 2, { W(0xFFFFFFFFFFFFFFFFULL) } },
    { "MODS64 7 MOD -3 takes the dividend sign", OP_MODS64, 4, { W(0x0000000000000007ULL), W(0xFFFFFFFFFFFFFFFDULL) }, 2, { W(0x0000000000000001ULL) } },
    { "MODU64 0xFFFFFFFFFFFFFFFF MOD 10 is 5", OP_MODU64, 4, { W(0xFFFFFFFFFFFFFFFFULL), W(0x000000000000000AULL) }, 2, { W(0x0000000000000005ULL) } },
    { "MODU64 2^63 MOD 7 reads the dividend as unsigned", OP_MODU64, 4, { W(0x8000000000000000ULL), W(0x0000000000000007ULL) }, 2, { W(0x0000000000000001ULL) } },
    { "NEG64 INT64_MIN is INT64_MIN", OP_NEG64, 2, { W(0x8000000000000000ULL) }, 2, { W(0x8000000000000000ULL) } },
    { "NEG64 5 is -5", OP_NEG64, 2, { W(0x0000000000000005ULL) }, 2, { W(0xFFFFFFFFFFFFFFFBULL) } },
    { "NEG64 2^32 borrows through the low word", OP_NEG64, 2, { W(0x0000000100000000ULL) }, 2, { W(0xFFFFFFFF00000000ULL) } },
    { "NEG64 0 is 0", OP_NEG64, 2, { W(0x0000000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "ABS64 INT64_MIN is INT64_MIN", OP_ABS64, 2, { W(0x8000000000000000ULL) }, 2, { W(0x8000000000000000ULL) } },
    { "ABS64 -5 is 5", OP_ABS64, 2, { W(0xFFFFFFFFFFFFFFFBULL) }, 2, { W(0x0000000000000005ULL) } },
    { "ABS64 5 is 5", OP_ABS64, 2, { W(0x0000000000000005ULL) }, 2, { W(0x0000000000000005ULL) } },
    { "SHL64 1 << 0", OP_SHL64, 3, { W(0x0000000000000001ULL), 0x00000000U }, 2, { W(0x0000000000000001ULL) } },
    { "SHL64 1 << 1", OP_SHL64, 3, { W(0x0000000000000001ULL), 0x00000001U }, 2, { W(0x0000000000000002ULL) } },
    { "SHL64 1 << 31", OP_SHL64, 3, { W(0x0000000000000001ULL), 0x0000001FU }, 2, { W(0x0000000080000000ULL) } },
    { "SHL64 1 << 32", OP_SHL64, 3, { W(0x0000000000000001ULL), 0x00000020U }, 2, { W(0x0000000100000000ULL) } },
    { "SHL64 1 << 33", OP_SHL64, 3, { W(0x0000000000000001ULL), 0x00000021U }, 2, { W(0x0000000200000000ULL) } },
    { "SHL64 1 << 63", OP_SHL64, 3, { W(0x0000000000000001ULL), 0x0000003FU }, 2, { W(0x8000000000000000ULL) } },
    { "SHL64 1 << 64", OP_SHL64, 3, { W(0x0000000000000001ULL), 0x00000040U }, 2, { W(0x0000000000000000ULL) } },
    { "SHL64 1 << 65", OP_SHL64, 3, { W(0x0000000000000001ULL), 0x00000041U }, 2, { W(0x0000000000000000ULL) } },
    { "SHL64 by a negative count is 0", OP_SHL64, 3, { W(0x0000000000000001ULL), 0xFFFFFFFFU }, 2, { W(0x0000000000000000ULL) } },
    { "SHL64 0xFFFFFFFF << 4 crosses the word boundary", OP_SHL64, 3, { W(0x00000000FFFFFFFFULL), 0x00000004U }, 2, { W(0x0000000FFFFFFFF0ULL) } },
    { "SHR64 2^63 >> 63 is 1", OP_SHR64, 3, { W(0x8000000000000000ULL), 0x0000003FU }, 2, { W(0x0000000000000001ULL) } },
    { "SHR64 2^63 >> 64 is 0", OP_SHR64, 3, { W(0x8000000000000000ULL), 0x00000040U }, 2, { W(0x0000000000000000ULL) } },
    { "SHR64 by a negative count is 0", OP_SHR64, 3, { W(0x8000000000000000ULL), 0xFFFFFFFFU }, 2, { W(0x0000000000000000ULL) } },
    { "SHR64 0xFFFFFFFF00000000 >> 32 is logical", OP_SHR64, 3, { W(0xFFFFFFFF00000000ULL), 0x00000020U }, 2, { W(0x00000000FFFFFFFFULL) } },
    { "SHR64 by 0 keeps the value", OP_SHR64, 3, { W(0xDEADBEEFCAFEBABEULL), 0x00000000U }, 2, { W(0xDEADBEEFCAFEBABEULL) } },
    { "SAR64 INT64_MIN >> 63 is -1", OP_SAR64, 3, { W(0x8000000000000000ULL), 0x0000003FU }, 2, { W(0xFFFFFFFFFFFFFFFFULL) } },
    { "SAR64 INT64_MIN >> 64 is -1", OP_SAR64, 3, { W(0x8000000000000000ULL), 0x00000040U }, 2, { W(0xFFFFFFFFFFFFFFFFULL) } },
    { "SAR64 negative by a negative count is -1", OP_SAR64, 3, { W(0x8000000000000000ULL), 0xFFFFFFFFU }, 2, { W(0xFFFFFFFFFFFFFFFFULL) } },
    { "SAR64 positive >> 64 is 0", OP_SAR64, 3, { W(0x4000000000000000ULL), 0x00000040U }, 2, { W(0x0000000000000000ULL) } },
    { "SAR64 positive by a negative count is 0", OP_SAR64, 3, { W(0x4000000000000000ULL), 0xFFFFFFFFU }, 2, { W(0x0000000000000000ULL) } },
    { "SAR64 -8 >> 1 is -4", OP_SAR64, 3, { W(0xFFFFFFFFFFFFFFF8ULL), 0x00000001U }, 2, { W(0xFFFFFFFFFFFFFFFCULL) } },
    { "SAR64 0xFFFFFFFF00000000 >> 32 is -1", OP_SAR64, 3, { W(0xFFFFFFFF00000000ULL), 0x00000020U }, 2, { W(0xFFFFFFFFFFFFFFFFULL) } },
    { "ADDD 1.0 + 2.0 is 3.0", OP_ADDD, 4, { W(0x3FF0000000000000ULL), W(0x4000000000000000ULL) }, 2, { W(0x4008000000000000ULL) } },
    { "ADDD 0.1 + 0.2 is 0.30000000000000004", OP_ADDD, 4, { W(0x3FB999999999999AULL), W(0x3FC999999999999AULL) }, 2, { W(0x3FD3333333333334ULL) } },
    { "ADDD 1e16 + 1.0 ties to the even 1e16", OP_ADDD, 4, { W(0x4341C37937E08000ULL), W(0x3FF0000000000000ULL) }, 2, { W(0x4341C37937E08000ULL) } },
    { "ADDD 1e16 + 3.0 ties to the even 1e16 + 4", OP_ADDD, 4, { W(0x4341C37937E08000ULL), W(0x4008000000000000ULL) }, 2, { W(0x4341C37937E08002ULL) } },
    { "ADDD DBL_MAX + DBL_MAX overflows to +Inf", OP_ADDD, 4, { W(0x7FEFFFFFFFFFFFFFULL), W(0x7FEFFFFFFFFFFFFFULL) }, 2, { W(0x7FF0000000000000ULL) } },
    { "ADDD +Inf + -Inf is the quiet NaN", OP_ADDD, 4, { W(0x7FF0000000000000ULL), W(0xFFF0000000000000ULL) }, 2, { W(0x7FF8000000000000ULL) } },
    { "ADDD NaN + 1.0 is the quiet NaN", OP_ADDD, 4, { W(0xFFF8000000000001ULL), W(0x3FF0000000000000ULL) }, 2, { W(0x7FF8000000000000ULL) } },
    { "ADDD -0.0 + -0.0 is -0.0", OP_ADDD, 4, { W(0x8000000000000000ULL), W(0x8000000000000000ULL) }, 2, { W(0x8000000000000000ULL) } },
    { "ADDD +0.0 + -0.0 is +0.0", OP_ADDD, 4, { W(0x0000000000000000ULL), W(0x8000000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "ADDD smallest subnormal twice is 2^-1073", OP_ADDD, 4, { W(0x0000000000000001ULL), W(0x0000000000000001ULL) }, 2, { W(0x0000000000000002ULL) } },
    { "ADDD 1.0 + 2^-53 is a tie that goes to the even 1.0", OP_ADDD, 4, { W(0x3FF0000000000000ULL), W(0x3CA0000000000000ULL) }, 2, { W(0x3FF0000000000000ULL) } },
    { "ADDD 1.0 + (2^-53 + 2^-105) is above the tie and rounds up", OP_ADDD, 4, { W(0x3FF0000000000000ULL), W(0x3CA0000000000001ULL) }, 2, { W(0x3FF0000000000001ULL) } },
    { "ADDD (1 + 2^-52) + 2^-53 is a tie that goes to the even 1 + 2^-51", OP_ADDD, 4, { W(0x3FF0000000000001ULL), W(0x3CA0000000000000ULL) }, 2, { W(0x3FF0000000000002ULL) } },
    { "SUBD 1.0 - 2^-54 rounds back to 1.0", OP_SUBD, 4, { W(0x3FF0000000000000ULL), W(0x3C90000000000000ULL) }, 2, { W(0x3FF0000000000000ULL) } },
    { "SUBD 1.0 - (2^-54 + 2^-106) is above the tie and rounds down", OP_SUBD, 4, { W(0x3FF0000000000000ULL), W(0x3C90000000000001ULL) }, 2, { W(0x3FEFFFFFFFFFFFFFULL) } },
    { "SUBD 1.0 - 1.0 is +0.0", OP_SUBD, 4, { W(0x3FF0000000000000ULL), W(0x3FF0000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "SUBD 0.3 - 0.1", OP_SUBD, 4, { W(0x3FD3333333333333ULL), W(0x3FB999999999999AULL) }, 2, { W(0x3FC9999999999999ULL) } },
    { "SUBD +Inf - +Inf is the quiet NaN", OP_SUBD, 4, { W(0x7FF0000000000000ULL), W(0x7FF0000000000000ULL) }, 2, { W(0x7FF8000000000000ULL) } },
    { "SUBD smallest normal - largest subnormal is the smallest subnormal", OP_SUBD, 4, { W(0x0010000000000000ULL), W(0x000FFFFFFFFFFFFFULL) }, 2, { W(0x0000000000000001ULL) } },
    { "MULD 0.1 * 3.0 is 0.30000000000000004", OP_MULD, 4, { W(0x3FB999999999999AULL), W(0x4008000000000000ULL) }, 2, { W(0x3FD3333333333334ULL) } },
    { "MULD DBL_MAX * 2.0 overflows to +Inf", OP_MULD, 4, { W(0x7FEFFFFFFFFFFFFFULL), W(0x4000000000000000ULL) }, 2, { W(0x7FF0000000000000ULL) } },
    { "MULD 0.0 * +Inf is the quiet NaN", OP_MULD, 4, { W(0x0000000000000000ULL), W(0x7FF0000000000000ULL) }, 2, { W(0x7FF8000000000000ULL) } },
    { "MULD -1.0 * +0.0 is -0.0", OP_MULD, 4, { W(0xBFF0000000000000ULL), W(0x0000000000000000ULL) }, 2, { W(0x8000000000000000ULL) } },
    { "MULD smallest normal * 0.5 is a subnormal", OP_MULD, 4, { W(0x0010000000000000ULL), W(0x3FE0000000000000ULL) }, 2, { W(0x0008000000000000ULL) } },
    { "MULD 1e-200 * 1e-200 underflows to +0.0", OP_MULD, 4, { W(0x16687E92154EF7ACULL), W(0x16687E92154EF7ACULL) }, 2, { W(0x0000000000000000ULL) } },
    { "DIVD 1.0 / 3.0", OP_DIVD, 4, { W(0x3FF0000000000000ULL), W(0x4008000000000000ULL) }, 2, { W(0x3FD5555555555555ULL) } },
    { "DIVD 1.0 / +Inf is +0.0", OP_DIVD, 4, { W(0x3FF0000000000000ULL), W(0x7FF0000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "DIVD -1.0 / +Inf is -0.0", OP_DIVD, 4, { W(0xBFF0000000000000ULL), W(0x7FF0000000000000ULL) }, 2, { W(0x8000000000000000ULL) } },
    { "DIVD +Inf / +Inf is the quiet NaN", OP_DIVD, 4, { W(0x7FF0000000000000ULL), W(0x7FF0000000000000ULL) }, 2, { W(0x7FF8000000000000ULL) } },
    { "DIVD DBL_MAX / 0.5 overflows to +Inf", OP_DIVD, 4, { W(0x7FEFFFFFFFFFFFFFULL), W(0x3FE0000000000000ULL) }, 2, { W(0x7FF0000000000000ULL) } },
    { "DIVD 10.0 / 4.0 is 2.5", OP_DIVD, 4, { W(0x4024000000000000ULL), W(0x4010000000000000ULL) }, 2, { W(0x4004000000000000ULL) } },
    { "NEGD +0.0 is -0.0", OP_NEGD, 2, { W(0x0000000000000000ULL) }, 2, { W(0x8000000000000000ULL) } },
    { "NEGD keeps the payload of a NaN", OP_NEGD, 2, { W(0x7FF8000000000001ULL) }, 2, { W(0xFFF8000000000001ULL) } },
    { "NEGD 1.5 is -1.5", OP_NEGD, 2, { W(0x3FF8000000000000ULL) }, 2, { W(0xBFF8000000000000ULL) } },
    { "ABSD -0.0 is +0.0", OP_ABSD, 2, { W(0x8000000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "ABSD -Inf is +Inf", OP_ABSD, 2, { W(0xFFF0000000000000ULL) }, 2, { W(0x7FF0000000000000ULL) } },
    { "ABSD keeps the payload of a NaN", OP_ABSD, 2, { W(0xFFF8000000000001ULL) }, 2, { W(0x7FF8000000000001ULL) } },
    { "SQRTD 4.0 is 2.0", OP_SQRTD, 2, { W(0x4010000000000000ULL) }, 2, { W(0x4000000000000000ULL) } },
    { "SQRTD 2.0 is 1.4142135623730951", OP_SQRTD, 2, { W(0x4000000000000000ULL) }, 2, { W(0x3FF6A09E667F3BCDULL) } },
    { "SQRTD 0.1", OP_SQRTD, 2, { W(0x3FB999999999999AULL) }, 2, { W(0x3FD43D136248490FULL) } },
    { "SQRTD DBL_MAX", OP_SQRTD, 2, { W(0x7FEFFFFFFFFFFFFFULL) }, 2, { W(0x5FEFFFFFFFFFFFFFULL) } },
    { "SQRTD the smallest subnormal is 2^-537", OP_SQRTD, 2, { W(0x0000000000000001ULL) }, 2, { W(0x1E60000000000000ULL) } },
    { "SQRTD 1e-310 (a subnormal)", OP_SQRTD, 2, { W(0x000012688B70E62BULL) }, 2, { W(0x1FC1297872D9CBAEULL) } },
    { "SQRTD 0.0 is 0.0", OP_SQRTD, 2, { W(0x0000000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "SQRTD -0.0 is +0.0", OP_SQRTD, 2, { W(0x8000000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "SQRTD -4.0 is 0.0", OP_SQRTD, 2, { W(0xC010000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "SQRTD +Inf is +Inf", OP_SQRTD, 2, { W(0x7FF0000000000000ULL) }, 2, { W(0x7FF0000000000000ULL) } },
    { "SQRTD NaN is the quiet NaN", OP_SQRTD, 2, { W(0xFFF8000000000001ULL) }, 2, { W(0x7FF8000000000000ULL) } },
    { "RNDD 2.5 is 2.0", OP_RNDD, 2, { W(0x4004000000000000ULL) }, 2, { W(0x4000000000000000ULL) } },
    { "RNDD 3.5 is 4.0", OP_RNDD, 2, { W(0x400C000000000000ULL) }, 2, { W(0x4010000000000000ULL) } },
    { "RNDD -2.5 is -2.0", OP_RNDD, 2, { W(0xC004000000000000ULL) }, 2, { W(0xC000000000000000ULL) } },
    { "RNDD 0.5 is 0.0", OP_RNDD, 2, { W(0x3FE0000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "RNDD -0.5 is -0.0", OP_RNDD, 2, { W(0xBFE0000000000000ULL) }, 2, { W(0x8000000000000000ULL) } },
    { "RNDD 0.49999999999999994 is 0.0", OP_RNDD, 2, { W(0x3FDFFFFFFFFFFFFFULL) }, 2, { W(0x0000000000000000ULL) } },
    { "RNDD 4503599627370495.5 is 4503599627370496.0", OP_RNDD, 2, { W(0x432FFFFFFFFFFFFFULL) }, 2, { W(0x4330000000000000ULL) } },
    { "RNDD 1.5e300 is unchanged", OP_RNDD, 2, { W(0x7E41EB2D66005835ULL) }, 2, { W(0x7E41EB2D66005835ULL) } },
    { "RNDD -Inf is -Inf", OP_RNDD, 2, { W(0xFFF0000000000000ULL) }, 2, { W(0xFFF0000000000000ULL) } },
    { "RNDD NaN is the quiet NaN", OP_RNDD, 2, { W(0xFFF8000000000001ULL) }, 2, { W(0x7FF8000000000000ULL) } },
    { "EQD +0.0 = -0.0 is true", OP_EQD, 4, { W(0x0000000000000000ULL), W(0x8000000000000000ULL) }, 1, { 0x00000001U } },
    { "EQD NaN = NaN is false", OP_EQD, 4, { W(0x7FF8000000000000ULL), W(0x7FF8000000000000ULL) }, 1, { 0x00000000U } },
    { "EQD 1.0 = 1.0 is true", OP_EQD, 4, { W(0x3FF0000000000000ULL), W(0x3FF0000000000000ULL) }, 1, { 0x00000001U } },
    { "NED NaN <> NaN is true", OP_NED, 4, { W(0x7FF8000000000000ULL), W(0x7FF8000000000000ULL) }, 1, { 0x00000001U } },
    { "NED 1.0 <> 2.0 is true", OP_NED, 4, { W(0x3FF0000000000000ULL), W(0x4000000000000000ULL) }, 1, { 0x00000001U } },
    { "NED +0.0 <> -0.0 is false", OP_NED, 4, { W(0x0000000000000000ULL), W(0x8000000000000000ULL) }, 1, { 0x00000000U } },
    { "LTD -Inf < 1.0 is true", OP_LTD, 4, { W(0xFFF0000000000000ULL), W(0x3FF0000000000000ULL) }, 1, { 0x00000001U } },
    { "LTD NaN < 1.0 is false", OP_LTD, 4, { W(0x7FF8000000000000ULL), W(0x3FF0000000000000ULL) }, 1, { 0x00000000U } },
    { "LTD -0.0 < +0.0 is false", OP_LTD, 4, { W(0x8000000000000000ULL), W(0x0000000000000000ULL) }, 1, { 0x00000000U } },
    { "LTD 1 + 2^-52 < 1.0 is false", OP_LTD, 4, { W(0x3FF0000000000001ULL), W(0x3FF0000000000000ULL) }, 1, { 0x00000000U } },
    { "LTD -2.0 < -1.0 is true", OP_LTD, 4, { W(0xC000000000000000ULL), W(0xBFF0000000000000ULL) }, 1, { 0x00000001U } },
    { "LED 1.0 <= 1.0 is true", OP_LED, 4, { W(0x3FF0000000000000ULL), W(0x3FF0000000000000ULL) }, 1, { 0x00000001U } },
    { "LED 1.0 <= NaN is false", OP_LED, 4, { W(0x3FF0000000000000ULL), W(0x7FF8000000000000ULL) }, 1, { 0x00000000U } },
    { "GTD +Inf > DBL_MAX is true", OP_GTD, 4, { W(0x7FF0000000000000ULL), W(0x7FEFFFFFFFFFFFFFULL) }, 1, { 0x00000001U } },
    { "GTD 1.0 > NaN is false", OP_GTD, 4, { W(0x3FF0000000000000ULL), W(0x7FF8000000000000ULL) }, 1, { 0x00000000U } },
    { "GTD -1.0 > -2.0 is true", OP_GTD, 4, { W(0xBFF0000000000000ULL), W(0xC000000000000000ULL) }, 1, { 0x00000001U } },
    { "GED 2.0 >= 2.0 is true", OP_GED, 4, { W(0x4000000000000000ULL), W(0x4000000000000000ULL) }, 1, { 0x00000001U } },
    { "GED NaN >= NaN is false", OP_GED, 4, { W(0x7FF8000000000000ULL), W(0x7FF8000000000000ULL) }, 1, { 0x00000000U } },
    { "F2D 0.1f is exact", OP_F2D, 1, { 0x3DCCCCCDU }, 2, { W(0x3FB99999A0000000ULL) } },
    { "F2D -0.0f is -0.0", OP_F2D, 1, { 0x80000000U }, 2, { W(0x8000000000000000ULL) } },
    { "F2D the smallest REAL subnormal is 2^-149", OP_F2D, 1, { 0x00000001U }, 2, { W(0x36A0000000000000ULL) } },
    { "F2D +Inf is +Inf", OP_F2D, 1, { 0x7F800000U }, 2, { W(0x7FF0000000000000ULL) } },
    { "F2D NaN with a payload is the quiet NaN", OP_F2D, 1, { 0xFFC00001U }, 2, { W(0x7FF8000000000000ULL) } },
    { "D2F 0.1 rounds to nearest even", OP_D2F, 2, { W(0x3FB999999999999AULL) }, 1, { 0x3DCCCCCDU } },
    { "D2F 1e40 overflows to +Inf", OP_D2F, 2, { W(0x483D6329F1C35CA5ULL) }, 1, { 0x7F800000U } },
    { "D2F FLT_MAX plus half an ulp ties up to +Inf", OP_D2F, 2, { W(0x47EFFFFFF0000000ULL) }, 1, { 0x7F800000U } },
    { "D2F FLT_MAX is FLT_MAX", OP_D2F, 2, { W(0x47EFFFFFE0000000ULL) }, 1, { 0x7F7FFFFFU } },
    { "D2F 2^-150 ties to the even zero", OP_D2F, 2, { W(0x3690000000000000ULL) }, 1, { 0x00000000U } },
    { "D2F 1.5 * 2^-149 ties to the even 2^-148", OP_D2F, 2, { W(0x36A8000000000000ULL) }, 1, { 0x00000002U } },
    { "D2F -1e-50 underflows to -0.0", OP_D2F, 2, { W(0xB58DEE7A4AD4B81FULL) }, 1, { 0x80000000U } },
    { "D2F NaN is the quiet NaN", OP_D2F, 2, { W(0xFFF8000000000001ULL) }, 1, { 0x7FC00000U } },
    { "I2D -1 is -1.0", OP_I2D, 1, { 0xFFFFFFFFU }, 2, { W(0xBFF0000000000000ULL) } },
    { "I2D INT32_MIN is -2^31", OP_I2D, 1, { 0x80000000U }, 2, { W(0xC1E0000000000000ULL) } },
    { "I2D 0 is +0.0", OP_I2D, 1, { 0x00000000U }, 2, { W(0x0000000000000000ULL) } },
    { "D2I NaN is 0", OP_D2I, 2, { W(0x7FF8000000000000ULL) }, 1, { 0x00000000U } },
    { "D2I 2147483647.9 truncates to INT32_MAX", OP_D2I, 2, { W(0x41DFFFFFFFF9999AULL) }, 1, { 0x7FFFFFFFU } },
    { "D2I 2^31 saturates to INT32_MAX", OP_D2I, 2, { W(0x41E0000000000000ULL) }, 1, { 0x7FFFFFFFU } },
    { "D2I -2^31 is INT32_MIN", OP_D2I, 2, { W(0xC1E0000000000000ULL) }, 1, { 0x80000000U } },
    { "D2I -2^31 - 1 saturates to INT32_MIN", OP_D2I, 2, { W(0xC1E0000000200000ULL) }, 1, { 0x80000000U } },
    { "D2I -1.9 truncates to -1", OP_D2I, 2, { W(0xBFFE666666666666ULL) }, 1, { 0xFFFFFFFFU } },
    { "D2I +Inf saturates to INT32_MAX", OP_D2I, 2, { W(0x7FF0000000000000ULL) }, 1, { 0x7FFFFFFFU } },
    { "D2I 1e300 saturates to INT32_MAX", OP_D2I, 2, { W(0x7E37E43C8800759CULL) }, 1, { 0x7FFFFFFFU } },
    { "L2D 2^53 + 1 ties to the even 2^53", OP_L2D, 2, { W(0x0020000000000001ULL) }, 2, { W(0x4340000000000000ULL) } },
    { "L2D 2^53 + 3 ties to the even 2^53 + 4", OP_L2D, 2, { W(0x0020000000000003ULL) }, 2, { W(0x4340000000000002ULL) } },
    { "L2D INT64_MIN is -2^63", OP_L2D, 2, { W(0x8000000000000000ULL) }, 2, { W(0xC3E0000000000000ULL) } },
    { "L2D INT64_MAX rounds to 2^63", OP_L2D, 2, { W(0x7FFFFFFFFFFFFFFFULL) }, 2, { W(0x43E0000000000000ULL) } },
    { "L2D -1 is -1.0", OP_L2D, 2, { W(0xFFFFFFFFFFFFFFFFULL) }, 2, { W(0xBFF0000000000000ULL) } },
    { "U2D 0xFFFFFFFFFFFFFFFF rounds to 2^64", OP_U2D, 2, { W(0xFFFFFFFFFFFFFFFFULL) }, 2, { W(0x43F0000000000000ULL) } },
    { "U2D 2^63 + 1 reads the value as unsigned", OP_U2D, 2, { W(0x8000000000000001ULL) }, 2, { W(0x43E0000000000000ULL) } },
    { "D2L 2^63 saturates to INT64_MAX", OP_D2L, 2, { W(0x43E0000000000000ULL) }, 2, { W(0x7FFFFFFFFFFFFFFFULL) } },
    { "D2L -2^63 is INT64_MIN", OP_D2L, 2, { W(0xC3E0000000000000ULL) }, 2, { W(0x8000000000000000ULL) } },
    { "D2L NaN is 0", OP_D2L, 2, { W(0x7FF8000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "D2L -1.5 truncates to -1", OP_D2L, 2, { W(0xBFF8000000000000ULL) }, 2, { W(0xFFFFFFFFFFFFFFFFULL) } },
    { "D2L 4294967296.5 truncates to 2^32", OP_D2L, 2, { W(0x41F0000000080000ULL) }, 2, { W(0x0000000100000000ULL) } },
    { "D2L -Inf saturates to INT64_MIN", OP_D2L, 2, { W(0xFFF0000000000000ULL) }, 2, { W(0x8000000000000000ULL) } },
    { "D2U -1.0 is 0", OP_D2U, 2, { W(0xBFF0000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "D2U 0.99 is 0", OP_D2U, 2, { W(0x3FEFAE147AE147AEULL) }, 2, { W(0x0000000000000000ULL) } },
    { "D2U 2^63 is 2^63", OP_D2U, 2, { W(0x43E0000000000000ULL) }, 2, { W(0x8000000000000000ULL) } },
    { "D2U 2^64 saturates to UINT64_MAX", OP_D2U, 2, { W(0x43F0000000000000ULL) }, 2, { W(0xFFFFFFFFFFFFFFFFULL) } },
    { "D2U the largest double below 2^64", OP_D2U, 2, { W(0x43EFFFFFFFFFFFFFULL) }, 2, { W(0xFFFFFFFFFFFFF800ULL) } },
    { "D2U NaN is 0", OP_D2U, 2, { W(0x7FF8000000000000ULL) }, 2, { W(0x0000000000000000ULL) } },
    { "L2F 2^60 + 2^36 + 1 rounds once, up", OP_L2F, 2, { W(0x1000001000000001ULL) }, 1, { 0x5D800001U } },
    { "L2F INT64_MIN is -2^63", OP_L2F, 2, { W(0x8000000000000000ULL) }, 1, { 0xDF000000U } },
    { "L2F -1 is -1.0f", OP_L2F, 2, { W(0xFFFFFFFFFFFFFFFFULL) }, 1, { 0xBF800000U } },
    { "L2F 16777217 ties to the even 16777216", OP_L2F, 2, { W(0x0000000001000001ULL) }, 1, { 0x4B800000U } },
    { "U2F 0xFFFFFFFFFFFFFFFF rounds to 2^64", OP_U2F, 2, { W(0xFFFFFFFFFFFFFFFFULL) }, 1, { 0x5F800000U } },
    { "U2F 2^63 + 2^39 reads the value as unsigned", OP_U2F, 2, { W(0x8000008000000000ULL) }, 1, { 0x5F000000U } },
};

static void check_wide(const wide_case_t *c)
{
    uint8_t code[48];
    size_t len = 0;
    unsigned i;
    const zplc_vm_state_t *state;
    int ok;

    for (i = 0; i < c->in_words; i++) {
        len = emit_push32(code, len, c->in[i]);
    }
    code[len++] = c->opcode;
    code[len++] = OP_HALT;

    zplc_core_init();
    ok = zplc_test_load_raw(code, len) == 0;
    state = NULL;
    if (ok) {
        (void)zplc_core_run(0);
        state = zplc_core_get_state();
        ok = state->error == ZPLC_VM_HALTED && state->sp == c->out_words;
        for (i = 0; ok && i < c->out_words; i++) {
            ok = state->stack[i] == c->out[i];
        }
    }
    test_count++;
    if (!ok) {
        fprintf(stderr, "FAIL: %s - expected", c->name);
        for (i = 0; i < c->out_words; i++) {
            fprintf(stderr, " 0x%08X", (unsigned)c->out[i]);
        }
        fprintf(stderr, ", got");
        if (state != NULL) {
            for (i = 0; i < state->sp && i < 4U; i++) {
                fprintf(stderr, " 0x%08X", (unsigned)state->stack[i]);
            }
            fprintf(stderr, " (error %u, sp %u)", (unsigned)state->error, (unsigned)state->sp);
        }
        fprintf(stderr, "\n");
        fail_count++;
    } else {
        printf("PASS: %s\n", c->name);
    }
}

static void test_wide_results(void)
{
    size_t i;

    printf("\n=== Test: 64-bit integer and double-precision results ===\n");
    for (i = 0; i < sizeof(wide_cases) / sizeof(wide_cases[0]); i++) {
        check_wide(&wide_cases[i]);
    }
}

/* Division and modulo by zero fault the way DIV, MOD and DIVF do, for every width. */
static void test_wide_division_by_zero_faults(void)
{
    static const wide_case_t faulting[] = {
        { "DIVS64 by 0", OP_DIVS64, 4, { W(0x5ULL), W(0x0ULL) }, 0, { 0U, 0U } },
        { "DIVU64 by 0", OP_DIVU64, 4, { W(0x5ULL), W(0x0ULL) }, 0, { 0U, 0U } },
        { "MODS64 by 0", OP_MODS64, 4, { W(0x5ULL), W(0x0ULL) }, 0, { 0U, 0U } },
        { "MODU64 by 0", OP_MODU64, 4, { W(0x5ULL), W(0x0ULL) }, 0, { 0U, 0U } },
        { "DIVS64 INT64_MIN by 0", OP_DIVS64, 4, { W(0x8000000000000000ULL), W(0x0ULL) }, 0, { 0U, 0U } },
        { "DIVD 1.0 by +0.0", OP_DIVD, 4, { W(0x3FF0000000000000ULL), W(0x0ULL) }, 0, { 0U, 0U } },
        { "DIVD 1.0 by -0.0", OP_DIVD, 4, { W(0x3FF0000000000000ULL), W(0x8000000000000000ULL) }, 0, { 0U, 0U } },
        { "DIVD 0.0 by 0.0", OP_DIVD, 4, { W(0x0ULL), W(0x0ULL) }, 0, { 0U, 0U } },
        { "DIVD NaN by 0.0", OP_DIVD, 4, { W(0x7FF8000000000000ULL), W(0x0ULL) }, 0, { 0U, 0U } },
    };
    size_t i;

    printf("\n=== Test: division by zero faults for 64-bit and double operands ===\n");
    for (i = 0; i < sizeof(faulting) / sizeof(faulting[0]); i++) {
        const wide_case_t *c = &faulting[i];
        uint8_t code[48];
        size_t len = 0;
        unsigned w;
        const zplc_vm_state_t *state;

        for (w = 0; w < c->in_words; w++) {
            len = emit_push32(code, len, c->in[w]);
        }
        code[len++] = c->opcode;
        code[len++] = OP_HALT;
        zplc_core_init();
        test_count++;
        if (zplc_test_load_raw(code, len) != 0) {
            fprintf(stderr, "FAIL: %s did not load\n", c->name);
            fail_count++;
            continue;
        }
        (void)zplc_core_run(0);
        state = zplc_core_get_state();
        if (state->error != ZPLC_VM_DIV_BY_ZERO || !state->halted) {
            fprintf(stderr, "FAIL: %s did not fault with DIV_BY_ZERO (error %u)\n", c->name, (unsigned)state->error);
            fail_count++;
        } else {
            printf("PASS: %s faults with DIV_BY_ZERO\n", c->name);
        }
    }
}

static void test_division_by_zero_still_faults(void)
{
    static const arith_case_t div_zero = { "DIV by 0", OP_DIV, 2, 5U, 0U, 0U };
    static const arith_case_t mod_zero = { "MOD by 0", OP_MOD, 2, 5U, 0U, 0U };
    const arith_case_t *faulting[2];
    size_t i;

    faulting[0] = &div_zero;
    faulting[1] = &mod_zero;
    printf("\n=== Test: division and modulo by zero keep the VM fault ===\n");
    for (i = 0; i < 2; i++) {
        uint8_t error;
        uint16_t sp;
        uint8_t halted;

        (void)run_case(faulting[i], &error, &sp, &halted);
        test_count++;
        if (error != ZPLC_VM_DIV_BY_ZERO || !halted) {
            fprintf(stderr, "FAIL: %s did not fault with DIV_BY_ZERO (error %u)\n", faulting[i]->name, (unsigned)error);
            fail_count++;
        } else {
            printf("PASS: %s faults with DIV_BY_ZERO\n", faulting[i]->name);
        }
    }
}

static size_t emit_mem_op(uint8_t *buf, size_t n, uint8_t opcode, uint16_t addr)
{
    buf[n++] = opcode;
    buf[n++] = (uint8_t)addr;
    buf[n++] = (uint8_t)(addr >> 8);
    return n;
}

/** Store the pushed words at `addr`, load them back, and compare the stack. */
static void check_round_trip(const char *name, uint8_t store, uint8_t load,
                             uint16_t addr, const uint32_t *words, size_t word_count)
{
    uint8_t code[32];
    size_t len = 0;
    size_t i;
    const zplc_vm_state_t *state;
    int ok;

    for (i = 0; i < word_count; i++) {
        len = emit_push32(code, len, words[i]);
    }
    len = emit_mem_op(code, len, store, addr);
    len = emit_mem_op(code, len, load, addr);
    code[len++] = OP_HALT;

    zplc_core_init();
    ok = zplc_test_load_raw(code, len) == 0;
    if (ok) {
        (void)zplc_core_run(0);
        state = zplc_core_get_state();
        ok = state->error == ZPLC_VM_HALTED && state->sp == word_count;
        for (i = 0; ok && i < word_count; i++) {
            ok = state->stack[i] == words[i];
        }
    }

    test_count++;
    if (!ok) {
        fprintf(stderr, "FAIL: %s at 0x%04X\n", name, (unsigned)addr);
        fail_count++;
    } else {
        printf("PASS: %s at 0x%04X\n", name, (unsigned)addr);
    }
}

static void test_unaligned_work_memory_round_trips(void)
{
    static const uint16_t odd_offsets[] = { 1U, 2U, 3U, 5U, 7U };
    static const uint32_t one_word[] = { 0x5AA51234U };
    static const uint32_t two_words[] = { 0xDEADBEEFU, 0xCAFEBABEU };
    size_t i;

    printf("\n=== Test: unaligned work memory access ===\n");
    for (i = 0; i < sizeof(odd_offsets) / sizeof(odd_offsets[0]); i++) {
        uint16_t addr = (uint16_t)(ZPLC_MEM_WORK_BASE + odd_offsets[i]);

        /* PUSH32 keeps the whole word on the stack, LOAD16 returns the low half. */
        {
            static const uint32_t half[] = { 0x00001234U };

            check_round_trip("STORE16/LOAD16", OP_STORE16, OP_LOAD16, addr, half, 1U);
        }
        check_round_trip("STORE32/LOAD32", OP_STORE32, OP_LOAD32, addr, one_word, 1U);
        check_round_trip("STORE64/LOAD64", OP_STORE64, OP_LOAD64, addr, two_words, 2U);
    }
}

int main(void)
{
    printf("================================================\n");
    printf("  ZPLC VM arithmetic edge cases\n");
    printf("================================================\n");

    test_defined_results();
    test_division_by_zero_still_faults();
    test_wide_results();
    test_wide_division_by_zero_faults();
    test_unaligned_work_memory_round_trips();

    printf("\n%d tests, %d failed\n", test_count, fail_count);
    return fail_count == 0 ? 0 : 1;
}
