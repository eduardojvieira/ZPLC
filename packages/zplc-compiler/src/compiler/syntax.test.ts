/**
 * Lexer, parser and diagnostic-position behaviour (CMP-006, CMP-007, CMP-009, CMP-029 to CMP-033, CMP-038).
 *
 * What a program does when it runs is the business of the conformance cases (conformance/cmp); these tests
 * pin what only the front end can show: the tokens, the tree, and where every error is reported.
 */
import { describe, expect, it } from 'bun:test';
import { tokenize, tokenizeWithErrors, TokenType } from './lexer.ts';
import { parse, parseWithDiagnostics } from './parser.ts';
import { CompilerError, compileMultiTaskProject } from './index.ts';

const kinds = (source: string) => tokenize(source).filter((token) => token.type !== TokenType.EOF).map((token) => [token.type, token.value]);

/** Every error of a source as `line:column message`. */
const errorsOf = (source: string) => parseWithDiagnostics(source).errors.map((error) => `${error.line}:${error.column} ${error.detail}`);
const linesOf = (source: string) => parseWithDiagnostics(source).errors.map((error) => error.line);

const program = (declarations: string, body: string) => `PROGRAM P\nVAR\n${declarations}\nEND_VAR\n${body}\nEND_PROGRAM`;

describe('lexer: numbers (CMP-031)', () => {
    it('reads a based literal as binary, octal or hexadecimal digits', () => {
        expect(kinds('2#1010 8#17 16#FF 16#ff')).toEqual([
            ['INTEGER', '0b1010'], ['INTEGER', '0o17'], ['INTEGER', '0xFF'], ['INTEGER', '0xff'],
        ]);
    });

    it('allows one underscore between two digits', () => {
        expect(kinds('1_000 16#FF_FF 2#1111_0000 1_000.5')).toEqual([
            ['INTEGER', '1000'], ['INTEGER', '0xFFFF'], ['INTEGER', '0b11110000'], ['REAL_LITERAL', '1000.5'],
        ]);
    });

    it('reports a misplaced digit separator where the literal starts', () => {
        for (const text of ['1__000', '1_', '16#FF_', '2#1__0']) {
            const { errors } = tokenizeWithErrors(`x := ${text};`);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]!.detail).toContain('digit separator');
            expect([errors[0]!.line, errors[0]!.column]).toEqual([1, 6]);
        }
    });

    it('refuses a base other than 2, 8 and 16 and a digit outside the base', () => {
        expect(tokenizeWithErrors('3#12').errors[0]!.detail).toContain('number base 3#');
        expect(tokenizeWithErrors('2#102').errors[0]!.detail).toContain("'2' is not valid in a base-2 literal");
        expect(tokenizeWithErrors('16#').errors[0]!.detail).toContain('needs at least one digit');
        expect(tokenizeWithErrors('2#_1').errors[0]!.detail).toContain('needs at least one digit');
        expect(tokenizeWithErrors('8#19').errors[0]!.detail).toContain("'9' is not valid in a base-8 literal");
    });

    it('keeps the non-IEC 0x form and warns about it', () => {
        const { tokens, errors, warnings } = tokenizeWithErrors('x := 0xFF + 0X1_0;');
        expect(errors).toEqual([]);
        expect(tokens.filter((token) => token.type === TokenType.INTEGER).map((token) => token.value)).toEqual(['0xFF', '0x10']);
        expect(warnings.map((warning) => [warning.line, warning.column, warning.message])).toEqual([
            [1, 6, 'The hexadecimal literal 0xFF is not IEC 61131-3 syntax: write 16#FF'],
            [1, 13, 'The hexadecimal literal 0x10 is not IEC 61131-3 syntax: write 16#10'],
        ]);
        expect(tokenizeWithErrors('x := 16#FF;').warnings).toEqual([]);
    });

    it('reads a typed literal as one token', () => {
        expect(kinds('INT#5 SINT#-3 WORD#16#FF bool#TRUE BOOL#0 REAL#1.5 lreal#2e3 UDINT#4_000')).toEqual([
            ['TYPED_LITERAL', 'INT#5'], ['TYPED_LITERAL', 'SINT#-3'], ['TYPED_LITERAL', 'WORD#0xFF'],
            ['TYPED_LITERAL', 'BOOL#1'], ['TYPED_LITERAL', 'BOOL#0'], ['TYPED_LITERAL', 'REAL#1.5'],
            ['TYPED_LITERAL', 'LREAL#2e3'], ['TYPED_LITERAL', 'UDINT#4000'],
        ]);
    });

    it('keeps T#, TIME#, D#, STRING# literals and refuses an unknown prefix', () => {
        expect(kinds("T#5s TIME#1h30m STRING#'a'").map(([type]) => type)).toEqual(['TIME_LITERAL', 'TIME_LITERAL', 'STRING_LITERAL']);
        const error = tokenizeWithErrors('x := FOO#5;').errors[0]!;
        expect(error.detail).toBe("Unknown typed literal prefix 'FOO'");
        expect([error.line, error.column, error.endColumn]).toEqual([1, 6, 10]);
    });

    it('still reads 1..5 as a range and 1.5 as a real', () => {
        expect(kinds('1..5 1.5 1e3 2E-3')).toEqual([
            ['INTEGER', '1'], ['DOTDOT', '..'], ['INTEGER', '5'], ['REAL_LITERAL', '1.5'], ['REAL_LITERAL', '1e3'], ['REAL_LITERAL', '2E-3'],
        ]);
    });
});

describe('lexer: operators, comments and positions (CMP-032)', () => {
    it('reads ** and &', () => {
        expect(kinds('a ** b & c * d')).toEqual([
            ['IDENTIFIER', 'a'], ['POWER', '**'], ['IDENTIFIER', 'b'], ['AND', '&'], ['IDENTIFIER', 'c'], ['STAR', '*'], ['IDENTIFIER', 'd'],
        ]);
    });

    it('skips (* *), /* */ and // comments, none of which nests', () => {
        expect(kinds('a (* x *) b /* y */ c // z\nd')).toEqual([
            ['IDENTIFIER', 'a'], ['IDENTIFIER', 'b'], ['IDENTIFIER', 'c'], ['IDENTIFIER', 'd'],
        ]);
        // the first closing delimiter ends the comment, whatever opened inside it
        expect(kinds('(* a (* b *) c')).toEqual([['IDENTIFIER', 'c']]);
        expect(kinds('/* a /* b */ c')).toEqual([['IDENTIFIER', 'c']]);
        // a delimiter of the other kind, and a line comment mark, are text inside a comment
        expect(kinds('(* /* // *) a /* (* // */ b')).toEqual([['IDENTIFIER', 'a'], ['IDENTIFIER', 'b']]);
        expect(kinds('// (* not a comment\na')).toEqual([['IDENTIFIER', 'a']]);
    });

    it('reports an unterminated comment where it opens (CMP-009)', () => {
        const star = tokenizeWithErrors('x := 1;\n  (* never closed\ny := 2;\n').errors[0]!;
        expect([star.line, star.column, star.endLine, star.endColumn]).toEqual([2, 3, 2, 5]);
        expect(star.detail).toContain('(*');
        const slash = tokenizeWithErrors('a\n\t/* never closed').errors[0]!;
        expect([slash.line, slash.column]).toEqual([2, 2]);
        expect(slash.detail).toContain('/*');
    });

    it('counts a tab as one column', () => {
        const token = tokenize('\t\tx')[0]!;
        expect([token.line, token.column, token.endColumn]).toEqual([1, 3, 4]);
    });

    it('counts CR LF as one line break and a lone CR as one too', () => {
        const crlf = tokenize('a\r\nb\r\n  c');
        expect(crlf.map((token) => [token.line, token.column])).toEqual([[1, 1], [2, 1], [3, 3], [3, 4]]);
        const cr = tokenize('a\rb');
        expect([cr[1]!.line, cr[1]!.column]).toEqual([2, 1]);
    });

    it('ignores a byte order mark', () => {
        const token = tokenize('﻿x := 1;')[0]!;
        expect([token.value, token.line, token.column]).toEqual(['x', 1, 1]);
    });

    it('reports a CRLF source on the line the editor shows', () => {
        const source = ['PROGRAM P', 'VAR', '  x : INT;', 'END_VAR', '  x := ;', 'END_PROGRAM'].join('\r\n');
        expect(errorsOf(source)).toEqual(['5:8 Expected expression, got SEMICOLON']);
    });
});

describe('lexer: library blocks are names (CMP-033)', () => {
    it('reads every library function block name as an identifier', () => {
        const names = ['TON', 'TOF', 'TP', 'R_TRIG', 'F_TRIG', 'RS', 'SR', 'CTU', 'CTD', 'CTUD', 'BLINK', 'PWM', 'PULSE',
            'HYSTERESIS', 'DEADBAND', 'LAG_FILTER', 'RAMP_REAL', 'INTEGRAL', 'DERIVATIVE', 'PID_Compact', 'FIFO', 'LIFO'];
        for (const name of names) {
            expect(kinds(name)).toEqual([['IDENTIFIER', name]]);
            expect(kinds(name.toLowerCase())).toEqual([['IDENTIFIER', name.toLowerCase()]]);
        }
    });

    it('keeps the elementary types and the statements reserved', () => {
        expect(kinds('INT BOOL TIME STRING ARRAY IF AND').map(([type]) => type)).toEqual(['INT', 'BOOL', 'TIME', 'STRING', 'ARRAY', 'IF', 'AND']);
    });
});

describe('lexer: recovery', () => {
    it('reports every lexical error and goes on', () => {
        const { tokens, errors } = tokenizeWithErrors("a @ b # c 'open\nd");
        expect(errors.map((error) => `${error.line}:${error.column} ${error.detail}`)).toEqual([
            "1:3 Unexpected character: '@'",
            "1:7 Unexpected character: '#'",
            '1:11 Unterminated string literal (newline in string)',
        ]);
        expect(tokens.filter((token) => token.type === TokenType.IDENTIFIER).map((token) => token.value)).toEqual(['a', 'b', 'c', 'd']);
        expect(tokens.filter((token) => token.type === TokenType.ERROR).length).toBe(3);
    });

    it('tokenize throws the first error with all of them', () => {
        try {
            tokenize('a @ b # c');
            throw new Error('expected an error');
        } catch (error) {
            const lexical = error as { detail: string; errors: Array<{ column: number }> };
            expect(lexical.detail).toContain("'@'");
            expect(lexical.errors.map((each) => each.column)).toEqual([3, 7]);
        }
    });
});

describe('parser: error recovery reports every independent error (CMP-007)', () => {
    it('reports three unrelated statement errors, in order, with their columns', () => {
        const source = program('  x : INT;', '  x := ;\n  x := 1 +;\n  x := * 2;');
        expect(errorsOf(source)).toEqual([
            '5:8 Expected expression, got SEMICOLON',
            '6:11 Expected expression, got SEMICOLON',
            '7:8 Expected expression, got STAR',
        ]);
    });

    it('does not report a false error for the statements after a broken one', () => {
        const source = program('  x : INT;', '  x := 1;\n  x := ;\n  x := 2;\n  x := 3;');
        expect(linesOf(source)).toEqual([6]);
    });

    it('skips a broken compound statement whole, so its END_IF is not an error', () => {
        const source = program('  x : INT;', [
            '  IF x = THEN',
            '    x := 1;',
            '    IF x > 1 THEN x := 2; END_IF;',
            '  END_IF;',
            '  x := 5;',
            '  x := ;',
        ].join('\n'));
        expect(linesOf(source)).toEqual([5, 10]);
    });

    it('recovers inside a branch and leaves the construct around it intact', () => {
        const source = program('  x : INT;', [
            '  IF x = 1 THEN',
            '    x := ;',
            '    x := 2;',
            '  ELSIF x = 2 THEN',
            '    x := 3 +;',
            '  ELSE',
            '    x := 4;',
            '  END_IF;',
            '  CASE x OF',
            '    1: x := ;',
            '    2: x := 5;',
            '  END_CASE;',
            '  WHILE x < 3 DO x := ; END_WHILE;',
            '  FOR x := 1 TO 3 DO x := ; END_FOR;',
        ].join('\n'));
        expect(linesOf(source)).toEqual([6, 9, 14, 17, 18]);
    });

    it('reports a missing END_IF once, at the word that should have closed it', () => {
        const source = program('  x : INT;', '  IF x = 1 THEN\n    x := 2;');
        const errors = errorsOf(source);
        expect(errors.length).toBe(1);
        expect(errors[0]).toMatch(/^7:1 Expected END_IF, got END_PROGRAM/);
    });

    it('does not run a statement list into the next program', () => {
        const source = 'PROGRAM A\nVAR x : INT; END_VAR\nx := 1;\nPROGRAM B\nVAR y : INT; END_VAR\ny := ;\nEND_PROGRAM';
        const outcome = parseWithDiagnostics(source);
        expect(outcome.errors.map((error) => error.line)).toEqual([4, 6]);
        expect(outcome.unit.programs.map((entry) => entry.name)).toEqual(['B']);
    });

    it('reports the errors of declarations and statements together', () => {
        const source = 'PROGRAM P\nVAR\n  a : ;\n  b : INT;\n  c INT;\nEND_VAR\n  b := ;\nEND_PROGRAM';
        expect(errorsOf(source)).toEqual([
            '3:7 Expected type name, got SEMICOLON',
            "5:5 Expected : after variable name, got INT 'INT'",
            '7:8 Expected expression, got SEMICOLON',
        ]);
    });

    it('reports errors of several program organisation units', () => {
        const source = [
            'FUNCTION F : INT', 'F := ;', 'END_FUNCTION',
            'FUNCTION_BLOCK B', 'VAR x : INT; END_VAR', 'x := 1 2;', 'END_FUNCTION_BLOCK',
            'PROGRAM P', 'END_PROGRAM',
        ].join('\n');
        const outcome = parseWithDiagnostics(source);
        expect(outcome.errors.map((error) => error.line)).toEqual([2, 6]);
        expect(outcome.unit.programs.map((entry) => entry.name)).toEqual(['P']);
    });

    it('puts lexical and syntax errors in one list, ordered by position', () => {
        const source = program('  x : INT;', '  x := ;\n  x := 1 @ 2;\n  x := ;');
        expect(errorsOf(source)).toEqual([
            '5:8 Expected expression, got SEMICOLON',
            "6:10 Unexpected character: '@'",
            '7:8 Expected expression, got SEMICOLON',
        ]);
    });

    it('does not report a syntax error for the statement that has a lexical one', () => {
        expect(errorsOf(program('  x : INT;', '  x := 1 @ 2;\n  x := @;\n  @ x := 3;'))).toEqual([
            "5:10 Unexpected character: '@'",
            "6:8 Unexpected character: '@'",
            "7:3 Unexpected character: '@'",
        ]);
    });

    it('reports an unterminated comment alone, where it opens (CMP-009)', () => {
        const source = 'PROGRAM Open\nVAR\n  x : INT;\nEND_VAR\n  x := 1;\n  (* never closed\n  x := 2;\nEND_PROGRAM';
        expect(errorsOf(source)).toEqual([expect.stringMatching(/^6:3 Unterminated comment/)]);
    });

    it('keeps an error before an unterminated comment', () => {
        const source = 'PROGRAM Open\nVAR x : INT; END_VAR\n  x := ;\n  /* never closed\nEND_PROGRAM';
        expect(linesOf(source)).toEqual([3, 4]);
    });

    it('stops reading after a hundred errors', () => {
        const source = program('  x : INT;', Array.from({ length: 400 }, () => '  x := ;').join('\n'));
        expect(parseWithDiagnostics(source).errors.length).toBe(100);
    });

    it('reads on after a stray word without losing the unit that holds it', () => {
        for (const [stray, count] of [['END_IF;', 1], ['ELSE', 1], ['UNTIL;', 1], ['END_WHILE;', 1], [')', 1], [';;;', 0]] as const) {
            const outcome = parseWithDiagnostics(program('  x : INT;', `  ${stray}\n  x := 1;\n  x := 2;`));
            expect(outcome.errors.length).toBe(count);
            expect(outcome.unit.programs.map((entry) => entry.name)).toEqual(['P']);
            expect(outcome.unit.programs[0]!.statements.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('parse throws the first error carrying every one', () => {
        try {
            parse(program('  x : INT;', '  x := ;\n  x := ;'));
            throw new Error('expected an error');
        } catch (error) {
            const syntax = error as { line: number; errors: Array<{ line: number }> };
            expect(syntax.line).toBe(5);
            expect(syntax.errors.map((each) => each.line)).toEqual([5, 6]);
        }
    });

    it('reports a position at the offending token with its end', () => {
        const [error] = parseWithDiagnostics(program('  x : INT;', '  x := ENDX ENDY;')).errors;
        expect([error!.line, error!.column, error!.endLine, error!.endColumn]).toEqual([5, 13, 5, 17]);
    });
});

describe('parser: declarations (CMP-029, CMP-030)', () => {
    const declarations = (source: string) => parse(source).programs[0]!.varBlocks.flatMap((block) => block.variables);

    it('accepts RETAIN and NON_RETAIN', () => {
        const unit = parse([
            'VAR_GLOBAL RETAIN g : INT; END_VAR',
            'PROGRAM P',
            'VAR RETAIN a : INT; END_VAR',
            'VAR NON_RETAIN b : INT; END_VAR',
            'VAR c : INT; END_VAR',
            'END_PROGRAM',
        ].join('\n'));
        expect(unit.globalVars[0]!.variables[0]!.retain).toBe(true);
        expect(unit.programs[0]!.varBlocks.map((block) => block.variables[0]!.retain)).toEqual([true, false, undefined]);
    });

    it('still takes retain as the name of a variable', () => {
        const [variable] = declarations('PROGRAM P\nVAR\n  retain : BOOL;\nEND_VAR\nEND_PROGRAM');
        expect(variable!.name).toBe('retain');
        expect(variable!.retain).toBeUndefined();
        expect(declarations('PROGRAM P\nVAR RETAIN\n  non_retain : BOOL;\nEND_VAR\nEND_PROGRAM')[0]).toMatchObject({ name: 'non_retain', retain: true });
    });

    it('declares several names with one type and one initial value', () => {
        const variables = declarations('PROGRAM P\nVAR\n  a, b, c : INT := 7;\n  d : BOOL;\nEND_VAR\nEND_PROGRAM');
        expect(variables.map((variable) => [variable.name, variable.dataType, variable.line, variable.column])).toEqual([
            ['a', 'INT', 3, 3], ['b', 'INT', 3, 6], ['c', 'INT', 3, 9], ['d', 'BOOL', 4, 3],
        ]);
        expect(variables.slice(0, 3).map((variable) => (variable.initialValue as { value: number }).value)).toEqual([7, 7, 7]);
    });

    it('refuses several names with one address', () => {
        expect(errorsOf('PROGRAM P\nVAR\n  a, b AT %QX0.0 : BOOL;\nEND_VAR\nEND_PROGRAM').length).toBe(1);
    });

    it('accepts VAR_EXTERNAL, VAR_TEMP and a function with outputs', () => {
        const unit = parse([
            'FUNCTION F : INT',
            'VAR_INPUT a : INT; END_VAR',
            'VAR_OUTPUT o : INT; END_VAR',
            'VAR_IN_OUT io : INT; END_VAR',
            'VAR_TEMP t : INT; END_VAR',
            'VAR_EXTERNAL g : INT; END_VAR',
            'END_FUNCTION',
            'PROGRAM P',
            'VAR_EXTERNAL g : INT; END_VAR',
            'VAR_TEMP t : INT; END_VAR',
            'END_PROGRAM',
        ].join('\n'));
        const fn = unit.functions[0]!;
        expect(fn.inputs.map((variable) => variable.name)).toEqual(['a']);
        expect(fn.locals.map((variable) => variable.name)).toEqual(['o', 'io', 't', 'g']);
        expect(fn.outputs!.map((variable) => variable.name)).toEqual(['o']);
        expect(fn.inouts!.map((variable) => variable.name)).toEqual(['io']);
        expect(unit.programs[0]!.varBlocks.map((block) => block.section)).toEqual(['VAR_EXTERNAL', 'VAR_TEMP']);
    });

    it('accepts several types in one TYPE block, in any order of kind', () => {
        const unit = parse('TYPE\n  A : STRUCT v : INT; END_STRUCT;\n  B : (R, G);\n  C : INT;\n  D : ARRAY[0..1] OF A;\nEND_TYPE');
        expect(unit.typeDefinitions.map((type) => [type.kind, type.name])).toEqual([['StructDecl', 'A'], ['EnumDecl', 'B']]);
        expect(unit.typeAliases!.map((alias) => alias.name)).toEqual(['C', 'D']);
        // a block of one keeps the position of the TYPE word
        expect([unit.typeDefinitions[0]!.line, unit.typeDefinitions[0]!.column]).toEqual([1, 1]);
    });
});

describe('parser: type aliases (CMP-030)', () => {
    it('replaces every use of an alias by its base type', () => {
        const unit = parse([
            'TYPE Speed : INT; Table : ARRAY[0..2] OF Speed; Chain : Speed; END_TYPE',
            'TYPE Pt : STRUCT s : Speed; END_STRUCT END_TYPE',
            'FUNCTION F : Speed',
            'VAR_INPUT a : Speed; END_VAR',
            'END_FUNCTION',
            'PROGRAM P',
            'VAR s : Speed; t : Table; c : Chain; REF_TO Speed; END_VAR',
            'END_PROGRAM',
        ].join('\n').replace('REF_TO Speed;', 'r : REF_TO Speed;'));
        const variables = unit.programs[0]!.varBlocks[0]!.variables;
        expect(variables.map((variable) => variable.dataType)).toEqual([
            'INT',
            { kind: 'ArrayType', dimensions: [{ lowerBound: 0, upperBound: 2 }], elementType: 'INT' },
            'INT',
            { kind: 'PointerType', baseType: 'INT' },
        ]);
        expect(unit.functions[0]!.returnType).toBe('INT');
        expect(unit.functions[0]!.inputs[0]!.dataType).toBe('INT');
        const pt = unit.typeDefinitions[0]!;
        expect(pt.kind === 'StructDecl' && pt.members[0]!.dataType).toBe('INT');
    });

    it('gives a variable the default value of its alias, unless it has its own', () => {
        const unit = parse('TYPE Limit : INT := 100; END_TYPE\nPROGRAM P\nVAR a : Limit; b : Limit := 5; END_VAR\nEND_PROGRAM');
        const [a, b] = unit.programs[0]!.varBlocks[0]!.variables;
        expect((a!.initialValue as { value: number }).value).toBe(100);
        expect((b!.initialValue as { value: number }).value).toBe(5);
    });

    it('keeps a structure or function block named by an alias', () => {
        const unit = parse('TYPE Pt : STRUCT x : INT; END_STRUCT END_TYPE\nTYPE Point : Pt; END_TYPE\nPROGRAM P\nVAR p : Point; END_VAR\nEND_PROGRAM');
        expect(unit.programs[0]!.varBlocks[0]!.variables[0]!.dataType).toBe('Pt');
    });

    it('reports an alias that refers to itself and a name declared twice', () => {
        // a cycle is one error, at the first alias of it
        expect(errorsOf('TYPE A : B; B : A; END_TYPE\nPROGRAM P END_PROGRAM')).toEqual(["1:1 The type alias 'A' refers to itself"]);
        expect(errorsOf('TYPE A : INT; END_TYPE\nTYPE a : DINT; END_TYPE\nPROGRAM P END_PROGRAM')).toEqual(["2:1 The type name 'a' is already declared"]);
        expect(errorsOf('TYPE A : INT; END_TYPE\nFUNCTION_BLOCK A END_FUNCTION_BLOCK')).toEqual(["1:1 The type name 'A' is already declared"]);
    });

    it('refuses an array of an array type', () => {
        const errors = errorsOf('TYPE Row : ARRAY[0..1] OF INT; END_TYPE\nPROGRAM P\nVAR t : ARRAY[0..1] OF Row; END_VAR\nEND_PROGRAM');
        expect(errors).toEqual([expect.stringMatching(/^3:5 An array of 'Row' is an array of arrays/)]);
    });
});

describe('parser: library function block names (CMP-033)', () => {
    const type = (source: string) => parse(source).programs[0]!.varBlocks[0]!.variables.map((variable) => variable.dataType);

    it('uses a library name as the name of a variable, of a member and of a parameter', () => {
        expect(() => parse([
            'TYPE S : STRUCT Pulse : BOOL; Ton : INT; END_STRUCT END_TYPE',
            'FUNCTION_BLOCK B',
            'VAR_INPUT Counter : INT; RS : BOOL; END_VAR',
            'VAR_OUTPUT Blink : BOOL; END_VAR',
            'Blink := RS;',
            'END_FUNCTION_BLOCK',
            'FUNCTION F : INT',
            'VAR_INPUT Pwm : INT; END_VAR',
            'F := Pwm;',
            'END_FUNCTION',
            'PROGRAM P',
            'VAR Pulse : BOOL; Ton : S; Sr : INT; END_VAR',
            'Pulse := TRUE;',
            'Sr := Ton.Ton + F(Pwm := 1);',
            'END_PROGRAM',
        ].join('\n'))).not.toThrow();
    });

    it('still takes a library name in a type position as the library block, in any case', () => {
        expect(type('PROGRAM P\nVAR a : TON; b : ton; c : Pid_Compact; d : r_trig; END_VAR\nEND_PROGRAM'))
            .toEqual(['TON', 'TON', 'PID_Compact', 'R_TRIG']);
        expect(type('PROGRAM P\nVAR a : ARRAY[0..1] OF Ctu; END_VAR\nEND_PROGRAM'))
            .toEqual([{ kind: 'ArrayType', dimensions: [{ lowerBound: 0, upperBound: 1 }], elementType: 'CTU' }]);
    });

    it('prefers a type the program declares itself to the library block of that name', () => {
        const unit = parse('FUNCTION_BLOCK Blink\nEND_FUNCTION_BLOCK\nPROGRAM P\nVAR b : blink; END_VAR\nEND_PROGRAM');
        expect(unit.programs[0]!.varBlocks[0]!.variables[0]!.dataType).toBe('Blink');
    });
});

describe('parser: expressions (CMP-031, CMP-032)', () => {
    const expression = (text: string) => {
        const unit = parse(program('  x : DINT; y : REAL; w : WORD;', `  x := ${text};`));
        return (unit.programs[0]!.statements[0] as unknown as { value: unknown }).value;
    };

    it('parses based literals to their value', () => {
        expect(expression('2#1010')).toMatchObject({ kind: 'IntLiteral', value: 10 });
        expect(expression('8#17')).toMatchObject({ value: 15 });
        expect(expression('16#FFFF_FFFF')).toMatchObject({ value: 4294967295 });
        expect(expression('16#FFFFFFFFFFFFFFFF')).toMatchObject({ big: 18446744073709551615n });
        expect(expression('0xFF')).toMatchObject({ value: 255 });
        expect(expression('1_000')).toMatchObject({ value: 1000 });
    });

    it('parses a typed literal with its type and checks its range', () => {
        expect(expression('INT#5')).toMatchObject({ kind: 'IntLiteral', value: 5, literalType: 'INT' });
        expect(expression('SINT#-128')).toMatchObject({ value: -128, literalType: 'SINT' });
        expect(expression('WORD#16#FFFF')).toMatchObject({ value: 65535, literalType: 'WORD' });
        expect(expression('REAL#1.5')).toMatchObject({ kind: 'RealLiteral', value: 1.5, literalType: 'REAL' });
        expect(expression('BOOL#TRUE')).toMatchObject({ kind: 'BoolLiteral', value: true });
        expect(expression('LINT#-9223372036854775808')).toMatchObject({ literalType: 'LINT', big: -9223372036854775808n });
        for (const [text, message] of [
            ['SINT#128', 'SINT#128 is out of range: SINT holds -128 to 127'],
            ['USINT#-1', 'USINT#-1 is out of range'],
            ['UINT#65536', 'UINT#65536 is out of range'],
            ['INT#1.5', 'INT#1.5: an integer literal has no fraction or exponent'],
            ['BOOL#2', 'BOOL# takes 0, 1, TRUE or FALSE'],
        ] as const) {
            expect(errorsOf(program('  x : DINT;', `  x := ${text};`))[0]).toContain(message);
        }
    });

    it('gives ** a higher precedence than the unary minus and makes it left associative', () => {
        expect(expression('-2 ** 2')).toMatchObject({
            kind: 'UnaryExpr', operator: 'NEG', operand: { kind: 'BinaryExpr', operator: 'POW' },
        });
        expect(expression('2 ** 3 ** 2')).toMatchObject({
            kind: 'BinaryExpr', operator: 'POW', left: { kind: 'BinaryExpr', operator: 'POW' }, right: { value: 2 },
        });
        expect(expression('2 ** -1')).toMatchObject({ operator: 'POW', right: { kind: 'UnaryExpr', operator: 'NEG' } });
        expect(expression('2 * 3 ** 2')).toMatchObject({ operator: 'MUL', right: { operator: 'POW' } });
    });

    it('gives & the meaning and the precedence of AND', () => {
        expect(expression('1 = 1 & 2 = 2')).toMatchObject({ operator: 'AND' });
        expect(expression('TRUE OR FALSE & FALSE')).toMatchObject({ operator: 'OR', right: { operator: 'AND' } });
    });

    it('parses a bit access on a variable, a member and an element', () => {
        const unit = parse('TYPE S : STRUCT f : WORD; END_STRUCT END_TYPE\nPROGRAM P\nVAR w : WORD; s : S; a : ARRAY[0..1] OF WORD; b : BOOL; END_VAR\nb := w.3 AND s.f.15 AND a[1].0;\nEND_PROGRAM');
        const { value } = unit.programs[0]!.statements[0] as unknown as { value: { left: { left: unknown; right: unknown }; right: unknown } };
        expect(value.left.left).toMatchObject({ kind: 'BitAccess', bit: 3, operand: { kind: 'Identifier', name: 'w' } });
        expect(value.left.right).toMatchObject({ kind: 'BitAccess', bit: 15, operand: { kind: 'MemberAccess', member: 'f' } });
        expect(value.right).toMatchObject({ kind: 'BitAccess', bit: 0, operand: { kind: 'ArrayAccess' } });
    });

    it('parses a bit as an assignment target', () => {
        const unit = parse(program('  w : WORD;', '  w.7 := TRUE;'));
        expect(unit.programs[0]!.statements[0]).toMatchObject({ kind: 'Assignment', target: { kind: 'BitAccess', bit: 7 } });
    });

    it('refuses a bit number that is not a decimal number below 64', () => {
        expect(errorsOf(program('  w : WORD; b : BOOL;', '  b := w.64;'))[0]).toContain('A bit number is a decimal number from 0 to 63');
        expect(errorsOf(program('  w : WORD; b : BOOL;', '  b := w.0x1;'))[0]).toContain('A bit number');
    });

    it('accepts empty statements anywhere a statement may stand', () => {
        const unit = parse(program('  x : INT;', ';\n  x := 1;;\n  IF x = 1 THEN ; x := 2;; END_IF;\n  ;'));
        expect(unit.programs[0]!.statements.map((statement) => statement.kind)).toEqual(['Assignment', 'IfStatement']);
        expect((unit.programs[0]!.statements[1] as { thenBranch: unknown[] }).thenBranch.length).toBe(1);
    });

    it('parses a call of an array element', () => {
        const unit = parse('PROGRAM P\nVAR t : ARRAY[0..1] OF TON; i : INT; END_VAR\nt[i](IN := TRUE, PT := T#1s);\nEND_PROGRAM');
        expect(unit.programs[0]!.statements[0]).toMatchObject({
            kind: 'FBCallStatement',
            fbName: 't[...]',
            instance: { kind: 'ArrayAccess' },
            parameters: [{ name: 'IN' }, { name: 'PT' }],
        });
    });
});

describe('compile: every independent error, each positioned (CMP-006, CMP-007)', () => {
    const config = (programs: string[]) => ({
        name: 'Errors',
        version: '1.0.0',
        tasks: programs.map((name) => ({ name, trigger: 'cyclic' as const, interval: 10, priority: 1, programs: [name] })),
    });
    const compile = (...sources: string[]) => {
        const names = sources.map((_, index) => `P${index}`);
        try {
            compileMultiTaskProject(config(names), sources.map((content, index) => ({ name: names[index]!, sourceRef: `src/${names[index]}.st`, content })));
        } catch (error) {
            return (error as CompilerError).errors.map((each) => `${each.sourceRef} ${each.phase} ${each.line}:${each.column} ${each.detail}`);
        }
        throw new Error('expected the build to fail');
    };

    it('reports the three errors of one file', () => {
        const errors = compile(program('  x : INT;', '  x := ;\n  x := 1 +;\n  x := * 2;'));
        expect(errors.map((error) => error.split(' ').slice(0, 3).join(' '))).toEqual([
            'src/P0.st parser 5:8', 'src/P0.st parser 6:11', 'src/P0.st parser 7:8',
        ]);
        expect(errors[0]).toContain("Compilation of 'P0' failed: Expected expression, got SEMICOLON");
    });

    it('reports the errors of every source of the project, in task order', () => {
        const errors = compile(
            program('  x : INT;', '  x := ;'),
            program('  y : INT;', '  y := 1;').replace('PROGRAM P', 'PROGRAM Q'),
            program('  z : INT;', '  z := nope;\n  nope2 := 1;').replace('PROGRAM P', 'PROGRAM R'),
        );
        expect(errors.map((error) => error.split(' ').slice(0, 3).join(' '))).toEqual([
            'src/P0.st parser 5:8', 'src/P2.st codegen 5:8', 'src/P2.st codegen 6:3',
        ]);
    });

    it('reports an undeclared name in each statement, at the name', () => {
        const errors = compile(program('  x : INT;', '  x := a;\n  IF x = 1 THEN c := 1; END_IF;\n  x := 1;\n  WHILE b DO x := 2; END_WHILE;'));
        expect(errors).toEqual([
            "src/P0.st codegen 5:8 Unknown identifier 'a'",
            "src/P0.st codegen 6:17 Unknown identifier 'c'",
            "src/P0.st codegen 8:9 Unknown identifier 'b'",
        ]);
    });

    it('reports an error found in a declaration at the declaration', () => {
        expect(compile('PROGRAM P\nVAR\n  x : INT;\n  x : INT;\nEND_VAR\nEND_PROGRAM')).toEqual([
            "src/P0.st codegen 4:3 Symbol 'x' already defined",
        ]);
        const [error] = (() => {
            try { compileMultiTaskProject(config(['P0']), [{ name: 'P0', content: 'PROGRAM P\nVAR\n  x : INT;\n  xyz : INT;\n  xyz : INT;\nEND_VAR\nEND_PROGRAM' }]); } catch (caught) { return (caught as CompilerError).errors; }
            return [];
        })();
        expect([error!.line, error!.column, error!.endLine, error!.endColumn]).toEqual([5, 3, 5, 6]);
    });

    it('reports an unknown member of a block at its call, not at line 0', () => {
        const source = 'FUNCTION_BLOCK C\nVAR_INPUT inc : INT; END_VAR\nEND_FUNCTION_BLOCK\nPROGRAM P\nVAR c : C; END_VAR\n  c(nope := 2);\nEND_PROGRAM';
        expect(compile(source)).toEqual(["src/P0.st codegen 6:3 Unknown member 'nope' on instance 'c'"]);
    });

    it('reports an unknown member of a structure in an expression at that expression', () => {
        const source = 'TYPE S : STRUCT a : INT; END_STRUCT END_TYPE\nPROGRAM P\nVAR s : S; x : INT; END_VAR\n  x := 1;\n  x := x + s.b;\nEND_PROGRAM';
        expect(compile(source)).toEqual(["src/P0.st codegen 5:12 Unknown member 'b' on instance 's'"]);
    });

    it('produces the same errors once for a block body that is inlined twice', () => {
        const source = 'FUNCTION_BLOCK C\nVAR_OUTPUT o : INT; END_VAR\n  o := missing;\nEND_FUNCTION_BLOCK\nPROGRAM P\nVAR a : C; b : C; END_VAR\n  a(); b();\nEND_PROGRAM';
        expect(compile(source)).toEqual(["src/P0.st codegen 3:8 Unknown identifier 'missing'"]);
    });

    it('never reports an error at line 0 of a source file', () => {
        const sources = [
            'PROGRAM P\nVAR x : INT; END_VAR\nWATCHDOG_RESET(unused := 1);\nEND_PROGRAM',
            'FUNCTION_BLOCK A EXTENDS Missing\nEND_FUNCTION_BLOCK\nPROGRAM P\nEND_PROGRAM',
            'PROGRAM P\nVAR a : ARRAY[0..99999] OF DINT; END_VAR\nEND_PROGRAM',
        ];
        for (const source of sources) {
            const errors = compile(source);
            expect(errors.length).toBeGreaterThan(0);
            for (const error of errors) expect(error).not.toMatch(/ [a-z]+ 0:/);
        }
    });

    it('reports what Build reports for a lexical error: the message, the line and the column', () => {
        expect(compile('PROGRAM P\nVAR x : INT; END_VAR\n  x := 1 @ 2;\nEND_PROGRAM')).toEqual([
            "src/P0.st lexer 3:10 Compilation of 'P0' failed: Unexpected character: '@'",
        ].map((line) => line.replace("Compilation of 'P0' failed: ", "Compilation of 'P0' failed: ")));
    });
});
