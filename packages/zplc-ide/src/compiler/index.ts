/**
 * ZPLC IDE Compiler Module
 *
 * SPDX-License-Identifier: MIT
 *
 * This module re-exports the core compiler from @zplc/compiler and adds
 * IDE-specific functionality like visual language transpilation.
 */

// =============================================================================
// Re-export everything from @zplc/compiler
// =============================================================================
export * from '@zplc/compiler';

// Override some types that need IDE-specific extensions
import {
    compileST,
    compileToBinary,
    assemble,
    CompilerError,
    WORK_MEMORY_REGION_SIZE,
    MemoryLayout,
    createMultiTaskZplcFile,
    relocateBytecode,
    TASK_TYPE,
    type CompilationResult,
    type CompileOptions,
    type AssemblyResult,
    type TaskDef,
    type TaskType,
} from '@zplc/compiler';

// =============================================================================
// IDE-specific: Transpilers (Visual Languages -> ST)
// =============================================================================
export { transpileLDToST } from './transpilers/ld.ts';
export { transpileFBDToST } from './transpilers/fbd.ts';
export { transpileSFCToST } from './transpilers/sfc.ts';
export { transpileILToST } from './transpilers/il.ts';

import { transpileLDToST } from './transpilers/ld.ts';
import { transpileFBDToST } from './transpilers/fbd.ts';
import { transpileSFCToST } from './transpilers/sfc.ts';
import { transpileILToST } from './transpilers/il.ts';
import { parseLDModel } from '../models/ld.ts';
import { parseFBDModel } from '../models/fbd.ts';
import { parseSFCModel } from '../models/sfc.ts';
import { parseIL } from './il/parser.ts';
import type { ZPLCProjectConfig, TaskDefinition } from '../types/index.ts';

// =============================================================================
// IDE-specific Types
// =============================================================================

/**
 * Supported PLC languages (IDE supports visual languages).
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
 */
export interface SingleFileTaskResult extends ProjectCompilationResult {
    /** Task definitions (always contains exactly one task) */
    tasks: TaskDef[];
    /** Whether the file contains TASK segment (always true) */
    hasTaskSegment: boolean;
}

// =============================================================================
// IDE-specific Functions
// =============================================================================

/**
 * Transpile a visual language to Structured Text.
 *
 * @param content - Source content (JSON for visual languages)
 * @param language - Source language (LD, FBD, SFC, IL)
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
        case 'IL': {
            const ilProgram = parseIL(content);
            return transpileILToST(ilProgram);
        }
        default:
            return { success: false, source: '', errors: [`Unknown language: ${language}`] };
    }
}

/**
 * Compile a project from any supported language to ZPLC bytecode.
 *
 * This is the main entry point for the IDE "Compile" button.
 *
 * @param content - Source content (ST code or JSON for visual languages)
 * @param language - Source language
 * @param options - Optional compilation options
 * @returns Compilation result with bytecode and metadata
 * @throws CompilerError on compilation failure
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
            return TASK_TYPE.CYCLIC;
        default:
            return TASK_TYPE.CYCLIC;
    }
}

/**
 * Compile a multi-task project to a single .zplc file.
 *
 * @param config - Project configuration (from zplc.json)
 * @param programSources - Array of program sources
 * @returns Multi-task compilation result
 * @throws CompilerError if compilation fails
 */
export function compileMultiTaskProject(
    config: ZPLCProjectConfig,
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

    const findSource = (progName: string): ProgramSource | undefined => {
        let source = sourceMap.get(progName);
        if (source) return source;
        source = sourceMap.get(progName.toLowerCase());
        if (source) return source;
        const baseName = progName.replace(/\.(st|fbd|ld|sfc|il)$/i, '');
        return sourceMap.get(baseName) || sourceMap.get(baseName.toLowerCase());
    };

    // Collect referenced programs
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
        const source = findSource(progName);
        if (!source) {
            throw new CompilerError(
                `Program '${progName}' referenced by task but not found in sources`,
                0, 0, 'codegen'
            );
        }

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

        // Compile to assembly
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

    // Concatenate bytecode with relocation
    const totalCodeSize = compiledPrograms.reduce((sum, p) => sum + p.size, 0);
    const concatenatedBytecode = new Uint8Array(totalCodeSize);
    let offset = 0;
    for (const prog of compiledPrograms) {
        const relocatedBytecode = new Uint8Array(prog.bytecode);
        relocateBytecode(relocatedBytecode, prog.entryPoint);
        concatenatedBytecode.set(relocatedBytecode, offset);
        offset += prog.size;
    }

    // Build entry point map
    const entryPointMap = new Map<string, number>();
    for (const prog of compiledPrograms) {
        entryPointMap.set(prog.name, prog.entryPoint);
        entryPointMap.set(prog.name.toLowerCase(), prog.entryPoint);
    }

    const findEntryPoint = (progName: string): number | undefined => {
        let ep = entryPointMap.get(progName);
        if (ep !== undefined) return ep;
        ep = entryPointMap.get(progName.toLowerCase());
        if (ep !== undefined) return ep;
        const baseName = progName.replace(/\.(st|fbd|ld|sfc|il)$/i, '');
        return entryPointMap.get(baseName) || entryPointMap.get(baseName.toLowerCase());
    };

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
            intervalUs: (taskConfig.interval ?? 10) * 1000,
            entryPoint,
            stackSize: 64,
        });
    }

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

/**
 * Compile a single file with automatic task generation.
 *
 * Convenience function for the IDE that wraps compileMultiTaskProject
 * with a default single-task configuration.
 *
 * @param content - Source code content
 * @param language - Source language (ST, LD, FBD, SFC)
 * @param options - Optional task configuration
 * @returns Compilation result with TASK segment
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

    const programSources: ProgramSource[] = [{
        name: programName,
        content,
        language,
    }];

    const multiResult = compileMultiTaskProject(config, programSources);

    return {
        bytecode: multiResult.bytecode,
        zplcFile: multiResult.zplcFile,
        assembly: multiResult.programDetails[0]?.assembly ?? '',
        entryPoint: multiResult.tasks[0]?.entryPoint ?? 0,
        codeSize: multiResult.codeSize,
        debugMap: undefined,
        language,
        tasks: multiResult.tasks,
        hasTaskSegment: true,
    };
}
