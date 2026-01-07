/**
 * ZPLC Structured Text Code Generator
 *
 * SPDX-License-Identifier: MIT
 *
 * Converts AST to ZPLC Assembly text.
 * This is the final stage of the ST compiler pipeline.
 *
 * The generated assembly can then be passed to the assembler
 * to produce bytecode.
 */

import type {
    CompilationUnit,
    Program,
    VarDecl,
    Assignment,
    Statement,
    Expression,
    IfStatement,
    WhileStatement,
    ForStatement,
    RepeatStatement,
    CaseStatement,
    FBCallStatement,
    Identifier,
    MemberAccess,
    ArrayAccess,
    BoolLiteral,
    IntLiteral,
    RealLiteral,
    TimeLiteral,
    StringLiteral,
    UnaryExpr,
    BinaryExpr,
    FunctionCall,
    ArrayType,
    DataTypeValue,
    STDataType,
    FunctionBlockDecl,
    FunctionDecl,
} from './ast.ts';
import { getDataTypeSize, isArrayType } from './ast.ts';
import {
    getLoadStoreSuffix,
    buildSymbolTable,
    MemoryLayout,
} from './symbol-table.ts';
import type { SymbolTable, Symbol } from './symbol-table.ts';
import {
    getFn,
    getFB,
    type CodeGenContext,
    type MemberSize,
} from './stdlib/index.ts';

// ============================================================================
// Memory Layout Constants
// ============================================================================

/**
 * Default address for the "already initialized" flag.
 * Located at the last byte of work memory to avoid conflicts with user variables.
 * Work memory: 0x2000-0x3FFF (8KB), so we use 0x3FFF by default.
 *
 * This flag ensures variable initialization only runs on the first cycle.
 * The VM resets PC to 0 each cycle, so without this guard, all variables
 * would be reset to initial values every scan cycle.
 * 
 * For multi-task compilation, each program gets its own init flag address
 * calculated relative to its work memory region.
 */
const DEFAULT_INIT_FLAG_ADDR = 0x3FFF;

/**
 * Size of work memory region allocated per program in multi-task mode.
 * Each program gets this many bytes of isolated work memory.
 * Must be a power of 2 for efficient alignment.
 */
export const WORK_MEMORY_REGION_SIZE = 256;

// ============================================================================
// Code Generator Configuration
// ============================================================================

/**
 * Configuration options for code generation.
 */
export interface CodeGenOptions {
    /**
     * Base address for work memory allocation.
     * Default: 0x2000 (standard ZPLC work memory base)
     */
    workMemoryBase?: number;

    /**
     * Address of the initialization flag.
     * If not specified, calculated as workMemoryBase + WORK_MEMORY_REGION_SIZE - 1
     */
    initFlagAddress?: number;

    /**
     * Enable source line annotations in assembly output for debugging.
     * When true, emits "; @source <line>" comments before statements.
     * Default: false
     */
    emitSourceAnnotations?: boolean;
}

// ============================================================================
// Code Generator
// ============================================================================

/**
 * String literal entry in the pool.
 */
interface StringLiteralEntry {
    value: string;
    address: number;
    size: number;  // Total bytes including header
}

/**
 * Loop context for EXIT/CONTINUE statement handling.
 * Each loop (WHILE, FOR, REPEAT) pushes a context onto the stack.
 */
interface LoopContext {
    /** Label to jump to for CONTINUE (start of next iteration) */
    continueLabel: string;
    /** Label to jump to for EXIT (end of loop) */
    exitLabel: string;
}

/**
 * User-defined function metadata for code generation.
 */
interface FunctionInfo {
    label: string;
    returnType: DataTypeValue;
    inputs: VarDecl[];
}

/**
 * Code generator state.
 */
interface CodeGenState {
    symbols: SymbolTable;
    output: string[];
    labelCounter: number;
    initFlagAddr: number;
    /** Pool of string literals allocated in work memory */
    stringLiterals: StringLiteralEntry[];
    /** Next available address for string literal allocation */
    stringLiteralNextAddr: number;
    /** Stack of loop contexts for EXIT/CONTINUE handling */
    loopStack: LoopContext[];
    /** Last emitted source line (for deduplication) */
    lastSourceLine: number;
    /** Enable source annotations in assembly output */
    emitSourceAnnotations: boolean;
    /** User-defined functions registry */
    functionTable: Map<string, FunctionInfo>;
    /** User-defined function blocks registry */
    functionBlockTable: Map<string, FunctionBlockDecl>;
    /** Current function being generated (for return value assignment) */
    currentFunction: FunctionDecl | null;
    /** Current FB instance being inlined */
    currentFBInstance: Symbol | null;
}

/**
 * Generate ZPLC assembly from a parsed unit (CompilationUnit or Program).
 *
 * @param unit - Parsed AST unit
 * @param options - Optional code generation configuration
 * @returns Assembly source code
 */
export function generate(unit: CompilationUnit | Program, options?: CodeGenOptions): string {
    const workMemoryBase = options?.workMemoryBase ?? MemoryLayout.WORK_BASE;
    const initFlagAddr = options?.initFlagAddress ??
        (options?.workMemoryBase !== undefined
            ? workMemoryBase + WORK_MEMORY_REGION_SIZE - 1
            : DEFAULT_INIT_FLAG_ADDR);


    const symbols = buildSymbolTable(unit, workMemoryBase);

    // Calculate string literal pool base address
    const workOffset = symbols.getWorkOffset();
    const stringLiteralBase = workMemoryBase + workOffset;

    const state: CodeGenState = {
        symbols,
        output: [],
        labelCounter: 0,
        initFlagAddr,
        stringLiterals: [],
        stringLiteralNextAddr: stringLiteralBase,
        loopStack: [],
        lastSourceLine: 0,
        emitSourceAnnotations: options?.emitSourceAnnotations ?? false,
        functionTable: new Map(),
        functionBlockTable: new Map(),
        currentFunction: null,
        currentFBInstance: null,
    };

    const isUnit = unit.kind === 'CompilationUnit';
    const mainProgram = isUnit ? (unit as CompilationUnit).programs[0] : (unit as Program);

    if (!mainProgram) {
        return '; ERROR: No program found';
    }

    // First pass: collect string literals
    if (isUnit) {
        for (const func of (unit as CompilationUnit).functions) {
            for (const stmt of func.body) {
                collectStringLiteralsInStatement(state, stmt);
            }
        }
        for (const prog of (unit as CompilationUnit).programs) {
            collectStringLiterals(state, prog);
        }
    } else {
        collectStringLiterals(state, mainProgram);
    }

    // Emit header
    emit(state, `; ============================================================================`);
    emit(state, `; ZPLC Generated Assembly`);
    emit(state, `; Program: ${mainProgram.name}`);
    if (options?.workMemoryBase !== undefined) {
        emit(state, `; Work Memory Base: ${formatAddress(workMemoryBase)}`);
        emit(state, `; Init Flag: ${formatAddress(initFlagAddr)}`);
    }
    emit(state, `; ============================================================================`);
    emit(state, ``);

    // Memory map
    emitMemoryMap(state);

    // Emit User Functions first
    if (isUnit) {
        const cu = unit as CompilationUnit;

        // Register User Function Blocks (for inlining later)
        for (const fb of cu.functionBlocks) {
            state.functionBlockTable.set(fb.name, fb);
        }

        // Generate User Functions
        for (const func of cu.functions) {
            generateFunctionDecl(state, func);
        }
    }

    // Emit program entry
    emit(state, `; === Program Entry ===`);
    emit(state, `_start:`);

    // Initialization check
    emit(state, `    ; Check if already initialized`);
    emit(state, `    LOAD8 ${formatAddress(state.initFlagAddr)}    ; _initialized flag`);
    emit(state, `    JNZ _cycle                  ; Skip init if already done`);

    // Initialization
    if (isUnit) {
        for (const prog of (unit as CompilationUnit).programs) {
            emitInitialization(state, prog);
        }
    } else {
        emitInitialization(state, mainProgram);
    }

    emitStringLiteralInit(state);

    emit(state, ``);
    emit(state, `    ; Mark as initialized`);
    emit(state, `    PUSH8 1`);
    emit(state, `    STORE8 ${formatAddress(state.initFlagAddr)}`);

    emit(state, ``);
    emit(state, `; === Main Cycle ===`);
    emit(state, `_cycle:`);

    // Emit statements for the main program
    for (const stmt of mainProgram.statements) {
        emitStatement(state, stmt);
    }

    emit(state, ``);
    emit(state, `    ; End of cycle`);
    emit(state, `    HALT`);

    return state.output.join('\n');
}

// ============================================================================
// Helpers
// ============================================================================

function emit(state: CodeGenState, line: string): void {
    state.output.push(line);
}

/**
 * Emit a source line annotation comment.
 * This allows the assembler to track source line → bytecode PC mapping.
 * Only emits if the line is different from the last emitted line (deduplication).
 */
function emitSourceAnnotation(state: CodeGenState, line: number | undefined): void {
    if (!state.emitSourceAnnotations || !line || line === state.lastSourceLine) {
        return;
    }
    state.lastSourceLine = line;
    emit(state, `    ; @source ${line}`);
}

function newLabel(state: CodeGenState, prefix: string): string {
    return `${prefix}_${state.labelCounter++}`;
}

function formatAddress(addr: number): string {
    return `0x${addr.toString(16).padStart(4, '0')}`;
}

// ============================================================================
// Memory Map Comment
// ============================================================================

function emitMemoryMap(state: CodeGenState): void {
    emit(state, `; === Memory Map ===`);

    // Document the reserved init flag
    emit(state, `; ${formatAddress(state.initFlagAddr)}: _initialized (BOOL, 1 byte) [RESERVED]`);

    for (const sym of state.symbols.all()) {
        const addrHex = formatAddress(sym.address);
        emit(state, `; ${addrHex}: ${sym.name} (${sym.dataType}, ${sym.size} bytes)`);

        // Emit member offsets for function blocks
        if (sym.members) {
            for (const [member, offset] of sym.members) {
                const memberAddr = formatAddress(sym.address + offset);
                emit(state, `;   ${memberAddr}: .${member}`);
            }
        }
    }

    // Document string literals
    if (state.stringLiterals.length > 0) {
        emit(state, `; --- String Literals ---`);
        for (let i = 0; i < state.stringLiterals.length; i++) {
            const lit = state.stringLiterals[i];
            const preview = lit.value.length > 20 ? lit.value.substring(0, 20) + '...' : lit.value;
            emit(state, `; ${formatAddress(lit.address)}: _str${i} = '${preview}' (${lit.size} bytes)`);
        }
    }

    emit(state, ``);
}

// ============================================================================
// String Literal Collection and Allocation
// ============================================================================

/**
 * STRING memory layout constants.
 * Matches zplc_isa.h definitions.
 */
const STRING_HEADER_SIZE = 4;  // 2 bytes length + 2 bytes capacity
// Default capacity is defined in zplc_isa.h as 80 bytes

/**
 * Calculate the size in bytes for a string literal.
 * Layout: [len:2][cap:2][data:cap+1]
 */
function getStringLiteralSize(value: string): number {
    // Use the string length as capacity (plus null terminator)
    const capacity = Math.max(value.length, 1);  // At least 1 char capacity
    return STRING_HEADER_SIZE + capacity + 1;  // +1 for null terminator
}

/**
 * Collect all string literals from a program or function body.
 * String literals are pooled in work memory to save space.
 */
function collectStringLiterals(state: CodeGenState, program: Program): void {
    // Visit all variable initializers
    for (const block of program.varBlocks) {
        for (const decl of block.variables) {
            if (decl.initialValue) {
                collectStringLiteralsInExpression(state, decl.initialValue);
            }
        }
    }

    // Visit all statements
    for (const stmt of program.statements) {
        collectStringLiteralsInStatement(state, stmt);
    }
}

/**
 * Recursively collect all string literals from an expression.
 * Allocates addresses for each unique literal.
 */
function collectStringLiteralsInExpression(state: CodeGenState, expr: Expression): void {
    // Use a local 'seen' map to avoid re-adding the same literal within a single expression
    // However, the global state.stringLiterals and state.stringLiteralNextAddr handle global uniqueness and allocation.
    // This function primarily traverses and adds to the global pool.
    switch (expr.kind) {
        case 'StringLiteral':
            // Check if we've seen this literal before in the global pool
            if (!state.stringLiterals.some(e => e.value === expr.value)) {
                const size = getStringLiteralSize(expr.value);
                const entry: StringLiteralEntry = {
                    value: expr.value,
                    address: state.stringLiteralNextAddr,
                    size,
                };
                state.stringLiterals.push(entry);
                state.stringLiteralNextAddr += size;
            }
            break;
        case 'UnaryExpr':
            collectStringLiteralsInExpression(state, expr.operand);
            break;
        case 'BinaryExpr':
            collectStringLiteralsInExpression(state, expr.left);
            collectStringLiteralsInExpression(state, expr.right);
            break;
        case 'FunctionCall':
            for (const arg of expr.args) {
                collectStringLiteralsInExpression(state, arg);
            }
            break;
        case 'FBCall':
            for (const param of expr.parameters) {
                collectStringLiteralsInExpression(state, param.value);
            }
            break;
        case 'ArrayAccess':
            collectStringLiteralsInExpression(state, expr.array);
            for (const index of expr.indices) {
                collectStringLiteralsInExpression(state, index);
            }
            break;
        case 'MemberAccess':
            collectStringLiteralsInExpression(state, expr.object);
            // Member name is an identifier, not an expression
            break;
        case 'ArrayLiteral':
            for (const element of expr.elements) {
                collectStringLiteralsInExpression(state, element as Expression);
            }
            break;
        case 'IntLiteral':
        case 'RealLiteral':
        case 'BoolLiteral':
        case 'TimeLiteral':
            // These do not contain string literals
            break;
        case 'Identifier':
            // Identifier is not an expression that can contain literals
            break;
        default:
            // Handle other expression types if necessary
            break;
    }
}

function collectStringLiteralsInStatement(state: CodeGenState, stmt: Statement): void {
    switch (stmt.kind) {
        case 'Assignment':
            collectStringLiteralsInExpression(state, stmt.value);
            // If target is ArrayAccess or MemberAccess, its parts might contain expressions
            if (stmt.target.kind === 'ArrayAccess') {
                collectStringLiteralsInExpression(state, stmt.target.array);
                for (const index of stmt.target.indices) {
                    collectStringLiteralsInExpression(state, index);
                }
            } else if (stmt.target.kind === 'MemberAccess') {
                collectStringLiteralsInExpression(state, stmt.target.object);
            }
            break;
        case 'IfStatement':
            collectStringLiteralsInExpression(state, stmt.condition);
            for (const s of stmt.thenBranch) {
                collectStringLiteralsInStatement(state, s);
            }
            // Visit ELSIF branches
            if (stmt.elsifBranches) {
                for (const elsif of stmt.elsifBranches) {
                    collectStringLiteralsInExpression(state, elsif.condition);
                    for (const s of elsif.statements) {
                        collectStringLiteralsInStatement(state, s);
                    }
                }
            }
            if (stmt.elseBranch) {
                for (const s of stmt.elseBranch) {
                    collectStringLiteralsInStatement(state, s);
                }
            }
            break;
        case 'WhileStatement':
            collectStringLiteralsInExpression(state, stmt.condition);
            for (const s of stmt.body) {
                collectStringLiteralsInStatement(state, s);
            }
            break;
        case 'ForStatement':
            collectStringLiteralsInExpression(state, stmt.start);
            collectStringLiteralsInExpression(state, stmt.end);
            if (stmt.step) {
                collectStringLiteralsInExpression(state, stmt.step);
            }
            for (const s of stmt.body) {
                collectStringLiteralsInStatement(state, s);
            }
            break;
        case 'RepeatStatement':
            collectStringLiteralsInExpression(state, stmt.condition);
            for (const s of stmt.body) {
                collectStringLiteralsInStatement(state, s);
            }
            break;
        case 'CaseStatement':
            collectStringLiteralsInExpression(state, stmt.selector);
            for (const branch of stmt.branches) {
                // Case values are number | {start, end}, no expressions there
                for (const s of branch.statements) {
                    collectStringLiteralsInStatement(state, s);
                }
            }
            if (stmt.elseBranch) {
                for (const s of stmt.elseBranch) {
                    collectStringLiteralsInStatement(state, s);
                }
            }
            break;
        case 'FBCallStatement':
            for (const param of stmt.parameters) {
                collectStringLiteralsInExpression(state, param.value);
            }
            break;
        case 'ExitStatement':
        case 'ContinueStatement':
        case 'ExitStatement':
        case 'ContinueStatement':
        case 'ReturnStatement':
            // These have no expressions
            break;
        default:
            // No expressions in other statement types
            break;
    }
}

/**
 * Find the address of a string literal in the pool.
 * Returns undefined if not found.
 */
function findStringLiteralAddress(state: CodeGenState, value: string): number | undefined {
    const entry = state.stringLiterals.find(e => e.value === value);
    return entry?.address;
}

/**
 * Emit initialization code for all string literals.
 * Each string is initialized with its header (len, cap) and data bytes.
 */
function emitStringLiteralInit(state: CodeGenState): void {
    if (state.stringLiterals.length === 0) {
        return;
    }

    emit(state, ``);
    emit(state, `    ; --- String Literal Initialization ---`);

    for (let i = 0; i < state.stringLiterals.length; i++) {
        const lit = state.stringLiterals[i];
        const len = lit.value.length;
        const cap = len > 0 ? len : 1;  // At least capacity of 1

        emit(state, `    ; _str${i} = '${lit.value.substring(0, 20)}${lit.value.length > 20 ? '...' : ''}'`);

        // Store length (uint16 at offset 0)
        emit(state, `    PUSH16 ${len}`);
        emit(state, `    STORE16 ${formatAddress(lit.address)}`);

        // Store capacity (uint16 at offset 2)
        emit(state, `    PUSH16 ${cap}`);
        emit(state, `    STORE16 ${formatAddress(lit.address + 2)}`);

        // Store each character byte (offset 4+)
        for (let j = 0; j < len; j++) {
            const charCode = lit.value.charCodeAt(j);
            emit(state, `    PUSH8 ${charCode}       ; '${lit.value[j]}'`);
            emit(state, `    STORE8 ${formatAddress(lit.address + STRING_HEADER_SIZE + j)}`);
        }

        // Store null terminator
        emit(state, `    PUSH8 0           ; null terminator`);
        emit(state, `    STORE8 ${formatAddress(lit.address + STRING_HEADER_SIZE + len)}`);
    }
}

// ============================================================================
// Initialization
// ============================================================================

function emitInitialization(state: CodeGenState, program: Program): void {
    let hasInit = false;

    for (const block of program.varBlocks) {
        for (const decl of block.variables) {
            if (decl.initialValue) {
                if (!hasInit) {
                    emit(state, ``);
                    emit(state, `    ; --- Variable Initialization ---`);
                    hasInit = true;
                }

                const sym = state.symbols.get(decl.name);
                if (!sym) continue;

                emit(state, `    ; ${decl.name} := ...`);
                emitExpression(state, decl.initialValue as Expression);
                emitStore(state, sym);
            }
        }
    }
}

// ============================================================================
// Function Declarations
// ============================================================================

function generateFunctionDecl(state: CodeGenState, func: FunctionDecl): void {
    const label = `func_${func.name}`;
    state.functionTable.set(func.name, {
        label,
        returnType: func.returnType,
        inputs: func.inputs,
    });

    state.currentFunction = func;

    emit(state, ``);
    emit(state, `; --- FUNCTION ${func.name} ---`);
    emit(state, `${label}:`);

    // Function parameters are on the stack in order A, B, C...
    // We need to pop them into local addresses in REVERSE order
    for (let i = func.inputs.length - 1; i >= 0; i--) {
        const input = func.inputs[i];
        const sym = state.symbols.get(input.name);
        if (sym) {
            emit(state, `    ; Pop parameter ${input.name}`);
            emitStore(state, sym);
        }
    }

    // Emit body statements
    for (const stmt of func.body) {
        emitStatement(state, stmt);
    }

    // Load return value (stored in the variable named func.name) onto stack
    const returnSym = state.symbols.get(func.name);
    if (returnSym) {
        emit(state, `    ; Push return value`);
        const suffix = getLoadStoreSuffix(returnSym.dataType as DataTypeValue);
        emit(state, `    LOAD${suffix} ${formatAddress(returnSym.address)}`);
    } else {
        emit(state, `    PUSH32 0    ; Default return value`);
    }

    emit(state, `    RET`);
    state.currentFunction = null;
}

// ============================================================================
// Statement Visitors
// ============================================================================

function emitStatement(state: CodeGenState, stmt: Statement): void {
    // Emit source annotation before the first instruction of this statement
    emitSourceAnnotation(state, stmt.line);

    switch (stmt.kind) {
        case 'Assignment':
            emitAssignment(state, stmt);
            break;
        case 'IfStatement':
            emitIfStatement(state, stmt);
            break;
        case 'WhileStatement':
            emitWhileStatement(state, stmt);
            break;
        case 'ForStatement':
            emitForStatement(state, stmt);
            break;
        case 'RepeatStatement':
            emitRepeatStatement(state, stmt);
            break;
        case 'CaseStatement':
            emitCaseStatement(state, stmt);
            break;
        case 'ExitStatement':
            emitExitStatement(state);
            break;
        case 'ContinueStatement':
            emitContinueStatement(state);
            break;
        case 'ReturnStatement':
            emitReturnStatement(state);
            break;
        case 'FBCallStatement':
            emitFBCallStatement(state, stmt);
            break;
        default:
            emit(state, `    ; ERROR: Unknown statement type ${(stmt as Statement).kind}`);
    }
}

function emitAssignment(state: CodeGenState, stmt: Assignment): void {
    emit(state, ``);

    if (stmt.target.kind === 'Identifier') {
        // IEC return syntax: FunctionName := value
        if (state.currentFunction && stmt.target.name === state.currentFunction.name) {
            emit(state, `    ; RETURN ${state.currentFunction.name} := ...`);
            emitExpression(state, stmt.value);
            const sym = state.symbols.get(stmt.target.name);
            if (sym) {
                emitStore(state, sym);
            }
            return;
        }

        const sym = state.symbols.get(stmt.target.name);
        if (!sym) return;

        emit(state, `    ; ${stmt.target.name} := ...`);
        emitExpression(state, stmt.value);
        const suffix = getLoadStoreSuffix(sym.dataType as DataTypeValue);
        emit(state, `    STORE${suffix} ${formatAddress(sym.address)}`);
    } else if (stmt.target.kind === 'MemberAccess') {
        emit(state, `    ; ${stringifyExpression(stmt.target)} := ...`);
        emitExpression(state, stmt.value);

        const resolution = state.symbols.resolveMemberPath(stmt.target);
        const suffix = getLoadStoreSuffix(resolution.dataType as DataTypeValue);
        emit(state, `    STORE${suffix} ${formatAddress(resolution.address)}`);
    } else if (stmt.target.kind === 'ArrayAccess') {
        // Array element assignment: arr[i] := value
        const resolution = state.symbols.resolveMemberPath(stmt.target.array);
        const arrayType = resolution.dataType as ArrayType;

        if (!isArrayType(arrayType)) {
            emit(state, `    ; ERROR: target is not an array`);
            return;
        }

        emit(state, `    ; ${stringifyExpression(stmt.target)} := ...`);

        // Calculate the address: base + offset
        emitArrayAddress(state, stmt.target, resolution);

        // Evaluate the value to store
        emitExpression(state, stmt.value);

        // Store using indirect addressing
        const elementSize = getDataTypeSize(arrayType.elementType as DataTypeValue);
        emit(state, `    PUSH32 ${elementSize}`);
        emit(state, `    MUL32`);
        emit(state, `    ADD32`);
        emit(state, `    STOREI${elementSize * 8}`);
    }
}

function emitIfStatement(state: CodeGenState, stmt: IfStatement): void {
    const endLabel = newLabel(state, 'end_if');
    const hasElsif = stmt.elsifBranches && stmt.elsifBranches.length > 0;
    const hasElse = stmt.elseBranch && stmt.elseBranch.length > 0;

    // Generate labels for each ELSIF branch
    const elsifLabels: string[] = [];
    for (let i = 0; i < (stmt.elsifBranches?.length ?? 0); i++) {
        elsifLabels.push(newLabel(state, 'elsif'));
    }
    const elseLabel = hasElse ? newLabel(state, 'else') : null;

    // Determine where to jump if the main IF condition is false
    const firstFalseLabel = elsifLabels.length > 0
        ? elsifLabels[0]
        : (elseLabel ?? endLabel);

    emit(state, ``);
    emit(state, `    ; IF condition`);
    emitExpression(state, stmt.condition);
    emit(state, `    JZ ${firstFalseLabel}`);

    // THEN branch
    emit(state, `    ; THEN branch`);
    for (const s of stmt.thenBranch) {
        emitStatement(state, s);
    }

    // Jump to end after THEN (only if there are more branches)
    if (hasElsif || hasElse) {
        emit(state, `    JMP ${endLabel}`);
    }

    // ELSIF branches
    if (stmt.elsifBranches) {
        for (let i = 0; i < stmt.elsifBranches.length; i++) {
            const elsif = stmt.elsifBranches[i];
            const currentLabel = elsifLabels[i];

            // Determine where to jump if this ELSIF condition is false
            const nextFalseLabel = i + 1 < elsifLabels.length
                ? elsifLabels[i + 1]
                : (elseLabel ?? endLabel);

            emit(state, `${currentLabel}:`);
            emit(state, `    ; ELSIF condition`);
            emitExpression(state, elsif.condition);
            emit(state, `    JZ ${nextFalseLabel}`);

            emit(state, `    ; ELSIF branch`);
            for (const s of elsif.statements) {
                emitStatement(state, s);
            }
            emit(state, `    JMP ${endLabel}`);
        }
    }

    // ELSE branch
    if (hasElse && elseLabel) {
        emit(state, `${elseLabel}:`);
        emit(state, `    ; ELSE branch`);
        for (const s of stmt.elseBranch!) {
            emitStatement(state, s);
        }
    }

    emit(state, `${endLabel}:`);
}

/**
 * Emit a WHILE statement.
 *
 * Pattern:
 *   while_loop_N:
 *       <condition>
 *       JZ end_while_N
 *       <body>
 *       JMP while_loop_N
 *   end_while_N:
 */
function emitWhileStatement(state: CodeGenState, stmt: WhileStatement): void {
    const loopLabel = newLabel(state, 'while_loop');
    const endLabel = newLabel(state, 'end_while');

    // Push loop context for EXIT/CONTINUE handling
    state.loopStack.push({
        continueLabel: loopLabel,  // CONTINUE jumps to loop start (re-evaluate condition)
        exitLabel: endLabel,
    });

    emit(state, ``);
    emit(state, `    ; WHILE loop`);
    emit(state, `${loopLabel}:`);
    emit(state, `    ; condition`);
    emitExpression(state, stmt.condition);
    emit(state, `    JZ ${endLabel}`);

    emit(state, `    ; loop body`);
    for (const s of stmt.body) {
        emitStatement(state, s);
    }

    emit(state, `    JMP ${loopLabel}`);
    emit(state, `${endLabel}:`);

    // Pop loop context
    state.loopStack.pop();
}

/**
 * Emit a FOR statement.
 *
 * Pattern:
 *   ; FOR counter := start TO end BY step
 *   <start>
 *   STORE32 <counter_addr>
 *   for_loop_N:
 *       LOAD32 <counter_addr>
 *       <end>
 *       GT
 *       JNZ end_for_N
 *       <body>
 *   for_continue_N:
 *       LOAD32 <counter_addr>
 *       <step or PUSH8 1>
 *       ADD
 *       STORE32 <counter_addr>
 *       JMP for_loop_N
 *   end_for_N:
 */
function emitForStatement(state: CodeGenState, stmt: ForStatement): void {
    const loopLabel = newLabel(state, 'for_loop');
    const continueLabel = newLabel(state, 'for_continue');
    const endLabel = newLabel(state, 'end_for');

    // Get counter variable symbol
    const counterSym = state.symbols.get(stmt.counter);
    if (!counterSym) {
        emit(state, `    ; ERROR: Unknown loop counter variable ${stmt.counter}`);
        return;
    }

    const counterAddr = formatAddress(counterSym.address);
    const suffix = getLoadStoreSuffix(counterSym.dataType as DataTypeValue);

    // Push loop context for EXIT/CONTINUE handling
    state.loopStack.push({
        continueLabel: continueLabel,  // CONTINUE jumps to increment section
        exitLabel: endLabel,
    });

    emit(state, ``);
    emit(state, `    ; FOR ${stmt.counter} := start TO end`);

    // Initialize counter
    emit(state, `    ; counter := start`);
    emitExpression(state, stmt.start);
    emit(state, `    STORE${suffix} ${counterAddr}`);

    // Loop condition check
    emit(state, `${loopLabel}:`);
    emit(state, `    ; check: counter > end?`);
    emit(state, `    LOAD${suffix} ${counterAddr}`);
    emitExpression(state, stmt.end);
    emit(state, `    GT`);
    emit(state, `    JNZ ${endLabel}`);

    // Loop body
    emit(state, `    ; loop body`);
    for (const s of stmt.body) {
        emitStatement(state, s);
    }

    // Increment section (CONTINUE target)
    emit(state, `${continueLabel}:`);
    emit(state, `    ; counter := counter + step`);
    emit(state, `    LOAD${suffix} ${counterAddr}`);
    if (stmt.step) {
        emitExpression(state, stmt.step);
    } else {
        emit(state, `    PUSH8 1       ; default step`);
    }
    emit(state, `    ADD`);
    emit(state, `    STORE${suffix} ${counterAddr}`);
    emit(state, `    JMP ${loopLabel}`);

    emit(state, `${endLabel}:`);

    // Pop loop context
    state.loopStack.pop();
}

/**
 * Emit a REPEAT statement.
 *
 * Pattern:
 *   repeat_loop_N:
 *       <body>           ; executes at least once
 *   repeat_continue_N:
 *       <condition>
 *       JZ repeat_loop_N ; repeat while condition is FALSE
 *   end_repeat_N:
 */
function emitRepeatStatement(state: CodeGenState, stmt: RepeatStatement): void {
    const loopLabel = newLabel(state, 'repeat_loop');
    const continueLabel = newLabel(state, 'repeat_continue');
    const endLabel = newLabel(state, 'end_repeat');

    // Push loop context for EXIT/CONTINUE handling
    state.loopStack.push({
        continueLabel: continueLabel,  // CONTINUE jumps to condition check
        exitLabel: endLabel,
    });

    emit(state, ``);
    emit(state, `    ; REPEAT...UNTIL loop`);
    emit(state, `${loopLabel}:`);

    emit(state, `    ; loop body (executes at least once)`);
    for (const s of stmt.body) {
        emitStatement(state, s);
    }

    // Condition check (CONTINUE target)
    emit(state, `${continueLabel}:`);
    emit(state, `    ; UNTIL condition`);
    emitExpression(state, stmt.condition);
    emit(state, `    JZ ${loopLabel}   ; repeat while FALSE`);

    emit(state, `${endLabel}:`);

    // Pop loop context
    state.loopStack.pop();
}

/**
 * Emit a CASE statement.
 *
 * Pattern:
 *   ; CASE selector OF
 *   <selector>
 *   DUP
 *   PUSH8 <value1>
 *   EQ
 *   JNZ case_branch_0
 *   DUP
 *   PUSH8 <value2>
 *   EQ
 *   JNZ case_branch_1
 *   ...
 *   JMP case_else_N (or end_case if no else)
 *   case_branch_0:
 *       DROP
 *       <statements>
 *       JMP end_case_N
 *   case_branch_1:
 *       DROP
 *       <statements>
 *       JMP end_case_N
 *   case_else_N:
 *       DROP
 *       <statements>
 *   end_case_N:
 */
function emitCaseStatement(state: CodeGenState, stmt: CaseStatement): void {
    const endLabel = newLabel(state, 'end_case');
    const elseLabel = stmt.elseBranch ? newLabel(state, 'case_else') : null;

    // Generate labels for each branch
    const branchLabels: string[] = stmt.branches.map(() => newLabel(state, 'case_branch'));

    emit(state, ``);
    emit(state, `    ; CASE statement`);
    emit(state, `    ; evaluate selector`);
    emitExpression(state, stmt.selector);

    // Emit comparison for each branch
    for (let i = 0; i < stmt.branches.length; i++) {
        const branch = stmt.branches[i];
        const branchLabel = branchLabels[i];

        // Each branch can have multiple values or ranges
        for (const value of branch.values) {
            if (typeof value === 'number') {
                // Single value comparison
                emit(state, `    DUP`);
                if (value >= -128 && value <= 127) {
                    emit(state, `    PUSH8 ${value}`);
                } else if (value >= -32768 && value <= 32767) {
                    emit(state, `    PUSH16 ${value}`);
                } else {
                    emit(state, `    PUSH32 ${value}`);
                }
                emit(state, `    EQ`);
                emit(state, `    JNZ ${branchLabel}`);
            } else {
                // Range comparison: value.start..value.end
                // Check: selector >= start AND selector <= end
                emit(state, `    DUP`);
                if (value.start >= -128 && value.start <= 127) {
                    emit(state, `    PUSH8 ${value.start}`);
                } else {
                    emit(state, `    PUSH32 ${value.start}`);
                }
                emit(state, `    GE`);
                emit(state, `    DUP`);
                emit(state, `    JZ _skip_range_${state.labelCounter}`);
                emit(state, `    DROP`);
                emit(state, `    DUP`);
                if (value.end >= -128 && value.end <= 127) {
                    emit(state, `    PUSH8 ${value.end}`);
                } else {
                    emit(state, `    PUSH32 ${value.end}`);
                }
                emit(state, `    LE`);
                emit(state, `_skip_range_${state.labelCounter++}:`);
                emit(state, `    JNZ ${branchLabel}`);
            }
        }
    }

    // Jump to else or end if no match
    emit(state, `    JMP ${elseLabel ?? endLabel}`);

    // Emit each branch body
    for (let i = 0; i < stmt.branches.length; i++) {
        const branch = stmt.branches[i];
        const branchLabel = branchLabels[i];

        emit(state, `${branchLabel}:`);
        emit(state, `    DROP        ; discard selector`);
        for (const s of branch.statements) {
            emitStatement(state, s);
        }
        emit(state, `    JMP ${endLabel}`);
    }

    // Else branch
    if (elseLabel && stmt.elseBranch) {
        emit(state, `${elseLabel}:`);
        emit(state, `    DROP        ; discard selector`);
        emit(state, `    ; ELSE branch`);
        for (const s of stmt.elseBranch) {
            emitStatement(state, s);
        }
    } else if (!stmt.elseBranch) {
        // No else - still need to drop the selector before end
        // We need a small shim to drop before ending
        emit(state, `${newLabel(state, 'case_drop')}:`);
        emit(state, `    DROP        ; discard selector (no match)`);
    }

    emit(state, `${endLabel}:`);
}

/**
 * Emit an EXIT statement.
 * Jumps to the exit label of the innermost loop.
 */
function emitExitStatement(state: CodeGenState): void {
    if (state.loopStack.length === 0) {
        emit(state, `    ; ERROR: EXIT outside of loop`);
        return;
    }

    const loopCtx = state.loopStack[state.loopStack.length - 1];
    emit(state, `    ; EXIT`);
    emit(state, `    JMP ${loopCtx.exitLabel}`);
}

/**
 * Emit a CONTINUE statement.
 * Jumps to the continue label of the innermost loop.
 */
function emitContinueStatement(state: CodeGenState): void {
    if (state.loopStack.length === 0) {
        emit(state, `    ; ERROR: CONTINUE outside of loop`);
        return;
    }

    const loopCtx = state.loopStack[state.loopStack.length - 1];
    emit(state, `    ; CONTINUE`);
    emit(state, `    JMP ${loopCtx.continueLabel}`);
}

/**
 * Emit a RETURN statement.
 * In PROGRAM context, this acts like HALT (end the cycle early).
 * In FUNCTION/FUNCTION_BLOCK context, this would emit RET.
 */
function emitReturnStatement(state: CodeGenState): void {
    emit(state, `    ; RETURN`);
    // For PROGRAM, RETURN ends the cycle early
    // We jump to the HALT at the end
    emit(state, `    HALT`);
}

function emitFBCallStatement(state: CodeGenState, stmt: FBCallStatement): void {
    const sym = state.symbols.get(stmt.fbName);
    if (!sym) {
        emit(state, `    ; ERROR: Unknown FB instance '${stmt.fbName}'`);
        return;
    }

    const typeName = sym.dataType as string;

    // 1. Check if it's a user-defined FB
    const userFB = state.functionBlockTable.get(typeName);
    if (userFB) {
        emit(state, `    ; --- FB CALL: ${stmt.fbName} (${typeName}) ---`);

        // Assign inputs
        for (const param of stmt.parameters) {
            emit(state, `    ; ${stmt.fbName}.${param.name} := ...`);
            emitExpression(state, param.value);
            const memberAddr = state.symbols.getMemberAddress(stmt.fbName, param.name);
            const suffix = getMemberLoadStoreSuffix(state.symbols, typeName, param.name);
            emit(state, `    STORE${suffix} ${formatAddress(memberAddr)}`);
        }

        // Set context for inlining
        const oldFBInstance = state.currentFBInstance;
        state.currentFBInstance = sym;

        // Inline FB Body
        for (const bodyStmt of userFB.body) {
            emitStatement(state, bodyStmt);
        }

        // Restore context
        state.currentFBInstance = oldFBInstance;
        emit(state, `    ; --- END FB CALL: ${stmt.fbName} ---`);
        return;
    }

    // 2. Check if it's a built-in FB
    const fbDef = getFB(typeName as DataTypeValue);
    if (fbDef) {
        emit(state, `    ; ${stmt.fbName}(...)`);

        const ctx: CodeGenContext = {
            baseAddress: sym.address,
            instanceName: stmt.fbName,
            newLabel: (prefix: string) => newLabel(state, prefix),
            emit: (line: string) => emit(state, line),
            emitExpression: (expr: Expression) => emitExpression(state, expr),
        };

        fbDef.generateCall(ctx, stmt.parameters);
        return;
    }

    emit(state, `    ; ERROR: Unknown FB type '${typeName}' for instance '${stmt.fbName}'`);
}

// ============================================================================
// Expressions
// ============================================================================

function emitExpression(state: CodeGenState, expr: Expression): void {
    switch (expr.kind) {
        case 'BoolLiteral':
            emitBoolLiteral(state, expr);
            break;
        case 'IntLiteral':
            emitIntLiteral(state, expr);
            break;
        case 'RealLiteral':
            emitRealLiteral(state, expr);
            break;
        case 'TimeLiteral':
            emitTimeLiteral(state, expr);
            break;
        case 'StringLiteral':
            emitStringLiteral(state, expr);
            break;
        case 'Identifier':
            emitIdentifier(state, expr);
            break;
        case 'MemberAccess':
            emitMemberAccess(state, expr);
            break;
        case 'UnaryExpr':
            emitUnaryExpr(state, expr);
            break;
        case 'BinaryExpr':
            emitBinaryExpr(state, expr);
            break;
        case 'FunctionCall':
            emitFunctionCall(state, expr);
            break;
        case 'FBCall':
            emit(state, `    ; TODO: Inline FB call expression`);
            break;
        case 'ArrayAccess':
            emitArrayAccess(state, expr);
            break;
        default:
            emit(state, `    ; TODO: Expression type ${(expr as Expression).kind}`);
    }
}

function emitBoolLiteral(state: CodeGenState, expr: BoolLiteral): void {
    emit(state, `    PUSH8 ${expr.value ? 1 : 0}`);
}

function emitIntLiteral(state: CodeGenState, expr: IntLiteral): void {
    if (expr.value >= -128 && expr.value <= 127) {
        emit(state, `    PUSH8 ${expr.value}`);
    } else if (expr.value >= -32768 && expr.value <= 32767) {
        emit(state, `    PUSH16 ${expr.value}`);
    } else if (expr.value >= -2147483648 && expr.value <= 2147483647) {
        emit(state, `    PUSH32 ${expr.value}`);
    } else {
        // Assume 64-bit if it doesn't fit in 32-bit
        emit(state, `    PUSH64 ${expr.value}`);
    }
}

/**
 * Emit a REAL (floating-point) literal.
 * Converts the float to IEEE 754 single-precision (32-bit) representation.
 */
function emitRealLiteral(state: CodeGenState, expr: RealLiteral): void {
    // Convert float to 32-bit IEEE 754 representation
    const buffer = new ArrayBuffer(4);
    const floatView = new Float32Array(buffer);
    const intView = new Uint32Array(buffer);

    floatView[0] = expr.value;
    const ieee754Bits = intView[0];

    emit(state, `    PUSH32 ${ieee754Bits}       ; ${expr.value} (REAL)`);
}

function emitTimeLiteral(state: CodeGenState, expr: TimeLiteral): void {
    // Time is stored in milliseconds as a 32-bit integer
    emit(state, `    PUSH32 ${expr.valueMs}       ; ${expr.rawValue}`);
}

/**
 * Emit a STRING literal.
 *
 * String literals are pre-allocated in work memory during the collection phase.
 * This function emits a PUSH of the literal's address.
 */
function emitStringLiteral(state: CodeGenState, expr: StringLiteral): void {
    const addr = findStringLiteralAddress(state, expr.value);
    if (addr !== undefined) {
        emit(state, `    PUSH16 ${formatAddress(addr)}   ; '${expr.value.substring(0, 20)}${expr.value.length > 20 ? '...' : ''}'`);
    } else {
        // Should not happen if collectStringLiterals was called
        emit(state, `    ; ERROR: String literal not found in pool: '${expr.value}'`);
        emit(state, `    PUSH16 0`);
    }
}

function emitIdentifier(state: CodeGenState, expr: Identifier): void {
    // 1. Check if we are in an inlined FB context
    if (state.currentFBInstance && state.currentFBInstance.members) {
        const offset = state.currentFBInstance.members.get(expr.name);
        if (offset !== undefined) {
            const absAddr = state.currentFBInstance.address + offset;
            const typeName = state.currentFBInstance.dataType as string;
            const suffix = getMemberLoadStoreSuffix(state.symbols, typeName, expr.name);
            emit(state, `    LOAD${suffix} ${formatAddress(absAddr)}   ; (FB context) ${expr.name}`);
            return;
        }
    }

    // 2. Regular symbol lookup
    const sym = state.symbols.get(expr.name);
    if (!sym) {
        emit(state, `    ; ERROR: Unknown identifier ${expr.name}`);
        emit(state, `    PUSH32 0`);
        return;
    }

    // For STRING type, push the address (not load the value)
    if (sym.dataType === 'STRING') {
        emit(state, `    PUSH16 ${formatAddress(sym.address)}   ; &${expr.name}`);
        return;
    }

    const suffix = getLoadStoreSuffix(sym.dataType as DataTypeValue);
    emit(state, `    LOAD${suffix} ${formatAddress(sym.address)}   ; ${expr.name}`);
}

function emitMemberAccess(state: CodeGenState, expr: MemberAccess): void {
    const resolution = state.symbols.resolveMemberPath(expr);
    const suffix = getLoadStoreSuffix(resolution.dataType as DataTypeValue);
    emit(state, `    LOAD${suffix} ${formatAddress(resolution.address)}`);
}

function emitUnaryExpr(state: CodeGenState, expr: UnaryExpr): void {
    emitExpression(state, expr.operand);
    switch (expr.operator) {
        case 'NOT':
            emit(state, `    NOT`);
            // For boolean NOT, we need to mask to get 0 or 1
            emit(state, `    PUSH8 1`);
            emit(state, `    AND`);
            break;
        case 'NEG':
            emit(state, `    NEG`);
            break;
    }
}

/**
 * Helper to get the size suffix for load/store operations based on byte size.
 */
export function getSizeSuffix(size: MemberSize): '8' | '16' | '32' | '64' {
    switch (size) {
        case 1: return '8';
        case 2: return '16';
        case 4: return '32';
        case 8: return '64';
        default: return '32'; // Default to 32-bit if unknown size
    }
}

/**
 * Infer the data type of an expression.
 * Returns 'STRING' if the expression is a string type, otherwise returns the inferred type.
 */
function inferExpressionType(state: CodeGenState, expr: Expression): string {
    switch (expr.kind) {
        case 'StringLiteral':
            return 'STRING';
        case 'BoolLiteral':
            return 'BOOL';
        case 'IntLiteral':
            return 'INT';
        case 'RealLiteral':
            return 'REAL';
        case 'TimeLiteral':
            return 'TIME';
        case 'Identifier': {
            const sym = state.symbols.get(expr.name);
            return (sym?.dataType as string) ?? 'UNKNOWN';
        }
        case 'FunctionCall': {
            // String functions return STRING
            const stringFunctions = ['CONCAT', 'LEFT', 'RIGHT', 'MID', 'INSERT', 'DELETE', 'REPLACE', 'COPY', 'CLEAR'];
            if (stringFunctions.includes(expr.name)) {
                return 'STRING';
            }
            // Most other functions return numeric types
            return 'UNKNOWN';
        }
        case 'BinaryExpr':
            // For comparison operators, return BOOL
            if (['EQ', 'NE', 'LT', 'LE', 'GT', 'GE'].includes(expr.operator)) {
                return 'BOOL';
            }
            // For arithmetic, inherit from left operand
            return inferExpressionType(state, expr.left);
        default:
            return 'UNKNOWN';
    }
}

/**
 * Convert an expression back to its Structured Text representation (for comments).
 */
function stringifyExpression(expr: Expression): string {
    switch (expr.kind) {
        case 'Identifier':
            return expr.name;
        case 'MemberAccess':
            return `${stringifyExpression(expr.object)}.${expr.member}`;
        case 'ArrayAccess':
            const indices = expr.indices.map(stringifyExpression).join(', ');
            return `${stringifyExpression(expr.array)}[${indices}]`;
        case 'BoolLiteral':
            return expr.value.toString().toUpperCase();
        case 'IntLiteral':
            return expr.value.toString();
        case 'RealLiteral':
            return expr.value.toString();
        case 'TimeLiteral':
            return expr.rawValue;
        case 'StringLiteral':
            return `'${expr.value}'`;
        case 'BinaryExpr':
            return `(${stringifyExpression(expr.left)} ${expr.operator} ${stringifyExpression(expr.right)})`;
        case 'UnaryExpr':
            return `${expr.operator}(${stringifyExpression(expr.operand)})`;
        case 'FunctionCall':
            const args = expr.args.map(stringifyExpression).join(', ');
            return `${expr.name}(${args})`;
        default:
            return '...';
    }
}

/**
 * Check if an expression is of STRING type.
 */
function isStringExpression(state: CodeGenState, expr: Expression): boolean {
    return inferExpressionType(state, expr) === 'STRING';
}

/**
 * Check if an expression is of REAL (floating-point) type.
 * Returns true if the expression evaluates to a REAL value.
 */
function isFloatExpression(state: CodeGenState, expr: Expression): boolean {
    const exprType = inferExpressionType(state, expr);
    return exprType === 'REAL' || exprType === 'LREAL';
}

/**
 * Determine if a binary expression should use floating-point arithmetic.
 * Returns true if either operand is a float type (type promotion).
 */
function shouldUseFloatArithmetic(state: CodeGenState, left: Expression, right: Expression): boolean {
    return isFloatExpression(state, left) || isFloatExpression(state, right);
}

function emitBinaryExpr(state: CodeGenState, expr: BinaryExpr): void {
    // Check if this is a string operation
    const leftIsString = isStringExpression(state, expr.left);
    const rightIsString = isStringExpression(state, expr.right);

    if (leftIsString || rightIsString) {
        // String comparison: s1 = s2, s1 <> s2
        if (expr.operator === 'EQ' || expr.operator === 'NE') {
            emit(state, `    ; String comparison`);
            emitExpression(state, expr.left);
            emitExpression(state, expr.right);
            emit(state, `    STRCMP`);
            emit(state, `    PUSH8 0`);
            emit(state, expr.operator === 'EQ' ? `    EQ` : `    NE`);
            return;
        }

        // String concatenation: s1 + s2 is not standard IEC 61131-3
        // but we can support it by calling CONCAT
        if (expr.operator === 'ADD') {
            emit(state, `    ; String concatenation (s1 + s2)`);
            emit(state, `    ; NOTE: Use CONCAT() for proper string concatenation`);
            // For now, emit an error comment - proper concatenation needs a destination
            emit(state, `    ; ERROR: String + operator requires destination. Use CONCAT(s1, s2) instead.`);
            emitExpression(state, expr.left);
            return;
        }

        // Other operators don't make sense for strings
        emit(state, `    ; WARNING: Operator ${expr.operator} not supported for STRING type`);
    }

    // Check if we should use floating-point arithmetic
    const useFloat = shouldUseFloatArithmetic(state, expr.left, expr.right);

    // Standard numeric/boolean operations
    emitExpression(state, expr.left);
    emitExpression(state, expr.right);

    switch (expr.operator) {
        // Logical operators - always integer
        case 'AND': emit(state, `    AND`); break;
        case 'OR': emit(state, `    OR`); break;
        case 'XOR': emit(state, `    XOR`); break;

        // Arithmetic operators - use float variants when operands are REAL
        case 'ADD': emit(state, useFloat ? `    ADDF` : `    ADD`); break;
        case 'SUB': emit(state, useFloat ? `    SUBF` : `    SUB`); break;
        case 'MUL': emit(state, useFloat ? `    MULF` : `    MUL`); break;
        case 'DIV': emit(state, useFloat ? `    DIVF` : `    DIV`); break;

        // MOD doesn't have a float variant (integer only)
        case 'MOD': emit(state, `    MOD`); break;

        // Comparison operators - same opcodes work for int and float
        // (the VM compares 32-bit values on the stack bitwise)
        case 'EQ': emit(state, `    EQ`); break;
        case 'NE': emit(state, `    NE`); break;
        case 'LT': emit(state, `    LT`); break;
        case 'LE': emit(state, `    LE`); break;
        case 'GT': emit(state, `    GT`); break;
        case 'GE': emit(state, `    GE`); break;
    }
}

function emitFunctionCall(state: CodeGenState, expr: FunctionCall): void {
    // 1. Check if it's a user-defined function
    const userFn = state.functionTable.get(expr.name);
    if (userFn) {
        emit(state, `    ; CALL ${expr.name}(...)`);

        // Push arguments onto stack
        for (const arg of expr.args) {
            emitExpression(state, arg);
        }

        emit(state, `    CALL ${userFn.label}`);
        return;
    }

    // 2. Check if it's a built-in function
    const fnDef = getFn(expr.name);
    if (!fnDef) {
        emit(state, `    ; ERROR: Unknown function '${expr.name}'`);
        emit(state, `    PUSH8 0`);
        return;
    }

    emit(state, `    ; ${expr.name}(...)`);

    // Create code generation context for inline function
    const ctx: CodeGenContext = {
        baseAddress: 0, // Not used for stateless functions
        instanceName: expr.name,
        newLabel: (prefix: string) => newLabel(state, prefix),
        emit: (line: string) => emit(state, line),
        emitExpression: (e: Expression) => emitExpression(state, e),
    };

    // Let the function generate its inline code
    fnDef.generateInline(ctx, expr.args);
}

// ============================================================================
// Store Helper
// ============================================================================

// ============================================================================
// Store Helper
// ============================================================================

function emitStore(state: CodeGenState, sym: Symbol): void {
    const suffix = getLoadStoreSuffix(sym.dataType as DataTypeValue);
    emit(state, `    STORE${suffix} ${formatAddress(sym.address)}`);
}

// ============================================================================
// Array Support (v1.4.3+)
// ============================================================================

/**
 * Emit code to calculate the memory address of an array element.
 * Pushes the calculated address onto the stack.
 * 
 * For a 1D array: base + (index - lowerBound) * elementSize
 * For 2D array:  base + ((row - rowLower) * rowSize + (col - colLower)) * elementSize
 * For 3D array:  similar pattern with 3 indices
 */
function emitArrayAddress(state: CodeGenState, access: ArrayAccess, base: { address: number; dataType: STDataType }): void {
    const arrayType = base.dataType as ArrayType;
    const elementSize = getDataTypeSize(arrayType.elementType as DataTypeValue);
    const dims = arrayType.dimensions;

    // Push base address
    emit(state, `    PUSH32 ${base.address}`);

    if (dims.length === 1) {
        // 1D array: base + (index - lower) * elementSize
        emitExpression(state, access.indices[0]);
        emit(state, `    PUSH32 ${dims[0].lowerBound}`);
        emit(state, `    SUB`);
        emit(state, `    PUSH32 ${elementSize}`);
        emit(state, `    MUL`);
        emit(state, `    ADD`);
    } else if (dims.length === 2) {
        // 2D array: base + ((row - rowLower) * rowSize + (col - colLower)) * elementSize
        const rowSize = dims[1].upperBound - dims[1].lowerBound + 1;

        // Calculate row offset
        emitExpression(state, access.indices[0]);
        emit(state, `    PUSH32 ${dims[0].lowerBound}`);
        emit(state, `    SUB`);
        emit(state, `    PUSH32 ${rowSize}`);
        emit(state, `    MUL`);

        // Add column offset
        emitExpression(state, access.indices[1]);
        emit(state, `    PUSH32 ${dims[1].lowerBound}`);
        emit(state, `    SUB`);
        emit(state, `    ADD`);

        // Multiply by element size and add to base
        emit(state, `    PUSH32 ${elementSize}`);
        emit(state, `    MUL`);
        emit(state, `    ADD`);
    } else if (dims.length === 3) {
        // 3D array: base + (((dim0 - lower0) * size1 + (dim1 - lower1)) * size2 + (dim2 - lower2)) * elementSize
        const size1 = dims[1].upperBound - dims[1].lowerBound + 1;
        const size2 = dims[2].upperBound - dims[2].lowerBound + 1;

        // Calculate dim0 offset
        emitExpression(state, access.indices[0]);
        emit(state, `    PUSH32 ${dims[0].lowerBound}`);
        emit(state, `    SUB`);
        emit(state, `    PUSH32 ${size1 * size2}`);
        emit(state, `    MUL`);

        // Add dim1 offset
        emitExpression(state, access.indices[1]);
        emit(state, `    PUSH32 ${dims[1].lowerBound}`);
        emit(state, `    SUB`);
        emit(state, `    PUSH32 ${size2}`);
        emit(state, `    MUL`);
        emit(state, `    ADD`);

        // Add dim2 offset
        emitExpression(state, access.indices[2]);
        emit(state, `    PUSH32 ${dims[2].lowerBound}`);
        emit(state, `    SUB`);
        emit(state, `    ADD`);

        // Multiply by element size and add to base
        emit(state, `    PUSH32 ${elementSize}`);
        emit(state, `    MUL`);
        emit(state, `    ADD`);
    }
}

/**
 * Emit code to read an array element.
 * Pushes the element value onto the stack.
 */
function emitArrayAccess(state: CodeGenState, expr: ArrayAccess): void {
    const resolution = state.symbols.resolveMemberPath(expr.array);
    const arrayType = resolution.dataType as ArrayType;

    if (!isArrayType(arrayType)) {
        emit(state, `    ; ERROR: target is not an array`);
        emit(state, `    PUSH32 0`);
        return;
    }

    const elementSize = getDataTypeSize(arrayType.elementType as DataTypeValue);

    // Calculate address
    emitArrayAddress(state, expr, resolution);

    // Load using indirect addressing
    emit(state, `    LOADI${elementSize * 8}`);
}
/**
 * Helper to get the load/store suffix for a member (resolves through FBs and Structs).
 */
export function getMemberLoadStoreSuffix(symbols: SymbolTable, parentTypeName: string, memberName: string): string {
    // 1. Check user-defined FBs
    const userFB = symbols.getFBDefinition(parentTypeName);
    if (userFB) {
        const memberInfo = userFB.members.get(memberName);
        if (memberInfo) return getSizeSuffix(memberInfo.size as any);
    }

    // 2. Check user-defined Structs
    const userStruct = symbols.getStructDefinition(parentTypeName);
    if (userStruct) {
        const memberInfo = userStruct.members.get(memberName);
        if (memberInfo) return getSizeSuffix(memberInfo.size as any);
    }

    // 3. Check stdlib FBs
    const fbDef = getFB(parentTypeName as DataTypeValue);
    if (fbDef) {
        const member = fbDef.members.find(m => m.name === memberName);
        if (member) return getSizeSuffix(member.size);
    }

    return '32'; // Default
}
