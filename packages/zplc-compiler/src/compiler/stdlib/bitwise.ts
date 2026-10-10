/**
 * ZPLC Standard Library - Bitwise Functions
 *
 * SPDX-License-Identifier: MIT
 *
 * IEC 61131-3 Bitwise Operations (stateless, inline):
 * - ROL: Rotate left
 * - ROR: Rotate right
 * - SHL: Shift left (wrapper for opcode)
 * - SHR: Shift right (wrapper for opcode)
 * - AND_WORD: Bitwise AND for WORD
 * - OR_WORD: Bitwise OR for WORD
 * - XOR_WORD: Bitwise XOR for WORD
 * - NOT_WORD: Bitwise NOT for WORD
 *
 * Note: The VM has native SHL/SHR opcodes. ROL/ROR are implemented
 * in software using shifts and ORs.
 */

import type { FunctionDef, CodeGenContext } from './types.ts';
import type { Expression } from '../ast.ts';
import { isWideInteger, numericInfo } from '../numeric.ts';

/** A 64-bit integer or bit string (LINT, ULINT, LWORD): two stack cells (CMP-015). */
function isWideOperand(ctx: CodeGenContext, arg: Expression): boolean {
    return isWideInteger(ctx.typeOf?.(arg));
}

/** The shift count of a 64-bit shift or rotate: one 32-bit word, whatever the width of the argument. */
function emitCount(ctx: CodeGenContext, count: Expression): void {
    if (ctx.emitOperand) ctx.emitOperand(count, 'UDINT');
    else ctx.emitExpression(count);
}

/**
 * ROL or ROR of a 64-bit value: [in(2) n] -> [out(2)]. n is taken modulo 64; the other half is a
 * shift by 64 - n, which is 0 for n = 0 (a shift of 64 gives 0), so (in << n) | (in >> (64 - n)) is
 * in itself for n = 0 and no case is special.
 */
function emitRotate64(ctx: CodeGenContext, left: boolean): void {
    ctx.emit(`    PUSH8 63`);
    ctx.emit(`    AND                 ; [in n]`);
    ctx.emit(`    DUP`);
    ctx.emit(`    PUSH8 64`);
    ctx.emit(`    SWAP`);
    ctx.emit(`    SUB                 ; [in n m]  m = 64 - n`);
    ctx.emit(`    PICK 3`);
    ctx.emit(`    PICK 3              ; [in n m in]`);
    ctx.emit(`    PICK 2              ; [in n m in m]`);
    ctx.emit(left ? `    SHR64               ; [in n m (in >> m)]` : `    SHL64               ; [in n m (in << m)]`);
    ctx.emit(`    PICK 5`);
    ctx.emit(`    PICK 5              ; [in n m r in]`);
    ctx.emit(`    PICK 5              ; [in n m r in n]`);
    ctx.emit(left ? `    SHL64               ; [in n m r (in << n)]` : `    SHR64               ; [in n m r (in >> n)]`);
    ctx.emit(`    ROT`);
    ctx.emit(`    OR`);
    ctx.emit(`    ROT`);
    ctx.emit(`    ROT`);
    ctx.emit(`    OR`);
    ctx.emit(`    SWAP                ; [in n m (r | s)]`);
    for (let pair = 0; pair < 2; pair++) {
        ctx.emit(`    ROT`);
        ctx.emit(`    DROP`);
        ctx.emit(`    ROT`);
        ctx.emit(`    DROP`);
    }
}

/**
 * Width in bits of the value a shift or rotate works on (CMP-014): the declared width of a
 * BYTE or WORD (or of a SINT, USINT, INT, UINT), 32 for anything else.
 */
function operandWidth(ctx: CodeGenContext, arg: Expression): 8 | 16 | 32 {
    const info = numericInfo(ctx.typeOf?.(arg));
    return info && !info.float && (info.bits === 8 || info.bits === 16) ? info.bits : 32;
}

/** Cut a result back to `width` bits; a value of 32 bits is already whole. */
function emitCut(ctx: CodeGenContext, width: 8 | 16 | 32): void {
    if (width === 8) ctx.emit(`    ZEXT8`);
    else if (width === 16) ctx.emit(`    ZEXT16`);
}

/** Emit the value to shift or rotate: a signed narrow value is read as its declared-width bit pattern. */
function emitBitOperand(ctx: CodeGenContext, arg: Expression, width: 8 | 16 | 32): void {
    ctx.emitExpression(arg);
    if (width !== 32 && numericInfo(ctx.typeOf?.(arg))?.signed) emitCut(ctx, width);
}

// ============================================================================
// ROL - Rotate Left
// ============================================================================

/**
 * ROL(IN, N) -> OUT
 *
 * Rotate IN left by N bits (32-bit word).
 * Bits shifted out on the left re-enter on the right.
 *
 * Formula: (IN << N) | (IN >> (32 - N))
 *
 * Stack: [IN, N] -> [result]
 */
export const ROL_FN: FunctionDef = {
    name: 'ROL',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.fail('ROL requires 2 arguments (IN, N)');
        }

        if (isWideOperand(ctx, args[0])) {
            ctx.emit(`    ; ROL(IN, N) on 64 bits`);
            ctx.emitExpression(args[0]);
            emitCount(ctx, args[1]);
            emitRotate64(ctx, true);
            return;
        }

        ctx.emit(`    ; ROL(IN, N) - Rotate left`);
        
        // Emit arguments; a BYTE or WORD rotates within its own width
        const width = operandWidth(ctx, args[0]);
        emitBitOperand(ctx, args[0], width);  // IN
        ctx.emitExpression(args[1]);  // N
        
        // Stack: [IN, N]
        // We need: (IN << N) | (IN >> (width - N))
        
        // Mask N to 0..width-1
        ctx.emit(`    PUSH8 ${width - 1}`);
        ctx.emit(`    AND`);          // N = N & (width - 1)
        
        // Stack: [IN, N_masked]
        ctx.emit(`    DUP`);          // [IN, N, N]
        ctx.emit(`    ROT`);          // [N, N, IN]
        ctx.emit(`    DUP`);          // [N, N, IN, IN]
        ctx.emit(`    ROT`);          // [N, IN, IN, N]
        
        // Left shift: IN << N
        ctx.emit(`    SHL`);          // [N, IN, IN<<N]
        
        // Prepare for right shift
        ctx.emit(`    ROT`);          // [IN, IN<<N, N]
        ctx.emit(`    PUSH8 ${width}`);
        ctx.emit(`    SWAP`);
        ctx.emit(`    SUB`);          // [IN, IN<<N, width-N]
        
        ctx.emit(`    ROT`);          // [IN<<N, width-N, IN]
        ctx.emit(`    SWAP`);         // [IN<<N, IN, width-N]
        
        // Right shift: IN >> (width - N)
        ctx.emit(`    SHR`);          // [IN<<N, IN>>(width-N)]
        
        // Combine with OR
        ctx.emit(`    OR`);           // [result]
        emitCut(ctx, width);          // the bits shifted past the declared width are not part of it
    },
};

// ============================================================================
// ROR - Rotate Right
// ============================================================================

/**
 * ROR(IN, N) -> OUT
 *
 * Rotate IN right by N bits (32-bit word).
 * Bits shifted out on the right re-enter on the left.
 *
 * Formula: (IN >> N) | (IN << (32 - N))
 *
 * Stack: [IN, N] -> [result]
 */
export const ROR_FN: FunctionDef = {
    name: 'ROR',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.fail('ROR requires 2 arguments (IN, N)');
        }

        if (isWideOperand(ctx, args[0])) {
            ctx.emit(`    ; ROR(IN, N) on 64 bits`);
            ctx.emitExpression(args[0]);
            emitCount(ctx, args[1]);
            emitRotate64(ctx, false);
            return;
        }

        ctx.emit(`    ; ROR(IN, N) - Rotate right`);
        
        // Emit arguments; a BYTE or WORD rotates within its own width
        const width = operandWidth(ctx, args[0]);
        emitBitOperand(ctx, args[0], width);  // IN
        ctx.emitExpression(args[1]);  // N
        
        // Stack: [IN, N]
        // We need: (IN >> N) | (IN << (width - N))
        
        // Mask N to 0..width-1
        ctx.emit(`    PUSH8 ${width - 1}`);
        ctx.emit(`    AND`);          // N = N & (width - 1)
        
        // Stack: [IN, N_masked]
        ctx.emit(`    DUP`);          // [IN, N, N]
        ctx.emit(`    ROT`);          // [N, N, IN]
        ctx.emit(`    DUP`);          // [N, N, IN, IN]
        ctx.emit(`    ROT`);          // [N, IN, IN, N]
        
        // Right shift: IN >> N
        ctx.emit(`    SHR`);          // [N, IN, IN>>N]
        
        // Prepare for left shift
        ctx.emit(`    ROT`);          // [IN, IN>>N, N]
        ctx.emit(`    PUSH8 ${width}`);
        ctx.emit(`    SWAP`);
        ctx.emit(`    SUB`);          // [IN, IN>>N, width-N]
        
        ctx.emit(`    ROT`);          // [IN>>N, width-N, IN]
        ctx.emit(`    SWAP`);         // [IN>>N, IN, width-N]
        
        // Left shift: IN << (width - N)
        ctx.emit(`    SHL`);          // [IN>>N, IN<<(width-N)]
        
        // Combine with OR
        ctx.emit(`    OR`);           // [result]
        emitCut(ctx, width);          // the bits shifted past the declared width are not part of it
    },
};

// ============================================================================
// SHL - Shift Left (wrapper)
// ============================================================================

/**
 * SHL(IN, N) -> OUT
 *
 * Shift IN left by N bits. Zeros enter on the right.
 * This is a wrapper for the native SHL opcode.
 *
 * Stack: [IN, N] -> [result]
 */
export const SHL_FN: FunctionDef = {
    name: 'SHL',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.fail('SHL requires 2 arguments (IN, N)');
        }

        if (isWideOperand(ctx, args[0])) {
            ctx.emit(`    ; SHL(IN, N) on 64 bits`);
            ctx.emitExpression(args[0]);
            emitCount(ctx, args[1]);
            ctx.emit(`    SHL64               ; a count of 64 or more gives 0`);
            return;
        }

        ctx.emit(`    ; SHL(IN, N)`);
        const width = operandWidth(ctx, args[0]);
        emitBitOperand(ctx, args[0], width);  // IN
        ctx.emitExpression(args[1]);  // N
        ctx.emit(`    SHL`);
        emitCut(ctx, width);          // a BYTE or WORD drops the bits shifted past its width
    },
};

// ============================================================================
// SHR - Shift Right (wrapper)
// ============================================================================

/**
 * SHR(IN, N) -> OUT
 *
 * Shift IN right by N bits (logical shift, zeros enter on left).
 * This is a wrapper for the native SHR opcode.
 *
 * Stack: [IN, N] -> [result]
 */
export const SHR_FN: FunctionDef = {
    name: 'SHR',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.fail('SHR requires 2 arguments (IN, N)');
        }

        if (isWideOperand(ctx, args[0])) {
            ctx.emit(`    ; SHR(IN, N) on 64 bits`);
            ctx.emitExpression(args[0]);
            emitCount(ctx, args[1]);
            ctx.emit(`    SHR64               ; logical: zeros enter on the left; a count of 64 or more gives 0`);
            return;
        }

        ctx.emit(`    ; SHR(IN, N)`);
        emitBitOperand(ctx, args[0], operandWidth(ctx, args[0]));  // IN
        ctx.emitExpression(args[1]);  // N
        ctx.emit(`    SHR`);
    },
};

// ============================================================================
// AND_WORD - Bitwise AND
// ============================================================================

/**
 * AND_WORD(IN1, IN2) -> OUT
 *
 * Bitwise AND of two 16-bit WORD values.
 * Result is masked to 16 bits.
 *
 * Stack: [IN1, IN2] -> [result]
 */
export const AND_WORD_FN: FunctionDef = {
    name: 'AND_WORD',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.fail('AND_WORD requires 2 arguments');
        }

        ctx.emit(`    ; AND_WORD(IN1, IN2)`);
        ctx.emitExpression(args[0]);  // IN1
        ctx.emitExpression(args[1]);  // IN2
        ctx.emit(`    AND`);
        // Mask to 16 bits
        ctx.emit(`    PUSH16 0xFFFF`);
        ctx.emit(`    AND`);
    },
};

// ============================================================================
// OR_WORD - Bitwise OR
// ============================================================================

/**
 * OR_WORD(IN1, IN2) -> OUT
 *
 * Bitwise OR of two 16-bit WORD values.
 * Result is masked to 16 bits.
 *
 * Stack: [IN1, IN2] -> [result]
 */
export const OR_WORD_FN: FunctionDef = {
    name: 'OR_WORD',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.fail('OR_WORD requires 2 arguments');
        }

        ctx.emit(`    ; OR_WORD(IN1, IN2)`);
        ctx.emitExpression(args[0]);  // IN1
        ctx.emitExpression(args[1]);  // IN2
        ctx.emit(`    OR`);
        // Mask to 16 bits
        ctx.emit(`    PUSH16 0xFFFF`);
        ctx.emit(`    AND`);
    },
};

// ============================================================================
// XOR_WORD - Bitwise XOR
// ============================================================================

/**
 * XOR_WORD(IN1, IN2) -> OUT
 *
 * Bitwise XOR of two 16-bit WORD values.
 * Result is masked to 16 bits.
 *
 * Stack: [IN1, IN2] -> [result]
 */
export const XOR_WORD_FN: FunctionDef = {
    name: 'XOR_WORD',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.fail('XOR_WORD requires 2 arguments');
        }

        ctx.emit(`    ; XOR_WORD(IN1, IN2)`);
        ctx.emitExpression(args[0]);  // IN1
        ctx.emitExpression(args[1]);  // IN2
        ctx.emit(`    XOR`);
        // Mask to 16 bits
        ctx.emit(`    PUSH16 0xFFFF`);
        ctx.emit(`    AND`);
    },
};

// ============================================================================
// NOT_WORD - Bitwise NOT
// ============================================================================

/**
 * NOT_WORD(IN) -> OUT
 *
 * Bitwise NOT of a 16-bit WORD value.
 * Result is masked to 16 bits.
 *
 * Stack: [IN] -> [result]
 */
export const NOT_WORD_FN: FunctionDef = {
    name: 'NOT_WORD',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.fail('NOT_WORD requires 1 argument');
        }

        ctx.emit(`    ; NOT_WORD(IN)`);
        ctx.emitExpression(args[0]);  // IN
        ctx.emit(`    NOT`);
        // Mask to 16 bits
        ctx.emit(`    PUSH16 0xFFFF`);
        ctx.emit(`    AND`);
    },
};

// ============================================================================
// AND_DWORD - Bitwise AND (32-bit)
// ============================================================================

/**
 * AND_DWORD(IN1, IN2) -> OUT
 *
 * Bitwise AND of two 32-bit DWORD values.
 *
 * Stack: [IN1, IN2] -> [result]
 */
export const AND_DWORD_FN: FunctionDef = {
    name: 'AND_DWORD',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.fail('AND_DWORD requires 2 arguments');
        }

        ctx.emit(`    ; AND_DWORD(IN1, IN2)`);
        ctx.emitExpression(args[0]);  // IN1
        ctx.emitExpression(args[1]);  // IN2
        ctx.emit(`    AND`);
    },
};

// ============================================================================
// OR_DWORD - Bitwise OR (32-bit)
// ============================================================================

/**
 * OR_DWORD(IN1, IN2) -> OUT
 *
 * Bitwise OR of two 32-bit DWORD values.
 *
 * Stack: [IN1, IN2] -> [result]
 */
export const OR_DWORD_FN: FunctionDef = {
    name: 'OR_DWORD',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.fail('OR_DWORD requires 2 arguments');
        }

        ctx.emit(`    ; OR_DWORD(IN1, IN2)`);
        ctx.emitExpression(args[0]);  // IN1
        ctx.emitExpression(args[1]);  // IN2
        ctx.emit(`    OR`);
    },
};

// ============================================================================
// XOR_DWORD - Bitwise XOR (32-bit)
// ============================================================================

/**
 * XOR_DWORD(IN1, IN2) -> OUT
 *
 * Bitwise XOR of two 32-bit DWORD values.
 *
 * Stack: [IN1, IN2] -> [result]
 */
export const XOR_DWORD_FN: FunctionDef = {
    name: 'XOR_DWORD',
    argCount: 2,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 2) {
            ctx.fail('XOR_DWORD requires 2 arguments');
        }

        ctx.emit(`    ; XOR_DWORD(IN1, IN2)`);
        ctx.emitExpression(args[0]);  // IN1
        ctx.emitExpression(args[1]);  // IN2
        ctx.emit(`    XOR`);
    },
};

// ============================================================================
// NOT_DWORD - Bitwise NOT (32-bit)
// ============================================================================

/**
 * NOT_DWORD(IN) -> OUT
 *
 * Bitwise NOT of a 32-bit DWORD value.
 *
 * Stack: [IN] -> [result]
 */
export const NOT_DWORD_FN: FunctionDef = {
    name: 'NOT_DWORD',
    argCount: 1,
    variadic: false,

    generateInline(ctx: CodeGenContext, args: Expression[]): void {
        if (args.length !== 1) {
            ctx.fail('NOT_DWORD requires 1 argument');
        }

        ctx.emit(`    ; NOT_DWORD(IN)`);
        ctx.emitExpression(args[0]);  // IN
        ctx.emit(`    NOT`);
    },
};
