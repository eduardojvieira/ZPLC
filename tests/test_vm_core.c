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
 * @brief Append a PUSH16 instruction with a 16-bit value.
 */
static size_t emit_push16(uint8_t *buf, size_t offset, uint16_t value)
{
    buf[offset++] = OP_PUSH16;
    buf[offset++] = (uint8_t)(value & 0xFF);
    buf[offset++] = (uint8_t)((value >> 8) & 0xFF);
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
 * Instance-Based VM API Tests (Multitask Support)
 * ============================================================================ */

static void test_instance_based_vm(void)
{
    zplc_vm_t vm1, vm2;
    uint8_t code1[32], code2[32];
    size_t len1 = 0, len2 = 0;
    int result;

    printf("\n=== Test: Instance-Based VM API ===\n");

    /*
     * Create two independent VMs with different programs.
     * VM1: Push 100, HALT -> stack[0] = 100
     * VM2: Push 200, HALT -> stack[0] = 200
     *
     * Both use the shared code segment but different entry points.
     */

    /* Build program 1: PUSH32 100, HALT */
    len1 = emit_push32(code1, len1, 100);
    len1 = emit_op(code1, len1, OP_HALT);

    /* Build program 2: PUSH32 200, HALT */
    len2 = emit_push32(code2, len2, 200);
    len2 = emit_op(code2, len2, OP_HALT);

    /* Initialize shared memory */
    zplc_mem_init();

    /* Load both programs into shared code segment */
    result = zplc_mem_load_code(code1, len1, 0);
    TEST_ASSERT_EQ(result, 0, "Load code1 at offset 0");

    result = zplc_mem_load_code(code2, len2, (uint16_t)len1);
    TEST_ASSERT_EQ(result, 0, "Load code2 at offset len1");

    /* Initialize both VMs */
    zplc_vm_init(&vm1);
    zplc_vm_init(&vm2);

    /* Set different entry points */
    result = zplc_vm_set_entry(&vm1, 0, (uint32_t)len1);
    TEST_ASSERT_EQ(result, 0, "Set VM1 entry at 0");

    result = zplc_vm_set_entry(&vm2, (uint16_t)len1, (uint32_t)len2);
    TEST_ASSERT_EQ(result, 0, "Set VM2 entry at len1");

    /* Run both VMs */
    result = zplc_vm_run(&vm1, 0);
    TEST_ASSERT(result >= 0, "VM1 executed successfully");

    result = zplc_vm_run(&vm2, 0);
    TEST_ASSERT(result >= 0, "VM2 executed successfully");

    /* Verify independent execution */
    TEST_ASSERT_EQ(vm1.stack[0], 100, "VM1 stack[0] = 100");
    TEST_ASSERT_EQ(vm2.stack[0], 200, "VM2 stack[0] = 200");
    TEST_ASSERT(vm1.halted, "VM1 halted");
    TEST_ASSERT(vm2.halted, "VM2 halted");

    /* Verify they can be reset independently */
    zplc_vm_reset_cycle(&vm1);
    TEST_ASSERT_EQ(vm1.pc, 0, "VM1 reset: PC = 0");
    TEST_ASSERT_EQ(vm1.sp, 0, "VM1 reset: SP = 0");
    TEST_ASSERT(!vm1.halted, "VM1 reset: not halted");
    TEST_ASSERT(vm2.halted, "VM2 still halted after VM1 reset");
}

static void test_multiple_entry_points(void)
{
    zplc_vm_t vms[4];
    uint8_t programs[4][16];
    size_t lengths[4];
    uint16_t offsets[4];
    int i, result;
    uint16_t current_offset = 0;

    printf("\n=== Test: Multiple Entry Points (Scheduler Simulation) ===\n");

    /*
     * Simulate 4 tasks with different programs, like the scheduler does.
     * Each task increments a different counter in Work memory.
     *
     * Task 0: Work[0] += 1
     * Task 1: Work[4] += 2
     * Task 2: Work[8] += 3
     * Task 3: Work[12] += 4
     */

    /* Initialize shared memory */
    zplc_mem_init();

    /* Build and load 4 programs */
    for (i = 0; i < 4; i++) {
        size_t len = 0;
        uint16_t work_addr = 0x2000 + (i * 4);
        uint8_t increment = (uint8_t)(i + 1);

        /* LOAD32 work_addr, PUSH8 increment, ADD, STORE32 work_addr, HALT */
        len = emit_load32(programs[i], len, work_addr);
        len = emit_push8(programs[i], len, increment);
        len = emit_op(programs[i], len, OP_ADD);
        len = emit_store32(programs[i], len, work_addr);
        len = emit_op(programs[i], len, OP_HALT);

        lengths[i] = len;
        offsets[i] = current_offset;

        result = zplc_mem_load_code(programs[i], len, current_offset);
        TEST_ASSERT_EQ(result, 0, "Load program into code segment");

        current_offset += (uint16_t)len;
    }

    /* Initialize all VMs with their entry points */
    for (i = 0; i < 4; i++) {
        zplc_vm_init(&vms[i]);
        result = zplc_vm_set_entry(&vms[i], offsets[i], (uint32_t)lengths[i]);
        TEST_ASSERT_EQ(result, 0, "Set VM entry point");
    }

    /* Run each VM multiple times (simulating scheduler cycles) */
    for (int cycle = 0; cycle < 10; cycle++) {
        for (i = 0; i < 4; i++) {
            zplc_vm_reset_cycle(&vms[i]);
            result = zplc_vm_run(&vms[i], 0);
            TEST_ASSERT(result >= 0, "VM cycle executed");
        }
    }

    /* Verify counters:
     * Task 0: 10 cycles × 1 = 10
     * Task 1: 10 cycles × 2 = 20
     * Task 2: 10 cycles × 3 = 30
     * Task 3: 10 cycles × 4 = 40
     */
    uint8_t *work = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
    TEST_ASSERT(work != NULL, "Work memory accessible");

    uint32_t counter0 = work[0] | (work[1] << 8) | (work[2] << 16) | (work[3] << 24);
    uint32_t counter1 = work[4] | (work[5] << 8) | (work[6] << 16) | (work[7] << 24);
    uint32_t counter2 = work[8] | (work[9] << 8) | (work[10] << 16) | (work[11] << 24);
    uint32_t counter3 = work[12] | (work[13] << 8) | (work[14] << 16) | (work[15] << 24);

    TEST_ASSERT_EQ(counter0, 10, "Task 0: 10 cycles × 1 = 10");
    TEST_ASSERT_EQ(counter1, 20, "Task 1: 10 cycles × 2 = 20");
    TEST_ASSERT_EQ(counter2, 30, "Task 2: 10 cycles × 3 = 30");
    TEST_ASSERT_EQ(counter3, 40, "Task 3: 10 cycles × 4 = 40");
}

static void test_vm_isolation(void)
{
    zplc_vm_t vm1, vm2;
    uint8_t code[32];
    size_t len = 0;
    int result;

    printf("\n=== Test: VM Stack Isolation ===\n");

    /*
     * Verify that two VMs have completely isolated stacks.
     * Both run the same program, but should have independent state.
     */

    /* Program: PUSH 1, PUSH 2, PUSH 3, ADD, HALT -> stack = [1, 5] */
    len = emit_push32(code, len, 1);
    len = emit_push32(code, len, 2);
    len = emit_push32(code, len, 3);
    len = emit_op(code, len, OP_ADD);  /* 2 + 3 = 5 */
    len = emit_op(code, len, OP_HALT);

    /* Initialize shared memory and load code once */
    zplc_mem_init();
    zplc_mem_load_code(code, len, 0);

    /* Setup both VMs */
    zplc_vm_init(&vm1);
    zplc_vm_init(&vm2);
    zplc_vm_set_entry(&vm1, 0, (uint32_t)len);
    zplc_vm_set_entry(&vm2, 0, (uint32_t)len);

    /* Run VM1 only */
    result = zplc_vm_run(&vm1, 0);
    TEST_ASSERT(result >= 0, "VM1 executed");

    /* Verify VM1 state */
    TEST_ASSERT_EQ(vm1.sp, 2, "VM1 has 2 items on stack");
    TEST_ASSERT_EQ(vm1.stack[0], 1, "VM1 stack[0] = 1");
    TEST_ASSERT_EQ(vm1.stack[1], 5, "VM1 stack[1] = 5");
    TEST_ASSERT(vm1.halted, "VM1 halted");

    /* Verify VM2 is still pristine */
    TEST_ASSERT_EQ(vm2.sp, 0, "VM2 stack empty (not run yet)");
    TEST_ASSERT(!vm2.halted, "VM2 not halted (not run yet)");
    TEST_ASSERT_EQ(vm2.pc, 0, "VM2 PC at entry point");

    /* Now run VM2 */
    result = zplc_vm_run(&vm2, 0);
    TEST_ASSERT(result >= 0, "VM2 executed");

    /* Verify VM2 has same results but independent */
    TEST_ASSERT_EQ(vm2.sp, 2, "VM2 has 2 items on stack");
    TEST_ASSERT_EQ(vm2.stack[0], 1, "VM2 stack[0] = 1");
    TEST_ASSERT_EQ(vm2.stack[1], 5, "VM2 stack[1] = 5");

    /* Modify VM1 stack and verify VM2 unaffected */
    vm1.stack[0] = 999;
    TEST_ASSERT_EQ(vm2.stack[0], 1, "VM2 stack unaffected by VM1 modification");
}

/* ============================================================================
 * Task Loading Tests (Multi-Task .zplc Files)
 * ============================================================================ */

/**
 * @brief Build a multi-task .zplc file in memory for testing.
 *
 * Creates a file with:
 *   - Header (32 bytes)
 *   - Segment table: CODE + TASK (16 bytes)
 *   - Code segment (bytecode)
 *   - Task segment (16 bytes per task)
 */
static size_t build_multitask_zplc(uint8_t *buf, size_t buf_size,
                                   const uint8_t *code, size_t code_size,
                                   uint8_t task_count)
{
    size_t offset = 0;
    size_t task_seg_size = task_count * ZPLC_TASK_DEF_SIZE;
    size_t total_size = ZPLC_FILE_HEADER_SIZE + 
                        (2 * ZPLC_SEGMENT_ENTRY_SIZE) +  /* CODE + TASK */
                        code_size + 
                        task_seg_size;
    uint8_t i;

    if (buf_size < total_size) {
        return 0;
    }

    memset(buf, 0, total_size);

    /* ===== Header (32 bytes) ===== */
    /* magic (4 bytes, little-endian) */
    buf[offset++] = 0x5A;  /* 'Z' */
    buf[offset++] = 0x50;  /* 'P' */
    buf[offset++] = 0x4C;  /* 'L' */
    buf[offset++] = 0x43;  /* 'C' */

    /* version_major (2 bytes) */
    buf[offset++] = ZPLC_VERSION_MAJOR & 0xFF;
    buf[offset++] = (ZPLC_VERSION_MAJOR >> 8) & 0xFF;

    /* version_minor (2 bytes) */
    buf[offset++] = ZPLC_VERSION_MINOR & 0xFF;
    buf[offset++] = (ZPLC_VERSION_MINOR >> 8) & 0xFF;

    /* flags (4 bytes) */
    offset += 4;

    /* crc32 (4 bytes) */
    offset += 4;

    /* code_size (4 bytes) */
    buf[offset++] = code_size & 0xFF;
    buf[offset++] = (code_size >> 8) & 0xFF;
    buf[offset++] = (code_size >> 16) & 0xFF;
    buf[offset++] = (code_size >> 24) & 0xFF;

    /* data_size (4 bytes) */
    buf[offset++] = task_seg_size & 0xFF;
    buf[offset++] = (task_seg_size >> 8) & 0xFF;
    buf[offset++] = (task_seg_size >> 16) & 0xFF;
    buf[offset++] = (task_seg_size >> 24) & 0xFF;

    /* entry_point (2 bytes) - first task's entry */
    buf[offset++] = 0;
    buf[offset++] = 0;

    /* segment_count (2 bytes) = 2 */
    buf[offset++] = 2;
    buf[offset++] = 0;

    /* reserved (4 bytes) */
    offset += 4;

    /* Verify header size */
    if (offset != ZPLC_FILE_HEADER_SIZE) {
        return 0;
    }

    /* ===== Segment Entry 1: CODE (8 bytes) ===== */
    buf[offset++] = ZPLC_SEG_CODE & 0xFF;  /* type */
    buf[offset++] = (ZPLC_SEG_CODE >> 8) & 0xFF;
    buf[offset++] = 0;  /* flags */
    buf[offset++] = 0;
    buf[offset++] = code_size & 0xFF;  /* size */
    buf[offset++] = (code_size >> 8) & 0xFF;
    buf[offset++] = (code_size >> 16) & 0xFF;
    buf[offset++] = (code_size >> 24) & 0xFF;

    /* ===== Segment Entry 2: TASK (8 bytes) ===== */
    buf[offset++] = ZPLC_SEG_TASK & 0xFF;  /* type */
    buf[offset++] = (ZPLC_SEG_TASK >> 8) & 0xFF;
    buf[offset++] = 0;  /* flags */
    buf[offset++] = 0;
    buf[offset++] = task_seg_size & 0xFF;  /* size */
    buf[offset++] = (task_seg_size >> 8) & 0xFF;
    buf[offset++] = (task_seg_size >> 16) & 0xFF;
    buf[offset++] = (task_seg_size >> 24) & 0xFF;

    /* ===== Code Segment ===== */
    memcpy(&buf[offset], code, code_size);
    offset += code_size;

    /* ===== Task Segment (16 bytes per task) ===== */
    for (i = 0; i < task_count; i++) {
        size_t task_offset = offset + (i * ZPLC_TASK_DEF_SIZE);
        uint16_t task_id = i;
        uint8_t task_type = (i == 0) ? ZPLC_TASK_INIT : ZPLC_TASK_CYCLIC;
        uint8_t priority = i;
        uint32_t interval_us = (i == 0) ? 0 : (10000 * (i + 1)); /* 10ms, 20ms, etc */
        uint16_t entry_point = (uint16_t)(i * 6);  /* Each program ~6 bytes */
        uint16_t stack_size = 64;

        /* id (2 bytes) */
        buf[task_offset + 0] = task_id & 0xFF;
        buf[task_offset + 1] = (task_id >> 8) & 0xFF;

        /* type (1 byte) */
        buf[task_offset + 2] = task_type;

        /* priority (1 byte) */
        buf[task_offset + 3] = priority;

        /* interval_us (4 bytes) */
        buf[task_offset + 4] = interval_us & 0xFF;
        buf[task_offset + 5] = (interval_us >> 8) & 0xFF;
        buf[task_offset + 6] = (interval_us >> 16) & 0xFF;
        buf[task_offset + 7] = (interval_us >> 24) & 0xFF;

        /* entry_point (2 bytes) */
        buf[task_offset + 8] = entry_point & 0xFF;
        buf[task_offset + 9] = (entry_point >> 8) & 0xFF;

        /* stack_size (2 bytes) */
        buf[task_offset + 10] = stack_size & 0xFF;
        buf[task_offset + 11] = (stack_size >> 8) & 0xFF;

        /* reserved (4 bytes) - already zero */
    }

    return total_size;
}

static void test_load_tasks_basic(void)
{
    uint8_t file_buf[512];
    uint8_t code[32];
    size_t code_len = 0;
    size_t file_size;
    zplc_task_def_t tasks[4];
    int result;

    printf("\n=== Test: Load Tasks from .zplc ===\n");

    /* Build simple code: 2 programs, each is PUSH8 N, HALT */
    code_len = emit_push8(code, code_len, 1);
    code_len = emit_op(code, code_len, OP_HALT);  /* Task 0: offset 0, len 3 */
    code_len = emit_push8(code, code_len, 2);
    code_len = emit_op(code, code_len, OP_HALT);  /* Task 1: offset 3, len 3 */
    code_len = emit_push8(code, code_len, 3);
    code_len = emit_op(code, code_len, OP_HALT);  /* Task 2: offset 6, len 3 */

    /* Build a .zplc file with 3 tasks */
    file_size = build_multitask_zplc(file_buf, sizeof(file_buf), 
                                     code, code_len, 3);
    TEST_ASSERT(file_size > 0, "Build multi-task .zplc file");

    /* Initialize memory */
    zplc_mem_init();

    /* Load tasks */
    result = zplc_core_load_tasks(file_buf, file_size, tasks, 4);
    TEST_ASSERT_EQ(result, 3, "Loaded 3 tasks");

    /* Verify task 0 (INIT) */
    TEST_ASSERT_EQ(tasks[0].id, 0, "Task 0: id = 0");
    TEST_ASSERT_EQ(tasks[0].type, ZPLC_TASK_INIT, "Task 0: type = INIT");
    TEST_ASSERT_EQ(tasks[0].priority, 0, "Task 0: priority = 0");
    TEST_ASSERT_EQ(tasks[0].entry_point, 0, "Task 0: entry_point = 0");

    /* Verify task 1 (CYCLIC) */
    TEST_ASSERT_EQ(tasks[1].id, 1, "Task 1: id = 1");
    TEST_ASSERT_EQ(tasks[1].type, ZPLC_TASK_CYCLIC, "Task 1: type = CYCLIC");
    TEST_ASSERT_EQ(tasks[1].priority, 1, "Task 1: priority = 1");
    TEST_ASSERT_EQ(tasks[1].interval_us, 20000, "Task 1: interval_us = 20000");
    TEST_ASSERT_EQ(tasks[1].entry_point, 6, "Task 1: entry_point = 6");

    /* Verify task 2 (CYCLIC) */
    TEST_ASSERT_EQ(tasks[2].id, 2, "Task 2: id = 2");
    TEST_ASSERT_EQ(tasks[2].type, ZPLC_TASK_CYCLIC, "Task 2: type = CYCLIC");
    TEST_ASSERT_EQ(tasks[2].interval_us, 30000, "Task 2: interval_us = 30000");
    TEST_ASSERT_EQ(tasks[2].entry_point, 12, "Task 2: entry_point = 12");
    TEST_ASSERT_EQ(tasks[2].stack_size, 64, "Task 2: stack_size = 64");

    /* Verify code was loaded */
    TEST_ASSERT_EQ(zplc_mem_get_code_size(), code_len, "Code loaded correctly");
}

static void test_load_tasks_execute(void)
{
    uint8_t file_buf[512];
    uint8_t code[64];
    size_t code_len = 0;
    size_t file_size;
    zplc_task_def_t tasks[2];
    zplc_vm_t vms[2];
    int result, i;

    printf("\n=== Test: Load and Execute Tasks ===\n");

    /*
     * Build 2 programs:
     *   Task 0 (offset 0): PUSH32 100, STORE32 0x1000, HALT -> OPI[0] = 100
     *   Task 1 (offset 9): PUSH32 200, STORE32 0x1004, HALT -> OPI[4] = 200
     */
    /* Task 0 */
    code_len = emit_push32(code, code_len, 100);
    code_len = emit_store32(code, code_len, 0x1000);
    code_len = emit_op(code, code_len, OP_HALT);
    /* Task 1 (starts at offset 9) */
    code_len = emit_push32(code, code_len, 200);
    code_len = emit_store32(code, code_len, 0x1004);
    code_len = emit_op(code, code_len, OP_HALT);

    /* Build .zplc file with 2 tasks */
    file_size = build_multitask_zplc(file_buf, sizeof(file_buf),
                                     code, code_len, 2);
    TEST_ASSERT(file_size > 0, "Build 2-task .zplc file");

    /* Manually fix entry points in the file since our builder uses i*6 */
    /* Task 0 entry_point is at: header(32) + seg_table(16) + code_len + 8 */
    /* Task 1 entry_point is at: header(32) + seg_table(16) + code_len + 8 + 16 */
    size_t task_seg_start = ZPLC_FILE_HEADER_SIZE + 
                            (2 * ZPLC_SEGMENT_ENTRY_SIZE) + 
                            code_len;
    /* Task 0: entry_point = 0 */
    file_buf[task_seg_start + 8] = 0;
    file_buf[task_seg_start + 9] = 0;
    /* Task 1: entry_point = 9 */
    file_buf[task_seg_start + 16 + 8] = 9;
    file_buf[task_seg_start + 16 + 9] = 0;

    /* Initialize memory */
    zplc_mem_init();

    /* Load tasks */
    result = zplc_core_load_tasks(file_buf, file_size, tasks, 2);
    TEST_ASSERT_EQ(result, 2, "Loaded 2 tasks");

    /* Initialize VMs and set entry points from loaded tasks */
    for (i = 0; i < 2; i++) {
        zplc_vm_init(&vms[i]);
        result = zplc_vm_set_entry(&vms[i], tasks[i].entry_point, 
                                   (uint32_t)code_len - tasks[i].entry_point);
        TEST_ASSERT_EQ(result, 0, "Set VM entry point from task");
    }

    /* Execute both tasks */
    for (i = 0; i < 2; i++) {
        result = zplc_vm_run(&vms[i], 0);
        TEST_ASSERT(result >= 0, "Task executed successfully");
    }

    /* Verify OPI results */
    TEST_ASSERT_EQ(zplc_core_get_opi(0), 100, "Task 0: OPI[0] = 100");
    TEST_ASSERT_EQ(zplc_core_get_opi(4), 200, "Task 1: OPI[4] = 200");
}

static void test_load_tasks_errors(void)
{
    uint8_t file_buf[256];
    zplc_task_def_t tasks[4];
    int result;

    printf("\n=== Test: Load Tasks Error Handling ===\n");

    /* Test NULL pointer */
    result = zplc_core_load_tasks(NULL, 100, tasks, 4);
    TEST_ASSERT_EQ(result, -1, "NULL binary returns -1");

    /* Test invalid magic */
    memset(file_buf, 0, sizeof(file_buf));
    file_buf[0] = 'X';  /* Wrong magic */
    result = zplc_core_load_tasks(file_buf, sizeof(file_buf), tasks, 4);
    TEST_ASSERT_EQ(result, -2, "Invalid magic returns -2");

    /* Test file without TASK segment (single-task file) */
    /* Build a minimal header with just CODE segment */
    memset(file_buf, 0, sizeof(file_buf));
    file_buf[0] = 0x5A; file_buf[1] = 0x50; 
    file_buf[2] = 0x4C; file_buf[3] = 0x43;  /* Magic = ZPLC */
    file_buf[4] = 1; file_buf[5] = 0;  /* version_major = 1 */
    file_buf[6] = 0; file_buf[7] = 0;  /* version_minor = 0 */
    file_buf[20] = 2; /* code_size = 2 */
    file_buf[28] = 1; /* segment_count = 1 */
    /* Segment entry: CODE */
    file_buf[32] = ZPLC_SEG_CODE;
    file_buf[36] = 2;  /* size = 2 */
    /* Code: NOP, HALT */
    file_buf[40] = OP_NOP;
    file_buf[41] = OP_HALT;

    result = zplc_core_load_tasks(file_buf, 42, tasks, 4);
    TEST_ASSERT_EQ(result, -6, "No TASK segment returns -6");
}

/* ============================================================================
 * Indirect Memory Access Tests (LOADI/STOREI)
 * ============================================================================ */

static void test_indirect_memory(void)
{
    uint8_t code[128];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: Indirect Memory Access (LOADI/STOREI) ===\n");

    /*
     * Test STOREI32: Store a value to computed address
     * 
     * Program:
     *   PUSH16 0x2000   ; Address (work memory)
     *   PUSH32 12345    ; Value to store
     *   STOREI32        ; Store value to address
     *   LOAD32 0x2000   ; Load back using direct addressing
     *   HALT
     *
     * Expected: stack[0] = 12345
     */
    len = 0;
    len = emit_push16(code, len, 0x2000);    /* Address */
    len = emit_push32(code, len, 12345);     /* Value */
    code[len++] = OP_STOREI32;               /* Indirect store */
    len = emit_load32(code, len, 0x2000);    /* Load back */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 12345, "STOREI32: stored 12345 via indirect");

    /*
     * Test LOADI32: Load from computed address
     * 
     * Program:
     *   PUSH32 0xABCD1234  ; Store a known value first
     *   STORE32 0x2004
     *   PUSH16 0x2004      ; Address to load from
     *   LOADI32            ; Indirect load
     *   HALT
     *
     * Expected: stack[0] = 0xABCD1234
     */
    len = 0;
    len = emit_push32(code, len, 0xABCD1234);
    len = emit_store32(code, len, 0x2004);   /* Store known value */
    len = emit_push16(code, len, 0x2004);    /* Address to load */
    code[len++] = OP_LOADI32;                /* Indirect load */
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0xABCD1234, "LOADI32: loaded 0xABCD1234 via indirect");

    /*
     * Test STOREI8/LOADI8: 8-bit indirect access
     * 
     * Program:
     *   PUSH16 0x2010   ; Address
     *   PUSH8 0x42      ; Value (66)
     *   STOREI8         ; Store byte
     *   PUSH16 0x2010   ; Address
     *   LOADI8          ; Load byte
     *   HALT
     *
     * Expected: stack[0] = 0x42
     */
    len = 0;
    len = emit_push16(code, len, 0x2010);
    len = emit_push8(code, len, 0x42);
    code[len++] = OP_STOREI8;
    len = emit_push16(code, len, 0x2010);
    code[len++] = OP_LOADI8;
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0x42, "STOREI8/LOADI8: stored/loaded 0x42 via indirect");

    /*
     * Test STOREI16/LOADI16: 16-bit indirect access
     * 
     * Program:
     *   PUSH16 0x2020   ; Address
     *   PUSH16 0x1234   ; Value (4660)
     *   STOREI16        ; Store word
     *   PUSH16 0x2020   ; Address
     *   LOADI16         ; Load word
     *   HALT
     *
     * Expected: stack[0] = 0x1234
     */
    len = 0;
    len = emit_push16(code, len, 0x2020);
    len = emit_push16(code, len, 0x1234);
    code[len++] = OP_STOREI16;
    len = emit_push16(code, len, 0x2020);
    code[len++] = OP_LOADI16;
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0x1234, "STOREI16/LOADI16: stored/loaded 0x1234 via indirect");

    /*
     * Test array-like access pattern (FIFO/LIFO simulation):
     * 
     * Program: Store values at array[0], array[1], array[2] then load array[1]
     *   Base address: 0x2100
     *   Element size: 4 bytes
     *   
     *   Store 100 at index 0
     *   Store 200 at index 1  
     *   Store 300 at index 2
     *   Load from index 1
     *
     * Expected: stack[0] = 200
     */
    len = 0;
    /* Store array[0] = 100 */
    len = emit_push16(code, len, 0x2100);    /* base + 0*4 */
    len = emit_push32(code, len, 100);
    code[len++] = OP_STOREI32;

    /* Store array[1] = 200 */
    len = emit_push16(code, len, 0x2104);    /* base + 1*4 */
    len = emit_push32(code, len, 200);
    code[len++] = OP_STOREI32;

    /* Store array[2] = 300 */
    len = emit_push16(code, len, 0x2108);    /* base + 2*4 */
    len = emit_push32(code, len, 300);
    code[len++] = OP_STOREI32;

    /* Load array[1] */
    len = emit_push16(code, len, 0x2104);
    code[len++] = OP_LOADI32;
    len = emit_op(code, len, OP_HALT);

    zplc_core_init();
    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 200, "Array access: array[1] = 200");

    /*
     * Test computed index (dynamic array access):
     *
     * Program: 
     *   index = 2 (on stack)
     *   address = base + index * 4
     *   LOADI32
     *
     * Expected: Load array[2] = 300 (set in previous test, memory persists)
     */
    len = 0;
    /* Compute: 0x2100 + (2 * 4) = 0x2108 */
    len = emit_push16(code, len, 0x2100);    /* Base */
    len = emit_push8(code, len, 2);          /* Index */
    len = emit_push8(code, len, 4);          /* Element size */
    len = emit_op(code, len, OP_MUL);        /* index * 4 = 8 */
    len = emit_op(code, len, OP_ADD);        /* base + 8 = 0x2108 */
    code[len++] = OP_LOADI32;                /* Load from computed address */
    len = emit_op(code, len, OP_HALT);

    /* NOTE: Don't reinit - use memory from previous test */
    zplc_core_load_raw(code, len);
    zplc_vm_t *vm = zplc_core_get_default_vm();
    vm->pc = 0;
    vm->sp = 0;
    vm->halted = 0;
    vm->error = ZPLC_VM_OK;
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 300, "Computed index: array[2] = 300");
}

/* ============================================================================
 * String Operations Tests
 * ============================================================================ */

/**
 * Helper to get pointer to memory at given absolute address.
 * Routes to the correct region (IPI/OPI/Work/Retain) based on address.
 */
static uint8_t* get_memory_ptr(uint16_t addr)
{
    uint8_t *region;
    uint16_t offset;
    
    if (addr >= ZPLC_MEM_WORK_BASE && addr < ZPLC_MEM_RETAIN_BASE) {
        region = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
        offset = addr - ZPLC_MEM_WORK_BASE;
    } else if (addr >= ZPLC_MEM_RETAIN_BASE && addr < ZPLC_MEM_CODE_BASE) {
        region = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
        offset = addr - ZPLC_MEM_RETAIN_BASE;
    } else if (addr >= ZPLC_MEM_OPI_BASE && addr < ZPLC_MEM_WORK_BASE) {
        region = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
        offset = addr - ZPLC_MEM_OPI_BASE;
    } else {
        region = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
        offset = addr - ZPLC_MEM_IPI_BASE;
    }
    
    return region ? (region + offset) : NULL;
}

/**
 * Helper to initialize a string in memory.
 * Layout: [len:2][cap:2][data:cap+1]
 */
static void init_string(uint16_t addr, uint16_t capacity, const char *value)
{
    uint8_t *mem = get_memory_ptr(addr);
    uint16_t len = 0;
    uint16_t i;

    if (!mem) return;

    /* Calculate length */
    if (value) {
        while (value[len] && len < capacity) {
            len++;
        }
    }

    /* Write header (little-endian) */
    mem[0] = (uint8_t)(len & 0xFF);
    mem[1] = (uint8_t)((len >> 8) & 0xFF);
    mem[2] = (uint8_t)(capacity & 0xFF);
    mem[3] = (uint8_t)((capacity >> 8) & 0xFF);

    /* Write data */
    for (i = 0; i < len; i++) {
        mem[4 + i] = (uint8_t)value[i];
    }
    mem[4 + len] = 0; /* Null terminator */
}

/**
 * Helper to read string length from memory.
 */
static uint16_t read_string_len(uint16_t addr)
{
    uint8_t *mem = get_memory_ptr(addr);
    if (!mem) return 0;
    return (uint16_t)mem[0] | ((uint16_t)mem[1] << 8);
}

/**
 * Helper to compare string data in memory.
 */
static int string_equals(uint16_t addr, const char *expected)
{
    uint8_t *mem = get_memory_ptr(addr);
    uint16_t len;
    uint16_t i;

    if (!mem) return 0;
    
    len = (uint16_t)mem[0] | ((uint16_t)mem[1] << 8);

    for (i = 0; i < len; i++) {
        if (mem[4 + i] != (uint8_t)expected[i]) {
            return 0;
        }
    }
    return expected[len] == '\0';
}

static void test_string_operations(void)
{
    uint8_t code[64];
    size_t len = 0;
    const zplc_vm_state_t *state;

    printf("\n=== Test: String Operations ===\n");

    /*
     * Test STRLEN: Get length of string
     *
     * Setup: String "Hello" at 0x2200
     * Program: PUSH16 0x2200, STRLEN, HALT
     * Expected: stack[0] = 5
     */
    zplc_core_init();
    init_string(0x2200, 80, "Hello");

    len = 0;
    len = emit_push16(code, len, 0x2200);
    code[len++] = OP_STRLEN;
    len = emit_op(code, len, OP_HALT);

    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 5, "STRLEN: 'Hello' has length 5");

    /*
     * Test STRCPY: Copy string (safe, bounds-checked)
     *
     * Setup: 
     *   Source "Hello" at 0x2200 (cap=80)
     *   Destination empty at 0x2300 (cap=80)
     * Program: PUSH16 0x2200, PUSH16 0x2300, STRCPY, HALT
     * Expected: Destination contains "Hello"
     */
    zplc_core_init();
    init_string(0x2200, 80, "Hello");
    init_string(0x2300, 80, "");

    len = 0;
    len = emit_push16(code, len, 0x2200); /* src */
    len = emit_push16(code, len, 0x2300); /* dst */
    code[len++] = OP_STRCPY;
    len = emit_op(code, len, OP_HALT);

    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    TEST_ASSERT_EQ(read_string_len(0x2300), 5, "STRCPY: destination length = 5");
    TEST_ASSERT(string_equals(0x2300, "Hello"), "STRCPY: destination = 'Hello'");

    /*
     * Test STRCPY with truncation (bounds check)
     *
     * Setup:
     *   Source "Hello World" at 0x2200 (cap=80)
     *   Destination at 0x2300 (cap=5, too small)
     * Expected: Destination contains "Hello" (truncated to capacity)
     */
    zplc_core_init();
    init_string(0x2200, 80, "Hello World");
    init_string(0x2300, 5, ""); /* Small capacity! */

    len = 0;
    len = emit_push16(code, len, 0x2200);
    len = emit_push16(code, len, 0x2300);
    code[len++] = OP_STRCPY;
    len = emit_op(code, len, OP_HALT);

    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    TEST_ASSERT_EQ(read_string_len(0x2300), 5, "STRCPY truncation: length = 5");
    TEST_ASSERT(string_equals(0x2300, "Hello"), "STRCPY truncation: = 'Hello'");

    /*
     * Test STRCAT: Concatenate strings
     *
     * Setup:
     *   Source "World" at 0x2200
     *   Destination "Hello " at 0x2300 (cap=80)
     * Expected: Destination = "Hello World"
     */
    zplc_core_init();
    init_string(0x2200, 80, "World");
    init_string(0x2300, 80, "Hello ");

    len = 0;
    len = emit_push16(code, len, 0x2200);
    len = emit_push16(code, len, 0x2300);
    code[len++] = OP_STRCAT;
    len = emit_op(code, len, OP_HALT);

    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    TEST_ASSERT_EQ(read_string_len(0x2300), 11, "STRCAT: length = 11");
    TEST_ASSERT(string_equals(0x2300, "Hello World"), "STRCAT: = 'Hello World'");

    /*
     * Test STRCMP: Compare equal strings
     */
    zplc_core_init();
    init_string(0x2200, 80, "Hello");
    init_string(0x2300, 80, "Hello");

    len = 0;
    len = emit_push16(code, len, 0x2200);
    len = emit_push16(code, len, 0x2300);
    code[len++] = OP_STRCMP;
    len = emit_op(code, len, OP_HALT);

    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ(state->stack[0], 0, "STRCMP: 'Hello' == 'Hello' -> 0");

    /*
     * Test STRCMP: First string less
     */
    zplc_core_init();
    init_string(0x2200, 80, "Apple");
    init_string(0x2300, 80, "Banana");

    len = 0;
    len = emit_push16(code, len, 0x2200);
    len = emit_push16(code, len, 0x2300);
    code[len++] = OP_STRCMP;
    len = emit_op(code, len, OP_HALT);

    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    state = zplc_core_get_state();
    TEST_ASSERT_EQ((int32_t)state->stack[0], -1, "STRCMP: 'Apple' < 'Banana' -> -1");

    /*
     * Test STRCLR: Clear string
     */
    zplc_core_init();
    init_string(0x2200, 80, "Hello World");

    len = 0;
    len = emit_push16(code, len, 0x2200);
    code[len++] = OP_STRCLR;
    len = emit_op(code, len, OP_HALT);

    zplc_core_load_raw(code, len);
    zplc_core_run(0);

    TEST_ASSERT_EQ(read_string_len(0x2200), 0, "STRCLR: length = 0");
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

    /* Instance-Based VM Tests (Multitask Support) */
    test_instance_based_vm();
    test_multiple_entry_points();
    test_vm_isolation();

    /* Multi-Task Loading Tests */
    test_load_tasks_basic();
    test_load_tasks_execute();
    test_load_tasks_errors();

    /* Indirect Memory Access Tests (v1.1: LOADI/STOREI) */
    test_indirect_memory();

    /* String Operations Tests (v1.2: STRING type) */
    test_string_operations();

    printf("\n================================================\n");
    printf("  Results: %d tests, %d passed, %d failed\n",
           test_count, test_count - fail_count, fail_count);
    printf("================================================\n");

    return (fail_count == 0) ? 0 : 1;
}
