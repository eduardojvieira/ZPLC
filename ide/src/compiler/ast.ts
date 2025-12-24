/**
 * ZPLC Structured Text AST Definitions
 *
 * SPDX-License-Identifier: MIT
 *
 * Abstract Syntax Tree node types for IEC 61131-3 Structured Text.
 * Supports the subset needed for blinky.st.
 */

// ============================================================================
// Base Node Types
// ============================================================================

/**
 * Base interface for all AST nodes.
 */
export interface ASTNode {
    kind: string;
    line: number;
    column: number;
}

// ============================================================================
// Data Types
// ============================================================================

/**
 * IEC 61131-3 data type.
 */
export const DataType = {
    BOOL: 'BOOL',
    INT: 'INT',
    DINT: 'DINT',
    REAL: 'REAL',
    TIME: 'TIME',
    // Timer function blocks
    TON: 'TON',
    TOF: 'TOF',
    TP: 'TP',
    // Edge detectors
    R_TRIG: 'R_TRIG',
    F_TRIG: 'F_TRIG',
    // Bistables
    RS: 'RS',
    SR: 'SR',
    // Counters
    CTU: 'CTU',
    CTD: 'CTD',
    CTUD: 'CTUD',
} as const;

export type DataTypeValue = typeof DataType[keyof typeof DataType];

/**
 * Get size in bytes for a data type.
 */
export function getDataTypeSize(type: DataTypeValue): number {
    switch (type) {
        case DataType.BOOL:
            return 1;
        case DataType.INT:
            return 2;
        case DataType.DINT:
        case DataType.REAL:
        case DataType.TIME:
            return 4;
        // Timer FBs: IN(1) + Q(1) + PT(4) + ET(4) + _start(4) + _running(1) + pad = 16
        case DataType.TON:
        case DataType.TOF:
        case DataType.TP:
            return 16;
        // Edge detectors: CLK(1) + Q(1) + _prev(1) + pad = 4
        case DataType.R_TRIG:
        case DataType.F_TRIG:
            return 4;
        // Bistables: S(1) + R(1) + Q1(1) + pad = 4
        case DataType.RS:
        case DataType.SR:
            return 4;
        // Counter Up/Down: CU/CD(1) + R(1) + Q(1) + pad(1) + CV(4) = 8
        case DataType.CTU:
        case DataType.CTD:
            return 8;
        // Counter Up/Down combined: CU(1) + CD(1) + R(1) + LD(1) + QU(1) + QD(1) + pad(2) + CV(4) = 12
        case DataType.CTUD:
            return 12;
        default:
            return 4; // Default to 32-bit
    }
}

// ============================================================================
// Variable Declarations
// ============================================================================

/**
 * Variable section type.
 */
export const VarSection = {
    VAR: 'VAR',
    VAR_INPUT: 'VAR_INPUT',
    VAR_OUTPUT: 'VAR_OUTPUT',
    VAR_IN_OUT: 'VAR_IN_OUT',
    VAR_TEMP: 'VAR_TEMP',
    VAR_RETAIN: 'VAR_RETAIN',
} as const;

export type VarSectionValue = typeof VarSection[keyof typeof VarSection];

/**
 * I/O address (e.g., %Q0.0, %I0.0).
 */
export interface IOAddress {
    type: 'I' | 'Q' | 'M';  // Input, Output, Memory
    byteOffset: number;
    bitOffset: number;
}

/**
 * Parse an I/O address string like "%Q0.0".
 */
export function parseIOAddress(addr: string): IOAddress {
    // Format: %<type><byte>.<bit>
    const match = addr.match(/^%([IQM])(\d+)\.(\d+)$/);
    if (!match) {
        throw new Error(`Invalid I/O address: ${addr}`);
    }
    return {
        type: match[1] as 'I' | 'Q' | 'M',
        byteOffset: parseInt(match[2], 10),
        bitOffset: parseInt(match[3], 10),
    };
}

/**
 * Variable declaration.
 */
export interface VarDecl extends ASTNode {
    kind: 'VarDecl';
    name: string;
    dataType: DataTypeValue;
    initialValue: Expression | null;
    ioAddress: IOAddress | null;  // For I/O-mapped variables
    section: VarSectionValue;
}

/**
 * Variable declaration block.
 */
export interface VarBlock extends ASTNode {
    kind: 'VarBlock';
    section: VarSectionValue;
    variables: VarDecl[];
}

// ============================================================================
// Expressions
// ============================================================================

/**
 * Expression types.
 */
export type Expression =
    | BoolLiteral
    | IntLiteral
    | TimeLiteral
    | Identifier
    | MemberAccess
    | UnaryExpr
    | BinaryExpr
    | FBCall;

/**
 * Boolean literal: TRUE or FALSE.
 */
export interface BoolLiteral extends ASTNode {
    kind: 'BoolLiteral';
    value: boolean;
}

/**
 * Integer literal.
 */
export interface IntLiteral extends ASTNode {
    kind: 'IntLiteral';
    value: number;
}

/**
 * Time literal: T#500ms, T#1s, etc.
 */
export interface TimeLiteral extends ASTNode {
    kind: 'TimeLiteral';
    valueMs: number;  // Always stored in milliseconds
    rawValue: string; // Original string for display
}

/**
 * Parse a time literal string to milliseconds.
 */
export function parseTimeLiteral(raw: string): number {
    // Format: T#<value><unit>
    const match = raw.match(/^T#(\d+)(ms|s|m|h|d)$/i);
    if (!match) {
        throw new Error(`Invalid time literal: ${raw}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
        case 'ms': return value;
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: throw new Error(`Unknown time unit: ${unit}`);
    }
}

/**
 * Simple identifier reference.
 */
export interface Identifier extends ASTNode {
    kind: 'Identifier';
    name: string;
}

/**
 * Member access: Timer.Q, Timer.ET, etc.
 */
export interface MemberAccess extends ASTNode {
    kind: 'MemberAccess';
    object: Identifier;
    member: string;
}

/**
 * Unary expression: NOT x, -x.
 */
export interface UnaryExpr extends ASTNode {
    kind: 'UnaryExpr';
    operator: 'NOT' | 'NEG';
    operand: Expression;
}

/**
 * Binary expression: a + b, a AND b, etc.
 */
export interface BinaryExpr extends ASTNode {
    kind: 'BinaryExpr';
    operator: 'AND' | 'OR' | 'XOR' | 'ADD' | 'SUB' | 'MUL' | 'DIV' | 'MOD' | 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE';
    left: Expression;
    right: Expression;
}

// ============================================================================
// Statements
// ============================================================================

/**
 * Statement types.
 */
export type Statement =
    | Assignment
    | IfStatement
    | FBCallStatement;

/**
 * Assignment: x := expr
 */
export interface Assignment extends ASTNode {
    kind: 'Assignment';
    target: Identifier | MemberAccess;
    value: Expression;
}

/**
 * IF statement.
 */
export interface IfStatement extends ASTNode {
    kind: 'IfStatement';
    condition: Expression;
    thenBranch: Statement[];
    elseBranch: Statement[] | null;
}

/**
 * Function block call (as a statement).
 * Timer(IN := TRUE, PT := T#500ms)
 */
export interface FBCallStatement extends ASTNode {
    kind: 'FBCallStatement';
    fbName: string;
    parameters: FBParameter[];
}

/**
 * Function block call (as an expression, for inline use).
 */
export interface FBCall extends ASTNode {
    kind: 'FBCall';
    fbName: string;
    parameters: FBParameter[];
}

/**
 * Function block parameter assignment.
 */
export interface FBParameter {
    name: string;
    value: Expression;
}

// ============================================================================
// Program Structure
// ============================================================================

/**
 * Program declaration.
 */
export interface Program extends ASTNode {
    kind: 'Program';
    name: string;
    varBlocks: VarBlock[];
    statements: Statement[];
}

// ============================================================================
// Top-level compilation unit
// ============================================================================

/**
 * A complete compilation unit (one .st file).
 */
export interface CompilationUnit extends ASTNode {
    kind: 'CompilationUnit';
    programs: Program[];
}
