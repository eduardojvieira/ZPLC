/**
 * ZPLC Standard Library - mathematical routines (CMP-058)
 *
 * SPDX-License-Identifier: MIT
 *
 * SQRT, EXP, LN, LOG, SIN, COS, TAN, ASIN, ACOS, ATAN and ATAN2 are subroutines in REAL (IEEE 754
 * single precision) arithmetic, written with argument reduction and a polynomial of fixed degree:
 * no loop depends on the argument, so the cost of a call is the same for every value. Each is
 * measured against Math.* over a dense grid in mathlib.test.ts; the bounds below are the ones that
 * test asserts, and docs/docs/runtime/stdlib.md repeats them.
 *
 *   function   domain                    result                               error bound
 *   SQRT       x > 0                     square root; 0 for x <= 0            relative 1.3e-7
 *   EXP        |x| < 88.7 (see below)    e ** x; +inf above 88.72284,         relative 2.0e-7
 *                                        0 below -103.28
 *   LN, LOG    x > 0                     ln x, log10 x; -inf for 0, NaN       absolute 2.0e-7 +
 *                                        below 0                              relative 2.0e-7
 *   SIN, COS   |x| < 100000              sine, cosine; NaN beyond             absolute 2e-7 to 1000,
 *                                                                             2e-6 to 100000
 *   TAN        |x| < 100000              sin x / cos x                        relative 4.0e-7
 *   ATAN       any x                     (-pi/2, pi/2)                        absolute 1.5e-7
 *   ASIN       -1 <= x <= 1              [-pi/2, pi/2]; NaN outside           absolute 3.0e-7
 *   ACOS       -1 <= x <= 1              [0, pi]; NaN outside                 absolute 3.0e-7
 *   ATAN2      any (y, x)                (-pi, pi]; 0 for (0, 0)              absolute 3.0e-7
 *
 * A NaN argument gives a NaN. The only instruction that can fault is DIVF with a divisor of 0.0, and
 * every division here is guarded, so no routine faults on any argument.
 *
 * All routines use the evaluation stack and nothing else, and have one stack effect on every path:
 * `[args] -> [result]`, which the loader verifies (RT-003).
 */

import { f32hex as f } from '../numeric.ts';
import type { Routine } from './types.ts';
import { LOG2F_LABEL } from '../power.ts';

export const SQRTF_LABEL = '_zplc_sqrtf';
const SQRTN_LABEL = '_zplc_sqrtn';
export const LOG2G_LABEL = '_zplc_log2g';
export const EXPF_LABEL = '_zplc_expf';
export const SINCOSF_LABEL = '_zplc_sincosf';
export const TANF_LABEL = '_zplc_tanf';
export const ATANF_LABEL = '_zplc_atanf';
export const ASINF_LABEL = '_zplc_asinf';
export const ACOSF_LABEL = '_zplc_acosf';
export const ATAN2F_LABEL = '_zplc_atan2f';

const ONE = f(1);
const HALF = f(0.5);
const NAN = '0x7FC00000';
const ABS_MASK = '0x7FFFFFFF';
const SIGN = '0x80000000';

/** `acc = acc * z + c` for each coefficient, with `z` at depth 1 below the accumulator: [.. z acc] -> [.. z acc']. */
function horner(coefficients: number[]): string[] {
    return coefficients.flatMap((c) => [`    OVER`, `    MULF`, `    PUSH32 ${f(c)}`, `    ADDF`]);
}

/**
 * SQRT. x <= 0 (and -0.0) give 0.0, +infinity gives +infinity and a NaN a NaN; a subnormal is scaled
 * by 2^64 first and the root by 2^-32. The root of a normal x > 0 is _zplc_sqrtn: the first estimate
 * halves the exponent in the bit pattern (within 3.5%) and three Newton steps y = (y + x / y) / 2
 * follow, each squaring the error, so the result is within one unit of the last place.
 */
const SQRTF: string[] = [
    `${SQRTF_LABEL}:          ; [x]`,
    `    DUP`,
    `    PUSH8 0`,
    `    GT                  ; [x x>0]  as a pattern: negative numbers and -0.0 are below 0`,
    `    JZ ${SQRTF_LABEL}_zero`,
    `    DUP`,
    `    PUSH32 0x7F800000`,
    `    GE                  ; infinity or NaN: itself`,
    `    JNZ ${SQRTF_LABEL}_special`,
    `    DUP`,
    `    PUSH32 0x00800000`,
    `    LT                  ; subnormal`,
    `    JNZ ${SQRTF_LABEL}_subnormal`,
    `    CALL ${SQRTN_LABEL}`,
    `${SQRTF_LABEL}_special: ; [x] or [y]`,
    `    RET`,
    `${SQRTF_LABEL}_subnormal: ; [x]`,
    `    PUSH32 ${f(2 ** 64)}`,
    `    MULF`,
    `    CALL ${SQRTN_LABEL}`,
    `    PUSH32 ${f(2 ** -32)}`,
    `    MULF`,
    `    RET`,
    `${SQRTF_LABEL}_zero:    ; [x]  zero or below, or a NaN with its sign bit set`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    PUSH32 0x7F800000`,
    `    GTU`,
    `    JNZ ${SQRTF_LABEL}_special`,
    `    DROP`,
    `    PUSH8 0`,
    `    RET`,
];

/** The square root of a finite REAL of 2^-126 or more: [x] -> [y]. */
const SQRTN: string[] = [
    `${SQRTN_LABEL}:          ; [x]`,
    `    DUP`,
    `    PUSH8 1`,
    `    SHR`,
    `    PUSH32 0x1FBD1DF5`,
    `    ADD                 ; [x y]`,
    ...[1, 2, 3].flatMap((step) => [
        `    OVER`,
        `    OVER`,
        `    DIVF                ; [x y x/y]  step ${step}`,
        `    ADDF`,
        `    PUSH32 ${HALF}`,
        `    MULF                ; [x y']`,
    ]),
    `    SWAP`,
    `    DROP                ; [y]`,
    `    RET`,
];

/**
 * log2 of any REAL: [x] -> [log2 x]. LN and LOG scale it. A positive normal number is the series of
 * power.ts (_zplc_log2f); a subnormal is scaled by 2^24 first; 0.0 gives -infinity, a negative
 * number or a NaN gives NaN and +infinity gives +infinity.
 */
const LOG2G: string[] = [
    `${LOG2G_LABEL}:          ; [x]`,
    `    DUP`,
    `    PUSH8 0`,
    `    GT`,
    `    JZ ${LOG2G_LABEL}_nonpositive`,
    `    DUP`,
    `    PUSH32 0x7F800000`,
    `    GE                  ; infinity or NaN`,
    `    JNZ ${LOG2G_LABEL}_special`,
    `    DUP`,
    `    PUSH32 0x00800000`,
    `    LT                  ; subnormal`,
    `    JNZ ${LOG2G_LABEL}_subnormal`,
    `    CALL ${LOG2F_LABEL}`,
    `    RET`,
    `${LOG2G_LABEL}_subnormal: ; [x]`,
    `    PUSH32 ${f(2 ** 24)}`,
    `    MULF`,
    `    CALL ${LOG2F_LABEL}`,
    `    PUSH32 ${f(-24)}`,
    `    ADDF`,
    `    RET`,
    `${LOG2G_LABEL}_special: ; [x]`,
    `    RET`,
    `${LOG2G_LABEL}_nonpositive: ; [x]`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    JZ ${LOG2G_LABEL}_zero`,
    `    PUSH32 ${NAN}`,
    `    RET`,
    `${LOG2G_LABEL}_zero:`,
    `    PUSH32 0xFF800000`,
    `    RET`,
];

/**
 * EXP. e ** x = 2 ** n * e ** r with n the nearest integer to x / ln 2 and r = x - n ln 2 (ln 2 in two
 * parts, so n * ln2_hi is exact), |r| <= 0.347; e ** r by its Taylor polynomial to r ** 7, and 2 ** n
 * applied as two powers of two so that no intermediate leaves the range of a REAL.
 */
const EXPF: string[] = [
    `${EXPF_LABEL}:           ; [x]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    PUSH32 0x7F800000`,
    `    GTU                 ; [x isNaN]`,
    `    JNZ ${EXPF_LABEL}_done`,
    `    DUP`,
    `    PUSH8 31`,
    `    SHR`,
    `    JNZ ${EXPF_LABEL}_negative`,
    `    DUP`,
    `    PUSH32 ${f(88.72283935546875)}`,
    `    GT`,
    `    JNZ ${EXPF_LABEL}_overflow`,
    `    JMP ${EXPF_LABEL}_reduce`,
    `${EXPF_LABEL}_negative: ; [x]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    PUSH32 ${f(103.2789)}`,
    `    GTU                 ; |x| above the point where the result is lost`,
    `    JNZ ${EXPF_LABEL}_underflow`,
    `${EXPF_LABEL}_reduce:    ; [x]`,
    `    DUP`,
    `    PUSH32 ${f(1 / Math.LN2)}`,
    `    MULF                ; [x t]`,
    `    DUP`,
    `    PUSH32 ${SIGN}`,
    `    AND`,
    `    PUSH32 ${HALF}`,
    `    OR                  ; [x t +-0.5]`,
    `    ADDF`,
    `    F2I                 ; [x n]`,
    `    DUP`,
    `    I2F                 ; [x n nf]`,
    `    PICK 2`,
    `    OVER`,
    `    PUSH32 ${f(0.693145751953125)}`,
    `    MULF`,
    `    SUBF                ; [x n nf x-nf*ln2_hi]`,
    `    SWAP`,
    `    PUSH32 ${f(1.428606765330187e-6)}`,
    `    MULF`,
    `    SUBF                ; [x n r]`,
    `    DUP`,
    `    PUSH32 ${f(1 / 5040)}`,
    `    MULF`,
    `    PUSH32 ${f(1 / 720)}`,
    `    ADDF                ; [x n r p]`,
    ...horner([1 / 120, 1 / 24, 1 / 6, 0.5, 1, 1]),
    `    SWAP`,
    `    DROP                ; [x n p]`,
    `    OVER`,
    `    PUSH8 1`,
    `    SAR                 ; [x n p h]  h = floor(n / 2)`,
    `    SWAP`,
    `    OVER`,
    `    PUSH8 127`,
    `    ADD`,
    `    PUSH8 23`,
    `    SHL                 ; [x n h p 2**h]`,
    `    MULF                ; [x n h p*2**h]`,
    `    ROT                 ; [x h pp n]`,
    `    ROT                 ; [x pp n h]`,
    `    SUB                 ; [x pp n-h]`,
    `    PUSH8 127`,
    `    ADD`,
    `    PUSH8 23`,
    `    SHL                 ; [x pp 2**(n-h)]`,
    `    MULF                ; [x result]`,
    `    SWAP`,
    `    DROP`,
    `    RET`,
    `${EXPF_LABEL}_overflow: ; [x]`,
    `    DROP`,
    `    PUSH32 0x7F800000`,
    `    RET`,
    `${EXPF_LABEL}_underflow: ; [x]`,
    `    DROP`,
    `    PUSH8 0`,
    `${EXPF_LABEL}_done:     ; [x] or [0.0]`,
    `    RET`,
];

/**
 * SIN and COS: [x phase] -> [sin(x + phase * pi / 2)]. The angle is reduced to r in [-pi/4, pi/4]
 * by x = n pi/2 + r (pi/2 in three parts, so n * part is exact up to |n| = 2^16 and the error stays
 * below 1e-6 up to |x| of about 10^5); the quadrant (n + phase) mod 4 picks sin r or cos r and the
 * sign. A magnitude of 100000 or more is not reduced (n * part is no longer exact): the result is NaN.
 */
const SINCOSF: string[] = [
    `${SINCOSF_LABEL}:        ; [x phase]`,
    `    SWAP                ; [phase x]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    PUSH32 ${f(100000)}`,
    `    LTU                 ; [phase x |x|<1e5]  (a NaN is not below it)`,
    `    JZ ${SINCOSF_LABEL}_nan`,
    `    DUP`,
    `    PUSH32 ${f(2 / Math.PI)}`,
    `    MULF                ; [phase x t]`,
    `    DUP`,
    `    PUSH32 ${SIGN}`,
    `    AND`,
    `    PUSH32 ${HALF}`,
    `    OR`,
    `    ADDF`,
    `    F2I                 ; [phase x n]`,
    `    DUP`,
    `    I2F                 ; [phase x n nf]`,
    `    PICK 2`,
    `    OVER`,
    `    PUSH32 ${f(1.5703125)}`,
    `    MULF`,
    `    SUBF                ; [phase x n nf y1]`,
    `    OVER`,
    `    PUSH32 ${f(4.837512969970703125e-4)}`,
    `    MULF`,
    `    SUBF                ; [phase x n nf y2]`,
    `    SWAP`,
    `    PUSH32 ${f(7.549789948768648e-8)}`,
    `    MULF`,
    `    SUBF                ; [phase x n r]`,
    `    ROT`,
    `    DROP                ; [phase n r]`,
    `    SWAP`,
    `    ROT                 ; [r n phase]`,
    `    ADD`,
    `    PUSH8 3`,
    `    AND                 ; [r q]`,
    `    DUP`,
    `    PUSH8 1`,
    `    AND`,
    `    JNZ ${SINCOSF_LABEL}_cos`,
    `    SWAP                ; [q r]`,
    `    DUP`,
    `    DUP`,
    `    MULF                ; [q r z]`,
    `    DUP`,
    `    PUSH32 ${f(1 / 362880)}`,
    `    MULF`,
    `    PUSH32 ${f(-1 / 5040)}`,
    `    ADDF                ; [q r z a]`,
    ...horner([1 / 120, -1 / 6]),
    `    MULF                ; [q r z*p]`,
    `    OVER`,
    `    MULF`,
    `    ADDF                ; [q sin r]`,
    `    JMP ${SINCOSF_LABEL}_sign`,
    `${SINCOSF_LABEL}_cos:   ; [r q]`,
    `    SWAP                ; [q r]`,
    `    DUP`,
    `    MULF                ; [q z]`,
    `    DUP`,
    `    PUSH32 ${f(-1 / 3628800)}`,
    `    MULF`,
    `    PUSH32 ${f(1 / 40320)}`,
    `    ADDF                ; [q z a]`,
    ...horner([-1 / 720, 1 / 24, -0.5]),
    `    MULF                ; [q z*p]`,
    `    PUSH32 ${ONE}`,
    `    ADDF                ; [q cos r]`,
    `${SINCOSF_LABEL}_sign:  ; [q v]`,
    `    SWAP`,
    `    PUSH8 1`,
    `    SHR`,
    `    PUSH8 31`,
    `    SHL                 ; [v sign of the quadrant]`,
    `    XOR`,
    `    RET`,
    `${SINCOSF_LABEL}_nan:   ; [phase x]`,
    `    DROP`,
    `    DROP`,
    `    PUSH32 ${NAN}`,
    `    RET`,
];

/** TAN = sin / cos; a cosine of exactly 0 gives the sine over 1e-30, a very large finite number. */
const TANF: string[] = [
    `${TANF_LABEL}:           ; [x]`,
    `    DUP`,
    `    PUSH8 0`,
    `    CALL ${SINCOSF_LABEL}  ; [x sin]`,
    `    SWAP`,
    `    PUSH8 1`,
    `    CALL ${SINCOSF_LABEL}  ; [sin cos]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    JZ ${TANF_LABEL}_zero`,
    `    DIVF`,
    `    RET`,
    `${TANF_LABEL}_zero:     ; [sin cos]`,
    `    DROP`,
    `    PUSH32 ${f(1e-30)}`,
    `    DIVF`,
    `    RET`,
];

/**
 * ATAN, as Cephes atanf: for a = |x| above tan(3 pi/8) the angle is pi/2 + atan(-1/a); above
 * tan(pi/8) it is pi/4 + atan((a-1)/(a+1)); the remaining argument is below tan(pi/8) and a
 * polynomial of degree 7 gives its arctangent. The sign of x is put back last.
 */
const ATANF: string[] = [
    `${ATANF_LABEL}:          ; [x]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND                 ; [x a]`,
    `    DUP`,
    `    PUSH32 ${f(2.414213562373095)}`,
    `    GT`,
    `    JNZ ${ATANF_LABEL}_big`,
    `    DUP`,
    `    PUSH32 ${f(0.4142135623730950)}`,
    `    GT`,
    `    JNZ ${ATANF_LABEL}_mid`,
    `    PUSH8 0             ; [x a y]`,
    `    JMP ${ATANF_LABEL}_poly`,
    `${ATANF_LABEL}_big:     ; [x a]`,
    `    PUSH32 ${f(-1)}`,
    `    SWAP`,
    `    DIVF                ; [x -1/a]`,
    `    PUSH32 ${f(Math.PI / 2)}`,
    `    JMP ${ATANF_LABEL}_poly`,
    `${ATANF_LABEL}_mid:     ; [x a]`,
    `    DUP`,
    `    PUSH32 ${ONE}`,
    `    SUBF`,
    `    SWAP`,
    `    PUSH32 ${ONE}`,
    `    ADDF`,
    `    DIVF                ; [x (a-1)/(a+1)]`,
    `    PUSH32 ${f(Math.PI / 4)}`,
    `${ATANF_LABEL}_poly:    ; [x a y]`,
    `    SWAP`,
    `    DUP`,
    `    DUP`,
    `    MULF                ; [x y a z]`,
    `    DUP`,
    `    PUSH32 ${f(8.05374449538e-2)}`,
    `    MULF`,
    `    PUSH32 ${f(-1.38776856032e-1)}`,
    `    ADDF                ; [x y a z p]`,
    ...horner([1.99777106478e-1, -3.33329491539e-1]),
    `    MULF`,
    `    OVER`,
    `    MULF`,
    `    ADDF                ; [x y a+a*z*p]`,
    `    ADDF                ; [x angle]`,
    `    SWAP`,
    `    PUSH32 ${SIGN}`,
    `    AND`,
    `    OR                  ; the sign of x`,
    `    RET`,
];

/** ASIN = atan(x / sqrt((1 - x)(1 + x))); +-1 is +-pi/2 and a magnitude above 1 (or a NaN) is NaN. */
const ASINF: string[] = [
    `${ASINF_LABEL}:          ; [x]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND                 ; [x a]`,
    `    DUP`,
    `    PUSH32 ${ONE}`,
    `    LTU`,
    `    JZ ${ASINF_LABEL}_edge`,
    `    DROP                ; [x]`,
    `    DUP`,
    `    PUSH32 ${ONE}`,
    `    SWAP`,
    `    SUBF                ; [x 1-x]`,
    `    OVER`,
    `    PUSH32 ${ONE}`,
    `    ADDF                ; [x 1-x 1+x]`,
    `    MULF`,
    `    CALL ${SQRTF_LABEL}   ; [x d]`,
    `    DIVF`,
    `    CALL ${ATANF_LABEL}`,
    `    RET`,
    `${ASINF_LABEL}_edge:    ; [x a]`,
    `    PUSH32 ${ONE}`,
    `    EQ`,
    `    JZ ${ASINF_LABEL}_nan`,
    `    PUSH32 ${f(Math.PI / 2)}`,
    `    SWAP`,
    `    PUSH32 ${SIGN}`,
    `    AND`,
    `    OR`,
    `    RET`,
    `${ASINF_LABEL}_nan:     ; [x]`,
    `    DROP`,
    `    PUSH32 ${NAN}`,
    `    RET`,
];

/** ACOS = 2 atan(sqrt((1 - x) / (1 + x))), exact near x = 1; -1 is pi, a magnitude above 1 is NaN. */
const ACOSF: string[] = [
    `${ACOSF_LABEL}:          ; [x]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    PUSH32 ${ONE}`,
    `    GTU`,
    `    JNZ ${ACOSF_LABEL}_nan`,
    `    DUP`,
    `    PUSH32 ${f(-1)}`,
    `    EQ`,
    `    JNZ ${ACOSF_LABEL}_minus_one`,
    `    DUP`,
    `    PUSH32 ${ONE}`,
    `    SWAP`,
    `    SUBF                ; [x 1-x]`,
    `    SWAP`,
    `    PUSH32 ${ONE}`,
    `    ADDF                ; [1-x 1+x]`,
    `    DIVF`,
    `    CALL ${SQRTF_LABEL}`,
    `    CALL ${ATANF_LABEL}`,
    `    PUSH32 ${f(2)}`,
    `    MULF`,
    `    RET`,
    `${ACOSF_LABEL}_minus_one: ; [x]`,
    `    DROP`,
    `    PUSH32 ${f(Math.PI)}`,
    `    RET`,
    `${ACOSF_LABEL}_nan:     ; [x]`,
    `    DROP`,
    `    PUSH32 ${NAN}`,
    `    RET`,
];

/** ATAN2(y, x): [y x] -> [angle in (-pi, pi]]; (0, 0) is 0. */
const ATAN2F: string[] = [
    `${ATAN2F_LABEL}:         ; [y x]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    JZ ${ATAN2F_LABEL}_xzero`,
    `    DUP`,
    `    PUSH8 31`,
    `    SHR`,
    `    JNZ ${ATAN2F_LABEL}_xneg`,
    `    DIVF                ; [y/x]`,
    `    CALL ${ATANF_LABEL}`,
    `    RET`,
    `${ATAN2F_LABEL}_xneg:   ; [y x] x < 0: atan(y/x) + pi, or - pi when y is negative`,
    `    OVER`,
    `    PUSH8 31`,
    `    SHR                 ; [y x yneg]`,
    `    ROT`,
    `    ROT                 ; [yneg y x]`,
    `    DIVF`,
    `    CALL ${ATANF_LABEL} ; [yneg a]`,
    `    SWAP`,
    `    JNZ ${ATAN2F_LABEL}_below`,
    `    PUSH32 ${f(Math.PI)}`,
    `    ADDF`,
    `    RET`,
    `${ATAN2F_LABEL}_below: ; [a]`,
    `    PUSH32 ${f(-Math.PI)}`,
    `    ADDF`,
    `    RET`,
    `${ATAN2F_LABEL}_xzero:  ; [y x]`,
    `    DROP`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    JZ ${ATAN2F_LABEL}_origin`,
    `    PUSH32 ${SIGN}`,
    `    AND`,
    `    PUSH32 ${f(Math.PI / 2)}`,
    `    OR                  ; +-pi/2`,
    `    RET`,
    `${ATAN2F_LABEL}_origin: ; [y]`,
    `    DROP`,
    `    PUSH8 0`,
    `    RET`,
];

export const MATH_ROUTINES: Routine[] = [
    { label: SQRTF_LABEL, lines: SQRTF, needs: [SQRTN_LABEL] },
    { label: SQRTN_LABEL, lines: SQRTN, needs: [] },
    { label: LOG2G_LABEL, lines: LOG2G, needs: [LOG2F_LABEL] },
    { label: EXPF_LABEL, lines: EXPF, needs: [] },
    { label: SINCOSF_LABEL, lines: SINCOSF, needs: [] },
    { label: TANF_LABEL, lines: TANF, needs: [SINCOSF_LABEL] },
    { label: ATANF_LABEL, lines: ATANF, needs: [] },
    { label: ASINF_LABEL, lines: ASINF, needs: [SQRTF_LABEL, ATANF_LABEL] },
    { label: ACOSF_LABEL, lines: ACOSF, needs: [SQRTF_LABEL, ATANF_LABEL] },
    { label: ATAN2F_LABEL, lines: ATAN2F, needs: [ATANF_LABEL] },
];
