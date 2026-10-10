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
    BitAccess,
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
import { CodegenError, codegenErrorFrom, orderedUniqueErrors } from './diagnostics.ts';
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
import {
    ADD64_LABEL,
    CMP64S_LABEL,
    CMP64U_LABEL,
    FCMP_LABEL,
    HELPERS,
    LITERAL_INT,
    SUB64_LABEL,
    UDIV32_LABEL,
    UNKNOWN_TYPE,
    UNSIGNED_TO_REAL,
    cmp64Test,
    commonType,
    fcmpTest,
    floatBits,
    isFloatType,
    isIntegerLike,
    isUnsigned32,
    isWide,
    numericInfo,
    numericTypeName,
    type CompareOp,
    type HelperName,
} from './numeric.ts';
import { POWF_HELPER, POWF_LABEL } from './power.ts';

// ============================================================================
// Memory Layout Constants
// ============================================================================

/**
 * Size of work memory region allocated per program in multi-task mode.
 * Each program gets this many bytes of isolated work memory.
 * Must be a power of 2 for efficient alignment.
 */
export const WORK_MEMORY_REGION_SIZE = 256;

export interface CompilerMemoryProfile {
    workSize: number;
    retainSize: number;
    codeSizeMax: number;
}

export const DEFAULT_COMPILER_MEMORY_PROFILE: CompilerMemoryProfile = {
    workSize: MEMORY_REGION.WORK.size,
    retainSize: MEMORY_REGION.RETAIN.size,
    codeSizeMax: MEMORY_REGION.CODE.size,
};

const VM_WORK_SIZE_MAX = MEMORY_REGION.WORK.size;
const VM_RETAIN_SIZE_MAX = MEMORY_REGION.RETAIN.size;
const VM_CODE_SIZE_MAX = MEMORY_REGION.CODE.size;

/** Validate public target capacities before any address arithmetic. */
export function validateCompilerMemoryProfile(profile: CompilerMemoryProfile): CompilerMemoryProfile {
    const capacities: Array<[number, number]> = [
        [profile.workSize, VM_WORK_SIZE_MAX],
        [profile.retainSize, VM_RETAIN_SIZE_MAX],
        [profile.codeSizeMax, VM_CODE_SIZE_MAX],
    ];
    if (capacities.some(([value, maximum]) => !Number.isSafeInteger(value) || value <= 0 || value > maximum)) {
        throw new TagAdmissionError('Invalid target memory profile', 0, 0);
    }
    return profile;
}

// ============================================================================
// Code Generator Configuration
// ============================================================================

/**
 * Configuration options for code generation.
 */
export interface CodeGenOptions {
    /** Effective target memory limits; omitted preserves the host defaults. */
    memoryProfile?: CompilerMemoryProfile;
    /** Internal multi-task bucket size; defaults to the target WORK capacity. */
    workMemorySize?: number;
    /**
     * Base address for work memory allocation.
     * Default: 0x2000 (standard ZPLC work memory base)
     */
    workMemoryBase?: number;

    /**
     * Address of the initialization flag.
     * If not specified, calculated as workMemoryBase + workMemorySize - 1.
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
    /** Where RETURN jumps: the end of the function, inlined function block or inlined method; null in a program */
    returnLabel: string | null;
    memoryProfile: CompilerMemoryProfile;
    workMemorySize: number;
    /** The helper routines the program calls; they are appended after the main cycle. */
    helpers: Set<HelperName | 'powf'>;
    /** The errors of statements that could not be generated, in the order found (CMP-007). */
    errors: CodegenError[];
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

    // 2. Check FB Scope (Implicit THIS), then the global scope
    return fbScopeSymbol(state, name) ?? state.symbols.get(name);
}

/**
 * A member of the function block instance being inlined, as a symbol: a variable, or an instance declared
 * inside the function block, which has members of its own (CMP-038). undefined outside a function block.
 */
function fbScopeSymbol(state: CodeGenState, name: string): Symbol | undefined {
    const instance = state.currentFBInstance;
    if (!instance || !instance.members) return undefined;
    const offset = instance.members.get(name);
    if (offset === undefined) return undefined;
    const fbDef = state.symbols.getFBDefinition(instance.dataType as string);
    const memberInfo = fbDef?.members.get(name);
    return {
        name: name,
        dataType: memberInfo?.dataType || 'UNKNOWN',
        address: instance.address + offset,
        size: memberInfo?.size || 0,
        section: VarSection.VAR,
        ioAddress: null,
        members: memberOffsets(state, memberInfo?.dataType),
        initialValue: null,
        tags: {}
    };
}

/** The offsets of the members of a function block or structure type (user-defined or library), or null for any other type. */
function memberOffsets(state: CodeGenState, typeName: unknown): Map<string, number> | null {
    if (typeof typeName !== 'string') return null;
    const user = state.symbols.getFBDefinition(typeName) ?? state.symbols.getStructDefinition(typeName);
    if (user) return new Map([...user.members].map(([member, info]) => [member, info.offset]));
    const library = getFB(typeName as DataTypeValue);
    return library ? new Map(library.members.map((member) => [member.name, member.offset])) : null;
}

/**
 * Generate ZPLC assembly from a parsed unit (CompilationUnit or Program).
 *
 * @param unit - Parsed AST unit
 * @param options - Optional code generation configuration
 * @returns Assembly source code
 */
export function generate(unit: CompilationUnit | Program, options?: CodeGenOptions): string {
    // Statements that cannot be generated are recorded and generation goes on, so one build reports every
    // independent error (CMP-007); the first is thrown with all of them in `errors`.
    const found: CodegenError[] = [];
    let assembly: string | undefined;
    try {
        assembly = generateUnit(unit, options, found);
    } catch (caught) {
        const where = unit.kind === 'CompilationUnit' ? (unit.programs[0] ?? unit) : unit;
        const error = codegenErrorFrom(caught, where);
        if (error === null) throw caught;
        found.push(...error.errors);
    }
    if (found.length === 0) return assembly!;
    const errors = orderedUniqueErrors(found);
    const first = errors[0]!;
    first.errors = errors;
    throw first;
}

function generateUnit(unit: CompilationUnit | Program, options: CodeGenOptions | undefined, errors: CodegenError[]): string {
    const workMemoryBase = options?.workMemoryBase ?? MemoryLayout.WORK_BASE;
    const memoryProfile = validateCompilerMemoryProfile(options?.memoryProfile ?? DEFAULT_COMPILER_MEMORY_PROFILE);
    const workMemorySize = options?.workMemorySize
        ?? (options?.workMemoryBase !== undefined ? WORK_MEMORY_REGION_SIZE : memoryProfile.workSize);
    const initFlagAddr = options?.initFlagAddress ??
        workMemoryBase + workMemorySize - 1;

    validateWorkRegionOptions(workMemoryBase, workMemorySize, initFlagAddr, memoryProfile);

    const symbols = buildSymbolTable(unit, workMemoryBase);
    validateWorkSymbols(symbols, workMemoryBase, workMemorySize, initFlagAddr, memoryProfile.retainSize);

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
        returnLabel: null,
        memoryProfile,
        workMemorySize,
        helpers: new Set(),
        errors,
    };
    // inside an inlined function block, its members (and the instances declared in it) are in scope
    symbols.scopeResolver = (name) => fbScopeSymbol(state, name);

    const isUnit = unit.kind === 'CompilationUnit';
    const mainProgram = isUnit ? (unit as CompilationUnit).programs[0] : (unit as Program);

    if (!mainProgram) {
        throw new CodegenError('No program found', 1, 1);
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

    validateStringLiteralPool(state, workMemoryBase, workMemorySize);

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

    // Routines the program called, reachable only through CALL
    for (const helper of [...HELPERS, { name: 'powf' as const, title: 'REAL exponentiation (**)', lines: POWF_HELPER }]) {
        if (!state.helpers.has(helper.name)) continue;
        emit(state, ``);
        emit(state, `; --- Helper: ${helper.title} ---`);
        state.output.push(...helper.lines);
    }

    return state.output.join('\n');
}

// ============================================================================
// Helpers
// ============================================================================

function emit(state: CodeGenState, line: string): void {
    state.output.push(line);
}

/** The one error path of the generator: stop the build at `at`. */
function fail(at: { line: number; column: number; endLine?: number; endColumn?: number }, message: string): never {
    throw new CodegenError(message, at.line, at.column, at.endLine, at.endColumn);
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

    emitVariableTags(state);

    emit(state, ``);
}

/**
 * Map tag names to numeric IDs from zplc_isa.h
 */
export const TAG_MAP: Record<string, number> = {
    'publish': TAG_ID.PUBLISH,
    'modbus': TAG_ID.MODBUS,
    'subscribe': TAG_ID.SUBSCRIBE,
};

/**
 * A construct the generator cannot translate (undeclared name, unknown function, wrong arity...): see
 * diagnostics.ts. The build fails with this message and position and produces no artifact; code generation
 * never writes a placeholder into the output in place of an error. Each statement is generated on its own, so
 * one generation reports the error of every statement that has one (CMP-007).
 * ponytail: an error inside a declaration or an expression stops that statement only; a declaration error
 * (a duplicate, an unknown type) stops the generation before any statement is read.
 */
export { CodegenError };

export class TagAdmissionError extends CodegenError {
    constructor(message: string, line: number, column: number) {
        super(message, line, column);
        this.name = 'TagAdmissionError';
    }
}

function rangesOverlap(firstAddress: number, firstSize: number, secondAddress: number, secondSize: number): boolean {
    return firstAddress < secondAddress + secondSize && secondAddress < firstAddress + firstSize;
}

function validateWorkRegionOptions(
    workMemoryBase: number,
    workMemorySize: number,
    initFlagAddr: number,
    profile: CompilerMemoryProfile,
): void {
    if (!Number.isSafeInteger(workMemoryBase) || !Number.isSafeInteger(workMemorySize) || workMemorySize <= 0) {
        throw new TagAdmissionError('Invalid WORK region options', 0, 0);
    }

    const workEnd = workMemoryBase + workMemorySize;
    const profileEnd = MemoryLayout.WORK_BASE + profile.workSize;
    if (!Number.isSafeInteger(workEnd)
        || workMemoryBase < MemoryLayout.WORK_BASE
        || workEnd > profileEnd) {
        throw new TagAdmissionError('WORK allocation exceeds the target memory profile', 0, 0);
    }

    if (!Number.isSafeInteger(initFlagAddr)
        || initFlagAddr < workMemoryBase
        || initFlagAddr >= workEnd) {
        throw new TagAdmissionError('Invalid initFlagAddress for the WORK region', 0, 0);
    }
}

/** Names the budget that was exceeded: each program owns WORK_MEMORY_REGION_SIZE bytes, init flag included. */
function workBudgetMessage(workMemorySize: number): string {
    return `WORK allocation exceeds the target memory profile (limit: ${workMemorySize} bytes of WORK memory per program, including the initialization flag)`;
}

function validateWorkSymbols(symbols: SymbolTable, workMemoryBase: number, workMemorySize: number, initFlagAddr: number, retainSize: number = MEMORY_REGION.RETAIN.size): void {
    const workEnd = workMemoryBase + workMemorySize;
    const automaticWorkSymbols: Symbol[] = [];
    const directlyLocatedWorkSymbols: Symbol[] = [];
    for (const symbol of symbols.all()) {
        const symbolEnd = symbol.address + symbol.size;
        if (!Number.isSafeInteger(symbol.address)
            || !Number.isSafeInteger(symbol.size)
            || symbol.size < 0
            || !Number.isSafeInteger(symbolEnd)) {
            throw new TagAdmissionError('Invalid memory symbol allocation', symbol.declarationLine ?? 0, 0);
        }

        if (symbol.ioAddress) {
            if (!Number.isSafeInteger(symbol.ioAddress.bitOffset) || symbol.ioAddress.bitOffset < 0 || symbol.ioAddress.bitOffset > 7) {
                throw new TagAdmissionError('Invalid located bit address', symbol.declarationLine ?? 0, 0);
            }
            if (symbol.ioAddress.size === 'X' && symbol.dataType !== 'BOOL') {
                throw new TagAdmissionError('Bit-addressed locations require BOOL values', symbol.declarationLine ?? 0, 0);
            }

            const [regionBase, regionEnd, regionName] = symbol.ioAddress.type === 'I'
                ? [MemoryLayout.IPI_BASE, MemoryLayout.OPI_BASE, 'IPI']
                : symbol.ioAddress.type === 'Q'
                    ? [MemoryLayout.OPI_BASE, MemoryLayout.WORK_BASE, 'OPI']
                    : [workMemoryBase, workEnd, 'WORK'];
            if (symbol.address < regionBase || symbolEnd > regionEnd) {
                throw new TagAdmissionError(`${regionName} allocation exceeds its memory region`, symbol.declarationLine ?? 0, 0);
            }
        } else if (symbol.retain) {
            // VAR RETAIN lives in the retentive region, which has its own budget (CMP-029)
            if (symbol.address < MemoryLayout.RETAIN_BASE || symbolEnd > MemoryLayout.RETAIN_BASE + retainSize) {
                throw new TagAdmissionError(`RETAIN allocation exceeds the target memory profile (limit: ${retainSize} bytes of retentive memory)`, symbol.declarationLine ?? 0, 0);
            }
            continue;
        } else if (symbol.address < workMemoryBase || symbolEnd > workEnd) {
            throw new TagAdmissionError(workBudgetMessage(workMemorySize), symbol.declarationLine ?? 0, 0);
        }

        if ((!symbol.ioAddress || symbol.ioAddress.type === 'M')
            && rangesOverlap(symbol.address, symbol.size, initFlagAddr, 1)) {
            throw new TagAdmissionError('WORK symbol collides with the initialization flag', symbol.declarationLine ?? 0, 0);
        }

        if (symbol.ioAddress === null) automaticWorkSymbols.push(symbol);
        if (symbol.ioAddress?.type === 'M') directlyLocatedWorkSymbols.push(symbol);
    }

    for (const automaticSymbol of automaticWorkSymbols) {
        for (const locatedSymbol of directlyLocatedWorkSymbols) {
            if (rangesOverlap(automaticSymbol.address, automaticSymbol.size, locatedSymbol.address, locatedSymbol.size)) {
                throw new TagAdmissionError('automatic WORK symbol collides with located %M symbol', locatedSymbol.declarationLine ?? 0, 0);
            }
        }
    }
}

function validateStringLiteralPool(state: CodeGenState, workMemoryBase: number, workMemorySize: number): void {
    const workEnd = workMemoryBase + workMemorySize;
    const directlyLocatedSymbols = state.symbols.all().filter(symbol => symbol.ioAddress?.type === 'M');
    for (const literal of state.stringLiterals) {
        const literalEnd = literal.address + literal.size;
        if (!Number.isSafeInteger(literalEnd)
            || literal.address < workMemoryBase
            || literalEnd > workEnd) {
            throw new TagAdmissionError(workBudgetMessage(workMemorySize), 0, 0);
        }
        if (rangesOverlap(literal.address, literal.size, state.initFlagAddr, 1)) {
            throw new TagAdmissionError('WORK allocation collides with the initialization flag', 0, 0);
        }
        for (const symbol of directlyLocatedSymbols) {
            if (rangesOverlap(literal.address, literal.size, symbol.address, symbol.size)) {
                throw new TagAdmissionError('string literal pool collides with WORK symbol', symbol.declarationLine ?? 0, 0);
            }
        }
    }
}

/**
 * Map DataType string to numeric ID from zplc_isa.h
 */
export function getDataTypeId(type: any): number {
    const typeStr = typeof type === 'string' ? type.toUpperCase() : 'UNKNOWN';
    return Object.hasOwn(DATA_TYPE_ID, typeStr) ? DATA_TYPE_ID[typeStr as keyof typeof DATA_TYPE_ID] : 0x00;
}

function tagTypeWidth(tagId: number, typeId: number): number {
    if (tagId === TAG_MAP.publish || tagId === TAG_MAP.subscribe) {
        if (typeId === DATA_TYPE_ID.BOOL) return 1;
        if (typeId === DATA_TYPE_ID.INT || typeId === DATA_TYPE_ID.UINT || typeId === DATA_TYPE_ID.WORD) return 2;
        if (typeId === DATA_TYPE_ID.REAL) return 4;
        return 0;
    }
    if (tagId === TAG_MAP.modbus) {
        if (typeId === DATA_TYPE_ID.BOOL || typeId === DATA_TYPE_ID.SINT || typeId === DATA_TYPE_ID.USINT || typeId === DATA_TYPE_ID.BYTE) return 1;
        if (typeId === DATA_TYPE_ID.INT || typeId === DATA_TYPE_ID.UINT || typeId === DATA_TYPE_ID.WORD) return 2;
        if (typeId === DATA_TYPE_ID.DINT || typeId === DATA_TYPE_ID.UDINT || typeId === DATA_TYPE_ID.REAL || typeId === DATA_TYPE_ID.DWORD) return 4;
    }
    return 0;
}

function tagMemoryRegion(address: number, width: number, profile: CompilerMemoryProfile): 'IPI' | 'OPI' | 'WORK' | 'RETAIN' | undefined {
    const end = address + width;
    const { IPI, OPI, WORK, RETAIN } = MEMORY_REGION;
    if (address >= IPI.base && end <= IPI.base + IPI.size) return 'IPI';
    if (address >= OPI.base && end <= OPI.base + OPI.size) return 'OPI';
    if (address >= WORK.base && end <= WORK.base + profile.workSize) return 'WORK';
    if (address >= RETAIN.base && end <= RETAIN.base + profile.retainSize) return 'RETAIN';
    return undefined;
}

function tagAdmissionError(sym: Symbol, message: string): TagAdmissionError {
    return new TagAdmissionError(message, sym.declarationLine ?? 0, 0);
}

function validateVariableTag(sym: Symbol, tagIdName: string, tagId: number,
                             tagValue: string | true, profile: CompilerMemoryProfile): number {
    const typeId = getDataTypeId(sym.dataType);
    const width = tagTypeWidth(tagId, typeId);
    const region = tagMemoryRegion(sym.address, width, profile);
    const tagName = tagIdName.toUpperCase();

    if (width === 0) {
        throw tagAdmissionError(sym, `${tagName} tag on '${sym.name}' does not support ${String(sym.dataType)}`);
    }
    if ((sym.address & 0xF000) === 0x3000) {
        throw tagAdmissionError(sym, `${tagName} tag on '${sym.name}' cannot use the unsupported 0x3000 WORK alias`);
    }
    if (!region) {
        throw tagAdmissionError(sym, `${tagName} tag on '${sym.name}' exceeds a valid VM memory region`);
    }
    if (tagId !== TAG_MAP.publish && region !== 'WORK' && region !== 'RETAIN') {
        throw tagAdmissionError(sym, `${tagName} tag on '${sym.name}' cannot write ${region}`);
    }
    if (tagId !== TAG_MAP.modbus) {
        return typeof tagValue === 'string' ? parseInt(tagValue, 10) : 0;
    }

    const modbusAddress = tagValue === true ? 0 : Number(tagValue);
    if (!Number.isInteger(modbusAddress) || modbusAddress < 0 || modbusAddress > 0xFFFF) {
        throw tagAdmissionError(sym, `MODBUS address for '${sym.name}' must be an unsigned 16-bit integer`);
    }
    return modbusAddress;
}

/**
 * Emit .TAG directives for variables with attributes.
 */
function emitVariableTags(state: CodeGenState): void {
    const symbolsWithTags = state.symbols.all().filter(s => s.tags && Object.keys(s.tags).length > 0);
    
    if (symbolsWithTags.length === 0) return;

    emit(state, ``);
    emit(state, `; --- Variable Tags ---`);
    
    for (const sym of symbolsWithTags) {
        if (!sym.tags) continue;
        
        for (const [tagIdName, tagValue] of Object.entries(sym.tags)) {
            const tagId = TAG_MAP[tagIdName.toLowerCase()];
            if (tagId === undefined) continue;
            
            const typeId = getDataTypeId(sym.dataType);
            const val = validateVariableTag(sym, tagIdName, tagId, tagValue, state.memoryProfile);
            
            emit(state, `.TAG ${formatAddress(sym.address)} ${typeId} ${tagId} ${val}  ; ${sym.name} {${tagIdName}${tagValue === true ? '' : ':' + tagValue}}`);
        }
    }
}

// ============================================================================
// String Literal Collection and Allocation
// ============================================================================

/**
 * STRING memory layout constants.
 * Matches zplc_isa.h definitions.
 */
const STRING_HEADER_SIZE = STRING_LAYOUT.headerSize;  // 2 bytes length + 2 bytes capacity
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
                // a retained variable is initialised below, only when the retentive region holds no saved state
                if (sym.retain) continue;

                emit(state, `    ; ${decl.name} := ...`);
                emitValueFor(state, decl.initialValue as Expression, sym.dataType);
                emitStore(state, sym);
            }
        }
    }

    emitRetainedInitialization(state, program);
}

/**
 * The initial values of the VAR RETAIN variables of a program (CMP-029): applied when the first byte of the retentive
 * region is zero, then that byte is set. The runtime saves the region with the byte, and restores both together
 * (RT-025), so a restored region keeps its values and a region that was never saved, or whose layout changed,
 * which the runtime clears, gets the declared ones.
 */
function emitRetainedInitialization(state: CodeGenState, program: Program): void {
    const retained: VarDecl[] = [];
    for (const block of program.varBlocks) {
        for (const decl of block.variables) {
            if (decl.initialValue && state.symbols.get(decl.name)?.retain) retained.push(decl);
        }
    }
    if (retained.length === 0) return;

    const marker = formatAddress(MemoryLayout.RETAIN_BASE);
    const restored = newLabel(state, 'retain_restored');
    emit(state, ``);
    emit(state, `    ; --- RETAIN Initialization (skipped when the retentive region holds a saved state) ---`);
    emit(state, `    LOAD8 ${marker}`);
    emit(state, `    JNZ ${restored}`);
    for (const decl of retained) {
        const sym = state.symbols.get(decl.name)!;
        emit(state, `    ; ${decl.name} := ...`);
        emitValueFor(state, decl.initialValue as Expression, sym.dataType);
        emitStore(state, sym);
    }
    emit(state, `    PUSH8 1`);
    emit(state, `    STORE8 ${marker}`);
    emit(state, `${restored}:`);
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
    state.returnLabel = newLabel(state, 'func_return');

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

    // RETURN lands here; load return value (stored in the variable named func.name) onto stack
    emit(state, `${state.returnLabel}:`);
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
    state.returnLabel = null;
}

// ============================================================================
// Statement Visitors
// ============================================================================

/**
 * Generate one statement. An error in it is recorded with the position of the statement (or the narrower
 * one it carries) and generation goes on with the next statement, so that one build reports every
 * independent error (CMP-007). The generator state the failed statement left behind is put back.
 */
function emitStatement(state: CodeGenState, stmt: Statement): void {
    const loops = state.loopStack.length;
    const { currentFBInstance, currentMethod, currentFunction, returnLabel } = state;
    try {
        emitStatementNode(state, stmt);
    } catch (caught) {
        const error = codegenErrorFrom(caught, stmt);
        if (error === null) throw caught;
        state.loopStack.length = loops;
        state.currentFBInstance = currentFBInstance;
        state.currentMethod = currentMethod;
        state.currentFunction = currentFunction;
        state.returnLabel = returnLabel;
        state.errors.push(...error.errors);
    }
}

function emitStatementNode(state: CodeGenState, stmt: Statement): void {
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
            emitExitStatement(state, stmt);
            break;
        case 'ContinueStatement':
            emitContinueStatement(state, stmt);
            break;
        case 'ReturnStatement':
            emitReturnStatement(state);
            break;
        case 'FBCallStatement':
            emitFBCallStatement(state, stmt);
            break;
        default:
            fail(stmt as Statement, `Unknown statement type ${(stmt as Statement).kind}`);
    }
}

function emitAssignment(state: CodeGenState, stmt: Assignment): void {
    emit(state, ``);

    if (stmt.target.kind === 'BitAccess') {
        emitBitAssignment(state, stmt, stmt.target);
        return;
    }

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
            const sym = state.symbols.get(stmt.target.name);
            emitValueFor(state, stmt.value, sym?.dataType);
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
            emitValueFor(state, stmt.value, (state.currentMethod as any).returnType);
            // Value stays on stack - caller will use it or discard it
            return;
        }

        const sym = resolveSymbol(state, stmt.target.name);
        if (!sym) fail(stmt.target, `Unknown identifier '${stmt.target.name}'`);

        emit(state, `    ; ${stmt.target.name} := ...`);
        emitValueFor(state, stmt.value, sym.dataType);
        emitStore(state, sym);
    } else if (stmt.target.kind === 'MemberAccess') {
        emit(state, `    ; ${stringifyExpression(stmt.target)} := ...`);
        emitValueFor(state, stmt.value, memberAccessType(state, stmt.target));

        // Handle THIS.member assignment
        if (stmt.target.object.kind === 'ThisExpr') {
            if (!state.currentFBInstance) {
                fail(stmt.target, `THIS used outside of FB/method context`);
            }
            
            const fbTypeName = state.currentFBInstance.dataType as string;
            const fbDef = state.symbols.getFBDefinition(fbTypeName);
            
            if (!fbDef) {
                fail(stmt.target, `Unknown FB type '${fbTypeName}'`);
            }
            
            const member = fbDef.members.get(stmt.target.member);
            if (!member) {
                fail(stmt.target, `Unknown member '${stmt.target.member}' on FB '${fbTypeName}'`);
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
            fail(stmt.target, `target is not an array`);
        }

        emit(state, `    ; ${stringifyExpression(stmt.target)} := ...`);

        // Calculate the address: base + offset
        emitArrayAddress(state, stmt.target, resolution);

        // Evaluate the value to store
        emitValueFor(state, stmt.value, arrayType.elementType);

        // Store using indirect addressing
        const elementSize = getDataTypeSize(arrayType.elementType as DataTypeValue);
        emit(state, `    STOREI${elementSize * 8}`);
    } else if (stmt.target.kind === 'DereferenceExpr') {
        // ptr^ := value
        emit(state, `    ; *(${stringifyExpression(stmt.target.operand)}) := ...`);

        // 1. Calculate address (load pointer value)
        emitExpression(state, stmt.target.operand);
        
        // 2. Evaluate value to store
        emitValueFor(state, stmt.value, resolveType(state, stmt.target));
        
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
 *       GT                      ; LT when the step is negative
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

    // Get counter variable symbol (a local of the function, function block or method, or a global)
    const counterSym = resolveSymbol(state, stmt.counter);
    if (!counterSym) {
        fail(stmt, `Unknown loop counter variable '${stmt.counter}'`);
    }

    const counterAddr = formatAddress(counterSym.address);
    const suffix = getLoadStoreSuffix(counterSym.dataType as DataTypeValue);
    const counterType = numericTypeName(counterSym.dataType);
    if (isWide(counterType)) {
        fail(stmt, `A FOR counter of 64 bits is not supported yet (CMP-015)`);
    }
    const counterExtend = signExtension(counterType);
    /** Load the counter in its canonical 32-bit form. */
    const loadCounter = (): void => {
        emit(state, `    LOAD${suffix} ${counterAddr}`);
        if (counterExtend) emit(state, counterExtend);
    };

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

    // Loop condition check: past the end is counter > end going up, counter < end going down
    // (an unsigned counter or end compares unsigned)
    const loopType = commonType(counterType, staticType(state, stmt.end));
    emit(state, `${loopLabel}:`);
    const direction = stepDirection(stmt.step);
    if (direction === 'runtime') {
        // The step is not a constant: test its sign on every pass.
        const downLabel = newLabel(state, 'for_down');
        const testLabel = newLabel(state, 'for_test');
        emit(state, `    ; check: step < 0 ? counter < end : counter > end`);
        emitExpression(state, stmt.step!);
        emit(state, `    PUSH8 0`);
        emit(state, `    LT`);
        emit(state, `    JNZ ${downLabel}`);
        loadCounter();
        emitExpression(state, stmt.end);
        emitCompare(state, 'GT', loopType);
        emit(state, `    JMP ${testLabel}`);
        emit(state, `${downLabel}:`);
        loadCounter();
        emitExpression(state, stmt.end);
        emitCompare(state, 'LT', loopType);
        emit(state, `${testLabel}:`);
    } else {
        emit(state, direction === 'down' ? `    ; check: counter < end?` : `    ; check: counter > end?`);
        loadCounter();
        emitExpression(state, stmt.end);
        emitCompare(state, direction === 'down' ? 'LT' : 'GT', loopType);
    }
    emit(state, `    JNZ ${endLabel}`);

    // Loop body
    emit(state, `    ; loop body`);
    for (const s of stmt.body) {
        emitStatement(state, s);
    }

    // Increment section (CONTINUE target)
    emit(state, `${continueLabel}:`);
    emit(state, `    ; counter := counter + step`);
    loadCounter();
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

/** Direction of a FOR loop: no step or a constant step of 0 or more counts up, a negative constant counts down. */
function stepDirection(step: Expression | null | undefined): 'up' | 'down' | 'runtime' {
    if (!step) return 'up';
    if (step.kind === 'IntLiteral') return step.value < 0 ? 'down' : 'up';
    if (step.kind === 'UnaryExpr' && step.operator === 'NEG' && step.operand.kind === 'IntLiteral') {
        return step.operand.value > 0 ? 'down' : 'up';
    }
    return 'runtime';
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
    if (isWide(staticType(state, stmt.selector))) {
        fail(stmt.selector, `CASE on a 64-bit value is not supported yet (CMP-015)`);
    }
    const endLabel = newLabel(state, 'end_case');
    const elseLabel = stmt.elseBranch ? newLabel(state, 'case_else') : null;

    // Generate labels for each branch
    const branchLabels: string[] = stmt.branches.map(() => newLabel(state, 'case_branch'));

    // Resolve every label to its bounds; an empty range or a label that overlaps an earlier one is an error.
    const taken: Array<{ lo: number; hi: number }> = [];
    const bounds = stmt.branches.map((branch) => branch.values.map((label) => {
        const lo = constantInt(state, label.start);
        const hi = label.end ? constantInt(state, label.end) : lo;
        const text = lo === hi ? `${lo}` : `${lo}..${hi}`;
        if (lo > hi) fail(label, `CASE range ${text} is empty`);
        if (taken.some((earlier) => lo <= earlier.hi && earlier.lo <= hi)) fail(label, `CASE label ${text} overlaps an earlier label`);
        taken.push({ lo, hi });
        return { lo, hi };
    }));

    emit(state, ``);
    emit(state, `    ; CASE statement`);
    emit(state, `    ; evaluate selector`);
    emitExpression(state, stmt.selector);

    // Emit comparison for each branch
    for (let i = 0; i < stmt.branches.length; i++) {
        const branchLabel = branchLabels[i];

        // Each branch can have multiple values or ranges
        for (const { lo, hi } of bounds[i]) {
            emit(state, `    DUP`);
            emitCaseConstant(state, lo);
            if (lo === hi) {
                emit(state, `    EQ`);
                emit(state, `    JNZ ${branchLabel}`);
            } else {
                // Range lo..hi: selector >= lo AND selector <= hi
                emit(state, `    GE`);
                emit(state, `    DUP`);
                emit(state, `    JZ _skip_range_${state.labelCounter}`);
                emit(state, `    DROP`);
                emit(state, `    DUP`);
                emitCaseConstant(state, hi);
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
 * Value of a constant expression: an integer, its negation, or an enumeration value.
 * ponytail: the symbol table does not record VAR CONSTANT, so a named constant other than an
 * enumeration value is refused; scoped constants arrive with the semantic phase (WP-24).
 */
function constantInt(state: CodeGenState, expr: Expression): number {
    if (expr.kind === 'IntLiteral') return expr.value;
    if (expr.kind === 'UnaryExpr' && expr.operator === 'NEG') return -constantInt(state, expr.operand);
    if (expr.kind === 'Identifier') {
        const sym = resolveSymbol(state, expr.name);
        if (!sym) fail(expr, `Unknown identifier '${expr.name}'`);
        const initial = sym.initialValue as Expression | null;
        if (sym.section === 'CONSTANT' && initial?.kind === 'IntLiteral') return initial.value;
        fail(expr, `'${expr.name}' is not an integer constant`);
    }
    fail(expr, `A CASE label must be an integer constant`);
}

function emitCaseConstant(state: CodeGenState, value: number): void {
    emitIntLiteral(state, { kind: 'IntLiteral', value, line: 0, column: 0 });
}

/**
 * Emit an EXIT statement.
 * Jumps to the exit label of the innermost loop.
 */
function emitExitStatement(state: CodeGenState, stmt: Statement): void {
    if (state.loopStack.length === 0) {
        fail(stmt, `EXIT outside of loop`);
    }

    const loopCtx = state.loopStack[state.loopStack.length - 1];
    emit(state, `    ; EXIT`);
    emit(state, `    JMP ${loopCtx.exitLabel}`);
}

/**
 * Emit a CONTINUE statement.
 * Jumps to the continue label of the innermost loop.
 */
function emitContinueStatement(state: CodeGenState, stmt: Statement): void {
    if (state.loopStack.length === 0) {
        fail(stmt, `CONTINUE outside of loop`);
    }

    const loopCtx = state.loopStack[state.loopStack.length - 1];
    emit(state, `    ; CONTINUE`);
    emit(state, `    JMP ${loopCtx.continueLabel}`);
}

/**
 * Emit a RETURN statement.
 * In a FUNCTION, an inlined FUNCTION_BLOCK body or an inlined method it jumps to the end of
 * that body, so the caller continues; in a PROGRAM it ends the scan of the program.
 */
function emitReturnStatement(state: CodeGenState): void {
    emit(state, `    ; RETURN`);
    emit(state, state.returnLabel ? `    JMP ${state.returnLabel}` : `    HALT`);
}

function emitFBCallStatement(state: CodeGenState, stmt: FBCallStatement): void {
    if (stmt.instance) {
        emitIndexedInstanceCall(state, stmt, stmt.instance);
        return;
    }
    const sym = state.symbols.get(stmt.fbName);

    // ponytail: WATCHDOG_RESET is the sole built-in void-like statement; generalize only if another appears.
    if (!sym) {
        if (stmt.fbName.toUpperCase() === 'WATCHDOG_RESET') {
            if (stmt.parameters.length !== 0) {
                throw new Error('WATCHDOG_RESET expects no parameters');
            }

            const watchdogReset = getFn(stmt.fbName);
            if (!watchdogReset) {
                throw new Error('WATCHDOG_RESET is not available');
            }

            watchdogReset.generateInline(makeCodeGenContext(state, 0, stmt.fbName, stmt), []);
            return;
        }

        fail(stmt, `Unknown FB instance '${stmt.fbName}'`);
    }

    emitInstanceCall(state, stmt, sym);
}

/** The call of the function block instance `sym`: user-defined blocks are inlined, library blocks generate their own code. */
function emitInstanceCall(state: CodeGenState, stmt: FBCallStatement, sym: Symbol): void {
    const typeName = sym.dataType as string;

    // 1. Check if it's a user-defined FB
    const userFB = state.functionBlockTable.get(typeName);
    if (userFB) {
        emit(state, `    ; --- FB CALL: ${stmt.fbName} (${typeName}) ---`);

        // Assign inputs
        for (const param of stmt.parameters) {
            emit(state, `    ; ${stmt.fbName}.${param.name} := ...`);
            emitExpression(state, param.value);
            const memberOffset = sym.members?.get(param.name);
            if (memberOffset === undefined) {
                throw new Error(`Unknown member '${param.name}' on instance '${stmt.fbName}'`);
            }
            const memberAddr = sym.address + memberOffset;
            const suffix = getMemberLoadStoreSuffix(state.symbols, typeName, param.name);
            emit(state, `    STORE${suffix} ${formatAddress(memberAddr)}`);
        }

        // Set context for inlining
        const oldFBInstance = state.currentFBInstance;
        const oldReturnLabel = state.returnLabel;
        state.currentFBInstance = sym;
        state.returnLabel = newLabel(state, 'fb_return');

        // Inline FB Body
        for (const bodyStmt of userFB.body) {
            emitStatement(state, bodyStmt);
        }

        // Restore context
        emit(state, `${state.returnLabel}:`);
        state.currentFBInstance = oldFBInstance;
        state.returnLabel = oldReturnLabel;
        emit(state, `    ; --- END FB CALL: ${stmt.fbName} ---`);
        return;
    }

    // 2. Check if it's a built-in FB
    const fbDef = getFB(typeName as DataTypeValue);
    if (fbDef) {
        emit(state, `    ; ${stmt.fbName}(...)`);

        fbDef.generateCall(makeCodeGenContext(state, sym.address, stmt.fbName, stmt), stmt.parameters);
        return;
    }

    fail(stmt, `Unknown FB type '${typeName}' for instance '${stmt.fbName}'`);
}

// ============================================================================
// Expressions
// ============================================================================

function emitExpression(state: CodeGenState, expr: Expression): void {
    try {
        emitExpressionNode(state, expr);
    } catch (caught) {
        // an error found without a position gets the one of the expression that failed (CMP-006)
        throw codegenErrorFrom(caught, expr) ?? caught;
    }

    // The VM zero-extends an 8- or 16-bit load. A signed value comes back with its sign here, once,
    // so every operator sees the canonical 32-bit form of a SINT or an INT (CMP-011).
    if (expr.kind === 'Identifier' || expr.kind === 'MemberAccess' || expr.kind === 'ArrayAccess' ||
        expr.kind === 'DereferenceExpr' || (expr.kind === 'FunctionCall' && state.functionTable.has(expr.name))) {
        const extend = signExtension(staticType(state, expr));
        if (extend) emit(state, extend);
    }
}

function emitExpressionNode(state: CodeGenState, expr: Expression): void {
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
            fail(expr, 'A function block call cannot be used as an expression');
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
        case 'BitAccess':
            emitBitAccess(state, expr);
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
            fail(expr as Expression, `Unsupported expression ${(expr as Expression).kind}`);
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
        // An unsigned 32-bit or a 64-bit context takes such a literal through emitConverted
        fail(expr, `Integer literal ${expr.value} does not fit a signed 32-bit integer; ` +
            `use an unsigned 32-bit (UDINT, DWORD) or a 64-bit (LINT, ULINT) variable`);
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
        fail(expr, `String literal not found in pool: '${expr.value}'`);
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
        fail(expr, `Unknown identifier '${expr.name}'`);
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

    // Bit-addressed BOOL (e.g. AT %QX0.1): extract the specific bit from the byte
    // Stack result: [0 or 1] (the bit value as BOOL)
    if (sym.dataType === 'BOOL' && sym.ioAddress &&
        (sym.ioAddress.size === 'X' || sym.ioAddress.bitOffset !== undefined)) {
        const bitPos = sym.ioAddress.bitOffset;
        emit(state, `    LOAD8 ${formatAddress(sym.address)}   ; ${expr.name} (byte)`);
        if (bitPos > 0) {
            emit(state, `    PUSH8 ${bitPos}`);
            emit(state, `    SHR                 ; extract bit ${bitPos}`);
        }
        emit(state, `    PUSH8 1`);
        emit(state, `    AND                 ; mask to 0 or 1`);
        return;
    }

    const suffix = getLoadStoreSuffix(sym.dataType as DataTypeValue);
    emit(state, `    LOAD${suffix} ${formatAddress(sym.address)}   ; ${expr.name}`);
}

function emitMemberAccess(state: CodeGenState, expr: MemberAccess): void {
    // Handle THIS.member access
    if (expr.object.kind === 'ThisExpr') {
        if (!state.currentFBInstance) {
            fail(expr, `THIS used outside of FB/method context`);
        }
        
        const fbTypeName = state.currentFBInstance.dataType as string;
        const fbDef = state.symbols.getFBDefinition(fbTypeName);
        
        if (!fbDef) {
            fail(expr, `Unknown FB type '${fbTypeName}'`);
        }
        
        const member = fbDef.members.get(expr.member);
        if (!member) {
            fail(expr, `Unknown member '${expr.member}' on FB '${fbTypeName}'`);
        }
        
        const memberAddr = state.currentFBInstance.address + member.offset;
        let suffix: '8' | '16' | '32' | '64' = '32';
        if (member.size === 1) suffix = '8';
        else if (member.size === 2) suffix = '16';
        else if (member.size === 8) suffix = '64';
        
        emit(state, `    LOAD${suffix} ${formatAddress(memberAddr)}   ; THIS.${expr.member}`);
        return;
    }
    
    // Nested path (a.b.c): the symbol table resolves it, as it does for an assignment target
    if (expr.object.kind !== 'Identifier') {
        const resolution = state.symbols.resolveMemberPath(expr);
        emit(state, `    LOAD${getLoadStoreSuffix(resolution.dataType as DataTypeValue)} ${formatAddress(resolution.address)}`);
        return;
    }

    const structName = (expr.object as Identifier).name;
    const sym = state.symbols.get(structName);
    if (!sym) {
        fail(expr, `Unknown struct/instance '${structName}'`);
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
    // A negative literal is one constant: -2147483648 is not 2147483648 negated
    if (expr.operator === 'NEG') {
        const constant = constantInteger(expr);
        if (constant !== undefined && constant >= -2147483648n && constant <= 2147483647n) {
            emitIntLiteral(state, { kind: 'IntLiteral', value: Number(constant), line: expr.line, column: expr.column });
            return;
        }
    }

    emitExpression(state, expr.operand);
    const type = staticType(state, expr.operand);
    const info = numericInfo(type);

    if (isWide(type) && !isFloatType(type)) {
        // Two cells [lo hi]
        if (expr.operator === 'NOT') {
            emit(state, `    NOT`);
            emit(state, `    SWAP`);
            emit(state, `    NOT`);
            emit(state, `    SWAP`);
        } else {
            // -x: lo' = -lo, hi' = ~hi + (lo == 0)
            emit(state, `    PICK 1`);
            emit(state, `    PUSH8 0`);
            emit(state, `    EQ                  ; [lo hi lo==0]`);
            emit(state, `    SWAP`);
            emit(state, `    NOT`);
            emit(state, `    ADD                 ; [lo hi']`);
            emit(state, `    SWAP`);
            emit(state, `    NEG                 ; [hi' lo']`);
            emit(state, `    SWAP`);
        }
        return;
    }

    switch (expr.operator) {
        case 'NOT':
            emit(state, `    NOT`);
            if (info && !info.float && type !== 'BOOL') {
                // A bit string or an integer keeps its declared width (CMP-014): the complement of a
                // signed or a 32-bit value is already canonical, a narrow unsigned one is cut back
                if (info.bits === 8 && !info.signed) emit(state, `    ZEXT8`);
                else if (info.bits === 16 && !info.signed) emit(state, `    ZEXT16`);
            } else {
                // For boolean NOT, we need to mask to get 0 or 1
                emit(state, `    PUSH8 1`);
                emit(state, `    AND`);
            }
            break;
        case 'NEG':
            emit(state, isFloatType(type) ? `    NEGF` : `    NEG`);
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

// ============================================================================
// Numeric typing (CMP-011 to CMP-014, CMP-017)
//
// The rules and the helper routines live in numeric.ts. This part decides, for each
// operator, which opcode sequence the static type of its operands needs.
// ============================================================================

/** Elementary type of a standard function block member that declares none. */
function stdlibMemberType(fbType: string, member: { name: string; size: number; dataType?: unknown }): string {
    const declared = numericTypeName(member.dataType);
    if (declared !== UNKNOWN_TYPE) return declared;
    if (member.size === 1) return 'BOOL';
    // The counters' PV and CV are the only 2-byte members, and they are INT in IEC 61131-3.
    if (member.size === 2) return 'INT';
    if (member.size === 4 && ['TON', 'TOF', 'TP'].includes(fbType) && (member.name === 'PT' || member.name === 'ET')) {
        return 'TIME';
    }
    return UNKNOWN_TYPE;
}

function memberAccessType(state: CodeGenState, expr: MemberAccess): string {
    try {
        if (expr.object.kind === 'ThisExpr') {
            const fbType = state.currentFBInstance?.dataType;
            const fbDef = typeof fbType === 'string' ? state.symbols.getFBDefinition(fbType) : undefined;
            return numericTypeName(fbDef?.members.get(expr.member)?.dataType);
        }
        const owner = state.symbols.resolveMemberPath(expr.object);
        const ownerType = typeof owner.dataType === 'string' ? owner.dataType : undefined;
        const stdFB = ownerType ? getFB(ownerType as DataTypeValue) : undefined;
        if (stdFB && !state.symbols.getFBDefinition(ownerType!) && !state.symbols.getStructDefinition(ownerType!)) {
            const member = stdFB.members.find((m) => m.name === expr.member);
            return member ? stdlibMemberType(ownerType!, member) : UNKNOWN_TYPE;
        }
        return numericTypeName(state.symbols.resolveMemberPath(expr).dataType);
    } catch {
        return UNKNOWN_TYPE;
    }
}

/** Result type of a function call: the user function's declared type or the standard function's rule. */
function functionResultType(state: CodeGenState, expr: FunctionCall): string {
    const userFn = state.functionTable.get(expr.name);
    if (userFn) return numericTypeName(userFn.returnType);

    const args = expr.args.map((a) => ((a as any).kind === 'NamedArgument' ? (a as any).value : a) as Expression);
    const common = (list: Expression[]): string =>
        list.map((a) => staticType(state, a)).reduce((acc, t) => commonType(acc, t), LITERAL_INT);

    switch (expr.name.toUpperCase()) {
        case 'ABS': case 'NEG': case 'MOD': case 'MAX': case 'MIN': case 'LIMIT':
            return args.length > 0 ? common(args) : UNKNOWN_TYPE;
        case 'SEL':
            return args.length === 3 ? common(args.slice(1)) : UNKNOWN_TYPE;
        case 'MUX':
            return args.length > 1 ? common(args.slice(1)) : UNKNOWN_TYPE;
        case 'SHL': case 'SHR': case 'ROL': case 'ROR':
            return args.length > 0 ? staticType(state, args[0]) : UNKNOWN_TYPE;
        case 'ABSF': case 'NEGF': case 'SQRT': case 'SIN': case 'COS': case 'TAN': case 'LN': case 'LOG':
        case 'EXP': case 'ASIN': case 'ACOS': case 'ATAN': case 'ATAN2': case 'TRUNC': case 'ROUND':
        case 'INT_TO_REAL':
            return 'REAL';
        case 'REAL_TO_INT': case 'BOOL_TO_INT':
            return 'INT';
        case 'INT_TO_BOOL': case 'NAND': case 'NOR':
            return 'BOOL';
        case 'AND_WORD': case 'OR_WORD': case 'XOR_WORD': case 'NOT_WORD':
            return 'WORD';
        case 'AND_DWORD': case 'OR_DWORD': case 'XOR_DWORD': case 'NOT_DWORD':
            return 'DWORD';
        default:
            return UNKNOWN_TYPE;
    }
}

/**
 * Static numeric type of an expression: an elementary type name, LITERAL_INT for an integer
 * literal (it adopts the other operand's type) or UNKNOWN_TYPE when the generator cannot name it.
 */
function staticType(state: CodeGenState, expr: Expression): string {
    switch (expr.kind) {
        case 'BoolLiteral': return 'BOOL';
        // INT#5 is an INT; a plain 5 adopts the type of the operand it meets (CMP-031)
        case 'IntLiteral': return expr.literalType ?? LITERAL_INT;
        case 'RealLiteral': return 'REAL';
        case 'TimeLiteral': return 'TIME';
        case 'DateLiteral': return 'DATE';
        case 'TODLiteral': return 'TOD';
        case 'DTLiteral': return 'DT';
        case 'Identifier': {
            const sym = resolveSymbol(state, expr.name);
            return sym ? numericTypeName(sym.dataType) : UNKNOWN_TYPE;
        }
        case 'MemberAccess':
            return memberAccessType(state, expr);
        case 'ArrayAccess': {
            try {
                const arrayType = state.symbols.resolveMemberPath(expr.array).dataType;
                return isArrayType(arrayType) ? numericTypeName(arrayType.elementType) : UNKNOWN_TYPE;
            } catch {
                return UNKNOWN_TYPE;
            }
        }
        case 'DereferenceExpr': {
            const base = resolveType(state, expr);
            return base ? numericTypeName(base) : UNKNOWN_TYPE;
        }
        case 'UnaryExpr':
            return staticType(state, expr.operand);
        case 'BitAccess':
            return 'BOOL';
        case 'BinaryExpr':
            if (['EQ', 'NE', 'LT', 'LE', 'GT', 'GE'].includes(expr.operator)) return 'BOOL';
            if (expr.operator === 'POW') return 'REAL';
            return commonType(staticType(state, expr.left), staticType(state, expr.right));
        case 'FunctionCall':
            return functionResultType(state, expr);
        default:
            return UNKNOWN_TYPE;
    }
}

/** The instruction that restores the sign of an 8- or 16-bit signed value the VM zero-extended on load. */
function signExtension(typeName: string): string | null {
    if (typeName === 'SINT') return '    EXT8';
    if (typeName === 'INT') return '    EXT16';
    return null;
}

/** Convert the integer on top of the stack to REAL; an unsigned 32-bit value above 2^31 needs its own sequence. */
function emitIntToReal(state: CodeGenState, fromType: string): void {
    if (isUnsigned32(fromType)) {
        for (const line of UNSIGNED_TO_REAL) emit(state, line);
    } else {
        emit(state, `    I2F`);
    }
}

/** Link a helper routine into the program and call it. */
function callHelper(state: CodeGenState, helper: HelperName | 'powf', label: string): void {
    state.helpers.add(helper);
    emit(state, `    CALL ${label}`);
}

/** Value of an integer literal or of its negation, exact beyond 2^53; undefined for any other expression. */
function constantInteger(expr: Expression): bigint | undefined {
    if (expr.kind === 'IntLiteral') return expr.big ?? BigInt(expr.value);
    if (expr.kind === 'UnaryExpr' && expr.operator === 'NEG') {
        const inner = constantInteger(expr.operand);
        return inner === undefined ? undefined : -inner;
    }
    return undefined;
}

/** Push a 64-bit constant as two cells, low word first (the order LOAD64 leaves them in). */
function emitWideConstant(state: CodeGenState, value: bigint): void {
    const bits = BigInt.asUintN(64, value);
    emit(state, `    PUSH32 ${Number(bits & 0xFFFFFFFFn)}       ; ${value} (low word)`);
    emit(state, `    PUSH32 ${Number(bits >> 32n)}       ; (high word)`);
}

/** The error of a 64-bit operation that has no opcode and no helper routine yet. */
function failWide(at: { line: number; column: number }, what: string): never {
    return fail(at, `${what} on a 64-bit value is not supported yet (CMP-015): the VM has no 64-bit opcode for it`);
}

/**
 * Emit `expr` and convert its value to `target`: REAL (an integer of 32 bits or less is
 * converted, the implicit conversion of IEC 61131-3 arithmetic) or a 64-bit integer type (a
 * narrower integer is widened to two cells, a 64-bit value assigned to a narrower target
 * loses its high word).
 */
function emitConverted(state: CodeGenState, expr: Expression, target: string): void {
    const type = staticType(state, expr);
    const info = numericInfo(type);
    const sourceBits = info?.bits ?? 32;

    if (isUnsigned32(target)) {
        // 2^31 to 2^32 - 1 is a UDINT, DWORD or TIME value, not a signed one (CMP-012)
        const constant = constantInteger(expr);
        if (constant !== undefined && constant >= 0n && constant <= 0xFFFFFFFFn) {
            emit(state, `    PUSH32 ${constant}`);
            return;
        }
    }

    if (target === 'REAL') {
        if (isWide(type) && isIntegerLike(type)) failWide(expr, 'Conversion to REAL');
        if (isIntegerLike(type) && sourceBits <= 32) {
            if (expr.kind === 'IntLiteral') {
                emit(state, `    PUSH32 ${floatBits(expr.value)}       ; ${expr.value} (REAL)`);
                return;
            }
            emitExpression(state, expr);
            emitIntToReal(state, type);
            return;
        }
        emitExpression(state, expr);
        return;
    }

    if (isWide(target) && !isFloatType(target)) {
        if (isFloatType(type)) failWide(expr, 'Conversion from REAL');
        if (isWide(type)) {
            if (expr.kind === 'BinaryExpr') emitBinaryExpr(state, expr, target);
            else emitExpression(state, expr);
            return;
        }
        const constant = constantInteger(expr);
        if (constant !== undefined) {
            emitWideConstant(state, constant);
            return;
        }
        if (expr.kind === 'BinaryExpr' && type === LITERAL_INT) {
            // literals only: the operation takes the width of its context
            emitBinaryExpr(state, expr, target);
            return;
        }
        if (isIntegerLike(type) && sourceBits <= 32) {
            emitExpression(state, expr);
            if (info?.signed || type === LITERAL_INT) {
                // the sign word: the value shifted right by 31
                emit(state, `    DUP`);
                emit(state, `    PUSH8 31`);
                emit(state, `    SAR`);
            } else {
                emit(state, `    PUSH8 0`);
            }
            return;
        }
        emitExpression(state, expr);
        return;
    }

    if (isWide(type) && isIntegerLike(type) && isIntegerLike(target) && (numericInfo(target)?.bits ?? 64) <= 32) {
        emitExpression(state, expr);
        emit(state, `    DROP                ; high word`);
        return;
    }

    emitExpression(state, expr);
}

/** Emit `value` for storing into a target of `targetType`. */
function emitValueFor(state: CodeGenState, value: Expression, targetType: unknown): void {
    emitConverted(state, value, numericTypeName(targetType));
}

/** Emit the comparison `op` of the two values on the stack, read as `type`. */
function emitCompare(state: CodeGenState, op: CompareOp, type: string): void {
    if (type === 'REAL') {
        // No float comparison opcode: the IEEE 754 order of two REAL values is a call to a helper
        callHelper(state, 'fcmp', FCMP_LABEL);
        for (const line of fcmpTest(op)) emit(state, line);
        return;
    }
    if (isWide(type) && !isFloatType(type)) {
        // Four cells in, one three-way result out; LINT and DT order signed, ULINT and LWORD unsigned
        callHelper(state, 'cmp64', numericInfo(type)?.signed ? CMP64S_LABEL : CMP64U_LABEL);
        for (const line of cmp64Test(op)) emit(state, line);
        return;
    }
    if (isUnsigned32(type) && op !== 'EQ' && op !== 'NE') {
        // Only LTU and GTU exist: a <= b is not (a > b), a >= b is not (a < b)
        switch (op) {
            case 'LT': emit(state, `    LTU`); return;
            case 'GT': emit(state, `    GTU`); return;
            case 'LE': emit(state, `    GTU`); break;
            case 'GE': emit(state, `    LTU`); break;
        }
        emit(state, `    PUSH8 0`);
        emit(state, `    EQ`);
        return;
    }
    emit(state, `    ${op}`);
}

/** The stdlib code generators ask the compiler, not the opcode table, for typed operations. */
function makeCodeGenContext(
    state: CodeGenState,
    baseAddress: number,
    instanceName: string,
    at: { line: number; column: number },
): CodeGenContext {
    return {
        baseAddress,
        instanceName,
        newLabel: (prefix: string) => newLabel(state, prefix),
        emit: (line: string) => emit(state, line),
        emitExpression: (e: Expression) => emitExpression(state, e),
        fail: (message: string) => fail(at, message),
        typeOf: (e: Expression) => {
            const type = staticType(state, e);
            return type === UNKNOWN_TYPE ? undefined : type;
        },
        emitOperand: (e: Expression, asType: string) => emitConverted(state, e, asType),
        emitCompare: (op: CompareOp, type?: string) => emitCompare(state, op, type ?? UNKNOWN_TYPE),
    };
}

/**
 * `contextType` is the type the operation takes when both operands are bare integer literals
 * (a 64-bit assignment target makes `3000000000 + 3000000000` a 64-bit sum).
 */
function emitBinaryExpr(state: CodeGenState, expr: BinaryExpr, contextType?: string): void {
    if (expr.operator === 'POW') {
        emitPower(state, expr);
        return;
    }

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
            fail(expr, `String + operator requires destination. Use CONCAT(s1, s2) instead.`);
        }

        // Other operators don't make sense for strings
        emit(state, `    ; WARNING: Operator ${expr.operator} not supported for STRING type`);
    }

    // The type of the operation: REAL when either side is REAL (the integer side is converted),
    // a 64-bit integer type when either side is one, an unsigned 32-bit type when either side is
    // one, otherwise the signed integer rules
    let opType = commonType(staticType(state, expr.left), staticType(state, expr.right));
    if (opType === LITERAL_INT && contextType !== undefined && isWide(contextType)) opType = contextType;
    const wide = isWide(opType) && !isFloatType(opType);

    if (wide) {
        emitWideBinary(state, expr, opType);
        return;
    }

    // Logical operators act on the bit pattern, whatever the type: AND, OR and XOR of two
    // zero-extended values never leave the declared width
    if (expr.operator === 'AND' || expr.operator === 'OR' || expr.operator === 'XOR') {
        // a literal above 2^31 - 1 is a valid operand of a 32-bit unsigned bit string (CMP-012)
        const logicalTarget = isUnsigned32(opType) ? opType : UNKNOWN_TYPE;
        emitConverted(state, expr.left, logicalTarget);
        emitConverted(state, expr.right, logicalTarget);
        emit(state, `    ${expr.operator}`);
        return;
    }

    const useFloat = isFloatType(opType);
    const target = opType === 'REAL' || isUnsigned32(opType) ? opType : UNKNOWN_TYPE;

    emitConverted(state, expr.left, target);
    emitConverted(state, expr.right, target);

    switch (expr.operator) {
        // Arithmetic operators - use float variants when operands are REAL
        case 'ADD': emit(state, useFloat ? `    ADDF` : `    ADD`); break;
        case 'SUB': emit(state, useFloat ? `    SUBF` : `    SUB`); break;
        case 'MUL': emit(state, useFloat ? `    MULF` : `    MUL`); break;
        case 'DIV':
            if (useFloat) {
                emit(state, `    DIVF`);
            } else if (isUnsigned32(opType)) {
                callHelper(state, 'udiv32', UDIV32_LABEL);
            } else {
                emit(state, `    DIV`);
            }
            break;

        // MOD doesn't have a float variant (integer only)
        case 'MOD':
            if (isUnsigned32(opType)) {
                // a MOD b = a - (a /u b) * b
                emit(state, `    OVER`);
                emit(state, `    OVER`);
                callHelper(state, 'udiv32', UDIV32_LABEL);
                emit(state, `    MUL`);
                emit(state, `    SUB`);
            } else {
                emit(state, `    MOD`);
            }
            break;

        case 'EQ': case 'NE': case 'LT': case 'LE': case 'GT': case 'GE':
            emitCompare(state, expr.operator, opType);
            break;
    }
}

/** A binary operation on 64-bit integers: each operand is two cells, low word below the high word. */
function emitWideBinary(state: CodeGenState, expr: BinaryExpr, opType: string): void {
    switch (expr.operator) {
        case 'MUL': case 'DIV': case 'MOD':
            failWide(expr, `The ${expr.operator === 'MUL' ? 'multiplication' : expr.operator === 'DIV' ? 'division' : 'modulo'}`);
    }

    emitConverted(state, expr.left, opType);
    emitConverted(state, expr.right, opType);

    switch (expr.operator) {
        case 'ADD': callHelper(state, 'add64', ADD64_LABEL); break;
        case 'SUB': callHelper(state, 'sub64', SUB64_LABEL); break;
        case 'AND': case 'OR': case 'XOR':
            // [alo ahi blo bhi]: the high words, then the low words
            emit(state, `    ROT`);
            emit(state, `    ${expr.operator}`);
            emit(state, `    ROT`);
            emit(state, `    ROT`);
            emit(state, `    ${expr.operator}`);
            emit(state, `    SWAP`);
            break;
        case 'EQ': case 'NE': case 'LT': case 'LE': case 'GT': case 'GE':
            emitCompare(state, expr.operator, opType);
            break;
    }
}

function emitFunctionCall(state: CodeGenState, expr: FunctionCall): void {
    // 1. Check if it's a user-defined function
    const userFn = state.functionTable.get(expr.name);
    if (userFn) {
        emit(state, `    ; CALL ${expr.name}(...)`);

        // Push arguments onto stack; an integer given to a REAL parameter is converted
        expr.args.forEach((arg, index) => {
            const named = (arg as any).kind === 'NamedArgument';
            const value = (named ? (arg as any).value : arg) as Expression;
            const input = named
                ? userFn.inputs.find((i) => i.name === (arg as any).name)
                : userFn.inputs[index];
            // an argument for a parameter that is not a VAR_INPUT (a VAR_OUTPUT or VAR_IN_OUT is declared, but is not
            // passed yet: CMP-028, CMP-035) would be pushed and never read, leaving the stack unbalanced
            if (input === undefined) {
                fail(arg as { line: number; column: number }, named
                    ? `Function '${expr.name}' has no input parameter '${(arg as any).name}'`
                    : `Function '${expr.name}' takes ${userFn.inputs.length} argument(s)`);
            }
            emitValueFor(state, value, input.dataType);
        });

        emit(state, `    CALL ${userFn.label}`);
        return;
    }

    if (expr.name.toUpperCase() === 'WATCHDOG_RESET') {
        throw new Error('WATCHDOG_RESET is statement-only');
    }

    // 2. Check if it's a built-in function
    const fnDef = getFn(expr.name);
    if (!fnDef) {
        fail(expr, `Unknown function '${expr.name}'`);
    }

    // The standard functions work on one cell per operand
    for (const arg of expr.args) {
        const value = ((arg as any).kind === 'NamedArgument' ? (arg as any).value : arg) as Expression;
        const argType = staticType(state, value);
        if (isWide(argType)) {
            fail(expr, `${expr.name} does not take a 64-bit argument yet (CMP-015)`);
        }
    }

    emit(state, `    ; ${expr.name}(...)`);

    // Create code generation context for inline function
    // (baseAddress is not used for stateless functions)
    const ctx = makeCodeGenContext(state, 0, expr.name, expr);

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
    // Bit-addressed BOOL (e.g. AT %QX0.0, AT %Q0.1): requires Read-Modify-Write.
    // The symbol address points to the byte; ioAddress.bitOffset selects the bit within it.
    // This handles ALL bit offsets (0..7) to avoid clobbering sibling bits in the same byte.
    //
    // Stack entry: [value]   (1 or 0)
    // Sequence:
    //   DUP                        ; [value, value]
    //   PUSH8 bitPos               ; [value, value, bitPos]
    //   SHL                        ; [value, shifted_value]   a=value << bitPos
    //   LOAD8 addr                 ; [value, shifted_value, current_byte]
    //   PUSH8 andMask              ; [value, shifted_value, current_byte, andMask]
    //   AND                        ; [value, shifted_value, cleared_byte]
    //   OR                         ; [value, new_byte]
    //   STORE8 addr                ; [value]
    //   DROP                       ; []
    if (sym.dataType === 'BOOL' && sym.ioAddress &&
        (sym.ioAddress.size === 'X' || sym.ioAddress.bitOffset !== undefined)) {
        const bitPos = sym.ioAddress.bitOffset;
        const andMask = (~(1 << bitPos)) & 0xFF;  // Clear the target bit
        emit(state, `    ; RMW STORE BOOL bit ${bitPos} at ${formatAddress(sym.address)}`);
        emit(state, `    DUP`);
        emit(state, `    PUSH8 ${bitPos}`);
        emit(state, `    SHL                 ; shift value into bit position`);
        emit(state, `    LOAD8 ${formatAddress(sym.address)}`);
        emit(state, `    PUSH8 ${andMask}`);
        emit(state, `    AND                 ; clear target bit`);
        emit(state, `    OR                  ; merge new bit into byte`);
        emit(state, `    STORE8 ${formatAddress(sym.address)}`);
        emit(state, `    DROP                ; consume original value`);
        return;
    }

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
        fail(expr, `target is not an array`);
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
            fail(expr, `Unknown identifier '${expr.name}'`);
        }
    } else if (expr.kind === 'ArrayAccess') {
        const resolution = state.symbols.resolveMemberPath(expr.array);
        emitArrayAddress(state, expr, resolution);
    } else if (expr.kind === 'DereferenceExpr') {
        // Address of (ptr^) is the value of ptr
        emitExpression(state, expr.operand);
    } else if (expr.kind === 'MemberAccess') {
         if (expr.object.kind !== 'Identifier') {
            fail(expr, `Complex member access address not supported`);
        }
        const structName = (expr.object as Identifier).name;
        const memberAddr = state.symbols.getMemberAddress(structName, expr.member);
        emit(state, `    PUSH32 ${formatAddress(memberAddr)}`);
    } else {
        fail(expr, `Cannot take address of ${expr.kind}`);
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
        fail(expr, `Complex method call targets not supported yet`);
    }
    
    let instanceName: string;
    let fbTypeName: string;
    let instanceSym: Symbol | undefined;
    
    if (expr.object.kind === 'ThisExpr') {
        // Method called on THIS - we're inside an FB context
        if (!state.currentFBInstance) {
            fail(expr, `THIS used outside of FB context`);
        }
        instanceName = state.currentFBInstance.name;
        fbTypeName = state.currentFBInstance.dataType as string;
        instanceSym = state.currentFBInstance;
    } else {
        instanceName = (expr.object as Identifier).name;
        instanceSym = state.symbols.get(instanceName);
        if (!instanceSym) {
            fail(expr, `Unknown instance '${instanceName}'`);
        }
        fbTypeName = instanceSym.dataType as string;
    }
    
    // Get the FB definition from SymbolTable (which handles inheritance)
    const fbDef = state.symbols.getFBDefinition(fbTypeName);
    if (!fbDef) {
        fail(expr, `Unknown FB type '${fbTypeName}'`);
    }
    
    // Find the method (includes inherited ones)
    const methodInfo = fbDef.methods.get(expr.methodName);
    if (!methodInfo) {
        fail(expr, `Unknown method '${expr.methodName}' on FB '${fbTypeName}'`);
    }
    
    // Save current FB context and set up new one for method execution
    const prevFBInstance = state.currentFBInstance;
    const prevMethod = state.currentMethod;
    const prevReturnLabel = state.returnLabel;
    state.returnLabel = newLabel(state, 'method_return');
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
                    fail(expr, `Unknown named argument '${inputName}' for method '${expr.methodName}'`);
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
            emitValueFor(state, argExpr, input.dataType);
            
            if (input.mangledName) {
                const sym = state.symbols.get(input.mangledName);
                if (sym) {
                    const suffix = getLoadStoreSuffix(sym.dataType as DataTypeValue);
                    emit(state, `    STORE${suffix} ${formatAddress(sym.address)}`);
                } else {
                     fail(expr, `Symbol for input '${inputName}' not found`);
                }
            } else {
                fail(expr, `Input '${inputName}' has no allocated memory`);
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
                        emitValueFor(state, local.initialValue, sym.dataType);
                    } else {
                        emit(state, `    ; Init ${local.name} := 0`);
                        // a 64-bit local is two cells: low word, then high word
                        if (sym.size === 8) emit(state, `    PUSH32 0`);
                        emit(state, `    PUSH32 0`);
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
    emit(state, `${state.returnLabel}:`);
    
    // If method has a return type, the result should be on the stack
    // (IEC convention: MethodName := value; leaves value as result)
    
    emit(state, `    ; --- End Method ${fbTypeName}.${expr.methodName} ---`);
    
    // Restore previous FB context
    state.currentFBInstance = prevFBInstance;
    state.currentMethod = prevMethod;
    state.returnLabel = prevReturnLabel;
}

/**
 * Emit THIS expression.
 * 
 * THIS refers to the current FB instance's base address.
 * Used within methods to access the FB's own members.
 */
function emitThisExpr(state: CodeGenState, expr: ThisExpr): void {
    if (!state.currentFBInstance) {
        fail(expr, `THIS used outside of FB/method context`);
    }
    
    // Push the base address of the current FB instance
    emit(state, `    PUSH32 ${formatAddress(state.currentFBInstance.address)}   ; THIS`);
}

function emitDateLiteral(state: CodeGenState, expr: DateLiteral): void {
    const dateStr = expr.value;
    const timestamp = Date.parse(dateStr);
    if (isNaN(timestamp)) {
        fail(expr, `Invalid DATE literal '${expr.value}'`);
    }
    emit(state, `    PUSH32 ${Math.floor(timestamp / 1000)}`);
}

function emitTODLiteral(state: CodeGenState, expr: TODLiteral): void {
    const timestamp = Date.parse(`1970-01-01T${expr.value}Z`);
    if (isNaN(timestamp)) {
        fail(expr, `Invalid TOD literal '${expr.value}'`);
    }
    emit(state, `    PUSH32 ${timestamp}`);
}

function emitDTLiteral(state: CodeGenState, expr: DTLiteral): void {
    const normalized = expr.value.replace(/-(\d{2}:)/, 'T$1');
    const timestamp = Date.parse(normalized);
    if (isNaN(timestamp)) {
        fail(expr, `Invalid DT literal '${expr.value}'`);
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
        fail(expr, `WString literal not found in pool: '${expr.value}'`);
    }
}

/**
 * Helper to get the load/store suffix for a member (resolves through FBs and Structs).
 * Re-exporting from symbol-table to maintain backward compatibility in this file.
 */
import { getMemberLoadStoreSuffix } from './symbol-table.ts';
import { DATA_TYPE_ID, MEMORY_REGION, STRING_LAYOUT, TAG_ID } from '../contract.generated.ts';

// ============================================================================
// Bit access and exponentiation (CMP-032)
// ============================================================================

/** The types a bit of which can be read or written: the integers and the bit strings. */
const BIT_ACCESS_TYPES = new Set(['SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT', 'BYTE', 'WORD', 'DWORD', 'LWORD']);

/** The mask of the bit of `access` and the width and signedness of its operand, once both are checked. */
function bitMask(state: CodeGenState, access: BitAccess): { mask: bigint; bits: number; signed: boolean } {
    const type = staticType(state, access.operand);
    if (!BIT_ACCESS_TYPES.has(type)) {
        fail(access, type === 'BOOL' || type === UNKNOWN_TYPE || type === LITERAL_INT
            ? `Bit access .${access.bit} needs an integer or bit-string variable (SINT to LINT, BYTE to LWORD)`
            : `Bit access .${access.bit} is not defined for ${type}: it applies to the integers and the bit strings`);
    }
    const bits = numericInfo(type)!.bits;
    if (access.bit >= bits) {
        fail(access, `Bit ${access.bit} is out of range for ${type}: it has bits 0 to ${bits - 1}`);
    }
    return { mask: 1n << BigInt(access.bit), bits, signed: numericInfo(type)!.signed };
}

function integerLiteral(value: bigint, at: { line: number; column: number }): IntLiteral {
    const number = Number(value);
    return {
        kind: 'IntLiteral',
        value: number,
        ...(Number.isSafeInteger(number) ? {} : { big: value }),
        line: at.line,
        column: at.column,
    };
}

/** `w.3` as a BOOL: the operand masked with the bit and compared with zero. */
function emitBitAccess(state: CodeGenState, access: BitAccess): void {
    const { mask } = bitMask(state, access);
    const at = { line: access.line, column: access.column };
    emitExpression(state, {
        kind: 'BinaryExpr',
        operator: 'NE',
        left: { kind: 'BinaryExpr', operator: 'AND', left: access.operand, right: integerLiteral(mask, at), ...at },
        right: integerLiteral(0n, at),
        ...at,
    });
}

/** `w.3 := value`: the bit is set when the value is true and cleared when it is false; the other bits stay. */
function emitBitAssignment(state: CodeGenState, stmt: Assignment, target: BitAccess): void {
    const { mask, bits, signed } = bitMask(state, target);
    const at = { line: stmt.line, column: stmt.column };
    const operand = target.operand as Assignment['target'];
    const update = (operator: 'OR' | 'AND', constant: bigint): Assignment => ({
        kind: 'Assignment',
        target: operand,
        value: { kind: 'BinaryExpr', operator, left: target.operand, right: integerLiteral(constant, at), ...at },
        ...at,
    });
    emitStatement(state, {
        kind: 'IfStatement',
        condition: stmt.value,
        thenBranch: [update('OR', mask)],
        elsifBranches: [],
        // every bit of the width but the cleared one, as a number the type holds
        elseBranch: [update('AND', signed ? BigInt.asIntN(bits, ~mask) : BigInt.asUintN(bits, ~mask))],
        ...at,
    });
}

/**
 * `a ** b`: both operands are converted to REAL and the helper routine computes the power (power.ts).
 */
function emitPower(state: CodeGenState, expr: BinaryExpr): void {
    for (const operand of [expr.left, expr.right]) {
        if (isWide(staticType(state, operand))) failWide(expr, 'Exponentiation (**)');
    }
    emitConverted(state, expr.left, 'REAL');
    emitConverted(state, expr.right, 'REAL');
    callHelper(state, 'powf', POWF_LABEL);
}

/**
 * A call of an instance that is an array element: `timers[2](IN := x)` (CMP-038).
 *
 * A constant index is one address. A run-time index is a chain of comparisons, one branch for each element
 * of a one-dimensional array, each branch the call of that element: the code of a call has its instance
 * address fixed, so the array is unrolled (at most 64 elements). An index outside the bounds calls nothing.
 */
function emitIndexedInstanceCall(state: CodeGenState, stmt: FBCallStatement, access: Expression): void {
    if (access.kind !== 'ArrayAccess') {
        fail(access, 'Only an array element can be called through an expression');
    }
    const array = state.symbols.resolveMemberPath(access.array);
    const arrayType = array.dataType as STDataType;
    if (!isArrayType(arrayType)) {
        fail(access, `'${stmt.fbName}' is not an array`);
    }
    const elementType = arrayType.elementType as string;
    if (!state.symbols.isFBType(elementType)) {
        fail(access, `'${elementType}' is not a function block: only an array of function block instances can be called`);
    }
    if (access.indices.length !== arrayType.dimensions.length) {
        fail(access, `The array has ${arrayType.dimensions.length} dimension(s) and is indexed with ${access.indices.length}`);
    }
    const elementSize = state.symbols.getTypeSizeByName(elementType);
    const members = memberOffsets(state, elementType);
    const label = describeCallee(access);
    const instanceAt = (linear: number): Symbol => ({
        name: label,
        dataType: elementType,
        address: array.address + linear * elementSize,
        size: elementSize,
        section: VarSection.VAR,
        ioAddress: null,
        members,
        initialValue: null,
        tags: {},
    });

    const indices = access.indices.map((index) => {
        try {
            return constantInt(state, index);
        } catch {
            return undefined;
        }
    });

    if (indices.every((index) => index !== undefined)) {
        // one address: row-major, the last index varies fastest
        let linear = 0;
        arrayType.dimensions.forEach((dimension, d) => {
            const index = indices[d]!;
            if (index < dimension.lowerBound || index > dimension.upperBound) {
                fail(access.indices[d]!, `Index ${index} is outside the array bounds ${dimension.lowerBound}..${dimension.upperBound}`);
            }
            linear = linear * (dimension.upperBound - dimension.lowerBound + 1) + (index - dimension.lowerBound);
        });
        emitInstanceCall(state, stmt, instanceAt(linear));
        return;
    }

    if (arrayType.dimensions.length !== 1) {
        fail(access, 'A function block in a multi-dimensional array is called with constant indices');
    }
    const { lowerBound, upperBound } = arrayType.dimensions[0]!;
    const count = upperBound - lowerBound + 1;
    if (count > 64) {
        fail(access, `A call with a run-time index is generated for at most 64 elements; this array has ${count}`);
    }
    const end = newLabel(state, 'fbarr_end');
    emit(state, `    ; ${label}[...](...): one call for each element of the array`);
    for (let k = 0; k < count; k++) {
        const next = newLabel(state, 'fbarr_next');
        emitExpression(state, access.indices[0]!);
        emitIntLiteral(state, { kind: 'IntLiteral', value: lowerBound + k, line: access.line, column: access.column });
        emit(state, `    EQ`);
        emit(state, `    JZ ${next}`);
        emitInstanceCall(state, stmt, instanceAt(k));
        emit(state, `    JMP ${end}`);
        emit(state, `${next}:`);
    }
    emit(state, `${end}:`);
}

/** Text for the instance of a call, for messages and comments. */
function describeCallee(expr: Expression): string {
    switch (expr.kind) {
        case 'Identifier': return expr.name;
        case 'MemberAccess': return `${describeCallee(expr.object)}.${expr.member}`;
        case 'ArrayAccess': return `${describeCallee(expr.array)}[]`;
        default: return 'instance';
    }
}
