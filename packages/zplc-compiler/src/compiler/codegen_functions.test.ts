/**
 * ZPLC Function Code Generation Tests
 */

import { describe, it, expect } from 'bun:test';
import { parse } from './parser.ts';
import { generate } from './codegen.ts';

describe('Function Codegen', () => {
    it('should generate code for a simple function', () => {
        const source = `
FUNCTION AddNum : INT
VAR_INPUT
    A : INT;
    B : INT;
END_VAR
    AddNum := A + B;
END_FUNCTION

PROGRAM Main
VAR
    X : INT;
END_VAR
    X := AddNum(10, 20);
END_PROGRAM`;
        const ast = parse(source);
        const asm = generate(ast);

        // Check for function label
        expect(asm).toContain('func_AddNum:');

        // Check for parameter popping
        expect(asm).toContain('; Pop parameter B');
        expect(asm).toContain('; Pop parameter A');

        // Arithmetic operators are polymorphic in ZPLC VM (ADD, MUL, etc.)
        expect(asm).toContain('ADD');

        // Check for return value storage
        expect(asm).toContain('; RETURN AddNum := ...');

        // Check for RET instruction
        expect(asm).toContain('RET');

        // Check for function CALL in program
        expect(asm).toContain('; CALL AddNum(...)');
        expect(asm).toContain('PUSH8 10');
        expect(asm).toContain('PUSH8 20');
        expect(asm).toContain('CALL func_AddNum');
    });

    it('should handle functions with locals', () => {
        const source = `
FUNCTION Calc : DINT
VAR_INPUT
    V1 : DINT;
END_VAR
VAR
    Temp : DINT;
END_VAR
    Temp := V1 * 2;
    Calc := Temp + 100;
END_FUNCTION

PROGRAM Main
VAR
    Res : DINT;
END_VAR
    Res := Calc(50);
END_PROGRAM`;
        const ast = parse(source);
        const asm = generate(ast);

        expect(asm).toContain('func_Calc:');
        expect(asm).toContain('MUL');
        expect(asm).toContain('; Pop parameter V1');
        expect(asm).toContain('Temp := ...');
        expect(asm).toContain('; RETURN Calc := ...');
        expect(asm).toContain('RET');
        expect(asm).toContain('CALL func_Calc');
    });

    it('should handle LREAL data types in functions', () => {
        const source = `
FUNCTION SquareRoot : LREAL
VAR_INPUT
    Num : LREAL;
END_VAR
    SquareRoot := Num * Num;
END_FUNCTION

PROGRAM Main
VAR
    Result : LREAL;
END_VAR
    Result := SquareRoot(2.0);
END_PROGRAM`;
        const ast = parse(source);
        const asm = generate(ast);

        expect(asm).toContain('func_SquareRoot:');
        expect(asm).toContain('LOAD64'); // LREAL is 64-bit
        expect(asm).toContain('STORE64');
        expect(asm).toContain('MULF');
        expect(asm).toContain('CALL func_SquareRoot');
    });
});
