/**
 * ZPLC Array Support Tests
 * 
 * Tests for ARRAY parsing, code generation, and integration.
 */

import { describe, it, expect } from 'bun:test';
import { tokenize, TokenType } from './lexer.ts';
import { parse } from './parser.ts';
import type { VarDecl, ArrayType, ArrayAccess, Assignment } from './ast.ts';
import { isArrayType, getArrayTotalSize, getArrayElementCount } from './ast.ts';

describe('Array Lexer', () => {
    it('should tokenize ARRAY keyword', () => {
        const tokens = tokenize('ARRAY');
        expect(tokens[0].type).toBe(TokenType.ARRAY);
    });

    it('should tokenize brackets', () => {
        const tokens = tokenize('[0..9]');
        expect(tokens[0].type).toBe(TokenType.LBRACKET);
        expect(tokens[1].type).toBe(TokenType.INTEGER);
        expect(tokens[2].type).toBe(TokenType.DOTDOT);
        expect(tokens[3].type).toBe(TokenType.INTEGER);
        expect(tokens[4].type).toBe(TokenType.RBRACKET);
    });

    it('should tokenize array declaration', () => {
        const tokens = tokenize('ARRAY[0..9] OF INT');
        expect(tokens[0].type).toBe(TokenType.ARRAY);
        expect(tokens[1].type).toBe(TokenType.LBRACKET);
        expect(tokens[2].type).toBe(TokenType.INTEGER);  // 0
        expect(tokens[3].type).toBe(TokenType.DOTDOT);   // ..
        expect(tokens[4].type).toBe(TokenType.INTEGER);  // 9
        expect(tokens[5].type).toBe(TokenType.RBRACKET);
        expect(tokens[6].type).toBe(TokenType.OF);
        expect(tokens[7].type).toBe(TokenType.INT);
    });
});

describe('Array Parser', () => {
    it('should parse 1D array declaration', () => {
        const source = `
PROGRAM Test
VAR
    Temps : ARRAY[0..9] OF REAL;
END_VAR
END_PROGRAM`;
        const ast = parse(source);
        const varDecl = ast.programs[0].varBlocks[0].variables[0] as VarDecl;

        expect(varDecl.name).toBe('Temps');
        expect(isArrayType(varDecl.dataType)).toBe(true);

        const arrayType = varDecl.dataType as ArrayType;
        expect(arrayType.dimensions.length).toBe(1);
        expect(arrayType.dimensions[0].lowerBound).toBe(0);
        expect(arrayType.dimensions[0].upperBound).toBe(9);
        expect(arrayType.elementType).toBe('REAL');
    });

    it('should parse 2D array declaration', () => {
        const source = `
PROGRAM Test
VAR
    Matrix : ARRAY[0..2, 0..3] OF INT;
END_VAR
END_PROGRAM`;
        const ast = parse(source);
        const varDecl = ast.programs[0].varBlocks[0].variables[0] as VarDecl;

        expect(isArrayType(varDecl.dataType)).toBe(true);

        const arrayType = varDecl.dataType as ArrayType;
        expect(arrayType.dimensions.length).toBe(2);
        expect(arrayType.dimensions[0].lowerBound).toBe(0);
        expect(arrayType.dimensions[0].upperBound).toBe(2);
        expect(arrayType.dimensions[1].lowerBound).toBe(0);
        expect(arrayType.dimensions[1].upperBound).toBe(3);
        expect(arrayType.elementType).toBe('INT');
    });

    it('should parse 3D array declaration', () => {
        const source = `
PROGRAM Test
VAR
    Cube : ARRAY[0..1, 0..2, 0..3] OF DINT;
END_VAR
END_PROGRAM`;
        const ast = parse(source);
        const varDecl = ast.programs[0].varBlocks[0].variables[0] as VarDecl;

        const arrayType = varDecl.dataType as ArrayType;
        expect(arrayType.dimensions.length).toBe(3);
    });

    it('should parse 1D array access in expression', () => {
        const source = `
PROGRAM Test
VAR
    Arr : ARRAY[0..9] OF INT;
    X : INT;
END_VAR
    X := Arr[5];
END_PROGRAM`;
        const ast = parse(source);
        const stmt = ast.programs[0].statements[0] as Assignment;

        expect(stmt.value.kind).toBe('ArrayAccess');
        const access = stmt.value as ArrayAccess;
        expect(access.array.name).toBe('Arr');
        expect(access.indices.length).toBe(1);
    });

    it('should parse 2D array access in expression', () => {
        const source = `
PROGRAM Test
VAR
    Matrix : ARRAY[0..2, 0..3] OF INT;
    X : INT;
END_VAR
    X := Matrix[1, 2];
END_PROGRAM`;
        const ast = parse(source);
        const stmt = ast.programs[0].statements[0] as Assignment;

        const access = stmt.value as ArrayAccess;
        expect(access.indices.length).toBe(2);
    });

    it('should parse array element assignment', () => {
        const source = `
PROGRAM Test
VAR
    Arr : ARRAY[0..9] OF INT;
END_VAR
    Arr[0] := 42;
END_PROGRAM`;
        const ast = parse(source);
        const stmt = ast.programs[0].statements[0] as Assignment;

        expect(stmt.target.kind).toBe('ArrayAccess');
        const access = stmt.target as ArrayAccess;
        expect(access.array.name).toBe('Arr');
    });

    it('should parse array with variable index', () => {
        const source = `
PROGRAM Test
VAR
    Arr : ARRAY[0..9] OF INT;
    I : INT;
END_VAR
    Arr[I] := 100;
END_PROGRAM`;
        const ast = parse(source);
        const stmt = ast.programs[0].statements[0] as Assignment;

        const access = stmt.target as ArrayAccess;
        expect(access.indices[0].kind).toBe('Identifier');
    });

    it('should parse array literal initializer', () => {
        const source = `
PROGRAM Test
VAR
    Arr : ARRAY[0..2] OF INT := [1, 2, 3];
END_VAR
END_PROGRAM`;
        const ast = parse(source);
        const varDecl = ast.programs[0].varBlocks[0].variables[0] as VarDecl;

        expect(varDecl.initialValue).not.toBeNull();
        expect(varDecl.initialValue!.kind).toBe('ArrayLiteral');
    });
});

describe('Array Helper Functions', () => {
    it('should calculate element count for 1D array', () => {
        const arrayType: ArrayType = {
            kind: 'ArrayType',
            dimensions: [{ lowerBound: 0, upperBound: 9 }],
            elementType: 'INT',
        };
        expect(getArrayElementCount(arrayType)).toBe(10);
    });

    it('should calculate element count for 2D array', () => {
        const arrayType: ArrayType = {
            kind: 'ArrayType',
            dimensions: [
                { lowerBound: 0, upperBound: 2 },
                { lowerBound: 0, upperBound: 3 },
            ],
            elementType: 'INT',
        };
        expect(getArrayElementCount(arrayType)).toBe(12);  // 3 * 4
    });

    it('should calculate total size for 1D array of INT', () => {
        const arrayType: ArrayType = {
            kind: 'ArrayType',
            dimensions: [{ lowerBound: 0, upperBound: 9 }],
            elementType: 'INT',
        };
        expect(getArrayTotalSize(arrayType)).toBe(20);  // 10 elements * 2 bytes
    });

    it('should calculate total size for 1D array of REAL', () => {
        const arrayType: ArrayType = {
            kind: 'ArrayType',
            dimensions: [{ lowerBound: 0, upperBound: 9 }],
            elementType: 'REAL',
        };
        expect(getArrayTotalSize(arrayType)).toBe(40);  // 10 elements * 4 bytes
    });

    it('should identify ArrayType correctly', () => {
        const arrayType: ArrayType = {
            kind: 'ArrayType',
            dimensions: [{ lowerBound: 0, upperBound: 9 }],
            elementType: 'INT',
        };
        expect(isArrayType(arrayType)).toBe(true);
        expect(isArrayType('INT')).toBe(false);
    });
});
