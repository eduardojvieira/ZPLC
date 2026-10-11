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
    debugMapMatchesArtifact,
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
import { collectProjectBlocks, type ProjectBlock } from '../models/projectBlocks.ts';
import { parseSFCModel } from '../models/sfc.ts';
import { parseIL, ILParseError } from './il/parser.ts';
import { ILLexerError } from './il/lexer.ts';
import type { ILProjectSymbols } from './il/ilToST.ts';
import type {
    ZPLCProjectConfig,
    CommunicationTagConfig,
    ModbusAddressSpace,
} from '../types/index.ts';
import { getCompilerMemoryProfile } from '../config/boardProfiles.ts';
import { checkLocatedVariables, locatedVariablesOf } from '../boards/ioAdmission.ts';
import { checkedSafeOutputs, type DeclaredSafeOutput, type DeclaredSafeOutputs } from '../boards/safeOutputs.ts';
import { normalizeAddress } from '../boards/boardIoMapping.ts';
import { annotateDebugMapElements } from './debugElements.ts';
import {
    ElementError,
    describeElement,
    elementAtLine,
    ilLineElement,
    parseElement,
    type ElementDiagnostic,
    type MonitorEntry,
    type SourceMapRange,
} from '../models/sourceElements.ts';
import { buildOptionsOf } from '../project/buildOptions.ts';
import type { BuildOptions } from '../project/buildOptions.ts';
import { selectWarnings } from '@zplc/compiler';

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
    /** Each error with the element of the source it is about: a rung and cell, a block, a step, a transition, an action, an IL line (LNG-003). */
    diagnostics?: ElementDiagnostic[];
    /** For each element, the lines of the generated Structured Text that were written for it (LNG-004). */
    sourceMap?: SourceMapRange[];
    /** Where the state of each element is read online, in terms of the variables of the generated program (LNG-006). */
    monitor?: MonitorEntry[];
}

function failure(error: unknown, line?: number): TranspileResult {
    const message = error instanceof Error ? error.message : String(error);
    const element = error instanceof ElementError ? error.element : line === undefined ? undefined : ilLineElement(line);
    return {
        success: false, source: '', errors: [message], ...(line === undefined ? {} : { line }),
        diagnostics: [{ message, ...(element === undefined ? {} : { element }), ...(line === undefined ? {} : { line }) }],
    };
}

/**
 * The compiler error of a source that did not translate: one error for each thing the transpiler found, each with the
 * element it is about, the first of them thrown with all of them in `errors` (CMP-007, LNG-003).
 */
export function transpileFailure(transpiled: TranspileResult, sourceRef?: string): CompilerError {
    const found: ElementDiagnostic[] = transpiled.diagnostics?.length
        ? transpiled.diagnostics
        : transpiled.errors.map((message) => ({ message, ...(transpiled.line === undefined ? {} : { line: transpiled.line }) }));
    const errors = found.map((each) => {
        const error = new CompilerError(each.message, each.line ?? 0, 0, 'parser', sourceRef);
        if (each.element !== undefined) error.element = each.element;
        return error;
    });
    if (errors.length === 0) errors.push(new CompilerError('The source could not be translated', 0, 0, 'parser', sourceRef));
    errors[0]!.errors = errors;
    return errors[0]!;
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
    /** The library folder of the project the file belongs to (`libraries` of zplc.json, CMP-046). */
    library?: string;
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
    /** The safe values of the outputs (RT-023): as the artifact holds them, and as a deploy confirmation shows them. */
    safe: DeclaredSafeOutputs['entries']; declaredSafe: DeclaredSafeOutput[];
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
export function transpileToST(content: string, language: PLCLanguage, symbols?: ILProjectSymbols, blocks?: readonly ProjectBlock[]): TranspileResult {
    switch (language) {
        case 'LD': {
            try {
                return transpileLDToST(JSON.parse(content), blocks);
            } catch (error) {
                return failure(error);
            }
        }
        case 'FBD': {
            try {
                return transpileFBDToST(parseFBDModel(content, blocks), blocks);
            } catch (error) {
                return failure(error);
            }
        }
        case 'SFC': {
            try {
                return transpileSFCToST(parseSFCModel(content));
            } catch (error) {
                return failure(error);
            }
        }
        case 'ST':
            return { success: true, source: content, errors: [] };
        case 'IL': {
            try {
                const ilProgram = parseIL(content);
                return transpileILToST(ilProgram, { symbols });
            } catch (error) {
                return failure(error, error instanceof ILParseError || error instanceof ILLexerError ? error.line : undefined);
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

        if (!transpileResult.success) throw transpileFailure(transpileResult);

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
 * What to do with a debug map that is about to be attached to a program (CMP-056): `refuse` when it belongs to
 * another build, `warn` when it or the program carries no identity so the pair cannot be told, nothing when it
 * is the map of this program. The sentence is for the console.
 */
export function judgeDebugMapAttachment(map: DebugMap, program: Uint8Array): { action: 'attach' | 'warn' | 'refuse'; message?: string } {
    const verdict = debugMapMatchesArtifact(map, program);
    if (verdict.ok) return { action: 'attach' };
    return { action: verdict.reason === 'different-build' ? 'refuse' : 'warn', message: verdict.message };
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
        annotations.push(`{modbus:${modbusTagNumber(tag.modbusArea, tag.modbusAddress ?? 1, `communication tag '${tag.symbol}'`, 0)}}`);
    }

    return annotations;
}

const MODBUS_AREA_BASE = { 'discrete-input': 10001, 'input-register': 30001, 'holding-register': 40001 } as const;

/** The area the Modbus notation reads a number as, for the three areas that have a prefix. */
function modbusAreaOfNumber(number: number): ModbusAddressSpace | undefined {
    if (number >= 40001 && number <= 49999) return 'holding-register';
    if (number >= 30001 && number <= 39999) return 'input-register';
    if (number >= 10001 && number <= 19999) return 'discrete-input';
    return undefined;
}

/**
 * The number of the `{modbus:N}` tag that serves a variable at `address` of `area` (COM-011). The four areas of a
 * Modbus server are four address spaces, and the tag says which with the notation of the Modbus world: 10001 to
 * 19999 are discrete inputs, 30001 to 39999 input registers, 40001 to 49999 holding registers, and any other
 * number is a coil (a BOOL) or a holding register at that address. An address that is already written in that
 * notation, in the area that was chosen, is kept; no area keeps the number as the author wrote it.
 */
export function modbusTagNumber(area: ModbusAddressSpace | undefined, address: number, what: string, line: number): number {
    if (area === undefined) return address;
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
        throw new CompilerError(`The Modbus address ${String(address)} of ${what} is not between 0 and 65535`, line, 0, 'codegen');
    }
    const written = modbusAreaOfNumber(address);
    if (written !== undefined) {
        if (written === area) return address;
        throw new CompilerError(
            `The Modbus address ${String(address)} of ${what} is a ${written.replace('-', ' ')} in Modbus notation, and ${what} is placed in a ${area.replace('-', ' ')}`,
            line, 0, 'codegen');
    }
    if (area === 'coil') return address;
    if (address <= 9998) return MODBUS_AREA_BASE[area] + address;
    if (area === 'holding-register') return address;
    throw new CompilerError(
        `The ${area.replace('-', ' ')} address ${String(address)} of ${what} does not fit: an ${area.replace('-', ' ')} is addressed from 0 to 9998`,
        line, 0, 'codegen');
}

const MODBUS_HELPER_AREA: Record<string, ModbusAddressSpace> = {
    COIL: 'coil',
    DISCRETE_INPUT: 'discrete-input',
    INPUT_REGISTER: 'input-register',
    HOLDING_REGISTER: 'holding-register',
};

const MODBUS_HELPER_REGEX = /^\s*MODBUS_(COIL|DISCRETE_INPUT|INPUT_REGISTER|HOLDING_REGISTER)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(\d+)\s*\)\s*;\s*$/i;

function applyModbusBindingHelpers(stSource: string): string {
    const lines = stSource.split('\n');
    const bindings = new Map<string, number>();
    const keptLines: string[] = [];

    for (const [index, line] of lines.entries()) {
        const match = line.match(MODBUS_HELPER_REGEX);
        if (!match) {
            keptLines.push(line);
            continue;
        }

        const area = MODBUS_HELPER_AREA[match[1].toUpperCase()];
        bindings.set(match[2], modbusTagNumber(area, parseInt(match[3], 10), `'${match[2]}'`, index + 1));
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
 * An error the compiler found in the Structured Text generated from a visual or IL source, put where the author can
 * find it (LNG-003, LNG-026). An IL line is the line of the IL source. A diagram has no lines: the position stays that
 * of the generated Structured Text, and the message says what it refers to and which element of the diagram the
 * statement was generated for (a rung and cell, a block, a step, the condition of a transition, the body of an action).
 */
function relocateToSource(
    each: CompilerError,
    translated: ReadonlyMap<string, { language: PLCLanguage; map: readonly SourceMapRange[] }>,
    visualSourceRefs: ReadonlySet<string>,
): CompilerError {
    if (!each.sourceRef || !visualSourceRefs.has(each.sourceRef) || each.line <= 0) return each;
    const origin = translated.get(each.sourceRef);
    const element = origin ? elementAtLine(origin.map, each.line) : undefined;
    const parsed = element ? parseElement(element) : undefined;
    if (origin?.language === 'IL' && element && parsed?.kind === 'line') {
        const error = new CompilerError(each.detail, Number(parsed.id), 1, each.phase, each.sourceRef);
        error.element = element;
        return error;
    }
    const named = element === undefined || origin?.language === 'IL' ? '' : `${describeElement(element)}: `;
    const error = new CompilerError(`${named}${each.detail} (position in the generated Structured Text)`, each.line, each.column, each.phase, each.sourceRef, each.endLine, each.endColumn);
    if (element !== undefined && origin?.language !== 'IL') error.element = element;
    return error;
}

/**
 * What the options of the project file say that the build cannot do: `compiler.optimization` has one code
 * generator behind it, so 'size' and 'speed' produce the code 'none' does (CMP-059). The warning is placed at
 * the project file.
 */
function optionWarnings(options: BuildOptions): CompilerWarning[] {
    if (options.optimization === 'none') return [];
    return [{
        code: 'OPTION_IGNORED',
        message: `compiler.optimization '${options.optimization}' changes nothing: the compiler has one code generator and builds the same code at every level; use 'none'`,
        line: 0,
        column: 0,
        sourceRef: 'zplc.json',
    }];
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
    // The function blocks and functions the project declares: a diagram places them like the standard ones (LNG-008)
    let blocks: ProjectBlock[] | undefined;
    const projectBlocks = (): ProjectBlock[] => blocks ??= collectProjectBlocks(programSources);

    const communicationTags = config.communication?.bindings || config.communication?.tags || [];
    const coreSources: CoreProgramSource[] = [];
    const compiledPrograms = new Set<string>();
    const visualSourceRefs = new Set<string>();
    // what each visual or IL source was translated from: the language, and the element of every generated line
    const translated = new Map<string, { language: PLCLanguage; map: readonly SourceMapRange[]; monitor?: readonly MonitorEntry[] }>();
    const programFiles = new Set<ProgramSource>();

    for (const task of config.tasks) {
        for (const progName of task.programs) {
            if (compiledPrograms.has(progName)) continue;
            compiledPrograms.add(progName);

            const source = findSource(progName);
            if (!source) {
                throw new CompilerError(`Program '${progName}' referenced by task but not found in sources`, 0, 0, 'codegen');
            }
            programFiles.add(source);

            const transpiled: TranspileResult = source.language === 'ST'
                ? { success: true, source: source.content, errors: [] }
                : transpileToST(source.content, source.language, source.language === 'IL' ? projectSymbols() : undefined,
                    source.language === 'FBD' || source.language === 'LD' ? projectBlocks() : undefined);
            if (!transpiled.success) throw transpileFailure(transpiled, source.sourceRef);
            if (source.language !== 'ST') {
                visualSourceRefs.add(source.sourceRef ?? progName);
                if (transpiled.sourceMap) translated.set(source.sourceRef ?? progName, { language: source.language, map: transpiled.sourceMap, ...(transpiled.monitor ? { monitor: transpiled.monitor } : {}) });
            }

            coreSources.push({
                name: progName,
                content: applyCommunicationTags(transpiled.source, communicationTags),
                sourceRef: source.sourceRef,
            });
        }
    }

    // The files of the project that no task runs are part of the unit: a type, a function, a function block or a
    // global declared in one of them is seen by every program (CMP-042). Only Structured Text declares them.
    for (const source of programSources) {
        if (programFiles.has(source) || source.language !== 'ST') continue;
        coreSources.push({ name: source.sourceRef ?? source.name, content: source.content, sourceRef: source.sourceRef });
    }

    const safeDeclared = checkedSafeOutputs(config.io, config.target?.board); // a build error when the board lacks one
    const options = buildOptionsOf(config);
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
            strictTypes: options.strictTypes,
            debug: options.debug,
            reportWarnings: options.reportWarnings,
            safeOutputs: safeDeclared.entries,
        });
        // IO-003: a variable located where the board has no channel is a build error that names the board
        const unmapped = checkLocatedVariables(
            config.target?.board, locatedVariablesOf(result.debugMap),
            new Set((config.io?.virtual ?? []).map((row) => normalizeAddress(row.address)).filter((address): address is string => address !== undefined)),
        );
        if (unmapped.length > 0) {
            const errors = unmapped.map((message) => new CompilerError(message, 0, 0, 'codegen'));
            errors[0]!.errors = errors;
            throw errors[0];
        }
        // the map names what the author edited, not the generated lines (LNG-004)
        annotateDebugMapElements(result.debugMap, translated);
        // a graphical source has no lines: its warnings would point into the generated Structured Text
        const found = result.warnings.filter((warning) => !warning.sourceRef || !visualSourceRefs.has(warning.sourceRef));
        return { ...result, warnings: selectWarnings([...optionWarnings(options), ...found], options.reportWarnings), declaredSafe: safeDeclared.declared };
    } catch (error) {
        if (error instanceof CompilerError) {
            const relocated = error.errors.map((each) => relocateToSource(each, translated, visualSourceRefs));
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
