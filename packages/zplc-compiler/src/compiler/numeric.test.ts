/**
 * Numeric semantics of the code generator (CMP-011 to CMP-014)
 *
 * SPDX-License-Identifier: MIT
 *
 * The conformance cases under conformance/cmp run whole programs on the native VM. This file
 * covers what a program cannot sweep: the helper routines over their edge operands and the shape
 * of the generated assembly (which helper is linked, which extension follows a narrow load).
 */

import { describe, it, expect } from 'bun:test';

import { assemble } from '../assembler/index.ts';
import { generate } from './codegen.ts';
import { compileST } from './index.ts';
import {
    ADD64_HELPER,
    ADD64_LABEL,
    CMP64_HELPER,
    CMP64S_LABEL,
    CMP64U_LABEL,
    FCMP_HELPER,
    FCMP_LABEL,
    LITERAL_INT,
    SUB64_HELPER,
    SUB64_LABEL,
    UDIV32_HELPER,
    UDIV32_LABEL,
    UNKNOWN_TYPE,
    UNSIGNED_TO_REAL,
    cmp64Test,
    commonType,
    floatBits,
    fcmpTest,
    type CompareOp,
} from './numeric.ts';
import { parse } from './parser.ts';

// ============================================================================
// A reference VM for the opcodes the generated code uses: 32-bit cells, as zplc_core.c
// ============================================================================

function run(source: string, memory: Uint8Array = new Uint8Array(0x10000)): number[] {
    const { bytecode } = assemble(source);
    const ram = new DataView(memory.buffer, memory.byteOffset, memory.byteLength);
    const code = bytecode;
    const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
    const stack: number[] = [];
    const calls: number[] = [];
    const float = new DataView(new ArrayBuffer(4));
    const toFloat = (bits: number): number => { float.setUint32(0, bits >>> 0, true); return float.getFloat32(0, true); };
    const toBits = (value: number): number => { float.setFloat32(0, value, true); return float.getUint32(0, true); };
    const pop = (): number => {
        const value = stack.pop();
        if (value === undefined) throw new Error('stack underflow');
        return value >>> 0;
    };
    let pc = 0;
    for (let steps = 0; steps < 100_000; steps += 1) {
        const op = code[pc]!;
        switch (op) {
            case 0x01: return stack.map((v) => v >>> 0); // HALT
            case 0x10: { const a = pop(); stack.push(a, a); pc += 1; break; }
            case 0x11: pop(); pc += 1; break;
            case 0x12: { const b = pop(); const a = pop(); stack.push(b, a); pc += 1; break; }
            case 0x13: { const b = pop(); const a = pop(); stack.push(a, b, a); pc += 1; break; }
            case 0x14: { const c = pop(); const b = pop(); const a = pop(); stack.push(b, c, a); pc += 1; break; }
            case 0x20: { const b = pop(); const a = pop(); stack.push((a + b) >>> 0); pc += 1; break; }
            case 0x21: { const b = pop(); const a = pop(); stack.push((a - b) >>> 0); pc += 1; break; }
            case 0x22: { const b = pop(); const a = pop(); stack.push(Number((BigInt(a) * BigInt(b)) & 0xFFFFFFFFn)); pc += 1; break; }
            case 0x23: {
                const b = pop(); const a = pop();
                if (b === 0) throw new Error('division by zero');
                stack.push(b === 0xFFFFFFFF ? (0 - a) >>> 0 : (Math.trunc((a | 0) / (b | 0)) >>> 0));
                pc += 1; break;
            }
            case 0x24: {
                const b = pop(); const a = pop();
                if (b === 0) throw new Error('division by zero');
                stack.push(b === 0xFFFFFFFF ? 0 : (((a | 0) % (b | 0)) >>> 0));
                pc += 1; break;
            }
            case 0x25: { const a = pop(); stack.push((0 - a) >>> 0); pc += 1; break; }
            case 0x26: { const a = pop(); stack.push(a >>> 31 ? (0 - a) >>> 0 : a); pc += 1; break; }
            case 0x28: { const b = pop(); const a = pop(); stack.push(toBits(toFloat(a) + toFloat(b))); pc += 1; break; }
            case 0x29: { const b = pop(); const a = pop(); stack.push(toBits(toFloat(a) - toFloat(b))); pc += 1; break; }
            case 0x2A: { const b = pop(); const a = pop(); stack.push(toBits(toFloat(a) * toFloat(b))); pc += 1; break; }
            case 0x2B: {
                const b = pop(); const a = pop();
                if (toFloat(b) === 0) throw new Error('division by zero');
                stack.push(toBits(toFloat(a) / toFloat(b)));
                pc += 1; break;
            }
            case 0x2C: { const a = pop(); stack.push((a ^ 0x80000000) >>> 0); pc += 1; break; }
            case 0x2D: { const a = pop(); stack.push((a & 0x7FFFFFFF) >>> 0); pc += 1; break; }
            case 0x33: { const a = pop(); stack.push((~a) >>> 0); pc += 1; break; }
            case 0x30: { const b = pop(); const a = pop(); stack.push((a & b) >>> 0); pc += 1; break; }
            case 0x31: { const b = pop(); const a = pop(); stack.push((a | b) >>> 0); pc += 1; break; }
            case 0x32: { const b = pop(); const a = pop(); stack.push((a ^ b) >>> 0); pc += 1; break; }
            case 0x34: { const b = pop(); const a = pop(); stack.push(b >= 32 ? 0 : (a << b) >>> 0); pc += 1; break; }
            case 0x35: { const b = pop(); const a = pop(); stack.push(b >= 32 ? 0 : a >>> b); pc += 1; break; }
            case 0x36: { const b = pop(); const a = pop(); stack.push((a | 0) >> Math.min(b, 31) >>> 0); pc += 1; break; }
            case 0x38: { const b = pop(); const a = pop(); stack.push(a === b ? 1 : 0); pc += 1; break; }
            case 0x39: { const b = pop(); const a = pop(); stack.push(a !== b ? 1 : 0); pc += 1; break; }
            case 0x3A: { const b = pop(); const a = pop(); stack.push((a | 0) < (b | 0) ? 1 : 0); pc += 1; break; }
            case 0x3B: { const b = pop(); const a = pop(); stack.push((a | 0) <= (b | 0) ? 1 : 0); pc += 1; break; }
            case 0x3C: { const b = pop(); const a = pop(); stack.push((a | 0) > (b | 0) ? 1 : 0); pc += 1; break; }
            case 0x3D: { const b = pop(); const a = pop(); stack.push((a | 0) >= (b | 0) ? 1 : 0); pc += 1; break; }
            case 0x3E: { const b = pop(); const a = pop(); stack.push(a < b ? 1 : 0); pc += 1; break; }
            case 0x3F: { const b = pop(); const a = pop(); stack.push(a > b ? 1 : 0); pc += 1; break; }
            case 0x40: stack.push((view.getInt8(pc + 1)) >>> 0); pc += 2; break;
            case 0x41: { const n = code[pc + 1]!; stack.push(stack[stack.length - 1 - n]!); pc += 2; break; }
            case 0x80: stack.push(ram.getUint8(view.getUint16(pc + 1, true))); pc += 3; break;
            case 0x81: stack.push(ram.getUint16(view.getUint16(pc + 1, true), true)); pc += 3; break;
            case 0x82: stack.push(ram.getUint32(view.getUint16(pc + 1, true), true)); pc += 3; break;
            case 0x83: {
                const at = view.getUint16(pc + 1, true);
                stack.push(ram.getUint32(at, true), ram.getUint32(at + 4, true)); pc += 3; break;
            }
            case 0x84: ram.setUint8(view.getUint16(pc + 1, true), pop()); pc += 3; break;
            case 0x85: ram.setUint16(view.getUint16(pc + 1, true), pop(), true); pc += 3; break;
            case 0x86: ram.setUint32(view.getUint16(pc + 1, true), pop(), true); pc += 3; break;
            case 0x87: {
                const at = view.getUint16(pc + 1, true);
                const high = pop(); const low = pop();
                ram.setUint32(at, low, true); ram.setUint32(at + 4, high, true); pc += 3; break;
            }
            case 0x88: stack.push(view.getInt16(pc + 1, true) >>> 0); pc += 3; break;
            case 0xC0: stack.push(view.getUint32(pc + 1, true)); pc += 5; break;
            case 0x90: pc = view.getUint16(pc + 1, true); break;
            case 0x91: pc = pop() === 0 ? view.getUint16(pc + 1, true) : pc + 3; break;
            case 0x92: pc = pop() !== 0 ? view.getUint16(pc + 1, true) : pc + 3; break;
            case 0x93: calls.push(pc + 3); pc = view.getUint16(pc + 1, true); break;
            case 0x94: pc = calls.pop()!; break;
            case 0xA0: { const a = pop(); stack.push(toBits(a | 0)); pc += 1; break; }
            case 0xA1: {
                const f = toFloat(pop());
                stack.push(Number.isNaN(f) ? 0 : f >= 2147483648 ? 0x7FFFFFFF : f <= -2147483648 ? 0x80000000 : Math.trunc(f) >>> 0);
                pc += 1; break;
            }
            case 0xA3: { const a = pop(); stack.push(((a << 24) >> 24) >>> 0); pc += 1; break; }
            case 0xA4: { const a = pop(); stack.push(((a << 16) >> 16) >>> 0); pc += 1; break; }
            case 0xA5: { const a = pop(); stack.push(a & 0xFF); pc += 1; break; }
            case 0xA6: { const a = pop(); stack.push(a & 0xFFFF); pc += 1; break; }
            default: throw new Error(`reference VM: opcode 0x${op.toString(16)} at ${pc}`);
        }
    }
    throw new Error('reference VM: did not halt');
}

const push = (value: number): string => `    PUSH32 ${value >>> 0}`;

// ============================================================================
// Helper routines
// ============================================================================

describe('unsigned 32-bit division helper', () => {
    const operands = [0, 1, 2, 3, 7, 10, 255, 256, 65535, 65536, 1000000007, 0x7FFFFFFE, 0x7FFFFFFF, 0x80000000,
        0x80000001, 0xAAAAAAAA, 3000000000, 4000000000, 0xFFFFFFFE, 0xFFFFFFFF];
    const divide = (a: number, b: number): number =>
        run([push(a), push(b), `    CALL ${UDIV32_LABEL}`, '    HALT', ...UDIV32_HELPER].join('\n'))[0]!;

    it('equals the integer quotient for every pair of edge operands', () => {
        for (const a of operands) {
            for (const b of operands.filter((value) => value !== 0)) {
                expect(divide(a, b)).toBe(Number(BigInt(a) / BigInt(b)));
            }
        }
    });

    it('faults on a divisor of 0, as the signed division does', () => {
        for (const a of [0, 5, 0x80000000, 0xFFFFFFFF]) {
            expect(() => divide(a, 0)).toThrow('division by zero');
        }
    });

    it('leaves exactly the quotient on the stack', () => {
        expect(run([push(4147483647), push(3), `    CALL ${UDIV32_LABEL}`, '    HALT', ...UDIV32_HELPER].join('\n'))).toEqual([1382494549]);
    });
});

describe('REAL comparison helper', () => {
    const bits = (value: number): number => floatBits(value);
    const operands: number[] = [
        bits(0), bits(-0), bits(1), bits(-1), bits(1.5), bits(-1.5), bits(3e38), bits(-3e38), 1, 0x80000001,
        bits(Infinity), bits(-Infinity), 0x7FC00000, 0xFFC00001, 0x7F800001, bits(1e-30), bits(-1e-30), bits(16777216), bits(16777217),
    ];
    const asFloat = (pattern: number): number => {
        const view = new DataView(new ArrayBuffer(4));
        view.setUint32(0, pattern >>> 0, true);
        return view.getFloat32(0, true);
    };
    const compare = (op: CompareOp, a: number, b: number): boolean =>
        run([push(a), push(b), `    CALL ${FCMP_LABEL}`, ...fcmpTest(op), '    HALT', ...FCMP_HELPER].join('\n'))[0] === 1;
    const reference: Record<CompareOp, (x: number, y: number) => boolean> = {
        EQ: (x, y) => x === y, NE: (x, y) => x !== y, LT: (x, y) => x < y, LE: (x, y) => x <= y, GT: (x, y) => x > y, GE: (x, y) => x >= y,
    };

    for (const op of ['EQ', 'NE', 'LT', 'LE', 'GT', 'GE'] as CompareOp[]) {
        it(`${op} follows IEEE 754 for every pair of edge operands, NaN and the two zeros included`, () => {
            for (const a of operands) {
                for (const b of operands) {
                    expect(compare(op, a, b)).toBe(reference[op](asFloat(a), asFloat(b)));
                }
            }
        });
    }
});

describe('64-bit helpers', () => {
    const operands: bigint[] = [0n, 1n, 2n, 0xFFFFFFFFn, 0x100000000n, 0x100000001n, 0x7FFFFFFFFFFFFFFFn,
        0x8000000000000000n, 0x8000000000000001n, 0xFFFFFFFF00000000n, 0xFFFFFFFFFFFFFFFEn, 0xFFFFFFFFFFFFFFFFn,
        0x00000000FFFFFFFFn + 1n, 0x123456789ABCDEF0n, 0xFEDCBA9876543210n];
    const lo = (v: bigint): number => Number(v & 0xFFFFFFFFn);
    const hi = (v: bigint): number => Number((v >> 32n) & 0xFFFFFFFFn);
    const pair = (v: bigint): string => `${push(lo(v))}\n${push(hi(v))}`;
    const signed = (v: bigint): bigint => BigInt.asIntN(64, v);
    const join = (cells: number[]): bigint => (BigInt(cells[1]!) << 32n) | BigInt(cells[0]!);

    it('ADD64 and SUB64 wrap modulo 2^64 for every pair of edge operands', () => {
        for (const a of operands) {
            for (const b of operands) {
                const sum = run([pair(a), pair(b), `    CALL ${ADD64_LABEL}`, '    HALT', ...ADD64_HELPER].join('\n'));
                expect(join(sum)).toBe(BigInt.asUintN(64, a + b));
                const difference = run([pair(a), pair(b), `    CALL ${SUB64_LABEL}`, '    HALT', ...SUB64_HELPER].join('\n'));
                expect(join(difference)).toBe(BigInt.asUintN(64, a - b));
            }
        }
    });

    for (const [name, label, view] of [['signed', CMP64S_LABEL, signed], ['unsigned', CMP64U_LABEL, (v: bigint) => v]] as const) {
        it(`CMP64 orders ${name} values for every pair of edge operands and every operator`, () => {
            const ops: Record<CompareOp, (x: bigint, y: bigint) => boolean> = {
                EQ: (x, y) => x === y, NE: (x, y) => x !== y, LT: (x, y) => x < y, LE: (x, y) => x <= y, GT: (x, y) => x > y, GE: (x, y) => x >= y,
            };
            for (const a of operands) {
                for (const b of operands) {
                    for (const op of Object.keys(ops) as CompareOp[]) {
                        const result = run([pair(a), pair(b), `    CALL ${label}`, ...cmp64Test(op), '    HALT', ...CMP64_HELPER].join('\n'));
                        expect(result).toEqual([ops[op](view(a), view(b)) ? 1 : 0]);
                    }
                }
            }
        });
    }
});

describe('unsigned 32-bit to REAL conversion', () => {
    it('rounds once, to nearest, for the whole range', () => {
        const values = [0, 1, 65535, 65536, 16777217, 0x7FFFFFFF, 0x80000000, 0x80000001, 3000000000, 0xFFFFFF7F, 0xFFFFFFFF];
        for (const value of values) {
            const result = run([push(value), ...UNSIGNED_TO_REAL, '    HALT'].join('\n'))[0]!;
            expect(result).toBe(floatBits(Math.fround(value)));
        }
    });
});

// ============================================================================
// Type rules
// ============================================================================

describe('commonType', () => {
    it('lets REAL win over every integer and LREAL over REAL', () => {
        expect(commonType('INT', 'REAL')).toBe('REAL');
        expect(commonType('REAL', 'UDINT')).toBe('REAL');
        expect(commonType('REAL', 'LREAL')).toBe('LREAL');
    });

    it('takes the wider integer, and the unsigned one of two of the same width', () => {
        expect(commonType('INT', 'DINT')).toBe('DINT');
        expect(commonType('DINT', 'UDINT')).toBe('UDINT');
        expect(commonType('INT', 'UINT')).toBe('UINT');
        expect(commonType('SINT', 'BYTE')).toBe('BYTE');
        expect(commonType('TIME', 'DINT')).toBe('TIME');
    });

    it('adopts the type of the other side for a literal or an operand it does not know', () => {
        expect(commonType(LITERAL_INT, 'UDINT')).toBe('UDINT');
        expect(commonType('INT', LITERAL_INT)).toBe('INT');
        expect(commonType(UNKNOWN_TYPE, 'REAL')).toBe('REAL');
        expect(commonType(LITERAL_INT, LITERAL_INT)).toBe(LITERAL_INT);
    });
});

// ============================================================================
// Shape of the generated assembly
// ============================================================================

function assembly(body: string, vars: string): string {
    return generate(parse(`PROGRAM Test\nVAR\n${vars}\nEND_VAR\n${body}\nEND_PROGRAM`).programs[0]);
}

describe('generated code', () => {
    it('restores the sign of an INT and a SINT after the zero-extending load, and not of an unsigned type', () => {
        const asm = assembly('d := i + s + u;', 'i : INT; s : SINT; u : UINT; d : DINT;');
        expect(asm).toMatch(/LOAD16 0x2000[^\n]*\n\s+EXT16/);
        expect(asm).toMatch(/LOAD8 0x2002[^\n]*\n\s+EXT8/);
        expect(asm).not.toMatch(/LOAD16 0x2003[^\n]*\n\s+EXT16/);
    });

    it('links no helper into a program that needs none', () => {
        const asm = assembly('d := a + b; ok := a < b;', 'a : DINT; b : DINT; d : DINT; ok : BOOL;');
        expect(asm).not.toContain(UDIV32_LABEL);
        expect(asm).not.toContain(FCMP_LABEL);
    });

    it('links the division helper once for a program that divides unsigned values', () => {
        const asm = assembly('q := a / b; r := a MOD b;', 'a : UDINT; b : UDINT; q : UDINT; r : UDINT;');
        expect(asm.match(new RegExp(`^${UDIV32_LABEL}:`, 'gm'))?.length).toBe(1);
        expect(asm).toContain(`CALL ${UDIV32_LABEL}`);
    });

    it('links the comparison helper for REAL operands only', () => {
        const real = assembly('ok := a < b;', 'a : REAL; b : REAL; ok : BOOL;');
        expect(real).toContain(`CALL ${FCMP_LABEL}`);
        const integer = assembly('ok := a < b;', 'a : INT; b : INT; ok : BOOL;');
        expect(integer).not.toContain(FCMP_LABEL);
    });

    it('compares an unsigned 32-bit type with the unsigned opcodes', () => {
        const asm = assembly('ok := a > b; le := a <= b;', 'a : UDINT; b : UDINT; ok : BOOL; le : BOOL;');
        expect(asm).toContain('    GTU');
        expect(asm).not.toMatch(/^\s+(GT|LE)$/m);
    });

    it('converts an integer operand of REAL arithmetic and an integer assigned to a REAL', () => {
        const mixed = assembly('r := i * f;', 'i : INT; f : REAL; r : REAL;');
        expect(mixed).toMatch(/EXT16\n\s+I2F\n[^]*MULF/);
        const literal = assembly('r := 3;', 'r : REAL;');
        expect(literal).toContain(`PUSH32 ${floatBits(3)}`);
    });

    it('keeps a BYTE or WORD complement within its width and a DWORD whole', () => {
        expect(assembly('y := NOT x;', 'x : BYTE; y : BYTE;')).toMatch(/NOT\n\s+ZEXT8/);
        expect(assembly('y := NOT x;', 'x : WORD; y : WORD;')).toMatch(/NOT\n\s+ZEXT16/);
        const dword = assembly('y := NOT x;', 'x : DWORD; y : DWORD;');
        expect(dword).toMatch(/NOT\n\s+STORE32/);
    });

    it('negates a REAL with NEGF and an integer with NEG', () => {
        expect(assembly('y := -x;', 'x : REAL; y : REAL;')).toContain('NEGF');
        const integer = assembly('y := -x;', 'x : DINT; y : DINT;');
        expect(integer).toMatch(/\n\s+NEG\n/);
        expect(integer).not.toContain('NEGF');
    });

    it('rejects an integer literal that does not fit its signed 32-bit type, as the assembler did', () => {
        expect(() => assembly('x := 5000000000;', 'x : DINT;')).toThrow('does not fit DINT');
        expect(() => assembly('x := 3000000000;', 'x : DINT;')).toThrow('does not fit DINT');
        expect(() => assembly('ok := x > 3000000000;', 'x : DINT; ok : BOOL;')).toThrow('does not fit a signed 32-bit integer');
    });

    it('reads -2147483648 as one constant, not as 2147483648 negated', () => {
        const asm = assembly('x := -2147483648;', 'x : DINT;');
        expect(asm).toContain('PUSH32 -2147483648');
        expect(asm).not.toMatch(/\n\s+NEG\n/);
    });

    it('accepts such a literal for an unsigned 32-bit type', () => {
        expect(assembly('x := 3000000000;', 'x : UDINT;')).toContain('PUSH32 3000000000');
        expect(assembly('ok := x > 3000000000;', 'x : UDINT; ok : BOOL;')).toContain('PUSH32 3000000000');
        expect(assembly('x := 4294967295;', 'x : DWORD;')).toContain('PUSH32 4294967295');
    });

    it('links the 64-bit routines a program uses and no others', () => {
        const asm = assembly('b := a + 1; ok := b > a;', 'a : LINT; b : LINT; ok : BOOL;');
        expect(asm).toContain(`CALL ${ADD64_LABEL}`);
        expect(asm).toContain(`CALL ${CMP64S_LABEL}`);
        expect(asm).not.toContain(SUB64_LABEL);
        expect(asm).not.toContain(UDIV32_LABEL);
        const unsigned = assembly('ok := a > b;', 'a : ULINT; b : ULINT; ok : BOOL;');
        expect(unsigned).toContain(`CALL ${CMP64U_LABEL}`);
    });

    it('widens the 32-bit side of a 64-bit operation: sign word for a signed value, 0 for an unsigned one', () => {
        expect(assembly('b := a + s;', 'a : LINT; b : LINT; s : DINT;')).toMatch(/LOAD32 0x2010[^\n]*\n\s+DUP\n\s+PUSH8 31\n\s+SAR/);
        expect(assembly('b := a + u;', 'a : LINT; b : LINT; u : UDINT;')).toMatch(/LOAD32 0x2010[^\n]*\n\s+PUSH8 0\n\s+CALL/);
    });

    it('refuses what a 64-bit or LREAL value cannot be used for, with the reason', () => {
        const wide = 'a : LINT; b : LINT; c : DINT; arr : ARRAY[0..3] OF DINT; d : LREAL;';
        expect(() => assembly('c := arr[a];', wide)).toThrow('array index must be a 32-bit integer');
        expect(() => assembly('FOR d := 0 TO 3 DO c := 1; END_FOR;', wide)).toThrow('FOR counter must be an integer');
        expect(() => assembly('CASE d OF 1: c := 1; END_CASE;', wide)).toThrow('CASE selector must be an integer');
        expect(() => assembly('c := LEN(a);', wide)).toThrow('does not take a 64-bit or LREAL argument');
        expect(() => assembly('d := d AND d;', wide)).toThrow('Type mismatch');
        expect(() => assembly('d := d MOD d;', wide)).toThrow('MOD takes integers');
    });
});

// ============================================================================
// Whole programs on the reference VM
// ============================================================================

type Scalar = { name: string; bits: 8 | 16 | 32; signed: boolean; letter: 'B' | 'W' | 'D'; values: bigint[] };

const SCALARS: Scalar[] = [
    { name: 'SINT', bits: 8, signed: true, letter: 'B', values: [-128n, -127n, -1n, 0n, 1n, 126n, 127n] },
    { name: 'INT', bits: 16, signed: true, letter: 'W', values: [-32768n, -32767n, -1n, 0n, 1n, 32766n, 32767n] },
    { name: 'DINT', bits: 32, signed: true, letter: 'D', values: [-2147483648n, -2147483647n, -1n, 0n, 1n, 2147483646n, 2147483647n] },
    { name: 'USINT', bits: 8, signed: false, letter: 'B', values: [0n, 1n, 2n, 127n, 128n, 254n, 255n] },
    { name: 'BYTE', bits: 8, signed: false, letter: 'B', values: [0n, 1n, 127n, 128n, 255n] },
    { name: 'UINT', bits: 16, signed: false, letter: 'W', values: [0n, 1n, 2n, 32767n, 32768n, 65534n, 65535n] },
    { name: 'WORD', bits: 16, signed: false, letter: 'W', values: [0n, 1n, 32767n, 32768n, 65535n] },
    { name: 'UDINT', bits: 32, signed: false, letter: 'D', values: [0n, 1n, 2n, 2147483647n, 2147483648n, 4294967294n, 4294967295n] },
    { name: 'DWORD', bits: 32, signed: false, letter: 'D', values: [0n, 1n, 2147483647n, 2147483648n, 4294967295n] },
];

function readScalar(memory: Uint8Array, scalar: Scalar): bigint {
    const view = new DataView(memory.buffer, 0x1000, 4);
    if (scalar.bits === 8) return BigInt(scalar.signed ? view.getInt8(0) : view.getUint8(0));
    if (scalar.bits === 16) return BigInt(scalar.signed ? view.getInt16(0, true) : view.getUint16(0, true));
    return BigInt(scalar.signed ? view.getInt32(0, true) : view.getUint32(0, true));
}

function execute(program: string): Uint8Array {
    const memory = new Uint8Array(0x10000);
    run(compileST(program), memory);
    return memory;
}

const wrap = (scalar: Scalar, value: bigint): bigint =>
    scalar.signed ? BigInt.asIntN(scalar.bits, value) : BigInt.asUintN(scalar.bits, value);

describe('executed programs: integer operators at the limits of their type', () => {
    const arithmetic: Array<[string, (a: bigint, b: bigint) => bigint]> = [
        ['+', (a, b) => a + b], ['-', (a, b) => a - b], ['*', (a, b) => a * b],
        ['/', (a, b) => a / b], ['MOD', (a, b) => a % b],
    ];
    const comparison: Array<[string, (a: bigint, b: bigint) => boolean]> = [
        ['<', (a, b) => a < b], ['<=', (a, b) => a <= b], ['>', (a, b) => a > b],
        ['>=', (a, b) => a >= b], ['=', (a, b) => a === b], ['<>', (a, b) => a !== b],
    ];

    for (const scalar of SCALARS) {
        it(`${scalar.name} arithmetic wraps at its width and divides toward zero`, () => {
            for (const [operator, apply] of arithmetic) {
                for (const a of scalar.values) {
                    for (const b of scalar.values) {
                        if ((operator === '/' || operator === 'MOD') && b === 0n) continue;
                        const memory = execute(`PROGRAM T
VAR
  a : ${scalar.name} := ${a};
  b : ${scalar.name} := ${b};
  r AT %Q${scalar.letter}0 : ${scalar.name};
END_VAR
  r := a ${operator} b;
END_PROGRAM`);
                        const observed = readScalar(memory, scalar);
                        const expected = wrap(scalar, apply(a, b));
                        if (observed !== expected) {
                            throw new Error(`${scalar.name} ${a} ${operator} ${b}: expected ${expected}, observed ${observed}`);
                        }
                    }
                }
            }
        });

        it(`${scalar.name} comparison orders by the value, signed or unsigned as the type says`, () => {
            for (const [operator, test] of comparison) {
                for (const a of scalar.values) {
                    for (const b of scalar.values) {
                        const memory = execute(`PROGRAM T
VAR
  a : ${scalar.name} := ${a};
  b : ${scalar.name} := ${b};
  r AT %QX0.0 : BOOL;
END_VAR
  r := a ${operator} b;
END_PROGRAM`);
                        const observed = (memory[0x1000]! & 1) === 1;
                        if (observed !== test(a, b)) {
                            throw new Error(`${scalar.name} ${a} ${operator} ${b}: expected ${test(a, b)}, observed ${observed}`);
                        }
                    }
                }
            }
        });
    }

    it('widens a narrow value to DINT and UDINT with its own sign rule', () => {
        for (const scalar of SCALARS.filter((s) => s.bits < 32)) {
            for (const a of scalar.values) {
                const memory = execute(`PROGRAM T
VAR
  a : ${scalar.name} := ${a};
  wide AT %QD0 : DINT;
END_VAR
  wide := a;
END_PROGRAM`);
                expect(new DataView(memory.buffer, 0x1000, 4).getInt32(0, true)).toBe(Number(a));
            }
        }
    });
});

describe('executed programs: REAL operators', () => {
    const literals = ['-2.5', '-1.0', '0.0', '1.5', '3.25', '-3.0E38', '3.0E38', '1.0E-30'];
    const values = literals.map((text) => Math.fround(Number(text)));
    const arithmetic: Array<[string, (a: number, b: number) => number]> = [
        ['+', (a, b) => a + b], ['-', (a, b) => a - b], ['*', (a, b) => a * b], ['/', (a, b) => a / b],
    ];
    const comparison: Array<[string, (a: number, b: number) => boolean]> = [
        ['<', (a, b) => a < b], ['<=', (a, b) => a <= b], ['>', (a, b) => a > b],
        ['>=', (a, b) => a >= b], ['=', (a, b) => a === b], ['<>', (a, b) => a !== b],
    ];

    it('arithmetic is single precision, with negative operands', () => {
        for (const [operator, apply] of arithmetic) {
            literals.forEach((la, i) => literals.forEach((lb, j) => {
                const a = values[i]!; const b = values[j]!;
                if (operator === '/' && b === 0) return;
                const result = Math.fround(apply(a, b));
                // an overflow to infinity is not a case for this table
                if (!Number.isFinite(result)) return;
                const memory = execute(`PROGRAM T
VAR
  a : REAL := ${la};
  b : REAL := ${lb};
  r AT %QD0 : REAL;
END_VAR
  r := a ${operator} b;
END_PROGRAM`);
                const observed = new DataView(memory.buffer, 0x1000, 4).getFloat32(0, true);
                if (!Object.is(observed, result)) throw new Error(`${la} ${operator} ${lb}: expected ${result}, observed ${observed}`);
            }));
        }
    });

    it('comparison is the IEEE order', () => {
        for (const [operator, test] of comparison) {
            literals.forEach((la, i) => literals.forEach((lb, j) => {
                const memory = execute(`PROGRAM T
VAR
  a : REAL := ${la};
  b : REAL := ${lb};
  r AT %QX0.0 : BOOL;
END_VAR
  r := a ${operator} b;
END_PROGRAM`);
                const observed = (memory[0x1000]! & 1) === 1;
                if (observed !== test(values[i]!, values[j]!)) throw new Error(`${la} ${operator} ${lb}: expected ${test(values[i]!, values[j]!)}, observed ${observed}`);
            }));
        }
    });

    it('an INT operand is converted with its sign before REAL arithmetic', () => {
        for (const n of [-32768, -1, 0, 1, 32767]) {
            const memory = execute(`PROGRAM T
VAR
  n : INT := ${n};
  g : REAL := 0.5;
  r AT %QD0 : REAL;
END_VAR
  r := n * g;
END_PROGRAM`);
            expect(new DataView(memory.buffer, 0x1000, 4).getFloat32(0, true)).toBe(Math.fround(n * 0.5));
        }
    });
});
