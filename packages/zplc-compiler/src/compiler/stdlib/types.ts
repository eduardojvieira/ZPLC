/**
 * ZPLC Standard Library - Type Definitions
 *
 * SPDX-License-Identifier: MIT
 *
 * Defines interfaces for Function Blocks and Functions in the IEC 61131-3
 * standard library. These abstractions allow pluggable code generation.
 */

import type { Expression, FBParameter, STDataType } from '../ast.ts';
import type { AsmLine } from '../asm-line.ts';
import type { ErrorCode } from '../error-codes.ts';
import { STRING_LAYOUT } from '../../contract.generated.ts';

export const MEMBER_SIZE = {
    BYTE: 1,
    WORD: 2,
    DWORD: 4,
    LWORD: 8,
    /** A default STRING: 4-byte header + 80 characters + terminator (the contract's string layout). */
    STRING: STRING_LAYOUT.defaultTotalSize,
    WSTRING: 166,
} as const;

// ============================================================================
// Member Types
// ============================================================================

/**
 * Data size for a member variable.
 */
export type MemberSize = (typeof MEMBER_SIZE)[keyof typeof MEMBER_SIZE];

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
    emit: (line: AsmLine) => void;
    /** Emit an expression to the stack */
    emitExpression: (expr: Expression) => void;
    /**
     * Fail the build at the call being generated; nothing is emitted in place of the error. `code` is the stable code
     * of the error (CMP-006): the wrong number of arguments unless the generator says it is a defect of the compiler.
     */
    fail: (message: string, code?: ErrorCode) => never;
    /**
     * Static type of an expression: an elementary type name ('INT', 'REAL', ...) or '#INT' for an
     * integer literal; undefined when it is not known. Absent in a context built by a test.
     */
    typeOf?: (expr: Expression) => string | undefined;
    /** Emit an expression as the numeric type `asType`: an integer is converted when `asType` is 'REAL'. */
    emitOperand?: (expr: Expression, asType: string) => void;
    /** Emit the comparison of the two values on the stack, read as `type` (REAL, unsigned or signed). */
    emitCompare?: (op: 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE', type?: string) => void;
    /**
     * Address of a work buffer for a new string of up to `capacity` characters (its capacity field is
     * written). It is valid until the end of the statement being generated (CMP-021).
     */
    stringTemp?: (capacity: number) => number;
    /** Characters the string `expr` can hold: its declared capacity, a literal's length; 80 when unknown. */
    stringCapacity?: (expr: Expression) => number;
    /** Call a string routine: 'strappend' [dst src start n] -> [], 'strfind' [s1 s2] -> [pos]. */
    callHelper?: (name: 'strappend' | 'strfind') => void;
    /**
     * Call a routine of stdlib/routines.ts by its label: it is appended to the program, with the routines
     * it calls, the first time and emitted as `CALL label`. The arguments are on the stack, as the routine
     * documents, and its result replaces them.
     */
    callRoutine?: (label: string) => void;
}

// ============================================================================
// Helper routines
// ============================================================================

/**
 * A subroutine of the standard library (stdlib/routines.ts): `CALL label` with the arguments on the
 * evaluation stack and the result left in their place. It is appended to a program the first time
 * something calls it.
 */
export interface Routine {
    /** Label of the entry point. */
    label: string;
    /** The routine, label line first. */
    lines: AsmLine[];
    /** Labels of the routines this one calls; they are linked with it. */
    needs: string[];
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
        case 1:
            return '8';
        case 2:
            return '16';
        case 4:
            return '32';
        // an 8-byte member is moved as two 32-bit cells
        default:
            return '32';
    }
}

/**
 * Format an address as hex string.
 */
export function formatAddr(addr: number): string {
    return `0x${addr.toString(16).padStart(4, '0')}`;
}
