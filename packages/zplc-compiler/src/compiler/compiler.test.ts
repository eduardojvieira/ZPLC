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
import { compileST, compileToBinary, compileSingleFileWithTask, validate, CompilerError } from './index.ts';
import { findPC, findSourceLine } from './debug-map.ts';

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
        expect(tokens[0].value).toBe('500ms');
        expect(tokens[1].type).toBe(TokenType.TIME_LITERAL);
        expect(tokens[1].value).toBe('1s');
        expect(tokens[2].type).toBe(TokenType.TIME_LITERAL);
        expect(tokens[2].value).toBe('2m');
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

describe('Communication tag admission', () => {
    it('emits an operable PUBLISH tag', () => {
        const result = compileToBinary(`
            PROGRAM Tags
            VAR
                Published : BOOL {publish};
            END_VAR
            END_PROGRAM
        `);

        expect(result.assembly).toContain('.TAG 0x2000 1 1 0');
    });

    it('rejects tags the shared verifier cannot operate', () => {
        const cases = [
            ['PUBLISH SINT', `VAR Value : SINT {publish}; END_VAR`, /PUBLISH tag.*SINT/],
            ['SUBSCRIBE IPI', `VAR_INPUT Value AT %I0.0 : BOOL {subscribe}; END_VAR`, /SUBSCRIBE tag.*IPI/],
            ['SUBSCRIBE OPI', `VAR_OUTPUT Value AT %Q0.0 : BOOL {subscribe}; END_VAR`, /SUBSCRIBE tag.*OPI/],
            ['MODBUS IPI', `VAR_INPUT Value AT %I0.0 : BOOL {modbus:40001}; END_VAR`, /MODBUS tag.*IPI/],
            ['MODBUS OPI', `VAR_OUTPUT Value AT %Q0.0 : BOOL {modbus:40001}; END_VAR`, /MODBUS tag.*OPI/],
            ['MODBUS address', `VAR Value : BOOL {modbus:65536}; END_VAR`, /MODBUS address/],
        ] as const;

        for (const [name, declaration, message] of cases) {
            expect(() => compileToBinary(`PROGRAM Tags ${declaration} END_PROGRAM`), name)
                .toThrow(CompilerError);
            expect(() => compileToBinary(`PROGRAM Tags ${declaration} END_PROGRAM`), name)
                .toThrow(message);
        }
    });

    it('rejects a tag emitted from the unsupported 0x3000 WORK alias', () => {
        expect(() => compileToBinary(`
            PROGRAM Tags
            VAR
                Published : BOOL {publish};
            END_VAR
            END_PROGRAM
        `, { workMemoryBase: 0x3000 })).toThrow(/0x3000/);
    });
});

describe('target memory profiles', () => {
    const source = 'PROGRAM Limits VAR Value : BOOL; END_VAR END_PROGRAM';

    const programWithBytes = (count: number) => `PROGRAM Limits\nVAR\n${Array.from({ length: count }, (_, index) => `Value${index} : BOOL;`).join('\n')}\nEND_VAR\nEND_PROGRAM`;

    it('keeps host defaults and publishes effective debug memory limits', () => {
        expect(compileToBinary(source).bytecode.length).toBeGreaterThan(0);
        const result = compileToBinary(source, {
            generateDebugMap: true,
            memoryProfile: { workSize: 2048, retainSize: 1024, codeSizeMax: 8192 },
        });
        expect(result.debugMap?.memoryLayout).toMatchObject({ workSize: 2048, retainSize: 1024 });
    });

    it('rejects WORK exhaustion and CODE above the target limit', () => {
        expect(() => compileToBinary(source, {
            memoryProfile: { workSize: 1, retainSize: 1024, codeSizeMax: 8192 },
        })).toThrow(/WORK (allocation|symbol collides)/);
        expect(() => compileToBinary(source, {
            memoryProfile: { workSize: 2048, retainSize: 1024, codeSizeMax: 1 },
        })).toThrow(/CODE exceeds/);
    });

    it('accepts exactly the target WORK bucket count and rejects one additional task with its source', () => {
        const profile = { workSize: 2048, retainSize: 1024, codeSizeMax: 8192 };
        const sources = Array.from({ length: 9 }, (_, index) => ({
            name: `Program${index}`,
            sourceRef: `src/Program${index}.st`,
            content: `PROGRAM Program${index} END_PROGRAM`,
        }));
        const config = (count: number) => ({
            name: 'Buckets',
            version: '1.0.0',
            tasks: sources.slice(0, count).map((source, index) => ({
                name: `Task${index}`,
                trigger: 'cyclic' as const,
                interval: 10,
                priority: 1,
                programs: [source.name],
            })),
        });

        expect(compileMultiTaskProject(config(8), sources.slice(0, 8), { memoryProfile: profile }).debugMap.memoryLayout)
            .toMatchObject({ workSize: 2048, retainSize: 1024 });
        try {
            compileMultiTaskProject(config(9), sources, { memoryProfile: profile });
            throw new Error('expected WORK bucket admission failure');
        } catch (error) {
            expect(error).toMatchObject({ phase: 'codegen', sourceRef: 'src/Program8.st' });
            expect(error).toHaveProperty('detail', 'WORK task buckets exceed the target memory profile');
        }
    });

    it('rejects malformed target memory profiles before code generation', () => {
        const invalidProfiles = [
            { workSize: Number.NaN, retainSize: 1, codeSizeMax: 1 },
            { workSize: Number.POSITIVE_INFINITY, retainSize: 1, codeSizeMax: 1 },
            { workSize: 1.5, retainSize: 1, codeSizeMax: 1 },
            { workSize: 0, retainSize: 1, codeSizeMax: 1 },
            { workSize: -1, retainSize: 1, codeSizeMax: 1 },
            { workSize: 0x2001, retainSize: 1, codeSizeMax: 1 },
            { workSize: 1, retainSize: 0x1001, codeSizeMax: 1 },
            { workSize: 1, retainSize: 1, codeSizeMax: 0xB001 },
        ];

        for (const memoryProfile of invalidProfiles) {
            expect(() => compileToBinary(source, { memoryProfile })).toThrow(/Invalid target memory profile/);
        }

        expect(() => compileMultiTaskProject(
            { name: 'InvalidProfile', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval: 10, programs: ['Main'] }] },
            [{ name: 'Main', sourceRef: 'src/Main.st', content: source }],
            { memoryProfile: invalidProfiles[0] },
        )).toThrow(/Invalid target memory profile/);
    });

    it('reserves the init flag, validates direct WORK widths, and keeps declaration provenance', () => {
        expect(() => compileToBinary(programWithBytes(255), {
            memoryProfile: { workSize: 256, retainSize: 1, codeSizeMax: 0xB000 },
        })).not.toThrow();
        expect(() => compileToBinary(programWithBytes(256), {
            memoryProfile: { workSize: 256, retainSize: 1, codeSizeMax: 0xB000 },
        })).toThrow(/initialization flag/);

        expect(() => compileToBinary(`PROGRAM Direct\nVAR\nValue AT %MD63 : DINT;\nEND_VAR\nEND_PROGRAM`, {
            memoryProfile: { workSize: 256, retainSize: 1, codeSizeMax: 0xB000 },
            workMemorySize: 256,
            initFlagAddress: 0x2000,
        })).not.toThrow();

        const directOverflow = () => compileMultiTaskProject(
            { name: 'Direct', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval: 10, programs: ['Main'] }] },
            [{ name: 'Main', sourceRef: 'src/Direct.st', content: 'PROGRAM Direct\nVAR\nValue AT %MD64 : DINT;\nEND_VAR\nEND_PROGRAM' }],
            { memoryProfile: { workSize: 256, retainSize: 1, codeSizeMax: 0xB000 } },
        );
        expect(directOverflow).toThrow(/WORK allocation/);
        try {
            directOverflow();
        } catch (error) {
            expect(error).toMatchObject({ line: 3, sourceRef: 'src/Direct.st' });
        }

        expect(() => compileToBinary(`PROGRAM Init\nVAR\nFlag AT %MB0 : BOOL;\nEND_VAR\nEND_PROGRAM`, {
            memoryProfile: { workSize: 8, retainSize: 1, codeSizeMax: 0xB000 },
            workMemorySize: 8,
            initFlagAddress: 0x2000,
        })).toThrow(/initialization flag/);
        expect(() => compileToBinary('PROGRAM Init VAR Flag : BOOL; END_VAR END_PROGRAM', {
            memoryProfile: { workSize: 8, retainSize: 1, codeSizeMax: 0xB000 },
            workMemorySize: 8,
            initFlagAddress: 0x2000,
        })).toThrow(/initialization flag/);
        expect(() => compileToBinary(source, {
            memoryProfile: { workSize: 8, retainSize: 1, codeSizeMax: 0xB000 },
            workMemorySize: 8,
            initFlagAddress: 0x2008,
        })).toThrow(/initFlagAddress/);
        for (const options of [
            { workMemoryBase: Number.NaN },
            { workMemorySize: 1.5 },
            { initFlagAddress: 0x2000 + 0.5 },
        ]) {
            expect(() => compileToBinary(source, {
                memoryProfile: { workSize: 8, retainSize: 1, codeSizeMax: 0xB000 },
                ...options,
            })).toThrow(/Invalid (WORK region options|initFlagAddress)/);
        }
    });

    it('admits direct I/Q locations only within their full VM regions', () => {
        expect(() => compileToBinary('PROGRAM Input VAR Value AT %IW2047 : INT; END_VAR END_PROGRAM')).not.toThrow();
        expect(() => compileToBinary('PROGRAM Output VAR Value AT %QW2047 : INT; END_VAR END_PROGRAM')).not.toThrow();
        expect(() => compileToBinary('PROGRAM InputOverflow VAR Value AT %IW2048 : INT; END_VAR END_PROGRAM')).toThrow(/IPI allocation/);
        expect(() => compileToBinary('PROGRAM OutputOverflow VAR Value AT %QW2048 : INT; END_VAR END_PROGRAM')).toThrow(/OPI allocation/);
        expect(() => compileToBinary('PROGRAM BadBit VAR Value AT %IX0.8 : BOOL; END_VAR END_PROGRAM')).toThrow(/Invalid located bit address/);

        const locatedInputOverflow = () => compileMultiTaskProject(
            { name: 'LocatedInput', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval: 10, programs: ['Main'] }] },
            [{ name: 'Main', sourceRef: 'src/LocatedInput.st', content: 'PROGRAM LocatedInput\nVAR\nValue AT %IW2048 : INT;\nEND_VAR\nEND_PROGRAM' }],
            { memoryProfile: { workSize: 256, retainSize: 1, codeSizeMax: 0xB000 } },
        );
        expect(locatedInputOverflow).toThrow(/IPI allocation/);
        try {
            locatedInputOverflow();
        } catch (error) {
            expect(error).toMatchObject({ line: 3, sourceRef: 'src/LocatedInput.st' });
        }
    });

    it('rejects non-BOOL values at bit-addressed locations', () => {
        const compile = () => compileToBinary('PROGRAM InvalidBit\nVAR_OUTPUT\nValue AT %QX0.0 : INT;\nEND_VAR\nEND_PROGRAM');
        expect(compile).toThrow(CompilerError);
        try {
            compile();
        } catch (error) {
            expect(error).toMatchObject({ phase: 'codegen', line: 3 });
        }
    });

    it('rejects automatic WORK storage overlapping direct %M while preserving direct aliases', () => {
        expect(() => compileToBinary('PROGRAM Overlap\nVAR\nAuto : DINT;\nLocated AT %MD0 : DINT;\nEND_VAR\nEND_PROGRAM'))
            .toThrow(/automatic WORK symbol collides with located %M symbol/);
        expect(() => compileToBinary('PROGRAM Adjacent\nVAR\nAuto : DINT;\nLocated AT %MD1 : DINT;\nEND_VAR\nEND_PROGRAM')).not.toThrow();
        expect(() => compileToBinary('PROGRAM Alias\nVAR\nFirst AT %MD0 : DINT;\nSecond AT %MD0 : DINT;\nEND_VAR\nEND_PROGRAM')).not.toThrow();

        const overlap = () => compileMultiTaskProject(
            { name: 'Overlap', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval: 10, programs: ['Main'] }] },
            [{ name: 'Main', sourceRef: 'src/Overlap.st', content: 'PROGRAM Overlap\nVAR\nAuto : DINT;\nLocated AT %MD0 : DINT;\nEND_VAR\nEND_PROGRAM' }],
            { memoryProfile: { workSize: 256, retainSize: 1, codeSizeMax: 0xB000 } },
        );
        expect(overlap).toThrow(/automatic WORK symbol collides with located %M symbol/);
        try {
            overlap();
        } catch (error) {
            expect(error).toMatchObject({ line: 4, sourceRef: 'src/Overlap.st' });
        }
    });

    it('keeps pooled STRING and WSTRING storage inside WORK and away from direct locations', () => {
        const profile = { workSize: 96, retainSize: 1, codeSizeMax: 0xB000 };
        expect(() => compileToBinary(`PROGRAM Strings\nVAR\nSink : STRING;\nEND_VAR\nSink := 'abc';\nEND_PROGRAM`, { memoryProfile: profile })).not.toThrow();
        expect(() => compileToBinary(`PROGRAM WStrings\nVAR\nSink : STRING;\nEND_VAR\nSink := "x";\nEND_PROGRAM`, { memoryProfile: profile })).not.toThrow();
        expect(() => compileToBinary(`PROGRAM Collision\nVAR\nSink : STRING;\nLocated AT %MB86 : BOOL;\nEND_VAR\nSink := 'abc';\nEND_PROGRAM`, { memoryProfile: profile })).toThrow(/string literal pool collides with WORK symbol/);
    });

    it('keeps sub-bucket WORK profiles deterministic and preserves the first overflowing source', () => {
        const config = (programs: string[]) => ({
            name: 'SmallBuckets', version: '1.0.0', tasks: programs.map((name) => ({ name, trigger: 'cyclic' as const, interval: 10, programs: [name] })),
        });
        const sources = ['First', 'Second'].map((name) => ({ name, sourceRef: `src/${name}.st`, content: `PROGRAM ${name} END_PROGRAM` }));
        const subBucket = () => compileMultiTaskProject(config(['First']), sources.slice(0, 1), {
            memoryProfile: { workSize: 255, retainSize: 1, codeSizeMax: 0xB000 },
        });
        expect(subBucket).toThrow(/WORK task buckets/);
        try {
            subBucket();
        } catch (error) {
            expect(error).toMatchObject({ sourceRef: 'src/First.st' });
        }
        expect(() => compileMultiTaskProject(config(['First', 'Second']), sources, {
            memoryProfile: { workSize: 511, retainSize: 1, codeSizeMax: 0xB000 },
        })).toThrow(/WORK task buckets/);
        try {
            compileMultiTaskProject(config(['First', 'Second']), sources, {
                memoryProfile: { workSize: 511, retainSize: 1, codeSizeMax: 0xB000 },
            });
        } catch (error) {
            expect(error).toMatchObject({ sourceRef: 'src/Second.st' });
        }
    });
});

describe('RETAIN declarations', () => {
    const config = {
        name: 'RetainReject',
        version: '1.0.0',
        tasks: [{ name: 'MainTask', trigger: 'cyclic' as const, interval: 10, priority: 1, programs: ['Main'] }],
    };

    for (const [label, content] of [
        ['VAR RETAIN', 'PROGRAM Main\nVAR RETAIN\nState : BOOL;\nEND_VAR\nEND_PROGRAM'],
        ['VAR_GLOBAL RETAIN', 'VAR_GLOBAL RETAIN\nState : BOOL;\nEND_VAR\nPROGRAM Main\nEND_PROGRAM'],
    ] as const) {
        it(`rejects ${label} as an unsupported parser feature with source provenance`, () => {
            try {
                compileMultiTaskProject(config, [{ name: 'Main', sourceRef: `src/${label.replaceAll(' ', '_')}.st`, content }]);
                throw new Error('expected RETAIN declaration rejection');
            } catch (error) {
                expect(error).toBeInstanceOf(CompilerError);
                expect(error).toMatchObject({
                    phase: 'parser',
                    line: label === 'VAR RETAIN' ? 2 : 1,
                    column: label === 'VAR RETAIN' ? 5 : 12,
                    sourceRef: `src/${label.replaceAll(' ', '_')}.st`,
                });
                expect(error).toHaveProperty('detail', `Compilation of 'Main' failed: RETAIN declarations are not supported`);
            }
        });
    }
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

describe('Language workflow parity baseline', () => {
    it('compiles the canonical v1.5 ST workflow baseline', () => {
        const source = `
            PROGRAM WorkflowBaseline
            VAR
                Start : BOOL := TRUE;
                Count : INT := 0;
                Timer : TON;
                Done : BOOL := FALSE;
            END_VAR
            Timer(IN := Start, PT := T#500ms);
            IF Timer.Q THEN
                Count := Count + 1;
                Done := TRUE;
            END_IF;
            END_PROGRAM
        `;

        const result = compileToBinary(source);

        expect(result.bytecode.length).toBeGreaterThan(0);
        expect(result.zplcFile.length).toBeGreaterThan(result.bytecode.length);
    });
});

describe('Canonical PROGRAM admission', () => {
    const multiplePrograms = 'PROGRAM First END_PROGRAM\nPROGRAM Second END_PROGRAM';

    it('rejects every high-level single-source compiler at the second PROGRAM', () => {
        for (const compile of [
            () => compileST(multiplePrograms),
            () => compileToBinary(multiplePrograms),
            () => compileSingleFileWithTask(multiplePrograms, { sourceRef: 'src/Main.st' }),
        ]) {
            expect(compile).toThrow(CompilerError);
            try {
                compile();
            } catch (error) {
                const diagnostic = error as CompilerError;
                expect(diagnostic.phase).toBe('codegen');
                expect(diagnostic.line).toBe(2);
                expect(diagnostic.column).toBe(1);
                expect(diagnostic.detail).toBe('Exactly one PROGRAM is required per source unit');
            }
        }
    });

    it('rejects invalid task program cardinality before source compilation', () => {
        for (const programs of [[], ['First', 'Second']]) {
            expect(() => compileMultiTaskProject(
                { name: 'InvalidTaskPrograms', version: '1.0.0', tasks: [{ name: 'MainTask', trigger: 'cyclic', programs }] },
                [{ name: 'First', content: 'PROGRAM First END_PROGRAM' }],
            )).toThrow(CompilerError);

            try {
                compileMultiTaskProject(
                    { name: 'InvalidTaskPrograms', version: '1.0.0', tasks: [{ name: 'MainTask', trigger: 'cyclic', programs }] },
                    [{ name: 'First', content: 'PROGRAM First END_PROGRAM' }],
                );
            } catch (error) {
                const diagnostic = error as CompilerError;
                expect(diagnostic.phase).toBe('codegen');
                expect(diagnostic.line).toBe(0);
                expect(diagnostic.column).toBe(0);
                expect(diagnostic.sourceRef).toBeUndefined();
                expect(diagnostic.detail).toBe("Task 'MainTask' must reference exactly one PROGRAM");
            }
        }
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

    it('compiles WATCHDOG_RESET statement as one compatibility NOP', () => {
        const result = compileToBinary('PROGRAM Main WATCHDOG_RESET(); END_PROGRAM');
        const asm = result.assembly;

        expect(asm).not.toContain('; ERROR:');
        expect(asm.split('\n').filter(line => line.trim() === 'NOP')).toHaveLength(1);
        expect(result.bytecode.length).toBeGreaterThan(0);

        const lowercase = compileToBinary('PROGRAM Main watchdog_reset(); END_PROGRAM').assembly;
        expect(lowercase).not.toContain('; ERROR:');
        expect(lowercase.split('\n').filter(line => line.trim() === 'NOP')).toHaveLength(1);

        expect(() => compileToBinary('PROGRAM Main WATCHDOG_RESET(unused := 1); END_PROGRAM'))
            .toThrow('WATCHDOG_RESET expects no parameters');
        expect(() => compileToBinary('PROGRAM Main VAR x : INT; END_VAR x := WATCHDOG_RESET(); END_PROGRAM'))
            .toThrow('WATCHDOG_RESET is statement-only');

        const collidingInstance = compileToBinary(`
            PROGRAM Main
            VAR
                WATCHDOG_RESET : TON;
            END_VAR
            WATCHDOG_RESET(IN := TRUE, PT := T#1s);
            END_PROGRAM
        `).assembly;
        expect(collidingInstance).toContain('TON Timer Logic');

        const collidingFunction = compileToBinary(`
            FUNCTION WATCHDOG_RESET : INT
            VAR_INPUT
                value : INT;
            END_VAR
            WATCHDOG_RESET := value;
            END_FUNCTION

            PROGRAM Main
            VAR
                result : INT;
            END_VAR
            result := WATCHDOG_RESET(1);
            END_PROGRAM
        `).assembly;
        expect(collidingFunction).toContain('CALL func_WATCHDOG_RESET');
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
    it('keeps ST diagnostics attached to the physical source reference', () => {
        const config = {
            name: 'DiagnosticProvenance', version: '1.0.0', tasks: [
                { name: 'MotorTask', trigger: 'cyclic' as const, interval: 10, priority: 1, programs: ['MotorTask'] },
            ],
        };

        const lexerFailure = () => compileMultiTaskProject(config, [{
            name: 'MotorTask',
            sourceRef: 'src/Motor.st',
            content: 'PROGRAM Motor\n@\nEND_PROGRAM',
        }]);
        expect(lexerFailure).toThrow(CompilerError);
        try {
            lexerFailure();
        } catch (error) {
            const diagnostic = error as CompilerError;
            expect(diagnostic.phase).toBe('lexer');
            expect(diagnostic.line).toBe(2);
            expect(diagnostic.column).toBe(1);
            expect(diagnostic.sourceRef).toBe('src/Motor.st');
        }

        const parserFailure = () => compileMultiTaskProject(config, [{
            name: 'MotorTask',
            sourceRef: 'src/Motor.st',
            content: 'PROGRAM Motor\nVAR\n  Start BOOL;\nEND_VAR\nEND_PROGRAM',
        }]);
        expect(parserFailure).toThrow(CompilerError);
        try {
            parserFailure();
        } catch (error) {
            const diagnostic = error as CompilerError;
            expect(diagnostic.phase).toBe('parser');
            expect(diagnostic.line).toBe(3);
            expect(diagnostic.column).toBe(9);
            expect(diagnostic.sourceRef).toBe('src/Motor.st');
        }
    });

    it('keeps unmappable code generation diagnostics at 0:0', () => {
        expect(() => compileMultiTaskProject(
            { name: 'GlobalDiagnostic', version: '1.0.0', tasks: [{ name: 'MainTask', trigger: 'cyclic', interval: 10, programs: ['Main'] }] },
            [{ name: 'Main', sourceRef: 'src/Main.st', content: 'PROGRAM Main\nWATCHDOG_RESET(unused := 1);\nEND_PROGRAM' }],
        )).toThrow(CompilerError);

        try {
            compileMultiTaskProject(
                { name: 'GlobalDiagnostic', version: '1.0.0', tasks: [{ name: 'MainTask', trigger: 'cyclic', interval: 10, programs: ['Main'] }] },
                [{ name: 'Main', sourceRef: 'src/Main.st', content: 'PROGRAM Main\nWATCHDOG_RESET(unused := 1);\nEND_PROGRAM' }],
            );
        } catch (error) {
            const diagnostic = error as CompilerError;
            expect(diagnostic.phase).toBe('codegen');
            expect(diagnostic.line).toBe(0);
            expect(diagnostic.column).toBe(0);
            expect(diagnostic.sourceRef).toBe('src/Main.st');
        }
    });

    it('does not let source provenance alter compiled output', () => {
        const config = { name: 'ProvenanceStable', version: '1.0.0', tasks: [{ name: 'MainTask', trigger: 'cyclic' as const, interval: 10, programs: ['Main'] }] };
        const content = 'PROGRAM Main VAR Value : BOOL; END_VAR Value := TRUE; END_PROGRAM';
        const withoutSourceRef = compileMultiTaskProject(config, [{ name: 'Main', content }]);
        const withSourceRef = compileMultiTaskProject(config, [{ name: 'Main', sourceRef: 'src/Main.st', content }]);

        expect(withSourceRef.bytecode).toEqual(withoutSourceRef.bytecode);
        expect(withSourceRef.zplcFile).toEqual(withoutSourceRef.zplcFile);
        expect(withSourceRef.debugMap.pou.Main?.sourceRef).toBe('src/Main.st');
    });

    it('publishes absolute, independent debug PCs for every multi-task POU', () => {
        const fastSource = { name: 'Fast.st', language: 'ST' as const, content: 'PROGRAM Fast\nVAR x : BOOL; END_VAR\nx := TRUE;\nEND_PROGRAM' };
        const slowSource = { name: 'Slow.st', language: 'ST' as const, content: 'PROGRAM Slow\nVAR y : BOOL; END_VAR\ny := FALSE;\nEND_PROGRAM' };
        const result = compileMultiTaskProject(
            {
                name: 'DebugOffsets', version: '1.0.0', tasks: [
                    { name: 'FastTask', trigger: 'cyclic', interval: 10, priority: 0, programs: ['Fast.st'] },
                    { name: 'SlowTask', trigger: 'cyclic', interval: 10, priority: 1, programs: ['Slow.st'] },
                ],
            },
            [fastSource, slowSource],
        );
        const fastOnly = compileMultiTaskProject(
            { name: 'FastOnly', version: '1.0.0', tasks: [{ name: 'FastTask', trigger: 'cyclic', interval: 10, priority: 0, programs: ['Fast.st'] }] },
            [fastSource],
        );
        const slowOnly = compileMultiTaskProject(
            { name: 'SlowOnly', version: '1.0.0', tasks: [{ name: 'SlowTask', trigger: 'cyclic', interval: 10, priority: 1, programs: ['Slow.st'] }] },
            [slowSource],
        );
        const fast = result.debugMap.pou.Fast!;
        const slow = result.debugMap.pou.Slow!;
        const slowBase = result.programDetails[0]!.size;
        const slowLine = slow.sourceMap[0]!.line;
        const slowPc = slow.sourceMap[0]!.pc;
        const localSlowPc = slowOnly.debugMap.pou.Slow!.sourceMap[0]!.pc;

        expect(slowPc).toBe(slowBase + localSlowPc);
        expect(slowPc).toBeGreaterThanOrEqual(slowBase);
        expect(slowPc).toBeLessThan(slowBase + result.programDetails[1]!.size);
        expect(slow.breakpoints).not.toHaveLength(0);
        for (const breakpoint of slow.breakpoints) {
            expect(breakpoint.pc).toBeGreaterThanOrEqual(slowBase);
            expect(breakpoint.pc).toBeLessThan(slowBase + result.programDetails[1]!.size);
        }
        expect(fast.sourceMap).toEqual(fastOnly.debugMap.pou.Fast!.sourceMap);
        expect(findSourceLine(result.debugMap, slowPc)).toEqual({ pou: 'Slow', line: slowLine });
        expect(findPC(result.debugMap, 'Slow', slowLine)).toBe(slowPc);
        expect(slow.entryPoint).toBe(result.tasks[1]!.entryPoint);
        expect(slow.entryPoint).toBe(result.programDetails[1]!.entryPoint);
        expect(slowOnly.debugMap.pou.Slow!.entryPoint).toBe(slowOnly.tasks[0]!.entryPoint);
        expect(slowOnly.debugMap.pou.Slow!.entryPoint).toBe(slowOnly.programDetails[0]!.entryPoint);
        expect(fast).not.toBe(slow);
        expect(fast.sourceMap).not.toBe(slow.sourceMap);
        expect(fast.breakpoints).not.toBe(slow.breakpoints);
        expect(fast.vars).not.toBe(slow.vars);
    });

    it('keeps task source references separate from declared PROGRAM debug identities', () => {
        const config: ZPLCProjectConfig = {
            name: 'SourceIdentity',
            version: '1.0.0',
            tasks: [{ name: 'MotorTask', trigger: 'cyclic', interval: 10, priority: 1, programs: ['Motor.st'] }],
        };
        const source = 'PROGRAM Motor VAR_INPUT Start AT %I0.0 : BOOL; END_VAR VAR_OUTPUT Forward AT %Q0.0 : BOOL; END_VAR Forward := Start; END_PROGRAM';

        const physicalRef = compileMultiTaskProject(config, [{ name: 'Motor.st', content: source, language: 'ST' }]);
        const semanticRef = compileMultiTaskProject(
            { ...config, tasks: [{ ...config.tasks[0], programs: ['Motor'] }] },
            [{ name: 'Motor', content: source, language: 'ST' }],
        );

        expect(physicalRef.programDetails[0]?.name).toBe('Motor.st');
        expect(physicalRef.tasks[0]?.entryPoint).toBe(physicalRef.programDetails[0]?.entryPoint);
        expect(Object.keys(physicalRef.debugMap.pou)).toEqual(['Motor']);
        expect(physicalRef.debugMap.pou.Motor?.sourceRef).toBe('Motor.st');
        expect(physicalRef.zplcFile).toEqual(semanticRef.zplcFile);
    });

    it('rejects duplicate declared PROGRAM names case-insensitively', () => {
        const config: ZPLCProjectConfig = {
            name: 'DuplicateProgram',
            version: '1.0.0',
            tasks: [
                { name: 'FirstTask', trigger: 'cyclic', interval: 10, priority: 1, programs: ['Motor.st'] },
                { name: 'SecondTask', trigger: 'cyclic', interval: 10, priority: 1, programs: ['Backup.st'] },
            ],
        };

        expect(() => compileMultiTaskProject(config, [
            { name: 'Motor.st', content: 'PROGRAM Motor END_PROGRAM', language: 'ST' },
            { name: 'Backup.st', content: 'PROGRAM motor END_PROGRAM', language: 'ST' },
        ])).toThrow(/Duplicate PROGRAM name 'motor'/);
    });

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
        // Entry point is after bootstrap JMP _start (3 bytes)
        expect(result.tasks[0].entryPoint).toBe(3);
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

        // Check task 1 (Fast) - entry point after bootstrap JMP (3 bytes)
        expect(result.tasks[0].priority).toBe(0);
        expect(result.tasks[0].intervalUs).toBe(10000);
        expect(result.tasks[0].entryPoint).toBe(3);

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

    describe('physical output ownership', () => {
        const configFor = (...programs: string[]): ZPLCProjectConfig => ({
            name: 'OutputOwnership',
            version: '1.0.0',
            tasks: programs.map((program, index) => ({
                name: `${program}Task`,
                trigger: 'cyclic' as const,
                interval: 10,
                priority: index,
                programs: [program],
            })),
        });

        const sourceFor = (program: string, declaration: string, sourceRef = `src/${program}.st`): ProgramSource => ({
            name: program,
            sourceRef,
            content: `PROGRAM ${program}\nVAR_OUTPUT\n    ${declaration}\nEND_VAR\nEND_PROGRAM`,
        });

        it.each([
            ['the same output bit', 'OutA AT %Q0.0 : BOOL;', 'OutB AT %Q0.0 : BOOL;'],
            ['a bit covered by a word', 'OutBit AT %Q0.0 : BOOL;', 'OutWord AT %QW0 : WORD;'],
            ['partially overlapping byte ranges', 'OutWord AT %QW1 : WORD;', 'OutDword AT %QD0 : DWORD;'],
        ])('rejects %s across PROGRAMs', (_label, firstDeclaration, secondDeclaration) => {
            const compile = () => compileMultiTaskProject(configFor('First', 'Second'), [
                sourceFor('First', firstDeclaration, 'src/First.st'),
                sourceFor('Second', secondDeclaration, 'src/Second.st'),
            ]);

            expect(compile).toThrow(CompilerError);
            try {
                compile();
            } catch (error) {
                const diagnostic = error as CompilerError;
                expect(diagnostic).toMatchObject({
                    phase: 'codegen',
                    sourceRef: 'src/Second.st',
                    line: 3,
                });
                expect(diagnostic.detail).toContain('First.Out');
                expect(diagnostic.detail).toContain('Second.Out');
                expect(diagnostic.detail).toContain('src/First.st');
                expect(diagnostic.detail).toContain('src/Second.st');
            }
        });

        it('allows adjacent non-overlapping physical outputs', () => {
            expect(() => compileMultiTaskProject(configFor('First', 'Second'), [
                sourceFor('First', 'OutA AT %QW0 : WORD;'),
                sourceFor('Second', 'OutB AT %QD2 : DWORD;'),
            ])).not.toThrow();
        });

        it('keeps explicit aliases within one PROGRAM compatible', () => {
            expect(() => compileMultiTaskProject(configFor('Aliases'), [{
                name: 'Aliases',
                sourceRef: 'src/Aliases.st',
                content: 'PROGRAM Aliases\nVAR_OUTPUT\n    First AT %Q0.0 : BOOL;\n    Second AT %Q0.0 : BOOL;\nEND_VAR\nEND_PROGRAM',
            }])).not.toThrow();
        });

        it('rejects a non-BOOL bit address before it can overlap another PROGRAM', () => {
            const compile = () => compileMultiTaskProject(configFor('Wide', 'Bit'), [
                sourceFor('Wide', 'WideOutput AT %QX0.0 : INT;', 'src/Wide.st'),
                sourceFor('Bit', 'BitOutput AT %QX0.1 : BOOL;', 'src/Bit.st'),
            ]);

            expect(compile).toThrow(CompilerError);
            try {
                compile();
            } catch (error) {
                expect(error).toMatchObject({
                    phase: 'codegen',
                    sourceRef: 'src/Wide.st',
                    line: 3,
                });
            }
        });
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

    it('rejects more than the portable v1 task maximum before compiling sources', () => {
        const config: ZPLCProjectConfig = {
            name: 'TooManyTasks',
            version: '1.0.0',
            tasks: Array.from({ length: 17 }, (_, id) => ({
                name: `Task${id}`,
                trigger: 'cyclic' as const,
                interval: 10,
                programs: ['Main'],
            })),
        };
        const source: ProgramSource[] = [{ name: 'Main', content: 'not valid ST', language: 'ST' }];

        const compile = () => compileMultiTaskProject(config, source);

        expect(compile).toThrow(CompilerError);
        expect(compile).toThrow(/at most 16 tasks/i);
        try {
            compile();
        } catch (error) {
            expect(error).toMatchObject({
                phase: 'codegen',
                line: 0,
                column: 0,
                sourceRef: undefined,
            });
        }
    });

    it('accepts exactly the portable v1 task maximum', () => {
        const config: ZPLCProjectConfig = {
            name: 'MaximumTasks',
            version: '1.0.0',
            tasks: Array.from({ length: 16 }, (_, id) => ({
                name: `Task${id}`,
                trigger: 'cyclic' as const,
                interval: 10,
                programs: ['Main'],
            })),
        };
        const source: ProgramSource[] = [{ name: 'Main', content: 'PROGRAM Main END_PROGRAM', language: 'ST' }];

        expect(compileMultiTaskProject(config, source).tasks).toHaveLength(16);
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

        const explicit = compileMultiTaskProject({
            ...config,
            tasks: [{ name: 'Task1', trigger: 'cyclic', interval: 10, priority: 1, programs: ['Prog1'] }],
        }, sources);
        expect(result.zplcFile).toEqual(explicit.zplcFile);
    });

    it('validates task metadata before parsing program sources', () => {
        const source = [{
            name: 'Main',
            sourceRef: 'src/Main.st',
            content: 'PROGRAM Main END_PROGRAM',
        }];
        const config = (task: Record<string, unknown>) => ({
            name: 'TaskMetadata',
            version: '1.0.0',
            tasks: [{ name: 'MainTask', trigger: 'cyclic', programs: ['Main'], ...task }],
        });

        for (const interval of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 3_600_001]) {
            expect(() => compileMultiTaskProject(config({ interval }) as any, source)).toThrow(/MainTask.*interval/);
        }
        for (const priority of [-1, 1.5, 256, Number.NaN]) {
            expect(() => compileMultiTaskProject(config({ priority }) as any, source)).toThrow(/MainTask.*priority/);
        }
        expect(() => compileMultiTaskProject(config({ trigger: 'invalid' }) as any, source)).toThrow(/MainTask.*trigger/);

        for (const interval of [1, 3_600_000]) {
            expect(compileMultiTaskProject(config({ interval, priority: 0 }) as any, source).tasks[0])
                .toMatchObject({ intervalUs: interval * 1000, priority: 0 });
        }
        expect(compileMultiTaskProject(config({ priority: 255 }) as any, source).tasks[0]?.priority).toBe(255);
    });

    it('reports task configuration failures as global codegen diagnostics', () => {
        const compile = () => compileMultiTaskProject({
            name: 'TaskMetadata',
            version: '1.0.0',
            tasks: [{ name: 'MainTask', trigger: 'cyclic', interval: 0, programs: ['Main'] }],
        } as any, [{ name: 'Main', sourceRef: 'src/Main.st', content: 'not parsed' }]);

        expect(compile).toThrow(CompilerError);
        try {
            compile();
        } catch (error) {
            expect(error).toMatchObject({
                phase: 'codegen',
                line: 0,
                column: 0,
                sourceRef: undefined,
            });
        }
    });
});

// ============================================================================
// STRING Type Tests
// ============================================================================

describe('STRING Type', () => {
    describe('Lexer', () => {
        it('tokenizes STRING keyword', () => {
            const tokens = tokenize('VAR s : STRING; END_VAR');
            
            expect(tokens.some(t => t.type === TokenType.STRING)).toBe(true);
        });

        it('tokenizes string literals with single quotes', () => {
            const tokens = tokenize("s := 'Hello World';");
            
            const stringLiteral = tokens.find(t => t.type === TokenType.STRING_LITERAL);
            expect(stringLiteral).toBeDefined();
            expect(stringLiteral?.value).toBe('Hello World');
        });

        it('tokenizes empty string literal', () => {
            const tokens = tokenize("s := '';");
            
            const stringLiteral = tokens.find(t => t.type === TokenType.STRING_LITERAL);
            expect(stringLiteral).toBeDefined();
            expect(stringLiteral?.value).toBe('');
        });

        it('tokenizes string with escaped quotes', () => {
            const tokens = tokenize("s := 'It''s a test';");
            
            const stringLiteral = tokens.find(t => t.type === TokenType.STRING_LITERAL);
            expect(stringLiteral).toBeDefined();
            expect(stringLiteral?.value).toBe("It's a test");
        });
    });

    describe('Parser', () => {
        it('parses STRING variable declaration', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    message : STRING;
                END_VAR
                END_PROGRAM
            `);

            const program = ast.programs[0];
            const decl = program.varBlocks[0].variables[0];
            expect(decl.name).toBe('message');
            expect(decl.dataType).toBe('STRING');
        });

        it('parses STRING with initial value', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    greeting : STRING := 'Hello';
                END_VAR
                END_PROGRAM
            `);

            const program = ast.programs[0];
            const decl = program.varBlocks[0].variables[0];
            expect(decl.name).toBe('greeting');
            expect(decl.dataType).toBe('STRING');
            expect(decl.initialValue).not.toBeNull();
            expect(decl.initialValue?.kind).toBe('StringLiteral');
            if (decl.initialValue?.kind === 'StringLiteral') {
                expect(decl.initialValue.value).toBe('Hello');
            }
        });

        it('parses string literal in assignment', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    s : STRING;
                END_VAR
                s := 'Test message';
                END_PROGRAM
            `);

            const program = ast.programs[0];
            const stmt = program.statements[0];
            expect(stmt.kind).toBe('Assignment');
            if (stmt.kind === 'Assignment') {
                expect(stmt.value.kind).toBe('StringLiteral');
            }
        });
    });

    describe('Symbol Table', () => {
        it('allocates 85 bytes for STRING type', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    msg : STRING;
                END_VAR
                END_PROGRAM
            `);

            const symbols = buildSymbolTable(ast.programs[0]);
            const sym = symbols.get('msg');
            expect(sym).toBeDefined();
            expect(sym?.dataType).toBe('STRING');
            expect(sym?.size).toBe(85); // 4 header + 80 chars + 1 null
        });
    });

    describe('Code Generation', () => {
        it('generates string literal initialization code', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    s : STRING;
                END_VAR
                s := 'Hi';
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            
            // Should have string literal in memory map
            expect(asm).toContain('String Literals');
            expect(asm).toContain("'Hi'");
            
            // Should initialize the literal (store length, capacity, chars)
            expect(asm).toContain('STORE16'); // Length
            expect(asm).toContain('STORE8');  // Characters
        });

        it('emits PUSH address for STRING identifiers', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    s1 : STRING;
                    s2 : STRING;
                END_VAR
                s2 := s1;
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            
            // STRING identifiers should push address, not LOAD value
            expect(asm).toContain('PUSH16 0x2000');  // &s1 address
        });

        it('generates STRCMP for string equality', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    s : STRING;
                    result : BOOL;
                END_VAR
                result := s = 'test';
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            
            // Should use STRCMP + EQ for string comparison
            expect(asm).toContain('String comparison');
            expect(asm).toContain('STRCMP');
        });

        it('generates STRCMP + NE for string inequality', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    s : STRING;
                    result : BOOL;
                END_VAR
                result := s <> 'test';
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            
            expect(asm).toContain('STRCMP');
            expect(asm).toContain('NE');
        });
    });

    describe('String Functions', () => {
        it('compiles LEN function call', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    s : STRING;
                    len : INT;
                END_VAR
                len := LEN(s);
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            expect(asm).toContain('LEN');
            expect(asm).toContain('STRLEN');
        });

        it('compiles CONCAT function call in expression', () => {
            // CONCAT is a function, not a FB, so it's used in expressions
            const ast = parse(`
                PROGRAM Test
                VAR
                    s1 : STRING;
                    s2 : STRING;
                    result : STRING;
                END_VAR
                result := CONCAT(s1, s2);
                END_PROGRAM
            `);

            const program = ast.programs[0];
            expect(program.statements.length).toBe(1);
            
            const asm = generate(program);
            expect(asm).toContain('CONCAT');
            expect(asm).toContain('STRCAT');
        });

        it('compiles string comparison with EQ_STRING', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    s1 : STRING;
                    s2 : STRING;
                    equal : BOOL;
                END_VAR
                equal := EQ_STRING(s1, s2);
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            expect(asm).toContain('EQ_STRING');
            expect(asm).toContain('STRCMP');
        });
    });
});

// ============================================================================
// Type Inference Tests
// ============================================================================

describe('Type Inference', () => {
    describe('Float Arithmetic', () => {
        it('uses ADDF for REAL + REAL', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    x : REAL;
                    y : REAL;
                    z : REAL;
                END_VAR
                z := x + y;
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            expect(asm).toContain('ADDF');
            expect(asm).not.toContain('    ADD\n');  // Should not have integer ADD
        });

        it('uses SUBF for REAL - REAL', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    x : REAL;
                    y : REAL;
                    z : REAL;
                END_VAR
                z := x - y;
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            expect(asm).toContain('SUBF');
        });

        it('uses MULF for REAL * REAL', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    x : REAL;
                    y : REAL;
                    z : REAL;
                END_VAR
                z := x * y;
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            expect(asm).toContain('MULF');
        });

        it('uses DIVF for REAL / REAL', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    x : REAL;
                    y : REAL;
                    z : REAL;
                END_VAR
                z := x / y;
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            expect(asm).toContain('DIVF');
        });

        it('promotes INT + REAL to float arithmetic', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    i : INT;
                    r : REAL;
                    result : REAL;
                END_VAR
                result := i + r;
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            expect(asm).toContain('ADDF');  // Type promotion: INT + REAL uses ADDF
        });

        it('promotes REAL + INT to float arithmetic', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    i : INT;
                    r : REAL;
                    result : REAL;
                END_VAR
                result := r + i;
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            expect(asm).toContain('ADDF');
        });

        it('uses ADD for INT + INT', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    a : INT;
                    b : INT;
                    c : INT;
                END_VAR
                c := a + b;
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            expect(asm).toContain('    ADD');
            expect(asm).not.toContain('ADDF');
        });

        it('handles complex float expressions', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    a : REAL;
                    b : REAL;
                    c : REAL;
                    result : REAL;
                END_VAR
                result := (a + b) * c;
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            expect(asm).toContain('ADDF');
            expect(asm).toContain('MULF');
        });

        it('handles float literal operations', () => {
            const ast = parse(`
                PROGRAM Test
                VAR
                    x : REAL;
                END_VAR
                x := 3.14 + 2.0;
                END_PROGRAM
            `);

            const asm = generate(ast.programs[0]);
            expect(asm).toContain('ADDF');
        });
    });
});
