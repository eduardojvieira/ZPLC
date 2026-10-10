/**
 * @file test_opcode_coverage.c
 * @brief Every opcode of the generated table is executed, and checked, on the real VM (VF-013).
 *
 * SPDX-License-Identifier: MIT
 *
 * How it works
 * ------------
 *  1. The opcode table (ZPLC_OPCODE_TABLE in zplc_isa.h, generated from
 *     tools/contract/contract.json) is the list of what must be tested. A
 *     new opcode that this file has no case for fails the build of CI: the
 *     ledger at the end of main() requires, for every row of the table, one
 *     execution to completion and the fault kinds the row implies.
 *  2. Each case is a small program (operands pushed with PUSH32, the opcode
 *     under test, HALT) run on the VM from a known memory image. The same
 *     bytes are then run on a reference model written in this file, and the
 *     final state of the VM is compared with the model: stack, call stack,
 *     program counter, error code, halted and paused state, status flags and
 *     the whole of IPI, OPI, WORK and RETAIN. The model is a second, small
 *     implementation of the instruction set from the specification (the
 *     table, the memory map and the defined edge-case results of RT-005); it
 *     never calls the VM, so a wrong VM result is a difference, not a copy.
 *  3. The model itself is checked against a few results worked out by hand
 *     (model_selftest) before it is used, so that it cannot silently agree
 *     with a wrong VM by being wrong in the same way.
 *  4. The fault paths that follow from the table columns (stack underflow
 *     from the minimum depth, stack overflow from pushes > pops, truncated
 *     operand from the operand size) and the bytes that are not opcodes are
 *     generated from the table, not listed by hand.
 *
 * What a fault is compared on: the error code, the halted flag, the program
 * counter of the faulting instruction and the memory images. The contents of
 * the evaluation stack after a fault are not part of the contract (the VM
 * halts), so they are not compared.
 *
 * Known gaps of the VM are not encoded here as expected failures (the
 * repository has no mechanism for failing C tests): the cases that expose
 * them are kept out of this file and are reported with the fuzzer findings.
 *
 * Adding an opcode: it appears in the generated table, so this test fails
 * until (1) ref_step() gives it its semantics, written from the
 * specification and not from the VM source, (2) a case in a family_*()
 * function runs it to completion with operands that tell a right result from
 * a wrong one, and (3) the faults its row implies are observed (generated
 * automatically) and, where it can fault otherwise, listed in check_ledger().
 *
 * Run with: ./test_opcode_coverage (returns 0 on success, non-zero on failure)
 * Build with the sanitizers (see CMakeLists.txt): a regression is a failure
 * of the test, not a silent wrong value.
 */

#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <zplc_comm_dispatch.h>
#include <zplc_core.h>
#include <zplc_hal_posix.h>
#include <zplc_isa.h>

int zplc_test_load_raw(const uint8_t *bytecode, size_t size);

/* ============================================================================
 * Test bookkeeping
 * ============================================================================
 */

static unsigned case_count = 0;
static unsigned fail_count = 0;
static unsigned check_count = 0;

static void report_failure(const char *family, const char *name, const char *fmt, ...)
{
    va_list args;

    fail_count++;
    if (fail_count > 40U) {
        return;
    }
    fprintf(stderr, "FAIL [%s] %s: ", family, name);
    va_start(args, fmt);
    vfprintf(stderr, fmt, args);
    va_end(args);
    fputc('\n', stderr);
}

#define CHECK(cond, what) do { \
    check_count++; \
    if (!(cond)) { \
        report_failure("table", what, "(line %d)", __LINE__); \
    } \
} while (0)

/* ============================================================================
 * The opcode table, as data
 * ============================================================================
 */

typedef struct {
    uint8_t present;
    uint8_t operand;
    uint8_t pops;
    uint8_t pushes;
    uint8_t min_depth;
    const char *name;
} op_info_t;

static op_info_t g_info[256];

/* Per-opcode ledger: what a passing case has shown. */
static unsigned g_completed[256];       /* executed to completion */
static unsigned g_fault[256][16];       /* ended in this fault, by error code */
static uint8_t g_run_ok[256];           /* opcodes the current run completed (model view) */
static int g_model_gap;                 /* an opcode of the table the model has no semantics for, or -1 */

#define ZPLC_TEST_FILL(NAME, CODE, OPERAND, POPS, PUSHES, DEPTH) \
    g_info[CODE].present = 1U; \
    g_info[CODE].operand = (uint8_t)(OPERAND); \
    g_info[CODE].pops = (uint8_t)(POPS); \
    g_info[CODE].pushes = (uint8_t)(PUSHES); \
    g_info[CODE].min_depth = (uint8_t)(DEPTH); \
    g_info[CODE].name = #NAME;

static void load_table(void)
{
    memset(g_info, 0, sizeof(g_info));
    ZPLC_OPCODE_TABLE(ZPLC_TEST_FILL)
}

/* ============================================================================
 * Reference model
 * ============================================================================
 */

typedef struct {
    uint32_t stack[ZPLC_STACK_MAX_DEPTH];
    uint16_t call[ZPLC_CALL_STACK_MAX];
    uint16_t sp;
    uint16_t pc;
    uint8_t depth;
    uint8_t error;
    uint8_t halted;
    uint8_t paused;
    uint8_t ipi[ZPLC_MEM_IPI_SIZE];
    uint8_t opi[ZPLC_MEM_OPI_SIZE];
    uint8_t work[ZPLC_MEM_WORK_SIZE];
    uint8_t retain[ZPLC_MEM_RETAIN_SIZE];
} ref_t;

static ref_t g_model;

/* Communication handlers installed by the test; the model knows what they do. */
#define KIND_OK ZPLC_COMM_FB_MQTT_CONNECT   /* handler writes the profile and connected bytes, returns 0 */
#define KIND_FAIL ZPLC_COMM_FB_SPB_REBIRTH  /* handler returns -3 and writes nothing */
#define KIND_NONE ZPLC_COMM_FB_MB_READ_HREG /* a valid kind with no handler registered */

static int handler_ok(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len, bool reset)
{
    (void)kind;
    (void)fb_len;
    fb_mem[ZPLC_COMM_MQTT_CONNECT_PROFILE_OFFSET] = (uint8_t)(fb_mem[ZPLC_COMM_MQTT_CONNECT_PROFILE_OFFSET] + 1U);
    fb_mem[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] = reset ? 2U : 1U;
    return 0;
}

static int handler_fail(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len, bool reset)
{
    (void)kind;
    (void)fb_mem;
    (void)fb_len;
    (void)reset;
    return -3;
}

static void ref_fault(ref_t *m, uint8_t code)
{
    m->error = code;
    m->halted = 1U;
}

/* The region of the memory map that holds [addr, addr + size) entirely, or NULL. */
static uint8_t *ref_region(ref_t *m, uint32_t addr, uint32_t size, int write)
{
    struct region {
        uint32_t base;
        uint32_t size;
        int writable;
        uint8_t *bytes;
    };
    struct region regions[4];
    unsigned index;

    regions[0].base = ZPLC_MEM_IPI_BASE;    regions[0].size = ZPLC_MEM_IPI_SIZE;    regions[0].writable = 0; regions[0].bytes = m->ipi;
    regions[1].base = ZPLC_MEM_OPI_BASE;    regions[1].size = ZPLC_MEM_OPI_SIZE;    regions[1].writable = 1; regions[1].bytes = m->opi;
    regions[2].base = ZPLC_MEM_WORK_BASE;   regions[2].size = ZPLC_MEM_WORK_SIZE;   regions[2].writable = 1; regions[2].bytes = m->work;
    regions[3].base = ZPLC_MEM_RETAIN_BASE; regions[3].size = ZPLC_MEM_RETAIN_SIZE; regions[3].writable = 1; regions[3].bytes = m->retain;
    for (index = 0; index < 4U; index++) {
        const struct region *r = &regions[index];
        if (addr >= r->base && size <= r->size && addr - r->base <= r->size - size) {
            if (write && !r->writable) {
                return NULL;
            }
            return r->bytes + (addr - r->base);
        }
    }
    return NULL;
}

static int ref_read(ref_t *m, uint32_t addr, unsigned size, uint64_t *value)
{
    const uint8_t *p = ref_region(m, addr, size, 0);
    unsigned i;

    if (p == NULL) {
        ref_fault(m, ZPLC_VM_OUT_OF_BOUNDS);
        return 0;
    }
    *value = 0;
    for (i = 0; i < size; i++) {
        *value |= (uint64_t)p[i] << (8U * i);
    }
    return 1;
}

static int ref_write(ref_t *m, uint32_t addr, unsigned size, uint64_t value)
{
    uint8_t *p = ref_region(m, addr, size, 1);
    unsigned i;

    if (p == NULL) {
        ref_fault(m, ZPLC_VM_OUT_OF_BOUNDS);
        return 0;
    }
    for (i = 0; i < size; i++) {
        p[i] = (uint8_t)(value >> (8U * i));
    }
    return 1;
}

static int ref_push(ref_t *m, uint32_t value)
{
    if (m->sp >= ZPLC_STACK_MAX_DEPTH) {
        ref_fault(m, ZPLC_VM_STACK_OVERFLOW);
        return 0;
    }
    m->stack[m->sp++] = value;
    return 1;
}

static uint32_t ref_pop(ref_t *m)
{
    m->sp--;
    return m->stack[m->sp];
}

static float bits_f(uint32_t bits)
{
    float f;
    memcpy(&f, &bits, sizeof f);
    return f;
}

static uint32_t f_bits(float f)
{
    uint32_t bits;
    memcpy(&bits, &f, sizeof bits);
    return bits;
}

static int32_t as_signed(uint32_t v)
{
    return (v & 0x80000000U) != 0U ? (int32_t)(-(int64_t)(0x100000000ULL - v)) : (int32_t)v;
}

static uint32_t from_signed(int64_t v)
{
    return (uint32_t)((uint64_t)v & 0xFFFFFFFFULL);
}

static uint32_t ref_float_to_int(float f)
{
    const double d = (double)f;

    if (d != d) {
        return 0U;
    }
    if (d >= 2147483648.0) {
        return 0x7FFFFFFFU;
    }
    if (d <= -2147483648.0) {
        return 0x80000000U;
    }
    return from_signed((int64_t)d);
}

static uint16_t addr16(uint32_t base, uint32_t offset)
{
    return (uint16_t)((base + offset) & 0xFFFFU);
}

static void ref_string_ops(ref_t *m, uint8_t op)
{
    uint32_t a;
    uint32_t b;
    uint64_t v1;
    uint64_t v2;
    uint32_t i;

    if (op == OP_STRLEN) {
        a = ref_pop(m);
        if (ref_read(m, a, 2, &v1)) {
            ref_push(m, (uint32_t)v1);
        }
    } else if (op == OP_STRCLR) {
        a = ref_pop(m);
        if (ref_write(m, a, 2, 0U)) {
            ref_write(m, addr16(a, 4U), 1, 0U);
        }
    } else if (op == OP_STRCMP) {
        uint32_t len1;
        uint32_t len2;
        int32_t result = 0;

        b = ref_pop(m);
        a = ref_pop(m);
        if (!ref_read(m, a, 2, &v1) || !ref_read(m, b, 2, &v2)) {
            return;
        }
        len1 = (uint32_t)v1;
        len2 = (uint32_t)v2;
        for (i = 0; i < (len1 < len2 ? len1 : len2) && result == 0; i++) {
            if (!ref_read(m, addr16(a, 4U + i), 1, &v1) || !ref_read(m, addr16(b, 4U + i), 1, &v2)) {
                return;
            }
            result = v1 < v2 ? -1 : (v1 > v2 ? 1 : 0);
        }
        if (result == 0) {
            result = len1 < len2 ? -1 : (len1 > len2 ? 1 : 0);
        }
        ref_push(m, from_signed(result));
    } else if (op == OP_STRCPY) {
        uint32_t src_len;
        uint32_t dst_cap;
        uint32_t copy;

        b = ref_pop(m);
        a = ref_pop(m);
        if (!ref_read(m, a, 2, &v1) || !ref_read(m, addr16(b, 2U), 2, &v2)) {
            return;
        }
        src_len = (uint32_t)v1;
        dst_cap = (uint32_t)v2;
        copy = src_len < dst_cap ? src_len : dst_cap;
        for (i = 0; i < copy; i++) {
            if (!ref_read(m, addr16(a, 4U + i), 1, &v1) || !ref_write(m, addr16(b, 4U + i), 1, v1)) {
                return;
            }
        }
        if (ref_write(m, addr16(b, 4U + copy), 1, 0U)) {
            ref_write(m, b, 2, copy);
        }
    } else { /* OP_STRCAT */
        uint32_t src_len;
        uint32_t dst_len;
        uint32_t dst_cap;
        uint32_t space;
        uint32_t copy;

        b = ref_pop(m);
        a = ref_pop(m);
        if (!ref_read(m, a, 2, &v1)) {
            return;
        }
        src_len = (uint32_t)v1;
        if (!ref_read(m, b, 2, &v1)) {
            return;
        }
        dst_len = (uint32_t)v1;
        if (!ref_read(m, addr16(b, 2U), 2, &v1)) {
            return;
        }
        dst_cap = (uint32_t)v1;
        space = dst_cap > dst_len ? dst_cap - dst_len : 0U;
        copy = src_len < space ? src_len : space;
        for (i = 0; i < copy; i++) {
            if (!ref_read(m, addr16(a, 4U + i), 1, &v1) || !ref_write(m, addr16(b, 4U + dst_len + i), 1, v1)) {
                return;
            }
        }
        if (ref_write(m, addr16(b, 4U + dst_len + copy), 1, 0U)) {
            ref_write(m, b, 2, dst_len + copy);
        }
    }
}

static void ref_comm(ref_t *m, uint8_t op, uint32_t kind)
{
    uint32_t base = ref_pop(m);
    uint8_t *fb;
    uint32_t fb_len;
    int has_handler;
    int handler_fails;

    if (kind == ZPLC_COMM_FB_NONE || kind >= ZPLC_COMM_FB_KIND_MAX) {
        ref_fault(m, ZPLC_VM_INVALID_OPCODE);
        return;
    }
    /* The whole block, as long as its kind says (the 8-byte handshake for a kind with no layout), must lie
     * inside one region, writable unless the opcode only reads (RT-001, RT-002). */
    fb_len = zplc_comm_fb_size(kind);
    if (fb_len == 0U) {
        fb_len = ZPLC_COMM_FB_HANDSHAKE_SIZE;
    }
    fb = ref_region(m, base, fb_len, op != OP_COMM_STATUS);
    if (fb == NULL) {
        ref_fault(m, ZPLC_VM_OUT_OF_BOUNDS);
        return;
    }
    has_handler = kind == KIND_OK || kind == KIND_FAIL;
    handler_fails = kind == KIND_FAIL;
    if (op == OP_COMM_STATUS) {
        ref_push(m, (uint32_t)fb[4] | ((uint32_t)fb[5] << 8) | ((uint32_t)fb[6] << 16) | ((uint32_t)fb[7] << 24));
    } else if (op == OP_COMM_RESET) {
        fb[0] = fb[1] = fb[2] = fb[3] = 0U;
        fb[4] = fb[5] = fb[6] = fb[7] = 0U;
        if (kind == KIND_OK) {
            fb[ZPLC_COMM_MQTT_CONNECT_PROFILE_OFFSET] = (uint8_t)(fb[ZPLC_COMM_MQTT_CONNECT_PROFILE_OFFSET] + 1U);
            fb[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] = 2U;
        }
    } else { /* OP_COMM_EXEC */
        if (fb[0] == 0U) {
            fb[1] = fb[2] = fb[3] = 0U;
            return;
        }
        fb[2] = 0U;
        fb[3] = 0U;
        if (!has_handler) {
            if (fb[1] == 0U) {
                fb[3] = 1U;
                fb[4] = (uint8_t)ZPLC_COMM_NO_HANDLER;
                fb[5] = fb[6] = fb[7] = 0U;
            }
            return;
        }
        if (fb[1] == 0U) {
            fb[1] = 1U;
            if (kind == KIND_OK) {
                fb[ZPLC_COMM_MQTT_CONNECT_PROFILE_OFFSET] = (uint8_t)(fb[ZPLC_COMM_MQTT_CONNECT_PROFILE_OFFSET] + 1U);
                fb[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] = 1U;
            }
            if (handler_fails) {
                fb[1] = 0U;
                fb[3] = 1U;
                fb[4] = (uint8_t)ZPLC_COMM_UNKNOWN;
                fb[5] = fb[6] = fb[7] = 0U;
            }
        }
    }
}

/* One instruction. Returns ZPLC_VM_OK, ZPLC_VM_HALTED, ZPLC_VM_PAUSED or the fault code. */
static int ref_step(ref_t *m, const uint8_t *code, uint32_t code_size, uint32_t tick, uint8_t *executed_op)
{
    const uint16_t at = m->pc;
    const op_info_t *info;
    uint32_t operand = 0;
    unsigned need;
    uint32_t a;
    uint32_t b;
    uint64_t v;
    uint8_t op;
    int rel = 0;

    *executed_op = 0xFFU;
    if (at >= code_size) {
        ref_fault(m, ZPLC_VM_INVALID_JUMP);
        return m->error;
    }
    op = code[at];
    info = &g_info[op];
    *executed_op = op;
    if (!info->present) {
        ref_fault(m, ZPLC_VM_INVALID_OPCODE);
        return m->error;
    }
    if ((uint32_t)at + 1U + info->operand > code_size) {
        ref_fault(m, ZPLC_VM_INVALID_JUMP);
        return m->error;
    }
    if (info->operand == 1U) {
        operand = code[at + 1U];
    } else if (info->operand == 2U) {
        operand = (uint32_t)code[at + 1U] | ((uint32_t)code[at + 2U] << 8);
    } else if (info->operand == 4U) {
        operand = (uint32_t)code[at + 1U] | ((uint32_t)code[at + 2U] << 8) |
                  ((uint32_t)code[at + 3U] << 16) | ((uint32_t)code[at + 4U] << 24);
    }
    if (info->operand == 1U) {
        rel = operand >= 128U ? (int)operand - 256 : (int)operand;
    }
    need = op == OP_PICK ? (unsigned)operand + 1U : info->min_depth;
    if (m->sp < need) {
        ref_fault(m, ZPLC_VM_STACK_UNDERFLOW);
        return m->error;
    }

    m->pc = (uint16_t)(at + 1U + info->operand); /* the fall-through; jumps and faults override it */

    switch (op) {
    case OP_NOP:
        break;
    case OP_HALT:
        m->halted = 1U;
        m->error = ZPLC_VM_HALTED;
        return ZPLC_VM_HALTED;
    case OP_BREAK:
        m->paused = 1U;
        m->error = ZPLC_VM_PAUSED;
        return ZPLC_VM_PAUSED;
    case OP_GET_TICKS:
        ref_push(m, tick);
        break;

    case OP_DUP:
        ref_push(m, m->stack[m->sp - 1U]);
        break;
    case OP_DROP:
        (void)ref_pop(m);
        break;
    case OP_SWAP:
        a = m->stack[m->sp - 1U];
        m->stack[m->sp - 1U] = m->stack[m->sp - 2U];
        m->stack[m->sp - 2U] = a;
        break;
    case OP_OVER:
        ref_push(m, m->stack[m->sp - 2U]);
        break;
    case OP_ROT: /* [a b c] -> [b c a] */
        a = m->stack[m->sp - 3U];
        m->stack[m->sp - 3U] = m->stack[m->sp - 2U];
        m->stack[m->sp - 2U] = m->stack[m->sp - 1U];
        m->stack[m->sp - 1U] = a;
        break;
    case OP_PICK:
        ref_push(m, m->stack[m->sp - 1U - operand]);
        break;

    case OP_LOADI8:
    case OP_LOADI16:
    case OP_LOADI32:
        a = ref_pop(m);
        if (ref_read(m, a, op == OP_LOADI8 ? 1U : (op == OP_LOADI16 ? 2U : 4U), &v)) {
            ref_push(m, (uint32_t)v);
        }
        break;
    case OP_STOREI8:
    case OP_STOREI16:
    case OP_STOREI32:
        b = ref_pop(m); /* value */
        a = ref_pop(m); /* address */
        (void)ref_write(m, a, op == OP_STOREI8 ? 1U : (op == OP_STOREI16 ? 2U : 4U), b);
        break;

    case OP_STRLEN:
    case OP_STRCPY:
    case OP_STRCAT:
    case OP_STRCMP:
    case OP_STRCLR:
        ref_string_ops(m, op);
        break;

    case OP_ADD:
        b = ref_pop(m); a = ref_pop(m);
        ref_push(m, from_signed((int64_t)a + (int64_t)b));
        break;
    case OP_SUB:
        b = ref_pop(m); a = ref_pop(m);
        ref_push(m, from_signed((int64_t)a - (int64_t)b));
        break;
    case OP_MUL:
        b = ref_pop(m); a = ref_pop(m);
        ref_push(m, (uint32_t)(((uint64_t)a * (uint64_t)b) & 0xFFFFFFFFULL));
        break;
    case OP_DIV:
    case OP_MOD:
        b = ref_pop(m); a = ref_pop(m);
        if (b == 0U) {
            ref_fault(m, ZPLC_VM_DIV_BY_ZERO);
        } else {
            const int64_t sa = as_signed(a);
            const int64_t sb = as_signed(b);
            /* int64 holds INT32_MIN / -1 exactly, 2^31, which then wraps to INT32_MIN. */
            ref_push(m, from_signed(op == OP_DIV ? sa / sb : sa % sb));
        }
        break;
    case OP_NEG:
        a = ref_pop(m);
        ref_push(m, from_signed(-(int64_t)as_signed(a)));
        break;
    case OP_ABS:
        a = ref_pop(m);
        ref_push(m, from_signed(as_signed(a) < 0 ? -(int64_t)as_signed(a) : (int64_t)as_signed(a)));
        break;

    case OP_ADDF:
    case OP_SUBF:
    case OP_MULF:
    case OP_DIVF: {
        float fa;
        float fb;
        float fr;

        b = ref_pop(m); a = ref_pop(m);
        fa = bits_f(a);
        fb = bits_f(b);
        if (op == OP_DIVF && fb == 0.0f) {
            ref_fault(m, ZPLC_VM_DIV_BY_ZERO);
            break;
        }
        fr = op == OP_ADDF ? fa + fb : (op == OP_SUBF ? fa - fb : (op == OP_MULF ? fa * fb : fa / fb));
        ref_push(m, f_bits(fr));
        break;
    }
    case OP_NEGF:
        a = ref_pop(m);
        ref_push(m, a ^ 0x80000000U); /* IEEE negation flips the sign bit, NaN and zero included */
        break;
    case OP_ABSF:
        a = ref_pop(m);
        ref_push(m, a & 0x7FFFFFFFU); /* IEEE absolute value clears the sign bit */
        break;

    case OP_AND:
        b = ref_pop(m); a = ref_pop(m);
        ref_push(m, a & b);
        break;
    case OP_OR:
        b = ref_pop(m); a = ref_pop(m);
        ref_push(m, a | b);
        break;
    case OP_XOR:
        b = ref_pop(m); a = ref_pop(m);
        ref_push(m, a ^ b);
        break;
    case OP_NOT:
        a = ref_pop(m);
        ref_push(m, ~a);
        break;
    case OP_SHL:
        b = ref_pop(m); a = ref_pop(m);
        ref_push(m, b >= 32U ? 0U : (uint32_t)(((uint64_t)a << b) & 0xFFFFFFFFULL));
        break;
    case OP_SHR:
        b = ref_pop(m); a = ref_pop(m);
        ref_push(m, b >= 32U ? 0U : a >> b);
        break;
    case OP_SAR:
        b = ref_pop(m); a = ref_pop(m);
        ref_push(m, from_signed((int64_t)as_signed(a) >> (b >= 32U ? 31U : b)));
        break;

    case OP_EQ: case OP_NE: case OP_LT: case OP_LE: case OP_GT: case OP_GE: case OP_LTU: case OP_GTU: {
        int r = 0;
        b = ref_pop(m); a = ref_pop(m);
        switch (op) {
        case OP_EQ:  r = a == b; break;
        case OP_NE:  r = a != b; break;
        case OP_LT:  r = as_signed(a) < as_signed(b); break;
        case OP_LE:  r = as_signed(a) <= as_signed(b); break;
        case OP_GT:  r = as_signed(a) > as_signed(b); break;
        case OP_GE:  r = as_signed(a) >= as_signed(b); break;
        case OP_LTU: r = a < b; break;
        default:     r = a > b; break;
        }
        ref_push(m, r ? 1U : 0U);
        break;
    }

    case OP_PUSH8:
        ref_push(m, from_signed(rel));
        break;
    case OP_PUSH16:
        ref_push(m, from_signed((int64_t)(operand >= 0x8000U ? (int64_t)operand - 0x10000 : (int64_t)operand)));
        break;
    case OP_PUSH32:
        ref_push(m, operand);
        break;

    case OP_JR:
        m->pc = (uint16_t)((at + 2 + rel) & 0xFFFF);
        break;
    case OP_JRZ:
    case OP_JRNZ:
        a = ref_pop(m);
        if ((op == OP_JRZ) == (a == 0U)) {
            m->pc = (uint16_t)((at + 2 + rel) & 0xFFFF);
        }
        break;
    case OP_JMP:
        m->pc = (uint16_t)operand;
        break;
    case OP_JZ:
    case OP_JNZ:
        a = ref_pop(m);
        if ((op == OP_JZ) == (a == 0U)) {
            m->pc = (uint16_t)operand;
        }
        break;
    case OP_CALL:
        if (m->depth >= ZPLC_CALL_STACK_MAX) {
            ref_fault(m, ZPLC_VM_CALL_OVERFLOW);
            m->pc = at;
            break;
        }
        m->call[m->depth++] = (uint16_t)(at + 3U);
        m->pc = (uint16_t)operand;
        break;
    case OP_RET:
        if (m->depth == 0U) {
            /* Return from the main program: the scan ends normally, with the program counter at the RET. */
            m->halted = 1U;
            m->error = ZPLC_VM_HALTED;
            m->pc = at;
            return ZPLC_VM_HALTED;
        }
        m->pc = m->call[--m->depth];
        break;

    case OP_LOAD8:
    case OP_LOAD16:
    case OP_LOAD32:
        if (ref_read(m, operand, op == OP_LOAD8 ? 1U : (op == OP_LOAD16 ? 2U : 4U), &v)) {
            ref_push(m, (uint32_t)v);
        }
        break;
    case OP_LOAD64:
        if (ref_read(m, operand, 8U, &v)) {
            if (ref_push(m, (uint32_t)(v & 0xFFFFFFFFULL))) {
                ref_push(m, (uint32_t)(v >> 32));
            }
        }
        break;
    case OP_STORE8:
    case OP_STORE16:
    case OP_STORE32:
        a = ref_pop(m);
        (void)ref_write(m, operand, op == OP_STORE8 ? 1U : (op == OP_STORE16 ? 2U : 4U), a);
        break;
    case OP_STORE64:
        b = ref_pop(m); /* high word */
        a = ref_pop(m); /* low word */
        (void)ref_write(m, operand, 8U, ((uint64_t)b << 32) | a);
        break;

    case OP_I2F:
        a = ref_pop(m);
        ref_push(m, f_bits((float)(double)as_signed(a)));
        break;
    case OP_F2I:
        a = ref_pop(m);
        ref_push(m, ref_float_to_int(bits_f(a)));
        break;
    case OP_I2B:
        a = ref_pop(m);
        ref_push(m, a != 0U ? 1U : 0U);
        break;
    case OP_EXT8:
        a = ref_pop(m);
        ref_push(m, from_signed((a & 0x80U) != 0U ? (int64_t)(a & 0xFFU) - 0x100 : (int64_t)(a & 0xFFU)));
        break;
    case OP_EXT16:
        a = ref_pop(m);
        ref_push(m, from_signed((a & 0x8000U) != 0U ? (int64_t)(a & 0xFFFFU) - 0x10000 : (int64_t)(a & 0xFFFFU)));
        break;
    case OP_ZEXT8:
        a = ref_pop(m);
        ref_push(m, a & 0xFFU);
        break;
    case OP_ZEXT16:
        a = ref_pop(m);
        ref_push(m, a & 0xFFFFU);
        break;

    case OP_COMM_EXEC:
    case OP_COMM_STATUS:
    case OP_COMM_RESET:
        ref_comm(m, op, operand);
        break;

    default:
        /* In the table but unknown to the model: a new opcode needs its semantics here. */
        g_model_gap = op;
        ref_fault(m, ZPLC_VM_INVALID_OPCODE);
        break;
    }

    if (m->halted != 0U) {
        /* A fault leaves the program counter on the faulting instruction. */
        m->pc = at;
        return m->error;
    }
    return ZPLC_VM_OK;
}

/* Bounded run, as zplc_vm_run_bounded(): the budget ends in a WATCHDOG fault. Returns the VM's return value. */
static int ref_run(ref_t *m, const uint8_t *code, uint32_t code_size, uint32_t budget, uint32_t tick,
                   uint8_t *last_op)
{
    uint32_t count = 0;

    *last_op = 0xFFU;
    memset(g_run_ok, 0, sizeof(g_run_ok));
    while (m->halted == 0U && m->paused == 0U) {
        const int r = ref_step(m, code, code_size, tick, last_op);

        if (r == ZPLC_VM_HALTED || r == ZPLC_VM_PAUSED) {
            g_run_ok[*last_op] = 1U;
            return (int)count;
        }
        if (r != ZPLC_VM_OK) {
            return -r;
        }
        g_run_ok[*last_op] = 1U;
        count++;
        if (count >= budget) {
            break;
        }
    }
    if (m->halted == 0U && m->paused == 0U) {
        m->error = ZPLC_VM_WATCHDOG;
        m->halted = 1U;
        return -(int)ZPLC_VM_WATCHDOG;
    }
    return (int)count;
}

/* ============================================================================
 * Program builder and case runner
 * ============================================================================
 */

#define MAX_CODE 1280

typedef struct {
    uint8_t b[MAX_CODE];
    size_t n;
    int overflowed;
} code_t;

typedef struct {
    uint16_t addr;
    uint8_t len;
    uint8_t data[24];
} poke_t;

#define MAX_POKES 8

typedef struct {
    const char *family;
    const char *name;
    uint32_t tick;
    uint32_t budget;
    unsigned npokes;
    poke_t pokes[MAX_POKES];
    int expect_error; /* -1: the model decides; otherwise the error the table implies */
    int expect_pc;    /* -1: the model decides */
    int float_result; /* a NaN is a NaN: payloads and sign of NaN results are not compared */
} case_t;

static void c_byte(code_t *c, uint8_t v)
{
    if (c->n < MAX_CODE) {
        c->b[c->n++] = v;
    } else {
        c->overflowed = 1;
    }
}

static void c_op(code_t *c, uint8_t op) { c_byte(c, op); }

static void c_op8(code_t *c, uint8_t op, uint8_t v)
{
    c_byte(c, op);
    c_byte(c, v);
}

static void c_op16(code_t *c, uint8_t op, uint16_t v)
{
    c_byte(c, op);
    c_byte(c, (uint8_t)v);
    c_byte(c, (uint8_t)(v >> 8));
}

static void c_op32(code_t *c, uint8_t op, uint32_t v)
{
    c_byte(c, op);
    c_byte(c, (uint8_t)v);
    c_byte(c, (uint8_t)(v >> 8));
    c_byte(c, (uint8_t)(v >> 16));
    c_byte(c, (uint8_t)(v >> 24));
}

static void c_push(code_t *c, uint32_t v) { c_op32(c, OP_PUSH32, v); }

static void case_init(case_t *k, const char *family, const char *name)
{
    memset(k, 0, sizeof(*k));
    k->family = family;
    k->name = name;
    k->budget = 100000U;
    k->expect_error = -1;
    k->expect_pc = -1;
}

static void case_poke(case_t *k, uint16_t addr, const uint8_t *data, unsigned len)
{
    if (k->npokes < MAX_POKES && len <= sizeof(k->pokes[0].data)) {
        k->pokes[k->npokes].addr = addr;
        k->pokes[k->npokes].len = (uint8_t)len;
        memcpy(k->pokes[k->npokes].data, data, len);
        k->npokes++;
    }
}

/* A STRING header and text at addr: length, capacity, characters, terminator. */
static void case_string(case_t *k, uint16_t addr, uint16_t capacity, const char *text)
{
    uint8_t bytes[24];
    size_t length = strlen(text);

    memset(bytes, 0, sizeof(bytes));
    bytes[0] = (uint8_t)length;
    bytes[1] = (uint8_t)(length >> 8);
    bytes[2] = (uint8_t)capacity;
    bytes[3] = (uint8_t)(capacity >> 8);
    memcpy(&bytes[4], text, length);
    case_poke(k, addr, bytes, (unsigned)(4U + length + 1U));
}

/* A communication block header at addr: EN, BUSY, DONE, ERROR and the STATUS word. */
static void case_fb(case_t *k, uint16_t addr, uint8_t en, uint8_t busy, uint8_t done, uint8_t error,
                    uint32_t status)
{
    uint8_t bytes[8];

    bytes[0] = en;
    bytes[1] = busy;
    bytes[2] = done;
    bytes[3] = error;
    bytes[4] = (uint8_t)status;
    bytes[5] = (uint8_t)(status >> 8);
    bytes[6] = (uint8_t)(status >> 16);
    bytes[7] = (uint8_t)(status >> 24);
    case_poke(k, addr, bytes, 8);
}

static void fill_image(ref_t *m)
{
    uint32_t x = 0x2545F491U;
    uint8_t *regions[4];
    size_t sizes[4];
    unsigned r;
    size_t i;

    regions[0] = m->ipi;    sizes[0] = sizeof(m->ipi);
    regions[1] = m->opi;    sizes[1] = sizeof(m->opi);
    regions[2] = m->work;   sizes[2] = sizeof(m->work);
    regions[3] = m->retain; sizes[3] = sizeof(m->retain);
    for (r = 0; r < 4U; r++) {
        for (i = 0; i < sizes[r]; i++) {
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            regions[r][i] = (uint8_t)(x >> 11);
        }
    }
}

static int words_equal(uint32_t vm_word, uint32_t model_word, int float_result)
{
    if (vm_word == model_word) {
        return 1;
    }
    return float_result != 0 && (vm_word & 0x7F800000U) == 0x7F800000U && (vm_word & 0x007FFFFFU) != 0U &&
           (model_word & 0x7F800000U) == 0x7F800000U && (model_word & 0x007FFFFFU) != 0U;
}

/* Run one program on the VM and on the model and compare. */
static void run_case(const case_t *k, const code_t *code)
{
    zplc_vm_t *vm;
    uint8_t last_op;
    int vm_rc;
    int model_rc;
    unsigned p;
    const unsigned failed_before = fail_count;
    int faulted;

    case_count++;
    if (code->overflowed) {
        report_failure(k->family, k->name, "program does not fit the builder");
        return;
    }

    /* Memory image: the same bytes in the VM and in the model. */
    memset(&g_model, 0, sizeof(g_model));
    fill_image(&g_model);
    for (p = 0; p < k->npokes; p++) {
        uint8_t *dst = ref_region(&g_model, k->pokes[p].addr, k->pokes[p].len, 0);

        if (dst == NULL) {
            report_failure(k->family, k->name, "poke at 0x%04X is outside the memory map", (unsigned)k->pokes[p].addr);
            return;
        }
        memcpy(dst, k->pokes[p].data, k->pokes[p].len);
    }

    zplc_core_init();
    memcpy(zplc_mem_get_region(ZPLC_MEM_IPI_BASE), g_model.ipi, sizeof(g_model.ipi));
    memcpy(zplc_mem_get_region(ZPLC_MEM_OPI_BASE), g_model.opi, sizeof(g_model.opi));
    memcpy(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), g_model.work, sizeof(g_model.work));
    memcpy(zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), g_model.retain, sizeof(g_model.retain));
    zplc_hal_posix_set_tick_override(k->tick);
    if (zplc_test_load_raw(code->b, code->n) != 0) {
        report_failure(k->family, k->name, "the program was not loaded");
        return;
    }
    vm = zplc_core_get_default_vm();
    g_model_gap = -1;
    vm_rc = zplc_vm_run_bounded(vm, k->budget);
    model_rc = ref_run(&g_model, code->b, (uint32_t)code->n, k->budget, k->tick, &last_op);
    faulted = g_model.error != ZPLC_VM_OK && g_model.error != ZPLC_VM_HALTED && g_model.error != ZPLC_VM_PAUSED;

    if (g_model_gap >= 0) {
        report_failure(k->family, k->name, "the model has no semantics for opcode 0x%02X: add them", g_model_gap);
        return;
    }
    if (vm_rc != model_rc) {
        report_failure(k->family, k->name, "return value: VM %d, model %d", vm_rc, model_rc);
    }
    if (vm->error != g_model.error || vm->halted != g_model.halted || vm->paused != g_model.paused) {
        report_failure(k->family, k->name, "state: VM error %u halted %u paused %u, model error %u halted %u paused %u",
                       (unsigned)vm->error, (unsigned)vm->halted, (unsigned)vm->paused,
                       (unsigned)g_model.error, (unsigned)g_model.halted, (unsigned)g_model.paused);
    }
    if (vm->pc != g_model.pc) {
        report_failure(k->family, k->name, "program counter: VM %u, model %u", (unsigned)vm->pc, (unsigned)g_model.pc);
    }
    if (vm->flags != 0U) {
        report_failure(k->family, k->name, "status flags: VM 0x%02X, no opcode sets flags", (unsigned)vm->flags);
    }
    if (!faulted) {
        unsigned i;

        if (vm->sp != g_model.sp) {
            report_failure(k->family, k->name, "stack pointer: VM %u, model %u", (unsigned)vm->sp, (unsigned)g_model.sp);
        } else {
            for (i = 0; i < g_model.sp; i++) {
                if (!words_equal(vm->stack[i], g_model.stack[i], k->float_result)) {
                    report_failure(k->family, k->name, "stack[%u]: VM 0x%08X, model 0x%08X", i,
                                   (unsigned)vm->stack[i], (unsigned)g_model.stack[i]);
                    break;
                }
            }
        }
        if (vm->call_depth != g_model.depth) {
            report_failure(k->family, k->name, "call depth: VM %u, model %u", (unsigned)vm->call_depth, (unsigned)g_model.depth);
        } else if (memcmp(vm->call_stack, g_model.call, (size_t)g_model.depth * sizeof(uint16_t)) != 0) {
            report_failure(k->family, k->name, "return addresses differ");
        }
    }
    if (memcmp(zplc_mem_get_region(ZPLC_MEM_IPI_BASE), g_model.ipi, sizeof(g_model.ipi)) != 0) {
        report_failure(k->family, k->name, "IPI differs from the model");
    }
    if (memcmp(zplc_mem_get_region(ZPLC_MEM_OPI_BASE), g_model.opi, sizeof(g_model.opi)) != 0) {
        report_failure(k->family, k->name, "OPI differs from the model");
    }
    if (memcmp(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), g_model.work, sizeof(g_model.work)) != 0) {
        report_failure(k->family, k->name, "WORK differs from the model");
    }
    if (memcmp(zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), g_model.retain, sizeof(g_model.retain)) != 0) {
        report_failure(k->family, k->name, "RETAIN differs from the model");
    }
    if (k->expect_error >= 0 && g_model.error != (uint8_t)k->expect_error) {
        report_failure(k->family, k->name, "the table implies error %d, the model gives %u", k->expect_error,
                       (unsigned)g_model.error);
    }
    if (k->expect_pc >= 0 && g_model.pc != (uint16_t)k->expect_pc) {
        report_failure(k->family, k->name, "expected program counter %d, the model gives %u", k->expect_pc,
                       (unsigned)g_model.pc);
    }

    if (fail_count == failed_before) {
        unsigned op;

        for (op = 0; op < 256U; op++) {
            if (g_run_ok[op] != 0U) {
                g_completed[op]++;
            }
        }
        if (faulted && last_op != 0xFFU && g_model.error < 16U && g_model.error != ZPLC_VM_WATCHDOG) {
            g_fault[last_op][g_model.error]++;
        }
    }
}

/* ============================================================================
 * Case families
 * ============================================================================
 */

static void finish(const case_t *k, code_t *c)
{
    c_op(c, OP_HALT);
    run_case(k, c);
}

static const uint32_t INT_VALUES[] = {
    0x00000000U, 0x00000001U, 0x00000002U, 0x00000007U, 0x0000001FU, 0x00000020U, 0x000000FFU, 0x00008000U,
    0x7FFFFFFFU, 0x80000000U, 0x80000001U, 0xFFFFFFF9U, 0xFFFFFFFFU, 0xDEADBEEFU,
};
#define N_INT (sizeof(INT_VALUES) / sizeof(INT_VALUES[0]))

static const uint32_t FLOAT_VALUES[] = {
    0x00000000U, /* +0.0 */
    0x3F800000U, /* 1.0 */
    0xBFC00000U, /* -1.5 */
    0x40600000U, /* 3.5 */
    0x4F000000U, /* 2^31 */
    0xCF000000U, /* -2^31 */
    0x4EFFFFFFU, /* the largest float below 2^31 */
    0xCF000001U, /* the first float below -2^31 */
    0x501502F9U, /* 1e10 */
    0x7F7FFFFFU, /* FLT_MAX */
    0x7F800000U, /* +Inf */
    0xFF800000U, /* -Inf */
    0x7FC00000U, /* quiet NaN */
    0x00000001U, /* the smallest denormal */
    0x3EAAAAABU, /* 1/3 */
};
#define N_FLOAT (sizeof(FLOAT_VALUES) / sizeof(FLOAT_VALUES[0]))

static void family_system(void)
{
    static const uint32_t ticks[] = { 0U, 1U, 123456U, 0x7FFFFFFFU, 0xFFFFFFFFU };
    case_t k;
    code_t c;
    unsigned i;

    case_init(&k, "system", "NOP x3 then HALT");
    memset(&c, 0, sizeof(c));
    c_op(&c, OP_NOP); c_op(&c, OP_NOP); c_op(&c, OP_NOP);
    finish(&k, &c);

    case_init(&k, "system", "HALT stops before the next instruction");
    memset(&c, 0, sizeof(c));
    c_op8(&c, OP_PUSH8, 1); c_op(&c, OP_HALT); c_op8(&c, OP_PUSH8, 2);
    run_case(&k, &c);

    case_init(&k, "system", "BREAK pauses with the program counter past it");
    memset(&c, 0, sizeof(c));
    c_op8(&c, OP_PUSH8, 1); c_op(&c, OP_BREAK); c_op8(&c, OP_PUSH8, 2);
    finish(&k, &c);

    for (i = 0; i < sizeof(ticks) / sizeof(ticks[0]); i++) {
        case_init(&k, "system", "GET_TICKS pushes the tick");
        k.tick = ticks[i];
        memset(&c, 0, sizeof(c));
        c_op(&c, OP_GET_TICKS);
        finish(&k, &c);
    }
}

static void family_stack(void)
{
    static const uint8_t ops[] = { OP_DUP, OP_DROP, OP_SWAP, OP_OVER, OP_ROT };
    case_t k;
    code_t c;
    unsigned i;
    unsigned depth;

    for (i = 0; i < sizeof(ops); i++) {
        for (depth = 3U; depth <= 4U; depth++) {
            unsigned d;
            case_init(&k, "stack", g_info[ops[i]].name);
            memset(&c, 0, sizeof(c));
            for (d = 0; d < depth; d++) {
                c_push(&c, 0x11110000U * (d + 1U) + d);
            }
            c_op(&c, ops[i]);
            finish(&k, &c);
        }
    }
    for (i = 0; i <= 3U; i++) {
        unsigned d;
        case_init(&k, "stack", "PICK n of three");
        memset(&c, 0, sizeof(c));
        for (d = 0; d < 3U; d++) {
            c_push(&c, 0xA0000000U + d);
        }
        c_op8(&c, OP_PICK, (uint8_t)i);
        finish(&k, &c);
    }
    case_init(&k, "stack", "PICK 255 is deeper than the stack");
    memset(&c, 0, sizeof(c));
    c_push(&c, 1U);
    c_op8(&c, OP_PICK, 255U);
    finish(&k, &c);
}

static void run_binary(const char *family, uint8_t op, uint32_t a, uint32_t b, int float_result)
{
    case_t k;
    code_t c;

    case_init(&k, family, g_info[op].name);
    k.float_result = float_result;
    memset(&c, 0, sizeof(c));
    c_push(&c, a);
    c_push(&c, b);
    c_op(&c, op);
    finish(&k, &c);
}

static void run_unary(const char *family, uint8_t op, uint32_t a, int float_result)
{
    case_t k;
    code_t c;

    case_init(&k, family, g_info[op].name);
    k.float_result = float_result;
    memset(&c, 0, sizeof(c));
    c_push(&c, a);
    c_op(&c, op);
    finish(&k, &c);
}

static void family_integer_and_logic(void)
{
    static const uint8_t binary[] = {
        OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_MOD, OP_AND, OP_OR, OP_XOR, OP_SHL, OP_SHR, OP_SAR,
        OP_EQ, OP_NE, OP_LT, OP_LE, OP_GT, OP_GE, OP_LTU, OP_GTU,
    };
    static const uint8_t unary[] = { OP_NEG, OP_ABS, OP_NOT, OP_I2B, OP_EXT8, OP_EXT16, OP_ZEXT8, OP_ZEXT16, OP_I2F };
    unsigned i;
    unsigned x;
    unsigned y;

    for (i = 0; i < sizeof(binary); i++) {
        for (x = 0; x < N_INT; x++) {
            for (y = 0; y < N_INT; y++) {
                run_binary("integer", binary[i], INT_VALUES[x], INT_VALUES[y], 0);
            }
        }
    }
    for (i = 0; i < sizeof(unary); i++) {
        for (x = 0; x < N_INT; x++) {
            run_unary("integer", unary[i], INT_VALUES[x], 0);
        }
    }
}

static void family_float(void)
{
    static const uint8_t binary[] = { OP_ADDF, OP_SUBF, OP_MULF, OP_DIVF };
    static const uint8_t unary[] = { OP_NEGF, OP_ABSF, OP_F2I };
    unsigned i;
    unsigned x;
    unsigned y;

    for (i = 0; i < sizeof(binary); i++) {
        for (x = 0; x < N_FLOAT; x++) {
            for (y = 0; y < N_FLOAT; y++) {
                run_binary("float", binary[i], FLOAT_VALUES[x], FLOAT_VALUES[y], 1);
            }
        }
    }
    for (i = 0; i < sizeof(unary); i++) {
        for (x = 0; x < N_FLOAT; x++) {
            run_unary("float", unary[i], FLOAT_VALUES[x], 1);
        }
    }
    run_binary("float", OP_DIVF, 0x3F800000U, 0x80000000U, 1); /* 1.0 / -0.0 */
}

static void family_push(void)
{
    static const uint8_t v8[] = { 0x00, 0x01, 0x7F, 0x80, 0xFF };
    static const uint16_t v16[] = { 0x0000, 0x0001, 0x7FFF, 0x8000, 0xFFFF };
    case_t k;
    code_t c;
    unsigned i;

    for (i = 0; i < sizeof(v8); i++) {
        case_init(&k, "push", "PUSH8 sign-extends");
        memset(&c, 0, sizeof(c));
        c_op8(&c, OP_PUSH8, v8[i]);
        finish(&k, &c);
    }
    for (i = 0; i < sizeof(v16) / sizeof(v16[0]); i++) {
        case_init(&k, "push", "PUSH16 sign-extends");
        memset(&c, 0, sizeof(c));
        c_op16(&c, OP_PUSH16, v16[i]);
        finish(&k, &c);
    }
    for (i = 0; i < N_INT; i++) {
        case_init(&k, "push", "PUSH32");
        memset(&c, 0, sizeof(c));
        c_push(&c, INT_VALUES[i]);
        finish(&k, &c);
    }
}

/* Addresses at the edges of every region, in range and just out of it. */
static const uint16_t ADDRS[] = {
    0x0000, 0x0100, 0x0FF8, 0x0FFC, 0x0FFD, 0x0FFF,
    0x1000, 0x1100, 0x1FF8, 0x1FFC, 0x1FFD, 0x1FFF,
    0x2000, 0x2100, 0x3FF8, 0x3FFC, 0x3FFD, 0x3FFF,
    0x4000, 0x4100, 0x4FF8, 0x4FFC, 0x4FFD, 0x4FFF,
    0x5000, 0x5001, 0x8000, 0xFFF8, 0xFFFF,
};
#define N_ADDRS (sizeof(ADDRS) / sizeof(ADDRS[0]))

static void family_memory(void)
{
    static const uint8_t indirect_load[] = { OP_LOADI8, OP_LOADI16, OP_LOADI32 };
    static const uint8_t indirect_store[] = { OP_STOREI8, OP_STOREI16, OP_STOREI32 };
    static const uint8_t direct_load[] = { OP_LOAD8, OP_LOAD16, OP_LOAD32, OP_LOAD64 };
    static const uint8_t direct_store[] = { OP_STORE8, OP_STORE16, OP_STORE32 };
    static const uint32_t stored[] = { 0xA1B2C3D4U, 0x00000000U };
    case_t k;
    code_t c;
    unsigned i;
    unsigned a;
    unsigned s;

    for (i = 0; i < sizeof(indirect_load); i++) {
        for (a = 0; a < N_ADDRS; a++) {
            case_init(&k, "memory", g_info[indirect_load[i]].name);
            memset(&c, 0, sizeof(c));
            c_push(&c, ADDRS[a]);
            c_op(&c, indirect_load[i]);
            finish(&k, &c);
        }
    }
    for (i = 0; i < sizeof(indirect_store); i++) {
        for (a = 0; a < N_ADDRS; a++) {
            for (s = 0; s < 2U; s++) {
                case_init(&k, "memory", g_info[indirect_store[i]].name);
                memset(&c, 0, sizeof(c));
                c_push(&c, ADDRS[a]);
                c_push(&c, stored[s]);
                c_op(&c, indirect_store[i]);
                finish(&k, &c);
            }
        }
    }
    for (i = 0; i < sizeof(direct_load); i++) {
        for (a = 0; a < N_ADDRS; a++) {
            case_init(&k, "memory", g_info[direct_load[i]].name);
            memset(&c, 0, sizeof(c));
            c_op16(&c, direct_load[i], ADDRS[a]);
            finish(&k, &c);
        }
    }
    for (i = 0; i < sizeof(direct_store); i++) {
        for (a = 0; a < N_ADDRS; a++) {
            case_init(&k, "memory", g_info[direct_store[i]].name);
            memset(&c, 0, sizeof(c));
            c_push(&c, stored[0]);
            c_op16(&c, direct_store[i], ADDRS[a]);
            finish(&k, &c);
        }
    }
    for (a = 0; a < N_ADDRS; a++) {
        case_init(&k, "memory", "STORE64");
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x01234567U);
        c_push(&c, 0x89ABCDEFU);
        c_op16(&c, OP_STORE64, ADDRS[a]);
        finish(&k, &c);
    }
    /* LOAD64 pushes two words: at 255 words the second one overflows. */
    case_init(&k, "memory", "LOAD64 with one free stack slot");
    memset(&c, 0, sizeof(c));
    for (i = 0; i < ZPLC_STACK_MAX_DEPTH - 1U; i++) {
        c_op8(&c, OP_PUSH8, 1);
    }
    c_op16(&c, OP_LOAD64, 0x2000U);
    finish(&k, &c);
}

static void family_string(void)
{
    static const uint16_t dst_in_work = 0x2100U;
    case_t k;
    code_t c;
    unsigned i;
    static const char *const words[] = { "", "abc", "abd", "ab", "Hello" };

    /* STRLEN, STRCLR on a valid string; faults on bad addresses. */
    case_init(&k, "string", "STRLEN");
    case_string(&k, 0x2000U, 16U, "Hello");
    memset(&c, 0, sizeof(c));
    c_push(&c, 0x2000U); c_op(&c, OP_STRLEN);
    finish(&k, &c);

    case_init(&k, "string", "STRCLR");
    case_string(&k, 0x2000U, 16U, "Hello");
    memset(&c, 0, sizeof(c));
    c_push(&c, 0x2000U); c_op(&c, OP_STRCLR);
    finish(&k, &c);

    /* STRCPY: fits, truncated to the capacity of the destination, empty source. */
    for (i = 0; i < 3U; i++) {
        static const uint16_t caps[] = { 16U, 3U, 0U };
        case_init(&k, "string", "STRCPY");
        case_string(&k, 0x2000U, 16U, "Hello");
        case_string(&k, dst_in_work, caps[i], "xyz");
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x2000U); c_push(&c, dst_in_work); c_op(&c, OP_STRCPY);
        finish(&k, &c);
    }
    /* STRCAT: room, room for part, no room. */
    for (i = 0; i < 3U; i++) {
        static const uint16_t caps[] = { 16U, 5U, 3U };
        case_init(&k, "string", "STRCAT");
        case_string(&k, 0x2000U, 16U, "Hello");
        case_string(&k, dst_in_work, caps[i], "xyz");
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x2000U); c_push(&c, dst_in_work); c_op(&c, OP_STRCAT);
        finish(&k, &c);
    }
    /* STRCMP on every pair of a few words: equal, less, greater, prefix, empty. */
    for (i = 0; i < 25U; i++) {
        case_init(&k, "string", "STRCMP");
        case_string(&k, 0x2000U, 16U, words[i / 5U]);
        case_string(&k, dst_in_work, 16U, words[i % 5U]);
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x2000U); c_push(&c, dst_in_work); c_op(&c, OP_STRCMP);
        finish(&k, &c);
    }
    /* Faults: an address outside the map, in the code region, the end of a region, and a write into IPI. */
    {
        static const uint16_t bad[] = { 0x5000U, 0xFFFFU, 0x1FFFU };
        static const uint8_t one[] = { OP_STRLEN, OP_STRCLR };
        unsigned j;

        for (j = 0; j < sizeof(one); j++) {
            for (i = 0; i < 3U; i++) {
                case_init(&k, "string", g_info[one[j]].name);
                memset(&c, 0, sizeof(c));
                c_push(&c, bad[i]); c_op(&c, one[j]);
                finish(&k, &c);
            }
        }
        for (i = 0; i < 3U; i++) {
            case_init(&k, "string", "STRCMP at a bad address");
            case_string(&k, 0x2000U, 16U, "Hello");
            memset(&c, 0, sizeof(c));
            c_push(&c, 0x2000U); c_push(&c, bad[i]); c_op(&c, OP_STRCMP);
            finish(&k, &c);
        }
        for (i = 0; i < 3U; i++) {
            case_init(&k, "string", "STRCPY source at a bad address");
            case_string(&k, dst_in_work, 16U, "xyz");
            memset(&c, 0, sizeof(c));
            c_push(&c, bad[i]); c_push(&c, dst_in_work); c_op(&c, OP_STRCPY);
            finish(&k, &c);
        }
        for (i = 0; i < 3U; i++) {
            case_init(&k, "string", "STRCAT destination at a bad address");
            case_string(&k, 0x2000U, 16U, "Hello");
            memset(&c, 0, sizeof(c));
            c_push(&c, 0x2000U); c_push(&c, bad[i]); c_op(&c, OP_STRCAT);
            finish(&k, &c);
        }
        case_init(&k, "string", "STRCPY into the input image");
        case_string(&k, 0x2000U, 16U, "Hello");
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x2000U); c_push(&c, 0x0100U); c_op(&c, OP_STRCPY);
        finish(&k, &c);
        case_init(&k, "string", "STRCLR in the input image");
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x0100U); c_op(&c, OP_STRCLR);
        finish(&k, &c);
    }

    /*
     * A string whose header is the last four bytes of RETAIN: its characters would start in the code region.
     * Each access that fails here fails before the instruction has written anything, so the image the model
     * expects does not depend on how far a conforming implementation gets before it faults.
     */
    {
        static const uint8_t header_len3_cap3[] = { 3, 0, 3, 0 };
        static const uint8_t header_len0_cap3[] = { 0, 0, 3, 0 };
        static const uint8_t header_len0_cap0[] = { 0, 0, 0, 0 };
        static const uint8_t header_len2_cap0[] = { 2, 0, 0, 0 };
        const uint16_t edge = 0x4FFCU;

        /* STRCPY: first source character unreadable; first destination character unwritable; terminator unwritable. */
        case_init(&k, "string", "STRCPY first source character outside memory");
        case_poke(&k, edge, header_len3_cap3, 4);
        case_string(&k, dst_in_work, 16U, "x");
        memset(&c, 0, sizeof(c));
        c_push(&c, edge); c_push(&c, dst_in_work); c_op(&c, OP_STRCPY);
        finish(&k, &c);
        case_init(&k, "string", "STRCPY first destination character outside memory");
        case_string(&k, 0x2000U, 16U, "Hello");
        case_poke(&k, edge, header_len0_cap3, 4);
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x2000U); c_push(&c, edge); c_op(&c, OP_STRCPY);
        finish(&k, &c);
        case_init(&k, "string", "STRCPY terminator outside memory");
        case_string(&k, 0x2000U, 16U, "");
        case_poke(&k, edge, header_len0_cap0, 4);
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x2000U); c_push(&c, edge); c_op(&c, OP_STRCPY);
        finish(&k, &c);

        /* STRCAT: the same three accesses. */
        case_init(&k, "string", "STRCAT first source character outside memory");
        case_poke(&k, edge, header_len3_cap3, 4);
        case_string(&k, dst_in_work, 16U, "x");
        memset(&c, 0, sizeof(c));
        c_push(&c, edge); c_push(&c, dst_in_work); c_op(&c, OP_STRCAT);
        finish(&k, &c);
        case_init(&k, "string", "STRCAT first destination character outside memory");
        case_string(&k, 0x2000U, 16U, "Hello");
        case_poke(&k, edge, header_len0_cap3, 4);
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x2000U); c_push(&c, edge); c_op(&c, OP_STRCAT);
        finish(&k, &c);
        case_init(&k, "string", "STRCAT terminator outside memory");
        case_string(&k, 0x2000U, 16U, "");
        case_poke(&k, edge, header_len0_cap0, 4);
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x2000U); c_push(&c, edge); c_op(&c, OP_STRCAT);
        finish(&k, &c);

        /* A header cut by the end of the region: the capacity (bytes 2 and 3) is outside memory. */
        case_init(&k, "string", "STRCPY destination capacity outside memory");
        case_string(&k, 0x2000U, 16U, "Hello");
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x2000U); c_push(&c, 0x4FFEU); c_op(&c, OP_STRCPY);
        finish(&k, &c);
        case_init(&k, "string", "STRCAT destination capacity outside memory");
        case_string(&k, 0x2000U, 16U, "Hello");
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x2000U); c_push(&c, 0x4FFEU); c_op(&c, OP_STRCAT);
        finish(&k, &c);
        case_init(&k, "string", "STRCAT source length outside memory");
        case_string(&k, dst_in_work, 16U, "xyz");
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x5000U); c_push(&c, dst_in_work); c_op(&c, OP_STRCAT);
        finish(&k, &c);
        case_init(&k, "string", "STRCMP first length outside memory");
        case_string(&k, dst_in_work, 16U, "xyz");
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x5000U); c_push(&c, dst_in_work); c_op(&c, OP_STRCMP);
        finish(&k, &c);

        /* STRCMP: a character of either string unreadable; with a zero length nothing is read. */
        case_init(&k, "string", "STRCMP first string's character outside memory");
        case_poke(&k, edge, header_len3_cap3, 4);
        case_string(&k, dst_in_work, 16U, "abc");
        memset(&c, 0, sizeof(c));
        c_push(&c, edge); c_push(&c, dst_in_work); c_op(&c, OP_STRCMP);
        finish(&k, &c);
        case_init(&k, "string", "STRCMP second string's character outside memory");
        case_string(&k, 0x2000U, 16U, "abc");
        case_poke(&k, edge, header_len3_cap3, 4);
        memset(&c, 0, sizeof(c));
        c_push(&c, 0x2000U); c_push(&c, edge); c_op(&c, OP_STRCMP);
        finish(&k, &c);
        case_init(&k, "string", "STRCMP of two strings with zero length reads no character");
        case_poke(&k, edge, header_len2_cap0, 4);
        case_string(&k, dst_in_work, 16U, "");
        memset(&c, 0, sizeof(c));
        c_push(&c, dst_in_work); c_push(&c, dst_in_work); c_op(&c, OP_STRCMP);
        finish(&k, &c);
    }
}

static void family_conversion(void)
{
    /* Integer to float and back, the conversions are in the integer and float families too. */
    static const uint32_t roundtrip[] = { 0U, 1U, 0xFFFFFFFFU, 16777217U, 0x7FFFFFFFU, 0x80000000U };
    case_t k;
    code_t c;
    unsigned i;

    for (i = 0; i < sizeof(roundtrip) / sizeof(roundtrip[0]); i++) {
        case_init(&k, "conversion", "I2F then F2I");
        memset(&c, 0, sizeof(c));
        c_push(&c, roundtrip[i]);
        c_op(&c, OP_I2F);
        c_op(&c, OP_F2I);
        finish(&k, &c);
    }
}

static void family_control(void)
{
    case_t k;
    code_t c;
    unsigned i;

    /* JR forward over an instruction. */
    case_init(&k, "control", "JR forward");
    memset(&c, 0, sizeof(c));
    c_op8(&c, OP_PUSH8, 1); c_op8(&c, OP_JR, 2); c_op8(&c, OP_PUSH8, 99); c_op8(&c, OP_PUSH8, 2);
    finish(&k, &c);

    /* JR to itself with a budget: a WATCHDOG fault. */
    case_init(&k, "control", "JR -2 loops until the budget");
    k.budget = 25U;
    memset(&c, 0, sizeof(c));
    c_op8(&c, OP_JR, 0xFEU);
    run_case(&k, &c);

    /* JR out of the code, before 0: the program counter wraps at 16 bits and the next fetch faults. */
    case_init(&k, "control", "JR before the start");
    memset(&c, 0, sizeof(c));
    c_op8(&c, OP_JR, 0xF0U);
    run_case(&k, &c);

    /* JRZ and JRNZ, taken and not taken, forward. */
    for (i = 0; i < 4U; i++) {
        const uint8_t op = (i & 1U) ? OP_JRNZ : OP_JRZ;
        const uint8_t cond = (i & 2U) ? 5U : 0U;

        case_init(&k, "control", g_info[op].name);
        memset(&c, 0, sizeof(c));
        c_op8(&c, OP_PUSH8, cond); c_op8(&c, op, 2); c_op8(&c, OP_PUSH8, 99); c_op8(&c, OP_PUSH8, 2);
        finish(&k, &c);
    }
    /* JRNZ backwards: a countdown loop. */
    case_init(&k, "control", "JRNZ backward countdown");
    memset(&c, 0, sizeof(c));
    c_op8(&c, OP_PUSH8, 3);       /* 0 */
    c_op8(&c, OP_PUSH8, 1);       /* 2 */
    c_op(&c, OP_SUB);             /* 4 */
    c_op(&c, OP_DUP);             /* 5 */
    c_op8(&c, OP_JRNZ, 0xFAU);    /* 6: back to 2 */
    finish(&k, &c);

    /* JMP, JZ, JNZ. */
    case_init(&k, "control", "JMP forward");
    memset(&c, 0, sizeof(c));
    c_op16(&c, OP_JMP, 5U); c_op8(&c, OP_PUSH8, 99); /* 0: JMP 5, 3: PUSH8 99 skipped */
    c_op8(&c, OP_PUSH8, 7);                          /* 5 */
    finish(&k, &c);
    for (i = 0; i < 4U; i++) {
        const uint8_t op = (i & 1U) ? OP_JNZ : OP_JZ;
        const uint8_t cond = (i & 2U) ? 5U : 0U;

        case_init(&k, "control", g_info[op].name);
        memset(&c, 0, sizeof(c));
        c_op8(&c, OP_PUSH8, cond);      /* 0 */
        c_op16(&c, op, 7U);             /* 2 */
        c_op8(&c, OP_PUSH8, 99);        /* 5 */
        c_op8(&c, OP_PUSH8, 2);         /* 7 */
        finish(&k, &c);
    }
    case_init(&k, "control", "JMP beyond the code faults at the next fetch");
    memset(&c, 0, sizeof(c));
    c_op16(&c, OP_JMP, 0x4000U);
    run_case(&k, &c);
    case_init(&k, "control", "JMP 0 loops until the budget");
    k.budget = 40U;
    memset(&c, 0, sizeof(c));
    c_op16(&c, OP_JMP, 0U);
    run_case(&k, &c);

    /* CALL and RET: one level, nested, and RET with nothing to return to. */
    case_init(&k, "control", "CALL and RET");
    memset(&c, 0, sizeof(c));
    c_op16(&c, OP_CALL, 4U);      /* 0 */
    c_op(&c, OP_HALT);            /* 3 */
    c_op8(&c, OP_PUSH8, 7);       /* 4 */
    c_op(&c, OP_RET);             /* 6 */
    run_case(&k, &c);
    case_init(&k, "control", "nested CALL");
    memset(&c, 0, sizeof(c));
    c_op16(&c, OP_CALL, 4U);      /* 0 */
    c_op(&c, OP_HALT);            /* 3 */
    c_op16(&c, OP_CALL, 9U);      /* 4 */
    c_op(&c, OP_RET);             /* 7 */
    c_op(&c, OP_NOP);             /* 8 */
    c_op8(&c, OP_PUSH8, 1);       /* 9 */
    c_op(&c, OP_RET);             /* 11 */
    run_case(&k, &c);
    case_init(&k, "control", "RET with an empty call stack ends the scan");
    memset(&c, 0, sizeof(c));
    c_op8(&c, OP_PUSH8, 1); c_op(&c, OP_RET);
    run_case(&k, &c);
    case_init(&k, "control", "CALL to itself overflows the call stack");
    k.budget = 500U;
    memset(&c, 0, sizeof(c));
    c_op16(&c, OP_CALL, 0U);
    run_case(&k, &c);
    case_init(&k, "control", "CALL depth of exactly the maximum");
    memset(&c, 0, sizeof(c));
    for (i = 0; i < ZPLC_CALL_STACK_MAX; i++) {
        c_op16(&c, OP_CALL, (uint16_t)(3U * (i + 1U)));
    }
    c_op(&c, OP_HALT);
    run_case(&k, &c);
}

static void family_comm(void)
{
    static const uint16_t bases[] = { 0x1100U, 0x2100U, 0x3FF0U, 0x4100U };
    static const uint8_t ops[] = { OP_COMM_EXEC, OP_COMM_STATUS, OP_COMM_RESET };
    static const uint32_t kinds[] = { KIND_OK, KIND_FAIL, KIND_NONE };
    case_t k;
    code_t c;
    unsigned o;
    unsigned b;
    unsigned kd;
    unsigned st;

    for (o = 0; o < sizeof(ops); o++) {
        for (b = 0; b < sizeof(bases) / sizeof(bases[0]); b++) {
            for (kd = 0; kd < 3U; kd++) {
                /* EN set / clear, BUSY set / clear, a STATUS word to read back. */
                for (st = 0; st < 4U; st++) {
                    case_init(&k, "comm", g_info[ops[o]].name);
                    case_fb(&k, bases[b], (uint8_t)(st & 1U), (uint8_t)((st >> 1) & 1U), 1U, 1U, 0x78563412U);
                    memset(&c, 0, sizeof(c));
                    c_push(&c, bases[b]);
                    c_op32(&c, ops[o], kinds[kd]);
                    finish(&k, &c);
                }
            }
        }
        /* The block is not in a writable or readable place. */
        {
            static const uint16_t bad[] = { 0x5000U, 0xFFF8U, 0x3FFCU };
            for (b = 0; b < 3U; b++) {
                case_init(&k, "comm", g_info[ops[o]].name);
                memset(&c, 0, sizeof(c));
                c_push(&c, bad[b]);
                c_op32(&c, ops[o], KIND_OK);
                finish(&k, &c);
            }
        }
        /* The kind is not one the core dispatches: NONE, the limit, a wide value. */
        {
            static const uint32_t bad_kinds[] = { 0U, ZPLC_COMM_FB_KIND_MAX, 0x7FFFFFFFU, 0xFFFFFFFFU };
            for (kd = 0; kd < 4U; kd++) {
                case_init(&k, "comm", g_info[ops[o]].name);
                memset(&c, 0, sizeof(c));
                c_push(&c, 0x2100U);
                c_op32(&c, ops[o], bad_kinds[kd]);
                finish(&k, &c);
            }
        }
    }
}

/* Generated from the table: stack underflow, stack overflow, truncated operand, bytes that are not opcodes. */
static void generated_operand(code_t *c, uint8_t op)
{
    switch (g_info[op].operand) {
    case 1U:
        c_op8(c, op, op == OP_PUSH8 ? 1U : 0U);
        break;
    case 2U:
        if (op >= OP_LOAD8 && op <= OP_STORE64) {
            c_op16(c, op, ZPLC_MEM_WORK_BASE);
        } else if (op == OP_JMP || op == OP_JZ || op == OP_JNZ || op == OP_CALL) {
            c_op16(c, op, (uint16_t)(c->n + 3U)); /* the next instruction */
        } else {
            c_op16(c, op, 1U);
        }
        break;
    case 4U:
        c_op32(c, op, op >= OP_COMM_EXEC ? (uint32_t)KIND_OK : 1U);
        break;
    default:
        c_op(c, op);
        break;
    }
}

static void family_generated(void)
{
    case_t k;
    code_t c;
    unsigned op;
    unsigned i;

    for (op = 0; op < 256U; op++) {
        if (!g_info[op].present) {
            /* Not an opcode: the VM faults on it, whatever follows. */
            case_init(&k, "generated-unknown", "byte that is not an opcode");
            k.expect_error = ZPLC_VM_INVALID_OPCODE;
            k.expect_pc = 0;
            memset(&c, 0, sizeof(c));
            c_byte(&c, (uint8_t)op);
            c_op(&c, OP_NOP); c_op(&c, OP_NOP); c_op(&c, OP_NOP); c_op(&c, OP_NOP);
            c_op(&c, OP_HALT);
            run_case(&k, &c);
            continue;
        }
        if (g_info[op].min_depth > 0U) {
            /* One word short of the minimum depth. */
            case_init(&k, "generated-underflow", g_info[op].name);
            k.expect_error = ZPLC_VM_STACK_UNDERFLOW;
            memset(&c, 0, sizeof(c));
            for (i = 0; i + 1U < g_info[op].min_depth; i++) {
                c_op8(&c, OP_PUSH8, 1);
            }
            k.expect_pc = (int)c.n;
            generated_operand(&c, (uint8_t)op);
            c_op(&c, OP_HALT);
            run_case(&k, &c);
        }
        if (g_info[op].pushes > g_info[op].pops) {
            /* A full evaluation stack: pushing one more is a fault. */
            case_init(&k, "generated-overflow", g_info[op].name);
            k.expect_error = ZPLC_VM_STACK_OVERFLOW;
            memset(&c, 0, sizeof(c));
            for (i = 0; i < ZPLC_STACK_MAX_DEPTH; i++) {
                c_op8(&c, OP_PUSH8, 1);
            }
            k.expect_pc = (int)c.n;
            generated_operand(&c, (uint8_t)op);
            c_op(&c, OP_HALT);
            run_case(&k, &c);
        }
        if (g_info[op].operand > 0U) {
            /* The code ends inside the operand. */
            case_init(&k, "generated-truncated", g_info[op].name);
            k.expect_error = ZPLC_VM_INVALID_JUMP;
            memset(&c, 0, sizeof(c));
            for (i = 0; i < g_info[op].min_depth; i++) {
                c_op8(&c, OP_PUSH8, 1);
            }
            for (i = 0; i < 5U; i++) {
                c_op(&c, OP_NOP);
            }
            k.expect_pc = (int)c.n;
            c_byte(&c, (uint8_t)op);
            for (i = 1U; i < g_info[op].operand; i++) {
                c_byte(&c, 0U);
            }
            run_case(&k, &c);
        }
    }
}

/* ============================================================================
 * Checks of the model against results worked out by hand, then the ledger
 * ============================================================================
 */

static uint32_t model_run_top(const uint8_t *code, size_t len, int *error)
{
    uint8_t last;

    memset(&g_model, 0, sizeof(g_model));
    (void)ref_run(&g_model, code, (uint32_t)len, 1000U, 0U, &last);
    *error = g_model.error;
    return g_model.sp > 0U ? g_model.stack[g_model.sp - 1U] : 0xDEADDEADU;
}

static void model_anchor(const char *name, uint8_t op, uint32_t a, uint32_t b, int binary, uint32_t expect)
{
    code_t c;
    int error;
    uint32_t got;

    memset(&c, 0, sizeof(c));
    c_push(&c, a);
    if (binary) {
        c_push(&c, b);
    }
    c_op(&c, op);
    c_op(&c, OP_HALT);
    got = model_run_top(c.b, c.n, &error);
    CHECK(error == ZPLC_VM_HALTED && got == expect, name);
}

static void model_selftest(void)
{
    model_anchor("anchor ADD 2 + 3 = 5", OP_ADD, 2U, 3U, 1, 5U);
    model_anchor("anchor SUB 2 - 3 = -1", OP_SUB, 2U, 3U, 1, 0xFFFFFFFFU);
    model_anchor("anchor MUL -3 * 4 = -12", OP_MUL, 0xFFFFFFFDU, 4U, 1, 0xFFFFFFF4U);
    model_anchor("anchor DIV -7 / 2 = -3", OP_DIV, 0xFFFFFFF9U, 2U, 1, 0xFFFFFFFDU);
    model_anchor("anchor MOD -7 MOD 3 = -1", OP_MOD, 0xFFFFFFF9U, 3U, 1, 0xFFFFFFFFU);
    model_anchor("anchor DIV INT_MIN / -1 = INT_MIN", OP_DIV, 0x80000000U, 0xFFFFFFFFU, 1, 0x80000000U);
    model_anchor("anchor NEG INT_MIN = INT_MIN", OP_NEG, 0x80000000U, 0U, 0, 0x80000000U);
    model_anchor("anchor ABS -5 = 5", OP_ABS, 0xFFFFFFFBU, 0U, 0, 5U);
    model_anchor("anchor SHL 1 << 31", OP_SHL, 1U, 31U, 1, 0x80000000U);
    model_anchor("anchor SHL 1 << 32 = 0", OP_SHL, 1U, 32U, 1, 0U);
    model_anchor("anchor SHR 0x80000000 >> 31 = 1", OP_SHR, 0x80000000U, 31U, 1, 1U);
    model_anchor("anchor SAR -8 >> 1 = -4", OP_SAR, 0xFFFFFFF8U, 1U, 1, 0xFFFFFFFCU);
    model_anchor("anchor SAR -1 >> 40 = -1", OP_SAR, 0xFFFFFFFFU, 40U, 1, 0xFFFFFFFFU);
    model_anchor("anchor LT signed -1 < 0", OP_LT, 0xFFFFFFFFU, 0U, 1, 1U);
    model_anchor("anchor LTU unsigned 0xFFFFFFFF < 0", OP_LTU, 0xFFFFFFFFU, 0U, 1, 0U);
    model_anchor("anchor EXT8 0x80 = -128", OP_EXT8, 0x80U, 0U, 0, 0xFFFFFF80U);
    model_anchor("anchor ZEXT16 0x12345678 = 0x5678", OP_ZEXT16, 0x12345678U, 0U, 0, 0x5678U);
    model_anchor("anchor ADDF 1.0 + 3.5 = 4.5", OP_ADDF, 0x3F800000U, 0x40600000U, 1, 0x40900000U);
    model_anchor("anchor F2I 3.5 = 3", OP_F2I, 0x40600000U, 0U, 0, 3U);
    model_anchor("anchor F2I -1.5 = -1", OP_F2I, 0xBFC00000U, 0U, 0, 0xFFFFFFFFU);
    model_anchor("anchor F2I NaN = 0", OP_F2I, 0x7FC00000U, 0U, 0, 0U);
    model_anchor("anchor F2I 2^31 = INT_MAX", OP_F2I, 0x4F000000U, 0U, 0, 0x7FFFFFFFU);
    model_anchor("anchor I2F 3 = 3.0", OP_I2F, 3U, 0U, 0, 0x40400000U);
    model_anchor("anchor ABSF -1.5 = 1.5", OP_ABSF, 0xBFC00000U, 0U, 0, 0x3FC00000U);
    model_anchor("anchor NEGF 1.0 = -1.0", OP_NEGF, 0x3F800000U, 0U, 0, 0xBF800000U);
}

/* What every opcode must show, from its row of the table. A new opcode lands here. */
static void check_ledger(void)
{
    unsigned op;
    unsigned covered = 0;

    for (op = 0; op < 256U; op++) {
        const op_info_t *info = &g_info[op];
        char what[96];

        if (!info->present) {
            continue;
        }
        snprintf(what, sizeof(what), "%s is executed to completion by a passing case", info->name);
        CHECK(g_completed[op] > 0U, what);
        if (g_completed[op] > 0U) {
            covered++;
        }
        if (info->min_depth > 0U) {
            snprintf(what, sizeof(what), "%s underflow of the evaluation stack is observed", info->name);
            CHECK(g_fault[op][ZPLC_VM_STACK_UNDERFLOW] > 0U, what);
        }
        if (info->pushes > info->pops) {
            snprintf(what, sizeof(what), "%s overflow of the evaluation stack is observed", info->name);
            CHECK(g_fault[op][ZPLC_VM_STACK_OVERFLOW] > 0U, what);
        }
        if (info->operand > 0U) {
            snprintf(what, sizeof(what), "%s truncated operand is observed", info->name);
            CHECK(g_fault[op][ZPLC_VM_INVALID_JUMP] > 0U, what);
        }
    }
    CHECK(covered == ZPLC_OPCODE_COUNT, "every opcode of the table is executed to completion");

#define NEEDS_FAULT(opcode, code, text) do { \
        char what[96]; \
        snprintf(what, sizeof(what), "%s " text, g_info[opcode].name); \
        CHECK(g_fault[opcode][code] > 0U, what); \
    } while (0)
    NEEDS_FAULT(OP_DIV, ZPLC_VM_DIV_BY_ZERO, "division by zero is observed");
    NEEDS_FAULT(OP_MOD, ZPLC_VM_DIV_BY_ZERO, "modulo by zero is observed");
    NEEDS_FAULT(OP_DIVF, ZPLC_VM_DIV_BY_ZERO, "division by zero is observed");
    NEEDS_FAULT(OP_LOADI8, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds read is observed");
    NEEDS_FAULT(OP_LOADI16, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds read is observed");
    NEEDS_FAULT(OP_LOADI32, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds read is observed");
    NEEDS_FAULT(OP_STOREI8, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds write is observed");
    NEEDS_FAULT(OP_STOREI16, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds write is observed");
    NEEDS_FAULT(OP_STOREI32, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds write is observed");
    NEEDS_FAULT(OP_LOAD8, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds read is observed");
    NEEDS_FAULT(OP_LOAD16, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds read is observed");
    NEEDS_FAULT(OP_LOAD32, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds read is observed");
    NEEDS_FAULT(OP_LOAD64, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds read is observed");
    NEEDS_FAULT(OP_STORE8, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds write is observed");
    NEEDS_FAULT(OP_STORE16, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds write is observed");
    NEEDS_FAULT(OP_STORE32, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds write is observed");
    NEEDS_FAULT(OP_STORE64, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds write is observed");
    NEEDS_FAULT(OP_STRLEN, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds read is observed");
    NEEDS_FAULT(OP_STRCPY, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds access is observed");
    NEEDS_FAULT(OP_STRCAT, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds access is observed");
    NEEDS_FAULT(OP_STRCMP, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds read is observed");
    NEEDS_FAULT(OP_STRCLR, ZPLC_VM_OUT_OF_BOUNDS, "out-of-bounds write is observed");
    NEEDS_FAULT(OP_CALL, ZPLC_VM_CALL_OVERFLOW, "call stack overflow is observed");
    NEEDS_FAULT(OP_COMM_EXEC, ZPLC_VM_OUT_OF_BOUNDS, "block outside memory is observed");
    NEEDS_FAULT(OP_COMM_STATUS, ZPLC_VM_OUT_OF_BOUNDS, "block outside memory is observed");
    NEEDS_FAULT(OP_COMM_RESET, ZPLC_VM_OUT_OF_BOUNDS, "block outside memory is observed");
    NEEDS_FAULT(OP_COMM_EXEC, ZPLC_VM_INVALID_OPCODE, "kind that is not dispatched is observed");
    NEEDS_FAULT(OP_COMM_STATUS, ZPLC_VM_INVALID_OPCODE, "kind that is not dispatched is observed");
    NEEDS_FAULT(OP_COMM_RESET, ZPLC_VM_INVALID_OPCODE, "kind that is not dispatched is observed");
#undef NEEDS_FAULT
}

/* BREAK then resume continues after the BREAK with the stack intact. */
static void test_break_resume(void)
{
    static const uint8_t code[] = { OP_PUSH8, 1U, OP_BREAK, OP_PUSH8, 2U, OP_HALT };
    zplc_vm_t *vm;

    zplc_core_init();
    CHECK(zplc_test_load_raw(code, sizeof(code)) == 0, "BREAK program loads");
    vm = zplc_core_get_default_vm();
    CHECK(zplc_vm_run_bounded(vm, 100U) == 1, "BREAK stops after one instruction");
    CHECK(vm->paused == 1U && vm->error == ZPLC_VM_PAUSED && vm->pc == 3U, "BREAK pauses past itself");
    CHECK(zplc_vm_resume(vm) == 0, "resume succeeds");
    CHECK(zplc_vm_run_bounded(vm, 100U) == 1, "resume runs the rest");
    CHECK(vm->halted == 1U && vm->error == ZPLC_VM_HALTED && vm->sp == 2U && vm->stack[0] == 1U && vm->stack[1] == 2U,
          "the stack survives the pause");
}

/* The guards in front of the dispatch: a missing VM, a missing code pointer, a halted or paused VM. */
static void test_step_guards(void)
{
    static const uint8_t code[] = { OP_BREAK, OP_PUSH8, 1U, OP_HALT };
    zplc_vm_t *vm;

    CHECK(zplc_vm_step(NULL) == ZPLC_VM_INVALID_OPCODE, "stepping no VM is a fault, not a crash");

    zplc_core_init();
    CHECK(zplc_test_load_raw(code, sizeof(code)) == 0, "guard program loads");
    vm = zplc_core_get_default_vm();
    CHECK(zplc_vm_step(vm) == ZPLC_VM_PAUSED && vm->paused == 1U, "BREAK pauses the step");
    CHECK(zplc_vm_step(vm) == ZPLC_VM_PAUSED && vm->pc == 1U, "a paused VM does not execute");
    CHECK(zplc_vm_resume(vm) == 0 && zplc_vm_step(vm) == ZPLC_VM_OK && vm->sp == 1U, "resume continues");
    CHECK(zplc_vm_step(vm) == ZPLC_VM_HALTED && vm->halted == 1U, "HALT halts the step");
    CHECK(zplc_vm_step(vm) == ZPLC_VM_HALTED && vm->pc == 4U && vm->sp == 1U, "a halted VM does not execute");

    zplc_core_init();
    CHECK(zplc_test_load_raw(code, sizeof(code)) == 0, "guard program loads again");
    vm = zplc_core_get_default_vm();
    vm->code = NULL;
    CHECK(zplc_vm_step(vm) == ZPLC_VM_INVALID_OPCODE && vm->halted == 1U, "no code is a fault");

    zplc_core_init();
    CHECK(zplc_test_load_raw(code, sizeof(code)) == 0, "guard program loads a third time");
    vm = zplc_core_get_default_vm();
    vm->sp = (uint16_t)(vm->stack_limit + 1U);
    CHECK(zplc_vm_step(vm) == ZPLC_VM_STACK_OVERFLOW && vm->halted == 1U, "a stack above its limit is a fault");
}

/* -v: one line per opcode of the table with what the passing cases showed. */
static void print_ledger(void)
{
    unsigned op;

    printf("%-12s %-5s %9s  faults observed (error code: count)\n", "opcode", "code", "completed");
    for (op = 0; op < 256U; op++) {
        unsigned e;

        if (!g_info[op].present) {
            continue;
        }
        printf("%-12s 0x%02X  %9u ", g_info[op].name, op, g_completed[op]);
        for (e = 1; e < 16U; e++) {
            if (g_fault[op][e] > 0U) {
                printf(" %u:%u", e, g_fault[op][e]);
            }
        }
        printf("\n");
    }
}

int main(int argc, char **argv)
{
    load_table();
    CHECK(zplc_comm_register_handler(KIND_OK, handler_ok) == 0, "install the OK handler");
    CHECK(zplc_comm_register_handler(KIND_FAIL, handler_fail) == 0, "install the failing handler");
    model_selftest();

    family_system();
    family_stack();
    family_integer_and_logic();
    family_float();
    family_push();
    family_memory();
    family_string();
    family_conversion();
    family_control();
    family_comm();
    family_generated();
    test_break_resume();
    test_step_guards();
    check_ledger();
    if (argc > 1 && strcmp(argv[1], "-v") == 0) {
        print_ledger();
    }

    printf("opcode coverage: %u opcodes in the table, %u cases, %u checks, %u failures\n",
           (unsigned)ZPLC_OPCODE_COUNT, case_count, check_count, fail_count);
    return fail_count == 0U ? 0 : 1;
}
