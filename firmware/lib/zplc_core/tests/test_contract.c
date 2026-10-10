/**
 * @file test_contract.c
 * @brief Checks on the generated binary contract tables (WP-11, VF-012).
 *
 * SPDX-License-Identifier: MIT
 *
 * The opcode table, the function-block table and the member table are
 * generated from tools/contract/contract.json. These tests check that the
 * generated header is consistent with itself: the table agrees with the
 * enum, with the decoder helpers and with the block size lookup. The
 * comparison with the frozen numbers of the hand-written header is made by
 * tools/contract/test_contract.py.
 *
 * Run with: ./test_contract (returns 0 on success, non-zero on failure)
 */

#include <stdio.h>

#include <zplc_comm_dispatch.h>
#include <zplc_isa.h>
#include <zplc_loader.h>

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, what) do { \
    test_count++; \
    if (!(cond)) { \
        fprintf(stderr, "FAIL: %s (line %d)\n", (what), __LINE__); \
        fail_count++; \
    } \
} while (0)

static void test_opcode_table(void)
{
    static uint8_t seen[256];
    unsigned count = 0;
    unsigned byte;
    unsigned valid = 0;

    printf("=== Opcode table ===\n");

#define ZPLC_TEST_ENTRY(name, code, operand, pops, pushes, depth) \
    CHECK((unsigned)OP_##name == (unsigned)(code), #name " number matches the enum"); \
    CHECK(seen[code] == 0, #name " number is unique"); \
    seen[code] = 1; \
    count++; \
    CHECK(zplc_opcode_is_valid((uint8_t)(code)) == 1, #name " is valid"); \
    CHECK(zplc_opcode_operand_size((uint8_t)(code)) == (operand), #name " operand size matches the decoder"); \
    CHECK((depth) >= (pops), #name " needs at least the words it pops"); \
    CHECK((pops) <= 2 && (pushes) <= 2, #name " moves at most two stack words");
    ZPLC_OPCODE_TABLE(ZPLC_TEST_ENTRY)
#undef ZPLC_TEST_ENTRY

    CHECK(count == ZPLC_OPCODE_COUNT, "ZPLC_OPCODE_COUNT is the number of table entries");
    for (byte = 0; byte < 256; byte++) {
        valid += (unsigned)zplc_opcode_is_valid((uint8_t)byte);
    }
    CHECK(valid == count, "no byte is valid that the table does not list");
    printf("      %u opcodes\n", count);
}

static void test_function_block_table(void)
{
    printf("=== Function-block table ===\n");

#define ZPLC_TEST_BLOCK(name, kind, size) \
    CHECK((kind) != ZPLC_COMM_FB_NONE && (kind) < ZPLC_COMM_FB_KIND_MAX, #name " kind is in range"); \
    CHECK((unsigned)ZPLC_COMM_FB_##name == (unsigned)(kind), #name " kind matches the enum"); \
    CHECK(zplc_comm_fb_size((uint32_t)(kind)) == (size), #name " size from the lookup"); \
    CHECK(ZPLC_COMM_##name##_SIZE == (size), #name " size constant"); \
    CHECK((size) >= 8, #name " holds the 8-byte handshake"); \
    CHECK(ZPLC_COMM_##name##_EN_OFFSET == 0 && ZPLC_COMM_##name##_STATUS_OFFSET == 4, #name " handshake offsets");
    ZPLC_COMM_FB_TABLE(ZPLC_TEST_BLOCK)
#undef ZPLC_TEST_BLOCK

#define ZPLC_TEST_MEMBER(block, member, offset, bytes) \
    CHECK(ZPLC_COMM_##block##_##member##_OFFSET == (offset), #block "." #member " offset constant"); \
    CHECK((offset) < ZPLC_COMM_##block##_SIZE, #block "." #member " starts inside the block"); \
    CHECK((bytes) >= 1, #block "." #member " has a size");
    ZPLC_COMM_MEMBER_TABLE(ZPLC_TEST_MEMBER)
#undef ZPLC_TEST_MEMBER

    CHECK(zplc_comm_fb_size(ZPLC_COMM_FB_NONE) == 0, "NONE has no layout");
    CHECK(zplc_comm_fb_size(ZPLC_COMM_FB_KIND_MAX) == 0, "KIND_MAX has no layout");
    CHECK(zplc_comm_fb_size(ZPLC_COMM_FB_COMM_STATUS) == 0, "the status query has no layout");
    CHECK(zplc_comm_fb_size(0x77U) == 0, "an unassigned kind has no layout");
    CHECK(zplc_comm_fb_size(0xFFFFFFFFU) == 0, "a wide value has no layout");
}

static void test_error_codes(void)
{
    printf("=== Error codes ===\n");
    CHECK(ZPLC_LOADER_OK == 0, "loader success is zero");
    CHECK(ZPLC_LOADER_ERR_MAGIC < 0 && ZPLC_LOADER_ERR_COMM < 0, "loader refusals are negative");
    CHECK(ZPLC_VM_OK == 0, "VM ok is zero");
    CHECK(ZPLC_COMM_OK == 0, "communication ok is zero");
}

int main(void)
{
    test_opcode_table();
    test_function_block_table();
    test_error_codes();
    printf("\n%d checks, %d failed\n", test_count, fail_count);
    return fail_count == 0 ? 0 : 1;
}
