/**
 * ZPLC Standard Library - Type Definitions
 *
 * SPDX-License-Identifier: MIT
 *
 * Defines interfaces for Function Blocks and Functions in the IEC 61131-3
 * standard library. These abstractions allow pluggable code generation.
 */

import type { Expression, FBParameter, STDataType } from '../ast.ts';

// ============================================================================
// Member Types
// ============================================================================

/**
 * Data size for a member variable.
 */
export type MemberSize = 1 | 2 | 4 | 8;

/**
 * Member variable definition for a function block.
 */
export interface MemberDef {
    /** Member name (e.g., 'IN', 'Q', 'PT') */
    name: string;
    /** Size in bytes */
    size: MemberSize;
    /** Offset from base address */
    offset: number;
    /** Is this an input parameter? */
    isInput: boolean;
    /** Is this an output parameter? */
    isOutput: boolean;
    /** Is this an internal (private) member? */
    isInternal: boolean;
    /** Data type (optional for stdlib FBs if it's already implied by size, but useful for resolution) */
    dataType?: STDataType;
}

// ============================================================================
// Code Generation Context
// ============================================================================

/**
 * Context passed to code generators.
 */
export interface CodeGenContext {
    /** Base address of the FB instance */
    baseAddress: number;
    /** FB instance name */
    instanceName: string;
    /** Generate a unique label */
    newLabel: (prefix: string) => string;
    /** Emit a line of assembly */
    emit: (line: string) => void;
    /** Emit an expression to the stack */
    emitExpression: (expr: Expression) => void;
}

// ============================================================================
// Function Block Definition
// ============================================================================

/**
 * Definition of an IEC 61131-3 Function Block.
 *
 * Function Blocks have state (memory) and are instantiated as variables.
 * Examples: TON, TOF, TP, CTU, CTD, R_TRIG, F_TRIG, RS, SR
 */
export interface FunctionBlockDef {
    /** FB type name (e.g., 'TON', 'CTU') */
    name: string;

    /** Total size in bytes (aligned) */
    size: number;

    /** Member definitions */
    members: MemberDef[];

    /**
     * Generate assembly code for this FB call.
     *
     * @param ctx - Code generation context
     * @param params - Parameters passed in the FB call
     */
    generateCall: (ctx: CodeGenContext, params: FBParameter[]) => void;
}

// ============================================================================
// Inline Function Definition
// ============================================================================

/**
 * Definition of an IEC 61131-3 Function (no state).
 *
 * Functions are stateless and compiled inline.
 * Examples: MAX, MIN, LIMIT, SEL, MUX, ABS, SQRT
 */
export interface FunctionDef {
    /** Function name (e.g., 'MAX', 'MIN') */
    name: string;

    /** Number of arguments */
    argCount: number;

    /** Is this a variadic function? (e.g., MUX) */
    variadic: boolean;

    /**
     * Generate inline assembly for this function call.
     *
     * @param ctx - Code generation context
     * @param args - Argument expressions
     */
    generateInline: (ctx: CodeGenContext, args: Expression[]) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a MemberDef for an input parameter.
 */
export function inputMember(name: string, size: MemberSize, offset: number, dataType?: STDataType): MemberDef {
    return { name, size, offset, isInput: true, isOutput: false, isInternal: false, dataType };
}

/**
 * Create a MemberDef for an output parameter.
 */
export function outputMember(name: string, size: MemberSize, offset: number, dataType?: STDataType): MemberDef {
    return { name, size, offset, isInput: false, isOutput: true, isInternal: false, dataType };
}

/**
 * Create a MemberDef for an internal (private) variable.
 */
export function internalMember(name: string, size: MemberSize, offset: number, dataType?: STDataType): MemberDef {
    return { name, size, offset, isInput: false, isOutput: false, isInternal: true, dataType };
}

/**
 * Get the load/store suffix for a member size.
 */
export function getSizeSuffix(size: MemberSize): '8' | '16' | '32' {
    switch (size) {
        case 1: return '8';
        case 2: return '16';
        case 4: return '32';
        case 8: return '32' as any; // Actually '64', but VM is mostly 32-bit for now
        default: return '32';
    }
}

/**
 * Format an address as hex string.
 */
export function formatAddr(addr: number): string {
    return `0x${addr.toString(16).padStart(4, '0')}`;
}
