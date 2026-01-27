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
import { compileProject } from '../index';

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
        expect(result.source).toContain('IL_CR');
        expect(result.source).toContain('Y :=');
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
        expect(result.source).toContain('IL_CR := IL_CR +');
        expect(result.source).toContain('IL_CR := IL_CR *');
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
        expect(result.source).toContain('IL_STATE');
        expect(result.source).toContain('CASE IL_STATE OF');
        expect(result.source).toContain('WHILE NOT IL_DONE');
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
