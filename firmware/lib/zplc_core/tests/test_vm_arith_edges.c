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
 */

#include <zplc_core.h>
#include <zplc_isa.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

int zplc_test_load_raw(const uint8_t *bytecode, size_t size);

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

int main(void)
{
    printf("================================================\n");
    printf("  ZPLC VM arithmetic edge cases\n");
    printf("================================================\n");

    test_defined_results();
    test_division_by_zero_still_faults();

    printf("\n%d tests, %d failed\n", test_count, fail_count);
    return fail_count == 0 ? 0 : 1;
}
