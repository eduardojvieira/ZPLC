/**
 * Test IL (Instruction List) Compilation
 *
 * SPDX-License-Identifier: MIT
 *
 * Verifies that IL programs compile correctly through the IL-to-ST transpiler.
 */

import { describe, it, expect } from 'bun:test';
import { tokenizeIL, type ILToken } from './lexer';
import { parseIL } from './parser';
import { transpileILToST } from './ilToST';
import { compileProject, compileMultiTaskProject } from '../index';
import { compileToBinary } from '@zplc/compiler';
import { ILParseError } from './parser';

describe('IL Lexer', () => {
    it('should tokenize basic IL program', () => {
        const source = `
            PROGRAM Test
            VAR
                Counter : INT;
            END_VAR
                LD Counter
                ADD 1
                ST Counter
            END_PROGRAM
        `;
        const tokens = tokenizeIL(source);
        expect(tokens.length).toBeGreaterThan(0);
        expect(tokens.some((t: ILToken) => t.type === 'PROGRAM')).toBe(true);
        expect(tokens.some((t: ILToken) => t.type === 'LD')).toBe(true);
        expect(tokens.some((t: ILToken) => t.type === 'ADD')).toBe(true);
    });

    it('should tokenize I/O addresses', () => {
        const tokens = tokenizeIL('%IX0.0 %QW1 %MD10');
        const ioTokens = tokens.filter((t: ILToken) => t.type === 'IO_ADDRESS');
        expect(ioTokens.length).toBe(3);
        expect(ioTokens[0].value).toBe('%IX0.0');
        expect(ioTokens[1].value).toBe('%QW1');
        expect(ioTokens[2].value).toBe('%MD10');
    });

    it('should tokenize time literals', () => {
        const tokens = tokenizeIL('T#500ms T#1s T#2h30m');
        const timeTokens = tokens.filter((t: ILToken) => t.type === 'TIME_LITERAL');
        expect(timeTokens.length).toBe(3);
    });

    it('should tokenize labels', () => {
        const tokens = tokenizeIL('START: LD X');
        const labelToken = tokens.find((t: ILToken) => t.type === 'LABEL');
        expect(labelToken).toBeDefined();
        expect(labelToken?.value).toBe('START');
    });
});

describe('IL Parser', () => {
    it('should parse a simple IL program', () => {
        const source = `
            PROGRAM Counter
            VAR
                Count : INT;
            END_VAR
                LD Count
                ADD 1
                ST Count
            END_PROGRAM
        `;
        const program = parseIL(source);
        expect(program.name).toBe('Counter');
        expect(program.varBlocks.length).toBe(1);
        expect(program.instructions.length).toBe(3);
        expect(program.instructions[0].operator).toBe('LD');
        expect(program.instructions[1].operator).toBe('ADD');
        expect(program.instructions[2].operator).toBe('ST');
    });

    it('should parse FB calls with parameters', () => {
        const source = `
            PROGRAM TimerTest
            VAR
                Timer1 : TON;
            END_VAR
                CAL Timer1(
                    PT := T#500ms
                )
            END_PROGRAM
        `;
        const program = parseIL(source);
        expect(program.instructions.length).toBe(1);
        expect(program.instructions[0].operator).toBe('CAL');
        expect(program.instructions[0].fbParams).toBeDefined();
        expect(program.instructions[0].fbParams?.length).toBe(1);
        expect(program.instructions[0].fbParams?.[0].name).toBe('PT');
    });

    it('should parse labels and member access', () => {
        const source = `
            PROGRAM Blinky
            VAR
                Timer1 : TON;
                LED : BOOL;
            END_VAR
            LOOP:
                LDN LED
                ST Timer1.IN
                LD Timer1.Q
                ST LED
                JMP LOOP
            END_PROGRAM
        `;
        const program = parseIL(source);
        expect(program.labels.has('LOOP')).toBe(true);
        expect(program.instructions.some(i => i.operator === 'JMP')).toBe(true);
    });

    it('rejects RETAIN instead of silently transpiling it as a normal VAR block', () => {
        const source = `
            PROGRAM Retained
            VAR RETAIN
                State : BOOL;
            END_VAR
                LD State
            END_PROGRAM
        `;

        expect(() => parseIL(source)).toThrow(/RETAIN declarations are not supported/);
        expect(() => compileProject(source, 'IL')).toThrow(/RETAIN declarations are not supported/);
        try {
            parseIL(source);
        } catch (error) {
            expect(error).toMatchObject({ line: 3, column: 17 });
        }
    });
});

describe('IL-to-ST Transpiler', () => {
    it('should transpile load/store operations', () => {
        const source = `
            PROGRAM Test
            VAR
                X : INT;
                Y : INT;
            END_VAR
                LD X
                ST Y
            END_PROGRAM
        `;
        const program = parseIL(source);
        const result = transpileILToST(program);

        expect(result.success).toBe(true);
        expect(compileToBinary(result.source).bytecode.length).toBeGreaterThan(0);
    });

    it('should transpile arithmetic operations', () => {
        const source = `
            PROGRAM Math
            VAR
                A : INT := 10;
                B : INT := 5;
                Result : INT;
            END_VAR
                LD A
                ADD B
                MUL 2
                ST Result
            END_PROGRAM
        `;
        const program = parseIL(source);
        const result = transpileILToST(program);

        expect(result.success).toBe(true);
        expect(compileToBinary(result.source).bytecode.length).toBeGreaterThan(0);
    });

    it('should generate state machine for jumps', () => {
        const source = `
            PROGRAM WithJumps
            VAR
                Counter : INT;
            END_VAR
            START:
                LD Counter
                ADD 1
                ST Counter
                JMP START
            END_PROGRAM
        `;
        const program = parseIL(source);
        const result = transpileILToST(program);

        expect(result.success).toBe(true);
        expect(compileToBinary(result.source).bytecode.length).toBeGreaterThan(0);
    });
});

const il = (body: string, vars = 'A : BOOL;\n    B : BOOL;\n    X : BOOL;\n    N : INT;\n    Real1 : REAL;') => `PROGRAM T
VAR
    ${vars}
END_VAR
${body}
END_PROGRAM`;

/** 1-based line of the first line of `source` that contains `text`, counting from `from` (1-based). */
const lineOf = (source: string, text: string, from = 1): number =>
    source.split('\n').findIndex((line, index) => index + 1 >= from && line.includes(text)) + 1;

// Each of these is a program the transpiler cannot translate faithfully: it must say so (LNG-002) and
// name the IL line, instead of writing a comment, a default or nothing into the Structured Text.
describe('IL transpiler errors (LNG-002, LNG-017, LNG-018)', () => {
    const rejected = (source: string) => {
        const result = transpileILToST(parseIL(source));
        expect(result.success).toBe(false);
        expect(result.source).toBe('');
        return result;
    };

    it('names the line of a jump to an unknown label, for JMP, JMPC and JMPCN', () => {
        for (const jump of ['JMP', 'JMPC', 'JMPCN']) {
            const source = il(`    LD A\n    ${jump} nowhere\n    ST X`);
            const line = lineOf(source, jump);
            const result = rejected(source);
            expect(result.errors).toEqual([`IL line ${line}: ${jump} jumps to unknown label 'nowhere'`]);
            expect(result.line).toBe(line);
        }
    });

    it('rejects a label defined twice at the second definition', () => {
        const source = il('again:\n    LD A\n    ST X\nagain:\n    LD X\n    ST A');
        const first = lineOf(source, 'again:');
        const second = lineOf(source, 'again:', first + 1);
        expect(rejected(source).errors).toEqual([`IL line ${second}: label 'again' is already defined at line ${first}`]);
    });

    it('stops at an unknown mnemonic with its line instead of looping', () => {
        const source = il('    LD A\n    ANDD B\n    ST X');
        let error: unknown;
        try { parseIL(source); } catch (caught) { error = caught; }
        expect(error).toBeInstanceOf(ILParseError);
        expect(error).toMatchObject({ line: lineOf(source, 'ANDD') });
        expect((error as Error).message).toContain('ANDD');
    });

    it('stops at a closing parenthesis that nothing opened', () => {
        const source = il('    LD A\n    AND( B\n    )\n    )\n    ST X');
        const line = lineOf(source, ')', lineOf(source, ')') + 1);
        expect(rejected(source).errors).toEqual([`IL line ${line}: ')' has no matching opening parenthesis`]);
    });

    it('rejects an opening parenthesis that is never closed', () => {
        const source = il('    LD A\n    AND( B\n    ST X');
        expect(rejected(source).errors).toEqual([`IL line ${lineOf(source, 'AND(')}: AND( is never closed`]);
    });

    it('rejects a variable that is not declared, and a type the accumulator cannot hold', () => {
        const missing = il('    LD Missing\n    ST X');
        expect(rejected(missing).errors).toEqual([`IL line ${lineOf(missing, 'LD Missing')}: 'Missing' is not declared; declare it in a VAR block of this program`]);
        const block = il('    LD T1\n    ST X', 'T1 : TON;\n    X : BOOL;');
        expect(rejected(block).errors).toEqual([`IL line ${lineOf(block, 'LD T1')}: 'T1' has type TON, which the accumulator cannot hold`]);
    });

    it('rejects reading the accumulator before anything loaded it', () => {
        const source = il('    AND A\n    ST X');
        expect(rejected(source).errors[0]).toBe(`IL line ${lineOf(source, 'AND A')}: AND reads the accumulator before any LD has loaded it`);
    });

    it('rejects a BOOL accumulator stored in a number, and a jump on a number', () => {
        const store = il('    LD A\n    ST N');
        expect(rejected(store).errors).toEqual([`IL line ${lineOf(store, 'ST N')}: ST stores a BOOL accumulator in 'N' of type INT`]);
        const jump = il('    LD N\n    JMPC end\nend:\n    ST N');
        expect(rejected(jump).errors).toEqual([`IL line ${lineOf(jump, 'JMPC')}: JMPC needs a BOOL accumulator, it holds INT`]);
    });

    it('rejects a jump inside a parenthesised operation', () => {
        const source = il('    LD A\n    AND( B\n    JMP end\n    )\nend:\n    ST X');
        expect(rejected(source).errors).toContain(`IL line ${lineOf(source, 'JMP end')}: JMP is not allowed inside a parenthesised operation`);
    });

    it('rejects a call of something that is not a function block, and a parameter the block does not have', () => {
        const notBlock = il('    CAL N');
        expect(rejected(notBlock).errors).toEqual([`IL line ${lineOf(notBlock, 'CAL N')}: 'N' is of type INT, not a function block instance`]);
        const noParam = il('    CAL T1(Nope := TRUE)', 'T1 : TON;');
        expect(rejected(noParam).errors).toEqual([`IL line ${lineOf(noParam, 'CAL T1')}: 'Nope' is not an input of TON 'T1'`]);
    });

    it('surfaces through a build as an error with the IL line, never a silent default', () => {
        const source = il('    LD A\n    JMPC nowhere\n    ST X');
        const line = lineOf(source, 'JMPC');
        expect(() => compileProject(source, 'IL')).toThrow(new RegExp(`IL line ${line}: .*nowhere`));
        const config = { name: 'p', version: '1.0.0', tasks: [{ name: 'T', trigger: 'cyclic' as const, interval_ms: 10, priority: 1, programs: ['main.il'] }] };
        let error: unknown;
        try { compileMultiTaskProject(config, [{ name: 'main', content: source, language: 'IL', sourceRef: 'src/main.il' }]); } catch (caught) { error = caught; }
        expect(error).toMatchObject({ line, sourceRef: 'src/main.il' });
        expect((error as Error).message).toContain('nowhere');
    });
});

describe('IL accumulator types (LNG-019)', () => {
    it('keeps a REAL accumulator a REAL and a BOOL result a BOOL', () => {
        const result = transpileILToST(parseIL(il('    LD Real1\n    ADD 2.25\n    ST Real1\n    GT 3.5\n    ST X')));
        expect(result.success).toBe(true);
        expect(compileToBinary(result.source).bytecode.length).toBeGreaterThan(0);
        // No conversion between the REAL and the integer accumulators is generated
        expect(result.source).not.toMatch(/REAL_TO_INT|INT_TO_REAL/);
    });

    it('types Instance.Member from the standard block and from the project symbols for user blocks', () => {
        const source = il('    LD Timer.Q\n    ST X\n    LD Mine.Level\n    ST N', 'Timer : TON;\n    Mine : Tank;\n    X : BOOL;\n    N : INT;');
        const without = transpileILToST(parseIL(source));
        expect(without.success).toBe(false);
        expect(without.errors[0]).toBe(`IL line ${lineOf(source, 'LD Mine.Level')}: the type of 'Mine.Level' cannot be determined (TANK has no member 'Level' that the accumulator can hold)`);

        const symbols = {
            globals: new Map<string, string>(),
            functionBlocks: new Map([['TANK', new Map([['LEVEL', 'INT']])]]),
        };
        expect(transpileILToST(parseIL(source), { symbols }).success).toBe(true);
    });

    it('types a global from the project symbols', () => {
        const source = il('    LD Setpoint\n    ST Real1', 'Real1 : REAL;');
        expect(transpileILToST(parseIL(source)).success).toBe(false);
        const symbols = { globals: new Map([['SETPOINT', 'REAL']]), functionBlocks: new Map<string, Map<string, string>>() };
        expect(transpileILToST(parseIL(source), { symbols }).success).toBe(true);
    });

    it('accepts the parameters of standard blocks that are also IL operators (S, R, LD)', () => {
        const program = parseIL(il('    CAL L(S := TRUE, R1 := FALSE)\n    CAL C(CD := A, LD := B, PV := 3)', 'L : RS;\n    C : CTD;\n    A : BOOL;\n    B : BOOL;'));
        expect(program.instructions[0].fbParams?.map((p) => p.name)).toEqual(['S', 'R1']);
        expect(program.instructions[1].fbParams?.map((p) => p.name)).toEqual(['CD', 'LD', 'PV']);
        expect(transpileILToST(program).success).toBe(true);
    });
});

describe('IL Full Compilation Pipeline', () => {
    it('should compile IL blinky example', () => {
        const ilSource = `
            PROGRAM Blinky
            VAR
                BlinkTimer : TON;
            END_VAR
            VAR_OUTPUT
                LED_Output AT %Q0.0 : BOOL;
            END_VAR
                LDN LED_Output
                ST BlinkTimer.IN
                CAL BlinkTimer(
                    PT := T#500ms
                )
                LD BlinkTimer.Q
                ST LED_Output
            END_PROGRAM
        `;

        const result = compileProject(ilSource, 'IL');

        expect(result.language).toBe('IL');
        expect(result.bytecode).toBeDefined();
        expect(result.bytecode.length).toBeGreaterThan(0);
        expect(result.zplcFile).toBeDefined();
        expect(result.intermediateSTSource).toBeDefined();
    });
});
