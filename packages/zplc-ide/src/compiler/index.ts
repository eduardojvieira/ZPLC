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
    compileMultiTaskProject as compileCoreMultiTaskProject,
    assertTaskProgramCardinality,
    compileToBinary,
    CompilerError,
    parse,
    ZPLC_CONSTANTS,
    type CompilationResult,
    type CompileOptions,
    type TaskDef,
    type DebugMap,
    type ProjectConfig as CoreProjectConfig,
    type ProgramSource as CoreProgramSource,
    type CompilerWarning,
} from '@zplc/compiler';

export const LANGUAGE_WORKFLOW_STAGE = {
    AUTHOR: 'author',
    COMPILE: 'compile',
    SIMULATE: 'simulate',
    DEPLOY: 'deploy',
    DEBUG: 'debug',
} as const;

interface LanguageWorkflowSupport {
    author: boolean;
    compile: boolean;
    simulate: boolean;
    deploy: boolean;
    debug: boolean;
}

export const LANGUAGE_WORKFLOW_SUPPORT: Record<PLCLanguage, LanguageWorkflowSupport> = {
    ST: { author: true, compile: true, simulate: true, deploy: true, debug: true },
    IL: { author: true, compile: true, simulate: true, deploy: true, debug: true },
    LD: { author: true, compile: true, simulate: true, deploy: true, debug: true },
    FBD: { author: true, compile: true, simulate: true, deploy: true, debug: true },
    SFC: { author: true, compile: true, simulate: true, deploy: true, debug: true },
};

export function getLanguageWorkflowSupport(language: PLCLanguage): LanguageWorkflowSupport {
    return LANGUAGE_WORKFLOW_SUPPORT[language];
}

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
import { parseFBDModel } from '../models/fbd.ts';
import { parseSFCModel } from '../models/sfc.ts';
import { parseIL, ILParseError } from './il/parser.ts';
import { ILLexerError } from './il/lexer.ts';
import type { ILProjectSymbols } from './il/ilToST.ts';
import type {
    ZPLCProjectConfig,
    CommunicationTagConfig,
} from '../types/index.ts';
import { getCompilerMemoryProfile } from '../config/boardProfiles.ts';

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
    /** Line in the source file of the first error, for languages whose sources have lines (IL). */
    line?: number;
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
    /** Exact project-relative source path for diagnostics and debug provenance. */
    sourceRef?: string;
}

/**
 * Result of multi-task project compilation.
 */
export interface MultiTaskCompilationResult {
    /** What the compiler accepted that the language reference does not define (CMP-031), in source order. */
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
    /** Exact project-relative source path for diagnostics and debug provenance. */
    sourceRef?: string;
    /** Communication tags to inject as ST variable tags */
    communicationTags?: CommunicationTagConfig[];
}

/**
 * Result of single-file compilation with task.
 */
export interface SingleFileTaskResult extends ProjectCompilationResult {
    /** What the compiler accepted that the language reference does not define (CMP-031). */
    warnings: CompilerWarning[];
    /** Task definitions (always contains exactly one task) */
    tasks: TaskDef[];
    /** Whether the file contains TASK segment (always true) */
    hasTaskSegment: boolean;
    /** Debug map is always present for single-file compilation */
    debugMap: DebugMap;
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
export function transpileToST(content: string, language: PLCLanguage, symbols?: ILProjectSymbols): TranspileResult {
    switch (language) {
        case 'LD': {
            try {
                return transpileLDToST(JSON.parse(content));
            } catch (error) {
                return { success: false, source: '', errors: [error instanceof Error ? error.message : String(error)] };
            }
        }
        case 'FBD': {
            try {
                return transpileFBDToST(parseFBDModel(content));
            } catch (error) {
                return { success: false, source: '', errors: [error instanceof Error ? error.message : String(error)] };
            }
        }
        case 'SFC': {
            try {
                return transpileSFCToST(parseSFCModel(content));
            } catch (error) {
                return { success: false, source: '', errors: [error instanceof Error ? error.message : String(error)] };
            }
        }
        case 'ST':
            return { success: true, source: content, errors: [] };
        case 'IL': {
            try {
                const ilProgram = parseIL(content);
                return transpileILToST(ilProgram, { symbols });
            } catch (error) {
                const line = error instanceof ILParseError || error instanceof ILLexerError ? error.line : undefined;
                return { success: false, source: '', errors: [error instanceof Error ? error.message : String(error)], line };
            }
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

function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTagAnnotations(tag: CommunicationTagConfig): string[] {
    const annotations: string[] = [];

    if (tag.publish || tag.mode === 'publish') {
        annotations.push('{publish}');
    }

    if (tag.subscribe || tag.mode === 'subscribe') {
        annotations.push('{subscribe}');
    }

    if (tag.modbusAddress !== undefined || tag.mode === 'modbus') {
        annotations.push(`{modbus:${tag.modbusAddress ?? 1}}`);
    }

    return annotations;
}

const MODBUS_HELPER_REGEX = /^\s*MODBUS_(COIL|DISCRETE_INPUT|INPUT_REGISTER|HOLDING_REGISTER)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(\d+)\s*\)\s*;\s*$/i;

function applyModbusBindingHelpers(stSource: string): string {
    const lines = stSource.split('\n');
    const bindings = new Map<string, number>();
    const keptLines: string[] = [];

    for (const line of lines) {
        const match = line.match(MODBUS_HELPER_REGEX);
        if (!match) {
            keptLines.push(line);
            continue;
        }

        bindings.set(match[2], parseInt(match[3], 10));
        // the line stays, empty: every diagnostic is reported at the line the author sees (CMP-006)
        keptLines.push('');
    }

    if (bindings.size === 0) {
        return stSource;
    }

    for (const [symbol, address] of bindings.entries()) {
        const symbolExpr = escapeRegExp(symbol);
        const declRegex = new RegExp(`^(\\s*${symbolExpr}\\s*:[^;]*)(;.*)$`, 'i');
        // the declaration is the first line that looks like one: `Symbol := 1;` further down is a statement
        for (let i = 0; i < keptLines.length; i++) {
            const match = keptLines[i].match(declRegex);
            if (!match) {
                continue;
            }

            const annotation = `{modbus:${address}}`;
            if (!keptLines[i].includes(annotation)) {
                keptLines[i] = `${match[1]} ${annotation}${match[2]}`;
            }
            break;
        }
    }

    return keptLines.join('\n');
}

export function applyCommunicationTags(stSource: string, tags: CommunicationTagConfig[]): string {
    const withHelpers = applyModbusBindingHelpers(stSource);
    if (!tags.length) {
        return withHelpers;
    }

    const lines = withHelpers.split('\n');
    const missing: CommunicationTagConfig[] = [];

    for (const tag of tags) {
        const annotations = getTagAnnotations(tag);
        if (annotations.length === 0) {
            continue;
        }
        const symbolExpr = escapeRegExp(tag.symbol);
        const declRegex = new RegExp(`^(\\s*${symbolExpr}\\s*:[^;]*)(;.*)$`, 'i');
        let updated = false;

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(declRegex);
            if (!match) {
                continue;
            }

            const missingAnnotations = annotations.filter((annotation) => !lines[i].includes(annotation));
            if (missingAnnotations.length > 0) {
                lines[i] = `${match[1]} ${missingAnnotations.join(' ')}${match[2]}`;
            }
            updated = true;
            break;
        }

        if (!updated) {
            missing.push(tag);
        }
    }

    if (!missing.length) {
        return lines.join('\n');
    }

    // The declarations go on the line of VAR (or PROGRAM) when it ends there, so that no line of the author's
    // source moves and every diagnostic is reported at the line they see (CMP-006).
    const sameLine = (line: string): boolean => !/\/\/|\(\*|\/\*/.test(line);
    const varIndex = lines.findIndex((line) => /^\s*VAR\b/i.test(line));
    if (varIndex >= 0) {
        const declarations = missing.map((tag) => {
            const note = tag.description ? ` (* ${tag.description} *)` : '';
            return `    ${tag.symbol} : ${tag.type} ${getTagAnnotations(tag).join(' ')};${note}`;
        });
        if (sameLine(lines[varIndex])) {
            lines[varIndex] = `${lines[varIndex]}${declarations.join('')}`;
        } else {
            lines.splice(varIndex + 1, 0, ...declarations);
        }
        return lines.join('\n');
    }

    const programIndex = lines.findIndex((line) => /^\s*PROGRAM\b/i.test(line));
    if (programIndex >= 0) {
        const declarations = missing.map((tag) => {
            const note = tag.description ? ` (* ${tag.description} *)` : '';
            return `    ${tag.symbol} : ${tag.type} ${getTagAnnotations(tag).join(' ')};${note}`;
        });
        if (sameLine(lines[programIndex])) {
            lines[programIndex] = `${lines[programIndex]} VAR${declarations.join('')} END_VAR`;
        } else {
            lines.splice(programIndex + 1, 0, ...['VAR', ...declarations, 'END_VAR', '']);
        }
        return lines.join('\n');
    }

    return stSource;
}

/**
 * Declarations outside an IL program that its operands may refer to: VAR_GLOBAL variables and the
 * members of user function blocks, taken from the project's ST sources. A source that does not parse
 * contributes nothing here; its own diagnostics come from the compile step.
 */
function collectProjectSymbols(sources: ProgramSource[]): ILProjectSymbols {
    const globals = new Map<string, string>();
    const functionBlocks = new Map<string, Map<string, string>>();
    for (const source of sources) {
        if (source.language !== 'ST') continue;
        let unit;
        try {
            unit = parse(source.content);
        } catch {
            continue;
        }
        for (const block of unit.globalVars) {
            for (const variable of block.variables) {
                if (typeof variable.dataType === 'string') globals.set(variable.name.toUpperCase(), variable.dataType.toUpperCase());
            }
        }
        for (const block of unit.functionBlocks) {
            const members = new Map<string, string>();
            for (const variable of [...block.inputs, ...block.outputs]) {
                if (typeof variable.dataType === 'string') members.set(variable.name.toUpperCase(), variable.dataType.toUpperCase());
            }
            functionBlocks.set(block.name.toUpperCase(), members);
        }
    }
    return { globals, functionBlocks };
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
    if (config.tasks.length > ZPLC_CONSTANTS.MAX_TASKS) {
        throw new CompilerError(
            `Project supports at most ${ZPLC_CONSTANTS.MAX_TASKS} tasks`,
            0, 0, 'codegen',
        );
    }

    assertTaskProgramCardinality(config);

    const sourceMap = new Map<string, ProgramSource>();
    for (const source of programSources) {
        sourceMap.set(source.name, source);
        sourceMap.set(source.name.toLowerCase(), source);
    }

    const findSource = (progName: string): ProgramSource | undefined => {
        const baseName = progName.replace(/\.(st|fbd|ld|sfc|il)$/i, '');
        return sourceMap.get(progName)
            || sourceMap.get(progName.toLowerCase())
            || sourceMap.get(baseName)
            || sourceMap.get(baseName.toLowerCase());
    };

    // Globals and user function blocks that an IL operand may name, read from the project's ST sources
    let symbols: ILProjectSymbols | undefined;
    const projectSymbols = (): ILProjectSymbols => symbols ??= collectProjectSymbols(programSources);

    const communicationTags = config.communication?.bindings || config.communication?.tags || [];
    const coreSources: CoreProgramSource[] = [];
    const compiledPrograms = new Set<string>();
    const visualSourceRefs = new Set<string>();

    for (const task of config.tasks) {
        for (const progName of task.programs) {
            if (compiledPrograms.has(progName)) continue;
            compiledPrograms.add(progName);

            const source = findSource(progName);
            if (!source) {
                throw new CompilerError(`Program '${progName}' referenced by task but not found in sources`, 0, 0, 'codegen');
            }

            const transpiled: TranspileResult = source.language === 'ST'
                ? { success: true, source: source.content, errors: [] }
                : transpileToST(source.content, source.language, source.language === 'IL' ? projectSymbols() : undefined);
            if (!transpiled.success) {
                throw new CompilerError(`Transpilation of '${progName}' failed: ${transpiled.errors.join('; ')}`, transpiled.line ?? 0, 0, 'parser', source.sourceRef);
            }
            if (source.language !== 'ST') visualSourceRefs.add(source.sourceRef ?? progName);

            coreSources.push({
                name: progName,
                content: applyCommunicationTags(transpiled.source, communicationTags),
                sourceRef: source.sourceRef,
            });
        }
    }

    const coreConfig: CoreProjectConfig = {
        name: config.name,
        version: config.version,
        tasks: config.tasks.map((task) => ({
            name: task.name,
            trigger: task.trigger,
            interval: task.interval_ms ?? task.interval,
            priority: task.priority,
            programs: task.programs,
        })),
    };

    try {
        const result = compileCoreMultiTaskProject(coreConfig, coreSources, {
            memoryProfile: getCompilerMemoryProfile(config.target?.board),
        });
        // a graphical source has no lines: its warnings would point into the generated Structured Text
        return { ...result, warnings: result.warnings.filter((warning) => !warning.sourceRef || !visualSourceRefs.has(warning.sourceRef)) };
    } catch (error) {
        if (error instanceof CompilerError) {
            // The position is kept: the graphical models have no lines, so it names the generated Structured Text.
            const relocated = error.errors.map((each) => each.sourceRef && visualSourceRefs.has(each.sourceRef) && each.line > 0
                ? new CompilerError(`${each.detail} (position in the generated Structured Text)`, each.line, each.column, each.phase, each.sourceRef, each.endLine, each.endColumn)
                : each);
            if (relocated.some((each, index) => each !== error.errors[index])) {
                relocated[0]!.errors = relocated;
                throw relocated[0];
            }
        }
        throw error;
    }
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
        sourceRef,
        communicationTags = [],
    } = options;

    const config: ZPLCProjectConfig = {
        name: 'SingleFile',
        version: '1.0.0',
        tasks: [{
            name: taskName,
            trigger: 'cyclic',
            interval_ms: intervalMs,
            priority,
            programs: [programName],
        }],
        communication: {
            tags: communicationTags,
        },
    };

    const programSources: ProgramSource[] = [{
        name: programName,
        content,
        language,
        sourceRef,
    }];

    const multiResult = compileMultiTaskProject(config, programSources);

    return {
        bytecode: multiResult.bytecode,
        zplcFile: multiResult.zplcFile,
        assembly: multiResult.programDetails[0]?.assembly ?? '',
        entryPoint: multiResult.tasks[0]?.entryPoint ?? 0,
        codeSize: multiResult.codeSize,
        debugMap: multiResult.debugMap,
        language,
        warnings: multiResult.warnings,
        tasks: multiResult.tasks,
        hasTaskSegment: true,
    };
}
