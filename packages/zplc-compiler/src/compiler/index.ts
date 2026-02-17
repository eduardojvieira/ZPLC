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
export { tokenize, TokenType, LexerError } from './lexer.ts';
export type { Token, TokenTypeValue } from './lexer.ts';

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
export { parse, ParseError } from './parser.ts';

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
export { generate, WORK_MEMORY_REGION_SIZE } from './codegen.ts';
export type { CodeGenOptions } from './codegen.ts';

// =============================================================================
// Assembler exports (ASM -> bytecode)
// =============================================================================
export { assemble, createZplcFile, createMultiTaskZplcFile, relocateBytecode, TASK_TYPE, AssemblerError, ZPLC_CONSTANTS } from '../assembler/index.ts';
export type { AssemblyResult, TaskDef, TaskType, InstructionMapping } from '../assembler/index.ts';

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
    TypeResolver,
} from './debug-map.ts';

// =============================================================================
// Internal imports for main functions
// =============================================================================
import { parse } from './parser.ts';
import { generate, WORK_MEMORY_REGION_SIZE } from './codegen.ts';
import type { CodeGenOptions } from './codegen.ts';
import { assemble, createMultiTaskZplcFile, relocateBytecode, TASK_TYPE } from '../assembler/index.ts';
import type { AssemblyResult, TaskDef, TaskType } from '../assembler/index.ts';
import type { DebugMap, TypeResolver } from './debug-map.ts';
import { buildDebugMap } from './debug-map.ts';
import { buildSymbolTable, MemoryLayout } from './symbol-table.ts';
import { getFB } from './stdlib/index.ts';
import type { DataTypeValue } from './ast.ts';

// =============================================================================
// Error types
// =============================================================================

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
}

/**
 * Options for compilation functions.
 */
export interface CompileOptions extends CodeGenOptions {
    /** Generate debug map for source-level debugging */
    generateDebugMap?: boolean;
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
        throw new CompilerError('No program found in source', 1, 1, 'parser');
    }

    // Pass the full CompilationUnit to generate() to support functions
    return generate(ast, options);
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
            // 1. Check user-defined FBs
            const fbDef = symbols.getFBDefinition(typeName);
            if (fbDef) {
                const member = fbDef.members.get(memberName);
                if (member) {
                    return {
                        offset: member.offset,
                        size: member.size,
                        dataType: typeof member.dataType === 'string' ? member.dataType : 'DINT',
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
                        dataType: typeof member.dataType === 'string' ? member.dataType : 'DINT',
                    };
                }
            }

            // 3. Check stdlib FBs
            const stdFB = getFB(typeName as DataTypeValue);
            if (stdFB) {
                const member = stdFB.members.find(m => m.name === memberName);
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
    const ast = parse(source);

    if (ast.programs.length === 0) {
        throw new CompilerError('No program found in source', 1, 1, 'parser');
    }

    const program = ast.programs[0]; // Still need main program for name/entry point
    const generateDebugMap = options?.generateDebugMap ?? false;

    // Build codegen options - enable source annotations if debug map is requested
    const codegenOptions: CodeGenOptions = {
        ...options,
        emitSourceAnnotations: generateDebugMap,
    };

    // Generate assembly using full AST
    const assembly = generate(ast, codegenOptions);

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
            typeResolver: createTypeResolver(symbols),
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

/**
 * Program source for multi-task compilation.
 */
export interface ProgramSource {
    /** Program name (matches task.programs[] entries) */
    name: string;
    /** ST source code */
    content: string;
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
 * Map TaskConfig trigger to TaskType for assembler.
 */
function mapTaskTrigger(trigger: TaskConfig['trigger']): TaskType {
    switch (trigger) {
        case 'cyclic':
            return TASK_TYPE.CYCLIC;
        case 'event':
            return TASK_TYPE.EVENT;
        case 'freewheeling':
            return TASK_TYPE.CYCLIC;
        default:
            return TASK_TYPE.CYCLIC;
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
    programSources: ProgramSource[]
): MultiTaskCompilationResult {
    if (!config.tasks || config.tasks.length === 0) {
        throw new CompilerError('No tasks defined in project configuration', 0, 0, 'codegen');
    }

    // Build source map for lookup
    const sourceMap = new Map<string, ProgramSource>();
    for (const source of programSources) {
        sourceMap.set(source.name, source);
        sourceMap.set(source.name.toLowerCase(), source);
    }

    // Collect all unique programs
    const referencedPrograms = new Set<string>();
    for (const task of config.tasks) {
        for (const progName of task.programs) {
            referencedPrograms.add(progName);
        }
    }

    // Compile each program
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
        const source = sourceMap.get(progName) || sourceMap.get(progName.toLowerCase());
        if (!source) {
            throw new CompilerError(
                `Program '${progName}' referenced by task but not found in sources`,
                0, 0, 'codegen'
            );
        }

        // Calculate work memory base for this program
        const workMemoryBase = MemoryLayout.WORK_BASE + (programIndex * WORK_MEMORY_REGION_SIZE);

        // Compile to assembly
        let assembly: string;
        try {
            assembly = compileST(source.content, { workMemoryBase });
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
            // The entry point for the task is the global offset + the program's local entry point (_start)
            entryPoint: currentOffset + asmResult.entryPoint,
            size: asmResult.bytecode.length,
        });

        currentOffset += asmResult.bytecode.length;
        programIndex++;
    }

    // Concatenate all bytecode with relocation
    const totalCodeSize = compiledPrograms.reduce((sum, p) => sum + p.size, 0);
    const concatenatedBytecode = new Uint8Array(totalCodeSize);
    let offset = 0;
    for (const prog of compiledPrograms) {
        const relocatedBytecode = new Uint8Array(prog.bytecode);
        // Relocate relative to the start of this program in the global buffer
        // Note: prog.entryPoint includes the local _start offset, so we need to subtract it 
        // to get the base address, OR just use our tracking offset variable.
        relocateBytecode(relocatedBytecode, offset);
        concatenatedBytecode.set(relocatedBytecode, offset);
        offset += prog.size;
    }

    // Build entry point map
    const entryPointMap = new Map<string, number>();
    for (const prog of compiledPrograms) {
        entryPointMap.set(prog.name, prog.entryPoint);
        entryPointMap.set(prog.name.toLowerCase(), prog.entryPoint);
    }

    // Build task definitions
    const taskDefs: TaskDef[] = [];
    let taskId = 0;

    for (const taskConfig of config.tasks) {
        const firstProgram = taskConfig.programs[0];
        if (!firstProgram) {
            throw new CompilerError(
                `Task '${taskConfig.name}' has no programs assigned`,
                0, 0, 'codegen'
            );
        }

        const entryPoint = entryPointMap.get(firstProgram) ?? entryPointMap.get(firstProgram.toLowerCase());
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
            intervalUs: (taskConfig.interval ?? 10) * 1000,
            entryPoint,
            stackSize: 64,
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
    }];

    const multiResult = compileMultiTaskProject(config, programSources);

    return {
        bytecode: multiResult.bytecode,
        zplcFile: multiResult.zplcFile,
        assembly: multiResult.programDetails[0]?.assembly ?? '',
        entryPoint: multiResult.tasks[0]?.entryPoint ?? 0,
        codeSize: multiResult.codeSize,
        tasks: multiResult.tasks,
    };
}
