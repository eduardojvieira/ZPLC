/**
 * Checking a project without building it (LNG-015)
 *
 * SPDX-License-Identifier: MIT
 *
 * A tool that shows errors while the author types (the language service of the editor, a command line `check`, a
 * server) needs every syntax error and every semantic error of every file, with a range, and needs them to be the
 * ones the build reports. This runs the build's own front end over the sources: each file is read with the
 * recovering parser, the files are merged into one unit, and the unit is generated; the errors are collected, and
 * nothing is assembled or written.
 *
 * Differences from a build, all of them for an author who is in the middle of an edit:
 *  - every program of every file is generated, not only the ones a task runs, because the file being typed is
 *    the one whose errors matter, task or not;
 *  - a file with a syntax error contributes the declarations the parser recovered, so a file that uses them is not
 *    given an error about a name that is only missing because its file is half typed; the semantic errors of the
 *    file with the syntax error are left out, its syntax errors are what it shows;
 *  - nothing that needs the assembled code is checked: the size of the code, the depth of the stack.
 */

import { parseWithDiagnostics } from './parser.ts';
import { mergeUnits } from './unit.ts';
import type { UnitSource } from './unit.ts';
import { CodegenError, DEFAULT_COMPILER_MEMORY_PROFILE, generateProject } from './codegen.ts';
import type { CompilerMemoryProfile } from './codegen.ts';
import { orderedUniqueErrors, selectWarnings } from './diagnostics.ts';
import type { CodegenWarning, WarningCode, WarningSelection } from './diagnostics.ts';
import type { ErrorCode } from './error-codes.ts';
import { analyzeUnit } from './warnings.ts';
import type { Program } from './ast.ts';

/** One source file of the project. `ref` is what its diagnostics are placed by: its project-relative path. */
export interface CheckSource {
    ref: string;
    content: string;
}

export interface CheckDiagnostic {
    /** The file the diagnostic is in. */
    ref: string;
    severity: 'error' | 'warning';
    /** Which phase found it; a warning is `codegen`. */
    phase: 'lexer' | 'parser' | 'codegen';
    /** The stable identifier of the kind of error (`ERROR_CODES`) or of the warning (`WARNING_CODES`), the one a build reports. */
    code: ErrorCode | WarningCode;
    /** The message, without a position prefix. */
    message: string;
    /** The range, 1-based; the end is the position just after the last character, when the phase knows it. */
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
}

export interface CheckOptions {
    /** The project's `compiler.strictTypes`. */
    strictTypes?: boolean;
    /** The target's memory profile; the default is the largest the contract allows. */
    memoryProfile?: CompilerMemoryProfile;
    /** Which warnings to report, as the build reports them; default `default`. */
    reportWarnings?: WarningSelection;
}

const bySource = (order: ReadonlyMap<string, number>) => (first: CheckDiagnostic, second: CheckDiagnostic): number =>
    (order.get(first.ref) ?? 0) - (order.get(second.ref) ?? 0) || first.line - second.line || first.column - second.column;

/**
 * Every diagnostic of the project, in the order of the files and of the lines. Never throws for a fault of the
 * sources: an exception that is not a diagnostic of the sources is reported as an error at the start of the
 * first file it could be about.
 */
export function checkProject(sources: readonly CheckSource[], options: CheckOptions = {}): CheckDiagnostic[] {
    const found: CheckDiagnostic[] = [];
    const warnings: Array<CodegenWarning & { sourceRef: string }> = [];
    const order = new Map(sources.map((source, index) => [source.ref, index] as const));
    const withSyntaxErrors = new Set<string>();
    const parsed: UnitSource[] = [];
    const further: Array<{ ref: string; program: Program }> = [];

    for (const source of sources) {
        const outcome = parseWithDiagnostics(source.content);
        for (const issue of outcome.errors) {
            withSyntaxErrors.add(source.ref);
            found.push({
                ref: source.ref, severity: 'error', phase: issue.name === 'LexerError' ? 'lexer' : 'parser', code: issue.code, message: issue.detail,
                line: issue.line, column: issue.column,
                ...(issue.endLine === undefined ? {} : { endLine: issue.endLine, endColumn: issue.endColumn }),
            });
        }
        for (const warning of outcome.warnings) warnings.push({ ...warning, sourceRef: source.ref });
        const [first, ...rest] = outcome.unit.programs;
        parsed.push({ ref: source.ref, unit: outcome.unit, ...(first ? { program: first } : {}) });
        for (const program of rest) further.push({ ref: source.ref, program });
    }

    // a program name is the identity of the program in the unit: it is declared once
    const declaredIn = new Map<string, string>();
    const duplicates: CheckDiagnostic[] = [];
    for (const { ref, unit, program } of parsed) {
        for (const each of [...(program ? [program] : []), ...unit.programs.slice(1)]) {
            const key = each.name.toLowerCase();
            const earlier = declaredIn.get(key);
            if (earlier === undefined) declaredIn.set(key, ref);
            else {
                duplicates.push({
                    ref, severity: 'error', phase: 'codegen', code: 'DUPLICATE_DECLARATION',
                    message: `Duplicate PROGRAM name '${each.name}' (already declared by '${earlier}')`,
                    line: each.line, column: each.column,
                    ...(each.endLine === undefined ? {} : { endLine: each.endLine, endColumn: each.endColumn }),
                });
            }
        }
    }
    found.push(...duplicates);

    const merged = mergeUnits(parsed);
    for (const error of merged.errors) {
        found.push({
            ref: error.sourceRef ?? sources[0]?.ref ?? '', severity: 'error', phase: 'codegen', code: error.code, message: error.message,
            line: error.line, column: error.column,
            ...(error.endLine === undefined ? {} : { endLine: error.endLine, endColumn: error.endColumn }),
        });
    }

    // what the build does not do: every program of every file is generated, so every file's statements are checked
    for (const { ref, program } of further) {
        program.sourceRef = ref;
        for (const block of program.varBlocks) for (const variable of block.variables) variable.sourceRef = ref;
        merged.unit.programs.push(program);
    }

    if (merged.errors.length === 0 && duplicates.length === 0 && merged.unit.programs.length + merged.unit.functions.length + merged.unit.functionBlocks.length > 0) {
        const generated: CodegenWarning[] = [];
        try {
            generateProject(merged.unit, {
                memoryProfile: options.memoryProfile ?? DEFAULT_COMPILER_MEMORY_PROFILE,
                emitSourceAnnotations: false,
                strictTypes: options.strictTypes ?? false,
                warnings: generated,
            });
        } catch (caught) {
            if (caught instanceof CodegenError) {
                const fallback = sources[0]?.ref ?? '';
                for (const error of orderedUniqueErrors(caught.errors)) {
                    found.push({
                        ref: error.sourceRef ?? fallback, severity: 'error', phase: 'codegen', code: error.code, message: error.message,
                        line: error.line, column: error.column,
                        ...(error.endLine === undefined ? {} : { endLine: error.endLine, endColumn: error.endColumn }),
                    });
                }
            } else if (withSyntaxErrors.size === 0) {
                // a fault of the compiler, not of the sources: say so where the author can see it
                const message = caught instanceof Error ? caught.message : String(caught);
                found.push({ ref: sources[0]?.ref ?? '', severity: 'error', phase: 'codegen', code: 'INTERNAL_COMPILER_ERROR', message: `The compiler could not check the project: ${message}`, line: 1, column: 1 });
            }
        }
        if (!found.some((diagnostic) => diagnostic.severity === 'error')) {
            for (const warning of [...generated, ...analyzeUnit(merged.unit)]) warnings.push({ ...warning, sourceRef: warning.sourceRef ?? sources[0]?.ref ?? '' });
        }
    }

    // a file that does not parse shows its syntax errors: what the generator makes of a half-read tree is no help
    const errors = found.filter((diagnostic) => diagnostic.severity === 'error'
        && (!withSyntaxErrors.has(diagnostic.ref) || diagnostic.phase !== 'codegen'));
    const hasErrors = errors.length > 0;
    const reported = hasErrors ? [] : selectWarnings(warnings, options.reportWarnings);
    const shown: CheckDiagnostic[] = [
        ...errors,
        ...reported.map((warning): CheckDiagnostic => ({
            ref: warning.sourceRef, severity: 'warning', phase: 'codegen', code: warning.code, message: warning.message,
            line: warning.line, column: warning.column,
            ...(warning.endLine === undefined ? {} : { endLine: warning.endLine, endColumn: warning.endColumn }),
        })),
    ];
    const seen = new Set<string>();
    return shown.sort(bySource(order)).filter((diagnostic) => {
        const key = `${diagnostic.ref}:${diagnostic.line}:${diagnostic.column}:${diagnostic.severity}:${diagnostic.message}`;
        return seen.has(key) ? false : (seen.add(key), true);
    });
}
