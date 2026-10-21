/**
 * Storage and initialisation semantics of the code generator (CMP-019 to CMP-028)
 *
 * SPDX-License-Identifier: MIT
 *
 * The conformance cases under conformance/cmp run whole programs on the native VM. This file covers
 * what is decided before a program runs: the layout the symbol table gives structures, function
 * blocks and arrays, the width of each load and store, which diagnostic a wrong program gets and
 * where, and the shape of the code that initialises variables.
 */

import { describe, it, expect } from 'bun:test';

import { compileST, CompilerError } from './index.ts';
import { ParseError, parse } from './parser.ts';
import { buildSymbolTable } from './symbol-table.ts';

function asm(source: string, options?: Parameters<typeof compileST>[1]): string {
    return compileST(source, options);
}

/** The line and the message the build stops with. */
function rejected(source: string): { line: number; message: string } {
    try {
        compileST(source);
    } catch (error) {
        if (error instanceof CompilerError) return { line: error.line, message: error.detail };
        if (error instanceof ParseError) return { line: error.line, message: error.message };
        throw error;
    }
    throw new Error('the program was accepted');
}

/** The cycle of the program: what follows `_cycle:`. */
function cycle(source: string, options?: Parameters<typeof compileST>[1]): string[] {
    const lines = asm(source, options)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
    return lines.slice(lines.indexOf('_cycle:') + 1);
}

describe('the width of a member access (CMP-019, CMP-020)', () => {
    const source = `
TYPE Pt : STRUCT b : BYTE; i : INT; d : DINT; END_STRUCT END_TYPE
FUNCTION_BLOCK Big
VAR_OUTPUT o : INT; r : REAL; END_VAR
  o := 1000;
END_FUNCTION_BLOCK
PROGRAM P
VAR
  p : Pt;
  f : Big;
  a : INT;
  b : DINT;
END_VAR
  p.b := 1;
  p.i := 2;
  p.d := 3;
  a := p.i;
  b := p.d;
  f();
  a := f.o;
END_PROGRAM`;

    it('stores and loads each structure member at its own width', () => {
        const code = cycle(source).join('\n');
        expect(code).toMatch(/STORE8 0x2000/);
        expect(code).toMatch(/STORE16 0x2002/);
        expect(code).toMatch(/STORE32 0x2004/);
        expect(code).toMatch(/LOAD16 0x2002/);
        expect(code).toMatch(/LOAD32 0x2004/);
    });

    it('reads a member of a user function block at its width, whatever the case of the type name', () => {
        // the block is called Big and its member o is 16 bits; it used to be read as 8
        expect(cycle(source).join('\n')).toMatch(/LOAD16 0x2008/);
    });

    it('stores and loads an enumeration at the width of INT', () => {
        const code = cycle(`
TYPE St : (IDLE, RUN); END_TYPE
PROGRAM P
VAR s : St; n : INT; r AT %QX0.0 : BOOL; END_VAR
  n := 7;
  s := RUN;
  r := s = RUN;
END_PROGRAM`).join('\n');
        // the values IDLE and RUN take 0x2000 and 0x2002; s is the 16-bit INT after them
        expect(code).toMatch(/STORE16 0x2004/);
        expect(code).toMatch(/LOAD16 0x2004/);
        expect(code).not.toMatch(/(LOAD|STORE)32 0x2004/);
    });

    it('replaces Type#Value by the value of the enumeration', () => {
        const code = cycle(`
TYPE A : (X, Y); END_TYPE
TYPE B : (Y, Z); END_TYPE
PROGRAM P
VAR n : INT; END_VAR
  n := B#Z;
END_PROGRAM`).join('\n');
        expect(code).toContain('PUSH8 1');
        expect(rejected(`TYPE A : (X); END_TYPE\nPROGRAM P\nVAR n : INT; END_VAR\n  n := A#Q;\nEND_PROGRAM`)).toEqual({
            line: 4,
            message: "'Q' is not a value of the enumeration 'A'",
        });
    });
});

describe('arrays (CMP-022, CMP-023)', () => {
    it('refuses a constant index outside the bounds with the line of the access', () => {
        const error = rejected(`
PROGRAM P
VAR a : ARRAY[1..4] OF INT; END_VAR
  a[1] := 1;
  a[5] := 2;
END_PROGRAM`);
        expect(error.line).toBe(5);
        expect(error.message).toBe("Array index 5 is outside the bounds 1..4 of 'a'");
    });

    it('checks a variable index at run time by default and not when it is switched off', () => {
        const source = `
PROGRAM P
VAR a : ARRAY[0..3] OF INT; i : INT; END_VAR
  a[i] := 1;
END_PROGRAM`;
        expect(cycle(source).join('\n')).toContain('LTU');
        expect(cycle(source).join('\n')).toContain('fault: array index out of bounds');
        expect(cycle(source, { arrayBoundsCheck: false }).join('\n')).not.toContain('LTU');
    });

    it('needs no run-time check for a constant index', () => {
        const code = cycle(`
PROGRAM P
VAR a : ARRAY[0..3] OF INT; END_VAR
  a[2] := 1;
END_PROGRAM`).join('\n');
        expect(code).not.toContain('LTU');
        expect(code).toMatch(/STORE16 0x2004/);
    });

    it('reads bounds written as constant expressions', () => {
        const unit = parse(`
VAR_GLOBAL CONSTANT N : INT := 3; END_VAR
PROGRAM P
VAR a : ARRAY[-N..N * 2] OF INT; END_VAR
END_PROGRAM`);
        const table = buildSymbolTable(unit);
        expect(table.get('a')!.size).toBe((3 + 6 + 1) * 2);
    });

    it('rejects a bound that is not a constant', () => {
        expect(rejected('PROGRAM P\nVAR n : INT; a : ARRAY[0..n] OF INT; END_VAR\nEND_PROGRAM').message).toContain(
            'integer constant expression',
        );
    });

    it('rejects a wrong number of indices', () => {
        expect(
            rejected(`
PROGRAM P
VAR a : ARRAY[0..1, 0..1] OF INT; END_VAR
  a[1] := 1;
END_PROGRAM`).message,
        ).toContain('2 dimensions, 1 given');
    });

    it('rejects too many initial values', () => {
        expect(rejected('PROGRAM P\nVAR a : ARRAY[0..1] OF INT := [1, 2, 3]; END_VAR\nEND_PROGRAM').message).toContain(
            'Too many initial values',
        );
    });

    it('fills a long repeat with a loop, not with one store per element', () => {
        const code = asm('PROGRAM P\nVAR a : ARRAY[0..199] OF INT := [200(5)]; END_VAR\nEND_PROGRAM');
        expect(code).toContain('fill_loop');
        expect(code.split('\n').filter((line) => /STORE16/.test(line)).length).toBeLessThan(10);
    });
});

describe('references (CMP-024)', () => {
    it('accepts REF() of a variable of the target type and refuses another', () => {
        expect(() => asm('PROGRAM P\nVAR x : INT; p : REF_TO INT; END_VAR\n  p := REF(x);\nEND_PROGRAM')).not.toThrow();
        const error = rejected('PROGRAM P\nVAR x : REAL; p : REF_TO INT; END_VAR\n  p := REF(x);\nEND_PROGRAM');
        expect(error.line).toBe(3);
        expect(error.message).toContain('REF_TO REAL');
    });

    it('refuses a reference stored in a number and the dereference of a number', () => {
        expect(rejected('PROGRAM P\nVAR x : DINT; y : DINT; END_VAR\n  x := REF(y);\nEND_PROGRAM').message).toContain(
            'only a REF_TO variable holds one',
        );
        expect(rejected('PROGRAM P\nVAR x : INT; y : INT; END_VAR\n  y := x^;\nEND_PROGRAM').message).toContain('is not a reference');
    });

    it('starts a REF_TO variable as NULL, the address no region contains', () => {
        const code = asm('PROGRAM P\nVAR p : REF_TO INT; END_VAR\nEND_PROGRAM');
        expect(code).toContain('PUSH16 65535');
        expect(code).toContain('STORE32 0x2000');
    });
});

describe('initial values (CMP-025, CMP-026, CMP-027)', () => {
    it('initialises globals, function-block members and structure defaults at the first scan', () => {
        const code = asm(`
TYPE Pt : STRUCT x : INT := 3; END_STRUCT END_TYPE
VAR_GLOBAL g : INT := 42; END_VAR
FUNCTION_BLOCK Start
VAR_OUTPUT v : INT := 5; END_VAR
END_FUNCTION_BLOCK
PROGRAM P
VAR f : Start; p : Pt; END_VAR
END_PROGRAM`);
        const init = code.slice(code.indexOf('Variable Initialization'), code.indexOf('Mark as initialized'));
        expect(init).toContain('PUSH8 42');
        expect(init).toContain('PUSH8 5');
        expect(init).toContain('PUSH8 3');
    });

    it('applies the fields of a structure initialiser over the defaults and refuses an unknown field', () => {
        const code = asm(`
TYPE Pt : STRUCT x : INT := 3; y : INT := 4; END_STRUCT END_TYPE
PROGRAM P
VAR p : Pt := (y := 9); END_VAR
END_PROGRAM`);
        const init = code.slice(code.indexOf('Variable Initialization'), code.indexOf('Mark as initialized'));
        expect(init).toContain('PUSH8 3');
        expect(init).toContain('PUSH8 9');
        expect(init).not.toContain('PUSH8 4');
        expect(
            rejected(`
TYPE Pt : STRUCT x : INT; END_STRUCT END_TYPE
PROGRAM P
VAR p : Pt := (q := 1); END_VAR
END_PROGRAM`).message,
        ).toContain("Unknown member 'q'");
    });

    it('refuses an assignment to a constant, a global constant and a function-block constant', () => {
        expect(
            rejected(`
PROGRAM P
VAR CONSTANT K : INT := 5; END_VAR
  K := 6;
END_PROGRAM`),
        ).toEqual({ line: 4, message: "Cannot assign to constant 'K'" });
        expect(
            rejected(`
VAR_GLOBAL CONSTANT G : INT := 5; END_VAR
PROGRAM P
  G := 6;
END_PROGRAM`).line,
        ).toBe(4);
        expect(
            rejected(`
FUNCTION_BLOCK F
VAR CONSTANT LIM : INT := 5; END_VAR
  LIM := 6;
END_FUNCTION_BLOCK
PROGRAM P
VAR f : F; END_VAR
  f();
END_PROGRAM`).line,
        ).toBe(4);
    });

    it('writes the VAR_TEMP of a function block again at each call', () => {
        const code = cycle(`
FUNCTION_BLOCK T
VAR_OUTPUT o : INT; END_VAR
VAR_TEMP k : INT := 10; END_VAR
  k := k + 1;
  o := k;
END_FUNCTION_BLOCK
PROGRAM P
VAR f : T; END_VAR
  f();
  f();
END_PROGRAM`).join('\n');
        expect(code.match(/; f\.k := \.\.\./g)?.length).toBe(2);
    });

    it('writes the locals of a function at the start of every call', () => {
        const code = asm(`
FUNCTION Count : INT
VAR_INPUT x : INT; END_VAR
VAR k : INT := 7; END_VAR
  k := k + x;
  Count := k;
END_FUNCTION
PROGRAM P
VAR r : INT; END_VAR
  r := Count(1);
END_PROGRAM`);
        const start = code.indexOf('func_Count:');
        const init = code.indexOf('PUSH8 7', start);
        expect(init).toBeGreaterThan(start);
        expect(init).toBeLessThan(code.indexOf('; RETURN Count', start));
    });
});

describe('VAR_IN_OUT (CMP-028)', () => {
    const block = `
FUNCTION_BLOCK Inc
VAR_IN_OUT x : INT; END_VAR
  x := x + 1;
END_FUNCTION_BLOCK`;

    it('passes the address of the caller variable and goes through it in the body', () => {
        const code = cycle(`${block}
PROGRAM P
VAR f : Inc; v : INT; END_VAR
  f(x := v);
END_PROGRAM`).join('\n');
        expect(code).toContain('f.x -> v');
        expect(code).toMatch(/LOAD32 0x2000 {3}; reference/);
        expect(code).toContain('LOADI16');
        expect(code).toContain('STOREI16');
    });

    it('refuses a variable of another type and a constant', () => {
        expect(
            rejected(`${block}
PROGRAM P
VAR f : Inc; v : DINT; END_VAR
  f(x := v);
END_PROGRAM`).message,
        ).toContain('VAR_IN_OUT');
        expect(
            rejected(`${block}
VAR_GLOBAL CONSTANT K : INT := 1; END_VAR
PROGRAM P
VAR f : Inc; END_VAR
  f(x := K);
END_PROGRAM`).message,
        ).toContain('constant');
    });
});

describe('strings (CMP-021)', () => {
    it('refuses a literal longer than the capacity, in an assignment and in an initial value', () => {
        expect(
            rejected(`
PROGRAM P
VAR s : STRING[3]; END_VAR
  s := 'abcd';
END_PROGRAM`),
        ).toEqual({ line: 4, message: "String literal of 4 characters does not fit 's' (STRING[3] holds 3)" });
        expect(
            rejected(`
PROGRAM P
VAR s : STRING[3] := 'abcd'; END_VAR
END_PROGRAM`).line,
        ).toBe(3);
    });

    it('writes the capacity of each string at the first scan', () => {
        const code = asm('PROGRAM P\nVAR s : STRING[20]; END_VAR\nEND_PROGRAM');
        expect(code).toContain('PUSH16 20');
        expect(code).toContain('STORE16 0x2002');
    });

    it('copies the characters of an assignment instead of the address of the literal', () => {
        const code = cycle(`
PROGRAM P
VAR s : STRING[10]; END_VAR
  s := 'hello';
END_PROGRAM`).join('\n');
        expect(code).toContain('STRCPY');
        expect(code).not.toMatch(/STORE32 0x2000/);
    });

    it('builds a string function result in a buffer that is not its argument', () => {
        const code = cycle(`
PROGRAM P
VAR s : STRING[10]; n AT %QW0 : INT; END_VAR
  n := LEN(LEFT(s, 2));
END_PROGRAM`).join('\n');
        // the result is a work buffer after the variable (0x2000..0x2009)
        expect(code).toContain('string buffer capacity');
        expect(code).toMatch(/call|CALL _zplc_strappend/);
    });

    it('works on the variable itself when it is assigned to its own argument', () => {
        const code = cycle(`
PROGRAM P
VAR s : STRING[10]; END_VAR
  s := LEFT(s, 2);
END_PROGRAM`).join('\n');
        expect(code).toContain('in place');
        expect(code).toContain('CALL _zplc_strsub');
        expect(code).not.toContain('string buffer capacity');
    });

    it('builds the result in the destination when nothing the call reads overlaps it', () => {
        const code = cycle(`
PROGRAM P
VAR s : STRING[10]; t : STRING[10]; END_VAR
  s := CONCAT(t, 'x');
END_PROGRAM`).join('\n');
        expect(code).toContain('built in place');
        expect(code).not.toContain('string buffer capacity');
    });

    it('refuses a WSTRING where only one-byte strings work', () => {
        expect(
            rejected(`
PROGRAM P
VAR w : WSTRING[5]; v : WSTRING[5]; n AT %QW0 : INT; END_VAR
  n := FIND(w, v);
END_PROGRAM`).message,
        ).toContain('WSTRING');
    });
});

describe('what cannot be copied by value', () => {
    it('refuses a whole structure where a number is expected and a function that returns one', () => {
        expect(
            rejected(`
TYPE Pt : STRUCT x : INT; END_STRUCT END_TYPE
PROGRAM P
VAR p : Pt; n : DINT; END_VAR
  n := p;
END_PROGRAM`).message,
        ).toContain('use one of its members');
        expect(
            rejected(`
TYPE Pt : STRUCT x : INT; END_STRUCT END_TYPE
FUNCTION Make : Pt
VAR_INPUT a : INT; END_VAR
END_FUNCTION
PROGRAM P
VAR n : INT; END_VAR
END_PROGRAM`).message,
        ).toContain('returns Pt');
    });

    it('copies a long structure with the byte routine and a short one with words', () => {
        const small = asm(`
TYPE S : STRUCT a : DINT; b : DINT; END_STRUCT END_TYPE
PROGRAM P
VAR x : S; y : S; END_VAR
  y := x;
END_PROGRAM`);
        expect(small).not.toContain('_zplc_memcpy');
        const big = asm(`
TYPE B : STRUCT a : ARRAY[0..19] OF DINT; END_STRUCT END_TYPE
PROGRAM P
VAR x : B; y : B; z : ARRAY[0..1] OF B; i : INT; END_VAR
  z[i] := x;
END_PROGRAM`);
        expect(big).toContain('CALL _zplc_memcpy');
    });
});
