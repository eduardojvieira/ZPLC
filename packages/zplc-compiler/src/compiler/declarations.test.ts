/**
 * Declarations: layout and parsing (CMP-019 to CMP-022, CMP-026, CMP-028)
 *
 * SPDX-License-Identifier: MIT
 *
 * What the parser accepts in a declaration (string capacities, constant bounds, structure and
 * array initialisers, `VAR CONSTANT`, `Type#Value`) and the size and the offsets the symbol table
 * gives each declared thing. No code is generated here.
 */

import { describe, it, expect } from 'bun:test';

import { parse, ParseError } from './parser.ts';
import { tokenize, TokenType } from './lexer.ts';
import { buildSymbolTable, parseStringType, stringTotalSize, typeToString } from './symbol-table.ts';

describe('layout (CMP-019, CMP-022, CMP-028)', () => {
    it('gives an array of structures the size of its elements', () => {
        const unit = parse(`
TYPE Pt : STRUCT x : INT; z : DINT; END_STRUCT END_TYPE
PROGRAM P
VAR a : ARRAY[0..3] OF Pt; after : INT; END_VAR
END_PROGRAM`);
        const table = buildSymbolTable(unit);
        expect(table.sizeOf('Pt')).toBe(8);
        expect(table.get('a')!.size).toBe(32);
        // the next variable starts after the whole array: it used to start on its first element
        expect(table.get('after')!.address).toBe(table.get('a')!.address + 32);
    });

    it('sizes strings by their capacity', () => {
        expect(parseStringType('STRING')).toEqual({ wide: false, capacity: 80 });
        expect(parseStringType('STRING[20]')).toEqual({ wide: false, capacity: 20 });
        expect(parseStringType('wstring[5]')).toEqual({ wide: true, capacity: 5 });
        expect(parseStringType('INT')).toBeNull();
        expect(stringTotalSize(false, 20)).toBe(25);
        expect(stringTotalSize(true, 5)).toBe(16);
        const table = buildSymbolTable(parse('PROGRAM P VAR s : STRING[20]; w : WSTRING[5]; d : STRING; END_VAR END_PROGRAM'));
        expect(table.get('s')!.size).toBe(25);
        expect(table.get('w')!.size).toBe(16);
        expect(table.get('d')!.size).toBe(85);
    });

    it('keeps the address of the variable a VAR_IN_OUT refers to, four bytes wide', () => {
        const unit = parse(`
FUNCTION_BLOCK Inc
VAR_INPUT step : BYTE; END_VAR
VAR_IN_OUT x : DINT; END_VAR
VAR n : INT; END_VAR
END_FUNCTION_BLOCK
PROGRAM P VAR f : Inc; END_VAR END_PROGRAM`);
        const table = buildSymbolTable(unit);
        const members = table.getFBDefinition('Inc')!.members;
        expect(members.get('x')!.size).toBe(4);
        expect(members.get('x')!.section).toBe('VAR_IN_OUT');
        expect(members.get('x')!.offset).toBe(4);
        expect(members.get('n')!.offset).toBe(8);
    });

    it('writes types as the language does', () => {
        const unit = parse('PROGRAM P VAR a : ARRAY[-1..1, 0..2] OF INT; r : REF_TO DINT; END_VAR END_PROGRAM');
        const table = buildSymbolTable(unit);
        expect(typeToString(table.get('a')!.dataType)).toBe('ARRAY[-1..1, 0..2] OF INT');
        expect(typeToString(table.get('r')!.dataType)).toBe('REF_TO DINT');
    });
});

describe('declarations the parser accepts', () => {
    it('reads the capacity of a string in brackets or in parentheses', () => {
        const unit = parse(`PROGRAM P VAR a : STRING[20]; b : STRING(8); c : STRING; w : WSTRING[3]; END_VAR END_PROGRAM`);
        const types = unit.programs[0].varBlocks[0].variables.map((variable) => variable.dataType);
        expect(types).toEqual(['STRING[20]', 'STRING[8]', 'STRING', 'WSTRING[3]']);
    });

    it('refuses a capacity that is not a constant of 1 or more', () => {
        expect(() => parse('PROGRAM P VAR a : STRING[0]; END_VAR END_PROGRAM')).toThrow(ParseError);
        expect(() => parse('PROGRAM P VAR n : INT; a : STRING[n]; END_VAR END_PROGRAM')).toThrow(ParseError);
    });

    it('reads array bounds that are negative or constant expressions', () => {
        const unit = parse(`
VAR_GLOBAL CONSTANT N : INT := 4; END_VAR
PROGRAM P
VAR a : ARRAY[-5..5] OF INT; b : ARRAY[0..N] OF INT; c : ARRAY[1..N * 2, -1..N - 3] OF REAL; END_VAR
END_PROGRAM`);
        const [a, b, c] = unit.programs[0].varBlocks[0].variables.map((variable) => variable.dataType as any);
        expect(a.dimensions).toEqual([{ lowerBound: -5, upperBound: 5 }]);
        expect(b.dimensions).toEqual([{ lowerBound: 0, upperBound: 4 }]);
        expect(c.dimensions).toEqual([{ lowerBound: 1, upperBound: 8 }, { lowerBound: -1, upperBound: 1 }]);
    });

    it('keeps VAR CONSTANT and VAR_GLOBAL CONSTANT apart from plain variables', () => {
        const unit = parse(`
VAR_GLOBAL CONSTANT G : INT := 1; END_VAR
VAR_GLOBAL H : INT := 2; END_VAR
PROGRAM P
VAR CONSTANT K : INT := 3; END_VAR
VAR V : INT; END_VAR
END_PROGRAM`);
        expect(unit.globalVars[0].variables[0].section).toBe('CONSTANT');
        expect(unit.globalVars[1].variables[0].section).toBe('VAR_GLOBAL');
        expect(unit.programs[0].varBlocks.map((block) => block.section)).toEqual(['CONSTANT', 'VAR']);
    });

    it('reads structure initialisers and array initialisers with repeat counts', () => {
        const unit = parse(`
TYPE Pt : STRUCT x : INT := 7; y : INT; END_STRUCT END_TYPE
PROGRAM P
VAR
  p : Pt := (y := 2);
  a : ARRAY[0..5] OF INT := [1, 4(9), 3];
  s : ARRAY[0..1] OF Pt := [(x := 1), (x := 2, y := 3)];
  e : INT := (1 + 2) * 3;
END_VAR
END_PROGRAM`);
        const variables = unit.programs[0].varBlocks[0].variables;
        expect(variables[0].initialValue).toMatchObject({ kind: 'StructInitializer', fields: [{ name: 'y' }] });
        expect(variables[1].initialValue).toMatchObject({
            kind: 'ArrayLiteral',
            elements: [{ kind: 'IntLiteral' }, { kind: 'ArrayRepeat', count: 4 }, { kind: 'IntLiteral' }],
        });
        expect(variables[2].initialValue).toMatchObject({ kind: 'ArrayLiteral', elements: [{ kind: 'StructInitializer' }, { kind: 'StructInitializer' }] });
        // a parenthesised expression is still an expression
        expect(variables[3].initialValue).toMatchObject({ kind: 'BinaryExpr' });
        // the default of a structure member is kept in the type
        expect((unit.typeDefinitions[0] as any).members[0].initialValue).toMatchObject({ kind: 'IntLiteral', value: 7 });
    });

    it('lexes Type#Value as one name and keeps the typed literals of the language', () => {
        const names = tokenize('s := St#RUN; t := T#5s; d := D#2024-01-02;').filter((token) => token.type === TokenType.IDENTIFIER).map((token) => token.value);
        expect(names).toEqual(['s', 'St#RUN', 't', 'd']);
        expect(tokenize('x := T#5s;').some((token) => token.type === TokenType.TIME_LITERAL)).toBe(true);
    });
});

