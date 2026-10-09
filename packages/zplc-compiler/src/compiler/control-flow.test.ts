import { describe, it, expect } from 'bun:test';
import { CompilerError, compileST, compileToBinary } from './index.ts';

function failure(source: string): CompilerError {
    try {
        compileToBinary(source);
    } catch (e) {
        expect(e).toBeInstanceOf(CompilerError);
        return e as CompilerError;
    }
    throw new Error('the build succeeded and produced an artifact');
}

/** A program that selects on `i` with the given CASE body; the body starts on line 8. */
function caseProgram(body: string): string {
    return `TYPE St : (IDLE, RUN, DONE := 10); END_TYPE\nPROGRAM P\nVAR\n  i : INT;\n  picked : INT;\nEND_VAR\n  CASE i OF\n${body}\n  END_CASE;\nEND_PROGRAM\n`;
}

describe('CASE labels (CMP-040 stopgap)', () => {
    it('accepts lists, ranges, negative values and enumeration names', () => {
        const body = [
            '    1, 2: picked := 1;',
            '    5..9: picked := 2;',
            '    -3: picked := 3;',
            '    -20..-10: picked := 4;',
            '    IDLE: picked := 5;',
            '    DONE: picked := 6;',
        ].join('\n');
        expect(compileToBinary(caseProgram(body)).bytecode.length).toBeGreaterThan(0);
    });

    it('resolves an enumeration label to its value', () => {
        const asm = compileST(caseProgram('    DONE: picked := 1;'));
        expect(asm).toContain('PUSH8 10');
    });

    it('rejects overlapping labels at the later label and names the value', () => {
        const error = failure(caseProgram('    1, 2: picked := 1;\n    2, 3: picked := 2;'));
        expect(error.line).toBe(9);
        expect(error.detail).toContain('2');
        expect(error.detail).toContain('overlap');
    });

    it('rejects a range that overlaps an earlier value or range', () => {
        expect(failure(caseProgram('    5: picked := 1;\n    1..9: picked := 2;')).line).toBe(9);
        expect(failure(caseProgram('    1..5: picked := 1;\n    5..9: picked := 2;')).line).toBe(9);
    });

    it('rejects a range whose start is above its end', () => {
        const error = failure(caseProgram('    9..5: picked := 1;'));
        expect(error.line).toBe(8);
    });

    it('rejects a label that is not an enumeration value or a literal, and names it', () => {
        const error = failure(caseProgram('    picked: picked := 1;'));
        expect(error.line).toBe(8);
        expect(error.detail).toContain('picked');
    });
});
