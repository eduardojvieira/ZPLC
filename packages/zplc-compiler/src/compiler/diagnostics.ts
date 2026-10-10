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
    /** The message with its position prefix. */
    message: string;
    /** The message without the prefix. */
    detail: string;
}

/**
 * Something the code generator accepted and wants the author to see (CMP-008): the build succeeds. `code`
 * is the stable identifier of the kind of warning.
 */
export interface CodegenWarning extends SourceSpan {
    code: 'IMPLICIT_NARROWING';
    message: string;
}

/** What a compile accepted but the language reference does not define (CMP-031: the `0x` form). */
export interface SourceWarning extends SourceSpan {
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
export function orderedUniqueErrors<T extends SourceSpan & { message: string }>(errors: readonly T[]): T[] {
    const seen = new Set<string>();
    const unique: T[] = [];
    for (const error of [...errors].sort(compareSpans)) {
        const key = `${error.line}:${error.column}:${error.message}`;
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

    constructor(
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
export function codegenErrorFrom(
    caught: unknown,
    fallback: SourceSpan,
): CodegenError | null {
    if (caught instanceof CodegenError) {
        if (caught.line > 0 && caught.column > 0) return caught;
        const [line, column, endLine, endColumn] = caught.line > 0
            ? [caught.line, 1, caught.line, 2]
            : [fallback.line, fallback.column, fallback.endLine, fallback.endColumn];
        Object.assign(caught, { line, column, endLine, endColumn });
        return caught;
    }
    if (caught instanceof Error) {
        return new CodegenError(caught.message, fallback.line, fallback.column, fallback.endLine, fallback.endColumn);
    }
    return null;
}
