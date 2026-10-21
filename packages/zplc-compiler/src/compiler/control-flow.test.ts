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
    return (
        `TYPE St : (IDLE, RUN, DONE := 10); END_TYPE\nPROGRAM P\nVAR\n  i : INT;\n  picked : INT;\nEND_VAR\n  CASE i ` +
        `OF\n${body}\n  END_CASE;\nEND_PROGRAM\n`
    );
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

describe('RETURN (CMP-036 stopgap)', () => {
    const functionSource =
        `FUNCTION Clamp : INT\nVAR_INPUT a : INT; END_VAR\n  Clamp := a;\n  IF a > 10 THEN\n    Clamp := 10;\n ` +
        `   RETURN;\n  END_IF;\nEND_FUNCTION\nPROGRAM P\nVAR\n  x : INT;\nEND_VAR\n  x := Clamp(50);\nEND_PROGRAM\n`;

    it('leaves a function through its epilogue, not by halting the scan', () => {
        const asm = compileST(functionSource);
        const body = asm.slice(asm.indexOf('func_Clamp:'), asm.indexOf('=== Program Entry'));
        expect(body).toContain('RET');
        expect(body).not.toContain('HALT');
    });

    it('leaves an inlined function block body without halting the scan', () => {
        const source =
            `FUNCTION_BLOCK Fb\nVAR_INPUT go : BOOL; END_VAR\nVAR_OUTPUT q : INT; END_VAR\n  IF go THEN\n    q := 1;\n ` +
            `   RETURN;\n  END_IF;\n  q := 2;\nEND_FUNCTION_BLOCK\nPROGRAM P\nVAR\n  f : Fb;\n  x : INT;\nEND_VAR\n  f(go := TRUE);\n  x ` +
            `:= f.q;\nEND_PROGRAM\n`;
        const asm = compileST(source);
        expect(asm.split('\n').filter((line) => line.trim() === 'HALT')).toHaveLength(1);
    });

    it('still ends the scan of a program', () => {
        const asm = compileST('PROGRAM P\nVAR x : INT; END_VAR\n  x := 1;\n  RETURN;\n  x := 2;\nEND_PROGRAM\n');
        expect(asm.split('\n').filter((line) => line.trim() === 'HALT')).toHaveLength(2);
    });
});

describe('debug map (CMP-054 stopgap)', () => {
    it('gives every variable the address the code uses, in a file with TYPE, FUNCTION_BLOCK and VAR_GLOBAL', () => {
        const source = [
            'TYPE Pt : STRUCT x : INT; y : INT; END_STRUCT END_TYPE',
            'VAR_GLOBAL G : INT; END_VAR',
            'FUNCTION_BLOCK Fb',
            'VAR_OUTPUT q : INT; END_VAR',
            '  q := 1;',
            'END_FUNCTION_BLOCK',
            'PROGRAM Mapped',
            'VAR',
            '  p : Pt;',
            '  f : Fb;',
            '  s : INT;',
            'END_VAR',
            '  s := 42;',
            'END_PROGRAM',
            '',
        ].join('\n');
        const result = compileToBinary(source, { generateDebugMap: true });
        const vars = result.debugMap!.pou.Mapped.vars;
        // The memory map comment of the assembly is the layout the code was generated from.
        const layout = new Map<string, number>();
        for (const line of result.assembly.split('\n')) {
            const match = /^; 0x([0-9a-f]{4}): (\S+) \(/i.exec(line);
            if (match) layout.set(match[2], parseInt(match[1], 16));
        }
        expect(layout.get('s')).toBeDefined();
        for (const name of ['G', 'p', 'f', 's']) {
            expect(vars[name]).toBeDefined();
            expect(vars[name].addr).toBe(layout.get(name)!);
        }
    });
});
