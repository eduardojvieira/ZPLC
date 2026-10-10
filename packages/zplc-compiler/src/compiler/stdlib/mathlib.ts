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
 *   SIN, COS   any finite x              sine, cosine; NaN for NaN and       absolute 2e-7 to 1000, 2e-6
 *                                        infinity                             to 2^40, 1e-4 to 2^48; finite
 *                                                                             (meaningless) beyond
 *   TAN        any finite x              sin x / cos x                        relative 3e-7 to 1000
 *   ATAN       any x                     (-pi/2, pi/2)                        absolute 1.5e-7
 *   ASIN       -1 <= x <= 1              [-pi/2, pi/2]; NaN outside           absolute 3.0e-7
 *   ACOS       -1 <= x <= 1              [0, pi]; NaN outside                 absolute 3.0e-7
 *   ATAN2      any (y, x)                (-pi, pi]; 0 for (0, 0)              absolute 3.0e-7
 *
 * A NaN argument gives a NaN. The only instruction that can fault is DIVF with a divisor of 0.0, and
 * every division here is guarded, so no routine faults on any argument.
 *
 * Instructions executed (no loop depends on the argument): at most 40 for SQRT, 90 for EXP and
 * LN, 75 for SIN and COS up to |x| = 100000 and 430 above it (the reduction of a large angle:
 * 265, 345 or 430 by its size), 160 for TAN up to 100000 and 520 above it, 105 for ASIN and ACOS.
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
const REDUCEBIG_LABEL = '_zplc_reducebig';
const PISTEP_LABEL = '_zplc_pistep';
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
 * 2 pi as the sum of three REAL constants of 12 significant bits each, largest first, and what is
 * left of it over 2 pi. A product of one of the parts and an integer of 12 bits is a 24-bit number:
 * exact in a REAL, which is what lets the reduction of a large angle subtract whole multiples of 2 pi
 * without a rounding; the parts hold 2 pi to 1e-11, and the rest (TWO_PI_REST, 1.6e-12 of 2 pi) is
 * applied once at the end as x * TWO_PI_REST, where its own relative error of 2^-24 is below 1e-19 x.
 */
const TWO_PI = (() => {
    // the first digits of pi, as an integer; 2 pi is twice that over 10^(digits - 1)
    const digits = '3141592653589793238462643383279502884197169399375105820974944592307816406286208998628034825342117067';
    const FRACTION_BITS = 400n;
    let rest = ((2n * BigInt(digits)) << FRACTION_BITS) / 10n ** BigInt(digits.length - 1);
    const whole = Number(rest) / 2 ** Number(FRACTION_BITS);
    const parts: number[] = [];
    for (let i = 0; i < 3; i += 1) {
        const top = BigInt(rest.toString(2).length - 1);
        const shift = top - 11n;
        const chunk = (rest >> shift) << shift;
        parts.push(Number(chunk >> shift) * 2 ** (Number(shift) - Number(FRACTION_BITS)));
        rest -= chunk;
    }
    return { parts, restOverTwoPi: Number(rest) / 2 ** Number(FRACTION_BITS) / whole };
})();
export const TWO_PI_PARTS: number[] = TWO_PI.parts;
export const TWO_PI_REST: number = TWO_PI.restOverTwoPi;

/**
 * One stage of the reduction of a large angle: [hi lo s] -> [hi' lo'] with s a power of two. The
 * remainder is the sum hi + lo (a REAL and the rounding error that REAL could not hold); the stage
 * folds lo into hi where hi has the room, then subtracts n * s * 2 pi, n = trunc(hi / (s * 2 pi))
 * (at most 4096 when the remainder is below 4096 * s * 2 pi), one part of 2 pi at a time
 * (TWO_PI_PARTS).
 *
 * Each product n * s * part is exact (12 bits by 12 bits), and each subtraction is done with
 * Fast2Sum, which returns the rounded difference and its rounding error exactly (the subtracted
 * product is never larger than the remainder: the divisor carries a margin of 2^-20, so n is never
 * one too many). The error goes into lo, so the stage loses nothing: lo is a multiple of the
 * last part times s, which its 24 bits can hold at every scale, and it is folded back into hi
 * at the start of the next stage as soon as hi is small enough to take it.
 */
const PISTEP: string[] = [
    `${PISTEP_LABEL}:         ; [hi lo s]`,
    `    ROT`,
    `    ROT                 ; [s hi lo]`,
    `    OVER`,
    `    OVER`,
    `    ADDF                ; [s hi lo t]  t = hi + lo`,
    `    DUP`,
    `    PICK 3`,
    `    SUBF                ; [s hi lo t z]  z = t - hi`,
    `    ROT`,
    `    SWAP`,
    `    SUBF                ; [s hi t lo-z]`,
    `    SWAP                ; [s hi lo' t]`,
    `    ROT`,
    `    DROP                ; [s lo' t]`,
    `    SWAP                ; [s hi lo]  the remainder, folded`,
    `    PICK 1`,
    `    PICK 3`,
    `    PUSH32 ${f(2 * Math.PI * (1 + 2 ** -20))}`,
    `    MULF                ; [s hi lo hi s*2pi']`,
    `    DIVF                ; [s hi lo q]`,
    `    F2I`,
    `    I2F                 ; [s hi lo n]`,
    `    PICK 3`,
    `    MULF                ; [s hi lo n*s]`,
    `    ROT`,
    `    ROT                 ; [s ns hi lo]`,
    ...TWO_PI_PARTS.flatMap((part, index) => [
        `    PICK 2`,
        `    PUSH32 ${f(part)}`,
        `    MULF                ; [s ns hi lo t]  part ${index + 1}`,
        `    PICK 2`,
        `    OVER`,
        `    SUBF                ; [s ns hi lo t u]  u = hi - t`,
        `    DUP`,
        `    PICK 4`,
        `    SUBF                ; [s ns hi lo t u z]  z = u - hi`,
        `    ROT`,
        `    ADDF`,
        `    NEGF                ; [s ns hi lo u err]  err = -(t + z)`,
        `    ROT`,
        `    ADDF                ; [s ns hi u lo+err]`,
        `    ROT`,
        `    DROP                ; [s ns u lo']`,
    ]),
    `    ROT                 ; [s hi lo ns]`,
    `    DROP                ; [s hi' lo']`,
    `    ROT                 ; [hi' lo' s]`,
    `    DROP                ; [hi' lo']`,
    `    RET`,
];

/**
 * An angle of 100000 or more, or a NaN or an infinity: [x] -> [r], r = x mod 2 pi (the sign of x kept,
 * |r| < 2 pi + 1e-6) for every finite x below 2 pi * 2^48 (1.8e15), where the stages hold the whole
 * of x. At most four stages (scales 2^36, 2^24, 2^12 and 1), entered by the size of x, no loop; the
 * part of 2 pi beyond the three parts of the stages is x * TWO_PI_REST, taken from the original x
 * and subtracted at the end. The error is a rounding of the result (3e-7) up to 2^40 and
 * x * 1e-19 above it. A larger x is a REAL whose own spacing is above 2^25 and an angle that carries
 * no information: the guard returns 0.0 when the result is outside the range the caller reduces, so
 * the answer is finite. A NaN stays a NaN and an infinity becomes a NaN.
 */
const REDUCEBIG: string[] = [
    `${REDUCEBIG_LABEL}:      ; [x]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND                 ; [x a]`,
    `    DUP`,
    `    PUSH32 0x7F800000`,
    `    GE`,
    `    JNZ ${REDUCEBIG_LABEL}_nonfinite`,
    `    OVER                ; [x a x]`,
    `    SWAP                ; [x x a]`,
    `    DUP`,
    `    PUSH32 ${f(2 * Math.PI * 2 ** 36)}`,
    `    GE`,
    `    JNZ ${REDUCEBIG_LABEL}_36`,
    `    PUSH32 ${f(2 * Math.PI * 2 ** 24)}`,
    `    GE                  ; [x x a>=2pi*2^24]`,
    `    JNZ ${REDUCEBIG_LABEL}_24`,
    `    PUSH8 0             ; [x x 0]`,
    `    JMP ${REDUCEBIG_LABEL}_12`,
    `${REDUCEBIG_LABEL}_36:  ; [x x a]`,
    `    DROP`,
    `    PUSH8 0`,
    `    PUSH32 ${f(2 ** 36)}`,
    `    CALL ${PISTEP_LABEL}   ; [x hi lo]`,
    `    JMP ${REDUCEBIG_LABEL}_24b`,
    `${REDUCEBIG_LABEL}_24:  ; [x x]`,
    `    PUSH8 0`,
    `${REDUCEBIG_LABEL}_24b: ; [x hi lo]`,
    `    PUSH32 ${f(2 ** 24)}`,
    `    CALL ${PISTEP_LABEL}`,
    `${REDUCEBIG_LABEL}_12:  ; [x hi lo]`,
    `    PUSH32 ${f(2 ** 12)}`,
    `    CALL ${PISTEP_LABEL}`,
    `    PUSH32 ${ONE}`,
    `    CALL ${PISTEP_LABEL}`,
    `    ADDF                ; [x R]`,
    `    SWAP`,
    `    PUSH32 ${f(TWO_PI_REST)}`,
    `    MULF                ; [R x*rest]`,
    `    SUBF                ; [r]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    PUSH32 ${f(100000)}`,
    `    LTU                 ; [r |r|<1e5]`,
    `    JNZ ${REDUCEBIG_LABEL}_done`,
    `    DROP`,
    `    PUSH8 0`,
    `${REDUCEBIG_LABEL}_done: ; [r]`,
    `    RET`,
    `${REDUCEBIG_LABEL}_nonfinite: ; [x a]`,
    `    PUSH32 0x7F800000`,
    `    GTU                 ; a NaN stays itself`,
    `    JNZ ${REDUCEBIG_LABEL}_keep`,
    `    DROP`,
    `    PUSH32 ${NAN}`,
    `${REDUCEBIG_LABEL}_keep: ; [x] or [NaN]`,
    `    RET`,
];

/**
 * SIN and COS: [x phase] -> [sin(x + phase * pi / 2)]. The angle is reduced to r in [-pi/4, pi/4]
 * by x = n pi/2 + r (pi/2 in three parts, so n * part is exact up to |n| = 2^16 and the error stays
 * below 2e-6 up to |x| = 100000); the quadrant (n + phase) mod 4 picks sin r or cos r and the sign.
 * An angle of 100000 or more is first reduced modulo 2 pi by _zplc_reducebig, with the same error
 * up to 2^48; an infinity or a NaN gives a NaN and every other REAL gives a finite result.
 */
const SINCOSF: string[] = [
    `${SINCOSF_LABEL}:        ; [x phase]`,
    `    SWAP                ; [phase x]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    PUSH32 ${f(100000)}`,
    `    LTU                 ; [phase x |x|<1e5]`,
    `    JNZ ${SINCOSF_LABEL}_small`,
    `    CALL ${REDUCEBIG_LABEL} ; [phase r]  |r| < 2 pi, or a NaN`,
    `${SINCOSF_LABEL}_small: ; [phase x]`,
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
];

/**
 * TAN = sin / cos; a cosine of exactly 0 gives the sine over 1e-30, a very large finite number.
 * An angle of 100000 or more is reduced once here, so the two calls of the sine routine do not
 * reduce it again.
 */
const TANF: string[] = [
    `${TANF_LABEL}:           ; [x]`,
    `    DUP`,
    `    PUSH32 ${ABS_MASK}`,
    `    AND`,
    `    PUSH32 ${f(100000)}`,
    `    LTU`,
    `    JNZ ${TANF_LABEL}_small`,
    `    CALL ${REDUCEBIG_LABEL} ; [r]`,
    `${TANF_LABEL}_small:    ; [x]`,
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
    { label: SINCOSF_LABEL, lines: SINCOSF, needs: [REDUCEBIG_LABEL] },
    { label: REDUCEBIG_LABEL, lines: REDUCEBIG, needs: [PISTEP_LABEL] },
    { label: PISTEP_LABEL, lines: PISTEP, needs: [] },
    { label: TANF_LABEL, lines: TANF, needs: [SINCOSF_LABEL, REDUCEBIG_LABEL] },
    { label: ATANF_LABEL, lines: ATANF, needs: [] },
    { label: ASINF_LABEL, lines: ASINF, needs: [SQRTF_LABEL, ATANF_LABEL] },
    { label: ACOSF_LABEL, lines: ACOSF, needs: [SQRTF_LABEL, ATANF_LABEL] },
    { label: ATAN2F_LABEL, lines: ATAN2F, needs: [ATANF_LABEL] },
];
