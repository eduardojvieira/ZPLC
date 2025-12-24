/**
 * @file test_vm_core.c
 * @brief ZPLC Virtual Machine Core Tests
 *
 * SPDX-License-Identifier: MIT
 *
 * This test suite verifies the VM interpreter by constructing
 * bytecode programs and checking execution results.
 */

#include <zplc_core.h>
#include <zplc_isa.h>
#include <stdio.h>
#include <string.h>

/* ============================================================================
 * Test Infrastructure
 * ============================================================================ */

static int test_count = 0;
static int fail_count = 0;

#define TEST_ASSERT(cond, msg) do { \
    test_count++; \
    if (!(cond)) { \
        fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
        fail_count++; \
    } else { \
        printf("PASS: %s\n", msg); \
    } \
} while(0)

#define TEST_ASSERT_EQ(actual, expected, msg) do { \
    test_count++; \
    if ((actual) != (expected)) { \
        fprintf(stderr, "FAIL: %s - expected %d, got %d (line %d)\n", \
                msg, (int)(expected), (int)(actual), __LINE__); \
        fail_count++; \
    } else { \
        printf("PASS: %s = %d\n", msg, (int)(actual)); \
    } \
} while(0)

/* ============================================================================
 * Bytecode Builder Helpers
 * ============================================================================ */

/**
 * @brief Append a PUSH32 instruction with a 32-bit value.
 */
static size_t emit_push32(uint8_t *buf, size_t offset, uint32_t value)
{
    buf[offset++] = OP_PUSH32;
    buf[offset++] = (uint8_t)(value & 0xFF);
    buf[offset++] = (uint8_t)((value >> 8) & 0xFF);
    buf[offset++] = (uint8_t)((value >> 16) & 0xFF);
    buf[offset++] = (uint8_t)((value >> 24) & 0xFF);
    return offset;
}

/**
 * @brief Append a PUSH8 instruction with an 8-bit value.
 */
static size_t emit_push8(uint8_t *buf, size_t offset, int8_t value)
{
    buf[offset++] = OP_PUSH8;
    buf[offset++] = (uint8_t)value;
    return offset;
}

/**
 * @brief Append a simple opcode (no operand).
 */
static size_t emit_op(uint8_t *buf, size_t offset, uint8_t opcode)
{
    buf[offset++] = opcode;
    return offset;
}

/**
 * @brief Append a STORE32 instruction.
 */
static size_t emit_store32(uint8_t *buf, size_t offset, uint16_t addr)
{
    buf[offset++] = OP_STORE32;
    buf[offset++] = (uint8_t)(addr & 0xFF);
    buf[offset++] = (uint8_t)((addr >> 8) & 0xFF);
    return offset;
}

/**
 * @brief Append a LOAD32 instruction.
 */
static size_t emit_load32(uint8_t *buf, size_t offset, uint16_t addr)
{
    buf[offset++] = OP_LOAD32;
    buf[offset++] = (uint8_t)(addr & 0xFF);
    buf[offset++] = (uint8_t)((addr >> 8) & 0xFF);
    return offset;
}

/**
 * @brief Append a JZ instruction.
 */
static size_t emit_jz(uint8_t *buf, size_t offset, uint16_t addr)
{
    buf[offset++] = OP_JZ;
    buf[offset++] = (uint8_t)(addr & 0xFF);
    buf[offset++] = (uint8_t)((addr >> 8) & 0xFF);
    return offset;
}

/**
 * @brief Append a JMP instruction.
 */
static size_t emit_jmp(uint8_t *buf, size_t offset, uint16_t addr)
{
    buf[offset++] = OP_JMP;
    buf[offset++] = (uint8_t)(addr & 0xFF);
    buf[offset++] = (uint8_t)((addr >> 8) & 0xFF);
    return offset;
}

/* ============================================================================
 * Basic Stack Operation Tests
 * ============================================================================ */

static void test_push_and_halt(void)
{
    uint8_t code[16];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: PUSH32 and HALT ===\n");

    /* Program: PUSH32 42, HALT */
    len = emit_push32(code, len, 42);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    TEST_ASSERT_EQ(zplc_core_load_raw(code, len), 0, "Load raw bytecode");

    /* Execute */
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT(state->halted, "VM halted");
    TEST_ASSERT_EQ(state->sp, 1, "Stack has 1 item");
    TEST_ASSERT_EQ(state->stack[0], 42, "Stack[0] = 42");
}

static void test_arithmetic(void)
{
    uint8_t code[64];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: Arithmetic Operations ===\n");

    /* Program: PUSH32 10, PUSH32 20, ADD, HALT */
    /* Expected: 10 + 20 = 30 */
    len = emit_push32(code, len, 10);
    len = emit_push32(code, len, 20);
    len = emit_op(code, len, OP_ADD);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 30, "10 + 20 = 30");

    /* Test subtraction */
    len = 0;
    len = emit_push32(code, len, 100);
    len = emit_push32(code, len, 30);
    len = emit_op(code, len, OP_SUB);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 70, "100 - 30 = 70");

    /* Test multiplication */
    len = 0;
    len = emit_push32(code, len, 7);
    len = emit_push32(code, len, 6);
    len = emit_op(code, len, OP_MUL);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 42, "7 * 6 = 42");

    /* Test division */
    len = 0;
    len = emit_push32(code, len, 100);
    len = emit_push32(code, len, 10);
    len = emit_op(code, len, OP_DIV);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 10, "100 / 10 = 10");

    /* Test modulo */
    len = 0;
    len = emit_push32(code, len, 17);
    len = emit_push32(code, len, 5);
    len = emit_op(code, len, OP_MOD);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 2, "17 % 5 = 2");
}

static void test_stack_operations(void)
{
    uint8_t code[64];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: Stack Operations ===\n");

    /* Test DUP: PUSH 5, DUP -> [5, 5] */
    len = 0;
    len = emit_push32(code, len, 5);
    len = emit_op(code, len, OP_DUP);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->sp, 2, "DUP: sp = 2");
    TEST_ASSERT_EQ(state->stack[0], 5, "DUP: stack[0] = 5");
    TEST_ASSERT_EQ(state->stack[1], 5, "DUP: stack[1] = 5");

    /* Test DROP: PUSH 10, PUSH 20, DROP -> [10] */
    len = 0;
    len = emit_push32(code, len, 10);
    len = emit_push32(code, len, 20);
    len = emit_op(code, len, OP_DROP);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->sp, 1, "DROP: sp = 1");
    TEST_ASSERT_EQ(state->stack[0], 10, "DROP: stack[0] = 10");

    /* Test SWAP: PUSH 1, PUSH 2, SWAP -> [2, 1] */
    len = 0;
    len = emit_push32(code, len, 1);
    len = emit_push32(code, len, 2);
    len = emit_op(code, len, OP_SWAP);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 2, "SWAP: stack[0] = 2");
    TEST_ASSERT_EQ(state->stack[1], 1, "SWAP: stack[1] = 1");
}

/* ============================================================================
 * Logic Operation Tests
 * ============================================================================ */

static void test_logic_operations(void)
{
    uint8_t code[64];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: Logic Operations ===\n");

    /* Test AND: 0xFF00 & 0x0FF0 = 0x0F00 */
    len = 0;
    len = emit_push32(code, len, 0xFF00);
    len = emit_push32(code, len, 0x0FF0);
    len = emit_op(code, len, OP_AND);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0x0F00, "0xFF00 & 0x0FF0 = 0x0F00");

    /* Test OR: 0xF000 | 0x000F = 0xF00F */
    len = 0;
    len = emit_push32(code, len, 0xF000);
    len = emit_push32(code, len, 0x000F);
    len = emit_op(code, len, OP_OR);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0xF00F, "0xF000 | 0x000F = 0xF00F");

    /* Test NOT: ~0x00000000 = 0xFFFFFFFF */
    len = 0;
    len = emit_push32(code, len, 0x00000000);
    len = emit_op(code, len, OP_NOT);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0xFFFFFFFF, "~0x00000000 = 0xFFFFFFFF");
}

/* ============================================================================
 * Comparison Operation Tests
 * ============================================================================ */

static void test_comparison_operations(void)
{
    uint8_t code[64];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: Comparison Operations ===\n");

    /* Test EQ: 42 == 42 -> 1 */
    len = 0;
    len = emit_push32(code, len, 42);
    len = emit_push32(code, len, 42);
    len = emit_op(code, len, OP_EQ);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 1, "42 == 42 -> 1");

    /* Test EQ: 42 == 43 -> 0 */
    len = 0;
    len = emit_push32(code, len, 42);
    len = emit_push32(code, len, 43);
    len = emit_op(code, len, OP_EQ);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0, "42 == 43 -> 0");

    /* Test GT: 10 > 5 -> 1 */
    len = 0;
    len = emit_push32(code, len, 10);
    len = emit_push32(code, len, 5);
    len = emit_op(code, len, OP_GT);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 1, "10 > 5 -> 1");

    /* Test LT: 5 < 10 -> 1 */
    len = 0;
    len = emit_push32(code, len, 5);
    len = emit_push32(code, len, 10);
    len = emit_op(code, len, OP_LT);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 1, "5 < 10 -> 1");
}

/* ============================================================================
 * Memory Access Tests
 * ============================================================================ */

static void test_memory_access(void)
{
    uint8_t code[64];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: Memory Access ===\n");

    /* Test STORE32/LOAD32 in work memory (0x2000+) */
    /* Program: PUSH 12345, STORE32 0x2000, LOAD32 0x2000, HALT */
    len = 0;
    len = emit_push32(code, len, 12345);
    len = emit_store32(code, len, 0x2000);  /* Store to work memory */
    len = emit_load32(code, len, 0x2000);   /* Load back */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 12345, "STORE/LOAD work memory: 12345");

    /* Test writing to OPI (0x1000+) */
    len = 0;
    len = emit_push32(code, len, 0xDEADBEEF);
    len = emit_store32(code, len, 0x1000);  /* Store to OPI */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    TEST_ASSERT_EQ(zplc_core_get_opi(0), 0xDEADBEEF, "OPI[0] = 0xDEADBEEF");

    /* Test reading from IPI (0x0000+) */
    len = 0;
    len = emit_load32(code, len, 0x0000);   /* Load from IPI */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_set_ipi(0, 0xCAFEBABE);       /* Set input value */
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0xCAFEBABE, "Load IPI: 0xCAFEBABE");
}

/* ============================================================================
 * Control Flow Tests
 * ============================================================================ */

static void test_control_flow(void)
{
    uint8_t code[64];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: Control Flow ===\n");

    /*
     * Test JMP: Jump over an instruction
     * 0: JMP 6       (3 bytes)
     * 3: PUSH32 999  (5 bytes) <- should be skipped
     * 8: PUSH32 42   (5 bytes)
     * 13: HALT
     */
    len = 0;
    len = emit_jmp(code, len, 8);           /* Jump to offset 8 */
    len = emit_push32(code, len, 999);      /* Should be skipped */
    len = emit_push32(code, len, 42);       /* This should execute */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->sp, 1, "JMP: only one value on stack");
    TEST_ASSERT_EQ(state->stack[0], 42, "JMP: skipped 999, got 42");

    /*
     * Test JZ (jump if zero):
     * PUSH 0, JZ skip, PUSH 100, skip: PUSH 42, HALT
     */
    len = 0;
    len = emit_push32(code, len, 0);        /* Push 0 (false) */
    len = emit_jz(code, len, 13);           /* JZ to offset 13 */
    len = emit_push32(code, len, 100);      /* Should be skipped */
    len = emit_push32(code, len, 42);       /* offset 13: This executes */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->sp, 1, "JZ(true): only one value on stack");
    TEST_ASSERT_EQ(state->stack[0], 42, "JZ(true): jumped, got 42");

    /*
     * Test JZ not taken:
     * PUSH 1, JZ skip, PUSH 100, HALT, skip: PUSH 42, HALT
     */
    len = 0;
    len = emit_push32(code, len, 1);        /* Push 1 (true) */
    len = emit_jz(code, len, 18);           /* JZ to offset 18 (not taken) */
    len = emit_push32(code, len, 100);      /* This executes */
    len = emit_op(code, len, OP_HALT);
    len = emit_push32(code, len, 42);       /* Skipped */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 100, "JZ(false): no jump, got 100");
}

/* ============================================================================
 * Error Handling Tests
 * ============================================================================ */

static void test_error_handling(void)
{
    uint8_t code[64];
    size_t len = 0;
    int result;

    printf("\n=== Test: Error Handling ===\n");

    /* Test division by zero */
    len = 0;
    len = emit_push32(code, len, 10);
    len = emit_push32(code, len, 0);
    len = emit_op(code, len, OP_DIV);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    result = zplc_core_run(0);

    TEST_ASSERT(result < 0, "Division by zero returns error");
    TEST_ASSERT_EQ(zplc_core_get_error(), ZPLC_VM_DIV_BY_ZERO,
                   "Error code is DIV_BY_ZERO");

    /* Test stack underflow */
    len = 0;
    len = emit_op(code, len, OP_DROP);      /* Drop with empty stack */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    result = zplc_core_run(0);

    TEST_ASSERT(result < 0, "Stack underflow returns error");
    TEST_ASSERT_EQ(zplc_core_get_error(), ZPLC_VM_STACK_UNDERFLOW,
                   "Error code is STACK_UNDERFLOW");
}

/* ============================================================================
 * Complex Program Test
 * ============================================================================ */

static void test_complex_program(void)
{
    uint8_t code[128];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: Complex Program ===\n");

    /*
     * Program: Calculate (10 + 20) * 3 - 5 = 85
     * Then store to OPI[0]
     */
    len = 0;
    len = emit_push32(code, len, 10);
    len = emit_push32(code, len, 20);
    len = emit_op(code, len, OP_ADD);       /* 10 + 20 = 30 */
    len = emit_push32(code, len, 3);
    len = emit_op(code, len, OP_MUL);       /* 30 * 3 = 90 */
    len = emit_push32(code, len, 5);
    len = emit_op(code, len, OP_SUB);       /* 90 - 5 = 85 */
    len = emit_store32(code, len, 0x1000);  /* Store to OPI */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT(state->halted, "Complex program halted");
    TEST_ASSERT_EQ(state->sp, 0, "Stack is empty after STORE");
    TEST_ASSERT_EQ(zplc_core_get_opi(0), 85, "(10+20)*3-5 = 85 in OPI");
}

/* ============================================================================
 * PUSH8 Test (Sign Extension)
 * ============================================================================ */

static void test_push8_sign_extension(void)
{
    uint8_t code[32];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: PUSH8 Sign Extension ===\n");

    /* Positive value: PUSH8 42 */
    len = 0;
    len = emit_push8(code, len, 42);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 42, "PUSH8 42 -> 42");

    /* Negative value: PUSH8 -1 (0xFF) should become 0xFFFFFFFF */
    len = 0;
    len = emit_push8(code, len, -1);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0xFFFFFFFF, "PUSH8 -1 -> 0xFFFFFFFF");
}

/* ============================================================================
 * Float Arithmetic Tests
 * ============================================================================ */

/**
 * @brief Helper to convert float to uint32_t bit pattern.
 */
static uint32_t float_to_bits(float f)
{
    uint32_t bits;
    memcpy(&bits, &f, sizeof(bits));
    return bits;
}

/**
 * @brief Helper to convert uint32_t bit pattern to float.
 */
static float bits_to_float(uint32_t bits)
{
    float f;
    memcpy(&f, &bits, sizeof(f));
    return f;
}

static void test_float_arithmetic(void)
{
    uint8_t code[64];
    size_t len = 0;
    const zplc_vm_state_t *state;
    float result;

    printf("\n=== Test: Float Arithmetic ===\n");

    /* Test ADDF: 3.5 + 2.5 = 6.0 */
    len = 0;
    len = emit_push32(code, len, float_to_bits(3.5f));
    len = emit_push32(code, len, float_to_bits(2.5f));
    len = emit_op(code, len, OP_ADDF);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    result = bits_to_float(state->stack[0]);
    TEST_ASSERT(result == 6.0f, "ADDF: 3.5 + 2.5 = 6.0");

    /* Test SUBF: 10.0 - 3.5 = 6.5 */
    len = 0;
    len = emit_push32(code, len, float_to_bits(10.0f));
    len = emit_push32(code, len, float_to_bits(3.5f));
    len = emit_op(code, len, OP_SUBF);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    result = bits_to_float(state->stack[0]);
    TEST_ASSERT(result == 6.5f, "SUBF: 10.0 - 3.5 = 6.5");

    /* Test MULF: 3.0 * 4.0 = 12.0 */
    len = 0;
    len = emit_push32(code, len, float_to_bits(3.0f));
    len = emit_push32(code, len, float_to_bits(4.0f));
    len = emit_op(code, len, OP_MULF);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    result = bits_to_float(state->stack[0]);
    TEST_ASSERT(result == 12.0f, "MULF: 3.0 * 4.0 = 12.0");

    /* Test DIVF: 15.0 / 3.0 = 5.0 */
    len = 0;
    len = emit_push32(code, len, float_to_bits(15.0f));
    len = emit_push32(code, len, float_to_bits(3.0f));
    len = emit_op(code, len, OP_DIVF);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    result = bits_to_float(state->stack[0]);
    TEST_ASSERT(result == 5.0f, "DIVF: 15.0 / 3.0 = 5.0");

    /* Test NEGF: -(-7.5) = 7.5 */
    len = 0;
    len = emit_push32(code, len, float_to_bits(-7.5f));
    len = emit_op(code, len, OP_NEGF);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    result = bits_to_float(state->stack[0]);
    TEST_ASSERT(result == 7.5f, "NEGF: -(-7.5) = 7.5");

    /* Test ABSF: abs(-9.25) = 9.25 */
    len = 0;
    len = emit_push32(code, len, float_to_bits(-9.25f));
    len = emit_op(code, len, OP_ABSF);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    result = bits_to_float(state->stack[0]);
    TEST_ASSERT(result == 9.25f, "ABSF: abs(-9.25) = 9.25");

    /* Test DIVF by zero - should error */
    len = 0;
    len = emit_push32(code, len, float_to_bits(10.0f));
    len = emit_push32(code, len, float_to_bits(0.0f));
    len = emit_op(code, len, OP_DIVF);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    TEST_ASSERT_EQ(zplc_core_get_error(), ZPLC_VM_DIV_BY_ZERO,
                   "DIVF by zero triggers error");
}

/* ============================================================================
 * Type Conversion Tests
 * ============================================================================ */

static void test_type_conversions(void)
{
    uint8_t code[64];
    size_t len = 0;
    const zplc_vm_state_t *state;
    float result;

    printf("\n=== Test: Type Conversions ===\n");

    /* Test I2F: 42 -> 42.0f */
    len = 0;
    len = emit_push32(code, len, 42);
    len = emit_op(code, len, OP_I2F);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    result = bits_to_float(state->stack[0]);
    TEST_ASSERT(result == 42.0f, "I2F: 42 -> 42.0f");

    /* Test I2F with negative: -100 -> -100.0f */
    len = 0;
    len = emit_push32(code, len, (uint32_t)-100);
    len = emit_op(code, len, OP_I2F);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    result = bits_to_float(state->stack[0]);
    TEST_ASSERT(result == -100.0f, "I2F: -100 -> -100.0f");

    /* Test F2I: 3.7 -> 3 (truncate) */
    len = 0;
    len = emit_push32(code, len, float_to_bits(3.7f));
    len = emit_op(code, len, OP_F2I);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ((int32_t)state->stack[0], 3, "F2I: 3.7 -> 3");

    /* Test F2I with negative: -5.9 -> -5 (truncate towards zero) */
    len = 0;
    len = emit_push32(code, len, float_to_bits(-5.9f));
    len = emit_op(code, len, OP_F2I);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ((int32_t)state->stack[0], -5, "F2I: -5.9 -> -5");

    /* Test I2B: 0 -> 0, non-zero -> 1 */
    len = 0;
    len = emit_push32(code, len, 0);
    len = emit_op(code, len, OP_I2B);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0, "I2B: 0 -> 0");

    len = 0;
    len = emit_push32(code, len, 42);
    len = emit_op(code, len, OP_I2B);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 1, "I2B: 42 -> 1");

    /* Test EXT8: 0x80 (128) sign-extended to 0xFFFFFF80 (-128) */
    len = 0;
    len = emit_push32(code, len, 0x80);
    len = emit_op(code, len, OP_EXT8);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ((int32_t)state->stack[0], -128, "EXT8: 0x80 -> -128");

    /* Test EXT16: 0x8000 sign-extended to 0xFFFF8000 (-32768) */
    len = 0;
    len = emit_push32(code, len, 0x8000);
    len = emit_op(code, len, OP_EXT16);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ((int32_t)state->stack[0], -32768, "EXT16: 0x8000 -> -32768");

    /* Test ZEXT8: 0xFF with garbage upper bits -> 0xFF */
    len = 0;
    len = emit_push32(code, len, 0xDEADBEFF);
    len = emit_op(code, len, OP_ZEXT8);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0xFF, "ZEXT8: 0xDEADBEFF -> 0xFF");

    /* Test ZEXT16: 0xABCD with garbage upper bits -> 0xABCD */
    len = 0;
    len = emit_push32(code, len, 0xDEADABCD);
    len = emit_op(code, len, OP_ZEXT16);
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0xABCD, "ZEXT16: 0xDEADABCD -> 0xABCD");
}

/* ============================================================================
 * 64-bit Memory Tests
 * ============================================================================ */

/**
 * @brief Emit a LOAD64 instruction.
 */
static size_t emit_load64(uint8_t *buf, size_t offset, uint16_t addr)
{
    buf[offset++] = OP_LOAD64;
    buf[offset++] = (uint8_t)(addr & 0xFF);
    buf[offset++] = (uint8_t)((addr >> 8) & 0xFF);
    return offset;
}

/**
 * @brief Emit a STORE64 instruction.
 */
static size_t emit_store64(uint8_t *buf, size_t offset, uint16_t addr)
{
    buf[offset++] = OP_STORE64;
    buf[offset++] = (uint8_t)(addr & 0xFF);
    buf[offset++] = (uint8_t)((addr >> 8) & 0xFF);
    return offset;
}

static void test_64bit_memory(void)
{
    uint8_t code[64];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: 64-bit Memory Operations ===\n");

    /*
     * Test STORE64/LOAD64:
     * Push low word (0xDEADBEEF), push high word (0xCAFEBABE)
     * STORE64 to OPI @ 0x1000
     * LOAD64 from OPI @ 0x1000
     * Verify both words on stack
     */
    len = 0;
    len = emit_push32(code, len, 0xDEADBEEF);  /* low word */
    len = emit_push32(code, len, 0xCAFEBABE);  /* high word (TOS) */
    len = emit_store64(code, len, 0x1000);     /* Store to OPI */
    len = emit_load64(code, len, 0x1000);      /* Load back from OPI */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->sp, 2, "LOAD64 pushes 2 values");
    TEST_ASSERT_EQ(state->stack[0], 0xDEADBEEF, "LOAD64 low word = 0xDEADBEEF");
    TEST_ASSERT_EQ(state->stack[1], 0xCAFEBABE, "LOAD64 high word = 0xCAFEBABE");

    /* Verify the memory was actually written */
    TEST_ASSERT_EQ(zplc_core_get_opi(0), 0xDEADBEEF, "OPI[0:3] = 0xDEADBEEF");
    TEST_ASSERT_EQ(zplc_core_get_opi(4), 0xCAFEBABE, "OPI[4:7] = 0xCAFEBABE");
}

/* ============================================================================
 * GET_TICKS System Call Test
 * ============================================================================ */

static void test_get_ticks(void)
{
    uint8_t code[64];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: GET_TICKS System Call ===\n");

    /*
     * Test GET_TICKS: Push system tick counter to stack.
     * Since this calls the HAL, the exact value depends on timing,
     * but we can verify the opcode executes and pushes a value.
     */
    len = 0;
    len = emit_op(code, len, OP_GET_TICKS);  /* Push current tick */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT(state->halted, "GET_TICKS: VM halted");
    TEST_ASSERT_EQ(state->sp, 1, "GET_TICKS: 1 value on stack");

    /*
     * Test GET_TICKS multiple times - values should be monotonically
     * increasing (or at least equal, if called fast enough).
     */
    len = 0;
    len = emit_op(code, len, OP_GET_TICKS);  /* First tick */
    len = emit_op(code, len, OP_GET_TICKS);  /* Second tick */
    len = emit_op(code, len, OP_GE);         /* tick2 >= tick1 ? */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 1, "GET_TICKS: time is monotonic (tick2 >= tick1)");
}

/* ============================================================================
 * Integration Test: Assemble -> Load -> Execute
 * ============================================================================ */

/**
 * @brief Load a .zplc file directly for testing.
 *
 * This reads the file from disk and loads it into the VM using the
 * proper zplc_core_load() function (with header validation).
 */
static int load_zplc_file(const char *path)
{
    FILE *fp;
    uint8_t buffer[4096];
    size_t size;

    fp = fopen(path, "rb");
    if (fp == NULL) {
        return -1;
    }

    size = fread(buffer, 1, sizeof(buffer), fp);
    fclose(fp);

    if (size < 32) {
        return -2;  /* File too small for header */
    }

    return zplc_core_load(buffer, size);
}

static void test_integration_assembled_program(void)
{
    int result;
    uint16_t opi_value;

    printf("\n=== Test: Integration - Assembled Program ===\n");

    /*
     * Test loading a pre-assembled .zplc file (02_addition.asm).
     *
     * Program logic:
     *   LOAD16 0x0000   ; Load IPI[0:1] (16-bit)
     *   LOAD16 0x0002   ; Load IPI[2:3] (16-bit)
     *   ADD             ; Add them
     *   STORE16 0x1000  ; Store to OPI[0:1]
     *   HALT
     *
     * We set IPI[0] = 100, IPI[2] = 200
     * Expected result: OPI[0] = 300
     */

    /* Initialize and set up inputs */
    zplc_core_init();

    /* Set input values in IPI (16-bit values at non-overlapping offsets) */
    zplc_core_set_ipi16(0, 100);  /* IPI[0:1] = 100 */
    zplc_core_set_ipi16(2, 200);  /* IPI[2:3] = 200 */

    /* Load the assembled program */
    result = load_zplc_file("../examples/02_addition.zplc");

    if (result != 0) {
        printf("SKIP: Integration test - could not load .zplc file (run assembler first)\n");
        printf("  Run: python3 tools/zplc_asm.py examples/02_addition.asm\n");
        return;
    }

    TEST_ASSERT_EQ(result, 0, "Load .zplc file succeeded");

    /* Execute the program */
    result = zplc_core_run(0);
    TEST_ASSERT(result >= 0, "Program executed without error");

    /* Verify result: 100 + 200 = 300 in OPI[0] */
    opi_value = (uint16_t)(zplc_core_get_opi(0) & 0xFFFF);
    TEST_ASSERT_EQ(opi_value, 300, "Integration: 100 + 200 = 300");
}

static void test_integration_float_math(void)
{
    int result;
    uint16_t opi_value;

    printf("\n=== Test: Integration - Float Math (Celsius to Fahrenheit) ===\n");

    /*
     * Test loading 08_float_math.zplc
     *
     * Program logic: Fahrenheit = (Celsius * 9 / 5) + 32
     *
     * Test case: 25°C = 77°F
     *   (25 * 9 / 5) + 32 = 45 + 32 = 77
     */

    /* Initialize and set up inputs */
    zplc_core_init();

    /* Set Celsius temperature = 25 */
    zplc_core_set_ipi16(0, 25);

    /* Load the assembled program */
    result = load_zplc_file("../examples/08_float_math.zplc");

    if (result != 0) {
        printf("SKIP: Float math test - could not load .zplc file\n");
        printf("  Run: python3 tools/zplc_asm.py examples/08_float_math.asm\n");
        return;
    }

    TEST_ASSERT_EQ(result, 0, "Load float_math.zplc succeeded");

    /* Execute the program */
    result = zplc_core_run(0);
    TEST_ASSERT(result >= 0, "Float math program executed without error");

    /* Verify result: 25°C = 77°F */
    opi_value = (uint16_t)(zplc_core_get_opi(0) & 0xFFFF);
    TEST_ASSERT_EQ(opi_value, 77, "Float math: 25°C = 77°F");

    /* Test another value: 0°C = 32°F */
    zplc_core_init();
    zplc_core_set_ipi16(0, 0);
    load_zplc_file("../examples/08_float_math.zplc");
    zplc_core_run(0);
    opi_value = (uint16_t)(zplc_core_get_opi(0) & 0xFFFF);
    TEST_ASSERT_EQ(opi_value, 32, "Float math: 0°C = 32°F");

    /* Test: 100°C = 212°F (boiling point) */
    zplc_core_init();
    zplc_core_set_ipi16(0, 100);
    load_zplc_file("../examples/08_float_math.zplc");
    zplc_core_run(0);
    opi_value = (uint16_t)(zplc_core_get_opi(0) & 0xFFFF);
    TEST_ASSERT_EQ(opi_value, 212, "Float math: 100°C = 212°F");
}

/* ============================================================================
 * Main
 * ============================================================================ */

int main(void)
{
    printf("================================================\n");
    printf("  ZPLC Virtual Machine Core Tests\n");
    printf("  Core Version: %s\n", zplc_core_version());
    printf("================================================\n");

    test_push_and_halt();
    test_arithmetic();
    test_stack_operations();
    test_logic_operations();
    test_comparison_operations();
    test_memory_access();
    test_control_flow();
    test_error_handling();
    test_complex_program();
    test_push8_sign_extension();
    test_float_arithmetic();
    test_type_conversions();
    test_64bit_memory();
    test_get_ticks();
    test_integration_assembled_program();
    test_integration_float_math();

    printf("\n================================================\n");
    printf("  Results: %d tests, %d passed, %d failed\n",
           test_count, test_count - fail_count, fail_count);
    printf("================================================\n");

    return (fail_count == 0) ? 0 : 1;
}
