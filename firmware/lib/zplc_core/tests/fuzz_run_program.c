/**
 * @file fuzz_run_program.c
 * @brief libFuzzer target that loads and RUNS artifacts the loader accepts (VF-014).
 *
 * SPDX-License-Identifier: MIT
 *
 * Where the loader fuzzer asks "can a hostile file get past or crash the
 * verifier", this target asks what the verifier cannot: "can a file the
 * verifier ACCEPTS make the runtime misbehave". Each accepted artifact is
 * loaded the way the runtimes load it (zplc_core_load or zplc_core_load_tasks,
 * one VM per task with its declared stack limit, set_entry on the rest of the
 * code), the process image and work memory are filled with pseudo-random
 * bytes derived from the input, and a few scans are run with the production
 * scan entry point (zplc_vm_run_cycle, with a smaller instruction budget so a
 * loop costs microseconds), including breakpoints and resume.
 *
 * Inputs
 * ------
 * The input is a .zplc container. The seed corpus is what the repository
 * compiler produces for every example project and conformance case. Two
 * pieces make most mutated inputs worth running:
 *  - the custom mutator decodes the CODE segment into an instruction list
 *    with jump targets as instruction indices, edits that list (replace an
 *    opcode, insert, delete, swap, duplicate a run, retarget a jump, change
 *    an immediate or a communication kind), re-encodes it with every offset
 *    and jump recomputed, rebuilds the segment table, sizes and CRC;
 *  - an input that is not an accepted container is read as a byte program:
 *    each byte selects an opcode of the contract table, operands follow, and
 *    the result is wrapped in a container. Any byte string is a program.
 *
 * Environment: ZPLC_FUZZ_SKIP_COMM=1 leaves out programs that use the communication opcodes (a known gap while
 * RT-001/COM-001 are open, so that a long run can look for other findings); ZPLC_FUZZ_DUMP=<path> writes the
 * container that is about to run, which turns a byte program into a file the other tools can read.
 *
 * Invariants (a violation aborts, the input is the reproducer)
 * ------------------------------------------------------------
 *  - no sanitizer report (address, undefined behaviour, float-cast-overflow);
 *  - a scan ends in a defined state: paused at a breakpoint, halted
 *    normally, or halted with one fault code of zplc_vm_error_t, and the
 *    return value agrees with it;
 *  - the evaluation stack and call stack stay within their limits;
 *  - the VM never writes the input image, the code, the tag table or the
 *    force table, and a halted VM stays halted;
 *  - the program counter of a VM that stopped without a fault lies in the
 *    code.
 */

#include "fuzz_common.h"

#include <zplc_comm_dispatch.h>
#include <zplc_core.h>
#include <zplc_hal_posix.h>

#define FZ_MAX_INPUT 6144U /* the largest seed (the kitchen_sink example) is 4148 bytes */
#define FZ_FILE_CAP 8192U
#define FZ_MAX_INSNS 600U

/* ============================================================================
 * Instruction list: decode, mutate, encode
 * ============================================================================
 */

typedef struct {
    uint8_t op;
    uint32_t imm;    /* operand as encoded; PUSH value, address, or raw jump operand */
    int32_t tgt;     /* instruction index a jump or call goes to, or -1: keep imm */
    uint32_t origin; /* byte offset in the input code, or 0xFFFFFFFF when inserted */
} fz_insn_t;

static int fz_is_relative(uint8_t op) { return op == OP_JR || op == OP_JRZ || op == OP_JRNZ; }
static int fz_is_absolute(uint8_t op) { return op == OP_JMP || op == OP_JZ || op == OP_JNZ || op == OP_CALL; }
static int fz_is_memory(uint8_t op) { return op >= OP_LOAD8 && op <= OP_STORE64; }
static int fz_is_comm(uint8_t op) { return op == OP_COMM_EXEC || op == OP_COMM_STATUS || op == OP_COMM_RESET; }

static int fz_decode(const uint8_t *code, size_t size, fz_insn_t *ins, uint32_t *offs, size_t cap, size_t *count)
{
    size_t pc = 0;
    size_t n = 0;
    size_t i;

    while (pc < size) {
        const uint8_t op = code[pc];
        uint8_t width;

        if (n >= cap || !zplc_opcode_is_valid(op)) {
            return 0;
        }
        width = zplc_opcode_operand_size(op);
        if ((size_t)width > size - pc - 1U) {
            return 0;
        }
        ins[n].op = op;
        ins[n].tgt = -1;
        ins[n].origin = (uint32_t)pc;
        ins[n].imm = width == 1U ? code[pc + 1U]
                   : width == 2U ? fz_get16(code + pc + 1U)
                   : width == 4U ? fz_get32(code + pc + 1U) : 0U;
        offs[n] = (uint32_t)pc;
        n++;
        pc += 1U + width;
    }
    offs[n] = (uint32_t)pc;
    for (i = 0; i < n; i++) {
        int64_t target = -1;
        size_t j;

        if (fz_is_absolute(ins[i].op)) {
            target = (int64_t)ins[i].imm;
        } else if (fz_is_relative(ins[i].op)) {
            target = (int64_t)offs[i] + 2 + (int64_t)(int8_t)(uint8_t)ins[i].imm;
        }
        if (target < 0) {
            continue;
        }
        for (j = 0; j < n; j++) {
            if ((int64_t)offs[j] == target) {
                ins[i].tgt = (int32_t)j;
                break;
            }
        }
    }
    *count = n;
    return 1;
}

static uint8_t fz_long_form(uint8_t op)
{
    return op == OP_JR ? OP_JMP : (op == OP_JRZ ? OP_JZ : OP_JNZ);
}

/* Lay the instructions out, widening a short jump that no longer reaches. Returns the code length or 0. */
static size_t fz_encode(fz_insn_t *ins, size_t n, uint8_t *out, size_t cap, uint32_t *offs)
{
    static uint8_t widened[FZ_MAX_INSNS];
    size_t round;
    size_t i;
    size_t pos;

    memset(widened, 0, n);
    for (i = 0; i < n; i++) {
        if (ins[i].tgt >= (int32_t)n) {
            ins[i].tgt = (int32_t)n - 1;
        }
    }
    for (round = 0; round < 16U; round++) {
        int changed = 0;

        pos = 0;
        for (i = 0; i < n; i++) {
            offs[i] = (uint32_t)pos;
            pos += 1U + (widened[i] ? 2U : zplc_opcode_operand_size(ins[i].op));
        }
        offs[n] = (uint32_t)pos;
        for (i = 0; i < n; i++) {
            if (fz_is_relative(ins[i].op) && ins[i].tgt >= 0 && !widened[i]) {
                const int64_t delta = (int64_t)offs[ins[i].tgt] - (int64_t)(offs[i] + 2U);

                if (delta < -128 || delta > 127) {
                    widened[i] = 1;
                    changed = 1;
                }
            }
        }
        if (!changed) {
            break;
        }
        if (round == 15U) {
            return 0;
        }
    }
    if (pos > cap || pos > 0xFFFFU) {
        return 0;
    }
    for (i = 0; i < n; i++) {
        uint8_t *p = out + offs[i];
        const fz_insn_t *in = &ins[i];

        if (widened[i]) {
            p[0] = fz_long_form(in->op);
            fz_put16(p + 1, (uint16_t)offs[in->tgt]);
        } else if (fz_is_relative(in->op) && in->tgt >= 0) {
            p[0] = in->op;
            p[1] = (uint8_t)((int64_t)offs[in->tgt] - (int64_t)(offs[i] + 2U));
        } else if (fz_is_absolute(in->op) && in->tgt >= 0) {
            p[0] = in->op;
            fz_put16(p + 1, (uint16_t)offs[in->tgt]);
        } else {
            const uint8_t width = zplc_opcode_operand_size(in->op);

            p[0] = in->op;
            if (width == 1U) {
                p[1] = (uint8_t)in->imm;
            } else if (width == 2U) {
                fz_put16(p + 1, (uint16_t)in->imm);
            } else if (width == 4U) {
                fz_put32(p + 1, in->imm);
            }
        }
    }
    return pos;
}

/* ============================================================================
 * Container: parse, rebuild
 * ============================================================================
 */

typedef struct {
    uint16_t type;
    uint16_t flags;
    uint32_t size;
    size_t offset;
} fz_segment_t;

#define FZ_MAX_SEGMENTS 8U

typedef struct {
    uint8_t header[ZPLC_FILE_HEADER_SIZE];
    fz_segment_t segment[FZ_MAX_SEGMENTS];
    unsigned count;
} fz_container_t;

static int fz_parse(const uint8_t *data, size_t size, fz_container_t *c)
{
    uint16_t count;
    size_t offset;
    unsigned i;

    if (size < ZPLC_FILE_HEADER_SIZE || fz_get32(data) != ZPLC_MAGIC) {
        return 0;
    }
    count = fz_get16(data + 26);
    if (count == 0U || count > FZ_MAX_SEGMENTS || ZPLC_FILE_HEADER_SIZE + (size_t)count * ZPLC_SEGMENT_ENTRY_SIZE > size) {
        return 0;
    }
    memcpy(c->header, data, ZPLC_FILE_HEADER_SIZE);
    c->count = count;
    offset = ZPLC_FILE_HEADER_SIZE + (size_t)count * ZPLC_SEGMENT_ENTRY_SIZE;
    for (i = 0; i < count; i++) {
        const uint8_t *entry = data + ZPLC_FILE_HEADER_SIZE + (size_t)i * ZPLC_SEGMENT_ENTRY_SIZE;

        c->segment[i].type = fz_get16(entry);
        c->segment[i].flags = fz_get16(entry + 2);
        c->segment[i].size = fz_get32(entry + 4);
        if (c->segment[i].size > size - offset) {
            return 0;
        }
        c->segment[i].offset = offset;
        offset += c->segment[i].size;
    }
    return 1;
}

/* Map an old byte offset of the code to the new offset of the instruction that came from it. */
static uint32_t fz_remap(uint32_t old_offset, const fz_insn_t *ins, size_t n, const uint32_t *offs)
{
    size_t i;

    for (i = 0; i < n; i++) {
        if (ins[i].origin == old_offset) {
            return offs[i];
        }
    }
    return 0U;
}

/* Write the container with a new CODE segment; TASK entry points follow the instructions they named. */
static size_t fz_build(const fz_container_t *c, const uint8_t *input, const uint8_t *code, size_t code_len,
                       const fz_insn_t *ins, size_t n, const uint32_t *offs, uint8_t *out, size_t cap)
{
    size_t pos = ZPLC_FILE_HEADER_SIZE + (size_t)c->count * ZPLC_SEGMENT_ENTRY_SIZE;
    uint64_t others = 0;
    unsigned i;

    memcpy(out, c->header, ZPLC_FILE_HEADER_SIZE);
    for (i = 0; i < c->count; i++) {
        const fz_segment_t *s = &c->segment[i];
        uint8_t *entry = out + ZPLC_FILE_HEADER_SIZE + (size_t)i * ZPLC_SEGMENT_ENTRY_SIZE;
        const int is_code = s->type == ZPLC_SEG_CODE;
        const size_t size = is_code ? code_len : s->size;

        if (size > cap - pos) {
            return 0;
        }
        fz_put16(entry, s->type);
        fz_put16(entry + 2, s->flags);
        fz_put32(entry + 4, (uint32_t)size);
        if (is_code) {
            memcpy(out + pos, code, size);
        } else {
            memcpy(out + pos, input + s->offset, size);
            if (s->type == ZPLC_SEG_TASK) {
                size_t t;

                for (t = 0; t + ZPLC_TASK_DEF_SIZE <= size; t += ZPLC_TASK_DEF_SIZE) {
                    fz_put16(out + pos + t + 8U,
                             (uint16_t)fz_remap(fz_get16(out + pos + t + 8U), ins, n, offs));
                }
            }
            others += size;
        }
        pos += size;
    }
    fz_put32(out + 16, (uint32_t)code_len);
    fz_put32(out + 20, (uint32_t)others);
    fz_put16(out + 24, (uint16_t)fz_remap(fz_get16(c->header + 24), ins, n, offs));
    fz_repair_crc(out, pos);
    return pos;
}

/* ============================================================================
 * Mutations of the instruction list
 * ============================================================================
 */

static const uint32_t FZ_INTERESTING[] = {
    0x00000000U, 0x00000001U, 0x00000002U, 0x00000003U, 0x00000007U, 0x0000001FU, 0x00000020U, 0x0000007FU,
    0x00000080U, 0x000000FFU, 0x00000100U, 0x00000FF0U, 0x00000FFCU, 0x00000FFFU, 0x00001000U, 0x00001100U,
    0x00001FF8U, 0x00001FFCU, 0x00001FFFU, 0x00002000U, 0x00002100U, 0x00003FF8U, 0x00003FFCU, 0x00003FFFU,
    0x00004000U, 0x00004FF8U, 0x00004FFCU, 0x00004FFFU, 0x00005000U, 0x0000FFFFU, 0x00010000U, 0x00012100U,
    0x7FFFFFFFU, 0x80000000U, 0x80000001U, 0xFFFFFFFFU, 0xFFFFFFFEU, 0x3F800000U, 0xBF800000U, 0x7FC00000U,
    0x7F800000U, 0xFF800000U, 0x80000000U, 0x4F000000U, 0xCF000000U, 0x00000001U,
};
#define FZ_N_INTERESTING (sizeof(FZ_INTERESTING) / sizeof(FZ_INTERESTING[0]))

static const uint16_t FZ_COMM_KINDS[] = {
    ZPLC_COMM_FB_MB_READ_HREG, ZPLC_COMM_FB_MB_WRITE_HREG, ZPLC_COMM_FB_MB_READ_COIL, ZPLC_COMM_FB_MB_WRITE_COIL,
    ZPLC_COMM_FB_MQTT_CONNECT, ZPLC_COMM_FB_MQTT_PUBLISH, ZPLC_COMM_FB_MQTT_SUBSCRIBE, ZPLC_COMM_FB_COMM_STATUS,
    ZPLC_COMM_FB_AZURE_C2D_RECV, ZPLC_COMM_FB_AZURE_DPS_PROV, ZPLC_COMM_FB_AZURE_EG_PUB,
    ZPLC_COMM_FB_AWS_FLEET_PROV, ZPLC_COMM_FB_SPB_REBIRTH,
};
#define FZ_N_COMM (sizeof(FZ_COMM_KINDS) / sizeof(FZ_COMM_KINDS[0]))

/* An address the verifier accepts for a direct access of the given width, from a free choice. */
static uint16_t fz_direct_address(uint32_t choice, unsigned width, int write)
{
    static const struct { uint16_t base; uint16_t size; } readable[] = {
        { ZPLC_MEM_IPI_BASE, ZPLC_MEM_IPI_SIZE }, { ZPLC_MEM_OPI_BASE, ZPLC_MEM_OPI_SIZE },
        { ZPLC_MEM_WORK_BASE, ZPLC_MEM_WORK_SIZE }, { ZPLC_MEM_RETAIN_BASE, ZPLC_MEM_RETAIN_SIZE },
    };
    const unsigned region = (write ? 1U : 0U) + ((choice >> 14) & 3U) % (write ? 3U : 4U);
    const uint32_t span = (uint32_t)readable[region].size - width + 1U;
    uint32_t offset = (choice & 0x3FFFU) % span;

    /* Often land right at the end of the region: that is where bounds are wrong. */
    if ((choice & 0x30000U) == 0x30000U) {
        offset = span - 1U - (choice & 3U) % span;
    }
    return (uint16_t)(readable[region].base + offset);
}

static unsigned fz_access_width(uint8_t op)
{
    switch (op) {
    case OP_LOAD8: case OP_STORE8: return 1U;
    case OP_LOAD16: case OP_STORE16: return 2U;
    case OP_LOAD32: case OP_STORE32: return 4U;
    default: return 8U;
    }
}

/* A fresh instruction of the given opcode with operands that make it likely to be accepted. */
static fz_insn_t fz_make(fz_rng_t *rng, uint8_t op, size_t n)
{
    fz_insn_t in;
    const uint32_t choice = fz_rand(rng);

    in.op = op;
    in.imm = 0U;
    in.tgt = -1;
    in.origin = 0xFFFFFFFFU;
    if (fz_is_relative(op) || fz_is_absolute(op)) {
        in.tgt = (int32_t)fz_below(rng, (uint32_t)(n > 0U ? n : 1U));
    } else if (fz_is_memory(op)) {
        in.imm = fz_direct_address(choice, fz_access_width(op), op >= OP_STORE8 && op <= OP_STORE64);
    } else if (fz_is_comm(op)) {
        in.imm = FZ_COMM_KINDS[choice % FZ_N_COMM];
    } else if (op == OP_PUSH32) {
        in.imm = (choice & 1U) != 0U ? FZ_INTERESTING[(choice >> 1) % FZ_N_INTERESTING] : fz_rand(rng);
    } else if (op == OP_PUSH16) {
        in.imm = (uint16_t)((choice & 1U) != 0U ? FZ_INTERESTING[(choice >> 1) % FZ_N_INTERESTING] : choice >> 4);
    } else if (op == OP_PUSH8) {
        in.imm = (choice & 0xFFU);
    } else if (op == OP_PICK) {
        in.imm = choice % 6U;
    } else if (zplc_opcode_operand_size(op) == 1U) {
        in.imm = choice & 0xFFU;
    }
    return in;
}

static void fz_insert(fz_insn_t *ins, size_t *n, size_t pos, fz_insn_t value)
{
    size_t i;

    if (*n >= FZ_MAX_INSNS) {
        return;
    }
    for (i = *n; i > pos; i--) {
        ins[i] = ins[i - 1U];
    }
    ins[pos] = value;
    (*n)++;
    for (i = 0; i < *n; i++) {
        if (i != pos && ins[i].tgt >= (int32_t)pos) {
            ins[i].tgt++;
        }
    }
}

static void fz_delete(fz_insn_t *ins, size_t *n, size_t pos)
{
    size_t i;

    if (*n <= 1U) {
        return;
    }
    for (i = pos; i + 1U < *n; i++) {
        ins[i] = ins[i + 1U];
    }
    (*n)--;
    for (i = 0; i < *n; i++) {
        if (ins[i].tgt > (int32_t)pos) {
            ins[i].tgt--;
        } else if (ins[i].tgt == (int32_t)pos && (size_t)ins[i].tgt >= *n) {
            ins[i].tgt = (int32_t)*n - 1;
        }
    }
}

/* Walk the program in order and push operands wherever the stack would be too shallow for the next instruction. */
static void fz_balance(fz_rng_t *rng, fz_insn_t *ins, size_t *n)
{
    unsigned depth = 0;
    size_t i;

    for (i = 0; i < *n && *n < FZ_MAX_INSNS - 4U; i++) {
        const fz_op_t *info = fz_op_find(ins[i].op);
        unsigned need = info != NULL ? info->min_depth : 0U;

        if (ins[i].op == OP_PICK) {
            need = ins[i].imm + 1U;
        }
        while (depth < need && need <= 64U) {
            fz_insert(ins, n, i, fz_make(rng, OP_PUSH32, *n));
            depth++;
            i++;
        }
        if (info != NULL) {
            depth = depth >= info->pops ? depth - info->pops : 0U;
            depth += info->pushes;
            if (depth > 200U) {
                depth = 200U;
            }
        }
    }
}

static void fz_mutate_once(fz_rng_t *rng, fz_insn_t *ins, size_t *n)
{
    const size_t pos = fz_below(rng, (uint32_t)*n);

    switch (fz_below(rng, 13U)) {
    case 0: /* replace the opcode */
        ins[pos] = fz_make(rng, FZ_OPS[fz_below(rng, FZ_OP_COUNT)].code, *n);
        ins[pos].origin = 0xFFFFFFFFU;
        break;
    case 1: /* insert an instruction */
    case 2:
        fz_insert(ins, n, pos, fz_make(rng, FZ_OPS[fz_below(rng, FZ_OP_COUNT)].code, *n));
        break;
    case 3: /* delete */
        fz_delete(ins, n, pos);
        break;
    case 4: { /* swap two */
        const size_t other = fz_below(rng, (uint32_t)*n);
        const fz_insn_t tmp = ins[pos];

        ins[pos] = ins[other];
        ins[other] = tmp;
        break;
    }
    case 5: /* retarget a jump */
        if (fz_is_relative(ins[pos].op) || fz_is_absolute(ins[pos].op)) {
            ins[pos].tgt = (int32_t)fz_below(rng, (uint32_t)*n);
        }
        break;
    case 6: /* change an immediate */
        if (ins[pos].op == OP_PUSH32 || ins[pos].op == OP_PUSH16 || ins[pos].op == OP_PUSH8) {
            ins[pos] = fz_make(rng, ins[pos].op, *n);
        } else if (fz_is_comm(ins[pos].op) || fz_is_memory(ins[pos].op)) {
            ins[pos] = fz_make(rng, ins[pos].op, *n);
        }
        break;
    case 7: { /* push operands before an instruction: a way to satisfy its stack needs */
        size_t k;

        for (k = fz_below(rng, 3U) + 1U; k > 0U; k--) {
            fz_insert(ins, n, pos, fz_make(rng, (fz_rand(rng) & 1U) != 0U ? OP_PUSH32 : OP_PUSH8, *n));
        }
        break;
    }
    case 8: { /* duplicate a short run right after itself */
        fz_insn_t run[6];
        size_t len = fz_below(rng, 6U) + 1U;
        size_t k;

        if (pos + len > *n) {
            len = *n - pos;
        }
        for (k = 0; k < len; k++) {
            run[k] = ins[pos + k];
            run[k].origin = 0xFFFFFFFFU;
        }
        for (k = 0; k < len; k++) {
            fz_insert(ins, n, pos + len + k, run[k]);
        }
        break;
    }
    case 9: /* turn the instruction into a store or a communication call on a chosen address */
        fz_insert(ins, n, pos, fz_make(rng, OP_PUSH32, *n));
        fz_insert(ins, n, pos + 1U, fz_make(rng, (fz_rand(rng) & 1U) != 0U ? OP_COMM_EXEC : OP_STOREI32, *n));
        break;
    case 10: /* a call to the same place: depth of the call stack */
        ins[pos] = fz_make(rng, OP_CALL, *n);
        break;
    default: /* repair the stack needs of what the other mutations broke */
        fz_balance(rng, ins, n);
        break;
    }
}

/* ============================================================================
 * Bytes as a program
 * ============================================================================
 */

/* Every byte string is a program: each byte picks an opcode of the table, operands follow. */
static size_t fz_program_from_bytes(const uint8_t *data, size_t size, uint8_t *out, size_t cap)
{
    static fz_insn_t ins[FZ_MAX_INSNS];
    static uint8_t code[FZ_FILE_CAP];
    static uint32_t offs[FZ_MAX_INSNS + 1U];
    size_t n = 0;
    size_t pos = 0;
    size_t code_len;
    size_t i;
    unsigned depth = 0;
    const int with_task = size > 0U && (data[0] & 0x80U) != 0U;
    uint8_t *p;

    while (pos < size && n + 4U < FZ_MAX_INSNS) {
        const fz_op_t *entry = &FZ_OPS[data[pos++] % FZ_OP_COUNT];
        fz_insn_t in;
        uint32_t raw = 0;
        unsigned k;

        for (k = 0; k < entry->operand; k++) {
            raw |= (uint32_t)(pos < size ? data[pos] : 0U) << (8U * k);
            pos++;
        }
        in.op = entry->code;
        in.imm = raw;
        in.tgt = -1;
        in.origin = 0xFFFFFFFFU;
        if (fz_is_relative(in.op) || fz_is_absolute(in.op)) {
            in.tgt = -2; /* resolved below, modulo the instruction count */
        } else if (fz_is_memory(in.op)) {
            in.imm = fz_direct_address(raw | ((raw & 0xC000U) << 2), fz_access_width(in.op),
                                       in.op >= OP_STORE8 && in.op <= OP_STORE64);
        } else if (fz_is_comm(in.op)) {
            in.imm = FZ_COMM_KINDS[raw % FZ_N_COMM];
        }
        /* Operands for it, taken from the stream, so that the program gets past its first instructions. */
        {
            unsigned need = entry->min_depth;

            if (in.op == OP_PICK) {
                need = in.imm + 1U;
            }
            while (depth < need && need <= 16U && n + 4U < FZ_MAX_INSNS) {
                fz_insn_t push;

                push.op = OP_PUSH32;
                push.imm = FZ_INTERESTING[(pos < size ? data[pos] : 0U) % FZ_N_INTERESTING];
                push.tgt = -1;
                push.origin = 0xFFFFFFFFU;
                pos++;
                ins[n++] = push;
                depth++;
            }
            depth = depth >= entry->pops ? depth - entry->pops : 0U;
            depth += entry->pushes;
            if (depth > 100U) {
                depth = 100U;
            }
        }
        ins[n++] = in;
    }
    if (n == 0U) {
        return 0;
    }
    ins[n].op = OP_HALT;
    ins[n].imm = 0U;
    ins[n].tgt = -1;
    ins[n].origin = 0xFFFFFFFFU;
    n++;
    for (i = 0; i < n; i++) {
        if (ins[i].tgt == -2) {
            ins[i].tgt = (int32_t)(ins[i].imm % n);
        }
    }
    code_len = fz_encode(ins, n, code, sizeof(code), offs);
    if (code_len == 0U) {
        return 0;
    }

    /* Header, one or two segments, CRC. */
    memset(out, 0, ZPLC_FILE_HEADER_SIZE);
    fz_put32(out, ZPLC_MAGIC);
    fz_put16(out + 4, ZPLC_VERSION_MAJOR);
    fz_put16(out + 6, ZPLC_VERSION_MINOR);
    p = out + ZPLC_FILE_HEADER_SIZE;
    fz_put16(out + 26, with_task ? 2U : 1U);
    fz_put16(p, ZPLC_SEG_CODE);
    fz_put16(p + 2, 0U);
    fz_put32(p + 4, (uint32_t)code_len);
    fz_put32(out + 16, (uint32_t)code_len);
    p += ZPLC_SEGMENT_ENTRY_SIZE;
    if (with_task) {
        const size_t tasks = 1U + ((size > 1U ? data[1] : 0U) & 1U) + ((size > 2U ? data[2] : 0U) & 1U);

        fz_put16(p, ZPLC_SEG_TASK);
        fz_put16(p + 2, 0U);
        fz_put32(p + 4, (uint32_t)(tasks * ZPLC_TASK_DEF_SIZE));
        fz_put32(out + 20, (uint32_t)(tasks * ZPLC_TASK_DEF_SIZE));
        p += ZPLC_SEGMENT_ENTRY_SIZE;
        if ((size_t)(p - out) + code_len + tasks * ZPLC_TASK_DEF_SIZE > cap) {
            return 0;
        }
        memcpy(p, code, code_len);
        p += code_len;
        for (i = 0; i < tasks; i++) {
            memset(p, 0, ZPLC_TASK_DEF_SIZE);
            fz_put16(p, (uint16_t)(i + 1U));
            p[2] = (uint8_t)(i % 3U);
            p[3] = (uint8_t)i;
            fz_put32(p + 4, 1000U * (uint32_t)(i + 1U));
            fz_put16(p + 8, (uint16_t)offs[(size_t)(data[i % size] % n)]);
            fz_put16(p + 10, (uint16_t)(1U + (size_t)data[(i + 1U) % size] % ZPLC_STACK_MAX_DEPTH));
            p += ZPLC_TASK_DEF_SIZE;
        }
    } else {
        if ((size_t)(p - out) + code_len > cap) {
            return 0;
        }
        memcpy(p, code, code_len);
        p += code_len;
    }
    fz_repair_crc(out, (size_t)(p - out));
    return (size_t)(p - out);
}

/* ============================================================================
 * Mutator
 * ============================================================================
 */

size_t LLVMFuzzerCustomMutator(uint8_t *data, size_t size, size_t max_size, unsigned int seed);

size_t LLVMFuzzerCustomMutator(uint8_t *data, size_t size, size_t max_size, unsigned int seed)
{
    static fz_insn_t ins[FZ_MAX_INSNS];
    static uint32_t offs[FZ_MAX_INSNS + 1U];
    static uint8_t code[FZ_FILE_CAP];
    static uint8_t out[FZ_FILE_CAP];
    fz_container_t container;
    fz_rng_t rng;
    size_t n = 0;

    fz_rng_seed(&rng, seed);
    if (size <= FZ_MAX_INPUT && fz_parse(data, size, &container) && fz_below(&rng, 16U) != 0U) {
        unsigned code_segment = container.count;
        unsigned i;

        for (i = 0; i < container.count; i++) {
            if (container.segment[i].type == ZPLC_SEG_CODE) {
                code_segment = i;
                break;
            }
        }
        if (code_segment < container.count &&
            fz_decode(data + container.segment[code_segment].offset, container.segment[code_segment].size, ins,
                      offs, FZ_MAX_INSNS, &n) && n > 0U) {
            const unsigned rounds = 1U + fz_below(&rng, 3U);
            size_t code_len;
            size_t total;
            unsigned r;

            for (r = 0; r < rounds; r++) {
                fz_mutate_once(&rng, ins, &n);
            }
            /* Keep the program ending in an instruction that does not fall through. */
            if (ins[n - 1U].op != OP_HALT && ins[n - 1U].op != OP_RET && ins[n - 1U].op != OP_JMP &&
                ins[n - 1U].op != OP_JR) {
                fz_insert(ins, &n, n, fz_make(&rng, OP_HALT, n));
            }
            code_len = fz_encode(ins, n, code, sizeof(code), offs);
            if (code_len > 0U) {
                total = fz_build(&container, data, code, code_len, ins, n, offs, out, sizeof(out));
                if (total > 0U && total <= max_size) {
                    memcpy(data, out, total);
                    return total;
                }
            }
        }
    }
    size = LLVMFuzzerMutate(data, size, max_size);
    if (size >= ZPLC_FILE_HEADER_SIZE && fz_below(&rng, 4U) != 0U) {
        fz_repair_sizes(data, size);
        fz_repair_crc(data, size);
    }
    return size;
}

/* ============================================================================
 * Running an accepted artifact
 * ============================================================================
 */

typedef struct {
    unsigned long execs;
    unsigned long accepted;
    unsigned long from_container;
    unsigned long from_bytes;
    unsigned long scans;
    unsigned long paused;
    unsigned long multitask;
    unsigned long fault[16];
    unsigned long halted_ok;
} fz_stats_t;

static fz_stats_t g_stats;
static int g_started;
static int g_skip_comm; /* ZPLC_FUZZ_SKIP_COMM=1: leave out programs that use the communication opcodes */
static uint8_t g_workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

static void report_at_exit(void)
{
    unsigned i;

    fprintf(stderr, "fuzz_run_program: execs=%lu accepted=%lu (container=%lu bytes=%lu) scans=%lu paused=%lu "
            "multitask=%lu halted=%lu faults:",
            g_stats.execs, g_stats.accepted, g_stats.from_container, g_stats.from_bytes, g_stats.scans,
            g_stats.paused, g_stats.multitask, g_stats.halted_ok);
    for (i = 1; i < 16U; i++) {
        if (g_stats.fault[i] != 0U) {
            fprintf(stderr, " %u=%lu", i, g_stats.fault[i]);
        }
    }
    fputc('\n', stderr);
}

static int uses_comm(const zplc_program_view_t *view)
{
    uint32_t pc = 0;

    while (pc < view->code_size) {
        if (fz_is_comm(view->code[pc])) {
            return 1;
        }
        pc += 1U + zplc_opcode_operand_size(view->code[pc]);
    }
    return 0;
}

static uint64_t fz_hash(const uint8_t *data, size_t size)
{
    uint64_t h = 0xCBF29CE484222325ULL;
    size_t i;

    for (i = 0; i < size; i++) {
        h = (h ^ data[i]) * 0x100000001B3ULL;
    }
    return h;
}

static void fill_random(uint8_t *p, size_t size, fz_rng_t *rng, unsigned mode)
{
    size_t i;

    for (i = 0; i < size; i++) {
        p[i] = mode == 0U ? 0U : (mode == 1U ? (uint8_t)fz_rand(rng) : ((fz_rand(rng) & 7U) == 0U ? (uint8_t)fz_rand(rng) : 0U));
    }
}

/* What a stopped VM must look like, whatever the program did. */
static void check_vm(const zplc_vm_t *vm, int result, uint32_t total_code)
{
    FZ_REQUIRE(vm->sp <= vm->stack_limit && vm->stack_limit <= ZPLC_STACK_MAX_DEPTH, "evaluation stack within its limit");
    FZ_REQUIRE(vm->call_depth <= ZPLC_CALL_STACK_MAX, "call stack within its limit");
    FZ_REQUIRE(vm->error <= ZPLC_VM_PAUSED, "error code is one of the defined codes");
    if (result < 0) {
        FZ_REQUIRE(-result == (int)vm->error, "the return value names the fault the VM latched");
        FZ_REQUIRE(vm->error >= ZPLC_VM_STACK_OVERFLOW && vm->error <= ZPLC_VM_WATCHDOG, "a fault is one of the fault codes");
        FZ_REQUIRE(vm->halted == 1U, "a fault halts the VM");
    } else if (vm->paused != 0U) {
        FZ_REQUIRE(vm->error == ZPLC_VM_PAUSED && vm->halted == 0U, "paused is a breakpoint pause");
        FZ_REQUIRE(vm->pc <= vm->code_size, "paused inside the code");
    } else {
        FZ_REQUIRE(vm->halted == 1U && vm->error == ZPLC_VM_HALTED, "a scan that does not fault or pause ends halted");
        FZ_REQUIRE(vm->pc <= total_code, "stopped inside the code");
    }
}

static void run_artifact(const uint8_t *file, size_t size, uint64_t seed)
{
    static zplc_task_def_t defs[ZPLC_LOADER_MAX_TASKS];
    static zplc_vm_t vms[ZPLC_LOADER_MAX_TASKS];
    static uint8_t ipi_expected[ZPLC_MEM_IPI_SIZE];
    static uint8_t code_before[ZPLC_MEM_CODE_SIZE];
    static zplc_tag_entry_t tags_before[ZPLC_MAX_TAGS];
    zplc_program_view_t view;
    zplc_vm_t *vm_list[ZPLC_LOADER_MAX_TASKS];
    unsigned task_count = 1U;
    fz_rng_t rng;
    uint32_t total_code;
    unsigned tag_count;
    unsigned scan;
    unsigned scans;
    unsigned task;
    unsigned image_mode;
    int rc;

    fz_rng_seed(&rng, seed);
    if (zplc_loader_verify(file, size, g_workspace, sizeof(g_workspace), &view) != ZPLC_LOADER_OK) {
        return;
    }
    if (view.task_count > 0U) {
        rc = zplc_core_load_tasks(file, size, defs, ZPLC_LOADER_MAX_TASKS, g_workspace, sizeof(g_workspace));
        FZ_REQUIRE(rc == (int)view.task_count, "an artifact the verifier accepts loads with all its tasks");
        task_count = view.task_count;
        total_code = zplc_mem_get_code_size();
        for (task = 0; task < task_count; task++) {
            FZ_REQUIRE(zplc_vm_init(&vms[task]) == 0, "vm init");
            FZ_REQUIRE(zplc_vm_set_entry(&vms[task], defs[task].entry_point, total_code - defs[task].entry_point) == 0,
                       "an accepted entry point is accepted by set_entry");
            vms[task].task_id = defs[task].id;
            vms[task].priority = defs[task].priority;
            vms[task].stack_limit = defs[task].stack_size;
            vm_list[task] = &vms[task];
        }
        g_stats.multitask++;
    } else {
        rc = zplc_core_load(file, size, g_workspace, sizeof(g_workspace));
        FZ_REQUIRE(rc == 0, "an artifact the verifier accepts loads");
        total_code = zplc_mem_get_code_size();
        vm_list[0] = zplc_core_get_default_vm();
    }
    FZ_REQUIRE(total_code == view.code_size, "the core holds the whole code segment");

    /* A random image, as a plant's inputs and a warm retentive memory would leave it. */
    image_mode = fz_below(&rng, 3U);
    fill_random(zplc_mem_get_region(ZPLC_MEM_IPI_BASE), ZPLC_MEM_IPI_SIZE, &rng, 1U);
    fill_random(zplc_mem_get_region(ZPLC_MEM_OPI_BASE), ZPLC_MEM_OPI_SIZE, &rng, image_mode);
    fill_random(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), ZPLC_MEM_WORK_SIZE, &rng, image_mode);
    fill_random(zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), ZPLC_MEM_RETAIN_SIZE, &rng, image_mode);
    memcpy(ipi_expected, zplc_mem_get_region(ZPLC_MEM_IPI_BASE), sizeof(ipi_expected));
    memcpy(code_before, zplc_mem_get_code(0U, total_code), total_code);
    tag_count = zplc_core_get_tag_count();
    for (task = 0; task < tag_count; task++) {
        memcpy(&tags_before[task], zplc_core_get_tag((uint16_t)task), sizeof(tags_before[task]));
    }

    /* Breakpoints at instruction boundaries, so that pause and resume run in the middle of programs. */
    if (fz_below(&rng, 3U) == 0U) {
        unsigned k;

        for (task = 0; task < task_count; task++) {
            for (k = 0; k < 3U; k++) {
                (void)zplc_vm_add_breakpoint(vm_list[task], (uint16_t)fz_below(&rng, total_code));
            }
        }
    }

    scans = 1U + fz_below(&rng, 3U);
    for (scan = 0; scan < scans; scan++) {
        zplc_hal_posix_set_tick_override((uint32_t)(fz_rand(&rng) >> 4));
        for (task = 0; task < task_count; task++) {
            zplc_vm_t *vm = vm_list[task];
            unsigned resumes = 0;
            int step;

            rc = zplc_vm_run_cycle(vm);
            g_stats.scans++;
            check_vm(vm, rc, total_code);
            while (vm->paused != 0U && resumes < 6U) {
                g_stats.paused++;
                FZ_REQUIRE(zplc_vm_resume(vm) == 0, "resume");
                rc = zplc_vm_run_cycle(vm);
                check_vm(vm, rc, total_code);
                resumes++;
            }
            if (vm->halted != 0U) {
                if (vm->error == ZPLC_VM_HALTED) {
                    g_stats.halted_ok++;
                } else if (vm->error < 16U) {
                    g_stats.fault[vm->error]++;
                }
                /* A halted VM stays halted: stepping it again changes nothing. */
                {
                    const uint16_t pc = vm->pc;
                    const uint16_t sp = vm->sp;
                    const uint8_t error = vm->error;

                    step = zplc_vm_step(vm);
                    FZ_REQUIRE(step == (int)error && vm->pc == pc && vm->sp == sp && vm->halted == 1U,
                               "a halted VM does not execute");
                }
            }

            FZ_REQUIRE(memcmp(zplc_mem_get_region(ZPLC_MEM_IPI_BASE), ipi_expected, sizeof(ipi_expected)) == 0,
                       "the VM never writes the input image");
            FZ_REQUIRE(memcmp(zplc_mem_get_code(0U, total_code), code_before, total_code) == 0,
                       "the VM never writes the code");
            FZ_REQUIRE(zplc_force_get_count() == 0U, "the VM creates no force");
            FZ_REQUIRE(zplc_core_get_tag_count() == tag_count, "the tag table keeps its size");
            for (step = 0; step < (int)tag_count; step++) {
                FZ_REQUIRE(memcmp(zplc_core_get_tag((uint16_t)step), &tags_before[step], sizeof(tags_before[0])) == 0,
                           "the VM never writes the tag table");
            }
            /* A fault latches until the task is reset by a person: a new scan starts only from reset_cycle. */
        }
        /* The next scan sees new inputs, written the way the runtime writes them. */
        fill_random(ipi_expected, sizeof(ipi_expected), &rng, 1U);
        FZ_REQUIRE(zplc_force_write_bytes(ZPLC_MEM_IPI_BASE, ipi_expected, sizeof(ipi_expected)) == 0,
                   "the runtime writes the input image");
    }
}

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    static uint8_t file[FZ_FILE_CAP];
    zplc_program_view_t view;
    size_t length;

    if (!g_started) {
        const char *skip = getenv("ZPLC_FUZZ_SKIP_COMM");

        g_started = 1;
        g_skip_comm = skip != NULL && skip[0] == '1';
        (void)zplc_core_init();
        atexit(report_at_exit);
    }
    g_stats.execs++;
    if (size > FZ_MAX_INPUT) {
        return 0;
    }
    if (zplc_loader_verify(data, size, g_workspace, sizeof(g_workspace), &view) == ZPLC_LOADER_OK) {
        memcpy(file, data, size);
        length = size;
        g_stats.from_container++;
    } else {
        length = fz_program_from_bytes(data, size, file, sizeof(file));
        if (length == 0U || zplc_loader_verify(file, length, g_workspace, sizeof(g_workspace), &view) != ZPLC_LOADER_OK) {
            return 0;
        }
        g_stats.from_bytes++;
    }
    g_stats.accepted++;
    if (g_skip_comm && uses_comm(&view)) {
        return 0;
    }
    {
        /* ZPLC_FUZZ_DUMP=<path>: write the container that is about to run (a byte program becomes a file). */
        const char *dump = getenv("ZPLC_FUZZ_DUMP");
        FILE *out = dump != NULL ? fopen(dump, "wb") : NULL;

        if (out != NULL) {
            (void)fwrite(file, 1, length, out);
            (void)fclose(out);
        }
    }
    run_artifact(file, length, fz_hash(file, length));
    return 0;
}
