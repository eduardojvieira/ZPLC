/**
 * ZPLC Structured Text Compiler
 *
 * SPDX-License-Identifier: MIT
 *
 * Compiles IEC 61131-3 Structured Text to ZPLC bytecode.
 * This is a standalone compiler package with no UI dependencies.
 *
 * Usage:
 *   import { compileST, compileToBinary } from '@zplc/compiler';
 *
 *   // Compile ST to assembly
 *   const asm = compileST(source);
 *
 *   // Compile ST to bytecode
 *   const result = compileToBinary(source);
 *   console.log(result.bytecode);
 */

// =============================================================================
// Lexer exports
// =============================================================================
export { tokenize, tokenizeWithErrors, TokenType, LexerError } from './lexer.ts';
export type { Token, TokenTypeValue, LexResult, LexerWarning } from './lexer.ts';

// =============================================================================
// AST exports
// =============================================================================
export { DataType, VarSection, getDataTypeSize, parseTimeLiteral, parseIOAddress } from './ast.ts';
export type {
    ASTNode,
    CompilationUnit,
    Program,
    VarBlock,
    VarDecl,
    Statement,
    Expression,
    Assignment,
    IfStatement,
    FBCallStatement,
    FBCall,
    FBParameter,
    FunctionCall,
    Identifier,
    MemberAccess,
    BoolLiteral,
    IntLiteral,
    TimeLiteral,
    UnaryExpr,
    BinaryExpr,
    IOAddress,
    DataTypeValue,
    VarSectionValue,
} from './ast.ts';

// =============================================================================
// Parser exports
// =============================================================================
export { parse, parseWithDiagnostics, ParseError } from './parser.ts';
export type { ParseOutcome } from './parser.ts';
export type { SourceSpan, SourceWarning, SyntaxIssue, WarningCode, WarningSelection } from './diagnostics.ts';
export { WARNING_CODES, parseWarningSelection, selectWarnings } from './diagnostics.ts';
export { ERROR_CODES, ERROR_CODE_TABLE, isErrorCode } from './error-codes.ts';
export type { ErrorCode, ErrorCodeInfo, ErrorPhase } from './error-codes.ts';
export { checkProject } from './check.ts';
export type { CheckDiagnostic, CheckOptions, CheckSource } from './check.ts';

// =============================================================================
// Symbol table exports
// =============================================================================
export { SymbolTable, buildSymbolTable, MemoryLayout, getLoadStoreSuffix, getMemberLoadStoreSuffix } from './symbol-table.ts';
export type { Symbol } from './symbol-table.ts';

// =============================================================================
// Stdlib exports (function blocks: TON, CTU, etc.)
// =============================================================================
export { getFB, getFn, isFB, isFn, getAllFBNames, getAllFnNames } from './stdlib/index.ts';
export type { FunctionBlockDef, FunctionDef, CodeGenContext, MemberDef } from './stdlib/types.ts';

// =============================================================================
// Code generator exports
// =============================================================================
export { generate, WORK_MEMORY_REGION_SIZE, validateCompilerMemoryProfile } from './codegen.ts';
export type { CodeGenOptions, CompilerMemoryProfile } from './codegen.ts';

// =============================================================================
// Assembler exports (ASM -> bytecode)
// =============================================================================
export { assemble, createZplcFile, createMultiTaskZplcFile, relocateBytecode, readArtifact, buildIdOf, analyzeDepths, DepthError, TASK_TYPE, AssemblerError, ZPLC_CONSTANTS } from '../assembler/index.ts';
export type { AssemblyResult, ArtifactInfo, TaskDef, TaskDepth, TaskType, InstructionMapping, TagDef } from '../assembler/index.ts';

// =============================================================================
// Binary contract (generated from tools/contract/contract.json)
// =============================================================================

// Opcodes, container constants, memory regions, error codes and function-block
// layouts, for the IDE and tools that must agree with the runtime.
export * as ZPLC_CONTRACT from '../contract.generated.ts';

// =============================================================================
// Debug map exports
// =============================================================================
export {
    createDebugMap,
    createDebugVarInfo,
    serializeDebugMap,
    parseDebugMap,
    findVariable,
    findSourceLine,
    findPC,
    getBreakpointLocations,
    buildDebugMap,
} from './debug-map.ts';
export { debugMapMatchesArtifact } from './build-id.ts';
export type { BuildIdVerdict } from './build-id.ts';
export type {
    MemoryRegion,
    DebugDataType,
    DebugVarInfo,
    DebugMemberInfo,
    SourceLineMapping,
    BreakpointLocation,
    DebugPOUInfo,
    DebugMonitorEntry,
    DebugPowerExpr,
    DebugMap,
    BuildDebugMapOptions,
    TypeResolver,
} from './debug-map.ts';

// =============================================================================
// Internal imports for main functions
// =============================================================================
import { parse, parseWithDiagnostics } from './parser.ts';
import { ParseError } from './parser.ts';
import { LexerError } from './lexer.ts';
import { generate, generateProject, CodegenError, DEFAULT_COMPILER_MEMORY_PROFILE, validateCompilerMemoryProfile } from './codegen.ts';
import { selectWarnings } from './diagnostics.ts';
import type { ErrorCode } from './error-codes.ts';
import type { CodegenWarning, SyntaxIssue, WarningCode, WarningSelection } from './diagnostics.ts';
import { analyzeUnit } from './warnings.ts';
import type { CodeUnit, GeneratedProject } from './codegen.ts';
import type { CodeGenOptions, CompilerMemoryProfile } from './codegen.ts';
import { DepthError, analyzeDepths, assemble, createMultiTaskZplcFile, readArtifact, TASK_TYPE, ZPLC_CONSTANTS } from '../assembler/index.ts';
import type { AssemblyResult, TaskDef, TaskDepth, TaskType } from '../assembler/index.ts';
import type { DebugMap, TypeResolver } from './debug-map.ts';
import { buildUnitDebugMap } from './debug-map.ts';
import type { UnitDebugFile } from './debug-map.ts';
import { mergeUnits } from './unit.ts';
import type { UnitSource } from './unit.ts';
import { parseStringType, typeToString } from './symbol-table.ts';
import type { Symbol as TableSymbol } from './symbol-table.ts';
import { getFB } from './stdlib/index.ts';
import { sameName } from './ast.ts';
import type { DataTypeValue } from './ast.ts';
import type { CompilationUnit, Program } from './ast.ts';

// =============================================================================
// Error types
// =============================================================================

/**
 * Compiler error with source location.
 */
export class CompilerError extends Error {
    /** The stable code of the kind of error (CMP-006): the same for the same problem, whatever the wording. */
    code: ErrorCode;
    /** Unformatted diagnostic detail, retained when a caller needs to relocate it. */
    detail: string;
    line: number;
    column: number;
    /** Position just after the offending text, when the phase knows it. */
    endLine?: number;
    endColumn?: number;
    phase: 'lexer' | 'parser' | 'codegen' | 'assembler';
    /** Physical project-relative source identity, when the diagnostic belongs to one source. */
    sourceRef?: string;
    /**
     * The element of the source the author edited that the error is about: a rung and cell, a block, a step, a
     * transition, an action, or a line of an IL source (LNG-003). Set by a front end that translates a visual
     * language to Structured Text; the compiler itself reports positions only.
     */
    element?: string;
    /**
     * Every independent error of the compile, in source order (programs in task order); this error is
     * the first of them. A caller that shows one diagnostic shows this one; one that shows all uses this list (CMP-007).
     */
    errors: CompilerError[] = [this];

    constructor(
        code: ErrorCode,
        message: string,
        line: number,
        column: number,
        phase: 'lexer' | 'parser' | 'codegen' | 'assembler',
        sourceRef?: string,
        endLine?: number,
        endColumn?: number,
    ) {
        super(`[${phase}] Error at ${line}:${column}: ${message}`);
        this.name = 'CompilerError';
        this.code = code;
        this.detail = message;
        this.line = line;
        this.column = column;
        this.endLine = endLine;
        this.endColumn = endColumn;
        this.phase = phase;
        this.sourceRef = sourceRef;
    }
}

/**
 * The errors one source produced, as compiler errors in source order: every error a lexer, parser or
 * generator reported, each with its own position (CMP-006, CMP-007).
 */
export function compilerErrorsOf(
    error: unknown,
    label: string,
    sourceRef: string | undefined,
    fallback: { line: number; column: number },
): CompilerError[] {
    if (error instanceof CompilerError) {
        return error.errors.map((each) => (sourceRef ? attachSourceRef(each, sourceRef) : each));
    }
    if (error instanceof CodegenError) {
        return error.errors.map((each) => new CompilerError(each.code, each.message, each.line, each.column, 'codegen', each.sourceRef ?? sourceRef, each.endLine, each.endColumn));
    }
    if (error instanceof LexerError || error instanceof ParseError) {
        return (error.errors as SyntaxIssue[]).map((each) => new CompilerError(
            each.code,
            `Compilation of '${label}' failed: ${each.detail}`,
            each.line, each.column, each.name === 'LexerError' ? 'lexer' : 'parser', sourceRef, each.endLine, each.endColumn,
        ));
    }
    const err = error as Error;
    // an error that carries no position is placed at the start of the unit it came from, never at line 0
    return [new CompilerError('INTERNAL_COMPILER_ERROR', `Compilation of '${label}' failed: ${err.message}`, fallback.line, fallback.column, 'codegen', sourceRef)];
}

/**
 * The error of an assembler that refused the generated code. It is not a mistake of the program: the assembler refuses
 * an operand or a relocated address that does not fit its field instead of truncating it (CMP-049). The error has no
 * line of the author's source, so it is placed at `at`, the program that was being built.
 */
export function assemblerError(
    message: string,
    at: { line: number; column: number; sourceRef?: string },
): CompilerError {
    return new CompilerError('ASSEMBLER_ERROR', message, Math.max(1, at.line), Math.max(1, at.column), 'assembler', at.sourceRef);
}

/**
 * The error of a program that does not fit the code memory of the target (CMP-043): the bytes it needs, the bytes the
 * profile has, and the three parts of the program that take the most, so that the author knows what to shrink. It is
 * reported at the declaration of the largest one that the author wrote, or at `fallback`.
 */
function codeBudgetError(
    assembly: AssemblyResult,
    units: readonly CodeUnit[],
    available: number,
    fallback: { line: number; column: number; sourceRef?: string },
): CompilerError {
    const required = assembly.bytecode.length;
    // each part runs from its label to the next labelled part; what comes before the first (the bootstrap jump) is nobody's
    const starts = units
        .flatMap((unit) => { const address = assembly.labels.get(unit.label.toUpperCase())?.address; return address === undefined ? [] : [{ unit, address }]; })
        .sort((first, second) => first.address - second.address);
    const consumers = starts.map((start, index) => ({
        unit: start.unit,
        size: (starts[index + 1]?.address ?? required) - start.address,
    }));
    const largest = [...consumers].sort((first, second) => second.size - first.size || (first.unit.title < second.unit.title ? -1 : 1)).slice(0, 3);
    const names = largest.map((consumer) => `${consumer.unit.title} (${consumer.size} bytes)`).join(', ');
    const written = largest.find((consumer) => consumer.unit.line !== undefined)?.unit;
    const at = written?.line === undefined ? fallback : { line: written.line, column: written.column ?? 1, sourceRef: written.sourceRef };
    return new CompilerError(
        'CODE_MEMORY_EXCEEDED',
        `CODE exceeds the target memory profile: ${required} bytes required, ${available} bytes available `
        + `(the code memory of the target profile). Largest consumers: ${names || 'none'}`,
        at.line, at.column, 'codegen', at.sourceRef ?? fallback.sourceRef,
    );
}

/** Throw the first of `errors` carrying all of them. */
function throwAll(errors: CompilerError[]): never {
    const first = errors[0]!;
    first.errors = errors;
    throw first;
}

// =============================================================================
// Result types
// =============================================================================

/**
 * Compilation result.
 */
export interface CompilationResult {
    /** Generated assembly source code */
    assembly: string;
    /** Raw bytecode (no header) */
    bytecode: Uint8Array;
    /** Complete .zplc file (header + segments + bytecode) */
    zplcFile: Uint8Array;
    /** Entry point address */
    entryPoint: number;
    /** Code size in bytes */
    codeSize: number;
    /** Debug map for source-level debugging (optional) */
    debugMap?: DebugMap;
    /** What the build accepted and wants the author to see, in source order (CMP-008, CMP-031). */
    warnings: CompilerWarning[];
}

/**
 * Options for compilation functions.
 */
export interface CompileOptions extends CodeGenOptions {
    /** Generate debug map for source-level debugging */
    generateDebugMap?: boolean;
    /** Which warnings the build reports (project option `compiler.warnings`). Default: 'default'. */
    reportWarnings?: WarningSelection;
    /**
     * Source-level debug information in the debug map: the statement ranges and line mappings that
     * breakpoints and the current line need (project option `compiler.debug`). Default: true.
     */
    debug?: boolean;
}

function requireSingleProgram(ast: CompilationUnit, sourceRef?: string): Program {
    if (ast.programs.length > 1) {
        const secondProgram = ast.programs[1]!;
        throw new CompilerError(
            'MULTIPLE_PROGRAMS_IN_SOURCE',
            'Exactly one PROGRAM is required per source unit',
            secondProgram.line,
            secondProgram.column,
            'codegen',
            sourceRef,
        );
    }

    return ast.programs[0]!;
}

// =============================================================================
// Main compilation functions
// =============================================================================

/**
 * Compile Structured Text to ZPLC Assembly.
 *
 * @param source - ST source code
 * @param options - Optional code generation options
 * @returns Assembly source code as string
 * @throws CompilerError on compilation failure
 *
 * @example
 * ```typescript
 * const source = `
 * PROGRAM Blinky
 * VAR
 *     LedState : BOOL := FALSE;
 * END_VAR
 *
 * LedState := NOT LedState;
 *
 * END_PROGRAM
 * `;
 *
 * const assembly = compileST(source);
 * console.log(assembly);
 * ```
 */
export function compileST(source: string, options?: CodeGenOptions): string {
    const ast = parse(source);

    if (ast.programs.length === 0) {
        throw new CompilerError('NO_PROGRAM', 'No program found in source', 1, 1, 'parser');
    }

    requireSingleProgram(ast);

    // Pass the full CompilationUnit to generate() to support functions
    try {
        return generate(ast, options);
    } catch (e) {
        if (e instanceof CodegenError) {
            throwAll(compilerErrorsOf(e, 'source', undefined, e));
        }
        throw e;
    }
}

/**
 * Compile Structured Text to ZPLC bytecode.
 *
 * This is a convenience function that chains the ST compiler with the assembler.
 *
 * @param source - ST source code
 * @param options - Optional compilation options
 * @returns Compilation result with bytecode and assembly
 * @throws CompilerError on compilation failure
 *
 * @example
 * ```typescript
 * const result = compileToBinary(source);
 *
 * // Download as .zplc file
 * const blob = new Blob([result.zplcFile], { type: 'application/octet-stream' });
 *
 * // With debug map for debugging
 * const debugResult = compileToBinary(source, { generateDebugMap: true });
 * console.log(debugResult.debugMap);
 * ```
 */
/**
 * Create a TypeResolver from a SymbolTable.
 * Bridges user-defined FBs/structs and stdlib FBs into the debug-map's TypeResolver interface.
 */
function createTypeResolver(symbols: import('./symbol-table.ts').SymbolTable): TypeResolver {
    return {
        getMemberInfo(typeName: string, memberName: string): { offset: number; size: number; dataType: string } | undefined {
            // A string is STRING or WSTRING with its size beside it; a VAR_IN_OUT is the address of a variable
            const describe = (member: { size: number; dataType: unknown; section?: string }): string => {
                if (member.section === 'VAR_IN_OUT') return `REF_TO ${typeToString(member.dataType)}`;
                const text = parseStringType(member.dataType);
                if (text) return text.wide ? 'WSTRING' : 'STRING';
                return typeof member.dataType === 'string' ? member.dataType : typeToString(member.dataType);
            };

            // 1. Check user-defined FBs
            const fbDef = symbols.getFBDefinition(typeName);
            if (fbDef) {
                const member = fbDef.members.get(memberName);
                if (member) {
                    return {
                        offset: member.offset,
                        size: member.size,
                        dataType: describe(member),
                    };
                }
            }

            // 2. Check user-defined structs
            const structDef = symbols.getStructDefinition(typeName);
            if (structDef) {
                const member = structDef.members.get(memberName);
                if (member) {
                    return {
                        offset: member.offset,
                        size: member.size,
                        dataType: describe(member),
                    };
                }
            }

            // 3. Check stdlib FBs
            const stdFB = getFB(typeName as DataTypeValue);
            if (stdFB) {
                const member = stdFB.members.find(m => sameName(m.name, memberName));
                if (member) {
                    const dt: string = typeof member.dataType === 'string'
                        ? member.dataType
                        : (member.size === 1 ? 'BOOL' : member.size === 2 ? 'INT' : 'DINT');
                    return {
                        offset: member.offset,
                        size: member.size,
                        dataType: dt,
                    };
                }
            }

            return undefined;
        },

        isCompositeType(typeName: string) {
            return !!symbols.getFBDefinition(typeName)
                || !!symbols.getStructDefinition(typeName)
                || !!getFB(typeName as DataTypeValue);
        },
    };
}

export function compileToBinary(source: string, options?: CompileOptions): CompilationResult {
    let memoryProfile: CompilerMemoryProfile;
    try {
        memoryProfile = validateCompilerMemoryProfile(options?.memoryProfile ?? DEFAULT_COMPILER_MEMORY_PROFILE);
    } catch (e) {
        if (e instanceof CodegenError) {
            // a profile belongs to no line of the source: the error is placed at its start
            throw new CompilerError(e.code, e.message, Math.max(1, e.line), Math.max(1, e.column), 'codegen');
        }
        throw e;
    }
    const parsed = parseWithDiagnostics(source);
    if (parsed.errors.length > 0) {
        // the first error carries all of them, as parse() throws it
        const first = parsed.errors[0]!;
        first.errors = parsed.errors;
        throw first;
    }
    const ast = parsed.unit;
    const warnings: CompilerWarning[] = parsed.warnings.map((warning) => ({ ...warning }));

    if (ast.programs.length === 0) {
        throw new CompilerError('NO_PROGRAM', 'No program found in source', 1, 1, 'parser');
    }

    const program = requireSingleProgram(ast);
    const generateDebugMap = options?.generateDebugMap ?? false;

    // Build codegen options - enable source annotations if debug map is requested
    const generated: CodegenWarning[] = [];
    const codegenOptions: CodeGenOptions = {
        ...options,
        emitSourceAnnotations: generateDebugMap && (options?.debug ?? true),
        warnings: generated,
    };

    // Generate assembly using full AST
    let assembly: string;
    let symbols: import('./symbol-table.ts').SymbolTable;
    let units: CodeUnit[];
    try {
        const project = generateProject(ast, codegenOptions);
        assembly = project.assembly;
        symbols = project.symbols;
        units = project.units;
        warnings.push(...generated, ...analyzeUnit(ast));
        warnings.sort((first, second) => first.line - second.line || first.column - second.column);
    } catch (e) {
        if (e instanceof CodegenError) {
            throwAll(compilerErrorsOf(e, 'source', undefined, e));
        }
        throw e;
    }

    // Assemble to bytecode
    let asmResult: AssemblyResult;
    try {
        asmResult = assemble(assembly);
    } catch (e) {
        throw assemblerError((e as Error).message, { line: program.line, column: program.column });
    }
    if (asmResult.bytecode.length > memoryProfile.codeSizeMax) {
        throw codeBudgetError(asmResult, units, memoryProfile.codeSizeMax, { line: program.line, column: program.column });
    }
    // a file of one program has no task table to record the depth in, and the loader proves the same limits
    measureDepths(asmResult, [asmResult.entryPoint], memoryProfile, () => ({ label: `Program '${program.name}'`, line: program.line, column: program.column }));

    const result: CompilationResult = {
        assembly,
        bytecode: asmResult.bytecode,
        zplcFile: asmResult.zplcFile,
        entryPoint: asmResult.entryPoint,
        codeSize: asmResult.codeSize,
        warnings: selectWarnings(warnings, options?.reportWarnings),
    };

    // Build debug map if requested
    if (generateDebugMap) {
        // The table the code was generated with, so the map and the code share one layout (CMP-054).
        const bare: UnitDebugFile = { ref: '', key: program.name, type: 'PROGRAM' };
        result.debugMap = buildUnitDebugMap({
            projectName: program.name,
            files: [bare],
            symbols,
            instructionMappings: asmResult.instructionMappings ?? [],
            assembly,
            typeResolver: createTypeResolver(symbols),
            memoryProfile: options?.memoryProfile,
            codeSize: asmResult.codeSize,
        });
        result.debugMap.buildId = buildIdText(readArtifact(asmResult.zplcFile).buildId);
    }

    return result;
}

/**
 * Validate Structured Text source without generating output.
 *
 * @param source - ST source code
 * @returns null if valid, or error message if invalid
 */
export function validate(source: string): string | null {
    try {
        parse(source);
        return null;
    } catch (e) {
        return (e as Error).message;
    }
}

// =============================================================================
// Multi-Task Compilation
// =============================================================================

/**
 * Task configuration for multi-task compilation.
 */
export interface TaskConfig {
    /** Task name */
    name: string;
    /** Task trigger type */
    trigger: 'cyclic' | 'event' | 'freewheeling';
    /** Interval in milliseconds (for cyclic tasks) */
    interval?: number;
    /** Priority (0 = highest) */
    priority?: number;
    /** Program names to run in this task */
    programs: string[];
}

/**
 * Project configuration for multi-task compilation.
 */
export interface ProjectConfig {
    /** Project name */
    name: string;
    /** Project version */
    version: string;
    /** Task definitions */
    tasks: TaskConfig[];
}

export function assertTaskProgramCardinality(config: Pick<ProjectConfig, 'tasks'>): void {
    for (const task of config.tasks) {
        if (task.programs?.length !== 1) {
            throw new CompilerError(
                'INVALID_TASK_CONFIGURATION',
                `Task '${task.name}' must reference exactly one PROGRAM`,
                1, 1, 'codegen', PROJECT_FILE_NAME,
            );
        }
    }
}

/**
 * Program source for multi-task compilation.
 */
export interface ProgramSource {
    /** Program name (matches task.programs[] entries) */
    name: string;
    /** ST source code */
    content: string;
    /** Physical project-relative source identity for diagnostics and debug provenance. */
    sourceRef?: string;
}

function attachSourceRef(error: CompilerError, sourceRef: string): CompilerError {
    if (!error.sourceRef) error.sourceRef = sourceRef;
    return error;
}

/** The build identity as the debug map writes it: 8 hexadecimal digits (CMP-056). */
function buildIdText(id: number | undefined): string | undefined {
    return id === undefined ? undefined : id.toString(16).padStart(8, '0');
}

/** The depth the target holds (CMP-050): its profile, the contract defaults where it says nothing. */
function depthLimits(profile: CompilerMemoryProfile): { stack: number; calls: number } {
    return {
        // the loader proves no stack deeper than its own limit, whatever the target holds: a build above it
        // would be an artifact the loader refuses (CMP-051)
        stack: Math.min(profile.stackMaxDepth ?? ZPLC_CONSTANTS.TASK_STACK_MAX_DEPTH, ZPLC_CONSTANTS.MAX_VERIFIED_DEPTH),
        calls: profile.callStackMax ?? ZPLC_CONSTANTS.CALL_STACK_MAX,
    };
}

/**
 * The evaluation-stack and call depth of the code that starts at each of `entries`, or the error that says
 * which one cannot be given or is over the limit of the target. `describe` names an entry and where it is
 * written, for the message.
 */
function measureDepths(
    assembly: AssemblyResult,
    entries: readonly number[],
    profile: CompilerMemoryProfile,
    describe: (index: number) => { label: string; ref?: string; line?: number; column?: number },
): TaskDepth[] {
    const limit = depthLimits(profile);
    let depths: TaskDepth[];
    try {
        depths = analyzeDepths(assembly.instructions ?? [], entries);
    } catch (error) {
        if (!(error instanceof DepthError)) throw error;
        // the parameter names the entry whose analysis failed when the error carries its address
        const at = entries.findIndex((entry) => entry === error.address);
        const where = describe(at >= 0 ? at : 0);
        throw new CompilerError('STACK_DEPTH_EXCEEDED', `${where.label}: the stack depth cannot be determined: ${error.message}`, where.line ?? 0, where.column ?? 0, 'codegen', where.ref);
    }
    depths.forEach((depth, index) => {
        const where = describe(index);
        if (depth.stack > limit.stack) {
            throw new CompilerError(
                'STACK_DEPTH_EXCEEDED',
                `${where.label} needs an evaluation stack of ${depth.stack} values and the target holds ${limit.stack}: split the largest expression, or move part of the program into a function`,
                where.line ?? 0, where.column ?? 0, 'codegen', where.ref,
            );
        }
        if (depth.frames - 1 > limit.calls) {
            throw new CompilerError(
                'STACK_DEPTH_EXCEEDED',
                `${where.label} nests calls ${depth.frames - 1} deep and the target's call stack holds ${limit.calls}`,
                where.line ?? 0, where.column ?? 0, 'codegen', where.ref,
            );
        }
    });
    return depths;
}

/**
 * Something the compiler accepted that the language reference does not define: the build succeeds (CMP-031).
 */
export interface CompilerWarning {
    /** Stable identifier of the kind of warning. */
    code: WarningCode;
    message: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    /** Physical project-relative source identity, when the warning belongs to one source. */
    sourceRef?: string;
    /** The element of a visual or IL source the warning is about, set by the front end that translated it (LNG-003). */
    element?: string;
}

/**
 * Result of multi-task project compilation.
 */
export interface MultiTaskCompilationResult {
    /** Warnings of the compile, in source order (programs in task order). */
    warnings: CompilerWarning[];
    /** Complete .zplc file with CODE and TASK segments */
    zplcFile: Uint8Array;
    /** Concatenated bytecode */
    bytecode: Uint8Array;
    /** Task definitions embedded in the file */
    tasks: TaskDef[];
    /** Total code size */
    codeSize: number;
    /** Per-program compilation details */
    programDetails: {
        name: string;
        entryPoint: number;
        size: number;
        assembly: string;
    }[];
    /** Merged debug map for all programs (always present) */
    debugMap: DebugMap;
}

/**
 * Map TaskConfig trigger to TaskType for assembler.
 */
function mapTaskTrigger(trigger: TaskConfig['trigger']): TaskType {
    switch (trigger) {
        case 'cyclic':
            return TASK_TYPE.CYCLIC;
        case 'freewheeling':
            return TASK_TYPE.CYCLIC;
        default:
            throw new Error(`Unsupported task trigger '${trigger as string}'`);
    }
}

/** The project file the tasks are read from; a diagnostic about a task definition points at it. */
const PROJECT_FILE_NAME = 'zplc.json';
const SUPPORTED_TASK_TRIGGERS = "'cyclic' or 'freewheeling'";

function validateTaskConfigs(config: Pick<ProjectConfig, 'tasks'>): void {
    if (config.tasks.length > ZPLC_CONSTANTS.MAX_TASKS) {
        throw new CompilerError(
            'INVALID_TASK_CONFIGURATION',
            `Project supports at most ${ZPLC_CONSTANTS.MAX_TASKS} tasks`,
            1, 1, 'codegen', PROJECT_FILE_NAME,
        );
    }
    for (const [index, task] of config.tasks.entries()) {
        const label = `Task '${task.name}'`;
        // RT-015: this release schedules cyclic tasks only. The task is rejected here, at its definition in the
        // project file, instead of producing an artifact that the scheduler refuses later.
        const trigger = task.trigger as string;
        if (trigger === 'event' || trigger === 'interrupt') {
            throw new CompilerError(
                'INVALID_TASK_CONFIGURATION',
                `${label} (${PROJECT_FILE_NAME} tasks[${index}].trigger) has trigger '${trigger}', which is not supported in this release: `
                + `event-triggered and interrupt-triggered tasks are not available; use trigger ${SUPPORTED_TASK_TRIGGERS}`,
                1, 1, 'codegen', PROJECT_FILE_NAME,
            );
        }
        if (task.trigger !== 'cyclic' && task.trigger !== 'freewheeling') {
            throw new CompilerError(
                'INVALID_TASK_CONFIGURATION',
                `${label} has invalid trigger '${String(trigger)}'; use trigger ${SUPPORTED_TASK_TRIGGERS}`,
                1, 1, 'codegen', PROJECT_FILE_NAME,
            );
        }
        const interval = task.interval === undefined ? 10 : task.interval;
        if (!Number.isInteger(interval) || interval < 1 || interval > 3_600_000) {
            throw new CompilerError('INVALID_TASK_CONFIGURATION', `${label} has invalid interval`, 1, 1, 'codegen', PROJECT_FILE_NAME);
        }
        const priority = task.priority === undefined ? 1 : task.priority;
        if (!Number.isInteger(priority) || priority < 0 || priority > 0xFF) {
            throw new CompilerError('INVALID_TASK_CONFIGURATION', `${label} has invalid priority`, 1, 1, 'codegen', PROJECT_FILE_NAME);
        }
    }
}

interface PhysicalOutputOwner {
    programName: string;
    variableName: string;
    sourceRef: string;
    startBit: number;
    endBit: number;
}

/**
 * Two programs may not write the same physical output (CMP-047): the located output variables of `programName`
 * must not overlap the ones of a program admitted before it. A global belongs to no program.
 */
function admitPhysicalOutputOwners(
    owners: PhysicalOutputOwner[],
    programName: string,
    sourceRef: string,
    symbols: readonly TableSymbol[],
): void {
    for (const symbol of symbols) {
        if (symbol.owner !== programName || symbol.ioAddress?.type !== 'Q') continue;

        const bit = symbol.ioAddress.size === 'X' ? symbol.ioAddress.bitOffset : undefined;
        const startBit = symbol.address * 8 + (bit ?? 0);
        const endBit = symbol.dataType === 'BOOL' && bit !== undefined
            ? startBit + 1
            : (symbol.address + symbol.size) * 8;
        const previous = owners.find((owner) => owner.programName !== programName
            && startBit < owner.endBit && owner.startBit < endBit);
        if (previous) {
            throw new CompilerError(
                'OUTPUT_OWNERSHIP_CONFLICT',
                `Physical output '${programName}.${symbol.name}' (${sourceRef}) overlaps '${previous.programName}.${previous.variableName}' (${previous.sourceRef})`,
                symbol.declarationLine ?? 1,
                1,
                'codegen',
                sourceRef,
            );
        }
        owners.push({
            programName,
            variableName: symbol.name,
            sourceRef,
            startBit,
            endBit,
        });
    }
}

/**
 * Compile a multi-task project to a single .zplc file.
 *
 * @param config - Project configuration with tasks
 * @param programSources - Array of program sources
 * @returns Multi-task compilation result
 * @throws CompilerError if compilation fails
 *
 * @example
 * ```typescript
 * const config: ProjectConfig = {
 *   name: 'MultiTaskDemo',
 *   version: '1.0.0',
 *   tasks: [
 *     { name: 'FastTask', trigger: 'cyclic', interval: 10, priority: 0, programs: ['FastLogic'] },
 *     { name: 'SlowTask', trigger: 'cyclic', interval: 100, priority: 1, programs: ['SlowLogic'] },
 *   ],
 * };
 *
 * const sources: ProgramSource[] = [
 *   { name: 'FastLogic', content: fastSTCode },
 *   { name: 'SlowLogic', content: slowSTCode },
 * ];
 *
 * const result = compileMultiTaskProject(config, sources);
 * ```
 */
export function compileMultiTaskProject(
    config: ProjectConfig,
    programSources: ProgramSource[],
    options?: Pick<CompileOptions, 'memoryProfile' | 'strictTypes' | 'reportWarnings' | 'debug'>,
): MultiTaskCompilationResult {
    if (!config.tasks || config.tasks.length === 0) {
        throw new CompilerError('INVALID_TASK_CONFIGURATION', 'No tasks defined in project configuration', 1, 1, 'codegen', PROJECT_FILE_NAME);
    }

    validateTaskConfigs(config);
    assertTaskProgramCardinality(config);

    // Build source map for lookup
    const sourceMap = new Map<string, ProgramSource>();
    for (const source of programSources) {
        sourceMap.set(source.name, source);
        sourceMap.set(source.name.toLowerCase(), source);
    }

    // Collect all unique programs
    const referencedPrograms = new Set<string>();
    let memoryProfile: CompilerMemoryProfile;
    try {
        memoryProfile = validateCompilerMemoryProfile(options?.memoryProfile ?? DEFAULT_COMPILER_MEMORY_PROFILE);
    } catch (e) {
        if (e instanceof CodegenError) {
            throw new CompilerError(e.code, e.message, Math.max(1, e.line), Math.max(1, e.column), 'codegen', PROJECT_FILE_NAME);
        }
        throw e;
    }
    for (const task of config.tasks) {
        for (const progName of task.programs) {
            referencedPrograms.add(progName);
        }
    }

    // The files of the project, in the order of the unit: the programs a task runs, in task order, then every
    // other source, in the order given. All of them are one compilation unit (CMP-042).
    const files: Array<{ label: string; source: ProgramSource; ref: string; runs: boolean }> = [];
    for (const progName of referencedPrograms) {
        const source = sourceMap.get(progName) || sourceMap.get(progName.toLowerCase());
        if (!source) {
            throw new CompilerError(
                'UNKNOWN_TASK_PROGRAM',
                `Program '${progName}' referenced by task but not found in sources`,
                1, 1, 'codegen', PROJECT_FILE_NAME
            );
        }
        files.push({ label: progName, source, ref: source.sourceRef ?? progName, runs: true });
    }
    const run = new Set(files.map((file) => file.source));
    for (const source of programSources) {
        if (!run.has(source)) files.push({ label: source.name, source, ref: source.sourceRef ?? source.name, runs: false });
    }

    // Every file is read; the errors of all of them are reported by one build (CMP-007)
    const failures: CompilerError[] = [];
    const warnings: CompilerWarning[] = [];
    const parsedFiles: UnitSource[] = [];
    const declaredProgramSources = new Map<string, string>();
    for (const file of files) {
        const { label, source, ref } = file;
        let unitStart = { line: 1, column: 1 };
        try {
            const parsed = parseWithDiagnostics(source.content);
            if (parsed.errors.length > 0) {
                // the first error carries all of them, as parse() throws it
                const first = parsed.errors[0]!;
                first.errors = parsed.errors;
                throw first;
            }
            const ast = parsed.unit;
            unitStart = ast.programs[0] ?? unitStart;
            // what this file is accepted with: the non-IEC forms the parser saw
            for (const warning of parsed.warnings) {
                warnings.push({
                    code: warning.code,
                    message: warning.message,
                    line: warning.line,
                    column: warning.column,
                    endLine: warning.endLine,
                    endColumn: warning.endColumn,
                    sourceRef: ref,
                });
            }
            if (!file.runs) {
                // a file no task runs holds declarations; a program in it is not built
                parsedFiles.push({ ref, unit: ast });
                continue;
            }
            if (ast.programs.length === 0) {
                throw new CompilerError('NO_PROGRAM', 'No program found in source', 1, 1, 'parser', ref);
            }
            const program = requireSingleProgram(ast, ref);

            const normalizedProgramName = program.name.toLowerCase();
            const previousSourceRef = declaredProgramSources.get(normalizedProgramName);
            if (previousSourceRef) {
                throw new CompilerError(
                    'DUPLICATE_DECLARATION',
                    `Duplicate PROGRAM name '${program.name}' in '${label}' (already declared by '${previousSourceRef}')`,
                    program.line,
                    program.column,
                    'codegen',
                    ref,
                );
            }
            declaredProgramSources.set(normalizedProgramName, label);
            parsedFiles.push({ ref, unit: ast, program });
        } catch (e) {
            failures.push(...compilerErrorsOf(e, label, ref, unitStart));
        }
    }
    const rank = new Map(files.map((file, index) => [file.ref, index] as const));
    const fileOrder = (sourceRef: string | undefined): number => rank.get(sourceRef ?? '') ?? 0;
    /** Throw the errors found so far: in the order of the files, and in each one in the order of its lines. */
    const throwFound = (): never => throwAll(failures.sort((first, second) => fileOrder(first.sourceRef) - fileOrder(second.sourceRef)
        || first.line - second.line || first.column - second.column));

    // One unit: what a file declares is seen by every program, and declared once (CMP-042)
    const merged = mergeUnits(parsedFiles);
    if (merged.errors.length > 0) {
        failures.push(...merged.errors.map((error) => new CompilerError(error.code, error.message, error.line, error.column, 'codegen', error.sourceRef, error.endLine, error.endColumn)));
        throwFound();
    }

    // Compile the unit to one assembly: one entry for each program, one copy of each function, one layout.
    // A file that did not parse is left out, and the errors of the others are still reported (CMP-007).
    const generated: CodegenWarning[] = [];
    let project: GeneratedProject | undefined;
    if (merged.unit.programs.length > 0) {
        try {
            project = generateProject(merged.unit, {
                memoryProfile,
                emitSourceAnnotations: options?.debug ?? true,
                strictTypes: options?.strictTypes ?? false,
                warnings: generated,
            });
        } catch (e) {
            failures.push(...compilerErrorsOf(e, files[0]!.label, files[0]!.ref, merged.unit.programs[0]!));
        }
    }
    if (failures.length > 0 || project === undefined) throwFound();
    const built = project!;
    for (const warning of [...generated, ...analyzeUnit(merged.unit)]) warnings.push({ ...warning });
    warnings.sort((first, second) => fileOrder(first.sourceRef) - fileOrder(second.sourceRef)
        || first.line - second.line || first.column - second.column);
    const reported = selectWarnings(warnings, options?.reportWarnings);

    // Assemble to bytecode
    let asmResult: AssemblyResult;
    try {
        asmResult = assemble(built.assembly);
    } catch (e) {
        const first = merged.unit.programs[0];
        throw assemblerError(`Assembly of the project failed: ${(e as Error).message}`,
            { line: first?.line ?? 1, column: first?.column ?? 1, sourceRef: files[0]!.ref });
    }

    const totalCodeSize = asmResult.bytecode.length;
    if (totalCodeSize > memoryProfile.codeSizeMax) {
        const first = built.programs[0];
        throw codeBudgetError(asmResult, built.units, memoryProfile.codeSizeMax, {
            line: merged.unit.programs[0]?.line ?? 1, column: merged.unit.programs[0]?.column ?? 1, ...(first?.sourceRef === undefined ? {} : { sourceRef: first.sourceRef }),
        });
    }

    // Where each program starts: the entry label of its code
    const programs = built.programs.map((entry, index) => {
        const label = asmResult.labels.get(entry.entryLabel.toUpperCase());
        const entryPoint = index === 0 ? asmResult.entryPoint : label?.address;
        if (entryPoint === undefined) {
            throw new CompilerError('INTERNAL_COMPILER_ERROR', `Program '${entry.name}' was not compiled`, 0, 0, 'codegen', entry.sourceRef);
        }
        return { ...entry, entryPoint };
    });
    const sections = programs.map((program, index) => ({
        ...program,
        // the code of a program runs from its entry to the next one; the first also holds the functions,
        // and the last the routines the programs share
        size: (index + 1 < programs.length ? programs[index + 1]!.entryPoint : totalCodeSize) - (index === 0 ? 0 : program.entryPoint),
    }));

    // Two programs may not write one physical output (CMP-047)
    const physicalOutputOwners: PhysicalOutputOwner[] = [];
    const allSymbols = built.symbols.all();
    for (const program of programs) {
        admitPhysicalOutputOwners(physicalOutputOwners, program.name, program.sourceRef ?? program.name, allSymbols);
    }

    // Build entry point map: by the name the task gives the program
    const entryPointByRef = new Map(programs.map((program) => [program.sourceRef, program.entryPoint] as const));
    const entryPointMap = new Map<string, number>();
    for (const file of files) {
        if (!file.runs) continue;
        const entryPoint = entryPointByRef.get(file.ref);
        if (entryPoint === undefined) continue;
        entryPointMap.set(file.label, entryPoint);
        entryPointMap.set(file.label.toLowerCase(), entryPoint);
    }

    // Build task definitions
    const taskDefs: TaskDef[] = [];
    let taskId = 0;

    for (const taskConfig of config.tasks) {
        const [firstProgram] = taskConfig.programs;

        const entryPoint = entryPointMap.get(firstProgram) ?? entryPointMap.get(firstProgram.toLowerCase());
        if (entryPoint === undefined) {
            throw new CompilerError(
                'UNKNOWN_TASK_PROGRAM',
                `Program '${firstProgram}' for task '${taskConfig.name}' was not compiled`,
                1, 1, 'codegen', PROJECT_FILE_NAME
            );
        }

        taskDefs.push({
            id: taskId++,
            type: mapTaskTrigger(taskConfig.trigger),
            priority: taskConfig.priority ?? 1,
            intervalUs: (taskConfig.interval ?? 10) * 1000,
            entryPoint,
            stackSize: 64,
        });
    }

    // The depth of each task, measured on the code and recorded in its definition (CMP-050); a task over the
    // limit of the target fails the build, naming the task and the file of its program.
    const depths = measureDepths(asmResult, taskDefs.map((task) => task.entryPoint), memoryProfile, (index) => {
        const firstProgram = config.tasks[index]!.programs[0]!;
        const file = files.find((each) => each.runs && (each.label === firstProgram || each.label.toLowerCase() === firstProgram.toLowerCase()));
        const program = parsedFiles.find((each) => each.ref === file?.ref)?.program;
        return { label: `Task '${config.tasks[index]!.name}'`, ref: file?.ref, line: program?.line, column: program?.column };
    });
    depths.forEach((depth, index) => {
        taskDefs[index]!.stackSize = Math.max(1, depth.stack);
        taskDefs[index]!.callDepth = depth.frames;
    });

    // Generate .zplc file with TASK segment
    const zplcFile = createMultiTaskZplcFile(asmResult.bytecode, taskDefs, asmResult.tags ?? []);

    // The map of the unit: one POU for each file, from the table the code was generated with (CMP-054)
    const entryByRef = new Map(programs.map((program) => [program.sourceRef, program.entryPoint] as const));
    // a file with no program is a POU named by its file name, as a program is by its own name; two files of one
    // name in different folders keep their whole path
    const taken = new Set<string>(parsedFiles.flatMap(({ program }) => (program ? [program.name] : [])));
    const libraryKey = (ref: string): string => {
        const name = ref.split(/[\\/]/).pop() || ref;
        const key = taken.has(name) ? ref : name;
        taken.add(key);
        return key;
    };
    const debugFiles: UnitDebugFile[] = parsedFiles.map(({ ref, unit, program }) => program
        ? { ref, sourceRef: ref, key: program.name, type: 'PROGRAM', entryPoint: entryByRef.get(ref) }
        : {
            ref,
            sourceRef: ref,
            key: libraryKey(ref),
            type: unit.functionBlocks.length > 0 ? 'FUNCTION_BLOCK' : unit.functions.length > 0 ? 'FUNCTION' : 'LIBRARY',
        });
    const debugMap = buildUnitDebugMap({
        projectName: config.name ?? 'Project',
        files: debugFiles,
        symbols: built.symbols,
        instructionMappings: asmResult.instructionMappings ?? [],
        assembly: built.assembly,
        typeResolver: createTypeResolver(built.symbols),
        memoryProfile,
    });
    debugMap.buildId = buildIdText(readArtifact(zplcFile).buildId);

    return {
        warnings: reported,
        zplcFile,
        bytecode: asmResult.bytecode,
        tasks: taskDefs,
        codeSize: totalCodeSize,
        programDetails: sections.map((program) => ({
            name: files.find((file) => file.runs && file.ref === program.sourceRef)?.label ?? program.name,
            entryPoint: program.entryPoint,
            size: program.size,
            assembly: program.assembly,
        })),
        debugMap,
    };
}

// =============================================================================
// Single-file convenience wrapper
// =============================================================================

/**
 * Options for single-file compilation with task generation.
 */
export interface SingleFileTaskOptions {
    /** Task name (default: 'MainTask') */
    taskName?: string;
    /** Cycle interval in milliseconds (default: 10ms) */
    intervalMs?: number;
    /** Task priority (default: 1) */
    priority?: number;
    /** Program name (default: 'Main') */
    programName?: string;
    /** Physical project-relative source identity for diagnostics and debug provenance. */
    sourceRef?: string;
}

/**
 * Compile a single file with automatic task generation.
 *
 * @param source - ST source code
 * @param options - Optional task configuration
 * @returns Compilation result with TASK segment
 */
export function compileSingleFileWithTask(
    source: string,
    options: SingleFileTaskOptions = {}
): CompilationResult & { tasks: TaskDef[] } {
    const {
        taskName = 'MainTask',
        intervalMs = 10,
        priority = 1,
        programName = 'Main',
        sourceRef,
    } = options;

    const config: ProjectConfig = {
        name: 'SingleFile',
        version: '1.0.0',
        tasks: [{
            name: taskName,
            trigger: 'cyclic',
            interval: intervalMs,
            priority,
            programs: [programName],
        }],
    };

    const programSources: ProgramSource[] = [{
        name: programName,
        content: source,
        sourceRef,
    }];

    const multiResult = compileMultiTaskProject(config, programSources);

    return {
        bytecode: multiResult.bytecode,
        zplcFile: multiResult.zplcFile,
        assembly: multiResult.programDetails[0]?.assembly ?? '',
        entryPoint: multiResult.tasks[0]?.entryPoint ?? 0,
        codeSize: multiResult.codeSize,
        tasks: multiResult.tasks,
        debugMap: multiResult.debugMap,
        warnings: multiResult.warnings,
    };
}
