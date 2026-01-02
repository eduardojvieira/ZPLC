/**
 * ZPLC Structured Text Compiler
 *
 * SPDX-License-Identifier: MIT
 *
 * Compiles IEC 61131-3 Structured Text to ZPLC bytecode.
 * Also supports visual languages (LD, FBD, SFC) via transpilation to ST.
 *
 * Usage:
 *   import { compileST, compileToBinary, compileProject, compileMultiTaskProject, compileSingleFileWithTask } from './compiler';
 *
 *   // Compile ST directly
 *   const asm = compileST(source);
 *   console.log(asm);
 *
 *   // Get bytecode directly
 *   const result = compileToBinary(source);
 *   console.log(result.bytecode);
 *
 *   // Compile any language (ST, LD, FBD, SFC)
 *   const projectResult = compileProject(content, 'LD');
 *   console.log(projectResult.bytecode);
 *
 *   // Compile multi-task project
 *   const multiResult = compileMultiTaskProject(config, sources);
 *   console.log(multiResult.tasks); // Array of TaskDef
 */

// Re-export lexer
export { tokenize, TokenType, LexerError } from './lexer.ts';
export type { Token, TokenTypeValue } from './lexer.ts';

// Re-export AST types
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

// Re-export parser
export { parse, ParseError } from './parser.ts';

// Re-export symbol table
export { SymbolTable, buildSymbolTable, MemoryLayout, getLoadStoreSuffix, getMemberLoadStoreSuffix } from './symbol-table.ts';
export type { Symbol } from './symbol-table.ts';

// Re-export stdlib
export { getFB, getFn, isFB, isFn, getAllFBNames, getAllFnNames } from './stdlib/index.ts';
export type { FunctionBlockDef, FunctionDef, CodeGenContext, MemberDef } from './stdlib/types.ts';

// Re-export code generator
export { generate, WORK_MEMORY_REGION_SIZE } from './codegen.ts';
export type { CodeGenOptions } from './codegen.ts';

// Re-export transpilers
export { transpileLDToST, transpileFBDToST, transpileSFCToST } from './transpilers/index.ts';

// Re-export debug map types and utilities
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
export type {
    MemoryRegion,
    DebugDataType,
    DebugVarInfo,
    DebugMemberInfo,
    SourceLineMapping,
    BreakpointLocation,
    DebugPOUInfo,
    DebugMap,
    BuildDebugMapOptions,
} from './debug-map.ts';

// Import for main functions
import { parse } from './parser.ts';
import { generate, WORK_MEMORY_REGION_SIZE } from './codegen.ts';
import type { CodeGenOptions } from './codegen.ts';
import { assemble } from '../assembler/index.ts';
import type { AssemblyResult } from '../assembler/index.ts';
import { transpileLDToST } from './transpilers/ld.ts';
import { transpileFBDToST } from './transpilers/fbd.ts';
import { transpileSFCToST } from './transpilers/sfc.ts';
import { parseLDModel } from '../models/ld.ts';
import { parseFBDModel } from '../models/fbd.ts';
import { parseSFCModel } from '../models/sfc.ts';
import type { DebugMap } from './debug-map.ts';
import { buildDebugMap } from './debug-map.ts';
import { buildSymbolTable } from './symbol-table.ts';

/**
 * Compiler error with source location.
 */
export class CompilerError extends Error {
    line: number;
    column: number;
    phase: 'lexer' | 'parser' | 'codegen' | 'assembler';

    constructor(message: string, line: number, column: number, phase: 'lexer' | 'parser' | 'codegen' | 'assembler') {
        super(`[${phase}] Error at ${line}:${column}: ${message}`);
        this.name = 'CompilerError';
        this.line = line;
        this.column = column;
        this.phase = phase;
    }
}

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
}

/**
 * Options for compilation functions.
 */
export interface CompileOptions extends CodeGenOptions {
    /** Generate debug map for source-level debugging */
    generateDebugMap?: boolean;
}

/**
 * Compile Structured Text to ZPLC Assembly.
 *
 * @param source - ST source code
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
    // Parse ST to AST
    const ast = parse(source);

    if (ast.programs.length === 0) {
        throw new CompilerError('No program found in source', 1, 1, 'parser');
    }

    // For now, compile only the first program
    const program = ast.programs[0];

    // Generate assembly
    return generate(program, options);
}

/**
 * Compile Structured Text to ZPLC bytecode.
 *
 * This is a convenience function that chains the ST compiler with the assembler.
 *
 * @param source - ST source code
 * @param options - Optional code generation options (for memory base configuration)
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
export function compileToBinary(source: string, options?: CompileOptions): CompilationResult {
    // Parse ST to AST
    const ast = parse(source);

    if (ast.programs.length === 0) {
        throw new CompilerError('No program found in source', 1, 1, 'parser');
    }

    const program = ast.programs[0];
    const generateDebugMap = options?.generateDebugMap ?? false;
    
    // Build codegen options - enable source annotations if debug map is requested
    const codegenOptions: CodeGenOptions = {
        ...options,
        emitSourceAnnotations: generateDebugMap,
    };
    
    // Generate assembly
    const assembly = generate(program, codegenOptions);

    // Assemble to bytecode
    let asmResult: AssemblyResult;
    try {
        asmResult = assemble(assembly);
    } catch (e) {
        const err = e as Error;
        throw new CompilerError(err.message, 0, 0, 'assembler');
    }

    const result: CompilationResult = {
        assembly,
        bytecode: asmResult.bytecode,
        zplcFile: asmResult.zplcFile,
        entryPoint: asmResult.entryPoint,
        codeSize: asmResult.codeSize,
    };
    
    // Build debug map if requested
    if (generateDebugMap) {
        const workMemoryBase = options?.workMemoryBase;
        const symbols = buildSymbolTable(program, workMemoryBase);
        
        result.debugMap = buildDebugMap({
            programName: program.name,
            symbols,
            instructionMappings: asmResult.instructionMappings,
            codeSize: asmResult.codeSize,
        });
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
// Unified Project Compilation
// =============================================================================

/**
 * Supported PLC languages.
 */
export type PLCLanguage = 'ST' | 'LD' | 'FBD' | 'SFC' | 'IL';

/**
 * Result of transpiling a visual language to ST.
 */
export interface TranspileResult {
    success: boolean;
    source: string;
    errors: string[];
}

/**
 * Result of compiling a project (any language).
 */
export interface ProjectCompilationResult extends CompilationResult {
    /** Original language */
    language: PLCLanguage;
    /** Intermediate ST code (for visual languages) */
    intermediateSTSource?: string;
    /** Transpilation errors (if any) */
    transpileErrors?: string[];
}

/**
 * Transpile a visual language to Structured Text.
 *
 * @param content - Source content (JSON for visual languages)
 * @param language - Source language (LD, FBD, SFC)
 * @returns TranspileResult with ST source code
 */
export function transpileToST(content: string, language: PLCLanguage): TranspileResult {
    switch (language) {
        case 'LD': {
            const model = parseLDModel(content);
            return transpileLDToST(model);
        }
        case 'FBD': {
            const model = parseFBDModel(content);
            return transpileFBDToST(model);
        }
        case 'SFC': {
            const model = parseSFCModel(content);
            return transpileSFCToST(model);
        }
        case 'ST':
            return { success: true, source: content, errors: [] };
        case 'IL':
            return { success: false, source: '', errors: ['IL compilation not yet supported. Use ST or visual languages.'] };
        default:
            return { success: false, source: '', errors: [`Unknown language: ${language}`] };
    }
}

/**
 * Compile a project from any supported language to ZPLC bytecode.
 *
 * This is the main entry point for the IDE "Compile" button. It handles:
 * - ST: Direct compilation
 * - LD/FBD/SFC: Transpile to ST, then compile
 *
 * @param content - Source content (ST code or JSON for visual languages)
 * @param language - Source language
 * @param options - Optional compilation options (debug map, memory base, etc.)
 * @returns Compilation result with bytecode and metadata
 * @throws CompilerError on compilation failure
 *
 * @example
 * ```typescript
 * // Compile ST
 * const result = compileProject(stSource, 'ST');
 *
 * // Compile LD (from JSON) with debug map
 * const result = compileProject(ldJson, 'LD', { generateDebugMap: true });
 * console.log(result.intermediateSTSource); // See transpiled ST
 * console.log(result.debugMap); // Debug info
 *
 * // Download as .zplc file
 * const blob = new Blob([result.zplcFile], { type: 'application/octet-stream' });
 * ```
 */
export function compileProject(content: string, language: PLCLanguage, options?: CompileOptions): ProjectCompilationResult {
    let stSource = content;
    let intermediateSTSource: string | undefined;
    let transpileErrors: string[] = [];

    // Step 1: Transpile visual languages to ST
    if (language !== 'ST') {
        const transpileResult = transpileToST(content, language);
        
        if (!transpileResult.success) {
            throw new CompilerError(
                `Transpilation failed: ${transpileResult.errors.join('; ')}`,
                0, 0, 'parser'
            );
        }
        
        stSource = transpileResult.source;
        intermediateSTSource = transpileResult.source;
        transpileErrors = transpileResult.errors;
    }

    // Step 2: Compile ST to bytecode
    const compilationResult = compileToBinary(stSource, options);

    return {
        ...compilationResult,
        language,
        intermediateSTSource,
        transpileErrors: transpileErrors.length > 0 ? transpileErrors : undefined,
    };
}

// =============================================================================
// Multi-Task Project Compilation
// =============================================================================

import { createMultiTaskZplcFile, relocateBytecode, TASK_TYPE } from '../assembler/index.ts';
import type { TaskDef, TaskType } from '../assembler/index.ts';
import type { ZPLCProjectConfig, TaskDefinition } from '../types/index.ts';
import { MemoryLayout } from './symbol-table.ts';

/**
 * Program source file for multi-task compilation.
 */
export interface ProgramSource {
    /** Program name (matches task.programs[] entries) */
    name: string;
    /** Source content */
    content: string;
    /** Source language */
    language: PLCLanguage;
}

/**
 * Result of multi-task project compilation.
 */
export interface MultiTaskCompilationResult {
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
}

/**
 * Map TaskTrigger from project config to TaskType for assembler.
 */
function mapTaskTrigger(trigger: TaskDefinition['trigger']): TaskType {
    switch (trigger) {
        case 'cyclic':
            return TASK_TYPE.CYCLIC;
        case 'event':
            return TASK_TYPE.EVENT;
        case 'freewheeling':
            return TASK_TYPE.CYCLIC; // Freewheeling is cyclic with minimal interval
        default:
            return TASK_TYPE.CYCLIC;
    }
}

/**
 * Compile a multi-task project to a single .zplc file.
 *
 * This function takes a project configuration with multiple tasks and
 * multiple program sources, compiles each program, concatenates the
 * bytecode with proper entry points, and generates a .zplc file with
 * both CODE and TASK segments.
 *
 * @param config - Project configuration (from zplc.json)
 * @param programSources - Map of program name to source content
 * @returns Multi-task compilation result
 * @throws CompilerError if compilation fails
 *
 * @example
 * ```typescript
 * const config: ZPLCProjectConfig = {
 *   name: 'MultiTaskDemo',
 *   version: '1.0.0',
 *   tasks: [
 *     { name: 'FastTask', trigger: 'cyclic', interval: 10, priority: 0, programs: ['FastLogic'] },
 *     { name: 'SlowTask', trigger: 'cyclic', interval: 100, priority: 1, programs: ['SlowLogic'] },
 *   ],
 * };
 *
 * const sources: ProgramSource[] = [
 *   { name: 'FastLogic', content: fastSTCode, language: 'ST' },
 *   { name: 'SlowLogic', content: slowSTCode, language: 'ST' },
 * ];
 *
 * const result = compileMultiTaskProject(config, sources);
 * // result.zplcFile contains the complete binary with 2 tasks
 * ```
 */
export function compileMultiTaskProject(
    config: ZPLCProjectConfig,
    programSources: ProgramSource[]
): MultiTaskCompilationResult {
    if (!config.tasks || config.tasks.length === 0) {
        throw new CompilerError('No tasks defined in project configuration', 0, 0, 'codegen');
    }

    // Build a map of program name -> source for quick lookup
    // We store both with and without extension for flexible matching
    const sourceMap = new Map<string, ProgramSource>();
    for (const source of programSources) {
        // Store by original name
        sourceMap.set(source.name, source);
        // Also store by name with common extensions for flexible lookup
        sourceMap.set(source.name.toLowerCase(), source);
        sourceMap.set(`${source.name}.st`.toLowerCase(), source);
        sourceMap.set(`${source.name}.fbd`.toLowerCase(), source);
        sourceMap.set(`${source.name}.ld`.toLowerCase(), source);
        sourceMap.set(`${source.name}.sfc`.toLowerCase(), source);
        sourceMap.set(`${source.name}.il`.toLowerCase(), source);
    }

    /**
     * Find a program source by name, handling both with and without extension.
     */
    const findSource = (progName: string): ProgramSource | undefined => {
        // Try exact match first
        let source = sourceMap.get(progName);
        if (source) return source;
        
        // Try lowercase
        source = sourceMap.get(progName.toLowerCase());
        if (source) return source;
        
        // Try without extension
        const baseName = progName.replace(/\.(st|fbd|ld|sfc|il)$/i, '');
        source = sourceMap.get(baseName);
        if (source) return source;
        
        source = sourceMap.get(baseName.toLowerCase());
        return source;
    };

    // Collect all unique programs referenced by tasks
    const referencedPrograms = new Set<string>();
    for (const task of config.tasks) {
        for (const progName of task.programs) {
            referencedPrograms.add(progName);
        }
    }

    // Compile each program and track entry points
    // Each program gets its own work memory region to avoid conflicts
    const compiledPrograms: {
        name: string;
        bytecode: Uint8Array;
        assembly: string;
        entryPoint: number;
        size: number;
    }[] = [];

    let currentOffset = 0;
    let programIndex = 0;

    for (const progName of referencedPrograms) {
        const source = findSource(progName);
        if (!source) {
            throw new CompilerError(
                `Program '${progName}' referenced by task but not found in sources`,
                0, 0, 'codegen'
            );
        }

        // Calculate work memory base for this program
        // Each program gets WORK_MEMORY_REGION_SIZE bytes of isolated work memory
        const workMemoryBase = MemoryLayout.WORK_BASE + (programIndex * WORK_MEMORY_REGION_SIZE);

        // Transpile if needed
        let stSource = source.content;
        if (source.language !== 'ST') {
            const transpileResult = transpileToST(source.content, source.language);
            if (!transpileResult.success) {
                throw new CompilerError(
                    `Transpilation of '${progName}' failed: ${transpileResult.errors.join('; ')}`,
                    0, 0, 'parser'
                );
            }
            stSource = transpileResult.source;
        }

        // Compile to assembly with isolated work memory region
        let assembly: string;
        try {
            assembly = compileST(stSource, { workMemoryBase });
        } catch (e) {
            const err = e as Error;
            throw new CompilerError(
                `Compilation of '${progName}' failed: ${err.message}`,
                0, 0, 'codegen'
            );
        }

        // Assemble to bytecode
        let asmResult: AssemblyResult;
        try {
            asmResult = assemble(assembly);
        } catch (e) {
            const err = e as Error;
            throw new CompilerError(
                `Assembly of '${progName}' failed: ${err.message}`,
                0, 0, 'assembler'
            );
        }

        compiledPrograms.push({
            name: progName,
            bytecode: asmResult.bytecode,
            assembly,
            entryPoint: currentOffset,
            size: asmResult.bytecode.length,
        });

        currentOffset += asmResult.bytecode.length;
        programIndex++;
    }

    // Concatenate all bytecode with relocation
    // Each program was compiled with addresses starting at 0, so we must
    // relocate absolute jump addresses when placing them at different offsets.
    const totalCodeSize = compiledPrograms.reduce((sum, p) => sum + p.size, 0);
    const concatenatedBytecode = new Uint8Array(totalCodeSize);
    let offset = 0;
    for (const prog of compiledPrograms) {
        // Make a copy so we don't modify the original
        const relocatedBytecode = new Uint8Array(prog.bytecode);
        
        // Relocate absolute jump addresses by adding the program's entry point
        relocateBytecode(relocatedBytecode, prog.entryPoint);
        
        // Copy to concatenated buffer
        concatenatedBytecode.set(relocatedBytecode, offset);
        offset += prog.size;
    }

    // Build program name -> entry point map
    // Store both with and without extension for flexible lookup
    const entryPointMap = new Map<string, number>();
    for (const prog of compiledPrograms) {
        entryPointMap.set(prog.name, prog.entryPoint);
        entryPointMap.set(prog.name.toLowerCase(), prog.entryPoint);
        // Also store with common extensions
        entryPointMap.set(`${prog.name}.st`.toLowerCase(), prog.entryPoint);
        entryPointMap.set(`${prog.name}.fbd`.toLowerCase(), prog.entryPoint);
        entryPointMap.set(`${prog.name}.ld`.toLowerCase(), prog.entryPoint);
        entryPointMap.set(`${prog.name}.sfc`.toLowerCase(), prog.entryPoint);
        entryPointMap.set(`${prog.name}.il`.toLowerCase(), prog.entryPoint);
    }

    /**
     * Find entry point by program name, handling both with and without extension.
     */
    const findEntryPoint = (progName: string): number | undefined => {
        let ep = entryPointMap.get(progName);
        if (ep !== undefined) return ep;
        
        ep = entryPointMap.get(progName.toLowerCase());
        if (ep !== undefined) return ep;
        
        const baseName = progName.replace(/\.(st|fbd|ld|sfc|il)$/i, '');
        ep = entryPointMap.get(baseName);
        if (ep !== undefined) return ep;
        
        return entryPointMap.get(baseName.toLowerCase());
    };

    // Build task definitions
    const taskDefs: TaskDef[] = [];
    let taskId = 0;

    for (const taskConfig of config.tasks) {
        // For now, we use the first program's entry point as the task entry
        // In a full implementation, you might concatenate program bytecode per task
        const firstProgram = taskConfig.programs[0];
        if (!firstProgram) {
            throw new CompilerError(
                `Task '${taskConfig.name}' has no programs assigned`,
                0, 0, 'codegen'
            );
        }

        const entryPoint = findEntryPoint(firstProgram);
        if (entryPoint === undefined) {
            throw new CompilerError(
                `Program '${firstProgram}' for task '${taskConfig.name}' was not compiled`,
                0, 0, 'codegen'
            );
        }

        taskDefs.push({
            id: taskId++,
            type: mapTaskTrigger(taskConfig.trigger),
            priority: taskConfig.priority ?? 1,
            intervalUs: (taskConfig.interval ?? 10) * 1000, // Convert ms to us
            entryPoint,
            stackSize: 64, // Default stack size
        });
    }

    // Generate .zplc file with TASK segment
    const zplcFile = createMultiTaskZplcFile(concatenatedBytecode, taskDefs);

    return {
        zplcFile,
        bytecode: concatenatedBytecode,
        tasks: taskDefs,
        codeSize: totalCodeSize,
        programDetails: compiledPrograms.map(p => ({
            name: p.name,
            entryPoint: p.entryPoint,
            size: p.size,
            assembly: p.assembly,
        })),
    };
}

// =============================================================================
// Single-File Compilation with Default Task (for IDE quick compile)
// =============================================================================

/**
 * Options for single-file compilation with task generation.
 */
export interface SingleFileTaskOptions {
    /** Task name (default: 'MainTask') */
    taskName?: string;
    /** Cycle interval in milliseconds (default: 10ms) */
    intervalMs?: number;
    /** Task priority (default: 1, lower = higher priority) */
    priority?: number;
    /** Program name extracted from source (default: 'Main') */
    programName?: string;
}

/**
 * Result of single-file compilation with task.
 * Extends ProjectCompilationResult with task information.
 */
export interface SingleFileTaskResult extends ProjectCompilationResult {
    /** Task definitions (always contains exactly one task) */
    tasks: TaskDef[];
    /** Whether the file contains TASK segment (always true) */
    hasTaskSegment: boolean;
}

/**
 * Compile a single file with automatic task generation.
 * 
 * This is a convenience function for the IDE that wraps compileMultiTaskProject
 * with a default single-task configuration. The resulting .zplc file includes
 * the TASK segment required by the Zephyr scheduler.
 * 
 * @param content - Source code content
 * @param language - Source language (ST, LD, FBD, SFC)
 * @param options - Optional task configuration
 * @returns Compilation result with TASK segment
 * 
 * @example
 * ```typescript
 * // Quick compile with 10ms cycle (default)
 * const result = compileSingleFileWithTask(source, 'ST');
 * 
 * // Custom cycle time for slower tasks
 * const result = compileSingleFileWithTask(source, 'ST', { intervalMs: 100 });
 * ```
 */
export function compileSingleFileWithTask(
    content: string,
    language: PLCLanguage,
    options: SingleFileTaskOptions = {}
): SingleFileTaskResult {
    const {
        taskName = 'MainTask',
        intervalMs = 10,
        priority = 1,
        programName = 'Main',
    } = options;

    // Create a minimal project config with one task
    const config: ZPLCProjectConfig = {
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

    // Create program source
    const programSources: ProgramSource[] = [{
        name: programName,
        content,
        language,
    }];

    // Compile using multi-task compiler
    const multiResult = compileMultiTaskProject(config, programSources);

    // Return in ProjectCompilationResult format with task info
    return {
        bytecode: multiResult.bytecode,
        zplcFile: multiResult.zplcFile,
        assembly: multiResult.programDetails[0]?.assembly ?? '',
        entryPoint: multiResult.tasks[0]?.entryPoint ?? 0,
        codeSize: multiResult.codeSize,
        debugMap: undefined, // TODO: propagate debug map from multi-task compile
        language,
        tasks: multiResult.tasks,
        hasTaskSegment: true,
    };
}
