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
    // Elementary types
    BOOL: 'BOOL',
    SINT: 'SINT',
    USINT: 'USINT',
    INT: 'INT',
    UINT: 'UINT',
    DINT: 'DINT',
    UDINT: 'UDINT',
    LINT: 'LINT',
    ULINT: 'ULINT',
    REAL: 'REAL',
    LREAL: 'LREAL',
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
 * Represents any valid data type in ZPLC, including elementary types, array types,
 * and user-defined types (structs).
 */
export type STDataType = DataTypeValue | ArrayType | string; // string for user-defined TYPES (STRUCTs)

/**
 * Get the size in bytes of a data type.
 */
export function getDataTypeSize(type: STDataType): number {
    if (typeof type === 'string') {
        // Elementary types
        switch (type) {
            case 'BOOL':
            case 'SINT':
            case 'USINT':
            case 'BYTE':
                return 1;
            case 'INT':
            case 'UINT':
            case 'WORD':
                return 2;
            case 'DINT':
            case 'UDINT':
            case 'DWORD':
            case 'REAL':
            case 'TIME':
                return 4;
            case 'LINT':
            case 'ULINT':
            case 'LWORD':
            case 'LREAL':
                return 8;
            case 'STRING':
                return 85; // Default max length (84 chars + null)

            // Standard FBs (for completeness/compatibility)
            case 'TON':
            case 'TOF':
            case 'TP':
                return 16;
            case 'R_TRIG':
            case 'F_TRIG':
            case 'RS':
            case 'SR':
                return 4;
            case 'CTU':
            case 'CTD':
                return 8;
            case 'CTUD':
                return 12;

            default:
                // This is likely a user-defined type (Struct or FB)
                // The SymbolTable will override this with the actual layout size
                return 0;
        }
    }

    if (isArrayType(type)) {
        return getArrayTotalSize(type);
    }

    return 0;
}

// ============================================================================
// Array Types (v1.4.3+)
// ============================================================================

/**
 * Array dimension bounds.
 * Represents a single dimension like [0..9] or [1..10].
 */
export interface ArrayDimension {
    lowerBound: number;
    upperBound: number;
}

/**
 * Array type definition.
 * Supports 1D, 2D, and 3D arrays.
 * 
 * Examples:
 *   ARRAY[0..9] OF INT           -> 1D
 *   ARRAY[0..2, 0..2] OF REAL    -> 2D
 *   ARRAY[0..1, 0..1, 0..1] OF BOOL -> 3D
 */
export interface ArrayType {
    kind: 'ArrayType';
    dimensions: ArrayDimension[];  // 1-3 elements
    elementType: DataTypeValue;
}

/**
 * Get the total number of elements in an array.
 */
export function getArrayElementCount(arrayType: ArrayType): number {
    let count = 1;
    for (const dim of arrayType.dimensions) {
        count *= (dim.upperBound - dim.lowerBound + 1);
    }
    return count;
}

/**
 * Get the total size in bytes for an array.
 */
export function getArrayTotalSize(arrayType: ArrayType): number {
    const elementSize = getDataTypeSize(arrayType.elementType);
    return getArrayElementCount(arrayType) * elementSize;
}

/**
 * Type guard to check if a type is an ArrayType.
 */
export function isArrayType(type: STDataType): type is ArrayType {
    return typeof type === 'object' && type !== null && 'kind' in type && type.kind === 'ArrayType';
}

/**
 * Represents any valid data type in ZPLC, including elementary types, array types,
 * and user-defined types (structs).
 */
export type DataType = DataTypeValue | ArrayType | string; // string for user-defined TYPES (STRUCTs)

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
    VAR_GLOBAL: 'VAR_GLOBAL',
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
    dataType: STDataType;  // Can be elementary type or array type or user-defined type
    initialValue: Expression | ArrayLiteral | null;
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
    | ArrayAccess
    | UnaryExpr
    | BinaryExpr
    | FBCall
    | FunctionCall
    | ArrayLiteral;

/**
 * Array access expression.
 * 
 * Examples:
 *   Temps[0]         -> 1D access
 *   Matrix[i, j]     -> 2D access
 *   Cube[x, y, z]    -> 3D access
 */
export interface ArrayAccess extends ASTNode {
    kind: 'ArrayAccess';
    array: Expression;  // Changed from Identifier to Expression for nested access
    indices: Expression[];  // 1-3 elements, must match array dimensions
}

/**
 * Array literal for initialization.
 * 
 * Examples:
 *   [1, 2, 3, 4, 5]                    -> 1D
 *   [[1, 2], [3, 4]]                   -> 2D (nested)
 *   [FALSE, FALSE, TRUE, FALSE]        -> 1D BOOL
 */
export interface ArrayLiteral extends ASTNode {
    kind: 'ArrayLiteral';
    elements: (Expression | ArrayLiteral)[];  // Nested for multi-dimensional
}

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
    object: Expression;  // Changed from Identifier to Expression for nested access
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
    target: Identifier | MemberAccess | ArrayAccess;  // Added ArrayAccess for array element assignment
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
 * Structure declaration (TYPE ... STRUCT ... END_STRUCT ... END_TYPE).
 */
export interface StructDecl extends ASTNode {
    kind: 'StructDecl';
    name: string;
    members: VarDecl[];
}

/**
 * A complete compilation unit (one .st file).
 */
export interface CompilationUnit extends ASTNode {
    kind: 'CompilationUnit';
    globalVars: GlobalVarBlock[];   // NEW in v1.4.3
    functions: FunctionDecl[];      // User-defined functions
    functionBlocks: FunctionBlockDecl[]; // NEW in v1.4.3
    typeDefinitions: StructDecl[];  // NEW for Sprint 4
    programs: Program[];
}

// ============================================================================
// User-Defined Functions (v1.4.3+)
// ============================================================================

/**
 * User-defined function declaration.
 * 
 * Syntax:
 *   FUNCTION FunctionName : ReturnType
 *       VAR_INPUT ... END_VAR
 *       VAR ... END_VAR
 *       statements
 *       FunctionName := returnValue;  (* IEC return syntax *)
 *   END_FUNCTION
 */
export interface FunctionDecl extends ASTNode {
    kind: 'FunctionDecl';
    name: string;
    returnType: DataTypeValue;
    inputs: VarDecl[];     // VAR_INPUT parameters
    locals: VarDecl[];     // VAR variables
    body: Statement[];
}

/**
 * User-defined function block declaration.
 */
export interface FunctionBlockDecl extends ASTNode {
    kind: 'FunctionBlockDecl';
    name: string;
    inputs: VarDecl[];     // VAR_INPUT
    outputs: VarDecl[];    // VAR_OUTPUT
    inouts: VarDecl[];     // VAR_IN_OUT
    locals: VarDecl[];     // VAR
    body: Statement[];
}

/**
 * Global variable block.
 */
export interface GlobalVarBlock extends ASTNode {
    kind: 'GlobalVarBlock';
    variables: VarDecl[];
    isConstant: boolean;
}
