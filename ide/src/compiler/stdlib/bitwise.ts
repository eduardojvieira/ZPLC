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
            ctx.emit(`    ; ERROR: ROL requires 2 arguments (IN, N)`);
            return;
        }

        ctx.emit(`    ; ROL(IN, N) - Rotate left`);
        
        // Emit arguments
        ctx.emitExpression(args[0]);  // IN
        ctx.emitExpression(args[1]);  // N
        
        // Stack: [IN, N]
        // We need: (IN << N) | (IN >> (32 - N))
        
        // Mask N to 0-31 range
        ctx.emit(`    PUSH8 31`);
        ctx.emit(`    AND`);          // N = N & 31
        
        // Stack: [IN, N_masked]
        ctx.emit(`    DUP`);          // [IN, N, N]
        ctx.emit(`    ROT`);          // [N, N, IN]
        ctx.emit(`    DUP`);          // [N, N, IN, IN]
        ctx.emit(`    ROT`);          // [N, IN, IN, N]
        
        // Left shift: IN << N
        ctx.emit(`    SHL`);          // [N, IN, IN<<N]
        
        // Prepare for right shift
        ctx.emit(`    ROT`);          // [IN, IN<<N, N]
        ctx.emit(`    PUSH8 32`);
        ctx.emit(`    SWAP`);
        ctx.emit(`    SUB`);          // [IN, IN<<N, 32-N]
        
        ctx.emit(`    ROT`);          // [IN<<N, 32-N, IN]
        ctx.emit(`    SWAP`);         // [IN<<N, IN, 32-N]
        
        // Right shift: IN >> (32 - N)
        ctx.emit(`    SHR`);          // [IN<<N, IN>>(32-N)]
        
        // Combine with OR
        ctx.emit(`    OR`);           // [result]
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
            ctx.emit(`    ; ERROR: ROR requires 2 arguments (IN, N)`);
            return;
        }

        ctx.emit(`    ; ROR(IN, N) - Rotate right`);
        
        // Emit arguments
        ctx.emitExpression(args[0]);  // IN
        ctx.emitExpression(args[1]);  // N
        
        // Stack: [IN, N]
        // We need: (IN >> N) | (IN << (32 - N))
        
        // Mask N to 0-31 range
        ctx.emit(`    PUSH8 31`);
        ctx.emit(`    AND`);          // N = N & 31
        
        // Stack: [IN, N_masked]
        ctx.emit(`    DUP`);          // [IN, N, N]
        ctx.emit(`    ROT`);          // [N, N, IN]
        ctx.emit(`    DUP`);          // [N, N, IN, IN]
        ctx.emit(`    ROT`);          // [N, IN, IN, N]
        
        // Right shift: IN >> N
        ctx.emit(`    SHR`);          // [N, IN, IN>>N]
        
        // Prepare for left shift
        ctx.emit(`    ROT`);          // [IN, IN>>N, N]
        ctx.emit(`    PUSH8 32`);
        ctx.emit(`    SWAP`);
        ctx.emit(`    SUB`);          // [IN, IN>>N, 32-N]
        
        ctx.emit(`    ROT`);          // [IN>>N, 32-N, IN]
        ctx.emit(`    SWAP`);         // [IN>>N, IN, 32-N]
        
        // Left shift: IN << (32 - N)
        ctx.emit(`    SHL`);          // [IN>>N, IN<<(32-N)]
        
        // Combine with OR
        ctx.emit(`    OR`);           // [result]
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
            ctx.emit(`    ; ERROR: SHL requires 2 arguments (IN, N)`);
            return;
        }

        ctx.emit(`    ; SHL(IN, N)`);
        ctx.emitExpression(args[0]);  // IN
        ctx.emitExpression(args[1]);  // N
        ctx.emit(`    SHL`);
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
            ctx.emit(`    ; ERROR: SHR requires 2 arguments (IN, N)`);
            return;
        }

        ctx.emit(`    ; SHR(IN, N)`);
        ctx.emitExpression(args[0]);  // IN
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
            ctx.emit(`    ; ERROR: AND_WORD requires 2 arguments`);
            return;
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
            ctx.emit(`    ; ERROR: OR_WORD requires 2 arguments`);
            return;
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
            ctx.emit(`    ; ERROR: XOR_WORD requires 2 arguments`);
            return;
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
            ctx.emit(`    ; ERROR: NOT_WORD requires 1 argument`);
            return;
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
            ctx.emit(`    ; ERROR: AND_DWORD requires 2 arguments`);
            return;
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
            ctx.emit(`    ; ERROR: OR_DWORD requires 2 arguments`);
            return;
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
            ctx.emit(`    ; ERROR: XOR_DWORD requires 2 arguments`);
            return;
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
            ctx.emit(`    ; ERROR: NOT_DWORD requires 1 argument`);
            return;
        }

        ctx.emit(`    ; NOT_DWORD(IN)`);
        ctx.emitExpression(args[0]);  // IN
        ctx.emit(`    NOT`);
    },
};
