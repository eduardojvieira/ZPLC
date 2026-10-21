/**
 * ZPLC compiler diagnostics
 *
 * SPDX-License-Identifier: MIT
 *
 * The position model every phase of the compiler reports in (CMP-006, CMP-007, CMP-009): a start and an
 * end, both 1-based, the end being the position just after the last character. A phase that finds more
 * than one independent error throws its first error with all of them in `errors`, in source order, so a
 * caller that shows one diagnostic keeps working and a caller that shows all of them has them.
 */

import type { ErrorCode } from './error-codes.ts';

/** A region of a source file; `endLine` and `endColumn` are the position just after the last character. */
export interface SourceSpan {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
}

/** One lexical or syntax error: what a thrown LexerError and ParseError both are. */
export interface SyntaxIssue extends SourceSpan {
    /** 'LexerError' or 'ParseError'. */
    name: string;
    /** The stable code of the kind of error (CMP-006). */
    code: ErrorCode;
    /** The message with its position prefix. */
    message: string;
    /** The message without the prefix. */
    detail: string;
}

/**
 * The stable identifiers of the warnings a build can report (CMP-008). They are what the `compiler.warnings`
 * option lists, and what a tool matches on.
 *
 *  - NON_IEC_HEX_LITERAL, NON_IEC_REAL_LITERAL: a spelling the compiler accepts and IEC 61131-3 does not define
 *  - IMPLICIT_NARROWING: a value stored in a narrower type, keeping its low bits (an error under strictTypes)
 *  - UNREACHABLE_STATEMENT: a statement that follows RETURN, EXIT or CONTINUE, or an IF or CASE that always
 *    leaves, in the same list of statements
 *  - UNUSED_VARIABLE: a variable that is never read nor written
 *  - WRITE_ONLY_VARIABLE: a variable that is written and never read
 *  - OPTION_IGNORED: a project option, or a value of one, that has no effect on this compiler
 *  - SOURCE_NOT_COMPILED: a source file of the project folder that is in neither `src` nor a listed library
 *  - WATCHDOG_RESET_NO_EFFECT: a call to WATCHDOG_RESET, which compiles to nothing: the runtime feeds the
 *    hardware watchdog itself after each completed scan (RT-034)
 */
export const WARNING_CODES = [
    'NON_IEC_HEX_LITERAL',
    'NON_IEC_REAL_LITERAL',
    'IMPLICIT_NARROWING',
    'UNREACHABLE_STATEMENT',
    'UNUSED_VARIABLE',
    'WRITE_ONLY_VARIABLE',
    'OPTION_IGNORED',
    'SOURCE_NOT_COMPILED',
    'WATCHDOG_RESET_NO_EFFECT',
] as const;

export type WarningCode = (typeof WARNING_CODES)[number];

/**
 * Which warnings a build reports: `none`; `default`, the ones that point at a defect or a portability problem;
 * `all`, which adds the write-only variables; or the list of codes to report.
 */
export type WarningSelection = 'none' | 'default' | 'all' | readonly WarningCode[];

/** The warnings of the level `default`: everything but the write-only variables. */
const DEFAULT_WARNINGS: ReadonlySet<WarningCode> = new Set(WARNING_CODES.filter((code) => code !== 'WRITE_ONLY_VARIABLE'));

/** `selection` read from a project file or a request, or the sentence that says what is accepted. */
export function parseWarningSelection(value: unknown): { ok: true; selection: WarningSelection } | { ok: false; message: string } {
    if (value === 'none' || value === 'default' || value === 'all') return { ok: true, selection: value };
    const accepted = `'none', 'default' or 'all', or a list of the codes ${WARNING_CODES.join(', ')}`;
    if (Array.isArray(value)) {
        const unknown = value.filter((entry) => !(WARNING_CODES as readonly unknown[]).includes(entry));
        if (unknown.length === 0) return { ok: true, selection: value as WarningCode[] };
        return { ok: false, message: `Unknown warning code ${unknown.map((entry) => `'${String(entry)}'`).join(', ')}: use ${accepted}` };
    }
    return { ok: false, message: `The warnings option must be ${accepted}` };
}

/** The warnings of `warnings` that `selection` reports, in the order they have. */
export function selectWarnings<T extends { code: WarningCode }>(warnings: readonly T[], selection: WarningSelection = 'default'): T[] {
    if (selection === 'none') return [];
    if (selection === 'all') return [...warnings];
    const wanted: ReadonlySet<WarningCode> = selection === 'default' ? DEFAULT_WARNINGS : new Set(selection);
    return warnings.filter((warning) => wanted.has(warning.code));
}

/**
 * Something the code generator or the analysis of a unit accepted and wants the author to see (CMP-008): the
 * build succeeds. `code` is the stable identifier of the kind of warning.
 */
export interface CodegenWarning extends SourceSpan {
    code: WarningCode;
    message: string;
    /** The file of a project the position belongs to; absent for a unit of one file. */
    sourceRef?: string;
}

/** What a compile accepted but the language reference does not define (CMP-031: the `0x` form). */
export interface SourceWarning extends SourceSpan {
    code: 'NON_IEC_HEX_LITERAL' | 'NON_IEC_REAL_LITERAL';
    message: string;
}

/** Order of two positions in a file. */
export function compareSpans(a: SourceSpan, b: SourceSpan): number {
    return a.line - b.line || a.column - b.column;
}

/**
 * The errors of one phase in source order, without the same message reported twice at the same place
 * (an inlined function block body is visited once per call).
 */
export function orderedUniqueErrors<T extends SourceSpan & { message: string; sourceRef?: string }>(errors: readonly T[]): T[] {
    const seen = new Set<string>();
    const unique: T[] = [];
    for (const error of [...errors].sort(compareSpans)) {
        const key = `${error.sourceRef ?? ''}:${error.line}:${error.column}:${error.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(error);
    }
    return unique;
}

/**
 * A construct the generator or the symbol table cannot accept (undeclared name, unknown member, duplicate
 * declaration...). The build fails with this message and position and produces no artifact; the generator
 * never writes a placeholder into the output in place of an error.
 *
 * When one generation finds several independent errors, the first is thrown with all of them in `errors`.
 */
export class CodegenError extends Error {
    /** Every error of the generation, in source order; the thrown error is the first of them. */
    errors: CodegenError[] = [this];
    /** The file of a project the position belongs to; absent for a unit of one file (CMP-042). */
    sourceRef?: string;

    constructor(
        /** The stable code of the kind of error (CMP-006). */
        readonly code: ErrorCode,
        message: string,
        readonly line: number,
        readonly column: number,
        readonly endLine?: number,
        readonly endColumn?: number,
    ) {
        super(message);
        this.name = 'CodegenError';
    }
}

/**
 * `caught` as a positioned CodegenError, or null when it is not an error at all.
 * An error that has no position (line 0, or a line without a column) is placed at `fallback`.
 */
export function codegenErrorFrom(caught: unknown, fallback: SourceSpan): CodegenError | null {
    if (caught instanceof CodegenError) {
        if (caught.line > 0 && caught.column > 0) return caught;
        const [line, column, endLine, endColumn] =
            caught.line > 0 ? [caught.line, 1, caught.line, 2] : [fallback.line, fallback.column, fallback.endLine, fallback.endColumn];
        Object.assign(caught, { line, column, endLine, endColumn });
        return caught;
    }
    if (caught instanceof Error) {
        // an error that was not raised as one of the compiler's own is a condition it did not expect
        return new CodegenError(
            'INTERNAL_COMPILER_ERROR',
            caught.message,
            fallback.line,
            fallback.column,
            fallback.endLine,
            fallback.endColumn,
        );
    }
    return null;
}
