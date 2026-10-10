/**
 * ZPLC numeric typing for the code generator (CMP-011 to CMP-014, CMP-017)
 *
 * SPDX-License-Identifier: MIT
 *
 * The VM evaluates on a stack of 32-bit two's complement cells and has no typed
 * opcodes: ADD, DIV, LT and friends see only bit patterns. The generator therefore
 * keeps one invariant: a value it leaves on the stack is the canonical 32-bit form
 * of its static type.
 *
 *   SINT, INT, DINT             sign-extended to 32 bits
 *   USINT, UINT, UDINT, BYTE,
 *   WORD, DWORD, BOOL           zero-extended to 32 bits
 *   REAL                        the IEEE 754 single-precision pattern
 *   TIME, TOD                   an unsigned 32-bit millisecond count
 *
 * A narrower type wraps at its own width when its STORE opcode truncates the
 * result (the table in zplc_core.c); intermediate results are not re-narrowed.
 *
 * Operations that have no opcode (unsigned division and modulo, REAL comparison)
 * are emitted as calls to two small helper routines appended to the program only
 * when the program uses them.
 */

/** Static type of an integer literal: it adopts the type of the other operand. */
export const LITERAL_INT = '#INT';
import type { AsmLine } from './asm-line.ts';

/** Static type of an expression the generator cannot name. */
export const UNKNOWN_TYPE = '?';

export interface NumericInfo {
    /** Width of the stored value in bits. */
    bits: 8 | 16 | 32 | 64;
    /** Two's complement integer; false for unsigned integers, bit strings and BOOL. */
    signed: boolean;
    /** IEEE 754 floating point. */
    float: boolean;
}

const INFO: Record<string, NumericInfo> = {
    BOOL: { bits: 8, signed: false, float: false },
    SINT: { bits: 8, signed: true, float: false },
    USINT: { bits: 8, signed: false, float: false },
    BYTE: { bits: 8, signed: false, float: false },
    INT: { bits: 16, signed: true, float: false },
    UINT: { bits: 16, signed: false, float: false },
    WORD: { bits: 16, signed: false, float: false },
    DINT: { bits: 32, signed: true, float: false },
    UDINT: { bits: 32, signed: false, float: false },
    DWORD: { bits: 32, signed: false, float: false },
    LINT: { bits: 64, signed: true, float: false },
    ULINT: { bits: 64, signed: false, float: false },
    LWORD: { bits: 64, signed: false, float: false },
    REAL: { bits: 32, signed: true, float: true },
    LREAL: { bits: 64, signed: true, float: true },
    // TIME is an unsigned millisecond count (documented range 0 to 4294967295 ms, 49d17h2m47s295ms).
    TIME: { bits: 32, signed: false, float: false },
    TOD: { bits: 32, signed: false, float: false },
    // DATE is seconds since 1970-01-01 as the generator has always emitted it (signed, before 1970 is negative).
    DATE: { bits: 32, signed: true, float: false },
    DT: { bits: 64, signed: true, float: false },
};

const ALIASES: Record<string, string> = {
    TIME_OF_DAY: 'TOD',
    DATE_AND_TIME: 'DT',
};

/** Normalised elementary type name, or UNKNOWN_TYPE for anything that is not a numeric elementary type. */
export function numericTypeName(dataType: unknown): string {
    if (typeof dataType !== 'string') return UNKNOWN_TYPE;
    const upper = dataType.toUpperCase();
    const name = ALIASES[upper] ?? upper;
    return name in INFO ? name : UNKNOWN_TYPE;
}

export function numericInfo(typeName: string | undefined): NumericInfo | undefined {
    return typeName === undefined ? undefined : INFO[typeName];
}

/** REAL or LREAL. */
export function isFloatType(typeName: string | undefined): boolean {
    return numericInfo(typeName)?.float === true;
}

/** An integer, bit string, BOOL, TIME, TOD, DATE or DT: a value that I2F converts. */
export function isIntegerLike(typeName: string | undefined): boolean {
    if (typeName === LITERAL_INT) return true;
    const info = numericInfo(typeName);
    return info !== undefined && !info.float;
}

/** A 32-bit type whose values above 2^31 - 1 are large positive numbers: needs LTU/GTU and an unsigned divide. */
export function isUnsigned32(typeName: string | undefined): boolean {
    const info = numericInfo(typeName);
    return info !== undefined && !info.float && info.bits === 32 && !info.signed;
}

/** A 64-bit integer type (two stack cells, low word below the high word). */
export function isWide(typeName: string | undefined): boolean {
    const info = numericInfo(typeName);
    return info !== undefined && info.bits === 64;
}

/** A 64-bit integer or bit-string type (LINT, ULINT, LWORD, DT): two stack cells, not a float. */
export function isWideInteger(typeName: string | undefined): boolean {
    const info = numericInfo(typeName);
    return info !== undefined && info.bits === 64 && !info.float;
}

/**
 * Type of `a OP b` for an arithmetic, bit or comparison operator.
 *
 * REAL wins over every integer; otherwise the wider type wins, and between two types of the
 * same width the unsigned one wins (the C rule). An integer literal and an unknown operand
 * adopt the type of the other side.
 */
export function commonType(a: string, b: string): string {
    if (a === b) return a;
    if (a === UNKNOWN_TYPE) return b;
    if (b === UNKNOWN_TYPE) return a;
    if (a === LITERAL_INT) return b;
    if (b === LITERAL_INT) return a;
    const ia = INFO[a];
    const ib = INFO[b];
    if (!ia || !ib) return UNKNOWN_TYPE;
    if (ia.float || ib.float) return a === 'LREAL' || b === 'LREAL' ? 'LREAL' : 'REAL';
    if (ia.bits !== ib.bits) return ia.bits > ib.bits ? a : b;
    if (ia.signed !== ib.signed) return ia.signed ? b : a;
    return a;
}

/** The IEEE 754 single-precision bit pattern of a number, as an unsigned 32-bit integer. */
export function floatBits(value: number): number {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, true);
    return view.getUint32(0, true);
}

/**
 * The two 32-bit words, low word first (the order LOAD64 leaves), of the IEEE 754 double-precision
 * pattern of a number. Every NaN is the quiet NaN 0x7FF8000000000000, as the VM makes it.
 */
export function doubleWords(value: number): [low: number, high: number] {
    if (Number.isNaN(value)) return [0, 0x7FF80000];
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, true);
    return [view.getUint32(0, true), view.getUint32(4, true)];
}

/** The IEEE 754 single-precision pattern of a number as a PUSH32 operand (`0x3F800000` for 1). */
export function f32hex(value: number): string {
    return `0x${floatBits(value).toString(16).toUpperCase().padStart(8, '0')}`;
}

// ============================================================================
// Helper routines
// ============================================================================

export const UDIV32_LABEL = '_zplc_udiv32';
export const FCMP_LABEL = '_zplc_fcmp';
export const ADD64_LABEL = '_zplc_add64';
export const SUB64_LABEL = '_zplc_sub64';
export const CMP64S_LABEL = '_zplc_cmp64s';
export const CMP64U_LABEL = '_zplc_cmp64u';
const FKEY_LABEL = '_zplc_fkey';

/**
 * Unsigned 32-bit division: [a b] -> [a /u b].
 *
 * A divisor of 0 faults in DIV, as the signed division does. A divisor of 2^31 or more gives
 * 1 or 0. A dividend of 2^31 or more is halved, divided, doubled and corrected by one
 * (Hacker's Delight, section 9-3), which needs only the signed DIV.
 */
export const UDIV32_HELPER: AsmLine[] = [
    `${UDIV32_LABEL}:`,
    `    DUP`,
    `    PUSH8 0`,
    `    LT                  ; [a b b<0]`,
    `    JNZ ${UDIV32_LABEL}_big`,
    `    SWAP                ; [b a]`,
    `    DUP`,
    `    PUSH8 0`,
    `    LT                  ; [b a a<0]`,
    `    JNZ ${UDIV32_LABEL}_high`,
    `    SWAP                ; [a b]`,
    `    DIV`,
    `    RET`,
    `${UDIV32_LABEL}_high:   ; [b a]  a >= 2^31, 0 <= b < 2^31`,
    `    DUP`,
    `    PUSH8 1`,
    `    SHR                 ; [b a a>>1]`,
    `    PICK 2              ; [b a a>>1 b]`,
    `    DIV                 ; [b a h]`,
    `    PUSH8 1`,
    `    SHL                 ; [b a q]`,
    `    DUP`,
    `    PICK 3              ; [b a q q b]`,
    `    MUL                 ; [b a q q*b]`,
    `    PICK 2              ; [b a q q*b a]`,
    `    SWAP`,
    `    SUB                 ; [b a q r]`,
    `    PICK 3              ; [b a q r b]`,
    `    LTU                 ; [b a q r<b]`,
    `    PUSH8 0`,
    `    EQ                  ; [b a q r>=b]`,
    `    ADD                 ; [b a q']`,
    `    ROT`,
    `    DROP`,
    `    SWAP`,
    `    DROP                ; [q']`,
    `    RET`,
    `${UDIV32_LABEL}_big:    ; [a b]  b >= 2^31`,
    `    LTU`,
    `    PUSH8 0`,
    `    EQ                  ; [a>=b]`,
    `    RET`,
];

/**
 * IEEE 754 ordering key: [x] -> [k] where k is a two's complement integer whose signed
 * order is the numeric order of the REAL x. Negative values are mapped to the negated
 * magnitude, so -0.0 and +0.0 share the key 0.
 */
const FKEY_HELPER: AsmLine[] = [
    `${FKEY_LABEL}:`,
    `    DUP`,
    `    PUSH8 31`,
    `    SAR                 ; [x m]  m = 0 or -1`,
    `    SWAP`,
    `    PUSH32 0x7FFFFFFF`,
    `    AND                 ; [m mag]`,
    `    OVER`,
    `    XOR                 ; [m mag^m]`,
    `    SWAP`,
    `    SUB                 ; [(mag^m)-m]`,
    `    RET`,
];

/**
 * REAL three-way comparison: [a b] -> [-1 | 0 | 1 | 2]
 *
 * -1 when a < b, 0 when a = b, 1 when a > b and 2 when either operand is a NaN (unordered).
 * The six operators are then one compare against a constant each (see fcmpTest).
 */
export const FCMP_HELPER: AsmLine[] = [
    `${FCMP_LABEL}:`,
    `    DUP`,
    `    PUSH32 0x7FFFFFFF`,
    `    AND`,
    `    PUSH32 0x7F800000`,
    `    GTU                 ; [a b b is NaN]`,
    `    JNZ ${FCMP_LABEL}_nan`,
    `    OVER`,
    `    PUSH32 0x7FFFFFFF`,
    `    AND`,
    `    PUSH32 0x7F800000`,
    `    GTU                 ; [a b a is NaN]`,
    `    JNZ ${FCMP_LABEL}_nan`,
    `    CALL ${FKEY_LABEL}  ; [a kb]`,
    `    SWAP`,
    `    CALL ${FKEY_LABEL}  ; [kb ka]`,
    `    SWAP                ; [ka kb]`,
    `    OVER`,
    `    OVER                ; [ka kb ka kb]`,
    `    LT                  ; [ka kb ka<kb]`,
    `    ROT`,
    `    ROT                 ; [l ka kb]`,
    `    GT                  ; [l ka>kb]`,
    `    SWAP`,
    `    SUB                 ; [(ka>kb)-(ka<kb)]`,
    `    RET`,
    `${FCMP_LABEL}_nan:      ; [a b]`,
    `    DROP`,
    `    DROP`,
    `    PUSH8 2`,
    `    RET`,
    ...FKEY_HELPER,
];

export type CompareOp = 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE';

/** Instructions that turn the result of FCMP_LABEL into the BOOL of one comparison operator. */
export function fcmpTest(op: CompareOp): AsmLine[] {
    switch (op) {
        case 'EQ': return ['    PUSH8 0', '    EQ'];
        case 'NE': return ['    PUSH8 0', '    NE'];
        case 'LT': return ['    PUSH8 -1', '    EQ'];
        case 'GT': return ['    PUSH8 1', '    EQ'];
        case 'LE': return ['    PUSH8 1', '    LT'];
        case 'GE': return ['    PUSH8 2', '    LTU'];
    }
}

/** Instructions that convert the unsigned 32-bit integer on the stack to REAL with one rounding. */
export const UNSIGNED_TO_REAL: AsmLine[] = [
    '    DUP',
    '    PUSH8 16',
    '    SHR',
    '    I2F',
    `    PUSH32 ${floatBits(65536)}`,
    '    MULF',
    '    SWAP',
    '    PUSH32 0xFFFF',
    '    AND',
    '    I2F',
    '    ADDF',
];

/**
 * 64-bit integer addition: [alo ahi blo bhi] -> [lo hi]. The carry out of the low words is
 * their sum compared unsigned with one of them.
 */
export const ADD64_HELPER: AsmLine[] = [
    `${ADD64_LABEL}:`,
    `    ROT`,
    `    ADD                 ; [alo blo hi0]`,
    `    ROT`,
    `    ROT                 ; [hi0 alo blo]`,
    `    OVER`,
    `    OVER`,
    `    ADD                 ; [hi0 alo blo lo]`,
    `    SWAP`,
    `    DROP                ; [hi0 alo lo]`,
    `    DUP`,
    `    ROT                 ; [hi0 lo lo alo]`,
    `    LTU                 ; [hi0 lo carry]`,
    `    ROT                 ; [lo carry hi0]`,
    `    ADD                 ; [lo hi]`,
    `    RET`,
];

/** 64-bit integer subtraction: [alo ahi blo bhi] -> [lo hi]; the borrow is alo < blo, unsigned. */
export const SUB64_HELPER: AsmLine[] = [
    `${SUB64_LABEL}:`,
    `    ROT`,
    `    SWAP`,
    `    SUB                 ; [alo blo hi0]`,
    `    ROT`,
    `    ROT                 ; [hi0 alo blo]`,
    `    OVER`,
    `    OVER`,
    `    LTU                 ; [hi0 alo blo borrow]`,
    `    ROT`,
    `    ROT                 ; [hi0 borrow alo blo]`,
    `    SUB                 ; [hi0 borrow lo]`,
    `    SWAP`,
    `    ROT                 ; [lo borrow hi0]`,
    `    SWAP`,
    `    SUB                 ; [lo hi]`,
    `    RET`,
];

/**
 * 64-bit three-way comparison: [alo ahi blo bhi] -> [-1 | 0 | 1]. The high words decide when
 * they differ (signed for CMP64S_LABEL, unsigned for CMP64U_LABEL), the low words, unsigned,
 * otherwise.
 */
export const CMP64_HELPER: AsmLine[] = [
    `${CMP64S_LABEL}:`,
    `    PICK 2`,
    `    PICK 1`,
    `    LT`,
    `    JNZ ${CMP64S_LABEL}_less`,
    `    PICK 2`,
    `    PICK 1`,
    `    GT`,
    `    JNZ ${CMP64S_LABEL}_greater`,
    `    JMP ${CMP64S_LABEL}_low`,
    `${CMP64U_LABEL}:`,
    `    PICK 2`,
    `    PICK 1`,
    `    LTU`,
    `    JNZ ${CMP64S_LABEL}_less`,
    `    PICK 2`,
    `    PICK 1`,
    `    GTU`,
    `    JNZ ${CMP64S_LABEL}_greater`,
    `${CMP64S_LABEL}_low:    ; [alo ahi blo bhi], the high words are equal`,
    `    DROP`,
    `    SWAP`,
    `    DROP                ; [alo blo]`,
    `    OVER`,
    `    OVER`,
    `    LTU`,
    `    JNZ ${CMP64S_LABEL}_low_less`,
    `    GTU                 ; [alo>blo]`,
    `    RET`,
    `${CMP64S_LABEL}_low_less:`,
    `    DROP`,
    `    DROP`,
    `    PUSH8 -1`,
    `    RET`,
    `${CMP64S_LABEL}_less:   ; [alo ahi blo bhi]`,
    `    DROP`,
    `    DROP`,
    `    DROP`,
    `    DROP`,
    `    PUSH8 -1`,
    `    RET`,
    `${CMP64S_LABEL}_greater:`,
    `    DROP`,
    `    DROP`,
    `    DROP`,
    `    DROP`,
    `    PUSH8 1`,
    `    RET`,
];

/** Instructions that turn the result of CMP64S_LABEL or CMP64U_LABEL into the BOOL of one operator. */
export function cmp64Test(op: CompareOp): AsmLine[] {
    switch (op) {
        case 'EQ': return ['    PUSH8 0', '    EQ'];
        case 'NE': return ['    PUSH8 0', '    NE'];
        case 'LT': return ['    PUSH8 0', '    LT'];
        case 'LE': return ['    PUSH8 1', '    LT'];
        case 'GT': return ['    PUSH8 0', '    GT'];
        case 'GE': return ['    PUSH8 -1', '    GT'];
    }
}

export const MEMCPY_LABEL = '_zplc_memcpy';
export const MEMZERO_LABEL = '_zplc_memzero';

/** Byte copy of a structure or an array: [dst src n] -> []. The regions must not overlap. */
export const MEMCPY_HELPER: AsmLine[] = [
    `${MEMCPY_LABEL}:`,
    `${MEMCPY_LABEL}_loop:     ; [dst src n]`,
    `    DUP`,
    `    JZ ${MEMCPY_LABEL}_done`,
    `    PICK 2`,
    `    PICK 2              ; [dst src n dst src]`,
    `    LOADI8              ; [dst src n dst byte]`,
    `    STOREI8             ; [dst src n]`,
    `    ROT                 ; [src n dst]`,
    `    PUSH8 1`,
    `    ADD`,
    `    ROT                 ; [n dst+1 src]`,
    `    PUSH8 1`,
    `    ADD`,
    `    ROT                 ; [dst+1 src+1 n]`,
    `    PUSH8 1`,
    `    SUB`,
    `    JMP ${MEMCPY_LABEL}_loop`,
    `${MEMCPY_LABEL}_done:`,
    `    DROP`,
    `    DROP`,
    `    DROP`,
    `    RET`,
];

/** Clear n bytes: [dst n] -> []. */
export const MEMZERO_HELPER: AsmLine[] = [
    `${MEMZERO_LABEL}:`,
    `${MEMZERO_LABEL}_loop:    ; [dst n]`,
    `    DUP`,
    `    JZ ${MEMZERO_LABEL}_done`,
    `    OVER`,
    `    PUSH8 0`,
    `    STOREI8             ; [dst n]`,
    `    SWAP`,
    `    PUSH8 1`,
    `    ADD`,
    `    SWAP                ; [dst+1 n]`,
    `    PUSH8 1`,
    `    SUB`,
    `    JMP ${MEMZERO_LABEL}_loop`,
    `${MEMZERO_LABEL}_done:`,
    `    DROP`,
    `    DROP`,
    `    RET`,
];

export const WSTRCPY_LABEL = '_zplc_wstrcpy';

/**
 * WSTRING assignment: [src dst] -> []. Keeps the capacity of dst, truncates to it, copies the
 * characters and writes the terminator. Needs the byte-copy routine.
 */
export const WSTRCPY_HELPER: AsmLine[] = [
    `${WSTRCPY_LABEL}:             ; [src dst]`,
    `    OVER`,
    `    LOADI16             ; [src dst len]`,
    `    OVER`,
    `    PUSH8 2`,
    `    ADD`,
    `    LOADI16             ; [src dst len cap]`,
    `    OVER`,
    `    OVER`,
    `    GTU                 ; [src dst len cap len>cap]`,
    `    JZ ${WSTRCPY_LABEL}_fits`,
    `    SWAP`,
    `    DROP                ; [src dst cap]`,
    `    JMP ${WSTRCPY_LABEL}_copy`,
    `${WSTRCPY_LABEL}_fits:`,
    `    DROP                ; [src dst len]`,
    `${WSTRCPY_LABEL}_copy:`,
    `    DUP`,
    `    PICK 2              ; [src dst len len dst]`,
    `    SWAP`,
    `    STOREI16            ; dst.len := len, [src dst len]`,
    `    PUSH8 1`,
    `    SHL                 ; [src dst n] n = bytes of characters`,
    `    OVER`,
    `    OVER`,
    `    ADD`,
    `    PUSH8 4`,
    `    ADD                 ; [src dst n end]`,
    `    PUSH16 0`,
    `    STOREI16            ; terminator, [src dst n]`,
    `    ROT                 ; [dst n src]`,
    `    PUSH8 4`,
    `    ADD`,
    `    SWAP                ; [dst src+4 n]`,
    `    ROT                 ; [src+4 n dst]`,
    `    PUSH8 4`,
    `    ADD`,
    `    ROT                 ; [n dst+4 src+4]`,
    `    ROT                 ; [dst+4 src+4 n]`,
    `    CALL ${MEMCPY_LABEL}`,
    `    RET`,
];

/** The helper routines a program may link, in the order they are appended. */
export type HelperName = 'udiv32' | 'fcmp' | 'add64' | 'sub64' | 'cmp64' | 'memcpy' | 'memzero' | 'wstrcpy';

export const HELPERS: ReadonlyArray<{ name: HelperName; title: string; lines: AsmLine[] }> = [
    { name: 'udiv32', title: 'unsigned 32-bit division', lines: UDIV32_HELPER },
    { name: 'fcmp', title: 'REAL three-way comparison', lines: FCMP_HELPER },
    { name: 'add64', title: '64-bit addition', lines: ADD64_HELPER },
    { name: 'sub64', title: '64-bit subtraction', lines: SUB64_HELPER },
    { name: 'cmp64', title: '64-bit three-way comparison', lines: CMP64_HELPER },
    { name: 'memcpy', title: 'byte copy', lines: MEMCPY_HELPER },
    { name: 'memzero', title: 'byte clear', lines: MEMZERO_HELPER },
    { name: 'wstrcpy', title: 'WSTRING assignment', lines: WSTRCPY_HELPER },
];
