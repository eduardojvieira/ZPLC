/**
 * Every error of a build has a stable code (CMP-006), and each code is provoked by a case (CMP-043)
 *
 * SPDX-License-Identifier: MIT
 *
 * The cases are the examples of `error-examples.ts`: a program, and the code, the position and the message that the first
 * error of its build must have. A code that no source can provoke is covered by a test below. The registry is the list of
 * `error-codes.ts`; a code that is added to it needs a case in one of the two places.
 */

import { describe, expect, it } from 'bun:test';

import { assemble } from '../assembler/index.ts';
import { CodegenError, WARNING_CODES, codegenErrorFrom } from './diagnostics.ts';
import { ERROR_CODES, ERROR_CODE_TABLE, isErrorCode, type ErrorCode } from './error-codes.ts';
import { ERROR_EXAMPLES, type ErrorExample } from './error-examples.ts';
import { LexerError } from './lexer.ts';
import { ParseError, parse } from './parser.ts';
import { CompilerError, assemblerError, compileMultiTaskProject, compileToBinary } from './index.ts';

const RUN_MAIN = [{ name: 'Main', trigger: 'cyclic' as const, interval: 10, priority: 1, programs: ['Main'] }];

/** The error a build of the example reports; the build must fail. */
function failureOf(example: ErrorExample): CompilerError {
    const files = example.files ?? { Main: example.source ?? '' };
    const sources = Object.entries(files).map(([name, content]) => ({ name, content, sourceRef: `src/${name}.st` }));
    try {
        compileMultiTaskProject(
            { name: 'Example', version: '1.0.0', tasks: example.tasks ? [...example.tasks] : RUN_MAIN },
            sources,
            {
                ...(example.memoryProfile ? { memoryProfile: example.memoryProfile } : {}),
                ...(example.strictTypes ? { strictTypes: true } : {}),
                ...(example.safeOutputs ? { safeOutputs: example.safeOutputs } : {}),
            },
        );
    } catch (error) {
        if (error instanceof CompilerError) return error;
        throw error;
    }
    throw new Error('the build of the example was accepted');
}

/** The codes whose error no source of a program can provoke, and the test of this file that provokes each one. */
const PROVOKED_BELOW: Partial<Record<ErrorCode, string>> = {
    INTERNAL_COMPILER_ERROR: 'an error that is not one of the compiler’s own is an internal error',
    ASSEMBLER_ERROR: 'an assembler error is a compiler error at the program that was built',
    // the translators of the visual languages are in the IDE package: src/compiler/languageWorkflow.test.ts and
    // src/cli/visualDiagnostics.test.ts there
    TRANSLATION_FAILED: 'provoked by the translators, in the IDE package',
    // the admission of a located variable against the channels of a board is in the IDE package, with the board
    // manifest: src/compiler/languageWorkflow.test.ts there
    NO_BOARD_CHANNEL: 'provoked by the admission of located variables, in the IDE package',
};

describe('the registry of error codes (CMP-006)', () => {
    it('names every code in capitals and underscores, once, with a sentence in each language and the phases that report it', () => {
        expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
        for (const code of ERROR_CODES) {
            const info = ERROR_CODE_TABLE[code] as { phases: readonly string[]; summary: { en: string; es: string } };
            expect(code, code).toMatch(/^[A-Z][A-Z0-9_]{2,39}$/);
            expect(info.phases.length, code).toBeGreaterThan(0);
            expect(info.summary.en.length, code).toBeGreaterThan(20);
            expect(info.summary.es.length, code).toBeGreaterThan(20);
            expect(isErrorCode(code)).toBe(true);
        }
        expect(isErrorCode('COMPILATION_FAILED')).toBe(false);
        expect(isErrorCode(undefined)).toBe(false);
    });

    it('does not reuse a name of the warnings', () => {
        for (const warning of WARNING_CODES) expect(isErrorCode(warning), warning).toBe(false);
    });

    it('has a case for every code: a build that provokes it, or a test below', () => {
        const missing = ERROR_CODES.filter((code) => ERROR_EXAMPLES[code] === undefined && PROVOKED_BELOW[code] === undefined);
        expect(missing).toEqual([]);
        const stale = Object.keys(ERROR_EXAMPLES).filter((code) => !isErrorCode(code));
        expect(stale).toEqual([]);
    });
});

describe('each code is provoked by a build, with its position and its message (CMP-006)', () => {
    for (const code of ERROR_CODES) {
        const example = ERROR_EXAMPLES[code];
        if (example === undefined) continue;
        it(`${code} at ${example.line}:${example.column}`, () => {
            const error = failureOf(example);
            const first = error.errors[0]!;
            expect({
                code: first.code, line: first.line, column: first.column, file: first.sourceRef, message: first.detail,
            }).toEqual({
                code, line: example.line, column: example.column, file: example.file, message: example.message,
            });
            // a build reports no error at line 0 and no error without a code of the registry
            for (const each of error.errors) {
                expect(isErrorCode(each.code)).toBe(true);
                expect(each.line).toBeGreaterThanOrEqual(1);
                expect(each.column).toBeGreaterThanOrEqual(1);
            }
        });
    }
});

describe('the over-size failures state what is required, what is available and what takes the most (CMP-043)', () => {
    for (const code of ['WORK_MEMORY_EXCEEDED', 'RETAIN_MEMORY_EXCEEDED', 'CODE_MEMORY_EXCEEDED'] as const) {
        it(`${code}: bytes required, bytes available, the largest consumers, and a place in the source`, () => {
            const first = failureOf(ERROR_EXAMPLES[code]!).errors[0]!;
            expect(first.detail).toMatch(/: \d+ bytes required, \d+ bytes available \(/);
            expect(first.detail).toMatch(/Largest consumers: .+ \(\d+ bytes\)/);
            expect(first.line).toBeGreaterThanOrEqual(1);
            expect(first.sourceRef).toBe('src/Main.st');
        });
    }

    it('the code of a program is reported at the declaration of the part that takes the most, with the sizes that add up', () => {
        const example = ERROR_EXAMPLES.CODE_MEMORY_EXCEEDED!;
        const first = failureOf(example).errors[0]!;
        const sizes = [...first.detail.matchAll(/\((\d+) bytes\)/g)].map((match) => Number(match[1]));
        const required = Number(/: (\d+) bytes required/.exec(first.detail)![1]);
        // the bootstrap jump that precedes the first part is three bytes
        expect(sizes.reduce((total, size) => total + size, 0) + 3).toBe(required);
        // the example is a function of 25 bytes and a program of 53: the program is at line 7
        expect(first.detail).toContain('Largest consumers: Program Main (');
        expect(first.line).toBe(7);
    });

    it('a program of one file is refused for the same reason, with the same words', () => {
        const example = ERROR_EXAMPLES.CODE_MEMORY_EXCEEDED!;
        let message = '';
        try {
            compileToBinary(example.source!, { memoryProfile: example.memoryProfile! });
        } catch (error) {
            message = (error as CompilerError).detail;
        }
        expect(message).toContain('CODE exceeds the target memory profile:');
        expect(message).toContain('bytes required');
        expect(message).toContain('Largest consumers: Program Main (');
    });
});

describe('errors that no source provokes (CMP-006)', () => {
    it('an error that is not one of the compiler’s own is an internal error, placed where the unit starts', () => {
        const error = codegenErrorFrom(new Error('boom'), { line: 3, column: 5 });
        expect(error).toBeInstanceOf(CodegenError);
        expect({ code: error!.code, line: error!.line, column: error!.column, message: error!.message })
            .toEqual({ code: 'INTERNAL_COMPILER_ERROR', line: 3, column: 5, message: 'boom' });
    });

    it('an assembler error is a compiler error at the program that was built', () => {
        let message = '';
        try {
            assemble('PUSH16 70000');
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).toContain('70000');
        const error = assemblerError(message, { line: 4, column: 1, sourceRef: 'src/Main.st' });
        expect({ code: error.code, line: error.line, column: error.column, phase: error.phase, sourceRef: error.sourceRef })
            .toEqual({ code: 'ASSEMBLER_ERROR', line: 4, column: 1, phase: 'assembler', sourceRef: 'src/Main.st' });
    });

    it('the error of a source read alone carries the code too: the lexer and the parser', () => {
        const lexical = (() => { try { parse('PROGRAM P\nX := 1 @ 2;\nEND_PROGRAM'); } catch (error) { return error; } return null; })();
        expect(lexical).toBeInstanceOf(LexerError);
        expect((lexical as LexerError).code).toBe('UNEXPECTED_CHARACTER');
        const syntax = (() => { try { parse('PROGRAM P\nX := ;\nEND_PROGRAM'); } catch (error) { return error; } return null; })();
        expect(syntax).toBeInstanceOf(ParseError);
        expect((syntax as ParseError).code).toBe('UNEXPECTED_TOKEN');
        expect((syntax as ParseError).errors[0]!.code).toBe('UNEXPECTED_TOKEN');
    });

    it('every error of a build that has several carries its own code', () => {
        const error = failureOf({
            source: 'PROGRAM Main\nVAR\n  X : INT;\nEND_VAR\n  X := Missing;\n  X := Other;\n  B := TRUE;\nEND_PROGRAM\n',
            line: 5, column: 8, file: 'src/Main.st', message: '',
        });
        expect(error.errors.map((each) => [each.code, each.line])).toEqual([
            ['UNKNOWN_IDENTIFIER', 5], ['UNKNOWN_IDENTIFIER', 6], ['UNKNOWN_IDENTIFIER', 7],
        ]);
    });
});
