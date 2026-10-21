/**
 * ZPLC Standard Library - Mathematical Functions
 *
 * SPDX-License-Identifier: MIT
 *
 * IEC 61131-3 numerical functions, called as inline expressions:
 * - ABS, NEG, MOD: wrappers for opcodes
 * - SQRT, EXP, LN, LOG, SIN, COS, TAN, ASIN, ACOS, ATAN, ATAN2: REAL routines of mathlib.ts, which
 *   states the domain and the measured error of each (the VM has no opcode for them)
 * - EXPT: the power routine of power.ts, the one of the operator `**`
 * - TRUNC, ROUND: rounding of a REAL (or an LREAL) that keeps its type
 *
 * An LREAL argument (CMP-015): ABS, NEG, SQRT, TRUNC and ROUND are exact. The other functions
 * compute in REAL: the argument is rounded to REAL, the result is widened back to LREAL, and the
 * accuracy is that of a REAL (about 7 significant digits).
 *
 * The conversion functions `<FROM>_TO_<TO>` are in conversions.ts.
 */

import type { FunctionDef, CodeGenContext } from './types.ts';
import type { Expression } from '../ast.ts';
import { f32hex, isFloatType, isUnsigned32, isWideInteger, numericInfo } from '../numeric.ts';
import { POWF_LABEL } from '../power.ts';
import { ROUNDAD_LABEL, ROUNDAF_LABEL, TRUNCD_LABEL, TRUNCF_LABEL } from './routines.ts';
import {
    ACOSF_LABEL,
    ASINF_LABEL,
    ATAN2F_LABEL,
    ATANF_LABEL,
    EXPF_LABEL,
    LOG2G_LABEL,
    SINCOSF_LABEL,
    SQRTF_LABEL,
    TANF_LABEL,
} from './mathlib.ts';

// ============================================================================
// ABS - Absolute Value (Integer)
// ============================================================================

/**
 * ABS(IN) -> OUT
 *
 * Returns the absolute value of an integer.
 * This is a wrapper for the native ABS opcode.
 *
 * Stack: [IN] -> [|IN|]
 */
export const ABS_FN: FunctionDef = {
    name: 'ABS',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.fail('ABS requires 1 argument');
        }

        ctx.emit(`    ; ABS(IN)`);
        ctx.emitExpression(args[0]);
        const type = ctx.typeOf?.(args[0]);
        if (type === 'LREAL') {
            ctx.emit(`    ABSD`);
        } else if (isWideInteger(type)) {
            // LINT and DT: the magnitude (INT64_MIN stays INT64_MIN); ULINT and LWORD are their own magnitude
            if (numericInfo(type)?.signed) ctx.emit(`    ABS64`);
        } else if (isFloatType(type)) {
            ctx.emit(`    ABSF`);
        } else if (!isUnsigned32(type)) {
            // an unsigned value is its own magnitude
            ctx.emit(`    ABS`);
        }
    },
};

// ============================================================================
// ABSF - Absolute Value (Float)
// ============================================================================

/**
 * ABSF(IN) -> OUT
 *
 * Returns the absolute value of a float.
 * This is a wrapper for the native ABSF opcode.
 *
 * Stack: [IN] -> [|IN|]
 */
export const ABSF_FN: FunctionDef = {
    name: 'ABSF',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.fail('ABSF requires 1 argument');
        }

        ctx.emit(`    ; ABSF(IN)`);
        ctx.emitExpression(args[0]);
        ctx.emit(ctx.typeOf?.(args[0]) === 'LREAL' ? `    ABSD` : `    ABSF`);
    },
};

// ============================================================================
// NEG - Negation (Integer)
// ============================================================================

/**
 * NEG(IN) -> OUT
 *
 * Returns the negation of an integer (-IN).
 * This is a wrapper for the native NEG opcode.
 *
 * Stack: [IN] -> [-IN]
 */
export const NEG_FN: FunctionDef = {
    name: 'NEG',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.fail('NEG requires 1 argument');
        }

        ctx.emit(`    ; NEG(IN)`);
        ctx.emitExpression(args[0]);
        const type = ctx.typeOf?.(args[0]);
        ctx.emit(type === 'LREAL' ? `    NEGD` : isWideInteger(type) ? `    NEG64` : isFloatType(type) ? `    NEGF` : `    NEG`);
    },
};

// ============================================================================
// NEGF - Negation (Float)
// ============================================================================

/**
 * NEGF(IN) -> OUT
 *
 * Returns the negation of a float (-IN).
 * This is a wrapper for the native NEGF opcode.
 *
 * Stack: [IN] -> [-IN]
 */
export const NEGF_FN: FunctionDef = {
    name: 'NEGF',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.fail('NEGF requires 1 argument');
        }

        ctx.emit(`    ; NEGF(IN)`);
        ctx.emitExpression(args[0]);
        ctx.emit(ctx.typeOf?.(args[0]) === 'LREAL' ? `    NEGD` : `    NEGF`);
    },
};

// ============================================================================
// MOD - Modulo
// ============================================================================

/**
 * MOD(IN1, IN2) -> OUT
 *
 * Returns IN1 modulo IN2.
 * This is a wrapper for the native MOD opcode.
 *
 * Stack: [IN1, IN2] -> [IN1 % IN2]
 */
export const MOD_FN: FunctionDef = {
    name: 'MOD',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.fail('MOD requires 2 arguments');
        }

        ctx.emit(`    ; MOD(IN1, IN2)`);
        ctx.emitExpression(args[0]);
        ctx.emitExpression(args[1]);
        ctx.emit(`    MOD`);
    },
};

/**
 * The shape of every function that takes REAL arguments and calls a routine: the arguments are
 * emitted as REAL (an integer is converted, as it is in an arithmetic operand), then `CALL label`.
 */
function emitRealCall(ctx: CodeGenContext, name: string, args: Expression[], count: number, label: string): void {
    if (args.length !== count) {
        ctx.fail(`${name} requires ${count} argument${count === 1 ? '' : 's'}`);
    }
    if (!ctx.callRoutine) ctx.fail(`${name} needs the routine linker`, 'INTERNAL_COMPILER_ERROR');

    ctx.emit(`    ; ${name}(${args.length === 1 ? 'IN' : 'IN1, IN2'})`);
    for (const arg of args) {
        if (ctx.emitOperand) ctx.emitOperand(arg, 'REAL');
        else ctx.emitExpression(arg);
    }
    ctx.callRoutine(label);
}

/**
 * The transcendental functions compute in REAL. An LREAL argument is rounded to REAL (D2F), and the result is
 * widened back (F2D) so that the function still gives an LREAL: its accuracy is that of a REAL (about 7
 * significant digits), not that of the double that went in. SQRT, ABS, TRUNC and ROUND are exact.
 */
function hasDoubleArgument(ctx: CodeGenContext, args: Expression[]): boolean {
    return args.some((arg) => ctx.typeOf?.(arg) === 'LREAL');
}

function widenResult(ctx: CodeGenContext, args: Expression[]): void {
    if (hasDoubleArgument(ctx, args)) ctx.emit(`    F2D                 ; the REAL result as an LREAL`);
}

// ============================================================================
// SQRT - Square Root
// ============================================================================

/**
 * SQRT(IN) -> OUT
 *
 * Square root of a REAL. A value of 0 or below gives 0.0 (IEC 61131-3 leaves it undefined). The
 * routine (mathlib.ts) is within one unit of the last place for every positive REAL.
 *
 * Stack: [IN] -> [sqrt(IN)]
 */
export const SQRT_FN: FunctionDef = {
    name: 'SQRT',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length === 1 && ctx.typeOf?.(args[0]!) === 'LREAL') {
            // correctly rounded, and 0.0 for an argument of 0.0 or below, as for a REAL
            ctx.emit(`    ; SQRT(IN) on an LREAL`);
            ctx.emitExpression(args[0]!);
            ctx.emit(`    SQRTD`);
            return;
        }
        emitRealCall(ctx, 'SQRT', args, 1, SQRTF_LABEL);
    },
};

// ============================================================================
// EXPT - Exponentiation
// ============================================================================

/**
 * EXPT(BASE, EXP) -> OUT
 *
 * BASE raised to EXP, a REAL, exactly as the operator `**`: both operands are converted to REAL and
 * the routine of power.ts computes the power. An integer exponent (negative and 0 included) is
 * computed by repeated squaring and is exact when the products are; a REAL exponent through
 * 2 ** (EXP * log2 BASE).
 *
 * Stack: [BASE, EXP] -> [BASE ** EXP]
 */
export const EXPT_FN: FunctionDef = {
    name: 'EXPT',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        emitRealCall(ctx, 'EXPT', args, 2, POWF_LABEL);
        widenResult(ctx, args);
    },
};

// ============================================================================
// TRUNC - Truncate toward zero
// ============================================================================

/**
 * TRUNC(IN) -> OUT
 *
 * Truncates a REAL toward zero (removes the fractional part) and keeps it a REAL. A magnitude of 2^23
 * or more has no fractional part and is returned as it is, so the conversion never saturates.
 * The integer result is REAL_TO_DINT(TRUNC(x)).
 *
 * Stack: [IN] -> [trunc(IN)]
 */
export const TRUNC_FN: FunctionDef = {
    name: 'TRUNC',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.fail('TRUNC requires 1 argument');
        }
        if (!ctx.callRoutine) ctx.fail('TRUNC needs the routine linker', 'INTERNAL_COMPILER_ERROR');

        ctx.emit(`    ; TRUNC(IN)`);
        if (ctx.typeOf?.(args[0]) === 'LREAL') {
            ctx.emitExpression(args[0]);
            ctx.callRoutine(TRUNCD_LABEL);
            return;
        }
        if (ctx.emitOperand) ctx.emitOperand(args[0], 'REAL');
        else ctx.emitExpression(args[0]);
        ctx.callRoutine(TRUNCF_LABEL);
    },
};

// ============================================================================
// ROUND - Round to nearest integer
// ============================================================================

/**
 * ROUND(IN) -> OUT
 *
 * Rounds a REAL to the nearest whole number and keeps it a REAL; an exact half goes away from zero
 * (ROUND(2.5) = 3.0, ROUND(-2.5) = -3.0). It is not an IEC 61131-3 function: REAL_TO_INT and its
 * relatives round an exact half to the even integer. A magnitude of 2^23 or more is returned as it is.
 *
 * Stack: [IN] -> [round(IN)]
 */
export const ROUND_FN: FunctionDef = {
    name: 'ROUND',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.fail('ROUND requires 1 argument');
        }
        if (!ctx.callRoutine) ctx.fail('ROUND needs the routine linker', 'INTERNAL_COMPILER_ERROR');

        ctx.emit(`    ; ROUND(IN)`);
        if (ctx.typeOf?.(args[0]) === 'LREAL') {
            ctx.emitExpression(args[0]);
            ctx.callRoutine(ROUNDAD_LABEL);
            return;
        }
        if (ctx.emitOperand) ctx.emitOperand(args[0], 'REAL');
        else ctx.emitExpression(args[0]);
        ctx.callRoutine(ROUNDAF_LABEL);
    },
};

// ============================================================================
// SIN, COS, TAN
// ============================================================================

/**
 * SIN(IN), COS(IN), TAN(IN) -> OUT
 *
 * The angle is in radians. SIN and COS are accurate to 2e-7 for |IN| up to 1000 and to 2e-6 for |IN|
 * below 100000; TAN to a relative 4e-7. A magnitude of 100000 or more (or a NaN) gives a NaN: a
 * REAL no longer has the bits to say where on the circle it is. See mathlib.ts.
 */
export const SIN_FN: FunctionDef = {
    name: 'SIN',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) ctx.fail('SIN requires 1 argument');
        if (!ctx.callRoutine) ctx.fail('SIN needs the routine linker', 'INTERNAL_COMPILER_ERROR');
        ctx.emit(`    ; SIN(IN)`);
        if (ctx.emitOperand) ctx.emitOperand(args[0]!, 'REAL');
        else ctx.emitExpression(args[0]!);
        ctx.emit(`    PUSH8 0             ; sin(x + 0 * pi/2)`);
        ctx.callRoutine(SINCOSF_LABEL);
        widenResult(ctx, args);
    },
};

export const COS_FN: FunctionDef = {
    name: 'COS',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) ctx.fail('COS requires 1 argument');
        if (!ctx.callRoutine) ctx.fail('COS needs the routine linker', 'INTERNAL_COMPILER_ERROR');
        ctx.emit(`    ; COS(IN)`);
        if (ctx.emitOperand) ctx.emitOperand(args[0]!, 'REAL');
        else ctx.emitExpression(args[0]!);
        ctx.emit(`    PUSH8 1             ; sin(x + 1 * pi/2) = cos x`);
        ctx.callRoutine(SINCOSF_LABEL);
        widenResult(ctx, args);
    },
};

export const TAN_FN: FunctionDef = {
    name: 'TAN',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        emitRealCall(ctx, 'TAN', args, 1, TANF_LABEL);
        widenResult(ctx, args);
    },
};

// ============================================================================
// LN, LOG, EXP
// ============================================================================

/**
 * LN(IN), LOG(IN) -> OUT
 *
 * Natural logarithm and logarithm to base 10 of a REAL. 0.0 gives -infinity, a negative number or a
 * NaN a NaN. Relative error below 4e-7.
 */
export const LN_FN: FunctionDef = {
    name: 'LN',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        emitRealCall(ctx, 'LN', args, 1, LOG2G_LABEL);
        ctx.emit(`    PUSH32 ${f32hex(Math.LN2)}   ; ln 2`);
        ctx.emit(`    MULF`);
        widenResult(ctx, args);
    },
};

export const LOG_FN: FunctionDef = {
    name: 'LOG',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        emitRealCall(ctx, 'LOG', args, 1, LOG2G_LABEL);
        ctx.emit(`    PUSH32 ${f32hex(Math.LOG10E * Math.LN2)}   ; log10 2`);
        ctx.emit(`    MULF`);
        widenResult(ctx, args);
    },
};

/**
 * EXP(IN) -> OUT
 *
 * e raised to IN. Relative error below 1.3e-7; +infinity above 88.72284 and 0.0 below -103.28.
 */
export const EXP_FN: FunctionDef = {
    name: 'EXP',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        emitRealCall(ctx, 'EXP', args, 1, EXPF_LABEL);
        widenResult(ctx, args);
    },
};

// ============================================================================
// ASIN, ACOS, ATAN, ATAN2
// ============================================================================

/**
 * ASIN(IN), ACOS(IN), ATAN(IN) -> OUT in radians
 *
 * ASIN and ACOS take -1 to 1 (a NaN outside it) and return [-pi/2, pi/2] and [0, pi]; ATAN takes any
 * REAL and returns (-pi/2, pi/2). The error is below 4e-7 over the domain.
 */
export const ASIN_FN: FunctionDef = {
    name: 'ASIN',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        emitRealCall(ctx, 'ASIN', args, 1, ASINF_LABEL);
        widenResult(ctx, args);
    },
};

export const ACOS_FN: FunctionDef = {
    name: 'ACOS',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        emitRealCall(ctx, 'ACOS', args, 1, ACOSF_LABEL);
        widenResult(ctx, args);
    },
};

export const ATAN_FN: FunctionDef = {
    name: 'ATAN',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        emitRealCall(ctx, 'ATAN', args, 1, ATANF_LABEL);
        widenResult(ctx, args);
    },
};

/**
 * ATAN2(Y, X) -> OUT
 *
 * The angle of the point (X, Y) in (-pi, pi], from the positive X axis: the quadrant is the one of
 * the signs of X and Y. ATAN2(0.0, 0.0) is 0.0. The error is below 4e-7.
 */
export const ATAN2_FN: FunctionDef = {
    name: 'ATAN2',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        emitRealCall(ctx, 'ATAN2', args, 2, ATAN2F_LABEL);
        widenResult(ctx, args);
    },
};
