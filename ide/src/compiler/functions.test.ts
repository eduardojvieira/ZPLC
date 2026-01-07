/**
 * ZPLC User-Defined FUNCTION Tests
 * 
 * Tests for FUNCTION parsing and code generation.
 */

import { describe, it, expect } from 'bun:test';
import { tokenize, TokenType } from './lexer.ts';
import { parse } from './parser.ts';
import type { FunctionDecl } from './ast.ts';

describe('Function Lexer', () => {
    it('should tokenize FUNCTION keyword', () => {
        const tokens = tokenize('FUNCTION');
        expect(tokens[0].type).toBe(TokenType.FUNCTION);
    });

    it('should tokenize END_FUNCTION keyword', () => {
        const tokens = tokenize('END_FUNCTION');
        expect(tokens[0].type).toBe(TokenType.END_FUNCTION);
    });

    it('should tokenize function declaration header', () => {
        const tokens = tokenize('FUNCTION AddNum : INT');
        expect(tokens[0].type).toBe(TokenType.FUNCTION);
        expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
        expect(tokens[2].type).toBe(TokenType.COLON);
        expect(tokens[3].type).toBe(TokenType.INT);
    });

    it('should tokenize new data types', () => {
        expect(tokenize('SINT')[0].type).toBe(TokenType.SINT);
        expect(tokenize('USINT')[0].type).toBe(TokenType.USINT);
        expect(tokenize('UINT')[0].type).toBe(TokenType.UINT);
        expect(tokenize('UDINT')[0].type).toBe(TokenType.UDINT);
        expect(tokenize('LINT')[0].type).toBe(TokenType.LINT);
        expect(tokenize('ULINT')[0].type).toBe(TokenType.ULINT);
        expect(tokenize('LREAL')[0].type).toBe(TokenType.LREAL);
    });
});

describe('Function Parser', () => {
    it('should parse simple function declaration', () => {
        const source = `
FUNCTION Double : INT
VAR_INPUT
    X : INT;
END_VAR
    Double := X * 2;
END_FUNCTION`;
        const ast = parse(source);

        expect(ast.functions.length).toBe(1);
        const func = ast.functions[0] as FunctionDecl;
        expect(func.name).toBe('Double');
        expect(func.returnType).toBe('INT');
        expect(func.inputs.length).toBe(1);
        expect(func.inputs[0].name).toBe('X');
    });

    it('should parse function with multiple inputs', () => {
        const source = `
FUNCTION AddThree : DINT
VAR_INPUT
    A : DINT;
    B : DINT;
    C : DINT;
END_VAR
    AddThree := A + B + C;
END_FUNCTION`;
        const ast = parse(source);

        const func = ast.functions[0] as FunctionDecl;
        expect(func.inputs.length).toBe(3);
        expect(func.inputs[0].name).toBe('A');
        expect(func.inputs[1].name).toBe('B');
        expect(func.inputs[2].name).toBe('C');
    });

    it('should parse function with locals', () => {
        const source = `
FUNCTION Clamp : REAL
VAR_INPUT
    Value : REAL;
    Min : REAL;
    Max : REAL;
END_VAR
VAR
    Result : REAL;
END_VAR
    IF Value < Min THEN
        Result := Min;
    ELSIF Value > Max THEN
        Result := Max;
    ELSE
        Result := Value;
    END_IF;
    Clamp := Result;
END_FUNCTION`;
        const ast = parse(source);

        const func = ast.functions[0] as FunctionDecl;
        expect(func.inputs.length).toBe(3);
        expect(func.locals.length).toBe(1);
        expect(func.locals[0].name).toBe('Result');
        expect(func.body.length).toBeGreaterThan(0);
    });

    it('should parse function with LREAL return type', () => {
        const source = `
FUNCTION Precision : LREAL
VAR_INPUT
    X : LREAL;
END_VAR
    Precision := X * 2.0;
END_FUNCTION`;
        const ast = parse(source);

        const func = ast.functions[0] as FunctionDecl;
        expect(func.returnType).toBe('LREAL');
    });

    it('should parse compilation unit with functions and programs', () => {
        const source = `
FUNCTION Helper : INT
VAR_INPUT
    A : INT;
END_VAR
    Helper := A;
END_FUNCTION

PROGRAM Main
VAR
    X : INT;
END_VAR
    X := 1;
END_PROGRAM`;
        const ast = parse(source);

        expect(ast.functions.length).toBe(1);
        expect(ast.programs.length).toBe(1);
        expect(ast.functions[0].name).toBe('Helper');
        expect(ast.programs[0].name).toBe('Main');
    });
});

describe('New Data Types Parser', () => {
    it('should parse SINT variable declaration', () => {
        const source = `
PROGRAM Test
VAR
    X : SINT;
END_VAR
END_PROGRAM`;
        const ast = parse(source);
        expect(ast.programs[0].varBlocks[0].variables[0].dataType).toBe('SINT');
    });

    it('should parse LREAL variable declaration', () => {
        const source = `
PROGRAM Test
VAR
    Precision : LREAL;
END_VAR
END_PROGRAM`;
        const ast = parse(source);
        expect(ast.programs[0].varBlocks[0].variables[0].dataType).toBe('LREAL');
    });

    it('should parse all new integer types', () => {
        const source = `
PROGRAM Test
VAR
    A : SINT;
    B : USINT;
    C : UINT;
    D : UDINT;
    E : LINT;
    F : ULINT;
END_VAR
END_PROGRAM`;
        const ast = parse(source);
        const vars = ast.programs[0].varBlocks[0].variables;
        expect(vars[0].dataType).toBe('SINT');
        expect(vars[1].dataType).toBe('USINT');
        expect(vars[2].dataType).toBe('UINT');
        expect(vars[3].dataType).toBe('UDINT');
        expect(vars[4].dataType).toBe('LINT');
        expect(vars[5].dataType).toBe('ULINT');
    });
});
