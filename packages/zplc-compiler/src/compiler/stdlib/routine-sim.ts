/**
 * A small interpreter for the stdlib routines (stdlib/routines.ts), for tests.
 *
 * SPDX-License-Identifier: MIT
 *
 * The routines are assembly text, and their accuracy is a property of REAL arithmetic over a grid of
 * thousands of arguments, which a conformance case (one process of the native runtime per case) cannot
 * sweep. This runs one routine on the evaluation stack with the semantics of the instructions it
 * uses in firmware/lib/zplc_core/src/core/zplc_core.c: 32-bit cells, REAL results rounded to single
 * precision after every operation, F2I that truncates and saturates, DIVF that faults on a divisor of
 * 0.0. The double-precision opcodes (LREAL, two cells with the low word deeper) use the host's double,
 * which is IEEE 754 binary64 as the VM's integer implementation is. The tests that use it check the same routines on the real VM at chosen points
 * (conformance/cmp/cmp-058-*), so a difference between the two would be seen there.
 *
 * Not part of the compiler: only tests import it.
 */

import { getRoutine } from './routines.ts';

export interface SimResult {
    /** The stack after the final RET, bottom first, as unsigned 32-bit patterns. */
    stack: number[];
    /** Instructions executed. */
    steps: number;
    /** The deepest the stack became, counted from the arguments. */
    peak: number;
}

const view = new DataView(new ArrayBuffer(4));

/** The REAL a 32-bit pattern holds. */
export function asReal(bits: number): number {
    view.setUint32(0, bits >>> 0, true);
    return view.getFloat32(0, true);
}

/** The pattern of a REAL (rounded to single precision). */
export function bitsOf(value: number): number {
    view.setFloat32(0, value, true);
    return view.getUint32(0, true);
}

const wide = new DataView(new ArrayBuffer(8));

/** The LREAL a pair of 32-bit words holds (low word first). */
export function asDouble(low: number, high: number): number {
    wide.setUint32(0, low >>> 0, true);
    wide.setUint32(4, high >>> 0, true);
    return wide.getFloat64(0, true);
}

/** The two words, low first, of an LREAL. A NaN is the quiet NaN, as the VM makes it. */
export function wordsOf(value: number): [number, number] {
    if (Number.isNaN(value)) return [0, 0x7ff80000];
    wide.setFloat64(0, value, true);
    return [wide.getUint32(0, true), wide.getUint32(4, true)];
}

/** Round to the nearest integer, an exact half to the even one (the sign of a zero is kept). */
function rint(value: number): number {
    if (!Number.isFinite(value) || Math.abs(value) >= 2 ** 52) return value;
    const floor = Math.floor(value);
    const fraction = value - floor;
    let result = fraction < 0.5 ? floor : fraction > 0.5 ? floor + 1 : floor % 2 === 0 ? floor : floor + 1;
    if (result === 0 && (value < 0 || Object.is(value, -0))) result = -0;
    return result;
}

/** A double as the 64-bit pattern of the integer it truncates to (saturating); a NaN is 0. */
function toInteger64(value: number, signed: boolean): bigint {
    if (Number.isNaN(value)) return 0n;
    if (signed) {
        if (value >= 2 ** 63) return (1n << 63n) - 1n;
        if (value <= -(2 ** 63)) return BigInt.asUintN(64, -(1n << 63n));
        return BigInt.asUintN(64, BigInt(Math.trunc(value)));
    }
    if (value < 1) return 0n;
    if (value >= 2 ** 64) return (1n << 64n) - 1n;
    return BigInt(Math.trunc(value));
}

interface Instruction {
    op: string;
    arg?: number;
    label?: string;
}

function parseNumber(text: string): number {
    const value = text.toLowerCase().startsWith('-0x') ? -Number.parseInt(text.slice(1), 16) : Number(text);
    if (Number.isNaN(value)) throw new Error(`cannot read the operand ${text}`);
    return value;
}

const linked = new Map<string, { code: Instruction[]; labels: Map<string, number> }>();

/** The routine `label` and every routine it calls, as one program (parsed once). */
function link(label: string): { code: Instruction[]; labels: Map<string, number> } {
    const known = linked.get(label);
    if (known) return known;
    const program = build(label);
    linked.set(label, program);
    return program;
}

function build(label: string): { code: Instruction[]; labels: Map<string, number> } {
    const wanted: string[] = [];
    const add = (name: string): void => {
        if (wanted.includes(name)) return;
        const routine = getRoutine(name);
        if (!routine) throw new Error(`unknown routine ${name}`);
        wanted.push(name);
        routine.needs.forEach(add);
    };
    add(label);

    const code: Instruction[] = [];
    const labels = new Map<string, number>();
    for (const name of wanted) {
        for (const raw of getRoutine(name)!.lines) {
            const text = raw.replace(/;.*$/, '').trim();
            if (text === '') continue;
            const defined = /^([A-Za-z_][A-Za-z0-9_]*):$/.exec(text);
            if (defined) {
                labels.set(defined[1]!, code.length);
                continue;
            }
            const [op, operand] = text.split(/\s+/);
            const instruction: Instruction = { op: op!.toUpperCase() };
            if (operand !== undefined) {
                if (/^[A-Za-z_]/.test(operand)) instruction.label = operand;
                else instruction.arg = parseNumber(operand);
            }
            code.push(instruction);
        }
    }
    return { code, labels };
}

const MAX_STEPS = 100000;

/** Run `label` with `args` (patterns, bottom first). Throws on a fault, an underflow or a runaway loop. */
export function simulate(label: string, args: number[]): SimResult {
    const { code, labels } = link(label);
    const stack: number[] = args.map((value) => value >>> 0);
    const calls: number[] = [];
    let pc = labels.get(label);
    if (pc === undefined) throw new Error(`routine ${label} has no entry`);
    let steps = 0;
    let peak = 0;
    const floor = 0;

    const need = (count: number, op: string): void => {
        if (stack.length - floor < count) throw new Error(`${op}: stack underflow`);
    };
    const pop = (): number => stack.pop()!;
    const push = (value: number): void => {
        stack.push(value >>> 0);
        peak = Math.max(peak, stack.length - args.length);
    };
    const flag = (value: boolean): number => (value ? 1 : 0);
    const target = (instruction: Instruction): number => {
        const found = labels.get(instruction.label!);
        if (found === undefined) throw new Error(`unknown label ${instruction.label}`);
        return found;
    };

    for (;;) {
        if (++steps > MAX_STEPS) throw new Error('step limit exceeded');
        const instruction = code[pc];
        if (instruction === undefined) throw new Error('ran off the end of the routine');
        pc += 1;
        const { op } = instruction;
        switch (op) {
            case 'NOP': break;
            case 'PUSH8': case 'PUSH16': case 'PUSH32': push(instruction.arg!); break;
            case 'DUP': need(1, op); push(stack[stack.length - 1]!); break;
            case 'DROP': need(1, op); pop(); break;
            case 'SWAP': { need(2, op); const b = pop(); const a = pop(); push(b); push(a); break; }
            case 'OVER': need(2, op); push(stack[stack.length - 2]!); break;
            case 'ROT': { need(3, op); const c = pop(); const b = pop(); const a = pop(); push(b); push(c); push(a); break; }
            case 'PICK': need(instruction.arg! + 1, op); push(stack[stack.length - 1 - instruction.arg!]!); break;
            case 'ADD': { need(2, op); const b = pop(); const a = pop(); push(a + b); break; }
            case 'SUB': { need(2, op); const b = pop(); const a = pop(); push(a - b); break; }
            case 'MUL': { need(2, op); const b = pop(); const a = pop(); push(Math.imul(a, b)); break; }
            case 'NEG': { need(1, op); push(-pop()); break; }
            case 'AND': { need(2, op); const b = pop(); const a = pop(); push(a & b); break; }
            case 'OR': { need(2, op); const b = pop(); const a = pop(); push(a | b); break; }
            case 'XOR': { need(2, op); const b = pop(); const a = pop(); push(a ^ b); break; }
            case 'NOT': { need(1, op); push(~pop()); break; }
            case 'SHL': { need(2, op); const b = pop(); const a = pop(); push(b >= 32 ? 0 : a << b); break; }
            case 'SHR': { need(2, op); const b = pop(); const a = pop(); push(b >= 32 ? 0 : a >>> b); break; }
            case 'SAR': { need(2, op); const b = pop(); const a = pop(); push((a | 0) >> Math.min(b, 31)); break; }
            case 'EQ': { need(2, op); const b = pop(); const a = pop(); push(flag(a === b)); break; }
            case 'NE': { need(2, op); const b = pop(); const a = pop(); push(flag(a !== b)); break; }
            case 'LT': { need(2, op); const b = pop(); const a = pop(); push(flag((a | 0) < (b | 0))); break; }
            case 'LE': { need(2, op); const b = pop(); const a = pop(); push(flag((a | 0) <= (b | 0))); break; }
            case 'GT': { need(2, op); const b = pop(); const a = pop(); push(flag((a | 0) > (b | 0))); break; }
            case 'GE': { need(2, op); const b = pop(); const a = pop(); push(flag((a | 0) >= (b | 0))); break; }
            case 'LTU': { need(2, op); const b = pop(); const a = pop(); push(flag(a < b)); break; }
            case 'GTU': { need(2, op); const b = pop(); const a = pop(); push(flag(a > b)); break; }
            case 'ADDF': { need(2, op); const b = asReal(pop()); const a = asReal(pop()); push(bitsOf(a + b)); break; }
            case 'SUBF': { need(2, op); const b = asReal(pop()); const a = asReal(pop()); push(bitsOf(a - b)); break; }
            case 'MULF': { need(2, op); const b = asReal(pop()); const a = asReal(pop()); push(bitsOf(a * b)); break; }
            case 'DIVF': {
                need(2, op);
                const b = asReal(pop());
                const a = asReal(pop());
                if (b === 0) throw new Error('DIVF: division by zero');
                push(bitsOf(a / b));
                break;
            }
            case 'NEGF': { need(1, op); push(bitsOf(-asReal(pop()))); break; }
            case 'ABSF': { need(1, op); push(bitsOf(Math.abs(asReal(pop())))); break; }
            case 'I2F': { need(1, op); push(bitsOf(pop() | 0)); break; }
            case 'F2I': {
                need(1, op);
                const value = asReal(pop());
                push(Number.isNaN(value) ? 0 : value >= 2147483648 ? 0x7fffffff : value <= -2147483648 ? 0x80000000 : Math.trunc(value));
                break;
            }
            // double precision (CMP-015): two cells, the low word deeper
            case 'ADDD': case 'SUBD': case 'MULD': {
                need(4, op);
                const bh = pop(); const bl = pop(); const ah = pop(); const al = pop();
                const a = asDouble(al, ah);
                const b = asDouble(bl, bh);
                const [low, high] = wordsOf(op === 'ADDD' ? a + b : op === 'SUBD' ? a - b : a * b);
                push(low); push(high);
                break;
            }
            case 'ABSD': case 'NEGD': case 'RNDD': {
                need(2, op);
                const high = pop(); const low = pop();
                const value = asDouble(low, high);
                const [l, h] = wordsOf(op === 'ABSD' ? Math.abs(value) : op === 'NEGD' ? -value : rint(value));
                push(l); push(h);
                break;
            }
            case 'EQD': case 'NED': case 'LTD': case 'LED': case 'GTD': case 'GED': {
                need(4, op);
                const bh = pop(); const bl = pop(); const ah = pop(); const al = pop();
                const a = asDouble(al, ah);
                const b = asDouble(bl, bh);
                push(flag(op === 'EQD' ? a === b : op === 'NED' ? a !== b : op === 'LTD' ? a < b : op === 'LED' ? a <= b : op === 'GTD' ? a > b : a >= b));
                break;
            }
            case 'D2L': case 'D2U': {
                need(2, op);
                const high = pop(); const low = pop();
                const bits = toInteger64(asDouble(low, high), op === 'D2L');
                push(Number(bits & 0xffffffffn)); push(Number(bits >> 32n));
                break;
            }
            case 'L2D': case 'U2D': {
                need(2, op);
                const high = pop(); const low = pop();
                const bits = (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0);
                const [l, h] = wordsOf(Number(op === 'L2D' ? BigInt.asIntN(64, bits) : bits));
                push(l); push(h);
                break;
            }
            case 'F2D': { need(1, op); const [l, h] = wordsOf(asReal(pop())); push(l); push(h); break; }
            case 'D2F': { need(2, op); const high = pop(); const low = pop(); push(bitsOf(asDouble(low, high))); break; }
            case 'I2D': { need(1, op); const [l, h] = wordsOf(pop() | 0); push(l); push(h); break; }
            case 'I2B': { need(1, op); push(flag(pop() !== 0)); break; }
            case 'EXT8': { need(1, op); push((pop() << 24) >> 24); break; }
            case 'EXT16': { need(1, op); push((pop() << 16) >> 16); break; }
            case 'ZEXT8': { need(1, op); push(pop() & 0xff); break; }
            case 'ZEXT16': { need(1, op); push(pop() & 0xffff); break; }
            case 'JMP': pc = target(instruction); break;
            case 'JZ': { need(1, op); if (pop() === 0) pc = target(instruction); break; }
            case 'JNZ': { need(1, op); if (pop() !== 0) pc = target(instruction); break; }
            case 'CALL': calls.push(pc); pc = target(instruction); break;
            case 'RET': {
                const back = calls.pop();
                if (back === undefined) return { stack, steps, peak };
                pc = back;
                break;
            }
            default:
                throw new Error(`the simulator does not know ${op}`);
        }
    }
}
