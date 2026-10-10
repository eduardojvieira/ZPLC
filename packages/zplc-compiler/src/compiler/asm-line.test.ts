/**
 * The code generator cannot emit a mnemonic that is not in the opcode table (CMP-048)
 *
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Opcode } from '../contract.generated.ts';
import { AsmEmissionError, asmLineProblem, emitLine, emitLines } from './asm-line.ts';
import type { AsmLine, Mnemonic } from './asm-line.ts';
import { compileToBinary } from './index.ts';

describe('AsmLine, the type of what the generator writes', () => {
    test('a mnemonic that is not in the table does not type-check', () => {
        const known: AsmLine = '    LOAD8 0x2000';
        // @ts-expect-error FOO is not an instruction of the generated table
        const unknown: AsmLine = '    FOO 1';
        // @ts-expect-error a mnemonic that is only a string cannot be proved to be in the table
        const dynamic = (mnemonic: string): AsmLine => `    ${mnemonic} 1`;
        // the same line is written when the mnemonic is typed
        const typed = (mnemonic: Mnemonic): AsmLine => `    ${mnemonic} 1`;
        expect(typed('PUSH8')).toBe('    PUSH8 1');
        expect([known, unknown].length + [dynamic].length).toBe(3);
    });
});

describe('what is written is checked when it is written', () => {
    test('every instruction of the table is accepted, with and without operand and comment', () => {
        for (const name of Object.keys(Opcode)) {
            expect(asmLineProblem(`    ${name}`)).toBeUndefined();
            expect(asmLineProblem(`    ${name} 1    ; a note`)).toBeUndefined();
            expect(asmLineProblem(`lbl_1:    ${name}`)).toBeUndefined();
        }
    });

    test('blank lines, comments, labels and the .TAG directive are accepted', () => {
        for (const line of ['', '; === header ===', '    ; a note', 'loop_1:', 'loop_1:             ; [elapsed]', '.TAG 0x2000 4 1 0  ; x {publish}']) {
            expect(asmLineProblem(line)).toBeUndefined();
        }
    });

    test('an instruction that is not in the table is an internal error that names it', () => {
        const output: AsmLine[] = [];
        // the type system refuses the literal; a string that was built at run time reaches the check
        const built = ['    ', 'ADDX', ' 1'].join('') as AsmLine;
        expect(() => emitLine(output, built)).toThrow(AsmEmissionError);
        expect(() => emitLine(output, built)).toThrow(/ADDX.*not in the opcode table/);
        expect(output).toEqual([]);
    });

    test('lower case is not the table: the generator writes the names as the contract spells them', () => {
        expect(asmLineProblem('    load8 0x2000')).toContain('load8');
    });

    test('a directive that the generator does not write is refused', () => {
        expect(asmLineProblem('.ORG 0x10')).toContain('.ORG');
    });

    test('emitLines writes nothing when one of its lines is refused', () => {
        const output: AsmLine[] = [];
        const lines = ['    NOP', '    ZZZ'] as AsmLine[];
        expect(() => emitLines(output, lines)).toThrow(AsmEmissionError);
        expect(output).toEqual([]);
    });
});

describe('the assembly of every conformance program passes the check', () => {
    const root = join(import.meta.dir, '..', '..', '..', '..', 'conformance');

    test('each line is a blank, a comment, a label, a directive or an instruction of the table', () => {
        const files = Array.from(new Bun.Glob('**/*.st').scanSync({ cwd: root })).sort();
        let built = 0;
        const refused: string[] = [];
        for (const file of files) {
            let assembly: string;
            try {
                assembly = compileToBinary(readFileSync(join(root, file), 'utf8')).assembly;
            } catch {
                continue; // a case that is meant not to build, or one that needs a project
            }
            built += 1;
            for (const line of assembly.split('\n')) {
                const problem = asmLineProblem(line);
                if (problem !== undefined) refused.push(`${file}: ${line.trim()} (${problem})`);
            }
        }
        expect(built).toBeGreaterThan(300);
        expect(refused).toEqual([]);
    });
});
