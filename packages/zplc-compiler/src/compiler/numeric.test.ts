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
// A reference VM for the opcodes the helpers use: 32-bit cells, as zplc_core.c
// ============================================================================

function run(source: string): number[] {
    const { bytecode } = assemble(source);
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
    for (let steps = 0; steps < 10_000; steps += 1) {
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
            case 0x28: { const b = pop(); const a = pop(); stack.push(toBits(toFloat(a) + toFloat(b))); pc += 1; break; }
            case 0x2A: { const b = pop(); const a = pop(); stack.push(toBits(toFloat(a) * toFloat(b))); pc += 1; break; }
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
            case 0x88: stack.push(view.getInt16(pc + 1, true) >>> 0); pc += 3; break;
            case 0xC0: stack.push(view.getUint32(pc + 1, true)); pc += 5; break;
            case 0x90: pc = view.getUint16(pc + 1, true); break;
            case 0x91: pc = pop() === 0 ? view.getUint16(pc + 1, true) : pc + 3; break;
            case 0x92: pc = pop() !== 0 ? view.getUint16(pc + 1, true) : pc + 3; break;
            case 0x93: calls.push(pc + 3); pc = view.getUint16(pc + 1, true); break;
            case 0x94: pc = calls.pop()!; break;
            case 0xA0: { const a = pop(); stack.push(toBits(a | 0)); pc += 1; break; }
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
        expect(() => assembly('x := 5000000000;', 'x : DINT;')).toThrow('does not fit a signed 32-bit integer');
        expect(() => assembly('x := 3000000000;', 'x : DINT;')).toThrow('does not fit a signed 32-bit integer');
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

    it('refuses what a 64-bit value cannot do yet, naming the requirement', () => {
        const wide = 'a : LINT; b : LINT; c : DINT;';
        expect(() => assembly('b := a * 2;', wide)).toThrow('CMP-015');
        expect(() => assembly('b := a / 2;', wide)).toThrow('CMP-015');
        expect(() => assembly('b := a MOD 2;', wide)).toThrow('CMP-015');
        expect(() => assembly('b := ABS(a);', wide)).toThrow('64-bit argument');
        expect(() => assembly('FOR a := 0 TO 3 DO c := 1; END_FOR;', wide)).toThrow('FOR counter');
        expect(() => assembly('CASE a OF 1: c := 1; END_CASE;', wide)).toThrow('CASE');
    });
});
