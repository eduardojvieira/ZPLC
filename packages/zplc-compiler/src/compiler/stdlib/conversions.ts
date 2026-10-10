/**
 * ZPLC Standard Library - type conversion functions (CMP-057, CMP-015)
 *
 * SPDX-License-Identifier: MIT
 *
 * A conversion function `<FROM>_TO_<TO>` exists for every ordered pair of different types among
 * BOOL, SINT, USINT, BYTE, INT, UINT, WORD, DINT, UDINT, DWORD, LINT, ULINT, LWORD, REAL, LREAL
 * and TIME. DATE, TOD and DT (CMP-017) have none yet: a call that names them is an unknown function.
 *
 * The VM keeps a value on the stack in the canonical 32-bit form of its type (numeric.ts), or as two
 * cells, low word deeper, for a 64-bit type, so most integer conversions are no code at all. The
 * families, and what each does with a value its destination cannot hold:
 *
 *   integer to a wider or equal integer      nothing, a sign word or a zero word: the value keeps its value
 *   integer to a narrower, or to the other   the low bits (two's complement wrap): INT_TO_SINT(300) = 44,
 *     signedness                             INT_TO_UINT(-1) = 65535, DINT_TO_ULINT(-1) = 2^64 - 1
 *   any integer, TIME to BOOL                FALSE for 0, TRUE for any other value
 *   BOOL to any numeric type                 0 or 1
 *   integer to REAL                          the nearest REAL (one rounding, also from a 64-bit integer)
 *   integer to LREAL                         the nearest LREAL (exact for 53 bits; one rounding above)
 *   REAL or LREAL to an integer              the nearest integer, an exact half to the even integer
 *                                            (2.5 -> 2, 3.5 -> 4, -2.5 -> -2); a value outside the
 *                                            range of the destination gives its nearest limit; NaN gives 0
 *   REAL to LREAL, LREAL to REAL             exact; the nearest REAL, an overflow is an infinity
 *   REAL or LREAL to BOOL                    FALSE for 0.0 and -0.0, TRUE for any other value, NaN included
 *   TIME                                     its count of milliseconds, as an unsigned 32-bit integer
 *
 * The argument is converted as the type it has: `INT_TO_REAL(x)` with a DINT or a UDINT `x` converts
 * that value (a type mismatch is for the type checker to report, CMP-005).
 */

import type { FunctionDef, CodeGenContext } from './types.ts';
import type { Expression } from '../ast.ts';
import { UNSIGNED_TO_REAL, isFloatType } from '../numeric.ts';
import { CLAMPI_LABEL, D2U32_LABEL, F2U32_LABEL, ROUNDF_LABEL } from './routines.ts';
import type { AsmLine } from '../asm-line.ts';

interface Shape {
    bits: 8 | 16 | 32 | 64;
    signed: boolean;
    /** Smallest and largest value of an integer type of 32 bits or less. */
    lo: number;
    hi: number;
}

const INTEGER_TYPES: Record<string, Shape> = {
    BOOL: { bits: 8, signed: false, lo: 0, hi: 1 },
    SINT: { bits: 8, signed: true, lo: -128, hi: 127 },
    USINT: { bits: 8, signed: false, lo: 0, hi: 255 },
    BYTE: { bits: 8, signed: false, lo: 0, hi: 255 },
    INT: { bits: 16, signed: true, lo: -32768, hi: 32767 },
    UINT: { bits: 16, signed: false, lo: 0, hi: 65535 },
    WORD: { bits: 16, signed: false, lo: 0, hi: 65535 },
    DINT: { bits: 32, signed: true, lo: -2147483648, hi: 2147483647 },
    UDINT: { bits: 32, signed: false, lo: 0, hi: 4294967295 },
    DWORD: { bits: 32, signed: false, lo: 0, hi: 4294967295 },
    // TIME is an unsigned count of milliseconds
    TIME: { bits: 32, signed: false, lo: 0, hi: 4294967295 },
    // two stack cells; the limits are not used (a 64-bit result needs no clamp)
    LINT: { bits: 64, signed: true, lo: -(2 ** 63), hi: 2 ** 63 - 1 },
    ULINT: { bits: 64, signed: false, lo: 0, hi: 2 ** 64 - 1 },
    LWORD: { bits: 64, signed: false, lo: 0, hi: 2 ** 64 - 1 },
};

/** Every type that has conversion functions, in the order the functions are registered. */
export const CONVERSION_TYPES = [...Object.keys(INTEGER_TYPES), 'REAL', 'LREAL'] as const;

/** Name of the function that converts `from` to `to`. */
export function conversionName(from: string, to: string): string {
    return `${from}_TO_${to}`;
}

/** The destination type of a conversion function name, or undefined when the name is not one. */
export function conversionResultType(functionName: string): string | undefined {
    const match = /^([A-Z0-9]+)_TO_([A-Z0-9]+)$/.exec(functionName.toUpperCase());
    if (!match) return undefined;
    const [, from, to] = match;
    return (CONVERSION_TYPES as readonly string[]).includes(from!) && (CONVERSION_TYPES as readonly string[]).includes(to!) && from !== to ? to : undefined;
}

/** The shortest PUSH of a small integer constant. */
function pushConstant(value: number): AsmLine {
    if (value >= -128 && value <= 127) return `    PUSH8 ${value}`;
    if (value >= -32768 && value <= 32767) return `    PUSH16 ${value}`;
    return `    PUSH32 ${value}`;
}

function isInteger(type: string): boolean {
    return type in INTEGER_TYPES;
}

function isWideInteger(type: string): boolean {
    return INTEGER_TYPES[type]?.bits === 64;
}

/** Emit the conversion of the value on the stack from `from` to `to` (different elementary types). */
function emitConversion(ctx: CodeGenContext, from: string, to: string): void {
    if (from === to) return;

    if (to === 'BOOL') {
        if (from === 'REAL') {
            // not equal to zero as a pattern: -0.0 is FALSE, a NaN is TRUE
            ctx.emit(`    PUSH32 0x7FFFFFFF`);
            ctx.emit(`    AND`);
            ctx.emit(`    PUSH8 0`);
            ctx.emit(`    NE`);
        } else if (from === 'LREAL') {
            // [lo hi]: the sign bit of the high word is not part of the test
            ctx.emit(`    PUSH32 0x7FFFFFFF`);
            ctx.emit(`    AND`);
            ctx.emit(`    OR`);
            ctx.emit(`    I2B`);
        } else if (isWideInteger(from)) {
            ctx.emit(`    OR`);
            ctx.emit(`    I2B`);
        } else {
            ctx.emit(`    I2B`);
        }
        return;
    }

    if (from === 'LREAL') {
        if (to === 'REAL') {
            ctx.emit(`    D2F`);
            return;
        }
        if (!ctx.callRoutine) ctx.fail('the conversion of an LREAL to an integer needs the routine linker');
        const target = INTEGER_TYPES[to]!;
        if (target.bits === 64) {
            ctx.emit(`    RNDD`);
            ctx.emit(target.signed ? `    D2L` : `    D2U`);
        } else if (target.bits === 32 && !target.signed) {
            ctx.callRoutine(D2U32_LABEL);
        } else {
            ctx.emit(`    RNDD`);
            ctx.emit(`    D2I`);
            if (target.bits < 32) {
                ctx.emit(pushConstant(target.lo));
                ctx.emit(pushConstant(target.hi));
                ctx.callRoutine(CLAMPI_LABEL);
            }
        }
        return;
    }

    if (to === 'LREAL') {
        if (from === 'REAL') {
            ctx.emit(`    F2D`);
            return;
        }
        const source = INTEGER_TYPES[from]!;
        if (source.bits === 64) {
            ctx.emit(source.signed ? `    L2D` : `    U2D`);
        } else if (source.bits === 32 && !source.signed) {
            ctx.emit(`    PUSH8 0             ; high word`);
            ctx.emit(`    U2D`);
        } else {
            ctx.emit(`    I2D`);
        }
        return;
    }

    if (to === 'REAL') {
        const source = INTEGER_TYPES[from]!;
        if (source.bits === 64) {
            ctx.emit(source.signed ? `    L2F` : `    U2F`);
        } else if (source.bits === 32 && !source.signed) {
            for (const line of UNSIGNED_TO_REAL) ctx.emit(line);
        } else {
            ctx.emit(`    I2F`);
        }
        return;
    }

    const target = INTEGER_TYPES[to]!;
    if (from === 'REAL') {
        if (target.bits === 64) {
            // exact widening, then the same rounding and saturation as an LREAL
            ctx.emit(`    F2D`);
            ctx.emit(`    RNDD`);
            ctx.emit(target.signed ? `    D2L` : `    D2U`);
            return;
        }
        if (target.bits === 32 && !target.signed) {
            if (!ctx.callRoutine) ctx.fail('the conversion of a REAL to an unsigned integer needs the routine linker');
            ctx.callRoutine(F2U32_LABEL);
            return;
        }
        if (!ctx.callRoutine) ctx.fail('the conversion of a REAL to an integer needs the routine linker');
        ctx.callRoutine(ROUNDF_LABEL);
        if (target.bits < 32) {
            ctx.emit(pushConstant(target.lo));
            ctx.emit(pushConstant(target.hi));
            ctx.callRoutine(CLAMPI_LABEL);
        }
        return;
    }

    // integer to integer
    const source = INTEGER_TYPES[from]!;
    if (source.bits === 64 && target.bits === 64) return; // the same 64 bits, read the other way
    if (target.bits === 64) {
        // widening: the sign word of a signed value, a zero word of an unsigned one
        if (source.signed) {
            ctx.emit(`    DUP`);
            ctx.emit(`    PUSH8 31`);
            ctx.emit(`    SAR                 ; the sign word`);
        } else {
            ctx.emit(`    PUSH8 0             ; high word`);
        }
        return;
    }
    if (source.bits === 64) {
        // narrowing: the low word, then its low bits
        ctx.emit(`    DROP                ; high word`);
        if (target.bits === 8) ctx.emit(target.signed ? `    EXT8` : `    ZEXT8`);
        else if (target.bits === 16) ctx.emit(target.signed ? `    EXT16` : `    ZEXT16`);
        return;
    }
    // nothing when the whole range of the source fits, the low bits otherwise
    if (source.lo >= target.lo && source.hi <= target.hi) return;
    if (target.bits === 8) ctx.emit(target.signed ? `    EXT8` : `    ZEXT8`);
    else if (target.bits === 16) ctx.emit(target.signed ? `    EXT16` : `    ZEXT16`);
}

function conversion(from: string, to: string): FunctionDef {
    const name = conversionName(from, to);
    return {
        name,
        argCount: 1,
        variadic: false,

        generateInline(ctx: CodeGenContext, args: Expression[]): void {
            if (args.length !== 1) {
                ctx.fail(`${name} requires 1 argument`);
            }

            ctx.emit(`    ; ${name}(IN)`);
            const found = ctx.typeOf?.(args[0]!);
            // the type the value has; an integer literal, or a value of a type the generator cannot name, is a `from`
            const held = found !== undefined && (isInteger(found) || isFloatType(found)) ? found : from;

            const literal = found !== undefined && !isInteger(found) && !isFloatType(found);
            const widen = (from === 'REAL' && isInteger(held)) || (from === 'LREAL' && (isInteger(held) || held === 'REAL'));
            if ((widen || literal) && ctx.emitOperand) {
                // an integer given to REAL_TO_x, an integer or a REAL given to LREAL_TO_x, is converted to the
                // parameter type first, as it is in an arithmetic operand; so is an integer literal (it is
                // written with the width of the parameter: 4294967295 for a UDINT, two cells for a LINT); an
                // LREAL given to REAL_TO_x is converted as the LREAL it is
                ctx.emitOperand(args[0]!, from);
                emitConversion(ctx, from, to);
                return;
            }
            ctx.emitExpression(args[0]!);
            emitConversion(ctx, held, to);
        },
    };
}

/** One function for every ordered pair of different types. */
export const CONVERSION_FNS: FunctionDef[] = CONVERSION_TYPES.flatMap((from) =>
    CONVERSION_TYPES.filter((to) => to !== from).map((to) => conversion(from, to)),
);
