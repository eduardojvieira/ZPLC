/**
 * ZPLC Standard Library - helper routines
 *
 * SPDX-License-Identifier: MIT
 *
 * The VM has no rounding, square-root, trigonometric or logarithmic opcode and no 64-bit arithmetic,
 * so those functions are subroutines written in the instruction set: `CALL label` with the arguments on
 * the evaluation stack and the result left in their place. A routine is appended to the program only
 * when something calls it (a program that does not use a function does not pay for it), uses no memory but
 * the stack, and has the same stack effect on every path, so the loader's stack verifier (RT-003)
 * proves it. No routine loops over a count that depends on its argument: every loop that exists is
 * unrolled to a fixed number of steps.
 *
 * Conversion routines (CMP-057):
 *
 *   _zplc_roundf   [x] -> [n]     REAL to the nearest DINT, a tie to the even one, saturating, NaN is 0
 *   _zplc_clampi   [n lo hi] -> [m]   n limited to lo..hi (signed)
 *   _zplc_f2u32    [x] -> [n]     REAL to the nearest UDINT, saturating at 0 and 4294967295, NaN is 0
 *   _zplc_truncf   [x] -> [y]     REAL with its fractional part removed (the sign and a magnitude of 2^23
 *                                 or more are kept: such a REAL is already whole)
 *   _zplc_roundaf  [x] -> [y]     REAL rounded to the nearest whole number, an exact half away from zero
 */

import { f32hex as f32 } from '../numeric.ts';
import { POWF_ROUTINES } from '../power.ts';
import { MATH_ROUTINES } from './mathlib.ts';
import type { Routine } from './types.ts';

export type { Routine } from './types.ts';

export const ROUNDF_LABEL = '_zplc_roundf';
export const CLAMPI_LABEL = '_zplc_clampi';
export const F2U32_LABEL = '_zplc_f2u32';
export const TRUNCF_LABEL = '_zplc_truncf';
export const ROUNDAF_LABEL = '_zplc_roundaf';

/**
 * REAL to DINT, to the nearest integer; exactly halfway goes to the even integer (IEC 60559
 * roundTiesToEven, which is what IEC 61131-3 refers to). F2I truncates and saturates, so only
 * the fraction decides: for |x| < 2^23, r = x - trunc(x) is exact, and the integer moves one step
 * away from zero when |r| > 0.5, or |r| = 0.5 and the integer is odd. A REAL of 2^23 or more has
 * no fraction (F2I alone, saturating at the limits of DINT); a NaN is not below 2^23 and F2I gives 0.
 */
const ROUNDF: string[] = [
    `${ROUNDF_LABEL}:         ; [x]`,
    `    DUP`,
    `    PUSH32 0x7FFFFFFF`,
    `    AND`,
    `    PUSH32 0x4B000000   ; 2^23`,
    `    LTU                 ; [x |x|<2^23]`,
    `    JZ ${ROUNDF_LABEL}_whole`,
    `    DUP`,
    `    F2I                 ; [x t]`,
    `    SWAP`,
    `    OVER`,
    `    I2F`,
    `    SUBF                ; [t r]  r = x - t, the sign of x`,
    `    DUP`,
    `    PUSH8 31`,
    `    SAR                 ; [t r m]  m = 0 or -1`,
    `    SWAP`,
    `    PUSH32 0x7FFFFFFF`,
    `    AND                 ; [t m |r|]`,
    `    DUP`,
    `    PUSH32 0x3F000000   ; 0.5`,
    `    GTU                 ; [t m |r| |r|>0.5]`,
    `    SWAP`,
    `    PUSH32 0x3F000000`,
    `    EQ                  ; [t m more tie]`,
    `    PICK 3              ; [t m more tie t]`,
    `    PUSH8 1`,
    `    AND                 ; [t m more tie odd]`,
    `    AND`,
    `    OR                  ; [t m d]  d = 1 when the integer moves`,
    `    OVER`,
    `    XOR`,
    `    SWAP`,
    `    SUB                 ; [t (d^m)-m]  +d or -d`,
    `    ADD`,
    `    RET`,
    `${ROUNDF_LABEL}_whole:  ; [x]`,
    `    F2I`,
    `    RET`,
];

/** n limited to lo..hi (signed): [n lo hi] -> [m]. */
const CLAMPI: string[] = [
    `${CLAMPI_LABEL}:         ; [n lo hi]`,
    `    PICK 2`,
    `    OVER`,
    `    GT                  ; [n lo hi n>hi]`,
    `    JNZ ${CLAMPI_LABEL}_above`,
    `    DROP                ; [n lo]`,
    `    OVER`,
    `    OVER`,
    `    LT                  ; [n lo n<lo]`,
    `    JNZ ${CLAMPI_LABEL}_below`,
    `    DROP                ; [n]`,
    `    RET`,
    `${CLAMPI_LABEL}_below:  ; [n lo]`,
    `    SWAP`,
    `    DROP`,
    `    RET`,
    `${CLAMPI_LABEL}_above:  ; [n lo hi]`,
    `    SWAP`,
    `    DROP`,
    `    SWAP`,
    `    DROP                ; [hi]`,
    `    RET`,
];

/**
 * REAL to UDINT. A negative number (and -0.0) has its sign bit set, so as an unsigned pattern it
 * is above +infinity like a NaN: both give 0. From 2^32 up (and +infinity) the result is 4294967295;
 * from 2^31 up the REAL is whole and 2^31 is taken off before F2I and added after.
 */
const F2U32: string[] = [
    `${F2U32_LABEL}:          ; [x]`,
    `    DUP`,
    `    PUSH32 0x7F800000`,
    `    GTU                 ; [x negative or NaN]`,
    `    JNZ ${F2U32_LABEL}_zero`,
    `    DUP`,
    `    PUSH32 0x4F800000   ; 2^32`,
    `    LTU`,
    `    JZ ${F2U32_LABEL}_max`,
    `    DUP`,
    `    PUSH32 0x4F000000   ; 2^31`,
    `    LTU`,
    `    JZ ${F2U32_LABEL}_high`,
    `    CALL ${ROUNDF_LABEL}`,
    `    RET`,
    `${F2U32_LABEL}_high:    ; [x] 2^31 <= x < 2^32`,
    `    PUSH32 ${f32(-2147483648)}`,
    `    ADDF`,
    `    F2I`,
    `    PUSH32 0x80000000`,
    `    ADD`,
    `    RET`,
    `${F2U32_LABEL}_max:`,
    `    DROP`,
    `    PUSH8 -1`,
    `    RET`,
    `${F2U32_LABEL}_zero:`,
    `    DROP`,
    `    PUSH8 0`,
    `    RET`,
];

/** TRUNC: [x] -> [y]. */
const TRUNCF: string[] = [
    `${TRUNCF_LABEL}:         ; [x]`,
    `    DUP`,
    `    PUSH32 0x7FFFFFFF`,
    `    AND`,
    `    PUSH32 0x4B000000   ; 2^23`,
    `    LTU`,
    `    JZ ${TRUNCF_LABEL}_whole`,
    `    F2I`,
    `    I2F`,
    `${TRUNCF_LABEL}_whole:`,
    `    RET`,
];

/**
 * ROUND: the same exact split of x into trunc(x) and the fraction r as ROUNDF, then one step away
 * from zero when |r| >= 0.5. (Adding 0.5 and truncating would round 0.49999997 up to 1.)
 */
const ROUNDAF: string[] = [
    `${ROUNDAF_LABEL}:        ; [x]`,
    `    DUP`,
    `    PUSH32 0x7FFFFFFF`,
    `    AND`,
    `    PUSH32 0x4B000000   ; 2^23`,
    `    LTU`,
    `    JZ ${ROUNDAF_LABEL}_whole`,
    `    DUP`,
    `    F2I                 ; [x t]`,
    `    SWAP`,
    `    OVER`,
    `    I2F`,
    `    SUBF                ; [t r]`,
    `    DUP`,
    `    PUSH8 31`,
    `    SAR                 ; [t r m]`,
    `    SWAP`,
    `    PUSH32 0x7FFFFFFF`,
    `    AND                 ; [t m |r|]`,
    `    PUSH32 0x3F000000`,
    `    LTU`,
    `    PUSH8 0`,
    `    EQ                  ; [t m d]  d = |r| >= 0.5`,
    `    OVER`,
    `    XOR`,
    `    SWAP`,
    `    SUB`,
    `    ADD                 ; [t']`,
    `    I2F`,
    `${ROUNDAF_LABEL}_whole:`,
    `    RET`,
];

const TABLE: Routine[] = [
    { label: ROUNDF_LABEL, lines: ROUNDF, needs: [] },
    { label: CLAMPI_LABEL, lines: CLAMPI, needs: [] },
    { label: F2U32_LABEL, lines: F2U32, needs: [ROUNDF_LABEL] },
    { label: TRUNCF_LABEL, lines: TRUNCF, needs: [] },
    { label: ROUNDAF_LABEL, lines: ROUNDAF, needs: [] },
    // mathlib.ts: SQRT, EXP, LN, LOG and the trigonometric functions; power.ts: `**`
    ...MATH_ROUTINES,
    ...POWF_ROUTINES,
];

const ROUTINES = new Map<string, Routine>(TABLE.map((routine) => [routine.label, routine]));
if (ROUTINES.size !== TABLE.length) throw new Error('a stdlib routine label is defined twice');

export function getRoutine(label: string): Routine | undefined {
    return ROUTINES.get(label);
}

/** The labels of every registered routine, in registration order. */
export function routineLabels(): string[] {
    return [...ROUTINES.keys()];
}
