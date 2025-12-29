/**
 * ZPLC Structured Text Compiler Tests
 *
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

import { tokenize, TokenType } from './lexer.ts';
import { parse } from './parser.ts';
import { buildSymbolTable, MemoryLayout } from './symbol-table.ts';
import { generate } from './codegen.ts';
import { compileST, compileToBinary, validate } from './index.ts';

// ============================================================================
// Helper Functions
// ============================================================================

function loadBlinky(): string {
    const path = join(import.meta.dir, '../examples/blinky.st');
    return readFileSync(path, 'utf-8');
}

// ============================================================================
// Lexer Tests
// ============================================================================

describe('Lexer', () => {
    it('tokenizes simple keywords', () => {
        const tokens = tokenize('PROGRAM Test END_PROGRAM');

        expect(tokens.length).toBe(4); // PROGRAM, Test, END_PROGRAM, EOF
        expect(tokens[0].type).toBe(TokenType.PROGRAM);
        expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
        expect(tokens[1].value).toBe('Test');
        expect(tokens[2].type).toBe(TokenType.END_PROGRAM);
        expect(tokens[3].type).toBe(TokenType.EOF);
    });

    it('tokenizes VAR block', () => {
        const tokens = tokenize('VAR x : BOOL; END_VAR');

        expect(tokens[0].type).toBe(TokenType.VAR);
        expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
        expect(tokens[2].type).toBe(TokenType.COLON);
        expect(tokens[3].type).toBe(TokenType.BOOL);
        expect(tokens[4].type).toBe(TokenType.SEMICOLON);
        expect(tokens[5].type).toBe(TokenType.END_VAR);
    });

    it('tokenizes VAR_OUTPUT', () => {
        const tokens = tokenize('VAR_OUTPUT x AT %Q0.0 : BOOL; END_VAR');

        expect(tokens[0].type).toBe(TokenType.VAR_OUTPUT);
        expect(tokens[3].type).toBe(TokenType.IO_ADDRESS);
        expect(tokens[3].value).toBe('%Q0.0');
    });

    it('tokenizes time literals', () => {
        const tokens = tokenize('T#500ms T#1s T#2m');

        expect(tokens[0].type).toBe(TokenType.TIME_LITERAL);
        expect(tokens[0].value).toBe('T#500ms');
        expect(tokens[1].type).toBe(TokenType.TIME_LITERAL);
        expect(tokens[1].value).toBe('T#1s');
        expect(tokens[2].type).toBe(TokenType.TIME_LITERAL);
        expect(tokens[2].value).toBe('T#2m');
    });

    it('tokenizes assignment', () => {
        const tokens = tokenize('x := TRUE;');

        expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
        expect(tokens[1].type).toBe(TokenType.ASSIGN);
        expect(tokens[2].type).toBe(TokenType.TRUE);
        expect(tokens[3].type).toBe(TokenType.SEMICOLON);
    });

    it('tokenizes IF statement', () => {
        const tokens = tokenize('IF x THEN y := 1; END_IF');
        // IF(0) x(1) THEN(2) y(3) :=(4) 1(5) ;(6) END_IF(7) EOF(8)

        expect(tokens[0].type).toBe(TokenType.IF);
        expect(tokens[2].type).toBe(TokenType.THEN);
        expect(tokens[7].type).toBe(TokenType.END_IF);
    });

    it('tokenizes function block call', () => {
        const tokens = tokenize('Timer(IN := TRUE, PT := T#500ms);');

        expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
        expect(tokens[1].type).toBe(TokenType.LPAREN);
        expect(tokens[2].type).toBe(TokenType.IDENTIFIER);
        expect(tokens[3].type).toBe(TokenType.ASSIGN);
        expect(tokens[4].type).toBe(TokenType.TRUE);
        expect(tokens[5].type).toBe(TokenType.COMMA);
    });

    it('tokenizes block comments', () => {
        const tokens = tokenize('x (* this is a comment *) y');

        expect(tokens.length).toBe(3); // x, y, EOF
        expect(tokens[0].value).toBe('x');
        expect(tokens[1].value).toBe('y');
    });

    it('tokenizes arithmetic operators', () => {
        const tokens = tokenize('a + b - c * d / e');

        expect(tokens[1].type).toBe(TokenType.PLUS);
        expect(tokens[3].type).toBe(TokenType.MINUS);
        expect(tokens[5].type).toBe(TokenType.STAR);
        expect(tokens[7].type).toBe(TokenType.SLASH);
    });

    it('tokenizes comparison operators', () => {
        const tokens = tokenize('a = b <> c < d <= e > f >= g');

        expect(tokens[1].type).toBe(TokenType.EQ);
        expect(tokens[3].type).toBe(TokenType.NE);
        expect(tokens[5].type).toBe(TokenType.LT);
        expect(tokens[7].type).toBe(TokenType.LE);
        expect(tokens[9].type).toBe(TokenType.GT);
        expect(tokens[11].type).toBe(TokenType.GE);
    });

    it('tokenizes MOD keyword', () => {
        const tokens = tokenize('a MOD b');

        expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
        expect(tokens[1].type).toBe(TokenType.MOD);
        expect(tokens[2].type).toBe(TokenType.IDENTIFIER);
    });

    it('tokenizes blinky.st without errors', () => {
        const source = loadBlinky();
        const tokens = tokenize(source);

        // Should have many tokens and end with EOF
        expect(tokens.length).toBeGreaterThan(20);
        expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
    });
});

// ============================================================================
// Parser Tests
// ============================================================================

describe('Parser', () => {
    it('parses minimal program', () => {
        const ast = parse('PROGRAM Test END_PROGRAM');

        expect(ast.kind).toBe('CompilationUnit');
        expect(ast.programs.length).toBe(1);
        expect(ast.programs[0].name).toBe('Test');
        expect(ast.programs[0].varBlocks.length).toBe(0);
        expect(ast.programs[0].statements.length).toBe(0);
    });

    it('parses VAR declaration', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                x : BOOL;
                y : TIME := T#500ms;
            END_VAR
            END_PROGRAM
        `);

        const program = ast.programs[0];
        expect(program.varBlocks.length).toBe(1);
        expect(program.varBlocks[0].variables.length).toBe(2);

        const x = program.varBlocks[0].variables[0];
        expect(x.name).toBe('x');
        expect(x.dataType).toBe('BOOL');
        expect(x.initialValue).toBeNull();

        const y = program.varBlocks[0].variables[1];
        expect(y.name).toBe('y');
        expect(y.dataType).toBe('TIME');
        expect(y.initialValue).not.toBeNull();
        expect(y.initialValue?.kind).toBe('TimeLiteral');
    });

    it('parses VAR_OUTPUT with AT', () => {
        const ast = parse(`
            PROGRAM Test
            VAR_OUTPUT
                LED AT %Q0.0 : BOOL;
            END_VAR
            END_PROGRAM
        `);

        const program = ast.programs[0];
        expect(program.varBlocks.length).toBe(1);
        expect(program.varBlocks[0].section).toBe('VAR_OUTPUT');

        const led = program.varBlocks[0].variables[0];
        expect(led.name).toBe('LED');
        expect(led.ioAddress).not.toBeNull();
        expect(led.ioAddress?.type).toBe('Q');
        expect(led.ioAddress?.byteOffset).toBe(0);
        expect(led.ioAddress?.bitOffset).toBe(0);
    });

    it('parses assignment', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                x : BOOL;
            END_VAR
            x := TRUE;
            END_PROGRAM
        `);

        const program = ast.programs[0];
        expect(program.statements.length).toBe(1);
        expect(program.statements[0].kind).toBe('Assignment');

        const assign = program.statements[0] as any;
        expect(assign.target.name).toBe('x');
        expect(assign.value.kind).toBe('BoolLiteral');
        expect(assign.value.value).toBe(true);
    });

    it('parses NOT expression', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                x : BOOL;
            END_VAR
            x := NOT x;
            END_PROGRAM
        `);

        const assign = ast.programs[0].statements[0] as any;
        expect(assign.value.kind).toBe('UnaryExpr');
        expect(assign.value.operator).toBe('NOT');
    });

    it('parses IF statement', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                x : BOOL;
                y : BOOL;
            END_VAR
            IF x THEN
                y := TRUE;
            END_IF;
            END_PROGRAM
        `);

        const ifStmt = ast.programs[0].statements[0] as any;
        expect(ifStmt.kind).toBe('IfStatement');
        expect(ifStmt.condition.kind).toBe('Identifier');
        expect(ifStmt.thenBranch.length).toBe(1);
        expect(ifStmt.elseBranch).toBeNull();
    });

    it('parses function block call', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                Timer : TON;
            END_VAR
            Timer(IN := TRUE, PT := T#500ms);
            END_PROGRAM
        `);

        const fbCall = ast.programs[0].statements[0] as any;
        expect(fbCall.kind).toBe('FBCallStatement');
        expect(fbCall.fbName).toBe('Timer');
        expect(fbCall.parameters.length).toBe(2);
        expect(fbCall.parameters[0].name).toBe('IN');
        expect(fbCall.parameters[1].name).toBe('PT');
    });

    it('parses member access', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                Timer : TON;
                x : BOOL;
            END_VAR
            x := Timer.Q;
            END_PROGRAM
        `);

        const assign = ast.programs[0].statements[0] as any;
        expect(assign.value.kind).toBe('MemberAccess');
        expect(assign.value.object.name).toBe('Timer');
        expect(assign.value.member).toBe('Q');
    });

    it('parses blinky.st', () => {
        const source = loadBlinky();
        const ast = parse(source);

        expect(ast.programs.length).toBe(1);
        expect(ast.programs[0].name).toBe('Blinky');
        expect(ast.programs[0].varBlocks.length).toBe(2);
        expect(ast.programs[0].statements.length).toBeGreaterThan(0);
    });

    it('parses arithmetic expressions with correct precedence', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                a : INT;
                b : INT;
                c : INT;
            END_VAR
            a := b + c * 2;
            END_PROGRAM
        `);

        const assign = ast.programs[0].statements[0] as any;
        // Should be: b + (c * 2), not (b + c) * 2
        expect(assign.value.kind).toBe('BinaryExpr');
        expect(assign.value.operator).toBe('ADD');
        expect(assign.value.left.kind).toBe('Identifier');
        expect(assign.value.left.name).toBe('b');
        expect(assign.value.right.kind).toBe('BinaryExpr');
        expect(assign.value.right.operator).toBe('MUL');
    });

    it('parses comparison expressions', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                a : INT;
                b : INT;
                result : BOOL;
            END_VAR
            result := a < b;
            END_PROGRAM
        `);

        const assign = ast.programs[0].statements[0] as any;
        expect(assign.value.kind).toBe('BinaryExpr');
        expect(assign.value.operator).toBe('LT');
    });

    it('parses complex expressions with logical and comparison operators', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                a : INT;
                b : INT;
                c : INT;
                result : BOOL;
            END_VAR
            result := a > 0 AND b < 10;
            END_PROGRAM
        `);

        const assign = ast.programs[0].statements[0] as any;
        // Should be: (a > 0) AND (b < 10)
        expect(assign.value.kind).toBe('BinaryExpr');
        expect(assign.value.operator).toBe('AND');
        expect(assign.value.left.operator).toBe('GT');
        expect(assign.value.right.operator).toBe('LT');
    });

    it('parses unary minus', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                a : INT;
            END_VAR
            a := -5;
            END_PROGRAM
        `);

        const assign = ast.programs[0].statements[0] as any;
        expect(assign.value.kind).toBe('UnaryExpr');
        expect(assign.value.operator).toBe('NEG');
        expect(assign.value.operand.kind).toBe('IntLiteral');
        expect(assign.value.operand.value).toBe(5);
    });

    it('parses MOD operator', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                a : INT;
            END_VAR
            a := 10 MOD 3;
            END_PROGRAM
        `);

        const assign = ast.programs[0].statements[0] as any;
        expect(assign.value.kind).toBe('BinaryExpr');
        expect(assign.value.operator).toBe('MOD');
    });
});

// ============================================================================
// Symbol Table Tests
// ============================================================================

describe('Symbol Table', () => {
    it('allocates variables in work memory', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                x : BOOL;
                y : TIME;
            END_VAR
            END_PROGRAM
        `);

        const table = buildSymbolTable(ast.programs[0]);

        const x = table.get('x');
        expect(x).toBeDefined();
        expect(x!.address).toBe(MemoryLayout.WORK_BASE); // 0x2000

        const y = table.get('y');
        expect(y).toBeDefined();
        expect(y!.address).toBe(MemoryLayout.WORK_BASE + 4); // aligned
    });

    it('maps I/O variables to OPI', () => {
        const ast = parse(`
            PROGRAM Test
            VAR_OUTPUT
                LED AT %Q0.0 : BOOL;
            END_VAR
            END_PROGRAM
        `);

        const table = buildSymbolTable(ast.programs[0]);

        const led = table.get('LED');
        expect(led).toBeDefined();
        expect(led!.address).toBe(MemoryLayout.OPI_BASE); // 0x1000
    });

    it('tracks TON members', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                Timer : TON;
            END_VAR
            END_PROGRAM
        `);

        const table = buildSymbolTable(ast.programs[0]);

        const timer = table.get('Timer');
        expect(timer).toBeDefined();
        expect(timer!.members).toBeDefined();
        expect(timer!.members!.has('IN')).toBe(true);
        expect(timer!.members!.has('Q')).toBe(true);
        expect(timer!.members!.has('PT')).toBe(true);
        expect(timer!.members!.has('ET')).toBe(true);

        // Test getMemberAddress
        const qAddr = table.getMemberAddress('Timer', 'Q');
        expect(qAddr).toBe(timer!.address + 1);
    });
});

// ============================================================================
// Code Generator Tests
// ============================================================================

describe('Code Generator', () => {
    it('generates assembly for minimal program', () => {
        const ast = parse('PROGRAM Test END_PROGRAM');
        const asm = generate(ast.programs[0]);

        expect(asm).toContain('ZPLC Generated Assembly');
        expect(asm).toContain('Program: Test');
        expect(asm).toContain('HALT');
    });

    it('generates assignment code', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                x : BOOL;
            END_VAR
            x := TRUE;
            END_PROGRAM
        `);

        const asm = generate(ast.programs[0]);

        expect(asm).toContain('PUSH8 1');
        expect(asm).toContain('STORE8 0x2000');
    });

    it('generates NOT expression', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                x : BOOL;
            END_VAR
            x := NOT x;
            END_PROGRAM
        `);

        const asm = generate(ast.programs[0]);

        expect(asm).toContain('LOAD8 0x2000');
        expect(asm).toContain('NOT');
        expect(asm).toContain('STORE8 0x2000');
    });

    it('generates IF statement', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                x : BOOL;
                y : BOOL;
            END_VAR
            IF x THEN
                y := TRUE;
            END_IF;
            END_PROGRAM
        `);

        const asm = generate(ast.programs[0]);

        expect(asm).toContain('JZ');
        expect(asm).toContain('end_if_');
    });

    it('generates TON timer code', () => {
        const ast = parse(`
            PROGRAM Test
            VAR
                Timer : TON;
            END_VAR
            Timer(IN := TRUE, PT := T#500ms);
            END_PROGRAM
        `);

        const asm = generate(ast.programs[0]);

        expect(asm).toContain('TON Timer Logic');
        expect(asm).toContain('PUSH32 500'); // T#500ms = 500
    });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration', () => {
    it('compiles minimal program to assembly', () => {
        const asm = compileST('PROGRAM Test END_PROGRAM');

        expect(asm).toContain('HALT');
    });

    it('validates correct ST', () => {
        const error = validate('PROGRAM Test END_PROGRAM');
        expect(error).toBeNull();
    });

    it('validates incorrect ST', () => {
        const error = validate('PROGRAM'); // missing name and END_PROGRAM
        expect(error).not.toBeNull();
    });

    it('compiles blinky.st to assembly', () => {
        const source = loadBlinky();
        const asm = compileST(source);

        // Check that key elements are present
        expect(asm).toContain('Program: Blinky');
        expect(asm).toContain('BlinkTimer');
        expect(asm).toContain('LedState');
        expect(asm).toContain('LED_Output');
        expect(asm).toContain('TON Timer Logic');
        expect(asm).toContain('HALT');

        // Check memory map
        expect(asm).toContain('0x2000:'); // Work memory starts at 0x2000
        expect(asm).toContain('0x1000:'); // OPI for LED_Output
    });

    it('compiles blinky.st to bytecode', () => {
        const source = loadBlinky();
        const result = compileToBinary(source);

        // Check result structure
        expect(result.assembly).toBeDefined();
        expect(result.bytecode).toBeDefined();
        expect(result.zplcFile).toBeDefined();

        // Check bytecode is not empty
        expect(result.bytecode.length).toBeGreaterThan(0);

        // Check .zplc file has proper header
        // Magic: 0x5A 0x50 0x4C 0x43 ("ZPLC")
        expect(result.zplcFile[0]).toBe(0x5A);
        expect(result.zplcFile[1]).toBe(0x50);
        expect(result.zplcFile[2]).toBe(0x4C);
        expect(result.zplcFile[3]).toBe(0x43);
    });
});

// ============================================================================
// Blinky Golden Test
// ============================================================================

describe('Blinky Golden Test', () => {
    it('produces valid assembly with all required components', () => {
        const source = loadBlinky();
        const asm = compileST(source);

        // Memory layout assertions
        expect(asm).toMatch(/0x20[0-9a-f]{2}.*BlinkTimer/i);
        expect(asm).toMatch(/0x20[0-9a-f]{2}.*LedState/i);
        expect(asm).toMatch(/0x1000.*LED_Output/i);

        // Timer call
        expect(asm).toMatch(/BlinkTimer\(.*\)/);
        expect(asm).toContain('Set BlinkTimer.IN');
        expect(asm).toContain('Set BlinkTimer.PT');

        // IF statement checking BlinkTimer.Q
        expect(asm).toContain('IF condition');
        expect(asm).toContain('THEN branch');

        // Toggle: LedState := NOT LedState
        expect(asm).toContain('NOT');

        // Final output: LED_Output := LedState
        expect(asm).toContain('LED_Output');

        console.log('\n=== Generated Assembly (blinky.st) ===');
        console.log(asm);
    });
});

// ============================================================================
// Multi-Task Compiler Tests
// ============================================================================

import { compileMultiTaskProject } from './index.ts';
import type { ProgramSource, MultiTaskCompilationResult } from './index.ts';
import type { ZPLCProjectConfig } from '../types/index.ts';
import { ZPLC_CONSTANTS, TASK_TYPE } from '../assembler/index.ts';

describe('Multi-Task Compiler', () => {
    it('compiles a single-task project', () => {
        const config: ZPLCProjectConfig = {
            name: 'SingleTask',
            version: '1.0.0',
            tasks: [
                { name: 'MainTask', trigger: 'cyclic', interval: 10, priority: 1, programs: ['Main'] },
            ],
        };

        const sources: ProgramSource[] = [
            { 
                name: 'Main', 
                content: 'PROGRAM Main VAR x : BOOL; END_VAR x := TRUE; END_PROGRAM', 
                language: 'ST' 
            },
        ];

        const result = compileMultiTaskProject(config, sources);

        // Check that we got valid output
        expect(result.zplcFile.length).toBeGreaterThan(0);
        expect(result.bytecode.length).toBeGreaterThan(0);
        expect(result.tasks.length).toBe(1);
        expect(result.codeSize).toBe(result.bytecode.length);

        // Check task definition
        expect(result.tasks[0].id).toBe(0);
        expect(result.tasks[0].type).toBe(TASK_TYPE.CYCLIC);
        expect(result.tasks[0].priority).toBe(1);
        expect(result.tasks[0].intervalUs).toBe(10000); // 10ms * 1000
        expect(result.tasks[0].entryPoint).toBe(0);
    });

    it('compiles a two-task project with different programs', () => {
        const config: ZPLCProjectConfig = {
            name: 'MultiTask',
            version: '1.0.0',
            tasks: [
                { name: 'FastTask', trigger: 'cyclic', interval: 10, priority: 0, programs: ['Fast'] },
                { name: 'SlowTask', trigger: 'cyclic', interval: 100, priority: 2, programs: ['Slow'] },
            ],
        };

        const sources: ProgramSource[] = [
            { 
                name: 'Fast', 
                content: 'PROGRAM Fast VAR x : BOOL; END_VAR x := TRUE; END_PROGRAM', 
                language: 'ST' 
            },
            { 
                name: 'Slow', 
                content: 'PROGRAM Slow VAR y : INT; END_VAR y := 42; END_PROGRAM', 
                language: 'ST' 
            },
        ];

        const result = compileMultiTaskProject(config, sources);

        // Check we have 2 tasks
        expect(result.tasks.length).toBe(2);

        // Check task 1 (Fast)
        expect(result.tasks[0].priority).toBe(0);
        expect(result.tasks[0].intervalUs).toBe(10000);
        expect(result.tasks[0].entryPoint).toBe(0);

        // Check task 2 (Slow) - entry point should be after Fast's code
        expect(result.tasks[1].priority).toBe(2);
        expect(result.tasks[1].intervalUs).toBe(100000);
        expect(result.tasks[1].entryPoint).toBeGreaterThan(0);

        // Program details should show both programs
        expect(result.programDetails.length).toBe(2);
        expect(result.programDetails[0].name).toBe('Fast');
        expect(result.programDetails[1].name).toBe('Slow');
        expect(result.programDetails[1].entryPoint).toBe(result.tasks[1].entryPoint);
    });

    it('generates correct .zplc file structure', () => {
        const config: ZPLCProjectConfig = {
            name: 'Test',
            version: '1.0.0',
            tasks: [
                { name: 'Task1', trigger: 'cyclic', interval: 50, priority: 1, programs: ['Prog1'] },
            ],
        };

        const sources: ProgramSource[] = [
            { 
                name: 'Prog1', 
                content: 'PROGRAM Prog1 END_PROGRAM', 
                language: 'ST' 
            },
        ];

        const result = compileMultiTaskProject(config, sources);
        const view = new DataView(result.zplcFile.buffer);

        // Check magic
        expect(view.getUint32(0, true)).toBe(ZPLC_CONSTANTS.MAGIC);

        // Check version
        expect(view.getUint16(4, true)).toBe(1);
        expect(view.getUint16(6, true)).toBe(0);

        // Check segment count = 2 (CODE + TASK)
        expect(view.getUint16(26, true)).toBe(2);

        // Check segment table
        // Segment 1: CODE at offset 32
        expect(view.getUint16(32, true)).toBe(ZPLC_CONSTANTS.SEGMENT_TYPE_CODE);

        // Segment 2: TASK at offset 40
        expect(view.getUint16(40, true)).toBe(ZPLC_CONSTANTS.SEGMENT_TYPE_TASK);
    });

    it('throws error for missing program source', () => {
        const config: ZPLCProjectConfig = {
            name: 'MissingSource',
            version: '1.0.0',
            tasks: [
                { name: 'Task1', trigger: 'cyclic', interval: 10, priority: 1, programs: ['NonExistent'] },
            ],
        };

        const sources: ProgramSource[] = [];

        expect(() => compileMultiTaskProject(config, sources)).toThrow(/not found/);
    });

    it('throws error for empty tasks', () => {
        const config: ZPLCProjectConfig = {
            name: 'NoTasks',
            version: '1.0.0',
            tasks: [],
        };

        const sources: ProgramSource[] = [];

        expect(() => compileMultiTaskProject(config, sources)).toThrow(/No tasks/);
    });

    it('handles event trigger type', () => {
        const config: ZPLCProjectConfig = {
            name: 'EventTask',
            version: '1.0.0',
            tasks: [
                { name: 'EventHandler', trigger: 'event', priority: 0, programs: ['Handler'] },
            ],
        };

        const sources: ProgramSource[] = [
            { 
                name: 'Handler', 
                content: 'PROGRAM Handler END_PROGRAM', 
                language: 'ST' 
            },
        ];

        const result = compileMultiTaskProject(config, sources);

        expect(result.tasks[0].type).toBe(TASK_TYPE.EVENT);
    });

    it('uses default values for optional fields', () => {
        const config: ZPLCProjectConfig = {
            name: 'Defaults',
            version: '1.0.0',
            tasks: [
                { name: 'Task1', trigger: 'cyclic', programs: ['Prog1'] } as any, // Missing interval/priority
            ],
        };

        const sources: ProgramSource[] = [
            { 
                name: 'Prog1', 
                content: 'PROGRAM Prog1 END_PROGRAM', 
                language: 'ST' 
            },
        ];

        const result = compileMultiTaskProject(config, sources);

        // Should use defaults
        expect(result.tasks[0].priority).toBe(1); // Default
        expect(result.tasks[0].intervalUs).toBe(10000); // 10ms default
        expect(result.tasks[0].stackSize).toBe(64); // Default
    });
});
