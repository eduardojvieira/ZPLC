/**
 * @file test_isa.c
 * @brief ZPLC ISA Header Verification Tests
 *
 * SPDX-License-Identifier: MIT
 *
 * This test verifies:
 * 1. Packed struct sizes are correct for binary compatibility
 * 2. Opcode values don't overlap
 * 3. Helper functions work correctly
 *
 * Run with: ./test_isa (returns 0 on success, non-zero on failure)
 */

#include <zplc_isa.h>
#include <stdio.h>
#include <string.h>

/* ============================================================================
 * Test Macros
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
 * Structure Size Tests
 * ============================================================================
 * These MUST pass or the binary format is broken across platforms.
 */

static void test_struct_sizes(void)
{
    printf("\n=== Structure Size Tests ===\n");

    /* File header must be exactly 32 bytes */
    TEST_ASSERT_EQ(sizeof(zplc_file_header_t), ZPLC_FILE_HEADER_SIZE,
                   "sizeof(zplc_file_header_t)");

    /* Segment entry must be exactly 8 bytes */
    TEST_ASSERT_EQ(sizeof(zplc_segment_entry_t), ZPLC_SEGMENT_ENTRY_SIZE,
                   "sizeof(zplc_segment_entry_t)");

    /* Task definition must be exactly 16 bytes */
    TEST_ASSERT_EQ(sizeof(zplc_task_def_t), ZPLC_TASK_DEF_SIZE,
                   "sizeof(zplc_task_def_t)");

    /* I/O map entry must be exactly 8 bytes */
    TEST_ASSERT_EQ(sizeof(zplc_iomap_entry_t), ZPLC_IOMAP_ENTRY_SIZE,
                   "sizeof(zplc_iomap_entry_t)");
}

/* ============================================================================
 * Opcode Uniqueness Test
 * ============================================================================
 * Ensure no two opcodes have the same value.
 */

static void test_opcode_uniqueness(void)
{
    printf("\n=== Opcode Uniqueness Test ===\n");

    /* Track which opcode values are used */
    uint8_t used[256];
    memset(used, 0, sizeof(used));

    /*
     * List of all defined opcodes.
     * If we accidentally define two opcodes with the same value,
     * this test will catch it.
     */
    static const uint8_t opcodes[] = {
        /* System */
        OP_NOP, OP_HALT, OP_BREAK, OP_GET_TICKS,
        /* Stack */
        OP_DUP, OP_DROP, OP_SWAP, OP_OVER, OP_ROT,
        /* Integer math */
        OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_MOD, OP_NEG, OP_ABS,
        /* Float math */
        OP_ADDF, OP_SUBF, OP_MULF, OP_DIVF, OP_NEGF, OP_ABSF,
        /* Logic */
        OP_AND, OP_OR, OP_XOR, OP_NOT, OP_SHL, OP_SHR, OP_SAR,
        /* Comparison */
        OP_EQ, OP_NE, OP_LT, OP_LE, OP_GT, OP_GE, OP_LTU, OP_GTU,
        /* 8-bit operand */
        OP_PUSH8, OP_JR, OP_JRZ, OP_JRNZ,
        /* 16-bit operand */
        OP_LOAD8, OP_LOAD16, OP_LOAD32, OP_LOAD64,
        OP_STORE8, OP_STORE16, OP_STORE32, OP_STORE64,
        OP_PUSH16, OP_JMP, OP_JZ, OP_JNZ, OP_CALL, OP_RET,
        /* Conversion */
        OP_I2F, OP_F2I, OP_I2B, OP_EXT8, OP_EXT16, OP_ZEXT8, OP_ZEXT16,
        /* 32-bit operand */
        OP_PUSH32
    };

    size_t count = sizeof(opcodes) / sizeof(opcodes[0]);
    int duplicates = 0;

    for (size_t i = 0; i < count; i++) {
        if (used[opcodes[i]]) {
            fprintf(stderr, "FAIL: Duplicate opcode 0x%02X\n", opcodes[i]);
            duplicates++;
        }
        used[opcodes[i]] = 1;
    }

    TEST_ASSERT(duplicates == 0, "No duplicate opcode values");
    printf("      Verified %zu unique opcodes\n", count);
}

/* ============================================================================
 * Opcode Encoding Tests
 * ============================================================================
 * Verify the operand size helper works correctly.
 */

static void test_opcode_encoding(void)
{
    printf("\n=== Opcode Encoding Tests ===\n");

    /* No-operand opcodes (0x00-0x3F) */
    TEST_ASSERT_EQ(zplc_opcode_operand_size(OP_NOP), 0,
                   "OP_NOP operand size");
    TEST_ASSERT_EQ(zplc_opcode_operand_size(OP_ADD), 0,
                   "OP_ADD operand size");
    TEST_ASSERT_EQ(zplc_opcode_operand_size(OP_EQ), 0,
                   "OP_EQ operand size");

    /* 8-bit operand opcodes (0x40-0x7F) */
    TEST_ASSERT_EQ(zplc_opcode_operand_size(OP_PUSH8), 1,
                   "OP_PUSH8 operand size");
    TEST_ASSERT_EQ(zplc_opcode_operand_size(OP_JR), 1,
                   "OP_JR operand size");

    /* 16-bit operand opcodes (0x80-0xBF) */
    TEST_ASSERT_EQ(zplc_opcode_operand_size(OP_LOAD32), 2,
                   "OP_LOAD32 operand size");
    TEST_ASSERT_EQ(zplc_opcode_operand_size(OP_JMP), 2,
                   "OP_JMP operand size");

    /* 32-bit operand opcodes (0xC0-0xFF) */
    TEST_ASSERT_EQ(zplc_opcode_operand_size(OP_PUSH32), 4,
                   "OP_PUSH32 operand size");

    /* Instruction sizes */
    TEST_ASSERT_EQ(zplc_opcode_instruction_size(OP_NOP), 1,
                   "OP_NOP instruction size");
    TEST_ASSERT_EQ(zplc_opcode_instruction_size(OP_PUSH8), 2,
                   "OP_PUSH8 instruction size");
    TEST_ASSERT_EQ(zplc_opcode_instruction_size(OP_LOAD32), 3,
                   "OP_LOAD32 instruction size");
    TEST_ASSERT_EQ(zplc_opcode_instruction_size(OP_PUSH32), 5,
                   "OP_PUSH32 instruction size");
}

/* ============================================================================
 * Opcode Validation Tests
 * ============================================================================ */

static void test_opcode_validation(void)
{
    printf("\n=== Opcode Validation Tests ===\n");

    /* Valid opcodes */
    TEST_ASSERT(zplc_opcode_is_valid(OP_NOP), "OP_NOP is valid");
    TEST_ASSERT(zplc_opcode_is_valid(OP_ADD), "OP_ADD is valid");
    TEST_ASSERT(zplc_opcode_is_valid(OP_PUSH32), "OP_PUSH32 is valid");

    /* Valid system opcode GET_TICKS */
    TEST_ASSERT(zplc_opcode_is_valid(OP_GET_TICKS), "OP_GET_TICKS is valid");

    /* Invalid opcodes (gaps in the encoding) */
    TEST_ASSERT(!zplc_opcode_is_valid(0x04), "0x04 is invalid");
    TEST_ASSERT(!zplc_opcode_is_valid(0xFF), "0xFF is invalid");
    TEST_ASSERT(!zplc_opcode_is_valid(0x60), "0x60 is invalid");
}

/* ============================================================================
 * Data Type Tests
 * ============================================================================ */

static void test_data_types(void)
{
    printf("\n=== Data Type Tests ===\n");

    /* Verify type IDs are distinct */
    TEST_ASSERT(ZPLC_TYPE_BOOL != ZPLC_TYPE_SINT, "BOOL != SINT");
    TEST_ASSERT(ZPLC_TYPE_INT != ZPLC_TYPE_UINT, "INT != UINT");
    TEST_ASSERT(ZPLC_TYPE_REAL != ZPLC_TYPE_LREAL, "REAL != LREAL");

    /* Verify ordering makes sense */
    TEST_ASSERT(ZPLC_TYPE_SINT < ZPLC_TYPE_INT, "SINT < INT");
    TEST_ASSERT(ZPLC_TYPE_INT < ZPLC_TYPE_DINT, "INT < DINT");
    TEST_ASSERT(ZPLC_TYPE_DINT < ZPLC_TYPE_LINT, "DINT < LINT");
}

/* ============================================================================
 * Memory Layout Tests
 * ============================================================================ */

static void test_memory_layout(void)
{
    printf("\n=== Memory Layout Tests ===\n");

    /* Verify regions don't overlap */
    TEST_ASSERT(ZPLC_MEM_IPI_BASE + ZPLC_MEM_IPI_SIZE <= ZPLC_MEM_OPI_BASE,
                "IPI ends before OPI");
    TEST_ASSERT(ZPLC_MEM_OPI_BASE + ZPLC_MEM_OPI_SIZE <= ZPLC_MEM_WORK_BASE,
                "OPI ends before WORK");
    TEST_ASSERT(ZPLC_MEM_WORK_BASE + ZPLC_MEM_WORK_SIZE <= ZPLC_MEM_RETAIN_BASE,
                "WORK ends before RETAIN");
    TEST_ASSERT(ZPLC_MEM_RETAIN_BASE + ZPLC_MEM_RETAIN_SIZE <= ZPLC_MEM_CODE_BASE,
                "RETAIN ends before CODE");

    /* Verify sizes are reasonable */
    TEST_ASSERT(ZPLC_MEM_IPI_SIZE >= 1024, "IPI at least 1KB");
    TEST_ASSERT(ZPLC_MEM_CODE_SIZE >= 32768, "CODE at least 32KB");
}

/* ============================================================================
 * Magic Number Test
 * ============================================================================ */

static void test_magic_number(void)
{
    printf("\n=== Magic Number Test ===\n");

    /* Verify magic spells "ZPLC" when read as little-endian bytes */
    uint8_t magic_bytes[4];
    uint32_t magic = ZPLC_MAGIC;

    magic_bytes[0] = (magic >> 0) & 0xFF;   /* 'Z' = 0x5A */
    magic_bytes[1] = (magic >> 8) & 0xFF;   /* 'P' = 0x50 */
    magic_bytes[2] = (magic >> 16) & 0xFF;  /* 'L' = 0x4C */
    magic_bytes[3] = (magic >> 24) & 0xFF;  /* 'C' = 0x43 */

    TEST_ASSERT(magic_bytes[0] == 'Z', "Magic byte 0 is 'Z'");
    TEST_ASSERT(magic_bytes[1] == 'P', "Magic byte 1 is 'P'");
    TEST_ASSERT(magic_bytes[2] == 'L', "Magic byte 2 is 'L'");
    TEST_ASSERT(magic_bytes[3] == 'C', "Magic byte 3 is 'C'");
}

/* ============================================================================
 * Print Opcode Table (Informational)
 * ============================================================================ */

static void print_opcode_table(void)
{
    printf("\n=== Opcode Reference (Hex Values) ===\n");
    printf("System:     NOP=0x%02X HALT=0x%02X BREAK=0x%02X GET_TICKS=0x%02X\n",
           OP_NOP, OP_HALT, OP_BREAK, OP_GET_TICKS);
    printf("Stack:      DUP=0x%02X DROP=0x%02X SWAP=0x%02X\n",
           OP_DUP, OP_DROP, OP_SWAP);
    printf("Math:       ADD=0x%02X SUB=0x%02X MUL=0x%02X DIV=0x%02X\n",
           OP_ADD, OP_SUB, OP_MUL, OP_DIV);
    printf("Logic:      AND=0x%02X OR=0x%02X XOR=0x%02X NOT=0x%02X\n",
           OP_AND, OP_OR, OP_XOR, OP_NOT);
    printf("Compare:    EQ=0x%02X NE=0x%02X LT=0x%02X GT=0x%02X\n",
           OP_EQ, OP_NE, OP_LT, OP_GT);
    printf("Load/Store: LOAD32=0x%02X STORE32=0x%02X\n",
           OP_LOAD32, OP_STORE32);
    printf("Control:    JMP=0x%02X JZ=0x%02X CALL=0x%02X RET=0x%02X\n",
           OP_JMP, OP_JZ, OP_CALL, OP_RET);
    printf("Push:       PUSH8=0x%02X PUSH16=0x%02X PUSH32=0x%02X\n",
           OP_PUSH8, OP_PUSH16, OP_PUSH32);
}

/* ============================================================================
 * Main
 * ============================================================================ */

int main(void)
{
    printf("================================================\n");
    printf("  ZPLC ISA Header Verification Tests\n");
    printf("================================================\n");

    test_struct_sizes();
    test_opcode_uniqueness();
    test_opcode_encoding();
    test_opcode_validation();
    test_data_types();
    test_memory_layout();
    test_magic_number();
    print_opcode_table();

    printf("\n================================================\n");
    printf("  Results: %d tests, %d passed, %d failed\n",
           test_count, test_count - fail_count, fail_count);
    printf("================================================\n");

    return (fail_count == 0) ? 0 : 1;
}
