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
    ReferenceExpr,
    DereferenceExpr,
    MethodCall,
    ThisExpr,
    MethodDecl,
    DateLiteral,
    TODLiteral,
    DTLiteral,
    WStringLiteral,
} from './ast.ts';
import { getDataTypeSize, isArrayType, VarSection } from './ast.ts';
import {
    getLoadStoreSuffix,
    buildSymbolTable,
    MemoryLayout,
    alignTo,
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
    /** Current method being inlined (for return value handling) */
    currentMethod: MethodDecl | null;
}

/**
 * Resolve a symbol name based on current context (Method, FB, Global).
 */
function resolveSymbol(state: CodeGenState, name: string): Symbol | undefined {
    // 1. Check Method Scope (Inputs, Outputs, Locals)
    if (state.currentMethod) {
        const method = state.currentMethod as any;
        
        // Helper to find var in lists
        const findVar = (list: any[]) => list && list.find((v: any) => v.name === name);

        const methodVar = findVar(method.inputs) ||
                          findVar(method.outputs) ||
                          findVar(method.locals);

        if (methodVar && methodVar.mangledName) {
            return state.symbols.get(methodVar.mangledName);
        }
    }

    // 2. Check FB Scope (Implicit THIS)
    if (state.currentFBInstance && state.currentFBInstance.members) {
        const offset = state.currentFBInstance.members.get(name);
        if (offset !== undefined) {
            const fbTypeName = state.currentFBInstance.dataType as string;
            const fbDef = state.symbols.getFBDefinition(fbTypeName);
            const memberInfo = fbDef?.members.get(name);
            
            return {
                name: name,
                dataType: memberInfo?.dataType || 'UNKNOWN',
                address: state.currentFBInstance.address + offset,
                size: memberInfo?.size || 0,
                section: VarSection.VAR,
                ioAddress: null,
                members: null
            };
        }
    }

    // 3. Check Global Scope
    return state.symbols.get(name);
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
        currentMethod: null,
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

    // Emit bootstrap jump to ensure entry point is always 0
    emit(state, `; === Bootstrap ===`);
    emit(state, `    JMP _start`);
    emit(state, ``);

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
            // Check if already collected
            if (!state.stringLiterals.some(l => l.value === expr.value)) {
                const size = STRING_HEADER_SIZE + expr.value.length + 1; // header + data + null
                const alignment = 2; // header uses STORE16
                state.stringLiteralNextAddr = alignTo(state.stringLiteralNextAddr, alignment);
                state.stringLiterals.push({
                    value: expr.value,
                    address: state.stringLiteralNextAddr,
                    size,
                });
                state.stringLiteralNextAddr += size;
            }
            break;
        case 'WStringLiteral':
            const wkey = `W:${expr.value}`;
            if (!state.stringLiterals.some(l => l.value === wkey)) {
                const size = STRING_HEADER_SIZE + expr.value.length * 2 + 2; // header + utf16 data + null word
                const alignment = 2;
                state.stringLiteralNextAddr = alignTo(state.stringLiteralNextAddr, alignment);
                state.stringLiterals.push({
                    value: wkey,
                    address: state.stringLiteralNextAddr,
                    size,
                });
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
                if ((arg as any).kind === 'NamedArgument') {
                    collectStringLiteralsInExpression(state, (arg as any).value);
                } else {
                    collectStringLiteralsInExpression(state, arg as Expression);
                }
            }
            break;
        case 'MethodCall':
            collectStringLiteralsInExpression(state, expr.object);
            for (const arg of expr.args) {
                if ((arg as any).kind === 'NamedArgument') {
                    collectStringLiteralsInExpression(state, (arg as any).value);
                } else {
                    collectStringLiteralsInExpression(state, arg as Expression);
                }
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
        let val = lit.value;
        const isWString = val.startsWith('W:');
        
        if (isWString) val = val.substring(2);
        
        const len = val.length;
        const cap = len > 0 ? len : 1;

        emit(state, `    ; _str${i} = '${val.substring(0, 20)}${len > 20 ? '...' : ''}' (${lit.size} bytes)`);

        // Header (Len, Cap)
        emit(state, `    PUSH16 ${len}`);
        emit(state, `    STORE16 ${formatAddress(lit.address)}`);
        
        emit(state, `    PUSH16 ${cap}`);
        emit(state, `    STORE16 ${formatAddress(lit.address + 2)}`);
        
        const headerSize = 4;

        if (isWString) {
            // WSTRING: 2 bytes per char
            for (let j = 0; j < len; j++) {
                const charCode = val.charCodeAt(j);
                emit(state, `    PUSH16 ${charCode}`);
                emit(state, `    STORE16 ${formatAddress(lit.address + headerSize + j * 2)}`);
            }
            // Null terminator (2 bytes)
            emit(state, `    PUSH16 0`);
            emit(state, `    STORE16 ${formatAddress(lit.address + headerSize + len * 2)}`);
        } else {
            // STRING: 1 byte per char
            for (let j = 0; j < len; j++) {
                const charCode = val.charCodeAt(j);
                emit(state, `    PUSH8 ${charCode}`);
                emit(state, `    STORE8 ${formatAddress(lit.address + headerSize + j)}`);
            }
            // Null terminator (1 byte)
            emit(state, `    PUSH8 0`);
            emit(state, `    STORE8 ${formatAddress(lit.address + headerSize + len)}`);
        }
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
        // Bug 2 fix: Standalone method call as statement uses '_' as dummy target
        // Just emit the method call expression, skip the STORE
        if (stmt.target.name === '_') {
            if (stmt.value.kind === 'MethodCall') {
                emit(state, `    ; (method call as statement, result discarded)`);
                emitExpression(state, stmt.value);
                // The method was executed, but we don't store the result
                // If method returned a value, drop it from stack
                const methodCall = stmt.value;
                if (state.functionBlockTable.has((methodCall.object as any)?.name ? 
                    (state.symbols.get((methodCall.object as any).name)?.dataType as string) || '' : '')) {
                    // Check if method has return type - if so, DROP the result
                    const objName = (methodCall.object as any)?.name;
                    if (objName) {
                        const instanceSym = state.symbols.get(objName);
                        if (instanceSym) {
                            const fbDecl = state.functionBlockTable.get(instanceSym.dataType as string);
                            const method = fbDecl?.methods.find(m => m.name === methodCall.methodName);
                            if (method?.returnType) {
                                emit(state, `    DROP       ; discard unused return value`);
                            }
                        }
                    }
                }
                return;
            }
            // Other expressions assigned to '_' - just evaluate and drop
            emitExpression(state, stmt.value);
            emit(state, `    DROP       ; discard result of expression`);
            return;
        }

        // IEC return syntax: FunctionName := value (for FUNCTION)
        if (state.currentFunction && stmt.target.name === state.currentFunction.name) {
            emit(state, `    ; RETURN ${state.currentFunction.name} := ...`);
            emitExpression(state, stmt.value);
            const sym = state.symbols.get(stmt.target.name);
            if (sym) {
                emitStore(state, sym);
            }
            return;
        }

        // IEC return syntax: MethodName := value (for METHOD - inline context)
        // Bug 1 fix: When inside an inlined method, assignment to method name 
        // should leave the value on stack (not store it)
        if (state.currentMethod && stmt.target.name === state.currentMethod.name) {
            emit(state, `    ; METHOD RETURN: ${state.currentMethod.name} := ...`);
            emitExpression(state, stmt.value);
            // Value stays on stack - caller will use it or discard it
            return;
        }

        const sym = resolveSymbol(state, stmt.target.name);
        if (!sym) return;

        emit(state, `    ; ${stmt.target.name} := ...`);
        emitExpression(state, stmt.value);
        const suffix = getLoadStoreSuffix(sym.dataType as DataTypeValue);
        emit(state, `    STORE${suffix} ${formatAddress(sym.address)}`);
    } else if (stmt.target.kind === 'MemberAccess') {
        emit(state, `    ; ${stringifyExpression(stmt.target)} := ...`);
        emitExpression(state, stmt.value);

        // Handle THIS.member assignment
        if (stmt.target.object.kind === 'ThisExpr') {
            if (!state.currentFBInstance) {
                emit(state, `    ; ERROR: THIS used outside of FB/method context`);
                return;
            }
            
            const fbTypeName = state.currentFBInstance.dataType as string;
            const fbDef = state.symbols.getFBDefinition(fbTypeName);
            
            if (!fbDef) {
                emit(state, `    ; ERROR: Unknown FB type '${fbTypeName}'`);
                return;
            }
            
            const member = fbDef.members.get(stmt.target.member);
            if (!member) {
                emit(state, `    ; ERROR: Unknown member '${stmt.target.member}' on FB '${fbTypeName}'`);
                return;
            }
            
            const memberAddr = state.currentFBInstance.address + member.offset;
            let suffix: '8' | '16' | '32' | '64' = '32';
            if (member.size === 1) suffix = '8';
            else if (member.size === 2) suffix = '16';
            else if (member.size === 8) suffix = '64';
            
            emit(state, `    STORE${suffix} ${formatAddress(memberAddr)}   ; THIS.${stmt.target.member}`);
        } else {
            const resolution = state.symbols.resolveMemberPath(stmt.target);
            const suffix = getLoadStoreSuffix(resolution.dataType as DataTypeValue);
            emit(state, `    STORE${suffix} ${formatAddress(resolution.address)}`);
        }
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
        emit(state, `    STOREI${elementSize * 8}`);
    } else if (stmt.target.kind === 'DereferenceExpr') {
        // ptr^ := value
        emit(state, `    ; *(${stringifyExpression(stmt.target.operand)}) := ...`);

        // 1. Calculate address (load pointer value)
        emitExpression(state, stmt.target.operand);
        
        // 2. Evaluate value to store
        emitExpression(state, stmt.value);
        
        // 3. Determine size
        const type = resolveType(state, stmt.target);
        const size = type ? getDataTypeSize(type) : 4;
        
        // 4. Store Indirect
        emit(state, `    STOREI${size * 8}`);
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
        case 'ReferenceExpr':
            emitReference(state, expr);
            break;
        case 'DereferenceExpr':
            emitDereference(state, expr);
            break;
        case 'MethodCall':
            emitMethodCall(state, expr);
            break;
        case 'ThisExpr':
            emitThisExpr(state, expr);
            break;
        case 'WStringLiteral':
            emitWStringLiteral(state, expr);
            break;
        case 'DateLiteral':
            emitDateLiteral(state, expr);
            break;
        case 'TODLiteral':
            emitTODLiteral(state, expr);
            break;
        case 'DTLiteral':
            emitDTLiteral(state, expr);
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
    const sym = resolveSymbol(state, expr.name);
    if (!sym) {
        emit(state, `    ; ERROR: Unknown identifier ${expr.name}`);
        emit(state, `    PUSH32 0`);
        return;
    }

    // Inline CONSTANT values (e.g. ENUMs)
    if (sym.section === 'CONSTANT' && sym.initialValue) {
        const initVal = sym.initialValue as any;
        if (initVal.kind === 'IntLiteral' || initVal.kind === 'BoolLiteral' || initVal.kind === 'RealLiteral') {
            emitExpression(state, initVal);
            return;
        }
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
    // Handle THIS.member access
    if (expr.object.kind === 'ThisExpr') {
        if (!state.currentFBInstance) {
            emit(state, `    ; ERROR: THIS used outside of FB/method context`);
            return;
        }
        
        const fbTypeName = state.currentFBInstance.dataType as string;
        const fbDef = state.symbols.getFBDefinition(fbTypeName);
        
        if (!fbDef) {
            emit(state, `    ; ERROR: Unknown FB type '${fbTypeName}'`);
            return;
        }
        
        const member = fbDef.members.get(expr.member);
        if (!member) {
            emit(state, `    ; ERROR: Unknown member '${expr.member}' on FB '${fbTypeName}'`);
            return;
        }
        
        const memberAddr = state.currentFBInstance.address + member.offset;
        let suffix: '8' | '16' | '32' | '64' = '32';
        if (member.size === 1) suffix = '8';
        else if (member.size === 2) suffix = '16';
        else if (member.size === 8) suffix = '64';
        
        emit(state, `    LOAD${suffix} ${formatAddress(memberAddr)}   ; THIS.${expr.member}`);
        return;
    }
    
    // Current implementation only supports identifier.Member
    if (expr.object.kind !== 'Identifier') {
        emit(state, `    ; ERROR: Nested or complex member access not fully supported`);
        return;
    }

    const structName = (expr.object as Identifier).name;
    const sym = state.symbols.get(structName);
    if (!sym) {
        emit(state, `    ; ERROR: Unknown struct/instance '${structName}'`);
        return;
    }

    const memberAddr = state.symbols.getMemberAddress(structName, expr.member);
    
    // FORCE CORRECT SIZE for standard members
    let suffix = '32';
    // Handle PointerType or other complex types safely
    const typeName = typeof sym.dataType === 'string' 
        ? sym.dataType.toUpperCase() 
        : (sym.dataType as any)?.baseType || '';
    const memberName = expr.member.toUpperCase().replace(/^\./, '');
    
    const fbDef = getFB(typeName);
    if (fbDef) {
        const member = fbDef.members.find(m => m.name.toUpperCase() === memberName);
        if (member) {
            if (member.size === 1) suffix = '8';
            else if (member.size === 2) suffix = '16';
            else if (member.size === 4) suffix = '32';
        }
    } else {
        // Fallback to symbol table logic
        suffix = getMemberLoadStoreSuffix(state.symbols, typeof sym.dataType === 'string' ? sym.dataType : '', expr.member);
    }
    
    emit(state, `    LOAD${suffix} ${formatAddress(memberAddr)}`);
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
            const sym = resolveSymbol(state, expr.name);
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
            const args = expr.args.map(arg => {
                if ((arg as any).kind === 'NamedArgument') {
                    return `${(arg as any).name} := ${stringifyExpression((arg as any).value)}`;
                }
                return stringifyExpression(arg as Expression);
            }).join(', ');
            return `${expr.name}(${args})`;
        case 'MethodCall':
             const mArgs = (expr as any).args.map((arg: any) => {
                if (arg.kind === 'NamedArgument') {
                    return `${arg.name} := ${stringifyExpression(arg.value)}`;
                }
                return stringifyExpression(arg);
            }).join(', ');
            return `${stringifyExpression((expr as any).object)}.${(expr as any).methodName}(${mArgs})`;
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
            if ((arg as any).kind === 'NamedArgument') {
                emitExpression(state, (arg as any).value);
            } else {
                emitExpression(state, arg as Expression);
            }
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
    // Convert args to pure expressions (ignoring names for built-ins for now)
    const simpleArgs = expr.args.map(a => 
        (a as any).kind === 'NamedArgument' ? (a as any).value : a
    ) as Expression[];

    fnDef.generateInline(ctx, simpleArgs);
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
 * Resolve the data type of an expression.
 */
function resolveType(state: CodeGenState, expr: Expression): STDataType | null {
    if (expr.kind === 'Identifier') {
        const sym = state.symbols.get(expr.name);
        return sym ? sym.dataType : null;
    } else if (expr.kind === 'ReferenceExpr') {
        const base = resolveType(state, expr.operand);
        return base ? { kind: 'PointerType', baseType: base } as any : null;
    } else if (expr.kind === 'DereferenceExpr') {
        const ptrType = resolveType(state, expr.operand);
        if (ptrType && typeof ptrType === 'object' && (ptrType as any).kind === 'PointerType') {
            return (ptrType as any).baseType;
        }
        return null;
    }
    // TODO: Support MemberAccess, ArrayAccess resolution
    return null;
}

/**
 * Emit code to calculate the address of an L-Value.
 */
function emitAddress(state: CodeGenState, expr: Expression): void {
    if (expr.kind === 'Identifier') {
        const sym = state.symbols.get(expr.name);
        if (sym) {
            emit(state, `    PUSH32 ${formatAddress(sym.address)}`);
        } else {
            emit(state, `    ; ERROR: Unknown identifier ${expr.name}`);
            emit(state, `    PUSH32 0`);
        }
    } else if (expr.kind === 'ArrayAccess') {
        const resolution = state.symbols.resolveMemberPath(expr.array);
        emitArrayAddress(state, expr, resolution);
    } else if (expr.kind === 'DereferenceExpr') {
        // Address of (ptr^) is the value of ptr
        emitExpression(state, expr.operand);
    } else if (expr.kind === 'MemberAccess') {
         if (expr.object.kind !== 'Identifier') {
            emit(state, `    ; ERROR: Complex member access address not supported`);
            emit(state, `    PUSH32 0`);
            return;
        }
        const structName = (expr.object as Identifier).name;
        const memberAddr = state.symbols.getMemberAddress(structName, expr.member);
        emit(state, `    PUSH32 ${formatAddress(memberAddr)}`);
    } else {
        emit(state, `    ; ERROR: Cannot take address of ${expr.kind}`);
        emit(state, `    PUSH32 0`);
    }
}

function emitReference(state: CodeGenState, expr: ReferenceExpr): void {
    emitAddress(state, expr.operand);
}

function emitDereference(state: CodeGenState, expr: DereferenceExpr): void {
    // 1. Load pointer value (address)
    emitExpression(state, expr.operand);

    // 2. Determine type size to load
    const type = resolveType(state, expr);
    let size = 4; // Default to 32-bit if unknown
    if (type) {
        size = getDataTypeSize(type);
    }
    
    // 3. Load indirect
    emit(state, `    LOADI${size * 8}`);
}

/**
 * Emit a method call expression.
 * 
 * For now, methods are inlined at call sites (no dynamic dispatch).
 * Format: instance.MethodName(args)
 * 
 * The method body is executed with THIS bound to the instance.
 */
function emitMethodCall(state: CodeGenState, expr: MethodCall): void {
    emit(state, `    ; Method call: ${stringifyExpression(expr.object)}.${expr.methodName}()`);
    
    // Get the object (FB instance)
    if (expr.object.kind !== 'Identifier' && expr.object.kind !== 'ThisExpr') {
        emit(state, `    ; ERROR: Complex method call targets not supported yet`);
        return;
    }
    
    let instanceName: string;
    let fbTypeName: string;
    let instanceSym: Symbol | undefined;
    
    if (expr.object.kind === 'ThisExpr') {
        // Method called on THIS - we're inside an FB context
        if (!state.currentFBInstance) {
            emit(state, `    ; ERROR: THIS used outside of FB context`);
            return;
        }
        instanceName = state.currentFBInstance.name;
        fbTypeName = state.currentFBInstance.dataType as string;
        instanceSym = state.currentFBInstance;
    } else {
        instanceName = (expr.object as Identifier).name;
        instanceSym = state.symbols.get(instanceName);
        if (!instanceSym) {
            emit(state, `    ; ERROR: Unknown instance '${instanceName}'`);
            return;
        }
        fbTypeName = instanceSym.dataType as string;
    }
    
    // Get the FB definition from SymbolTable (which handles inheritance)
    const fbDef = state.symbols.getFBDefinition(fbTypeName);
    if (!fbDef) {
        emit(state, `    ; ERROR: Unknown FB type '${fbTypeName}'`);
        return;
    }
    
    // Find the method (includes inherited ones)
    const methodInfo = fbDef.methods.get(expr.methodName);
    if (!methodInfo) {
        emit(state, `    ; ERROR: Unknown method '${expr.methodName}' on FB '${fbTypeName}'`);
        return;
    }
    
    // Save current FB context and set up new one for method execution
    const prevFBInstance = state.currentFBInstance;
    const prevMethod = state.currentMethod;
    state.currentFBInstance = instanceSym;
    // Cast MethodInfo to MethodDecl for compatibility (they share name/body which is what matters)
    state.currentMethod = methodInfo as any;
    
    emit(state, `    ; --- Begin Method ${fbTypeName}.${expr.methodName} ---`);
    
    // Handle method inputs from args (Positional and Named)
    if (expr.args && expr.args.length > 0) {
        let positionalIndex = 0;
        
        for (const arg of expr.args) {
            let inputName: string;
            let argExpr: Expression;
            let input: any;

            // Check if arg is NamedArgument or Expression
            // We cast to any to access kind safely
            if ((arg as any).kind === 'NamedArgument') {
                inputName = (arg as any).name;
                argExpr = (arg as any).value;
                input = methodInfo.inputs.find((i: any) => i.name === inputName);
                
                if (!input) {
                    emit(state, `    ; ERROR: Unknown named argument '${inputName}' for method '${expr.methodName}'`);
                    emitExpression(state, argExpr);
                    emit(state, `    DROP`);
                    continue;
                }
            } else {
                // Positional
                if (positionalIndex >= methodInfo.inputs.length) {
                    emit(state, `    ; WARNING: Too many positional arguments`);
                    emitExpression(state, arg as Expression);
                    emit(state, `    DROP`);
                    continue;
                }
                input = methodInfo.inputs[positionalIndex];
                argExpr = arg as Expression;
                inputName = input.name;
                positionalIndex++;
            }
            
            emit(state, `    ; Arg ${inputName} := ...`);
            emitExpression(state, argExpr);
            
            if (input.mangledName) {
                const sym = state.symbols.get(input.mangledName);
                if (sym) {
                    const suffix = getLoadStoreSuffix(sym.dataType as DataTypeValue);
                    emit(state, `    STORE${suffix} ${formatAddress(sym.address)}`);
                } else {
                     emit(state, `    ; ERROR: Symbol for input '${inputName}' not found`);
                     emit(state, `    DROP`); // Clean stack
                }
            } else {
                emit(state, `    ; ERROR: Input '${inputName}' has no allocated memory`);
                emit(state, `    DROP`); // Clean stack
            }
        }
    }
    
    // Initialize method locals (including VAR_TEMP)
    if (methodInfo.locals) {
        for (const local of methodInfo.locals as any[]) {
            if (local.mangledName) {
                const sym = state.symbols.get(local.mangledName);
                if (sym) {
                    if (local.initialValue) {
                        emit(state, `    ; Init ${local.name} := ...`);
                        emitExpression(state, local.initialValue);
                    } else {
                        emit(state, `    ; Init ${local.name} := 0`);
                        const size = sym.size;
                        if (size === 8) emit(state, `    PUSH64 0`);
                        else emit(state, `    PUSH32 0`);
                    }
                    const suffix = getLoadStoreSuffix(sym.dataType as DataTypeValue);
                    emit(state, `    STORE${suffix} ${formatAddress(sym.address)}`);
                }
            }
        }
    }

    // Inline the method body
    for (const stmt of methodInfo.body) {
        emitStatement(state, stmt);
    }
    
    // If method has a return type, the result should be on the stack
    // (IEC convention: MethodName := value; leaves value as result)
    
    emit(state, `    ; --- End Method ${fbTypeName}.${expr.methodName} ---`);
    
    // Restore previous FB context
    state.currentFBInstance = prevFBInstance;
    state.currentMethod = prevMethod;
}

/**
 * Emit THIS expression.
 * 
 * THIS refers to the current FB instance's base address.
 * Used within methods to access the FB's own members.
 */
function emitThisExpr(state: CodeGenState, _expr: ThisExpr): void {
    if (!state.currentFBInstance) {
        emit(state, `    ; ERROR: THIS used outside of FB/method context`);
        emit(state, `    PUSH32 0`);
        return;
    }
    
    // Push the base address of the current FB instance
    emit(state, `    PUSH32 ${formatAddress(state.currentFBInstance.address)}   ; THIS`);
}

function emitDateLiteral(state: CodeGenState, expr: DateLiteral): void {
    const dateStr = expr.value;
    const timestamp = Date.parse(dateStr);
    if (isNaN(timestamp)) {
        emit(state, `    ; ERROR: Invalid DATE literal '${expr.value}'`);
        emit(state, `    PUSH32 0`);
        return;
    }
    emit(state, `    PUSH32 ${Math.floor(timestamp / 1000)}`);
}

function emitTODLiteral(state: CodeGenState, expr: TODLiteral): void {
    const timestamp = Date.parse(`1970-01-01T${expr.value}Z`);
    if (isNaN(timestamp)) {
        emit(state, `    ; ERROR: Invalid TOD literal '${expr.value}'`);
        emit(state, `    PUSH32 0`);
        return;
    }
    emit(state, `    PUSH32 ${timestamp}`);
}

function emitDTLiteral(state: CodeGenState, expr: DTLiteral): void {
    const normalized = expr.value.replace(/-(\d{2}:)/, 'T$1');
    const timestamp = Date.parse(normalized);
    if (isNaN(timestamp)) {
        emit(state, `    ; ERROR: Invalid DT literal '${expr.value}'`);
        emit(state, `    PUSH32 0`);
        emit(state, `    PUSH32 0`);
        return;
    }
    
    const bigVal = BigInt(timestamp);
    const low = Number(bigVal & 0xFFFFFFFFn) | 0;
    const high = Number((bigVal >> 32n) & 0xFFFFFFFFn) | 0;
    
    emit(state, `    PUSH32 ${low}`);
    emit(state, `    PUSH32 ${high}`);
}

function emitWStringLiteral(state: CodeGenState, expr: WStringLiteral): void {
    const wkey = `W:${expr.value}`;
    const addr = findStringLiteralAddress(state, wkey);
    if (addr !== undefined) {
        emit(state, `    PUSH32 ${formatAddress(addr)}   ; WSTRING '${expr.value}'`);
    } else {
        emit(state, `    ; ERROR: WString literal not found in pool: '${expr.value}'`);
        emit(state, `    PUSH32 0`);
    }
}

/**
 * Helper to get the load/store suffix for a member (resolves through FBs and Structs).
 * Re-exporting from symbol-table to maintain backward compatibility in this file.
 */
import { getMemberLoadStoreSuffix } from './symbol-table.ts';
