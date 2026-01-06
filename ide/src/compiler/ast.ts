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
    STRING: 'STRING',
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
    // Generators
    BLINK: 'BLINK',
    PWM: 'PWM',
    PULSE: 'PULSE',
    // Process Control
    HYSTERESIS: 'HYSTERESIS',
    DEADBAND: 'DEADBAND',
    LAG_FILTER: 'LAG_FILTER',
    RAMP_REAL: 'RAMP_REAL',
    INTEGRAL: 'INTEGRAL',
    DERIVATIVE: 'DERIVATIVE',
    PID_Compact: 'PID_Compact',
    // System Buffers
    FIFO: 'FIFO',
    LIFO: 'LIFO',
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
        // STRING: 4 bytes header + 80 chars + 1 null = 85 bytes (default STRING[80])
        case DataType.STRING:
            return 85;
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
        // Generators: Q(1) + pad(3) + various timing vars = 16
        case DataType.BLINK:
        case DataType.PWM:
        case DataType.PULSE:
            return 16;
        // Process Control blocks
        case DataType.HYSTERESIS:
        case DataType.DEADBAND:
        case DataType.LAG_FILTER:
        case DataType.RAMP_REAL:
        case DataType.INTEGRAL:
        case DataType.DERIVATIVE:
            return 16;
        case DataType.PID_Compact:
            return 48;
        // System Buffers: FIFO/LIFO have variable size based on buffer
        // Default allocation: 64 bytes (header + 8 items * 4 bytes)
        case DataType.FIFO:
            return 64;
        case DataType.LIFO:
            return 56;
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
 * I/O address (e.g., %Q0.0, %IW0).
 */
export interface IOAddress {
    type: 'I' | 'Q' | 'M';  // Area: Input, Output, Memory
    size: 'X' | 'B' | 'W' | 'D' | null; // Size: Bit, Byte, Word, Double
    index: number;          // Main index (byte for X/B, word for W, etc.)
    bitOffset: number;      // Bit offset (only valid for type X or implicit bit)
    // Legacy fields for backward compatibility
    byteOffset: number;     // Canonical byte offset calculated from index/size
}

/**
 * Parse an I/O address string like "%Q0.0" or "%IW0".
 */
export function parseIOAddress(addr: string): IOAddress {
    // Format: %<type>[<size>]<index>(.<bit>)?
    // Examples: %QX0.0, %IW0, %MD4

    // Regex breakdown:
    // ^%
    // ([IQM])      -> Type
    // ([XBWD]?)    -> Size (optional)
    // (\d+)        -> Index
    // (?:\.(\d+))? -> Bit offset (optional)
    const match = addr.match(/^%([IQM])([XBWD]?)(\d+)(?:\.(\d+))?$/);

    if (!match) {
        throw new Error(`Invalid I/O address: ${addr}`);
    }

    const type = match[1] as 'I' | 'Q' | 'M';
    const sizeStr = match[2] as string;
    const index = parseInt(match[3], 10);
    const bitStr = match[4];

    // Determine size
    // If bit offset is present, size is 'X' (Bit)
    // If no size char and no bit offset, usually implies specific size based on context or error, 
    // but for compatibility we might default to 'X' for %I0.0 style, 
    // or maybe 'B' if just %I0?
    // In IEC 61131-3:
    // %IX0.0 or %I0.0 -> Bit
    // %IB0 -> Byte
    // %IW0 -> Word

    let size: 'X' | 'B' | 'W' | 'D' | null = null;
    if (sizeStr) {
        size = sizeStr as 'X' | 'B' | 'W' | 'D';
    } else if (bitStr !== undefined) {
        size = 'X'; // Implicit bit addressing
    } else {
        // Ambiguous like %I0? Treat as byte or error?
        // Let's default to Byte if ambiguous, or null.
        // Actually, without dot, it usually means full access. 
        // But let's assume 'B' for single index legacy behavior if any? 
        // Actually existing was %Q0.0. 
        // If user writes %IW0, sizeStr='W'.
        // If user writes %I0, sizeStr=''. bitStr=undefined.
        // Keep as null and let SymbolTable decide or default?
    }

    const bitOffset = bitStr ? parseInt(bitStr, 10) : 0;

    // Calculate canonical byte offset for backward compatibility
    // This logic will be refined in SymbolTable, but strictly speaking:
    // This field was 'byteOffset' in legacy IOAddress.
    // If %IW1 => Word 1 => Byte 2.
    // If %IB1 => Byte 1.
    // If %IX0.1 => Byte 0.

    let byteOffset = index;
    if (size === 'W') byteOffset = index * 2;
    if (size === 'D') byteOffset = index * 4;
    // B and X use index as byte offset directly

    return {
        type,
        size,
        index,
        bitOffset,
        byteOffset // Legacy field populated with canonical byte address
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
    | RealLiteral
    | TimeLiteral
    | StringLiteral
    | Identifier
    | MemberAccess
    | UnaryExpr
    | BinaryExpr
    | FBCall
    | FunctionCall;

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
 * Real (floating-point) literal: 3.14, 0.5, 1.0e-3, etc.
 */
export interface RealLiteral extends ASTNode {
    kind: 'RealLiteral';
    value: number;  // Parsed float value
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
 * String literal: 'Hello World'
 */
export interface StringLiteral extends ASTNode {
    kind: 'StringLiteral';
    value: string;  // The string content (without quotes)
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

/**
 * Function call with positional arguments: MAX(a, b), SQRT(x), etc.
 * Used for stateless stdlib functions.
 */
export interface FunctionCall extends ASTNode {
    kind: 'FunctionCall';
    name: string;
    args: Expression[];
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
    | WhileStatement
    | ForStatement
    | RepeatStatement
    | CaseStatement
    | ExitStatement
    | ContinueStatement
    | ReturnStatement
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
 * ELSIF clause for IF statement.
 */
export interface ElsifClause {
    condition: Expression;
    statements: Statement[];
}

/**
 * IF statement with optional ELSIF and ELSE branches.
 *
 * Syntax:
 *   IF condition THEN
 *       statements
 *   ELSIF condition THEN
 *       statements
 *   ELSE
 *       statements
 *   END_IF;
 */
export interface IfStatement extends ASTNode {
    kind: 'IfStatement';
    condition: Expression;
    thenBranch: Statement[];
    elsifBranches: ElsifClause[];  // NEW: ELSIF branches
    elseBranch: Statement[] | null;
}

/**
 * WHILE statement.
 *
 * Syntax:
 *   WHILE condition DO
 *       statements
 *   END_WHILE;
 */
export interface WhileStatement extends ASTNode {
    kind: 'WhileStatement';
    condition: Expression;
    body: Statement[];
}

/**
 * FOR statement.
 *
 * Syntax:
 *   FOR counter := start TO end BY step DO
 *       statements
 *   END_FOR;
 *
 * Note: BY step is optional, defaults to 1
 */
export interface ForStatement extends ASTNode {
    kind: 'ForStatement';
    counter: string;         // Loop variable name
    start: Expression;       // Initial value
    end: Expression;         // End value (inclusive)
    step: Expression | null; // Step increment (null = default 1)
    body: Statement[];
}

/**
 * REPEAT statement (do-while equivalent).
 *
 * Syntax:
 *   REPEAT
 *       statements
 *   UNTIL condition
 *   END_REPEAT;
 *
 * Note: Body executes at least once, then repeats until condition is TRUE
 */
export interface RepeatStatement extends ASTNode {
    kind: 'RepeatStatement';
    body: Statement[];
    condition: Expression;   // Exit when this becomes TRUE
}

/**
 * CASE branch for CASE statement.
 */
export interface CaseBranch {
    values: (number | { start: number; end: number })[]; // Single values or ranges
    statements: Statement[];
}

/**
 * CASE statement (switch equivalent).
 *
 * Syntax:
 *   CASE selector OF
 *       1: statements;
 *       2, 3, 4: statements;
 *       5..10: statements;
 *   ELSE
 *       statements;
 *   END_CASE;
 */
export interface CaseStatement extends ASTNode {
    kind: 'CaseStatement';
    selector: Expression;
    branches: CaseBranch[];
    elseBranch: Statement[] | null;
}

/**
 * EXIT statement - breaks out of the innermost loop.
 *
 * Syntax:
 *   EXIT;
 */
export interface ExitStatement extends ASTNode {
    kind: 'ExitStatement';
}

/**
 * CONTINUE statement - skips to next iteration of innermost loop.
 *
 * Syntax:
 *   CONTINUE;
 */
export interface ContinueStatement extends ASTNode {
    kind: 'ContinueStatement';
}

/**
 * RETURN statement - returns from current POU.
 *
 * Syntax:
 *   RETURN;
 */
export interface ReturnStatement extends ASTNode {
    kind: 'ReturnStatement';
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
