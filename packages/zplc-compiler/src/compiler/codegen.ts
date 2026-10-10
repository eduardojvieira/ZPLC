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
    FBParameter,
    NamedArgument,
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
    ArrayLiteral,
    ArrayRepeat,
    StructInitializer,
    InitialValue,
    PointerType,
} from './ast.ts';
import { getArrayElementCount, isArrayType, NameMap, sameName, VarSection } from './ast.ts';
import { CodegenError, codegenErrorFrom, orderedUniqueErrors } from './diagnostics.ts';
import type { CodegenWarning } from './diagnostics.ts';
import {
    getLoadStoreSuffix,
    buildSymbolTable,
    MemoryLayout,
    alignTo,
    parseStringType,
    typeToString as typeText,
} from './symbol-table.ts';
import type { SymbolTable, Symbol, MemberInfo, MethodInfo } from './symbol-table.ts';
import {
    getFn,
    getFB,
    type CodeGenContext,
    type MemberSize,
} from './stdlib/index.ts';
import { strappendHelper, strdelHelper, strfindHelper, strsubHelper } from './stdlib/strings.ts';
import type { StringCells } from './stdlib/strings.ts';
import {
    ADD64_LABEL,
    CMP64S_LABEL,
    CMP64U_LABEL,
    FCMP_LABEL,
    HELPERS,
    LITERAL_INT,
    MEMCPY_LABEL,
    MEMZERO_LABEL,
    WSTRCPY_LABEL,
    SUB64_LABEL,
    UDIV32_LABEL,
    UNKNOWN_TYPE,
    UNSIGNED_TO_REAL,
    cmp64Test,
    commonType,
    doubleWords,
    fcmpTest,
    floatBits,
    isFloatType,
    isIntegerLike,
    isUnsigned32,
    isWide,
    isWideInteger,
    numericInfo,
    numericTypeName,
    type CompareOp,
    type HelperName,
} from './numeric.ts';
import { POWF_LABEL } from './power.ts';
import { getRoutine } from './stdlib/routines.ts';
import { conversionResultType } from './stdlib/conversions.ts';
import { checkDeclaredTypes, checkRecursion } from './semantic.ts';

// ============================================================================
// Memory Layout Constants
// ============================================================================

/**
 * Size of the WORK region a caller gets when it gives a `workMemoryBase` and no `workMemorySize`: a window of
 * its own inside the WORK memory. A project is not built with it: all its programs share the whole WORK
 * memory of the target profile (CMP-043).
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
    /** Bytes of the WORK region the unit is allocated in; defaults to the target WORK capacity. */
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

    /**
     * Check every array index at run time and end the scan with a VM fault when it is outside the
     * bounds (CMP-023). On by default: a build that turns it off writes over the next variable instead.
     */
    arrayBoundsCheck?: boolean;

    /**
     * Receives what the generator accepted and wants the author to see, in source order (an integer value
     * stored in a narrower type: IMPLICIT_NARROWING). The build is not affected.
     */
    warnings?: CodegenWarning[];
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
    /** The `line:column` of the last source annotation emitted, or '0' after an end marker (for deduplication) */
    lastSourceKey: string;
    /**
     * The statements being generated, outermost first. A statement that holds others (IF, FOR...) has
     * instructions of its own after the nested ones; its position is annotated again there (CMP-055).
     */
    statementStack: Array<{ line: number; column: number; sourceRef?: string }>;
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
    /**
     * The function block whose body or method is being inlined: the block that declares the code that runs, which
     * is not always the type of the instance. SUPER^ and the access specifiers are relative to it (CMP-041).
     */
    currentBlock: string | null;
    /** Where RETURN jumps: the end of the function, inlined function block or inlined method; null in a program */
    returnLabel: string | null;
    memoryProfile: CompilerMemoryProfile;
    workMemorySize: number;
    /** The helper routines the program calls; they are appended after the main cycle. */
    helpers: Set<HelperName>;
    /** The errors of statements that could not be generated, in the order found (CMP-007). */
    errors: CodegenError[];
    /** Check array indices at run time (CMP-023). */
    arrayBoundsCheck: boolean;
    /** The warnings of the generation (see CodeGenOptions.warnings). */
    warnings: CodegenWarning[];
    /** Work memory the code generator took after the symbols: string buffers and the cells of the string routines. */
    scratchStrings: Array<{ address: number; size: number }>;
    /**
     * The string buffers of the program or function being generated: free again at the start of every
     * statement. Each POU has its own, so a buffer that is live while a function is called is never one
     * the function uses.
     */
    stringBuffers: Array<{ address: number; size: number; free: boolean }>;
    /** Depth of statements generated inside an expression (the body of an inlined method). */
    expressionDepth: number;
    /** WORK address of the result of each inlined method that returns a number, by `Block.Method`. */
    methodResultSlots: Map<string, number>;
    /** The result place of the method being inlined, when it returns a number; its assignments write it. */
    methodResult: Place | null;
    /** The source file of the declaration being generated: errors, warnings and source ranges are placed in it (CMP-042). */
    sourceRef: string | undefined;
    /** The files of the unit, in the order their statements are annotated; empty for a unit of one file. */
    sourceFiles: string[];
    /** The last method call expression left one value on the stack (a call used as a statement drops it). */
    methodLeftResult: boolean;
    /** Routines that need work cells of their own, by label; appended after the main cycle. */
    cellHelpers: Map<string, string[]>;
    /** The work cells the string routines share (none calls another). */
    stringCells: StringCells | null;
    /** A string the next function that returns a string writes its result into, instead of a work buffer. */
    resultBuffer: { address: number } | null;
    /** Characters the result of the string function being generated can hold at most, when that is known. */
    resultCapacity: number | null;
}

/**
 * Resolve a symbol name based on current context (Method, FB, Global).
 */
function resolveSymbol(state: CodeGenState, name: string): Symbol | undefined {
    // 1. Check Method Scope (Inputs, Outputs, Locals)
    if (state.currentMethod) {
        const method = state.currentMethod as any;
        
        // Helper to find var in lists
        const findVar = (list: any[]) => list && list.find((v: any) => sameName(v.name, name));

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

/**
 * A name inside the function being generated: its input, its local, its result (named like the function), or
 * undefined for a name that is not the function's to resolve (a global, a constant, a function block of the
 * library). null for a variable of a program: a function does not see those, as IEC 61131-3 says.
 */
function functionScopeSymbol(state: CodeGenState, name: string): Symbol | undefined | null {
    const func = state.currentFunction;
    if (!func || state.currentFBInstance) return undefined;
    const own = state.symbols.getDeclared(`${func.name}.${name}`);
    if (own) return own;
    const outer = state.symbols.getDeclared(name);
    return outer?.owner !== undefined ? null : undefined;
}

/** The offsets of the members of a function block or structure type (user-defined or library), or null for any other type. */
function memberOffsets(state: CodeGenState, typeName: unknown): Map<string, number> | null {
    if (typeof typeName !== 'string') return null;
    const user = state.symbols.getFBDefinition(typeName) ?? state.symbols.getStructDefinition(typeName);
    if (user) return new NameMap([...user.members].map(([member, info]) => [member, info.offset] as const));
    const library = getFB(typeName as DataTypeValue);
    return library ? new NameMap(library.members.map((member) => [member.name, member.offset] as const)) : null;
}

/**
 * Generate ZPLC assembly from a parsed unit (CompilationUnit or Program).
 *
 * @param unit - Parsed AST unit
 * @param options - Optional code generation configuration
 * @returns Assembly source code
 */
export function generate(unit: CompilationUnit | Program, options?: CodeGenOptions): string {
    return generateProject(unit, options).assembly;
}

/**
 * What the generation of a unit gives: the assembly, and what the debug map needs from the same layout the
 * code was generated with (CMP-054): the symbol table, and where the code of each program starts.
 */
export interface GeneratedProject {
    assembly: string;
    symbols: SymbolTable;
    /** The programs of the unit in the order their code is generated, with their lines of the assembly. */
    programs: Array<{ name: string; sourceRef?: string; entryLabel: string; assembly: string }>;
}

/**
 * Generate ZPLC assembly for a unit of one file or of a whole project (CMP-042): one program per task entry,
 * the functions, the function blocks and the memory shared by all of them.
 */
export function generateProject(unit: CompilationUnit | Program, options?: CodeGenOptions): GeneratedProject {
    // Statements that cannot be generated are recorded and generation goes on, so one build reports every
    // independent error (CMP-007); the first is thrown with all of them in `errors`.
    const found: CodegenError[] = [];
    let project: GeneratedProject | undefined;
    try {
        project = generateUnit(unit, options, found);
    } catch (caught) {
        const where = unit.kind === 'CompilationUnit' ? (unit.programs[0] ?? unit) : unit;
        const error = codegenErrorFrom(caught, where);
        if (error === null) throw caught;
        // an error that names no file is the one of the first program's
        for (const each of error.errors) if (each.sourceRef === undefined && where.sourceRef !== undefined) each.sourceRef = where.sourceRef;
        found.push(...error.errors);
    }
    if (found.length === 0) {
        // source order, whatever the order the program organisation units were generated in
        options?.warnings?.sort((first, second) => first.line - second.line || first.column - second.column);
        return project!;
    }
    const errors = orderedUniqueErrors(found);
    const first = errors[0]!;
    first.errors = errors;
    throw first;
}

function generateUnit(unit: CompilationUnit | Program, options: CodeGenOptions | undefined, errors: CodegenError[]): GeneratedProject {
    const workMemoryBase = options?.workMemoryBase ?? MemoryLayout.WORK_BASE;
    const memoryProfile = validateCompilerMemoryProfile(options?.memoryProfile ?? DEFAULT_COMPILER_MEMORY_PROFILE);
    const workMemorySize = options?.workMemorySize
        ?? (options?.workMemoryBase !== undefined ? WORK_MEMORY_REGION_SIZE : memoryProfile.workSize);
    const initFlagAddr = options?.initFlagAddress ??
        workMemoryBase + workMemorySize - 1;

    validateWorkRegionOptions(workMemoryBase, workMemorySize, initFlagAddr, memoryProfile);

    // A name that is no type is an error of the declaration, not a variable of no size (CMP-003)
    const typeErrors = checkDeclaredTypes(unit);
    if (typeErrors.length > 0) {
        typeErrors[0]!.errors = typeErrors;
        throw typeErrors[0]!;
    }

    // A function that calls itself is an error at the call; the rest of the unit is still generated, so
    // that its errors are reported in the same build (CMP-007)
    if (unit.kind === 'CompilationUnit') errors.push(...checkRecursion(unit));

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
        lastSourceKey: '',
        statementStack: [],
        emitSourceAnnotations: options?.emitSourceAnnotations ?? false,
        functionTable: new NameMap(),
        functionBlockTable: new NameMap(),
        currentFunction: null,
        currentFBInstance: null,
        currentMethod: null,
        currentBlock: null,
        returnLabel: null,
        memoryProfile,
        workMemorySize,
        helpers: new Set(),
        errors,
        arrayBoundsCheck: options?.arrayBoundsCheck ?? true,
        warnings: options?.warnings ?? [],
        scratchStrings: [],
        stringBuffers: [],
        expressionDepth: 0,
        methodResultSlots: new Map(),
        methodResult: null,
        sourceRef: undefined,
        sourceFiles: unit.kind === 'CompilationUnit' && (unit.sourceFiles?.length ?? 0) > 1 ? [...unit.sourceFiles!] : [],
        methodLeftResult: false,
        cellHelpers: new Map(),
        stringCells: null,
        resultBuffer: null,
        resultCapacity: null,
    };
    // inside a function its own variables are in scope, and no variable of a program (CMP-034); inside an
    // inlined function block, its members (and the instances declared in it)
    symbols.scopeResolver = (name) => {
        const inFunction = functionScopeSymbol(state, name);
        if (inFunction !== undefined) return inFunction;
        const member = fbScopeSymbol(state, name);
        if (member !== undefined) return member;
        // a function block sees its members and the globals, never the variables of the program that calls it
        return state.currentFBInstance ? state.symbols.getGlobal(name) ?? null : undefined;
    };

    const isUnit = unit.kind === 'CompilationUnit';
    const mainProgram = isUnit ? (unit as CompilationUnit).programs[0] : (unit as Program);

    if (!mainProgram) {
        throw new CodegenError('No program found', 1, 1);
    }

    // First pass: collect string literals
    if (isUnit) {
        collectUnitStringLiterals(state, unit as CompilationUnit);
    } else {
        collectStringLiterals(state, mainProgram);
    }

    validateStringLiteralPool(state, workMemoryBase, workMemorySize);

    // Emit header
    emit(state, `; ============================================================================`);
    emit(state, `; ZPLC Generated Assembly`);
    emit(state, `; Program: ${(isUnit ? (unit as CompilationUnit).programs : [mainProgram]).map((program) => program.name).join(', ')}`);
    if (options?.workMemoryBase !== undefined) {
        emit(state, `; Work Memory Base: ${formatAddress(workMemoryBase)}`);
        emit(state, `; Init Flag: ${formatAddress(initFlagAddr)}`);
    }
    emit(state, `; ============================================================================`);
    emit(state, ``);

    // Memory map
    emitMemoryMap(state, isUnit ? (unit as CompilationUnit).programs.length : 1);

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

        // A function may be called from the ones declared before it: they are all known first (CMP-035)
        for (const func of cu.functions) {
            state.functionTable.set(func.name, { label: `func_${func.name}`, returnType: func.returnType, inputs: func.inputs });
        }

        // Generate User Functions: once for the whole unit, whichever programs call them (CMP-042)
        for (const func of cu.functions) {
            inFile(state, func.sourceRef, () => generateFunctionDecl(state, func));
        }
    }

    // The first-scan initialisation of the unit: the literal pool first, the variable initialisers copy from it.
    // A unit of one program carries it in its entry; a unit of several has it once, as a routine every entry
    // calls, so that whichever task runs first initialises everything and nothing is initialised twice.
    const programs = isUnit ? (unit as CompilationUnit).programs : [mainProgram];
    const shared = programs.length > 1;
    const code = state.output;
    state.output = [];
    emitStringLiteralInit(state);

    // the initial values of the RETAIN variables of the globals and of the programs share one guard
    const retained: VarDecl[] = [];
    if (isUnit) {
        emitGlobalInitialization(state, unit as CompilationUnit, retained);
        for (const prog of programs) {
            symbols.programScope = prog.name;
            inFile(state, prog.sourceRef, () => emitInitialization(state, prog, retained));
        }
        symbols.programScope = null;
    } else {
        emitInitialization(state, mainProgram, retained);
    }
    emitRetainedInitialization(state, retained);
    const initialization = state.output;
    state.output = code;

    const entries: GeneratedProject['programs'] = [];
    const starts: number[] = [];
    programs.forEach((program, index) => {
        const entryLabel = index === 0 ? '_start' : `_start_${program.name}`;
        const cycleLabel = index === 0 ? '_cycle' : `_cycle_${program.name}`;
        starts.push(state.output.length);
        entries.push({ name: program.name, sourceRef: program.sourceRef, entryLabel, assembly: '' });

        // Emit program entry
        if (shared) {
            emit(state, ``);
            emit(state, `; === Memory Map: ${program.name} ===`);
            for (const sym of symbols.all()) {
                if (sym.owner === program.name) emitMemoryMapEntry(state, sym);
            }
        }
        emit(state, `; === Program Entry${shared ? `: ${program.name}` : ''} ===`);
        emit(state, `${entryLabel}:`);

        // Initialization check
        emit(state, `    ; Check if already initialized`);
        emit(state, `    LOAD8 ${formatAddress(state.initFlagAddr)}    ; _initialized flag`);
        emit(state, `    JNZ ${cycleLabel}                  ; Skip init if already done`);

        if (shared) {
            emit(state, `    CALL _zplc_init`);
        } else {
            state.output.push(...initialization);
        }

        emit(state, ``);
        emit(state, `    ; Mark as initialized`);
        emit(state, `    PUSH8 1`);
        emit(state, `    STORE8 ${formatAddress(state.initFlagAddr)}`);

        emit(state, ``);
        emit(state, `; === Main Cycle${shared ? `: ${program.name}` : ''} ===`);
        emit(state, `${cycleLabel}:`);

        // Emit statements for the program; its variables are the ones its name stands for
        state.symbols.programScope = program.name;
        state.sourceRef = program.sourceRef;
        for (const stmt of program.statements) {
            emitStatement(state, stmt);
        }
        state.symbols.programScope = null;
        state.sourceRef = undefined;

        emitSourceEnd(state);
        emit(state, ``);
        emit(state, `    ; End of cycle`);
        emit(state, `    HALT`);
    });

    if (shared) {
        emit(state, ``);
        emit(state, `; --- Initialization of the unit (called by the entry of every program) ---`);
        emit(state, `_zplc_init:`);
        state.output.push(...initialization);
        emit(state, `    RET`);
    }

    // The work buffers the string functions took came after the literal pool was checked
    validateStringLiteralPool(state, workMemoryBase, workMemorySize);

    // Routines the program called, reachable only through CALL
    for (const helper of HELPERS) {
        if (!state.helpers.has(helper.name)) continue;
        emit(state, ``);
        emit(state, `; --- Helper: ${helper.title} ---`);
        state.output.push(...helper.lines);
    }
    for (const [label, lines] of state.cellHelpers) {
        emit(state, ``);
        emit(state, `; --- Helper: ${label} ---`);
        state.output.push(...lines);
    }

    // the code of each program: from its entry to the next one; the first also holds what comes before it
    // (the header, the functions) and the last what comes after (the routines)
    entries.forEach((entry, index) => {
        const from = index === 0 ? 0 : starts[index]!;
        const to = index + 1 < entries.length ? starts[index + 1]! : state.output.length;
        entry.assembly = state.output.slice(from, to).join('\n');
    });

    return { assembly: state.output.join('\n'), symbols, programs: entries };
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
 * Run `action` with `file` as the file of the declaration being generated (CMP-042). An error that leaves it
 * without a file is placed in that one; the file of the caller is back when it ends.
 */
function inFile<T>(state: CodeGenState, file: string | undefined, action: () => T): T {
    const previous = state.sourceRef;
    if (file !== undefined) state.sourceRef = file;
    try {
        return action();
    } catch (caught) {
        if (caught instanceof CodegenError) {
            for (const each of caught.errors) if (each.sourceRef === undefined && state.sourceRef !== undefined) each.sourceRef = state.sourceRef;
        }
        throw caught;
    } finally {
        state.sourceRef = previous;
    }
}

/**
 * Emit a source annotation comment: the statement at `at` starts here, and owns every instruction up to the
 * next annotation (CMP-055). The assembler attaches it to the next instruction, so one `; @source`
 * line becomes one range of the debug map. The same position is not annotated twice in a row.
 */
function emitSourceAnnotation(state: CodeGenState, at: { line: number; column: number; sourceRef?: string } | undefined): void {
    if (!state.emitSourceAnnotations || !at || !at.line) return;
    // in a project of several files the annotation names the file, so that a range of an inlined block
    // is placed in the file of the block and not in the one of the program that calls it (CMP-042)
    const file = state.sourceFiles.length > 0 ? state.sourceFiles.indexOf(at.sourceRef ?? state.sourceRef ?? '') : -1;
    const key = `${at.line}:${at.column}:${file}`;
    if (key === state.lastSourceKey) return;
    state.lastSourceKey = key;
    emit(state, `    ; @source ${at.line}${at.column > 0 ? `:${at.column}` : ''}${file >= 0 ? ` @${file}` : ''}`);
}

/**
 * Close the range of the statement that was being generated: what follows (the end of the cycle, the
 * return of a function) belongs to no statement. Line 0 is how an annotation says so.
 */
function emitSourceEnd(state: CodeGenState): void {
    if (!state.emitSourceAnnotations || state.lastSourceKey === '0') return;
    state.lastSourceKey = '0';
    emit(state, `    ; @source 0`);
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

function emitMemoryMap(state: CodeGenState, programs: number): void {
    emit(state, `; === Memory Map ===`);

    // Document the reserved init flag
    emit(state, `; ${formatAddress(state.initFlagAddr)}: _initialized (BOOL, 1 byte) [RESERVED]`);

    // a unit of several programs lists here what is shared; the variables of each program come with its entry
    for (const sym of state.symbols.all()) {
        if (programs > 1 && sym.owner !== undefined) continue;
        emitMemoryMapEntry(state, sym);
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

function emitMemoryMapEntry(state: CodeGenState, sym: Symbol): void {
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

/** One thing that takes WORK memory: a variable or instance (named as the program sees it), a pool, a set of buffers. */
interface WorkConsumer {
    name: string;
    size: number;
}

/**
 * The failure of an allocation (CMP-043): the bytes the unit needs, the bytes the target profile has, and the
 * three largest consumers, so the author knows what to shrink. The WORK memory is the one of the target
 * profile, shared by every program of the project; one byte of it is the initialization flag.
 */
function workBudgetError(required: number, available: number, consumers: WorkConsumer[], at: { line: number; column: number; sourceRef?: string }): TagAdmissionError {
    const largest = [...consumers].sort((first, second) => second.size - first.size || (first.name < second.name ? -1 : 1)).slice(0, 3);
    const names = largest.map((consumer) => `${consumer.name} (${consumer.size} bytes)`).join(', ');
    const error = new TagAdmissionError(
        `WORK allocation exceeds the target memory profile: ${required} bytes required, ${available} bytes available `
        + `(the WORK memory of the target profile, one byte of it the initialization flag). Largest consumers: ${names || 'none'}`,
        at.line, at.column,
    );
    if (at.sourceRef !== undefined) error.sourceRef = at.sourceRef;
    return error;
}

/** The variables and instances that take automatic WORK memory, named as the author wrote them. */
function workConsumers(symbols: SymbolTable): WorkConsumer[] {
    return symbols.all()
        .filter((symbol) => symbol.ioAddress === null && !symbol.retain && symbol.size > 0)
        .map((symbol) => ({ name: symbol.owner === undefined ? symbol.name : `${symbol.owner}.${symbol.name}`, size: symbol.size }));
}

function validateWorkSymbols(symbols: SymbolTable, workMemoryBase: number, workMemorySize: number, initFlagAddr: number, retainSize: number = MEMORY_REGION.RETAIN.size): void {
    const workEnd = workMemoryBase + workMemorySize;
    // the last byte of the region is the initialization flag: variables end before it (CMP-043)
    const limit = initFlagAddr === workEnd - 1 ? initFlagAddr : workEnd;
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
        } else if (symbol.address < workMemoryBase || symbolEnd > limit) {
            // the variables of the whole unit, in the order they were allocated, from the start of the region
            const required = symbols.getWorkBase() + symbols.getWorkOffset() - workMemoryBase + 1;
            throw workBudgetError(required, workMemorySize, workConsumers(symbols),
                { line: symbol.declarationLine ?? 0, column: 0, sourceRef: symbol.sourceRef });
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
    const limit = state.initFlagAddr === workEnd - 1 ? state.initFlagAddr : workEnd;
    const directlyLocatedSymbols = state.symbols.all().filter(symbol => symbol.ioAddress?.type === 'M');
    const pooled = [
        ...state.stringLiterals,
        ...state.scratchStrings,
    ];
    // the literals and the buffers of the string functions come after the variables, in the same region
    if (!Number.isSafeInteger(state.stringLiteralNextAddr) || state.stringLiteralNextAddr > limit) {
        const consumers = workConsumers(state.symbols);
        const literals = state.stringLiterals.reduce((total, literal) => total + literal.size, 0);
        const buffers = state.scratchStrings.reduce((total, buffer) => total + buffer.size, 0);
        if (literals > 0) consumers.push({ name: 'string literals', size: literals });
        if (buffers > 0) consumers.push({ name: 'work buffers of the string functions', size: buffers });
        throw workBudgetError(state.stringLiteralNextAddr - workMemoryBase + 1, workMemorySize, consumers, { line: 0, column: 0 });
    }
    for (const literal of pooled) {
        const literalEnd = literal.address + literal.size;
        if (!Number.isSafeInteger(literalEnd)
            || literal.address < workMemoryBase
            || literalEnd > workEnd) {
            throw workBudgetError(literalEnd - workMemoryBase + 1, workMemorySize, workConsumers(state.symbols), { line: 0, column: 0 });
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
        collectStringLiteralsInDeclarations(state, block.variables);
    }

    // Visit all statements
    for (const stmt of program.statements) {
        collectStringLiteralsInStatement(state, stmt);
    }
}

/** The literals a declaration initialises a variable with, however deep in an array or a structure value. */
function collectStringLiteralsInInitializer(state: CodeGenState, value: InitialValue | ArrayRepeat): void {
    switch (value.kind) {
        case 'ArrayLiteral':
            for (const element of value.elements) collectStringLiteralsInInitializer(state, element);
            break;
        case 'ArrayRepeat':
            collectStringLiteralsInInitializer(state, value.value);
            break;
        case 'StructInitializer':
            for (const field of value.fields) collectStringLiteralsInInitializer(state, field.value);
            break;
        default:
            collectStringLiteralsInExpression(state, value);
    }
}

function collectStringLiteralsInDeclarations(state: CodeGenState, declarations: VarDecl[]): void {
    for (const decl of declarations) {
        if (decl.initialValue) collectStringLiteralsInInitializer(state, decl.initialValue);
    }
}

/** Every literal of the unit: globals, structure defaults, functions, function blocks, methods and programs. */
function collectUnitStringLiterals(state: CodeGenState, unit: CompilationUnit): void {
    for (const type of unit.typeDefinitions ?? []) {
        if (type.kind === 'StructDecl') collectStringLiteralsInDeclarations(state, type.members);
    }
    for (const block of unit.globalVars) {
        collectStringLiteralsInDeclarations(state, block.variables);
    }
    for (const func of unit.functions) {
        collectStringLiteralsInDeclarations(state, [...func.inputs, ...func.locals]);
        for (const stmt of func.body) collectStringLiteralsInStatement(state, stmt);
    }
    for (const fb of unit.functionBlocks) {
        collectStringLiteralsInDeclarations(state, [...fb.inputs, ...fb.outputs, ...fb.inouts, ...fb.locals]);
        for (const stmt of fb.body) collectStringLiteralsInStatement(state, stmt);
        for (const method of fb.methods) {
            collectStringLiteralsInDeclarations(state, [...method.inputs, ...method.outputs, ...method.locals]);
            for (const stmt of method.body) collectStringLiteralsInStatement(state, stmt);
        }
    }
    for (const prog of unit.programs) {
        collectStringLiterals(state, prog);
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
                collectStringLiteralsInInitializer(state, element);
            }
            break;
        case 'ReferenceExpr':
            collectStringLiteralsInExpression(state, expr.operand);
            break;
        case 'DereferenceExpr':
            collectStringLiteralsInExpression(state, expr.operand);
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

// ============================================================================
// Initialisation (CMP-025, CMP-026, CMP-027)
//
// Every variable holds its declared initial value, or the default of its type, at the
// first scan: the variables of the program, the globals, the members of every function
// block instance and structure, every array element. A function local, a VAR_TEMP and a
// method local get theirs again on every call, so a function holds no state.
// ============================================================================

interface InitOptions {
    /** Clear what has no declared value too (a function local, a VAR_TEMP): they are written on every call. */
    everyCall: boolean;
}

/** Whether a value of this type holds something other than zero before the program writes to it. */
function hasNonZeroDefault(state: CodeGenState, type: STDataType | ArrayType): boolean {
    const t = storedType(state, type);
    if (isStringType(t) || isPointerType(t) || isInterfaceType(state, t)) return true;
    if (isArrayType(t as STDataType)) return hasNonZeroDefault(state, (t as ArrayType).elementType);
    if (typeof t !== 'string') return false;
    const members = state.symbols.getStructDefinition(t)?.members ?? state.symbols.getFBDefinition(t)?.members;
    if (!members) return false;
    for (const member of members.values()) {
        if (member.section === VarSection.VAR_IN_OUT || member.initialValue || hasNonZeroDefault(state, member.dataType)) return true;
    }
    return false;
}

/** Fill `count` elements of `stride` bytes from `address` with the value `emitValue` leaves, in a loop. */
function emitFillLoop(state: CodeGenState, address: number, count: number, stride: number,
                      width: '8' | '16' | '32', emitValue: () => void): void {
    const loop = newLabel(state, 'fill_loop');
    const done = newLabel(state, 'fill_done');
    emitPushInteger(state, address);
    emitPushInteger(state, count);
    emit(state, `${loop}:                         ; [pointer count]`);
    emit(state, `    DUP`);
    emit(state, `    JZ ${done}`);
    emit(state, `    OVER`);
    emitValue();
    emit(state, `    STOREI${width}`);
    emit(state, `    SWAP`);
    emitPushInteger(state, stride);
    emit(state, `    ADD`);
    emit(state, `    SWAP`);
    emit(state, `    PUSH8 1`);
    emit(state, `    SUB`);
    emit(state, `    JMP ${loop}`);
    emit(state, `${done}:`);
    emit(state, `    DROP`);
    emit(state, `    DROP`);
}

type ElementInit = Expression | StructInitializer;

/** The values of an array initialiser in element order: repeat counts expanded, nested brackets flattened. */
function flattenArrayInitializer(literal: ArrayLiteral, out: Array<{ value: ElementInit; repeat: number }>): void {
    for (const element of literal.elements) {
        if (element.kind === 'ArrayRepeat') {
            const repeated = (element as ArrayRepeat).value;
            if (repeated.kind === 'ArrayLiteral') {
                for (let i = 0; i < (element as ArrayRepeat).count; i++) flattenArrayInitializer(repeated, out);
            } else {
                out.push({ value: repeated as ElementInit, repeat: (element as ArrayRepeat).count });
            }
        } else if (element.kind === 'ArrayLiteral') {
            flattenArrayInitializer(element, out);
        } else {
            out.push({ value: element as ElementInit, repeat: 1 });
        }
    }
}

/** A string literal must fit the capacity of the variable it initialises or is assigned to (CMP-021). */
function checkStringFits(literal: StringLiteral | WStringLiteral, type: unknown, name: string): void {
    const text = parseStringType(type);
    if (text && literal.value.length > text.capacity) {
        fail(literal, `String literal of ${literal.value.length} characters does not fit '${name}' (${typeText(type)} holds ${text.capacity})`);
    }
}

/**
 * Write the declared initial value of the storage at the fixed `address` (see InitOptions).
 * `init` is the value the declaration gives, or null.
 */
function emitInitValue(state: CodeGenState, address: number, type: STDataType | ArrayType,
                       init: InitialValue | null | undefined, at: { line: number; column: number },
                       name: string, options: InitOptions): void {
    const t = storedType(state, type);

    if (isArrayType(t as STDataType)) {
        emitArrayInit(state, address, t as ArrayType, init, at, name, options);
        return;
    }

    const text = parseStringType(t);
    if (text) {
        // The capacity is part of the value: STRCPY and every string function read it.
        emit(state, `    PUSH16 ${text.capacity}`);
        emit(state, `    STORE16 ${formatAddress(address + 2)}   ; ${name} capacity`);
        if (init && init.kind === 'StringLiteral' && !text.wide) {
            checkStringFits(init, t, name);
            emit(state, `    PUSH16 ${formatAddress(findStringLiteralAddress(state, init.value) ?? fail(init, `String literal not found in pool: '${init.value}'`))}`);
            emit(state, `    PUSH16 ${formatAddress(address)}`);
            emit(state, `    STRCPY              ; ${name} := '${init.value.substring(0, 20)}'`);
        } else if (init && init.kind === 'WStringLiteral' && text.wide) {
            checkStringFits(init, t, name);
            emit(state, `    PUSH16 ${init.value.length}`);
            emit(state, `    STORE16 ${formatAddress(address)}`);
            for (let i = 0; i < init.value.length; i++) {
                emit(state, `    PUSH16 ${init.value.charCodeAt(i)}`);
                emit(state, `    STORE16 ${formatAddress(address + 4 + i * 2)}`);
            }
            emit(state, `    PUSH16 0`);
            emit(state, `    STORE16 ${formatAddress(address + 4 + init.value.length * 2)}`);
        } else if (init) {
            fail(at, `'${name}' of type ${typeText(t)} cannot be initialised with ${stringifyExpression(init as Expression)}`);
        } else if (options.everyCall) {
            emit(state, `    PUSH16 0`);
            emit(state, `    STORE16 ${formatAddress(address)}   ; ${name} := ''`);
            emit(state, text.wide ? `    PUSH16 0` : `    PUSH8 0`);
            emit(state, `    STORE${text.wide ? 16 : 8} ${formatAddress(address + 4)}`);
        }
        return;
    }

    // a variable of an interface type refers to no instance until one is assigned
    if (isInterfaceType(state, t)) {
        if (init) fail(at, `'${name}' of the interface type ${typeText(t)} is given an instance by assignment, not by an initial value`);
        emit(state, `    ; ${name} := NULL`);
        emit(state, `    PUSH16 ${NULL_REFERENCE}   ; NULL: no instance`);
        emit(state, `    STORE32 ${formatAddress(address)}`);
        return;
    }

    if (isPointerType(t)) {
        emit(state, `    ; ${name} := ${init ? '...' : 'NULL'}`);
        if (init) {
            checkReferenceValue(state, t, init as Expression, name);
            emitReferenceValue(state, t, init as Expression);
        } else {
            emit(state, `    PUSH16 ${NULL_REFERENCE}   ; NULL: no memory region contains it`);
        }
        emit(state, `    STORE32 ${formatAddress(address)}`);
        return;
    }

    if (typeof t === 'string') {
        const struct = state.symbols.getStructDefinition(t);
        const fb = struct ? undefined : state.symbols.getFBDefinition(t);
        const members = struct?.members ?? fb?.members;
        if (members) {
            if (init && init.kind !== 'StructInitializer') {
                fail(at, `'${name}' of type ${t} needs an initialiser of the form (member := value, ...)`);
            }
            const fields = init && init.kind === 'StructInitializer' ? init.fields : [];
            for (const field of fields) {
                if (!members.has(field.name)) fail(field, `Unknown member '${field.name}' on '${t}'`);
            }
            if (options.everyCall && !hasNonZeroDefault(state, t)) {
                emitZeroBytes(state, address, state.symbols.sizeOf(t));
                return;
            }
            if (options.everyCall) emitZeroBytes(state, address, state.symbols.sizeOf(t));
            for (const [memberName, member] of members) {
                const given = fields.find((field) => sameName(field.name, memberName));
                const memberInit = given ? given.value : member.initialValue ?? null;
                const memberAt = given ?? at;
                if (member.section === VarSection.VAR_IN_OUT) {
                    // not bound yet: a null reference, so the body faults instead of touching address 0
                    emit(state, `    PUSH16 ${NULL_REFERENCE}`);
                    emit(state, `    STORE32 ${formatAddress(address + member.offset)}   ; ${name}.${memberName} unbound`);
                    continue;
                }
                if (member.section === VarSection.VAR_TEMP && !options.everyCall) continue; // written on each call
                if (!memberInit && !hasNonZeroDefault(state, member.dataType)) continue;
                emitInitValue(state, address + member.offset, member.dataType, memberInit, memberAt,
                    `${name}.${memberName}`, { everyCall: false });
            }
            return;
        }

        if (state.symbols.isFBType(t)) {
            // a standard function block: its state is zero
            if (options.everyCall) emitZeroBytes(state, address, state.symbols.sizeOf(t));
            return;
        }
    }

    // a scalar
    if (init) {
        if (init.kind === 'ArrayLiteral' || init.kind === 'StructInitializer') {
            fail(at, `'${name}' of type ${typeText(t)} cannot be initialised with ${init.kind === 'ArrayLiteral' ? 'an array' : 'a structure'} value`);
        }
        emit(state, `    ; ${name} := ...`);
        emitValueFor(state, init as Expression, t);
        emit(state, `    STORE${getLoadStoreSuffix(t as DataTypeValue)} ${formatAddress(address)}`);
    } else if (options.everyCall) {
        emit(state, `    ; ${name} := 0`);
        const width = getLoadStoreSuffix(t as DataTypeValue);
        if (width === '64') emit(state, `    PUSH32 0`);
        emit(state, `    PUSH32 0`);
        emit(state, `    STORE${width} ${formatAddress(address)}`);
    }
}

function emitArrayInit(state: CodeGenState, address: number, type: ArrayType,
                       init: InitialValue | null | undefined, at: { line: number; column: number },
                       name: string, options: InitOptions): void {
    const elementType = type.elementType;
    const stride = state.symbols.sizeOf(elementType);
    const count = getArrayElementCount(type);

    if (init && init.kind !== 'ArrayLiteral') {
        fail(at, `Array '${name}' needs an initialiser in brackets: [value, ...]`);
    }

    if (options.everyCall) emitZeroBytes(state, address, stride * count);

    const items: Array<{ value: ElementInit; repeat: number }> = [];
    if (init && init.kind === 'ArrayLiteral') flattenArrayInitializer(init, items);
    const given = items.reduce((n, item) => n + item.repeat, 0);
    if (given > count) {
        fail(init as { line: number; column: number }, `Too many initial values for '${name}': ${given} given, it has ${count} elements`);
    }

    const scalar = !isArrayType(elementType as STDataType) && !isStringType(storedType(state, elementType))
        && !isAggregateType(state, storedType(state, elementType));
    let index = 0;
    for (const item of items) {
        const start = index;
        const width = scalar && !isPointerType(storedType(state, elementType)) ? getLoadStoreSuffix(storedType(state, elementType) as DataTypeValue) : null;
        // many equal scalars: one loop instead of one store each
        if (item.repeat >= 8 && width !== null && width !== '64' && item.value.kind !== 'StructInitializer') {
            const value = item.value;
            emit(state, `    ; ${name}[${start}..${start + item.repeat - 1}] := ...`);
            emitFillLoop(state, address + start * stride, item.repeat, stride, width, () => emitValueFor(state, value, storedType(state, elementType)));
            index += item.repeat;
            continue;
        }
        for (let r = 0; r < item.repeat; r++) {
            emitInitValue(state, address + index * stride, elementType, item.value, item.value, `${name}[${index}]`, { everyCall: false });
            index++;
        }
    }

    // the elements nothing was given for still hold a default that is not zero (a string's capacity, a null reference)
    if (index < count && hasNonZeroDefault(state, elementType)) {
        const elementText = storedType(state, elementType);
        if (isPointerType(elementText)) {
            emit(state, `    ; ${name}[${index}..${count - 1}] := NULL`);
            emitFillLoop(state, address + index * stride, count - index, stride, '32', () => emit(state, `    PUSH16 ${NULL_REFERENCE}`));
        } else {
            for (; index < count; index++) {
                emitInitValue(state, address + index * stride, elementType, null, at, `${name}[${index}]`, { everyCall: false });
            }
        }
    }

}

/** The variable of a retained declaration: found when its program is in scope, used when the guard is emitted. */
const retainedSymbol = new WeakMap<VarDecl, Symbol>();

/** First-scan initialisation of a list of declarations (a program's variables, a block of globals). */
function emitDeclarationInitialization(state: CodeGenState, declarations: VarDecl[], retained: VarDecl[]): void {
    let hasInit = false;

    for (const decl of declarations) {
        const sym = state.symbols.get(decl.name);
        if (!sym) continue;
        if (!decl.initialValue && !hasNonZeroDefault(state, sym.dataType)) continue;
        // a retained variable is initialised apart, only when the retentive region holds no saved state (CMP-029)
        if (sym.retain) {
            retained.push(decl);
            retainedSymbol.set(decl, sym);
            continue;
        }

        if (!hasInit) {
            emit(state, ``);
            emit(state, `    ; --- Variable Initialization ---`);
            hasInit = true;
        }

        const isLocatedBit = sym.dataType === 'BOOL' && sym.ioAddress &&
            (sym.ioAddress.size === 'X' || sym.ioAddress.bitOffset !== undefined);
        if (isLocatedBit && decl.initialValue) {
            // a bit of a byte: read-modify-write
            emit(state, `    ; ${decl.name} := ...`);
            emitValueFor(state, decl.initialValue as Expression, sym.dataType);
            emitStore(state, sym);
            continue;
        }

        emitInitValue(state, sym.address, sym.dataType, decl.initialValue, decl, decl.name, { everyCall: false });
    }
}

function emitInitialization(state: CodeGenState, program: Program, retained: VarDecl[]): void {
    emitDeclarationInitialization(state, program.varBlocks.flatMap((block) => block.variables), retained);
}

/** The VAR_GLOBAL blocks hold their declared values at the first scan too (CMP-025). */
function emitGlobalInitialization(state: CodeGenState, unit: CompilationUnit, retained: VarDecl[]): void {
    for (const block of unit.globalVars) {
        inFile(state, block.sourceRef, () => emitDeclarationInitialization(state, block.variables, retained));
    }
}

/**
 * The initial values of the VAR RETAIN variables (CMP-029): applied when the first byte of the retentive region
 * is zero, then that byte is set. The runtime saves the region with the byte, and restores both together
 * (RT-025), so a restored region keeps its values and a region that was never saved, or whose layout changed,
 * which the runtime clears, gets the declared ones.
 */
function emitRetainedInitialization(state: CodeGenState, retained: VarDecl[]): void {
    if (retained.length === 0) return;

    const marker = formatAddress(MemoryLayout.RETAIN_BASE);
    const restored = newLabel(state, 'retain_restored');
    emit(state, ``);
    emit(state, `    ; --- RETAIN Initialization (skipped when the retentive region holds a saved state) ---`);
    emit(state, `    LOAD8 ${marker}`);
    emit(state, `    JNZ ${restored}`);
    for (const decl of retained) {
        const sym = retainedSymbol.get(decl)!;
        inFile(state, decl.sourceRef, () => emitInitValue(state, sym.address, sym.dataType, decl.initialValue, decl, decl.name, { everyCall: false }));
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

    const returnType = state.symbols.effectiveType(func.returnType);
    if (isArrayType(returnType as STDataType) || (typeof returnType === 'string' && isAggregateType(state, returnType))) {
        fail(func, `Function '${func.name}' returns ${typeText(returnType)}: a function can return an elementary value or a string, not a structure, function block or array`);
    }

    state.currentFunction = func;
    state.returnLabel = newLabel(state, 'func_return');
    // the function has string buffers of its own
    const callerBuffers = state.stringBuffers;
    state.stringBuffers = [];

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
            const type = storedType(state, sym.dataType);
            if (isStringType(type)) {
                // the caller passed the address of its string: copy it, the parameter is a value
                emit(state, `    PUSH16 ${parseStringType(type)!.capacity}`);
                emit(state, `    STORE16 ${formatAddress(sym.address + 2)}`);
                emit(state, `    PUSH16 ${formatAddress(sym.address)}`);
                emit(state, `    STRCPY`);
            } else if (isAggregateType(state, type)) {
                // the caller passed the address of its structure or array: copy it
                emitPushInteger(state, sym.address);
                emit(state, `    SWAP`);
                emitCopyBytes(state, sym.size, null, null);
            } else {
                emitStore(state, sym);
            }
        }
    }

    // Locals and the result start from their declared value on every call: a function holds no state (CMP-027)
    for (const local of func.locals) {
        // a VAR_EXTERNAL is a global: it keeps its value between calls
        if (local.section === VarSection.VAR_EXTERNAL) continue;
        const sym = state.symbols.get(local.name);
        if (sym) emitInitValue(state, sym.address, sym.dataType, local.initialValue, local, local.name, { everyCall: true });
    }
    const resultSym = state.symbols.get(func.name);
    if (resultSym) emitInitValue(state, resultSym.address, resultSym.dataType, null, func, func.name, { everyCall: true });

    // Emit body statements
    for (const stmt of func.body) {
        emitStatement(state, stmt);
    }

    // RETURN lands here; load return value (stored in the variable named func.name) onto stack
    emitSourceEnd(state);
    emit(state, `${state.returnLabel}:`);
    const returnSym = state.symbols.get(func.name);
    if (returnSym && isStringType(storedType(state, returnSym.dataType))) {
        // a string result goes back by address; the caller copies it out before the next call
        emit(state, `    ; Push return value (the address of the string)`);
        emit(state, `    PUSH16 ${formatAddress(returnSym.address)}`);
    } else if (returnSym) {
        emit(state, `    ; Push return value`);
        const suffix = getLoadStoreSuffix(storedType(state, returnSym.dataType) as DataTypeValue);
        emit(state, `    LOAD${suffix} ${formatAddress(returnSym.address)}`);
    } else {
        emit(state, `    PUSH32 0    ; Default return value`);
    }

    emit(state, `    RET`);
    state.currentFunction = null;
    state.returnLabel = null;
    state.stringBuffers = callerBuffers;
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
    const { currentFBInstance, currentMethod, currentBlock, currentFunction, returnLabel, expressionDepth, resultBuffer, resultCapacity, sourceRef } = state;
    const depth = state.statementStack.length;
    state.statementStack.push({ line: stmt.line, column: stmt.column, sourceRef: state.sourceRef });
    try {
        emitStatementNode(state, stmt);
    } catch (caught) {
        const error = codegenErrorFrom(caught, stmt);
        if (error === null) throw caught;
        // the error is in the file of the declaration the statement belongs to (CMP-042)
        for (const each of error.errors) if (each.sourceRef === undefined && state.sourceRef !== undefined) each.sourceRef = state.sourceRef;
        state.loopStack.length = loops;
        state.currentFBInstance = currentFBInstance;
        state.currentMethod = currentMethod;
        state.currentBlock = currentBlock;
        state.currentFunction = currentFunction;
        state.returnLabel = returnLabel;
        state.expressionDepth = expressionDepth;
        state.resultBuffer = resultBuffer;
        state.resultCapacity = resultCapacity;
        state.sourceRef = sourceRef;
        state.errors.push(...error.errors);
    } finally {
        state.statementStack.length = depth;
    }
    // What the statement that holds this one generates next is that statement's own (CMP-055)
    emitSourceAnnotation(state, state.statementStack[depth - 1]);
}

function emitStatementNode(state: CodeGenState, stmt: Statement): void {
    // Emit source annotation before the first instruction of this statement
    emitSourceAnnotation(state, stmt);

    // The string buffers the previous statement used hold nothing anyone still reads. A statement inside an
    // expression (the body of an inlined method) is not a boundary: the expression still holds its values.
    if (state.expressionDepth === 0) {
        for (const buffer of state.stringBuffers) buffer.free = true;
    }

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
                state.methodLeftResult = false;
                emitExpression(state, stmt.value);
                // The method was executed, but we don't store the result: drop the value it left, if any
                if (state.methodLeftResult) {
                    emit(state, `    DROP       ; discard unused return value`);
                    state.methodLeftResult = false;
                }
                return;
            }
            // Other expressions assigned to '_' - just evaluate and drop
            emitExpression(state, stmt.value);
            emit(state, `    DROP       ; discard result of expression`);
            if (isWide(staticType(state, stmt.value))) emit(state, `    DROP`);
            return;
        }

        // IEC return syntax: FunctionName := value (for FUNCTION)
        if (state.currentFunction && sameName(stmt.target.name, state.currentFunction.name)) {
            emit(state, `    ; RETURN ${state.currentFunction.name} := ...`);
            const sym = state.symbols.get(stmt.target.name);
            if (sym && isStringType(storedType(state, sym.dataType))) {
                const result: Place = { addr: { k: 'const', a: sym.address }, type: sym.dataType, size: sym.size, sym, name: sym.name };
                emitAssignToPlace(state, result, stmt.value, stmt.target);
                return;
            }
            emitValueFor(state, stmt.value, sym?.dataType);
            if (sym) {
                emitStore(state, sym);
            }
            return;
        }

        // IEC return syntax: MethodName := value (for METHOD - inline context)
        // Bug 1 fix: When inside an inlined method, assignment to method name 
        // should leave the value on stack (not store it)
        if (state.currentMethod && sameName(stmt.target.name, state.currentMethod.name)) {
            emit(state, `    ; METHOD RETURN: ${state.currentMethod.name} := ...`);
            if (state.methodResult) {
                // the result slot holds the last value assigned; it is pushed once, where the method ends
                emitAssignToPlace(state, state.methodResult, stmt.value, stmt.target);
                return;
            }
            emitValueFor(state, stmt.value, (state.currentMethod as any).returnType);
            // a method that returns a string or another value that does not fit a cell leaves it on the stack
            return;
        }

        const place = identifierPlace(state, stmt.target);

        emit(state, `    ; ${stmt.target.name} := ...`);
        emitAssignToPlace(state, place, stmt.value, stmt.target);
    } else if (stmt.target.kind === 'MemberAccess' || stmt.target.kind === 'ArrayAccess' || stmt.target.kind === 'DereferenceExpr') {
        // structure and function-block members, array elements and dereferenced references (CMP-019, CMP-022)
        const place = resolvePlace(state, stmt.target);
        emit(state, `    ; ${stmt.target.kind === 'DereferenceExpr'
            ? `*(${stringifyExpression(stmt.target.operand)})`
            : stringifyExpression(stmt.target)} := ...`);
        emitAssignToPlace(state, place, stmt.value, stmt.target);
    }
}

/** The condition of IF, ELSIF, WHILE and UNTIL is a BOOL (CMP-005). */
function emitCondition(state: CodeGenState, condition: Expression): void {
    const type = meaningType(state, condition);
    if (type !== UNKNOWN_TYPE && type !== 'BOOL') {
        const named = type === LITERAL_INT ? 'INT' : type;
        fail(condition, `Type mismatch: a condition is a BOOL and this is a ${named}; compare it, for example ${named === 'REAL' || named === 'LREAL' ? 'x > 0.0' : 'x <> 0'}`);
    }
    emitExpression(state, condition);
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
    emitCondition(state, stmt.condition);
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
            emitCondition(state, elsif.condition);
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
    emitCondition(state, stmt.condition);
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

    // The counter: a local of the function, function block or method, or a global
    let counterPlace: Place;
    try {
        counterPlace = identifierPlace(state, { kind: 'Identifier', name: stmt.counter, line: stmt.line, column: stmt.column });
    } catch (error) {
        if (error instanceof CodegenError) fail(stmt, `Unknown loop counter variable '${stmt.counter}'`);
        throw error;
    }

    const counterType = numericTypeName(storedType(state, counterPlace.type));
    // a 64-bit counter (LINT, ULINT, LWORD) is two cells: its start, test, step and increment are two-cell
    // operations (CMP-015); LREAL is not an integer
    const wideCounter = isWideInteger(counterType);
    if (isWide(counterType) && !wideCounter) {
        fail(stmt, `A FOR counter must be an integer variable, not ${counterType}`);
    }
    const counterExtend = signExtension(counterType);
    /** Load the counter in its canonical 32-bit form. */
    const loadCounter = (): void => {
        emitLoadPlace(state, counterPlace);
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
    emitStorePlace(state, counterPlace, () => (wideCounter
        ? emitConverted(state, stmt.start, counterType)
        : emitExpression(state, stmt.start)));

    // Loop condition check: past the end is counter > end going up, counter < end going down
    // (an unsigned counter or end compares unsigned)
    const loopType = commonType(counterType, staticType(state, stmt.end));
    // a two-cell end (or counter) makes the test a two-cell comparison: the other side is widened to it
    const counterOperand = (): void => {
        loadCounter();
        if (isWide(loopType) && !wideCounter) emitConvertTop(state, counterType, loopType);
    };
    const endOperand = (): void => {
        if (isWide(loopType)) emitConverted(state, stmt.end, loopType);
        else emitExpression(state, stmt.end);
    };
    emit(state, `${loopLabel}:`);
    const direction = stepDirection(stmt.step);
    if (direction === 'runtime') {
        // The step is not a constant: test its sign on every pass.
        const downLabel = newLabel(state, 'for_down');
        const testLabel = newLabel(state, 'for_test');
        emit(state, `    ; check: step < 0 ? counter < end : counter > end`);
        if (wideCounter) {
            // the sign of a two-cell step is the sign of its high word
            emitConverted(state, stmt.step!, counterType);
            emit(state, `    SWAP`);
            emit(state, `    DROP`);
        } else {
            emitExpression(state, stmt.step!);
        }
        emit(state, `    PUSH8 0`);
        emit(state, `    LT`);
        emit(state, `    JNZ ${downLabel}`);
        counterOperand();
        endOperand();
        emitCompare(state, 'GT', loopType);
        emit(state, `    JMP ${testLabel}`);
        emit(state, `${downLabel}:`);
        counterOperand();
        endOperand();
        emitCompare(state, 'LT', loopType);
        emit(state, `${testLabel}:`);
    } else {
        emit(state, direction === 'down' ? `    ; check: counter < end?` : `    ; check: counter > end?`);
        counterOperand();
        endOperand();
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
    emitStorePlace(state, counterPlace, () => {
        loadCounter();
        if (wideCounter) {
            if (stmt.step) emitConverted(state, stmt.step, counterType);
            else emitWideConstant(state, 1n);
            callHelper(state, 'add64', ADD64_LABEL);
            return;
        }
        if (stmt.step) {
            emitExpression(state, stmt.step);
        } else {
            emit(state, `    PUSH8 1       ; default step`);
        }
        emit(state, `    ADD`);
    });
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
    emitCondition(state, stmt.condition);
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
 *   JMP case_else_N (or case_drop_N if no else)
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
 *   (no else) case_drop_N:
 *       DROP
 *   end_case_N:
 */
function emitCaseStatement(state: CodeGenState, stmt: CaseStatement): void {
    const selectorType = staticType(state, stmt.selector);
    if (isWide(selectorType)) {
        if (!isWideInteger(selectorType)) fail(stmt.selector, `A CASE selector must be an integer or an enumeration, not ${selectorType}`);
        emitWideCaseStatement(state, stmt, selectorType);
        return;
    }
    const endLabel = newLabel(state, 'end_case');
    const elseLabel = stmt.elseBranch ? newLabel(state, 'case_else') : null;
    // Without an ELSE the selector is still on the stack when no label matches: that path drops it itself.
    const dropLabel = stmt.elseBranch ? null : newLabel(state, 'case_drop');

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

    // Jump to else, or to the drop of the selector, if no match
    emit(state, `    JMP ${elseLabel ?? dropLabel}`);

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
    } else if (dropLabel) {
        // The branches jump over this drop: only the no-match path reaches it, with the selector on the
        // stack. Without it the selector leaks once per execution and a loop around the CASE is unbounded.
        emit(state, `${dropLabel}:`);
        emit(state, `    DROP        ; discard selector (no match)`);
    }

    emit(state, `${endLabel}:`);
}

/**
 * CASE on a 64-bit selector (LINT, ULINT, LWORD): the selector stays on the stack as two cells, each label is
 * compared as a two-cell value of the selector's type (signed for LINT, unsigned for ULINT and LWORD), and the
 * labels are 64-bit constants.
 */
function emitWideCaseStatement(state: CodeGenState, stmt: CaseStatement, selectorType: string): void {
    const signed = numericInfo(selectorType)?.signed === true;
    const normal = (value: bigint): bigint => (signed ? BigInt.asIntN(64, value) : BigInt.asUintN(64, value));
    const labelValue = (expr: Expression): bigint => {
        const value = foldConstant(state, expr);
        if (value === undefined) fail(expr, `A CASE label must be an integer constant`);
        if (value < integerRange(selectorType)!.low || value > integerRange(selectorType)!.high) {
            fail(expr, `The CASE label ${value} does not fit ${selectorType}`);
        }
        return normal(value);
    };
    const endLabel = newLabel(state, 'end_case');
    const elseLabel = stmt.elseBranch ? newLabel(state, 'case_else') : null;
    const dropLabel = stmt.elseBranch ? null : newLabel(state, 'case_drop');
    const branchLabels: string[] = stmt.branches.map(() => newLabel(state, 'case_branch'));
    const dropSelector = (): void => {
        emit(state, `    DROP        ; discard selector`);
        emit(state, `    DROP`);
    };

    const taken: Array<{ lo: bigint; hi: bigint }> = [];
    const bounds = stmt.branches.map((branch) => branch.values.map((label) => {
        const lo = labelValue(label.start);
        const hi = label.end ? labelValue(label.end) : lo;
        const text = lo === hi ? `${lo}` : `${lo}..${hi}`;
        if (lo > hi) fail(label, `CASE range ${text} is empty`);
        if (taken.some((earlier) => lo <= earlier.hi && earlier.lo <= hi)) fail(label, `CASE label ${text} overlaps an earlier label`);
        taken.push({ lo, hi });
        return { lo, hi };
    }));

    emit(state, ``);
    emit(state, `    ; CASE statement on ${selectorType} (two cells)`);
    emitExpression(state, stmt.selector);

    for (let i = 0; i < stmt.branches.length; i++) {
        for (const { lo, hi } of bounds[i]!) {
            emit(state, `    PICK 1`);
            emit(state, `    PICK 1`);
            emitWideConstant(state, lo);
            if (lo === hi) {
                emitCompare(state, 'EQ', selectorType);
                emit(state, `    JNZ ${branchLabels[i]}`);
            } else {
                const next = newLabel(state, 'case_next');
                emitCompare(state, 'GE', selectorType);
                emit(state, `    JZ ${next}`);
                emit(state, `    PICK 1`);
                emit(state, `    PICK 1`);
                emitWideConstant(state, hi);
                emitCompare(state, 'LE', selectorType);
                emit(state, `    JNZ ${branchLabels[i]}`);
                emit(state, `${next}:`);
            }
        }
    }
    emit(state, `    JMP ${elseLabel ?? dropLabel}`);

    for (let i = 0; i < stmt.branches.length; i++) {
        emit(state, `${branchLabels[i]}:`);
        dropSelector();
        for (const s of stmt.branches[i]!.statements) {
            emitStatement(state, s);
        }
        emit(state, `    JMP ${endLabel}`);
    }
    if (elseLabel && stmt.elseBranch) {
        emit(state, `${elseLabel}:`);
        dropSelector();
        emit(state, `    ; ELSE branch`);
        for (const s of stmt.elseBranch) {
            emitStatement(state, s);
        }
    } else if (dropLabel) {
        emit(state, `${dropLabel}:`);
        dropSelector();
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
        const qualified = qualifiedEnumValue(state, expr);
        if (qualified !== undefined) return qualified;
        const sym = resolveSymbol(state, expr.name);
        if (!sym) fail(expr, `Unknown identifier '${expr.name}'`);
        const initial = sym.initialValue as Expression | null;
        if (sym.section === 'CONSTANT' && initial) {
            const value = constantInteger(initial);
            if (value !== undefined) return Number(value);
        }
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
    if (stmt.fbName === 'SUPER^') {
        emitSuperBodyCall(state, stmt);
        return;
    }
    const sym = state.symbols.get(stmt.fbName);

    if (!sym) {
        // a method of the block being generated, called by its name, as a statement (CMP-041)
        const implicit = implicitMethodCall(state, statementAsCall(stmt));
        if (implicit) {
            state.methodLeftResult = false;
            emitMethodCall(state, implicit);
            // the value the method left is discarded
            if (state.methodLeftResult) {
                emit(state, `    DROP       ; discard unused return value`);
                state.methodLeftResult = false;
            }
            return;
        }

        // A function called for what it does, its result discarded (CMP-035)
        if (state.functionTable.has(stmt.fbName)
            || (getFn(stmt.fbName) !== undefined && stmt.fbName.toUpperCase() !== 'WATCHDOG_RESET')) {
            emitFunctionCallStatement(state, stmt);
            return;
        }

        // ponytail: WATCHDOG_RESET is the sole built-in void-like statement; generalize only if another appears.
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

        fail(stmt, `Unknown function block instance or function '${stmt.fbName}'`);
    }

    emitInstanceCall(state, stmt, sym);
}

/**
 * `Name(args);` where Name is a function: the call is evaluated and its value dropped. The arguments
 * are positional or named, as in a call inside an expression.
 */
function emitFunctionCallStatement(state: CodeGenState, stmt: FBCallStatement): void {
    const call = statementAsCall(stmt);
    emit(state, `    ; ${stmt.fbName}(...) as a statement: the result is discarded`);
    emitExpression(state, call);
    // the value is one cell, two for a 64-bit integer
    const result = staticType(state, call);
    emit(state, `    DROP       ; discard the result of ${stmt.fbName}`);
    if (isWide(result)) emit(state, `    DROP`);
}

/** A call written as a statement, as the call expression it is: the arguments are positional or named. */
function statementAsCall(stmt: FBCallStatement): FunctionCall {
    return {
        kind: 'FunctionCall',
        name: stmt.fbName,
        args: stmt.parameters.map((parameter) => {
            if (parameter.output) {
                fail(parameter as { line: number; column: number }, `'${parameter.name}' is bound with =>: only a function block call has output bindings`);
            }
            return parameter.name === ''
                ? parameter.value
                : { kind: 'NamedArgument' as const, name: parameter.name, value: parameter.value, line: parameter.line, column: parameter.column };
        }),
        line: stmt.line,
        column: stmt.column,
    };
}

/**
 * A call `Name(...)` inside a function block, where `Name` is a method of the block: it is a call of the
 * method on the instance that runs (THIS), as in IEC 61131-3 ed. 3 (CMP-041).
 */
function implicitMethodCall(state: CodeGenState, call: FunctionCall): MethodCall | null {
    const instance = state.currentFBInstance;
    if (!instance || typeof instance.dataType !== 'string' || state.currentFunction) return null;
    if (!state.symbols.getFBDefinition(instance.dataType)?.methods.has(call.name)) return null;
    return {
        kind: 'MethodCall',
        object: { kind: 'ThisExpr', line: call.line, column: call.column },
        methodName: call.name,
        args: call.args,
        line: call.line,
        column: call.column,
    };
}

/**
 * `SUPER^();` runs the body of the base block of the block that declares the code that runs, on the same
 * instance: the base block's own statements, with RETURN leaving only them (CMP-041).
 */
function emitSuperBodyCall(state: CodeGenState, stmt: FBCallStatement): void {
    const block = state.currentBlock;
    if (!block || !state.currentFBInstance) fail(stmt, `SUPER^ is used outside of a function block`);
    const baseName = state.symbols.getFBDefinition(block)?.extends;
    if (!baseName) fail(stmt, `'${block}' extends no function block: SUPER^() has no base block to call`);
    const base = state.functionBlockTable.get(baseName);
    if (!base) fail(stmt, `The base block '${baseName}' of '${block}' is not declared`);
    if (stmt.parameters.length > 0) fail(stmt.parameters[0]! as { line: number; column: number }, `SUPER^() takes no parameters: give the inputs a value before the call`);

    emit(state, `    ; --- SUPER^(): the body of ${base.name} ---`);
    const oldBlock = state.currentBlock;
    const oldReturnLabel = state.returnLabel;
    const oldSourceRef = state.sourceRef;
    state.currentBlock = base.name;
    state.returnLabel = newLabel(state, 'fb_return');
    if (base.sourceRef !== undefined) state.sourceRef = base.sourceRef;
    for (const bodyStmt of base.body) {
        emitStatement(state, bodyStmt);
    }
    state.sourceRef = oldSourceRef;
    emit(state, `${state.returnLabel}:`);
    state.currentBlock = oldBlock;
    state.returnLabel = oldReturnLabel;
    emit(state, `    ; --- END SUPER^(): ${base.name} ---`);
}

/** The error of a parameter that cannot be bound as written. */
function parameterError(stmt: FBCallStatement, parameter: FBParameter, message: string): never {
    return fail(parameter.line === undefined ? stmt : { line: parameter.line, column: parameter.column ?? stmt.column, endLine: parameter.endLine, endColumn: parameter.endColumn }, message);
}

/** The call of the function block instance `sym`: user-defined blocks are inlined, library blocks generate their own code. */
function emitInstanceCall(state: CodeGenState, stmt: FBCallStatement, sym: Symbol): void {
    const typeName = sym.dataType as string;
    const instanceName = stmt.fbName;

    // A function block is called with named parameters (formal call); the positional form is left to 2.x (D-04)
    const positional = stmt.parameters.find((parameter) => parameter.name === '');
    if (positional && (state.symbols.isFBType(typeName))) {
        fail({ line: positional.line ?? stmt.line, column: positional.column ?? stmt.column }, `'${instanceName}' is a function block: its parameters are written by name, as in ${instanceName}(IN := x) ` +
            `(positional calls of function blocks are not supported in this release)`);
    }

    // 1. Check if it's a user-defined FB
    const userFB = state.functionBlockTable.get(typeName);
    if (userFB) {
        emit(state, `    ; --- FB CALL: ${stmt.fbName} (${typeName}) ---`);

        const fbDef = state.symbols.getFBDefinition(typeName);
        const instance: Place = { addr: { k: 'const', a: sym.address }, type: typeName, size: sym.size, sym, name: stmt.fbName };

        // Assign inputs
        for (const param of stmt.parameters) {
            const member = fbDef?.members.get(param.name);
            if (!member) parameterError(stmt, param, `'${param.name}' is not a parameter of '${typeName}' (instance '${instanceName}')`);
            if (param.output) {
                if (member.section !== VarSection.VAR_OUTPUT) {
                    parameterError(stmt, param, `'${param.name}' is not an output of '${typeName}': bind it with :=`);
                }
                continue; // copied out after the call
            }
            if (member.section !== VarSection.VAR_INPUT && member.section !== VarSection.VAR_IN_OUT) {
                parameterError(stmt, param, member.section === VarSection.VAR_OUTPUT
                    ? `'${param.name}' is an output of '${typeName}': bind it with =>`
                    : `'${param.name}' is not a parameter of '${typeName}'`);
            }
            emit(state, `    ; ${stmt.fbName}.${param.name} := ...`);
            if (member.section === VarSection.VAR_IN_OUT) {
                // by reference (CMP-028): the member keeps the address of the caller's variable
                const actual = resolvePlace(state, param.value);
                if (actual.readonly) fail(param.value, `'${actual.name}' is a constant and cannot be passed to the VAR_IN_OUT '${param.name}'`);
                if (typeText(storedType(state, actual.type)) !== typeText(storedType(state, member.dataType))) {
                    fail(param.value, `VAR_IN_OUT '${param.name}' of '${typeName}' is ${typeText(member.dataType)}, '${actual.name}' is ${typeText(actual.type)}`);
                }
                emitAddr(state, actual.addr);
                emit(state, `    STORE32 ${formatAddress(sym.address + member.offset)}   ; ${stmt.fbName}.${param.name} -> ${actual.name}`);
                continue;
            }
            emitAssignToPlace(state, placeOfMember(state, instance, member, `${stmt.fbName}.${param.name}`), param.value, param.value);
        }

        // VAR_TEMP holds nothing from the previous call (CMP-027)
        for (const [memberName, member] of fbDef?.members ?? []) {
            if (member.section === VarSection.VAR_TEMP) {
                emitInitValue(state, sym.address + member.offset, member.dataType, member.initialValue, stmt,
                    `${stmt.fbName}.${memberName}`, { everyCall: true });
            }
        }

        // Set context for inlining
        const oldFBInstance = state.currentFBInstance;
        const oldReturnLabel = state.returnLabel;
        const oldBlock = state.currentBlock;
        state.currentFBInstance = sym;
        state.currentBlock = userFB.name;
        state.returnLabel = newLabel(state, 'fb_return');

        // Inline FB Body: its statements are the ones of the file the block is declared in
        const oldSourceRef = state.sourceRef;
        if (userFB.sourceRef !== undefined) state.sourceRef = userFB.sourceRef;
        for (const bodyStmt of userFB.body) {
            emitStatement(state, bodyStmt);
        }
        state.sourceRef = oldSourceRef;

        // Restore context
        emit(state, `${state.returnLabel}:`);
        state.currentFBInstance = oldFBInstance;
        state.currentBlock = oldBlock;
        state.returnLabel = oldReturnLabel;

        // Output bindings: the outputs the body left are copied into the caller's variables
        for (const param of stmt.parameters) {
            if (!param.output) continue;
            const member = fbDef!.members.get(param.name)!;
            emit(state, `    ; ${param.value.kind === 'Identifier' ? param.value.name : '...'} := ${stmt.fbName}.${param.name}`);
            emitCopyOut(state, placeOfMember(state, instance, member, `${stmt.fbName}.${param.name}`), param);
        }
        emit(state, `    ; --- END FB CALL: ${stmt.fbName} ---`);
        return;
    }

    // 2. Check if it's a built-in FB
    const fbDef = getFB(typeName as DataTypeValue);
    if (fbDef) {
        emit(state, `    ; ${stmt.fbName}(...)`);

        // The parameters are matched with the block's own, without regard to case (CMP-004); one that the
        // block does not have is an error (CMP-037), and so is an input bound with => or an output with :=
        const inputs: FBParameter[] = [];
        const outputs: FBParameter[] = [];
        for (const param of stmt.parameters) {
            const member = fbDef.members.find((candidate) => !candidate.isInternal && sameName(candidate.name, param.name));
            if (!member) parameterError(stmt, param, `'${param.name}' is not a parameter of ${fbDef.name} (instance '${instanceName}')`);
            if (param.output) {
                if (!member.isOutput) parameterError(stmt, param, `'${member.name}' is an input of ${fbDef.name}: bind it with :=`);
                outputs.push({ ...param, name: member.name });
            } else {
                if (!member.isInput) parameterError(stmt, param, `'${member.name}' is an output of ${fbDef.name}: bind it with =>`);
                // the value goes to a parameter of the type the block declares (CMP-005)
                const memberType = stdlibMemberType(typeName, member);
                if (memberType !== UNKNOWN_TYPE) {
                    const constant = foldConstant(state, param.value);
                    const from = meaningType(state, param.value);
                    checkConvertible(from, memberType, param.value, constant);
                    warnNarrowing(state, param.value, from, memberType, constant);
                }
                inputs.push({ ...param, name: member.name });
            }
        }

        fbDef.generateCall(makeCodeGenContext(state, sym.address, stmt.fbName, stmt), inputs);

        const instance: Place = { addr: { k: 'const', a: sym.address }, type: typeName, size: sym.size, sym, name: stmt.fbName };
        for (const param of outputs) {
            const member = fbDef.members.find((candidate) => candidate.name === param.name)!;
            emit(state, `    ; ${param.value.kind === 'Identifier' ? param.value.name : '...'} := ${stmt.fbName}.${param.name}`);
            const source: Place = { addr: addOffset(instance.addr, member.offset), type: stdlibMemberType(typeName, member), size: member.size, name: `${stmt.fbName}.${member.name}` };
            emitCopyOut(state, source, param);
        }
        return;
    }

    fail(stmt, `Unknown FB type '${typeName}' for instance '${stmt.fbName}'`);
}

/** `target := source` for the output binding `param` (`Q => target`): `source` is the output's place. */
function emitCopyOut(state: CodeGenState, source: Place, param: FBParameter): void {
    const target = resolvePlace(state, param.value);
    if (target.readonly) fail(param.value, `Cannot assign to constant '${target.name}'`);
    const type = storedType(state, target.type);
    if (isStringType(type) || isAggregateType(state, type) || isPointerType(type)) {
        const same = typeText(storedType(state, source.type)) === typeText(type);
        if (!same) fail(param.value, `Cannot bind '${param.name}' (${typeText(source.type)}) to '${target.name}' of type ${typeText(type)}`);
        if (isPointerType(type)) {
            emitStorePlace(state, target, () => emitLoadPlace(state, source));
        } else {
            emitCopyBytes(state, target.size, target, source);
        }
        return;
    }
    // a scalar: converted and checked as an assignment of the output's value is
    const from = numericTypeName(storedType(state, source.type));
    const to = numericTypeName(type);
    checkConvertible(from, to, param.value, undefined);
    warnNarrowing(state, param.value, from, to, undefined);
    emitStorePlace(state, target, () => {
        emitLoadPlace(state, source);
        const extend = signExtension(from);
        if (extend) emit(state, extend);
        if (isWide(to) || isWide(from)) emitConvertTop(state, from, to);
        else if (to === 'REAL' && from !== 'REAL' && isIntegerLike(from) && from !== UNKNOWN_TYPE) emitIntToReal(state, from);
    });
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
            emitPlaceExpression(state, expr);
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
    } else if (expr.literalType !== undefined && isUnsigned32(expr.literalType) && expr.value > 0 && expr.value <= 0xFFFFFFFF) {
        // DWORD#16#FFFFFFFF, or a plain literal given to a DWORD parameter: the 32-bit pattern (CMP-012)
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
    if (expr.literalType === 'LREAL') {
        emitDoubleConstant(state, expr.value);
        return;
    }
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

/** The value of `Type#Value` (an enumeration value written with its type), or undefined for any other name. */
function qualifiedEnumValue(state: CodeGenState, expr: Identifier): number | undefined {
    const hash = expr.name.indexOf('#');
    if (hash < 0) return undefined;
    const type = expr.name.slice(0, hash);
    const name = expr.name.slice(hash + 1);
    const enumeration = state.symbols.getEnumDefinition(type);
    if (!enumeration) fail(expr, `Unknown enumeration type '${type}' in '${expr.name}'`);
    const value = enumeration.values.get(name);
    if (value === undefined) fail(expr, `'${name}' is not a value of the enumeration '${type}'`);
    return value;
}

/** `NULL`, unless the program declares something of that name. */
function isNullLiteral(state: CodeGenState, expr: Expression): boolean {
    if (expr.kind !== 'Identifier' || expr.name.toUpperCase() !== 'NULL') return false;
    try {
        identifierPlace(state, expr);
        return false;
    } catch (error) {
        if (error instanceof CodegenError) return true;
        throw error;
    }
}

function emitIdentifier(state: CodeGenState, expr: Identifier): void {
    const qualified = qualifiedEnumValue(state, expr);
    if (qualified !== undefined) {
        emitIntLiteral(state, { kind: 'IntLiteral', value: qualified, line: expr.line, column: expr.column });
        return;
    }

    // NULL: the reference that points at nothing (CMP-024)
    if (isNullLiteral(state, expr)) {
        emit(state, `    PUSH16 ${NULL_REFERENCE}   ; NULL`);
        return;
    }

    const place = identifierPlace(state, expr);
    const sym = place.sym;

    // Inline CONSTANT values (e.g. ENUMs, VAR CONSTANT)
    if (sym && sym.section === 'CONSTANT' && sym.initialValue) {
        const initVal = sym.initialValue as any;
        if (initVal.kind === 'IntLiteral' || initVal.kind === 'BoolLiteral' || initVal.kind === 'RealLiteral') {
            emitValueFor(state, initVal, sym.dataType);
            return;
        }
    }

    const type = storedType(state, place.type);
    if (isArrayType(type as STDataType) || (typeof type === 'string' && state.symbols.isStructType(type))) {
        fail(expr, `'${expr.name}' is ${typeText(type)}: use one of its members or elements, or assign the whole value to a variable of the same type`);
    }
    emitLoadPlace(state, place, expr.name);
}

function emitMemberAccess(state: CodeGenState, expr: MemberAccess): void {
    emitPlaceExpression(state, expr);
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

    const operandKind = typeKind(staticType(state, expr.operand));
    if (expr.operator === 'NOT' && operandKind === 'real') {
        fail(expr.operand, `Type mismatch: NOT takes a BOOL or a bit string and this is a ${staticType(state, expr.operand)}`);
    }
    if (expr.operator === 'NEG' && operandKind === 'bool') {
        fail(expr.operand, `Type mismatch: the negation takes a number and this is a BOOL`);
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
            emit(state, type === 'LREAL' ? `    NEGD` : isFloatType(type) ? `    NEGF` : `    NEG`);
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
        case 'WStringLiteral':
            return 'WSTRING';
        case 'Identifier':
        case 'MemberAccess':
        case 'ArrayAccess':
        case 'DereferenceExpr': {
            try {
                const type = storedType(state, resolvePlace(state, expr).type);
                return typeof type === 'string' ? type : 'UNKNOWN';
            } catch (error) {
                if (error instanceof CodegenError) return 'UNKNOWN';
                throw error;
            }
        }
        case 'FunctionCall': {
            const userFunction = state.functionTable.get(expr.name);
            if (userFunction) return typeof userFunction.returnType === 'string' ? userFunction.returnType : 'UNKNOWN';
            // String functions return STRING
            const stringFunctions = ['CONCAT', 'LEFT', 'RIGHT', 'MID', 'INSERT', 'DELETE', 'REPLACE', 'COPY', 'CLEAR'];
            if (stringFunctions.includes(expr.name.toUpperCase())) {
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
    return isStringType(inferExpressionType(state, expr));
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
    return placeType(state, expr);
}

/** Numeric type of the place an expression names (an enumeration is its base type), or UNKNOWN_TYPE. */
function placeType(state: CodeGenState, expr: Expression): string {
    try {
        const place = resolvePlace(state, expr);
        return numericTypeName(storedType(state, place.type));
    } catch (error) {
        if (error instanceof CodegenError) return UNKNOWN_TYPE;
        throw error;
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
        case 'EXP': case 'EXPT': case 'ASIN': case 'ACOS': case 'ATAN': case 'ATAN2': case 'TRUNC': case 'ROUND':
            // an LREAL argument gives an LREAL (the transcendental functions compute in REAL and widen back)
            return args.some((a) => staticType(state, a) === 'LREAL') ? 'LREAL' : 'REAL';
        case 'NAND': case 'NOR':
            return 'BOOL';
        case 'AND_WORD': case 'OR_WORD': case 'XOR_WORD': case 'NOT_WORD':
            return 'WORD';
        case 'AND_DWORD': case 'OR_DWORD': case 'XOR_DWORD': case 'NOT_DWORD':
            return 'DWORD';
        default:
            // <FROM>_TO_<TO> (CMP-057)
            return conversionResultType(expr.name) ?? UNKNOWN_TYPE;
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
        // 1.5 is a REAL; LREAL#1.5 is an LREAL. In an LREAL context a plain literal is the double (emitAsDouble).
        case 'RealLiteral': return expr.literalType === 'LREAL' ? 'LREAL' : 'REAL';
        case 'TimeLiteral': return 'TIME';
        case 'DateLiteral': return 'DATE';
        case 'TODLiteral': return 'TOD';
        case 'DTLiteral': return 'DT';
        case 'Identifier': {
            if (expr.name.includes('#')) return 'INT';  // Type#Value of an enumeration
            return placeType(state, expr);
        }
        case 'MemberAccess':
            return memberAccessType(state, expr);
        case 'ArrayAccess':
        case 'DereferenceExpr':
            return placeType(state, expr);
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
        case 'MethodCall':
            return methodResultType(state, expr);
        default:
            return UNKNOWN_TYPE;
    }
}

/** Numeric type a method of a function block instance returns, or UNKNOWN_TYPE when it is not a number. */
function methodResultType(state: CodeGenState, expr: MethodCall): string {
    try {
        let instance: Symbol | undefined;
        if (expr.object.kind === 'ThisExpr') instance = state.currentFBInstance ?? undefined;
        else if (expr.object.kind === 'Identifier') instance = state.symbols.get(expr.object.name);
        if (!instance || typeof instance.dataType !== 'string') return UNKNOWN_TYPE;
        const method = state.symbols.getFBDefinition(instance.dataType)?.methods.get(expr.methodName) as { returnType?: unknown } | undefined;
        return method?.returnType === undefined || method.returnType === null ? UNKNOWN_TYPE : numericTypeName(storedType(state, method.returnType as STDataType));
    } catch (error) {
        if (error instanceof CodegenError) return UNKNOWN_TYPE;
        throw error;
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
function callHelper(state: CodeGenState, helper: HelperName, label: string): void {
    state.helpers.add(helper);
    emit(state, `    CALL ${label}`);
}

/**
 * Call a routine of the standard library (stdlib/routines.ts): it is appended to the program with the
 * routines it calls the first time, in the order they were first needed.
 */
function linkRoutine(state: CodeGenState, label: string): void {
    const link = (name: string): void => {
        if (state.cellHelpers.has(name)) return;
        const routine = getRoutine(name);
        if (!routine) throw new Error(`stdlib routine ${name} is not registered`);
        state.cellHelpers.set(name, routine.lines);
        routine.needs.forEach(link);
    };
    link(label);
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

/** Push an LREAL constant as two cells, low word first (the order LOAD64 leaves them in). */
function emitDoubleConstant(state: CodeGenState, value: number): void {
    const [low, high] = doubleWords(value);
    const text = Object.is(value, -0) ? '-0.0' : String(value);
    emit(state, `    PUSH32 ${low}       ; ${text} (LREAL, low word)`);
    emit(state, `    PUSH32 ${high}       ; (high word)`);
}

/** The value of a constant made of literals: an integer (ST integer arithmetic) or a real (double arithmetic). */
type FoldedNumber = { int: bigint } | { real: number };

/**
 * Fold literals, their negation and their sums, differences, products and quotients, and a named constant
 * of one of those. A division by zero is left to the VM (it faults); an explicit `REAL#x` is not folded, it
 * is a single-precision value.
 */
function foldNumber(state: CodeGenState, expr: Expression, depth = 0): FoldedNumber | undefined {
    if (depth > 16) return undefined;
    switch (expr.kind) {
        case 'IntLiteral':
            return { int: expr.big ?? BigInt(expr.value) };
        case 'RealLiteral':
            return expr.literalType === 'REAL' ? undefined : { real: expr.value };
        case 'UnaryExpr': {
            if (expr.operator !== 'NEG') return undefined;
            const inner = foldNumber(state, expr.operand, depth + 1);
            if (inner === undefined) return undefined;
            return 'int' in inner ? { int: -inner.int } : { real: -inner.real };
        }
        case 'BinaryExpr': {
            if (!['ADD', 'SUB', 'MUL', 'DIV'].includes(expr.operator)) return undefined;
            const left = foldNumber(state, expr.left, depth + 1);
            const right = foldNumber(state, expr.right, depth + 1);
            if (left === undefined || right === undefined) return undefined;
            if ('int' in left && 'int' in right) {
                switch (expr.operator) {
                    case 'ADD': return { int: left.int + right.int };
                    case 'SUB': return { int: left.int - right.int };
                    case 'MUL': return { int: left.int * right.int };
                    default: return right.int === 0n ? undefined : { int: left.int / right.int };
                }
            }
            const a = 'int' in left ? Number(left.int) : left.real;
            const b = 'int' in right ? Number(right.int) : right.real;
            switch (expr.operator) {
                case 'ADD': return { real: a + b };
                case 'SUB': return { real: a - b };
                case 'MUL': return { real: a * b };
                default: return b === 0 ? undefined : { real: a / b };
            }
        }
        case 'Identifier': {
            const symbol = state.symbols.get(expr.name);
            if (!symbol || symbol.section !== VarSection.CONSTANT || !symbol.initialValue) return undefined;
            const initial = symbol.initialValue as Expression;
            if (initial.kind !== 'IntLiteral' && initial.kind !== 'RealLiteral' && initial.kind !== 'UnaryExpr' && initial.kind !== 'BinaryExpr') {
                return undefined;
            }
            const value = foldNumber(state, initial, depth + 1);
            if (value === undefined) return undefined;
            // the constant has its declared type: a REAL constant is the single-precision value of its literal
            const declared = numericTypeName(storedType(state, symbol.dataType));
            if (declared === 'REAL') return { real: Math.fround('int' in value ? Number(value.int) : value.real) };
            if (declared === 'LREAL') return { real: 'int' in value ? Number(value.int) : value.real };
            return isIntegerLike(declared) && 'int' in value ? value : undefined;
        }
        default:
            return undefined;
    }
}

/**
 * Convert the value on top of the stack from the numeric type `from` to `to`, where either is 64 bits wide
 * (LINT, ULINT, LWORD, DT or LREAL). Every case is one VM instruction, or two for the sign word of a
 * 32-bit integer: LREAL conversions round to nearest even, to a 64-bit integer they truncate.
 */
function emitConvertTop(state: CodeGenState, from: string, to: string): void {
    if (from === to) return;
    const source = from === LITERAL_INT || from === UNKNOWN_TYPE ? undefined : numericInfo(from);
    const signedSource = source === undefined || source.signed;

    if (to === 'LREAL') {
        if (from === 'REAL' || from === UNKNOWN_TYPE) emit(state, `    F2D`);
        else if (isWideInteger(from)) emit(state, signedSource ? `    L2D` : `    U2D`);
        else if (isUnsigned32(from)) {
            emit(state, `    PUSH8 0             ; high word`);
            emit(state, `    U2D`);
        } else emit(state, `    I2D`);
        return;
    }
    if (to === 'REAL') {
        if (from === 'LREAL') emit(state, `    D2F`);
        else if (isWideInteger(from)) emit(state, signedSource ? `    L2F` : `    U2F`);
        else emitIntToReal(state, from);
        return;
    }
    if (isWideInteger(to)) {
        const unsigned = numericInfo(to)?.signed === false;
        if (from === 'LREAL') {
            emit(state, unsigned ? `    D2U` : `    D2L`);
        } else if (from === 'REAL') {
            emit(state, `    F2D`);
            emit(state, unsigned ? `    D2U` : `    D2L`);
        } else if (!isWideInteger(from)) {
            if (signedSource) {
                emit(state, `    DUP`);
                emit(state, `    PUSH8 31`);
                emit(state, `    SAR                 ; the sign word`);
            } else {
                emit(state, `    PUSH8 0             ; high word`);
            }
        }
        return;
    }
    if (isWide(from)) {
        // a 64-bit value assigned to a narrower integer keeps its low word (CMP-016)
        emit(state, `    DROP                ; high word`);
    }
}

/**
 * Emit `expr` as an LREAL (two cells): a constant is written as the double it is, any other value is
 * converted from the type it has. An LREAL expression is computed in double precision.
 */
function emitAsDouble(state: CodeGenState, expr: Expression, type: string): void {
    const folded = foldNumber(state, expr);
    if (folded !== undefined && !(expr.kind === 'RealLiteral' && expr.literalType === 'REAL')) {
        emitDoubleConstant(state, 'int' in folded ? Number(folded.int) : folded.real);
        return;
    }
    if (expr.kind === 'RealLiteral' && expr.literalType === 'REAL') {
        emitDoubleConstant(state, Math.fround(expr.value));
        return;
    }
    if (expr.kind === 'BinaryExpr' && (type === 'LREAL' || type === LITERAL_INT)) {
        emitBinaryExpr(state, expr, 'LREAL');
        return;
    }
    emitExpression(state, expr);
    emitConvertTop(state, type, 'LREAL');
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

    if (target === 'LREAL') {
        emitAsDouble(state, expr, type);
        return;
    }

    if (target === 'REAL') {
        if (isWide(type)) {
            // an LREAL is rounded to REAL precision (D2F); a 64-bit integer is converted with one rounding
            emitExpression(state, expr);
            emitConvertTop(state, type, 'REAL');
            return;
        }
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
        if (isFloatType(type)) {
            emitExpression(state, expr);
            emitConvertTop(state, type, target);
            return;
        }
        // a literal is two cells, whatever type it carries (LINT#5 is a LINT literal, not a one-cell value)
        const constant = constantInteger(expr);
        if (constant !== undefined) {
            emitWideConstant(state, constant);
            return;
        }
        if (isWide(type)) {
            if (expr.kind === 'BinaryExpr') emitBinaryExpr(state, expr, target);
            else emitExpression(state, expr);
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

/**
 * Emit `value` for storing into a target of `targetType`. The value must convert to the type as IEC 61131-3
 * defines (CMP-005), and a constant must fit it (CMP-018).
 */
function emitValueFor(state: CodeGenState, value: Expression, targetType: unknown): void {
    if (isInterfaceType(state, targetType)) {
        emitInterfaceValue(state, value, targetType as string);
        return;
    }
    const target = numericTypeName(targetType);
    if (target !== UNKNOWN_TYPE) {
        const constant = foldConstant(state, value);
        const from = meaningType(state, value);
        checkConvertible(from, target, value, constant);
        warnNarrowing(state, value, from, target, constant);
    }
    emitConverted(state, value, target);
}

/**
 * A value of a wider integer type stored in a narrower one keeps its low bits (CMP-016): the build goes on and
 * the author is told (IMPLICIT_NARROWING). A constant is not narrowed (it fits, or it is an error), and
 * neither is `x AND mask` or `x MOD n` when the mask or the remainder fits the destination.
 */
function warnNarrowing(state: CodeGenState, value: Expression, from: string, to: string, constant: bigint | undefined): void {
    if (constant !== undefined) return;
    const source = typeKind(from);
    const target = typeKind(to);
    const integerLike = (kind: TypeKind | undefined) => kind === 'signed' || kind === 'unsigned' || kind === 'bits';
    if (from === 'LREAL' && to === 'REAL') {
        // a literal narrows without a word (it is written to the precision it is given to); a value is rounded
        if (value.kind === 'RealLiteral' || foldNumber(state, value) !== undefined) return;
        const warning: CodegenWarning = {
            code: 'IMPLICIT_NARROWING',
            message: `Implicit narrowing from LREAL to REAL: the value is rounded to single precision (about 7 significant digits) and a magnitude above 3.4e38 becomes an infinity; use LREAL_TO_REAL if that is intended`,
            line: value.line,
            column: value.column,
            ...(value.endLine === undefined ? {} : { endLine: value.endLine, endColumn: value.endColumn }),
        };
        const seen = state.warnings.some((each) => each.line === warning.line && each.column === warning.column && each.message === warning.message);
        if (!seen) state.warnings.push(warning);
        return;
    }
    if (!integerLike(source) || !integerLike(target)) return;
    const range = integerRange(to);
    if (!range || numericInfo(from)!.bits <= numericInfo(to)!.bits) return;
    if (value.kind === 'BinaryExpr' && (value.operator === 'AND' || value.operator === 'MOD')) {
        for (const operand of [value.left, value.right]) {
            const limit = foldConstant(state, operand);
            if (limit === undefined || limit < 0n) continue;
            if (value.operator === 'AND' ? limit <= range.high : limit > 0n && limit - 1n <= range.high && (range.low === 0n || -(limit - 1n) >= range.low)) return;
        }
    }
    const bits = numericInfo(to)!.bits;
    const warning: CodegenWarning = {
        code: 'IMPLICIT_NARROWING',
        message: `Implicit narrowing from ${from} to ${to}: a value that does not fit keeps only its low ${bits} bits; use an explicit conversion if that is intended`,
        line: value.line,
        column: value.column,
        ...(value.endLine === undefined ? {} : { endLine: value.endLine, endColumn: value.endColumn }),
        ...(state.sourceRef === undefined ? {} : { sourceRef: state.sourceRef }),
    };
    const seen = state.warnings.some((each) => each.line === warning.line && each.column === warning.column && each.message === warning.message && each.sourceRef === warning.sourceRef);
    if (!seen) state.warnings.push(warning);
}

/**
 * The type a value has in the language, which is staticType except where the generator tracks the stack
 * instead: the difference of two points in time (DT - DT, TOD - TOD, DATE - DATE) is a TIME, not a DT.
 */
function meaningType(state: CodeGenState, expr: Expression): string {
    const type = staticType(state, expr);
    if (expr.kind === 'BinaryExpr' && expr.operator === 'SUB' && (type === 'DT' || type === 'TOD' || type === 'DATE')
        && staticType(state, expr.left) === staticType(state, expr.right)) {
        return 'TIME';
    }
    return type;
}

/** What kind of value a numeric elementary type holds, for the implicit conversions of IEC 61131-3. */
type TypeKind = 'bool' | 'signed' | 'unsigned' | 'bits' | 'real' | 'time' | 'date' | 'datetime';

function typeKind(type: string): TypeKind | undefined {
    switch (type) {
        case 'BOOL': return 'bool';
        case 'SINT': case 'INT': case 'DINT': case 'LINT': return 'signed';
        case 'USINT': case 'UINT': case 'UDINT': case 'ULINT': return 'unsigned';
        case 'BYTE': case 'WORD': case 'DWORD': case 'LWORD': return 'bits';
        case 'REAL': case 'LREAL': return 'real';
        case 'TIME': case 'TOD': return 'time';
        case 'DATE': return 'date';
        case 'DT': return 'datetime';
        default: return undefined;
    }
}

/**
 * Whether a value of the static type `from` converts implicitly to `to` (CMP-005). Integers, bit strings and
 * REAL form one family of numbers: integer types and bit strings convert among themselves, a value that does
 * not fit the destination keeps its low bits as CMP-016 states (a constant that does not fit is an error:
 * CMP-018), an integer converts to REAL and LREAL, and REAL to LREAL. Nothing else converts implicitly: REAL
 * to an integer, BOOL to or from a number, and TIME, DATE, TOD and DT to or from a number are errors that ask
 * for an explicit conversion function. A bare integer literal takes the integer, bit-string or real type it
 * is given to. UNKNOWN_TYPE converts: it is a type the generator cannot name.
 *
 * ponytail: IEC 61131-3 itself widens only (SINT to INT, USINT to UINT, REAL to LREAL...); integer
 * narrowing stays implicit until the explicit <FROM>_TO_<TO> functions exist for every pair (CMP-057,
 * 64-bit types included), because the bundled projects and CMP-015 conformance cases narrow today.
 */
function convertsImplicitly(from: string, to: string): boolean {
    if (from === UNKNOWN_TYPE || to === UNKNOWN_TYPE || from === to) return true;
    const target = typeKind(to);
    if (target === undefined) return true;
    if (from === LITERAL_INT) return target === 'signed' || target === 'unsigned' || target === 'bits' || target === 'real';
    const source = typeKind(from);
    if (source === undefined) return true;
    const integerLike = (kind: TypeKind) => kind === 'signed' || kind === 'unsigned' || kind === 'bits';
    switch (target) {
        case 'real':
            // REAL widens to LREAL; LREAL narrows to REAL with the IMPLICIT_NARROWING warning (warnNarrowing)
            if (source === 'real') return true;
            return integerLike(source);
        case 'signed':
        case 'unsigned':
        case 'bits':
            return integerLike(source);
        default:
            return false; // BOOL, TIME, DATE, TOD and DT take their own type only
    }
}

/** The range an integer type holds, for the check of a constant (CMP-018). */
function integerRange(type: string): { low: bigint; high: bigint } | undefined {
    const info = numericInfo(type);
    if (!info || info.float || type === 'BOOL' || typeKind(type) === undefined) return undefined;
    const bits = BigInt(info.bits);
    return info.signed ? { low: -(1n << (bits - 1n)), high: (1n << (bits - 1n)) - 1n } : { low: 0n, high: (1n << bits) - 1n };
}

/**
 * The value of a constant integer expression: literals, a named constant, and the sums, differences,
 * products and quotients of constants. undefined for anything else.
 */
function foldConstant(state: CodeGenState, expr: Expression, depth = 0): bigint | undefined {
    if (depth > 16) return undefined;
    switch (expr.kind) {
        case 'IntLiteral':
            return expr.big ?? BigInt(expr.value);
        case 'UnaryExpr': {
            if (expr.operator !== 'NEG') return undefined;
            const operand = foldConstant(state, expr.operand, depth + 1);
            return operand === undefined ? undefined : -operand;
        }
        case 'BinaryExpr': {
            if (!['ADD', 'SUB', 'MUL', 'DIV', 'MOD'].includes(expr.operator)) return undefined;
            const left = foldConstant(state, expr.left, depth + 1);
            const right = foldConstant(state, expr.right, depth + 1);
            if (left === undefined || right === undefined) return undefined;
            switch (expr.operator) {
                case 'ADD': return left + right;
                case 'SUB': return left - right;
                case 'MUL': return left * right;
                case 'DIV': return right === 0n ? undefined : left / right;
                default: return right === 0n ? undefined : left % right;
            }
        }
        case 'Identifier': {
            const symbol = state.symbols.get(expr.name);
            if (!symbol || symbol.section !== VarSection.CONSTANT || !symbol.initialValue) return undefined;
            const initial = symbol.initialValue as Expression;
            return initial.kind === 'IntLiteral' || initial.kind === 'UnaryExpr' || initial.kind === 'BinaryExpr'
                ? foldConstant(state, initial, depth + 1)
                : undefined;
        }
        default:
            return undefined;
    }
}

/**
 * The checks every value that goes into a typed place passes (CMP-005, CMP-018): its type converts
 * implicitly to the place's, and a constant fits the place's range. `from` is the static type of the value,
 * `constant` its value when it is one.
 */
function checkConvertible(from: string, to: string, at: { line: number; column: number; endLine?: number; endColumn?: number },
                          constant: bigint | undefined): void {
    if (!convertsImplicitly(from, to)) {
        const named = from === LITERAL_INT ? 'INT' : from;
        fail(at, `Type mismatch: a value of type ${named} cannot be used where ${to} is expected. `
            + `IEC 61131-3 converts implicitly only to a wider type of the same kind; convert it explicitly, for example with ${named}_TO_${to}`);
    }
    const range = constant === undefined ? undefined : integerRange(to);
    if (range && constant !== undefined && (constant < range.low || constant > range.high)) {
        fail(at, `The constant ${constant} does not fit ${to} (${range.low} to ${range.high})`);
    }
}

/** Emit the comparison `op` of the two values on the stack, read as `type`. */
function emitCompare(state: CodeGenState, op: CompareOp, type: string): void {
    if (type === 'LREAL') {
        // one opcode for each operator: a NaN is unordered (false, except <>), -0.0 equals +0.0
        emit(state, `    ${{ EQ: 'EQD', NE: 'NED', LT: 'LTD', LE: 'LED', GT: 'GTD', GE: 'GED' }[op]}`);
        return;
    }
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

/** Take `size` bytes of WORK memory after the symbols and the literal pool. */
function allocateWork(state: CodeGenState, size: number, alignment: number): number {
    const address = alignTo(state.stringLiteralNextAddr, alignment);
    state.stringLiteralNextAddr = address + size;
    state.scratchStrings.push({ address, size });
    return address;
}

/**
 * A work buffer for a new string of up to `capacity` characters, with its capacity field written.
 * The buffers are reused from one statement to the next (CMP-021).
 */
function acquireStringBuffer(state: CodeGenState, capacity: number): number {
    const bound = state.resultCapacity;
    state.resultCapacity = null;

    // The call is the right side of an assignment to a string variable: the result goes there
    if (state.resultBuffer) {
        const { address } = state.resultBuffer;
        state.resultBuffer = null;
        return address;
    }
    // a count written as a constant bounds the result of LEFT, RIGHT and MID
    if (bound !== null) capacity = Math.min(capacity, bound);
    const size = 4 + capacity + 1;
    let buffer = state.stringBuffers
        .filter((candidate) => candidate.free && candidate.size >= size)
        .sort((a, b) => a.size - b.size)[0];
    if (buffer) {
        buffer.free = false;
    } else {
        buffer = { address: allocateWork(state, size, 2), size, free: false };
        state.stringBuffers.push(buffer);
    }
    emit(state, `    PUSH16 ${capacity}`);
    emit(state, `    STORE16 ${formatAddress(buffer.address + 2)}   ; string buffer capacity`);
    return buffer.address;
}

const STRING_FUNCTION_NAMES = new Set(['LEN', 'CONCAT', 'COPY', 'CLEAR', 'LEFT', 'RIGHT', 'MID', 'FIND', 'INSERT', 'DELETE', 'REPLACE', 'STRCMP', 'EQ_STRING', 'NE_STRING']);
function isStringFunction(name: string): boolean {
    return STRING_FUNCTION_NAMES.has(name.toUpperCase());
}

/** Characters the string `expr` is known to hold at most; 80 (the default STRING) when it is not known. */
function stringCapacityOf(state: CodeGenState, expr: Expression): number {
    switch (expr.kind) {
        case 'StringLiteral':
            return Math.max(1, expr.value.length);
        case 'FunctionCall': {
            const userFunction = state.functionTable.get(expr.name);
            if (userFunction) return parseStringType(userFunction.returnType)?.capacity ?? 80;
            const args = expr.args.map((a) => ((a as any).kind === 'NamedArgument' ? (a as any).value : a) as Expression);
            switch (expr.name.toUpperCase()) {
                case 'LEFT': case 'RIGHT': case 'MID': {
                    // a constant count bounds the result
                    const whole = args[0] ? stringCapacityOf(state, args[0]) : 80;
                    const count = args[expr.name.toUpperCase() === 'MID' ? 2 : 1];
                    const constant = count ? constantIndexValue(count) : undefined;
                    return constant === undefined ? whole : Math.max(1, Math.min(whole, constant));
                }
                case 'DELETE':
                    return args[0] ? stringCapacityOf(state, args[0]) : 80;
                case 'CONCAT': case 'INSERT': case 'REPLACE':
                    return args.length > 1 ? Math.min(0xFFFF, stringCapacityOf(state, args[0]) + stringCapacityOf(state, args[1])) : 80;
                default:
                    return 80;
            }
        }
        default: {
            try {
                const text = parseStringType(storedType(state, resolvePlace(state, expr).type));
                return text ? text.capacity : 80;
            } catch (error) {
                if (error instanceof CodegenError) return 80;
                throw error;
            }
        }
    }
}

/** Call a string routine, adding it (and the work cells the string routines share) to the program the first time. */
function callStringHelper(state: CodeGenState, name: 'strappend' | 'strfind' | 'strsub' | 'strdel'): void {
    const label = `_zplc_${name}`;
    if (!state.cellHelpers.has(label)) {
        if (!state.stringCells) {
            const base = allocateWork(state, 24, 4);
            state.stringCells = { c0: base, c1: base + 4, c2: base + 8, c3: base + 12, c4: base + 16, c5: base + 20 };
        }
        const cells = state.stringCells;
        if (name === 'strfind') {
            state.cellHelpers.set(label, strfindHelper(label, cells));
        } else {
            state.helpers.add('memcpy');
            const build = { strappend: strappendHelper, strsub: strsubHelper, strdel: strdelHelper }[name];
            state.cellHelpers.set(label, build(label, cells, MEMCPY_LABEL));
        }
    }
    emit(state, `    CALL ${label}`);
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
        stringTemp: (capacity: number) => acquireStringBuffer(state, capacity),
        stringCapacity: (e: Expression) => stringCapacityOf(state, e),
        callHelper: (name) => callStringHelper(state, name),
        callRoutine: (label) => linkRoutine(state, label),
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
        if (parseStringType(inferExpressionType(state, expr.left))?.wide || parseStringType(inferExpressionType(state, expr.right))?.wide) {
            fail(expr, `A WSTRING cannot be compared yet`);
        }
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

    checkOperands(state, expr);

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
    const double = opType === 'LREAL';
    const target = opType === 'REAL' || double || isUnsigned32(opType) ? opType : UNKNOWN_TYPE;

    emitConverted(state, expr.left, target);
    emitConverted(state, expr.right, target);

    switch (expr.operator) {
        // Arithmetic operators - use float variants when operands are REAL, double ones for LREAL
        case 'ADD': emit(state, double ? `    ADDD` : useFloat ? `    ADDF` : `    ADD`); break;
        case 'SUB': emit(state, double ? `    SUBD` : useFloat ? `    SUBF` : `    SUB`); break;
        case 'MUL': emit(state, double ? `    MULD` : useFloat ? `    MULF` : `    MUL`); break;
        case 'DIV':
            if (double) {
                emit(state, `    DIVD`);
            } else if (useFloat) {
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

const OPERATOR_TEXT: Record<BinaryExpr['operator'], string> = {
    AND: 'AND', OR: 'OR', XOR: 'XOR', ADD: '+', SUB: '-', MUL: '*', DIV: '/', MOD: 'MOD', POW: '**',
    EQ: '=', NE: '<>', LT: '<', LE: '<=', GT: '>', GE: '>=',
};

/**
 * The operands of an operator must be of types it is defined for (CMP-005): arithmetic takes numbers, not BOOL
 * (and MOD takes integers); AND, OR and XOR take BOOL with BOOL, or bit strings and integers with each other,
 * never REAL; a comparison does not mix BOOL with a number.
 */
function checkOperands(state: CodeGenState, expr: BinaryExpr): void {
    const operands: Array<[Expression, string]> = [
        [expr.left, meaningType(state, expr.left)],
        [expr.right, meaningType(state, expr.right)],
    ];
    const kind = (type: string): TypeKind | 'integer' | undefined => (type === LITERAL_INT ? 'integer' : typeKind(type));
    const [left, right] = [kind(operands[0]![1]), kind(operands[1]![1])];
    const text = OPERATOR_TEXT[expr.operator];
    const named = (type: string) => (type === LITERAL_INT ? 'INT' : type);

    switch (expr.operator) {
        case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD':
            for (const [operand, type] of operands) {
                const k = kind(type);
                if (k === 'bool') fail(operand, `Type mismatch: the operator ${text} takes numbers and this is a BOOL`);
                if (expr.operator === 'MOD' && k === 'real') fail(operand, `Type mismatch: MOD takes integers and this is a ${named(type)}`);
            }
            return;
        case 'AND': case 'OR': case 'XOR':
            for (const [operand, type] of operands) {
                if (kind(type) === 'real') fail(operand, `Type mismatch: the operator ${text} takes BOOL or bit strings and this is a ${named(type)}`);
            }
            if ((left === 'bool') !== (right === 'bool') && left !== undefined && right !== undefined) {
                const [operand, type] = left === 'bool' ? operands[1]! : operands[0]!;
                fail(operand, `Type mismatch: the operator ${text} takes two BOOL or two bit strings, not a BOOL with a ${named(type)}`);
            }
            return;
        case 'EQ': case 'NE': case 'LT': case 'LE': case 'GT': case 'GE':
            if ((left === 'bool') !== (right === 'bool') && left !== undefined && right !== undefined) {
                const [operand, type] = left === 'bool' ? operands[1]! : operands[0]!;
                fail(operand, `Type mismatch: a BOOL cannot be compared with a ${named(type)}`);
            }
            return;
        default:
            return;
    }
}

/** A binary operation on 64-bit integers: each operand is two cells, low word below the high word. */
function emitWideBinary(state: CodeGenState, expr: BinaryExpr, opType: string): void {
    emitConverted(state, expr.left, opType);
    emitConverted(state, expr.right, opType);

    // LINT and DT are signed; ULINT and LWORD divide and take the remainder as unsigned values (CMP-012, CMP-015)
    const signed = numericInfo(opType)?.signed === true;
    switch (expr.operator) {
        case 'ADD': callHelper(state, 'add64', ADD64_LABEL); break;
        case 'SUB': callHelper(state, 'sub64', SUB64_LABEL); break;
        case 'MUL': emit(state, `    MUL64`); break;
        case 'DIV': emit(state, signed ? `    DIVS64` : `    DIVU64`); break;
        case 'MOD': emit(state, signed ? `    MODS64` : `    MODU64`); break;
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

/**
 * The type of the parameters of the standard functions that name one: a constant argument must fit it, and
 * a literal over 2147483647 is a DWORD, not an error (CMP-012).
 */
const STANDARD_PARAMETER_TYPE: Record<string, string> = {
    AND_WORD: 'WORD', OR_WORD: 'WORD', XOR_WORD: 'WORD', NOT_WORD: 'WORD',
    AND_DWORD: 'DWORD', OR_DWORD: 'DWORD', XOR_DWORD: 'DWORD', NOT_DWORD: 'DWORD',
};

/** `value` as the argument of a parameter of `type`: checked, and a constant carries the type it is given to. */
function typedArgument(state: CodeGenState, value: Expression, type: string): Expression {
    const constant = foldConstant(state, value);
    const from = meaningType(state, value);
    checkConvertible(from, type, value, constant);
    warnNarrowing(state, value, from, type, constant);
    if (constant === undefined) return value;
    return { kind: 'IntLiteral', value: Number(constant), literalType: type, line: value.line, column: value.column, endLine: value.endLine, endColumn: value.endColumn };
}

/**
 * The argument of each parameter of a call, in the order of the parameters (CMP-035). An argument is written
 * by position or `name := value`, in any order of the names. A parameter that is bound twice, a name the
 * function does not have, a positional argument after a named one, one argument too many and a required
 * parameter with no argument are errors. A parameter that declares an initial value may be left out: the
 * entry is undefined and the caller uses the declared value.
 */
function bindArguments(state: CodeGenState, call: FunctionCall, inputs: VarDecl[]): Array<Expression | undefined> {
    const bound: Array<Expression | undefined> = new Array(inputs.length).fill(undefined);
    let positional = 0;
    let named = false;
    for (const arg of call.args) {
        if ((arg as { kind: string }).kind === 'NamedArgument') {
            const argument = arg as NamedArgument;
            named = true;
            const index = inputs.findIndex((input) => sameName(input.name, argument.name));
            if (index < 0) fail(argument as { line: number; column: number }, `Function '${call.name}' has no input parameter '${argument.name}'`);
            if (bound[index] !== undefined) fail(argument as { line: number; column: number }, `Parameter '${inputs[index]!.name}' of function '${call.name}' is given twice`);
            bound[index] = argument.value;
        } else {
            if (named) fail(arg as Expression, `In a call of '${call.name}', an argument by position cannot follow one by name`);
            if (positional >= inputs.length) {
                fail(arg as Expression, `Function '${call.name}' takes ${inputs.length} argument(s)`);
            }
            bound[positional++] = arg as Expression;
        }
    }
    inputs.forEach((input, index) => {
        if (bound[index] === undefined && !input.initialValue) {
            fail(call, `Function '${call.name}' is called without its parameter '${input.name}'`);
        }
    });
    return bound;
}

/** The standard functions that take 64-bit integers and LREAL (two cells) as well as one-cell values. */
const WIDE_FUNCTIONS = new Set([
    'ABS', 'NEG', 'ABSF', 'NEGF', 'MAX', 'MIN', 'LIMIT', 'SEL', 'MUX', 'SQRT', 'EXPT', 'TRUNC', 'ROUND',
    'SIN', 'COS', 'TAN', 'LN', 'LOG', 'EXP', 'ASIN', 'ACOS', 'ATAN', 'ATAN2', 'SHL', 'SHR', 'ROL', 'ROR',
]);

function emitFunctionCall(state: CodeGenState, expr: FunctionCall): void {
    // a method of the block being generated, called by its name (CMP-041)
    const implicit = implicitMethodCall(state, expr);
    if (implicit) {
        emitMethodCall(state, implicit);
        return;
    }

    // 1. Check if it's a user-defined function
    const userFn = state.functionTable.get(expr.name);
    if (userFn) {
        emit(state, `    ; CALL ${expr.name}(...)`);

        // Push the arguments in the order of the parameters, bound by name or by position (CMP-035); an
        // integer given to a REAL parameter is converted
        const bound = bindArguments(state, expr, userFn.inputs);
        userFn.inputs.forEach((input, index) => {
            const value = bound[index] ?? input.initialValue as Expression;
            const type = storedType(state, input.dataType);
            if (isStringType(type)) {
                // a string goes by address; the function copies it (it never changes the caller's)
                if (value.kind === 'StringLiteral') checkStringFits(value, type, input.name);
                emitExpression(state, value);
            } else if (isAggregateType(state, type)) {
                // a structure or an array goes by address; the function copies it
                emitAddr(state, aggregateSource(state, value, type, value, input.name).addr);
            } else if (isPointerType(type)) {
                checkReferenceValue(state, type, value, input.name);
                emitReferenceValue(state, type, value);
            } else {
                emitValueFor(state, value, input.dataType);
            }
        });

        emit(state, `    CALL ${userFn.label}`);
        const returned = storedType(state, userFn.returnType);
        const text = parseStringType(returned);
        if (text) {
            // [address of the function's result]: copy it, the next call of the function overwrites it
            const buffer = acquireStringBuffer(state, text.capacity);
            emit(state, `    PUSH16 ${buffer}`);
            emit(state, `    STRCPY`);
            emit(state, `    PUSH16 ${buffer}   ; ${expr.name} result`);
        }
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

    // Most standard functions work on one cell per operand; the ones in WIDE_FUNCTIONS (and the conversions)
    // are written for two-cell values as well
    for (const arg of expr.args) {
        const value = ((arg as any).kind === 'NamedArgument' ? (arg as any).value : arg) as Expression;
        const argType = staticType(state, value);
        if (isWide(argType) && !WIDE_FUNCTIONS.has(expr.name.toUpperCase()) && conversionResultType(expr.name) === undefined) {
            fail(expr, `${expr.name} does not take a 64-bit or LREAL argument (CMP-015): use a conversion function first`);
        }
        // the string routines of the VM work on one-byte characters
        if (expr.name.toUpperCase() !== 'LEN' && isStringFunction(expr.name)
            && parseStringType(inferExpressionType(state, value))?.wide) {
            fail(value, `${expr.name} does not take a WSTRING yet: only LEN, assignment and initial values do`);
        }
    }

    emit(state, `    ; ${expr.name}(...)`);

    state.resultCapacity = isStringFunction(expr.name) ? stringCapacityOf(state, expr) : null;

    // Create code generation context for inline function
    // (baseAddress is not used for stateless functions)
    const ctx = makeCodeGenContext(state, 0, expr.name, expr);

    // Let the function generate its inline code
    // Convert args to pure expressions (ignoring names for built-ins for now)
    const formal = STANDARD_PARAMETER_TYPE[expr.name.toUpperCase()];
    const simpleArgs = expr.args.map(a => 
        (a as any).kind === 'NamedArgument' ? (a as any).value : a
    ).map((value: Expression) => formal === undefined ? value : typedArgument(state, value, formal)) as Expression[];

    fnDef.generateInline(ctx, simpleArgs);
    state.resultCapacity = null;
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

    const suffix = getLoadStoreSuffix(storedType(state, sym.dataType) as DataTypeValue);
    emit(state, `    STORE${suffix} ${formatAddress(sym.address)}`);
}

// ============================================================================
// Places: where a variable lives (CMP-019, CMP-022, CMP-023, CMP-024, CMP-028)
//
// A place is an address the generator can compute: a constant for a plain variable,
// a constant plus offsets for a member, an index term for an array element, and a
// read of a stored address for a VAR_IN_OUT member or a dereferenced reference.
// Every read and write of a variable goes through one, so a structure member, an
// array element, a function-block member and a reference are all loaded and stored
// at their declared width.
// ============================================================================

type Addr =
    | { k: 'const'; a: number }
    | { k: 'add'; base: Addr; off: number }
    | { k: 'index'; base: Addr; index: Expression; lower: number; count: number; stride: number }
    /** The address is the 32-bit value stored at `ptr`. */
    | { k: 'deref'; ptr: Addr };

interface Place {
    addr: Addr;
    /** Declared type of the stored value (an enumeration is still its own name here). */
    type: STDataType | ArrayType;
    size: number;
    /** The variable, when the place is exactly one. */
    sym?: Symbol;
    /** A constant: no statement may assign it (CMP-026). */
    readonly?: boolean;
    /** Source text for messages. */
    name: string;
}

/** The address `0xFFFF`: no memory region contains it, so any access through it is a VM fault (CMP-024). */
const NULL_REFERENCE = 0xFFFF;

/** Address inside the CODE region: a load from it ends the scan with the VM fault of a memory access violation. */
const FAULT_ADDRESS = MEMORY_REGION.CODE.base;

function addOffset(base: Addr, off: number): Addr {
    if (off === 0) return base;
    if (base.k === 'const') return { k: 'const', a: base.a + off };
    if (base.k === 'add') return { k: 'add', base: base.base, off: base.off + off };
    return { k: 'add', base, off };
}

function staticAddress(place: Place): number | undefined {
    return place.addr.k === 'const' ? place.addr.a : undefined;
}

function isPointerType(type: unknown): type is PointerType {
    return typeof type === 'object' && type !== null && (type as { kind?: string }).kind === 'PointerType';
}

/** The type a value is stored and computed as: an enumeration is its base type. */
function storedType(state: CodeGenState, type: STDataType | ArrayType): STDataType | ArrayType {
    return state.symbols.effectiveType(type);
}

function isStringType(type: unknown): boolean {
    return parseStringType(type) !== null;
}

/** A structure, a function block or an array: a value of one is copied as bytes and passed by address. */
function isAggregateType(state: CodeGenState, type: STDataType | ArrayType): boolean {
    if (isArrayType(type as STDataType)) return true;
    if (typeof type !== 'string') return false;
    return state.symbols.isStructType(type) || state.symbols.isFBType(type);
}

function placeOfMember(state: CodeGenState, owner: Place, member: MemberInfo, name: string): Place {
    const slot = addOffset(owner.addr, member.offset);
    const readonly = owner.readonly || member.section === VarSection.CONSTANT;
    if (member.section === VarSection.VAR_IN_OUT) {
        // the slot holds the address of the caller's variable (CMP-028)
        return { addr: { k: 'deref', ptr: slot }, type: member.dataType, size: state.symbols.sizeOf(member.dataType), name, readonly };
    }
    return { addr: slot, type: member.dataType, size: member.size, name, readonly };
}

function identifierPlace(state: CodeGenState, expr: Identifier): Place {
    const name = expr.name;

    // 1. Inputs, outputs and locals of the method being inlined: statics with a mangled name
    if (state.currentMethod) {
        const method = state.currentMethod as any;
        const findVar = (list: any[]) => list && list.find((v: any) => sameName(v.name, name));
        const methodVar = findVar(method.inputs) || findVar(method.outputs) || findVar(method.locals);
        if (methodVar && methodVar.mangledName) {
            const sym = state.symbols.get(methodVar.mangledName);
            if (sym) return { addr: { k: 'const', a: sym.address }, type: sym.dataType, size: sym.size, sym, name };
        }
    }

    // 2. Members of the function block instance being inlined (implicit THIS)
    const instance = state.currentFBInstance;
    if (instance && typeof instance.dataType === 'string') {
        const member = state.symbols.getFBDefinition(instance.dataType)?.members.get(name);
        if (member) {
            const owner: Place = { addr: { k: 'const', a: instance.address }, type: instance.dataType, size: instance.size, sym: instance, name: instance.name };
            return placeOfMember(state, owner, member, name);
        }
    }

    // 3. A global, a program variable or the variable of a function
    const sym = state.symbols.get(name);
    if (!sym) fail(expr, `Unknown identifier '${name}'`);
    return { addr: { k: 'const', a: sym.address }, type: sym.dataType, size: sym.size, sym, readonly: sym.section === VarSection.CONSTANT, name };
}

function memberPlace(state: CodeGenState, owner: Place, expr: MemberAccess): Place {
    const typeName = owner.type;
    const name = `${owner.name}.${expr.member}`;
    if (typeof typeName !== 'string') {
        fail(expr, `Cannot access member '${expr.member}' of '${owner.name}': it is not a structure or a function block`);
    }

    const struct = state.symbols.getStructDefinition(typeName);
    if (struct) {
        const member = struct.members.get(expr.member);
        if (!member) fail(expr, `Unknown member '${expr.member}' on struct '${typeName}'`);
        return placeOfMember(state, owner, member, name);
    }

    const fb = state.symbols.getFBDefinition(typeName);
    if (fb) {
        const member = fb.members.get(expr.member);
        if (!member) fail(expr, `Unknown member '${expr.member}' on FB '${typeName}'`);
        return placeOfMember(state, owner, member, name);
    }

    const standard = getFB(typeName as DataTypeValue);
    if (standard) {
        const member = standard.members.find((m) => sameName(m.name, expr.member));
        if (!member) fail(expr, `Unknown member '${expr.member}' on FB '${typeName}'`);
        return { addr: addOffset(owner.addr, member.offset), type: stdlibMemberType(typeName, member), size: member.size, name };
    }

    fail(expr, `Cannot access member '${expr.member}' of '${owner.name}': type '${typeName}' has no members`);
}

/** Value of a constant index: a literal or its negation. */
function constantIndexValue(expr: Expression): number | undefined {
    const value = constantInteger(expr);
    return value === undefined ? undefined : Number(value);
}

function arrayPlace(state: CodeGenState, expr: ArrayAccess): Place {
    const array = resolvePlace(state, expr.array);
    if (!isArrayType(array.type as STDataType)) fail(expr, `'${array.name}' is not an array`);
    const type = array.type as ArrayType;
    const dims = type.dimensions;
    if (expr.indices.length !== dims.length) {
        fail(expr, `'${array.name}' has ${dims.length} dimension${dims.length === 1 ? '' : 's'}, ${expr.indices.length} given`);
    }

    const elementSize = state.symbols.sizeOf(type.elementType);
    let addr = array.addr;
    for (let d = 0; d < dims.length; d++) {
        const count = dims[d].upperBound - dims[d].lowerBound + 1;
        const inner = dims.slice(d + 1).reduce((n, dim) => n * (dim.upperBound - dim.lowerBound + 1), 1);
        const stride = inner * elementSize;
        const index = expr.indices[d];
        const constant = constantIndexValue(index);
        if (constant !== undefined) {
            // CMP-023: a constant index outside the bounds is a compile error
            if (constant < dims[d].lowerBound || constant > dims[d].upperBound) {
                fail(index, `Array index ${constant} is outside the bounds ${dims[d].lowerBound}..${dims[d].upperBound} of '${array.name}'`);
            }
            addr = addOffset(addr, (constant - dims[d].lowerBound) * stride);
        } else {
            const indexType = staticType(state, index);
            if (isFloatType(indexType)) fail(index, `An array index must be an integer, not ${indexType}`);
            if (isWide(indexType)) {
                // a 64-bit value cut to its low word could name an element that is not the one it says
                fail(index, `An array index must be a 32-bit integer, not ${indexType}: convert it, for example with ${indexType}_TO_DINT`);
            }
            addr = { k: 'index', base: addr, index, lower: dims[d].lowerBound, count, stride };
        }
    }
    return { addr, type: type.elementType, size: elementSize, name: `${array.name}[...]`, readonly: array.readonly };
}

/** The place an expression names: a variable, a member, an array element or a dereferenced reference. */
function resolvePlace(state: CodeGenState, expr: Expression): Place {
    switch (expr.kind) {
        case 'Identifier':
            return identifierPlace(state, expr);
        case 'ThisExpr': {
            const instance = state.currentFBInstance;
            if (!instance) fail(expr, `THIS used outside of FB/method context`);
            return { addr: { k: 'const', a: instance.address }, type: instance.dataType, size: instance.size, sym: instance, name: 'THIS' };
        }
        case 'MemberAccess':
            return memberPlace(state, resolvePlace(state, expr.object), expr);
        case 'ArrayAccess':
            return arrayPlace(state, expr);
        case 'DereferenceExpr': {
            const pointer = resolvePlace(state, expr.operand);
            if (!isPointerType(pointer.type)) {
                fail(expr, `'${pointer.name}' is not a reference: only a REF_TO variable can be dereferenced`);
            }
            const base = pointer.type.baseType;
            return { addr: { k: 'deref', ptr: pointer.addr }, type: base, size: state.symbols.sizeOf(base), name: `${pointer.name}^` };
        }
        default:
            fail(expr, `${stringifyExpression(expr)} is not a variable`);
    }
}

/** Push an integer constant (an address, an offset, a stride) with the shortest PUSH. */
function emitPushInteger(state: CodeGenState, value: number): void {
    emitIntLiteral(state, { kind: 'IntLiteral', value, line: 0, column: 0 });
}

/** Leave the address of the place on the stack. */
function emitAddr(state: CodeGenState, addr: Addr): void {
    switch (addr.k) {
        case 'const':
            emitPushInteger(state, addr.a);
            return;
        case 'add':
            emitAddr(state, addr.base);
            emitPushInteger(state, addr.off);
            emit(state, `    ADD`);
            return;
        case 'index': {
            emitAddr(state, addr.base);
            emitExpression(state, addr.index);
            if (addr.lower !== 0) {
                emitPushInteger(state, addr.lower);
                emit(state, `    SUB`);
            }
            if (state.arrayBoundsCheck) {
                // CMP-023: an index outside the bounds is a VM fault, never a write over the next variable.
                // One unsigned compare covers both ends: a negative offset is a very large one.
                const ok = newLabel(state, 'index_ok');
                emit(state, `    DUP`);
                emitPushInteger(state, addr.count);
                emit(state, `    LTU`);
                emit(state, `    JNZ ${ok}`);
                emitFault(state, 'array index out of bounds');
                emit(state, `${ok}:`);
            }
            if (addr.stride !== 1) {
                emitPushInteger(state, addr.stride);
                emit(state, `    MUL`);
            }
            emit(state, `    ADD`);
            return;
        }
        case 'deref':
            if (addr.ptr.k === 'const') {
                emit(state, `    LOAD32 ${formatAddress(addr.ptr.a)}   ; reference`);
            } else {
                emitAddr(state, addr.ptr);
                emit(state, `    LOADI32`);
            }
            return;
    }
}

/**
 * Raise the VM fault of a memory access violation: every address of the CODE region is refused by LOADI.
 * The HALT after it is never reached; it ends the path for the loader's stack verifier (RT-003), which
 * cannot know that the access faults and would otherwise join this path, one value deeper, with the
 * path that passed the check.
 */
function emitFault(state: CodeGenState, why: string): void {
    emit(state, `    PUSH16 ${FAULT_ADDRESS}   ; fault: ${why}`);
    emit(state, `    LOADI8`);
    emit(state, `    HALT   ; not reached`);
}

/** Width in bits of the load or store of a scalar place. */
function accessWidth(state: CodeGenState, place: Place): '8' | '16' | '32' | '64' {
    if (isPointerType(place.type)) return '32';
    const type = storedType(state, place.type);
    // the member of a standard function block declares its size, not always a type
    if (typeof type === 'string' && numericTypeName(type) === UNKNOWN_TYPE && place.size > 0) return getSizeSuffix(place.size as MemberSize);
    return getLoadStoreSuffix(type as DataTypeValue);
}

/** Push the value of a scalar place; a string, a structure or an array gives its address. */
function emitLoadPlace(state: CodeGenState, place: Place, label?: string): void {
    const type = storedType(state, place.type);
    const comment = label ? `   ; ${label}` : '';

    if (isStringType(type) || isAggregateType(state, type)) {
        if (place.addr.k === 'const') {
            emit(state, `    PUSH16 ${formatAddress(place.addr.a)}   ; &${label ?? place.name}`);
        } else {
            emitAddr(state, place.addr);
        }
        return;
    }

    const width = accessWidth(state, place);
    if (place.addr.k === 'const') {
        const sym = place.sym;
        // Bit-addressed BOOL (e.g. AT %QX0.1): extract the specific bit from the byte
        if (sym && sym.dataType === 'BOOL' && sym.ioAddress &&
            (sym.ioAddress.size === 'X' || sym.ioAddress.bitOffset !== undefined)) {
            const bitPos = sym.ioAddress.bitOffset;
            emit(state, `    LOAD8 ${formatAddress(sym.address)}   ; ${label ?? sym.name} (byte)`);
            if (bitPos > 0) {
                emit(state, `    PUSH8 ${bitPos}`);
                emit(state, `    SHR                 ; extract bit ${bitPos}`);
            }
            emit(state, `    PUSH8 1`);
            emit(state, `    AND                 ; mask to 0 or 1`);
            return;
        }
        emit(state, `    LOAD${width} ${formatAddress(place.addr.a)}${comment}`);
        return;
    }

    emitAddr(state, place.addr);
    if (width === '64') {
        // two 32-bit reads: [lo hi], the order LOAD64 leaves
        emit(state, `    DUP`);
        emit(state, `    LOADI32`);
        emit(state, `    SWAP`);
        emit(state, `    PUSH8 4`);
        emit(state, `    ADD`);
        emit(state, `    LOADI32`);
        return;
    }
    emit(state, `    LOADI${width}${comment}`);
}

/**
 * Store a scalar into a place. `emitValue` leaves the value on the stack; for a place whose
 * address is computed the address is pushed first, below it.
 */
function emitStorePlace(state: CodeGenState, place: Place, emitValue: () => void): void {
    const width = accessWidth(state, place);
    if (place.addr.k === 'const') {
        emitValue();
        const sym = place.sym;
        if (sym && sym.dataType === 'BOOL' && sym.ioAddress &&
            (sym.ioAddress.size === 'X' || sym.ioAddress.bitOffset !== undefined)) {
            emitStore(state, sym);
        } else {
            emit(state, `    STORE${width} ${formatAddress(place.addr.a)}`);
        }
        return;
    }

    emitAddr(state, place.addr);
    emitValue();
    if (width === '64') {
        // [addr lo hi]: the high word goes to addr+4, the low word to addr
        emit(state, `    PICK 2`);
        emit(state, `    PUSH8 4`);
        emit(state, `    ADD`);
        emit(state, `    SWAP`);
        emit(state, `    STOREI32`);
        emit(state, `    STOREI32`);
        return;
    }
    emit(state, `    STOREI${width}`);
}

/**
 * Copy `size` bytes: [dst src] -> []. Each side is the address of a place; a short copy
 * is unrolled in words, a long one calls the byte-copy routine.
 */
function emitCopyBytes(state: CodeGenState, size: number, dst: Place | null, src: Place | null): void {
    const dstConst = dst ? staticAddress(dst) : undefined;
    const srcConst = src ? staticAddress(src) : undefined;

    if (dstConst !== undefined && srcConst !== undefined && dst && src) {
        // both sides are fixed: direct loads and stores, no address arithmetic
        let off = 0;
        while (off < size) {
            const chunk = size - off >= 4 ? 4 : size - off >= 2 ? 2 : 1;
            emit(state, `    LOAD${chunk * 8} ${formatAddress(srcConst + off)}`);
            emit(state, `    STORE${chunk * 8} ${formatAddress(dstConst + off)}`);
            off += chunk;
        }
        return;
    }

    if (dst) emitAddr(state, dst.addr);
    if (src) emitAddr(state, src.addr);
    if (size > 32) {
        emit(state, `    PUSH16 ${size}`);
        callHelper(state, 'memcpy', MEMCPY_LABEL);
        return;
    }
    let off = 0;
    while (off < size) {
        const chunk = size - off >= 4 ? 4 : size - off >= 2 ? 2 : 1;
        emit(state, `    PICK 1`);
        if (off) { emitPushInteger(state, off); emit(state, `    ADD`); }
        emit(state, `    PICK 1`);
        if (off) { emitPushInteger(state, off); emit(state, `    ADD`); }
        emit(state, `    LOADI${chunk * 8}`);
        emit(state, `    STOREI${chunk * 8}`);
        off += chunk;
    }
    emit(state, `    DROP`);
    emit(state, `    DROP`);
}

/** Clear `size` bytes at a fixed address. */
function emitZeroBytes(state: CodeGenState, address: number, size: number): void {
    if (size > 16) {
        emitPushInteger(state, address);
        emit(state, `    PUSH16 ${size}`);
        callHelper(state, 'memzero', MEMZERO_LABEL);
        return;
    }
    let off = 0;
    while (off < size) {
        const chunk = size - off >= 4 ? 4 : size - off >= 2 ? 2 : 1;
        emit(state, `    PUSH8 0`);
        emit(state, `    STORE${chunk * 8} ${formatAddress(address + off)}`);
        off += chunk;
    }
}

/**
 * Whether `value` names a variable (or a member, an element) of exactly `type`: the only
 * thing a whole structure or array can be assigned from.
 */
function aggregateSource(state: CodeGenState, value: Expression, type: STDataType | ArrayType, at: { line: number; column: number }, target: string): Place {
    let place: Place;
    try {
        place = resolvePlace(state, value);
    } catch (error) {
        if (error instanceof CodegenError) throw error;
        throw error;
    }
    if (typeText(storedType(state, place.type)) !== typeText(type)) {
        fail(at, `Cannot assign ${typeText(place.type)} to '${target}' of type ${typeText(type)}`);
    }
    return place;
}

/** `target := value` for any target the place machinery resolves. */
function emitAssignToPlace(state: CodeGenState, place: Place, value: Expression, at: { line: number; column: number }): void {
    if (place.readonly) fail(at, `Cannot assign to constant '${place.name}'`);

    const type = storedType(state, place.type);

    if (isStringType(type)) {
        emitStringAssign(state, place, value, at);
        return;
    }

    if (isAggregateType(state, type)) {
        const source = aggregateSource(state, value, type, value, place.name);
        emit(state, `    ; copy ${place.size} bytes`);
        emitCopyBytes(state, place.size, place, source);
        return;
    }

    if (isPointerType(type)) {
        checkReferenceValue(state, type, value, place.name);
        emitStorePlace(state, place, () => emitReferenceValue(state, type, value));
        return;
    } else if (value.kind === 'ReferenceExpr' || valueIsReference(state, value)) {
        // CMP-024: a reference is not a number
        fail(value, `Cannot assign a reference to '${place.name}' of type ${typeText(type)}: only a REF_TO variable holds one`);
    }

    emitStorePlace(state, place, () => emitValueFor(state, value, type));
}

/** The places an expression reads, as fixed address ranges; null when one of them is not fixed or is a call that may write. */
function readRanges(state: CodeGenState, expr: Expression, out: Array<{ from: number; to: number }>): boolean {
    switch (expr.kind) {
        case 'Identifier':
        case 'MemberAccess':
        case 'ArrayAccess':
        case 'DereferenceExpr': {
            if (expr.kind === 'Identifier' && (expr.name.includes('#') || expr.name.toUpperCase() === 'NULL')) return true;
            let place: Place;
            try {
                place = resolvePlace(state, expr);
            } catch (error) {
                if (error instanceof CodegenError) return true; // the real error comes later
                throw error;
            }
            if (place.addr.k !== 'const') return false;
            out.push({ from: place.addr.a, to: place.addr.a + Math.max(1, place.size) });
            if (expr.kind === 'ArrayAccess') {
                // the indices read variables of their own
                for (const index of expr.indices) if (!readRanges(state, index, out)) return false;
            }
            return true;
        }
        case 'FunctionCall': {
            if (state.functionTable.has(expr.name)) return false; // a function of the program may write any variable
            for (const arg of expr.args) {
                const value = ((arg as any).kind === 'NamedArgument' ? (arg as any).value : arg) as Expression;
                if (!readRanges(state, value, out)) return false;
            }
            return true;
        }
        case 'UnaryExpr':
            return readRanges(state, expr.operand, out);
        case 'BinaryExpr':
            return readRanges(state, expr.left, out) && readRanges(state, expr.right, out);
        case 'MethodCall':
        case 'ThisExpr':
            return false;
        default:
            return true;
    }
}

/** Whether the expression may read the storage `[from, to)`, or be unable to tell. */
function mayReadRange(state: CodeGenState, expr: Expression, from: number, to: number): boolean {
    const ranges: Array<{ from: number; to: number }> = [];
    if (!readRanges(state, expr, ranges)) return true;
    return ranges.some((range) => range.from < to && from < range.to);
}

/**
 * `target := LEFT(...)` and the other string functions that build a string: when the target is a
 * fixed variable and nothing the call reads overlaps it, the function writes its result straight
 * into the variable and no work buffer is needed; `s := CONCAT(s, x)`, `s := LEFT(s, n)`,
 * `s := RIGHT(s, n)`, `s := MID(s, p, n)` and `s := DELETE(s, p, n)` work on the variable in place
 * (CMP-021; the 256-byte WORK bucket of a program has no room for a copy of every string).
 * Returns false when the general path (a work buffer, then STRCPY) must be used.
 */
function emitStringFunctionInto(state: CodeGenState, place: Place, call: FunctionCall): boolean {
    const name = call.name.toUpperCase();
    if (state.functionTable.has(call.name)) return false;
    if (!['CONCAT', 'LEFT', 'RIGHT', 'MID', 'DELETE', 'INSERT', 'REPLACE'].includes(name)) return false;
    const args = call.args.map((arg) => ((arg as any).kind === 'NamedArgument' ? (arg as any).value : arg) as Expression);
    if (place.addr.k !== 'const' || args.length === 0) return false;
    const text = parseStringType(storedType(state, place.type));
    if (!text || text.wide) return false;
    const target = place.addr.a;
    const end = target + place.size;
    const first = args[0];
    const arity = { CONCAT: 2, LEFT: 2, RIGHT: 2, MID: 3, DELETE: 3, INSERT: 3, REPLACE: 4 }[name]!;
    if (args.length !== arity) return false;

    // the first argument is the target itself
    let firstIsTarget = false;
    if (first.kind === 'Identifier' || first.kind === 'MemberAccess' || first.kind === 'ArrayAccess') {
        try {
            const firstPlace = resolvePlace(state, first);
            firstIsTarget = firstPlace.addr.k === 'const' && firstPlace.addr.a === target
                && typeText(storedType(state, firstPlace.type)) === typeText(storedType(state, place.type));
        } catch (error) {
            if (!(error instanceof CodegenError)) throw error;
        }
    }

    const strings = name === 'CONCAT' ? [args[1]] : name === 'INSERT' || name === 'REPLACE' ? [args[1]] : [];
    const stringArgsRead = strings.some((arg) => mayReadRange(state, arg, target, end));

    if (firstIsTarget && !stringArgsRead && name !== 'INSERT' && name !== 'REPLACE') {
        if (name === 'CONCAT') {
            // the arguments of the call are evaluated before the variable changes
            emit(state, `    ; ${place.name} := CONCAT(${place.name}, ...) in place`);
            emitExpression(state, args[1]);
            emit(state, `    PUSH16 ${formatAddress(target)}`);
            emit(state, `    STRCAT`);
            return true;
        }
        emit(state, `    ; ${place.name} := ${name}(${place.name}, ...) in place`);
        emit(state, `    PUSH16 ${formatAddress(target)}`);
        switch (name) {
            case 'LEFT':
                emit(state, `    PUSH8 0`);
                emitExpression(state, args[1]);
                callStringHelper(state, 'strsub');
                break;
            case 'RIGHT':
                emit(state, `    PUSH16 ${formatAddress(target)}`);
                emit(state, `    STRLEN`);
                emitExpression(state, args[1]);
                emit(state, `    SUB`);
                emitExpression(state, args[1]);
                callStringHelper(state, 'strsub');
                break;
            case 'MID':
                emitExpression(state, args[1]);
                emit(state, `    PUSH8 1`);
                emit(state, `    SUB`);
                emitExpression(state, args[2]);
                callStringHelper(state, 'strsub');
                break;
            case 'DELETE':
                emitExpression(state, args[1]);
                emit(state, `    PUSH8 1`);
                emit(state, `    SUB`);
                emitExpression(state, args[2]);
                callStringHelper(state, 'strdel');
                break;
        }
        return true;
    }

    // nothing the call reads is the target: the function builds its result in the variable
    if (!args.some((arg) => mayReadRange(state, arg, target, end))) {
        emit(state, `    ; ${place.name} := ${name}(...) built in place`);
        // the declared capacity of the variable stays: the routines truncate to it
        state.resultBuffer = { address: target };
        emitFunctionCall(state, call);
        state.resultBuffer = null;
        emit(state, `    DROP`);
        return true;
    }
    return false;
}

/** Whether the value is a variable of a REF_TO type. */
function valueIsReference(state: CodeGenState, value: Expression): boolean {
    if (value.kind !== 'Identifier' && value.kind !== 'MemberAccess' && value.kind !== 'ArrayAccess') return false;
    try {
        return isPointerType(resolvePlace(state, value).type);
    } catch (error) {
        if (error instanceof CodegenError) return false;
        throw error;
    }
}

/** `string := value` (CMP-021): the characters are copied into the variable, up to its capacity. */
function emitStringAssign(state: CodeGenState, place: Place, value: Expression, at: { line: number; column: number }): void {
    const type = storedType(state, place.type);
    const text = parseStringType(type)!;

    if (value.kind === 'StringLiteral' || value.kind === 'WStringLiteral') {
        if ((value.kind === 'WStringLiteral') !== text.wide) {
            fail(value, `Cannot assign ${value.kind === 'WStringLiteral' ? 'a WSTRING' : 'a STRING'} literal to '${place.name}' of type ${typeText(type)}`);
        }
        checkStringFits(value, type, place.name);
    } else if (!isStringExpression(state, value)) {
        fail(value, `Cannot assign ${stringifyExpression(value)} to '${place.name}' of type ${typeText(type)}: it is not a string`);
    } else if (text.wide !== (inferExpressionType(state, value).toUpperCase().startsWith('W'))) {
        fail(value, `Cannot assign ${stringifyExpression(value)} to '${place.name}' of type ${typeText(type)}: STRING and WSTRING do not mix`);
    }

    if (!text.wide && place.addr.k === 'const' && value.kind === 'FunctionCall' && emitStringFunctionInto(state, place, value)) {
        return;
    }

    emitExpression(state, value);                // [src]
    emitAddr(state, place.addr);                 // [src dst]
    if (text.wide) {
        state.helpers.add('memcpy');
        callHelper(state, 'wstrcpy', WSTRCPY_LABEL);
    } else {
        emit(state, `    STRCPY`);
    }
}

/** The value a REF_TO variable is given: NULL (also written 0) is the address no region contains. */
function emitReferenceValue(state: CodeGenState, target: PointerType, value: Expression): void {
    if (value.kind === 'IntLiteral' && value.value === 0) {
        emit(state, `    PUSH16 ${NULL_REFERENCE}   ; NULL`);
        return;
    }
    emitValueFor(state, value, target);
}

/** CMP-024: what a REF_TO variable may be given. */
function checkReferenceValue(state: CodeGenState, target: PointerType, value: Expression, name: string): void {
    if (value.kind === 'IntLiteral' && value.value === 0) return;
    if (isNullLiteral(state, value)) return;

    let given: unknown;
    if (value.kind === 'ReferenceExpr') {
        given = { kind: 'PointerType', baseType: resolvePlace(state, value.operand).type };
    } else {
        try {
            given = resolvePlace(state, value).type;
        } catch {
            given = undefined;
        }
    }

    if (!isPointerType(given)) {
        fail(value, `'${name}' is a ${typeText(target)}: assign a REF(...) of a ${typeText(target.baseType)} variable or NULL, not ${stringifyExpression(value)}`);
    }
    if (typeText(storedType(state, given.baseType)) !== typeText(storedType(state, target.baseType))) {
        fail(value, `Cannot assign a ${typeText(given)} to '${name}' of type ${typeText(target)}`);
    }
}

/**
 * Emit code to read an array element, a member or a dereferenced reference.
 * Pushes the value onto the stack.
 */
function emitPlaceExpression(state: CodeGenState, expr: Expression): void {
    const place = resolvePlace(state, expr);
    const type = storedType(state, place.type);
    if (isArrayType(type as STDataType) || (typeof type === 'string' && state.symbols.isStructType(type))) {
        fail(expr, `'${place.name}' is ${typeText(type)}: use one of its members or elements, or assign the whole value to a variable of the same type`);
    }
    emitLoadPlace(state, place);
}

function emitReference(state: CodeGenState, expr: ReferenceExpr): void {
    const place = resolvePlace(state, expr.operand);
    if (place.readonly && place.sym?.section === VarSection.CONSTANT) {
        fail(expr, `Cannot take a reference to constant '${place.name}'`);
    }
    emitAddr(state, place.addr);
}

function emitDereference(state: CodeGenState, expr: DereferenceExpr): void {
    emitPlaceExpression(state, expr);
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

    // SUPER^.Method(): the method of the base of the block that declares the code that runs (CMP-041)
    const isSuper = isSuperReference(expr.object);

    // A variable of an interface type: the method of the instance it holds is the one that runs (CMP-041)
    if (expr.object.kind === 'Identifier' || expr.object.kind === 'MemberAccess' || expr.object.kind === 'ArrayAccess') {
        const target = interfaceTarget(state, expr.object);
        if (target) {
            emitInterfaceCall(state, expr, target.place, target.name);
            return;
        }
    }

    // Get the object (FB instance)
    if (expr.object.kind !== 'Identifier' && expr.object.kind !== 'ThisExpr' && !isSuper) {
        fail(expr, `Complex method call targets not supported yet`);
    }
    
    let instanceName: string;
    let fbTypeName: string;
    let instanceSym: Symbol | undefined;
    
    if (isSuper) {
        const block = state.currentBlock;
        if (!block || !state.currentFBInstance) fail(expr, `SUPER^ is used outside of a function block`);
        const base = state.symbols.getFBDefinition(block)?.extends;
        if (!base) fail(expr, `'${block}' extends no function block: SUPER^ has no base block to call`);
        instanceSym = state.currentFBInstance;
        instanceName = instanceSym.name;
        fbTypeName = base;
    } else if (expr.object.kind === 'ThisExpr') {
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
    
    emitMethodInline(state, expr, instanceSym, fbTypeName);
}

/**
 * Inline the method `expr.methodName` of the function block `fbTypeName`, on the instance `instanceSym`: its
 * arguments, its locals, its body and its result (CMP-041).
 */
function emitMethodInline(state: CodeGenState, expr: MethodCall, instanceSym: Symbol, fbTypeName: string): void {
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
    checkMethodAccess(state, methodInfo, fbTypeName, expr);
    if (methodInfo.isAbstract) {
        fail(expr, `The method '${methodInfo.name}' of '${methodInfo.owner}' is ABSTRACT: it has no body to run, a derived block implements it`);
    }
    
    // A method that returns a number writes a result slot that is pushed once where the method ends,
    // so the caller sees one value however many times, or never, the method assigns its name
    const methodReturnType = (methodInfo as { returnType?: DataTypeValue | null }).returnType ?? undefined;
    let resultPlace: Place | null = null;
    if (methodReturnType !== undefined) {
        const stored = storedType(state, methodReturnType);
        if (!isStringType(stored) && !isAggregateType(state, stored) && !isPointerType(stored)) {
            // by the block that declares the method: an override and the method it overrides have a slot each,
            // so SUPER^.Method() cannot write the result its caller has not read yet
            const key = `${methodInfo.owner}.${methodInfo.name}`;
            const size = Math.max(state.symbols.sizeOf(methodReturnType), 1);
            let address = state.methodResultSlots.get(key);
            if (address === undefined) {
                address = allocateWork(state, size, Math.min(size, 4));
                state.methodResultSlots.set(key, address);
            }
            resultPlace = { addr: { k: 'const', a: address }, type: methodReturnType, size, name: expr.methodName };
        }
    }

    // Save current FB context; the one of the method is set up after the arguments: they are values of the
    // caller, and a name in them is the caller's whatever the callee has of that name
    const prevFBInstance = state.currentFBInstance;
    const prevBlock = state.currentBlock;
    const prevMethod = state.currentMethod;
    const prevMethodResult = state.methodResult;
    const prevReturnLabel = state.returnLabel;

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
                input = methodInfo.inputs.find((i: any) => sameName(i.name, inputName));
                
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

            if (input.mangledName) {
                const sym = state.symbols.get(input.mangledName);
                if (sym) {
                    const target: Place = { addr: { k: 'const', a: sym.address }, type: sym.dataType, size: sym.size, sym, name: inputName };
                    emitAssignToPlace(state, target, argExpr, argExpr);
                } else {
                     fail(expr, `Symbol for input '${inputName}' not found`);
                }
            } else {
                fail(expr, `Input '${inputName}' has no allocated memory`);
            }
        }
    }
    
    // From here on the code is the method's: its instance, its inputs and locals, its return
    state.returnLabel = newLabel(state, 'method_return');
    state.currentFBInstance = instanceSym;
    state.currentBlock = methodInfo.owner;
    // Cast MethodInfo to MethodDecl for compatibility (they share name/body which is what matters)
    state.currentMethod = methodInfo as any;

    // Initialize method locals (including VAR_TEMP)
    if (methodInfo.locals) {
        for (const local of methodInfo.locals as any[]) {
            if (local.mangledName) {
                const sym = state.symbols.get(local.mangledName);
                if (sym) {
                    const localType = storedType(state, sym.dataType);
                    if (isStringType(localType) || isAggregateType(state, localType) || isPointerType(localType)) {
                        emitInitValue(state, sym.address, sym.dataType, local.initialValue, expr, local.name, { everyCall: true });
                        continue;
                    }
                    if (local.initialValue) {
                        emit(state, `    ; Init ${local.name} := ...`);
                        emitValueFor(state, local.initialValue as Expression, sym.dataType);
                    } else {
                        emit(state, `    ; Init ${local.name} := 0`);
                        // a 64-bit local is two cells: low word, then high word
                        if (sym.size === 8) emit(state, `    PUSH32 0`);
                        emit(state, `    PUSH32 0`);
                    }
                    const suffix = getLoadStoreSuffix(localType as DataTypeValue);
                    emit(state, `    STORE${suffix} ${formatAddress(sym.address)}`);
                }
            }
        }
    }

    // The result starts as the default of its type
    state.methodResult = resultPlace;
    if (resultPlace) {
        emit(state, `    ; ${expr.methodName} := 0`);
        if (resultPlace.size === 8) emit(state, `    PUSH32 0`);
        emit(state, `    PUSH32 0`);
        emit(state, `    STORE${getLoadStoreSuffix(storedType(state, methodReturnType!) as DataTypeValue)} ${formatAddress((resultPlace.addr as { a: number }).a)}`);
    }

    // Inline the method body: its statements are the ones of the file of the block that declares it
    const prevSourceRef = state.sourceRef;
    if ((methodInfo as { sourceRef?: string }).sourceRef !== undefined) state.sourceRef = (methodInfo as { sourceRef?: string }).sourceRef;
    state.expressionDepth++;
    for (const stmt of methodInfo.body) {
        emitStatement(state, stmt);
    }
    state.expressionDepth--;
    state.sourceRef = prevSourceRef;
    emit(state, `${state.returnLabel}:`);

    // The value of the method: the slot, once; a string result was left on the stack by its assignments
    state.methodLeftResult = methodReturnType !== undefined;
    if (resultPlace) emitLoadPlace(state, resultPlace);

    emit(state, `    ; --- End Method ${fbTypeName}.${expr.methodName} ---`);

    // Restore previous FB context
    state.currentFBInstance = prevFBInstance;
    state.currentBlock = prevBlock;
    state.currentMethod = prevMethod;
    state.methodResult = prevMethodResult;
    state.returnLabel = prevReturnLabel;
}

// ============================================================================
// Interfaces (CMP-041)
//
// A variable of an interface type is a 32-bit reference: the address of an instance in the low 16 bits and the tag
// of its function-block type in the high 16 bits (NULL, 0xFFFF, has tag 0). Function blocks are inlined at each
// call site with the addresses of their instance, so a call through an interface is a switch the compiler writes
// out: for each instance in the unit of a block that implements the interface, compare the reference with the
// one of that instance and run the method inlined on it; a reference that matches none is a VM fault.
// ============================================================================

function isInterfaceType(state: CodeGenState, type: unknown): boolean {
    return typeof type === 'string' && state.symbols.isInterface(type);
}

/** The tag of a function-block type in an interface reference: its position among the blocks of the unit, from 1. */
function blockTag(state: CodeGenState, fbType: string): number {
    let tag = 1;
    for (const name of state.functionBlockTable.keys()) {
        if (sameName(name, fbType)) return tag;
        tag++;
    }
    return fail({ line: 0, column: 0 }, `Function block '${fbType}' is not declared`);
}

/** The reference to the instance at `address` of the block `fbType`, as a variable of an interface type holds it. */
function interfaceReference(state: CodeGenState, fbType: string, address: number): number {
    return blockTag(state, fbType) * 0x10000 + address;
}

/**
 * Leave on the stack the value a variable of the interface `iface` takes from `value`: NULL, another variable of
 * that interface (or of one that extends it), or an instance of a block that implements it.
 */
function emitInterfaceValue(state: CodeGenState, value: Expression, iface: string): void {
    if ((value.kind === 'IntLiteral' && value.value === 0) || isNullLiteral(state, value)) {
        emit(state, `    PUSH16 ${NULL_REFERENCE}   ; NULL`);
        return;
    }
    let place: Place | undefined;
    try {
        place = resolvePlace(state, value);
    } catch (error) {
        if (!(error instanceof CodegenError)) throw error;
    }
    const given = place === undefined ? undefined : storedType(state, place.type);
    if (place && typeof given === 'string' && isInterfaceType(state, given)) {
        if (!state.symbols.interfaceDerivesFrom(given, iface)) {
            fail(value, `Cannot assign the interface '${given}' of '${place.name}' to a variable of the interface '${iface}'`);
        }
        emitLoadPlace(state, place);
        return;
    }
    if (place && typeof given === 'string' && state.symbols.getFBDefinition(given)) {
        if (!state.symbols.blockImplements(given, iface)) {
            fail(value, `'${place.name}' is a ${given}, which does not implement the interface '${iface}'`);
        }
        emitAddr(state, place.addr);
        emit(state, `    PUSH32 ${blockTag(state, given) * 0x10000}   ; tag of ${given}`);
        emit(state, `    OR`);
        return;
    }
    fail(value, `A variable of the interface '${iface}' takes an instance of a block that implements it, a variable of that interface or NULL, not ${stringifyExpression(value)}`);
}

/** The place an expression names, when it is a variable of an interface type. */
function interfaceTarget(state: CodeGenState, object: Expression): { place: Place; name: string } | null {
    let place: Place;
    try {
        place = resolvePlace(state, object);
    } catch (error) {
        if (error instanceof CodegenError) return null; // the call reports what is wrong with it
        throw error;
    }
    const type = storedType(state, place.type);
    return typeof type === 'string' && isInterfaceType(state, type) ? { place, name: type } : null;
}

/**
 * Every instance in the unit of a block that implements `iface`, with the type it was declared as: the program
 * and global variables, function and method variables, array elements, and the instances inside other blocks and
 * structures. An address that more than one instance has (a block and its first member) has one entry for each
 * type; the tag of the reference tells them apart.
 */
function interfaceCandidates(state: CodeGenState, iface: string): Array<{ symbol: Symbol; type: string; reference: number }> {
    const candidates: Array<{ symbol: Symbol; type: string; reference: number }> = [];
    const seen = new Set<number>();
    const visit = (name: string, type: STDataType | ArrayType, address: number, depth: number): void => {
        if (depth > 8) return;
        if (isArrayType(type as STDataType)) {
            const array = type as ArrayType;
            const element = array.elementType;
            if (typeof element !== 'string' || !(state.symbols.getFBDefinition(element) || state.symbols.getStructDefinition(element))) return;
            const stride = state.symbols.sizeOf(element);
            for (let index = 0; index < getArrayElementCount(array); index++) visit(`${name}[${index}]`, element, address + index * stride, depth + 1);
            return;
        }
        if (typeof type !== 'string') return;
        const block = state.symbols.getFBDefinition(type);
        if (block) {
            if (state.symbols.blockImplements(block.name, iface)) {
                const reference = interfaceReference(state, block.name, address);
                if (!seen.has(reference)) {
                    seen.add(reference);
                    candidates.push({
                        symbol: {
                            name, dataType: block.name, address, size: block.size, section: VarSection.VAR, ioAddress: null,
                            members: memberOffsets(state, block.name), initialValue: null, tags: {},
                        },
                        type: block.name,
                        reference,
                    });
                }
            }
            for (const [member, info] of block.members) {
                if (info.section === VarSection.VAR_IN_OUT) continue; // a reference, not storage
                visit(`${name}.${member}`, info.dataType, address + info.offset, depth + 1);
            }
            return;
        }
        const struct = state.symbols.getStructDefinition(type);
        if (struct) {
            for (const [member, info] of struct.members) visit(`${name}.${member}`, info.dataType, address + info.offset, depth + 1);
        }
    };
    for (const symbol of state.symbols.all()) {
        if (symbol.ioAddress !== null) continue;
        visit(symbol.owner === undefined ? symbol.name : `${symbol.owner}.${symbol.name}`, symbol.dataType, symbol.address, 0);
    }
    return candidates;
}

/**
 * `reference.Method(args)` where `reference` is a variable of an interface type: the method of the instance the
 * variable holds. The stack is the same on every path: the reference is consumed by the comparison that matches
 * it, and what a method leaves (its result, or nothing) is what the call leaves.
 */
function emitInterfaceCall(state: CodeGenState, expr: MethodCall, place: Place, iface: string): void {
    const signature = state.symbols.findInterfaceMethod(iface, expr.methodName);
    if (!signature) fail(expr, `The interface '${iface}' has no method '${expr.methodName}'`);

    const candidates = interfaceCandidates(state, iface);
    emit(state, `    ; --- interface call: ${place.name}.${expr.methodName}() through ${iface}, ${candidates.length} instance${candidates.length === 1 ? '' : 's'} ---`);
    const end = newLabel(state, 'iface_end');
    emitLoadPlace(state, place);
    for (const candidate of candidates) {
        const next = newLabel(state, 'iface_next');
        emit(state, `    DUP`);
        emit(state, `    PUSH32 ${candidate.reference}   ; ${candidate.symbol.name} (${candidate.type})`);
        emit(state, `    EQ`);
        emit(state, `    JZ ${next}`);
        emit(state, `    DROP`);
        emitMethodInline(state, expr, candidate.symbol, candidate.type);
        emit(state, `    JMP ${end}`);
        emit(state, `${next}:`);
    }
    // NULL, or a reference that names no instance of a block that implements the interface
    emit(state, `    DROP`);
    emitFault(state, `${place.name} refers to no instance`);
    emit(state, `${end}:`);
    // what the inlined methods left: one value for a method with a result, none for the others
    state.methodLeftResult = signature.returnType !== null;
}

/** `SUPER^`: the base block of the block that declares the code that runs (CMP-041). */
function isSuperReference(expr: Expression): boolean {
    return expr.kind === 'DereferenceExpr' && expr.operand.kind === 'Identifier' && expr.operand.name.toUpperCase() === 'SUPER';
}

/** Whether `block` is `ancestor` or extends it, directly or through other blocks. */
function derivesFrom(state: CodeGenState, block: string, ancestor: string): boolean {
    const seen = new Set<string>();
    for (let name: string | null = block; name !== null && !seen.has(name.toUpperCase()); name = state.symbols.getFBDefinition(name)?.extends ?? null) {
        if (sameName(name, ancestor)) return true;
        seen.add(name.toUpperCase());
    }
    return false;
}

/**
 * The access specifiers of a method are enforced where it is called (CMP-041): a PRIVATE method is called only
 * from the block that declares it, and a PROTECTED one from that block and the blocks that extend it. The code
 * that runs is the block's own, so a call from a program, a function or another block is outside.
 */
function checkMethodAccess(state: CodeGenState, method: MethodInfo, typeName: string, at: { line: number; column: number; endLine?: number; endColumn?: number }): void {
    if (method.access !== 'PRIVATE' && method.access !== 'PROTECTED') return;
    const here = state.currentBlock;
    const inside = here !== null
        && (method.access === 'PRIVATE' ? sameName(here, method.owner) : derivesFrom(state, here, method.owner));
    if (inside) return;
    const where = method.access === 'PRIVATE'
        ? `inside '${method.owner}'`
        : `inside '${method.owner}' and the function blocks that extend it`;
    fail(at, `The method '${method.name}' of '${typeName}' is ${method.access}: it can be called only ${where}`);
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
    // a 64-bit operand is converted to REAL first: the power is computed in single precision
    emitConverted(state, expr.left, 'REAL');
    emitConverted(state, expr.right, 'REAL');
    linkRoutine(state, POWF_LABEL);
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
