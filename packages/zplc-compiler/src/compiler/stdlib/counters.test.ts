/**
 * ZPLC Standard Library - Counter behaviour, scan by scan
 *
 * SPDX-License-Identifier: MIT
 *
 * Runs the assembly that CTU, CTD and CTUD generate on a small model of the VM, one call per scan, and compares the
 * members after each call with the IEC 61131-3 definition. The model knows only the opcodes the counters emit and
 * throws on any other, so a new opcode fails here instead of being skipped. The same scenarios run on the real VM
 * as conformance cases (conformance/cmp/cmp-058-ct*); these tests need no native runtime.
 */

import { describe, expect, test } from 'bun:test';
import { getFB } from './index.ts';
import type { CodeGenContext } from './types.ts';

const BASE = 0x2000;

type Instruction = [op: string, operand: string | undefined];

/** A counter instance with its memory; each scan() call writes the named members, runs the generated code, and reads the members back. */
function counter(name: 'CTU' | 'CTD' | 'CTUD', pv: number) {
    const fb = getFB(name)!;
    const lines: string[] = [];
    let labelCount = 0;
    const ctx: CodeGenContext = {
        baseAddress: BASE,
        instanceName: 'c',
        newLabel: (prefix) => `${prefix}_${labelCount++}`,
        emit: (line) => lines.push(line),
        emitExpression: () => {
            throw new Error('the test writes the inputs to memory');
        },
        fail: (message) => {
            throw new Error(message);
        },
    };
    fb.generateCall(ctx, []);

    const program: Instruction[] = [];
    const labels = new Map<string, number>();
    for (const raw of lines) {
        const text = raw.split(';')[0]!.trim();
        if (text === '') continue;
        if (text.endsWith(':')) labels.set(text.slice(0, -1), program.length);
        else program.push(text.split(/\s+/, 2) as Instruction);
    }

    const mem = new Uint8Array(0x100);
    const slot = (member: string) => fb.members.find((m) => m.name === member)!;
    const write = (member: string, value: number) => {
        const { offset, size } = slot(member);
        for (let i = 0; i < size; i += 1) mem[offset + i] = (value >> (8 * i)) & 0xff;
    };
    write('PV', pv);

    const run = () => {
        const stack: number[] = [];
        const target = (label?: string) => {
            if (label === undefined || !labels.has(label)) throw new Error(`unknown label ${label}`);
            return labels.get(label)! - 1; // the loop increments pc after the jump
        };
        let steps = 0;
        for (let pc = 0; pc < program.length; pc += 1) {
            if ((steps += 1) > 1000) throw new Error('the counter code does not terminate');
            const [op, operand] = program[pc]!;
            const n = Number(operand);
            const addr = n - BASE;
            const compare = (test: (a: number, b: number) => boolean) => {
                const b = stack.pop()!;
                stack.push(test(stack.pop()!, b) ? 1 : 0);
            };
            switch (op) {
                case 'LOAD8':
                    stack.push(mem[addr]!);
                    break;
                case 'LOAD16':
                    stack.push(mem[addr]! | (mem[addr + 1]! << 8));
                    break; // zero-extended, as the VM loads it
                case 'STORE8':
                    mem[addr] = stack.pop()! & 0xff;
                    break;
                case 'STORE16': {
                    const v = stack.pop()!;
                    mem[addr] = v & 0xff;
                    mem[addr + 1] = (v >> 8) & 0xff;
                    break;
                }
                case 'PUSH8':
                    stack.push((n << 24) >> 24);
                    break;
                case 'PUSH16':
                    stack.push((n << 16) >> 16);
                    break;
                case 'PUSH32':
                    stack.push(n | 0);
                    break;
                case 'EXT16':
                    stack.push((stack.pop()! << 16) >> 16);
                    break;
                case 'NOT':
                    stack.push(~stack.pop()!);
                    break;
                case 'AND':
                    stack.push(stack.pop()! & stack.pop()!);
                    break;
                case 'ADD':
                    stack.push((stack.pop()! + stack.pop()!) | 0);
                    break;
                case 'SUB': {
                    const b = stack.pop()!;
                    stack.push((stack.pop()! - b) | 0);
                    break;
                }
                case 'EQ':
                    compare((a, b) => a === b);
                    break;
                case 'NE':
                    compare((a, b) => a !== b);
                    break;
                case 'LT':
                    compare((a, b) => a < b);
                    break;
                case 'LE':
                    compare((a, b) => a <= b);
                    break;
                case 'GT':
                    compare((a, b) => a > b);
                    break;
                case 'GE':
                    compare((a, b) => a >= b);
                    break;
                case 'JMP':
                    pc = target(operand);
                    break;
                case 'JZ':
                    if (stack.pop() === 0) pc = target(operand);
                    break;
                case 'JNZ':
                    if (stack.pop() !== 0) pc = target(operand);
                    break;
                default:
                    throw new Error(`the VM model does not know ${op}`);
            }
        }
    };

    return {
        /** Write the given members (inputs, or CV to start a scenario next to a limit), run one scan, and return the outputs. */
        scan(set: Record<string, number>): Record<string, number> {
            for (const [member, value] of Object.entries(set)) write(member, value);
            run();
            const result: Record<string, number> = {};
            for (const m of fb.members.filter((member) => member.isOutput)) {
                result[m.name] = m.size === 1 ? mem[m.offset]! : ((mem[m.offset]! | (mem[m.offset + 1]! << 8)) << 16) >> 16;
            }
            return result;
        },
    };
}

/** Feed `[inputs, expected outputs]` rows to a fresh counter; compare only the outputs each row names. */
function replay(
    name: 'CTU' | 'CTD' | 'CTUD',
    pv: number,
    rows: Array<[Record<string, number>, Record<string, number>]>,
    start: Record<string, number> = {},
) {
    const instance = counter(name, pv);
    const observed = rows.map(([inputs, expected], index) => {
        const outputs = instance.scan(index === 0 ? { ...start, ...inputs } : inputs);
        return Object.fromEntries(Object.keys(expected).map((key) => [key, outputs[key]]));
    });
    expect(observed).toEqual(rows.map(([, expected]) => expected));
}

// ============================================================================
// CTU
// ============================================================================

describe('CTU scan by scan', () => {
    test('a pulse that rises while R is TRUE is not counted after R is released', () => {
        replay('CTU', 1, [
            [
                { CU: 0, R: 0 },
                { CV: 0, Q: 0 },
            ],
            [
                { CU: 0, R: 1 },
                { CV: 0, Q: 0 },
            ],
            [
                { CU: 1, R: 1 },
                { CV: 0, Q: 0 },
            ],
            [
                { CU: 1, R: 1 },
                { CV: 0, Q: 0 },
            ],
            [
                { CU: 1, R: 0 },
                { CV: 0, Q: 0 },
            ], // the edge was seen during Reset
            [
                { CU: 0, R: 0 },
                { CV: 0, Q: 0 },
            ],
            [
                { CU: 1, R: 0 },
                { CV: 1, Q: 1 },
            ],
        ]);
    });

    test('a pulse that rises on the scan R is released is counted when CU was FALSE on the scan before', () => {
        replay('CTU', 1, [
            [
                { CU: 1, R: 0 },
                { CV: 1, Q: 1 },
            ],
            [
                { CU: 1, R: 1 },
                { CV: 0, Q: 0 },
            ],
            [
                { CU: 0, R: 1 },
                { CV: 0, Q: 0 },
            ], // CU falls while R is held
            [
                { CU: 1, R: 0 },
                { CV: 1, Q: 1 },
            ],
        ]);
    });

    test('an input held high counts once', () => {
        replay('CTU', 3, [
            [{ CU: 1, R: 0 }, { CV: 1 }],
            [{ CU: 1, R: 0 }, { CV: 1 }],
            [{ CU: 0, R: 0 }, { CV: 1 }],
            [{ CU: 1, R: 0 }, { CV: 2 }],
        ]);
    });

    test('Q compares CV with a negative PV as signed values', () => {
        replay('CTU', -3, [
            [
                { CU: 0, R: 0 },
                { CV: 0, Q: 1 },
            ],
            [
                { CU: 1, R: 0 },
                { CV: 1, Q: 1 },
            ],
        ]);
    });

    test('CV stops at 32767 and R still clears it', () => {
        replay(
            'CTU',
            5,
            [
                [
                    { CU: 0, R: 0 },
                    { CV: 32766, Q: 1 },
                ],
                [
                    { CU: 1, R: 0 },
                    { CV: 32767, Q: 1 },
                ],
                [
                    { CU: 0, R: 0 },
                    { CV: 32767, Q: 1 },
                ],
                [
                    { CU: 1, R: 0 },
                    { CV: 32767, Q: 1 },
                ], // the edge at the limit is not counted
                [
                    { CU: 0, R: 1 },
                    { CV: 0, Q: 0 },
                ],
            ],
            { CV: 32766 },
        );
    });
});

// ============================================================================
// CTD
// ============================================================================

describe('CTD scan by scan', () => {
    test('a pulse that rises while LD is TRUE is not counted after LD is released', () => {
        replay('CTD', 3, [
            [
                { CD: 0, LD: 1 },
                { CV: 3, Q: 0 },
            ],
            [
                { CD: 1, LD: 1 },
                { CV: 3, Q: 0 },
            ],
            [
                { CD: 1, LD: 0 },
                { CV: 3, Q: 0 },
            ], // the edge was seen during Load
            [
                { CD: 0, LD: 0 },
                { CV: 3, Q: 0 },
            ],
            [
                { CD: 1, LD: 0 },
                { CV: 2, Q: 0 },
            ],
        ]);
    });

    test('a pulse that rises on the scan LD is released is counted when CD was FALSE on the scan before', () => {
        replay('CTD', 3, [
            [
                { CD: 1, LD: 0 },
                { CV: -1, Q: 1 },
            ], // never loaded: 0 counts down to -1
            [
                { CD: 1, LD: 1 },
                { CV: 3, Q: 0 },
            ],
            [
                { CD: 0, LD: 1 },
                { CV: 3, Q: 0 },
            ], // CD falls while LD is held
            [
                { CD: 1, LD: 0 },
                { CV: 2, Q: 0 },
            ],
        ]);
    });

    test('CV counts below 0 and Q stays TRUE', () => {
        replay('CTD', 1, [
            [
                { CD: 0, LD: 1 },
                { CV: 1, Q: 0 },
            ],
            [
                { CD: 1, LD: 0 },
                { CV: 0, Q: 1 },
            ],
            [
                { CD: 0, LD: 0 },
                { CV: 0, Q: 1 },
            ],
            [
                { CD: 1, LD: 0 },
                { CV: -1, Q: 1 },
            ],
            [
                { CD: 0, LD: 0 },
                { CV: -1, Q: 1 },
            ],
            [
                { CD: 1, LD: 0 },
                { CV: -2, Q: 1 },
            ],
        ]);
    });

    test('CV stops at -32768 and does not wrap to 32767', () => {
        replay(
            'CTD',
            0,
            [
                [
                    { CD: 1, LD: 0 },
                    { CV: -32768, Q: 1 },
                ],
                [
                    { CD: 0, LD: 0 },
                    { CV: -32768, Q: 1 },
                ],
                [
                    { CD: 1, LD: 0 },
                    { CV: -32768, Q: 1 },
                ],
            ],
            { CV: -32767 },
        );
    });
});

// ============================================================================
// CTUD
// ============================================================================

describe('CTUD scan by scan', () => {
    test('R beats an up edge and a down edge in the same scan', () => {
        replay('CTUD', 3, [
            [
                { CU: 0, CD: 0, R: 0, LD: 1 },
                { CV: 3, QU: 1, QD: 0 },
            ],
            [
                { CU: 1, CD: 0, R: 1, LD: 0 },
                { CV: 0, QU: 0, QD: 1 },
            ], // CU rises with R
            [
                { CU: 1, CD: 0, R: 0, LD: 0 },
                { CV: 0, QU: 0, QD: 1 },
            ], // R released while CU is high
            [
                { CU: 0, CD: 0, R: 0, LD: 1 },
                { CV: 3, QU: 1, QD: 0 },
            ],
            [
                { CU: 0, CD: 1, R: 1, LD: 0 },
                { CV: 0, QU: 0, QD: 1 },
            ], // CD rises with R
            [
                { CU: 0, CD: 1, R: 0, LD: 0 },
                { CV: 0, QU: 0, QD: 1 },
            ],
        ]);
    });

    test('LD beats an up edge and a down edge in the same scan', () => {
        replay('CTUD', 3, [
            [
                { CU: 1, CD: 0, R: 0, LD: 1 },
                { CV: 3, QU: 1, QD: 0 },
            ], // CU rises with LD: the preset, not the preset plus one
            [
                { CU: 1, CD: 0, R: 0, LD: 0 },
                { CV: 3, QU: 1, QD: 0 },
            ], // LD released while CU is high
            [
                { CU: 0, CD: 0, R: 0, LD: 0 },
                { CV: 3, QU: 1, QD: 0 },
            ],
            [
                { CU: 0, CD: 1, R: 0, LD: 1 },
                { CV: 3, QU: 1, QD: 0 },
            ], // CD rises with LD
            [
                { CU: 0, CD: 1, R: 0, LD: 0 },
                { CV: 3, QU: 1, QD: 0 },
            ],
        ]);
    });

    test('R beats LD', () => {
        replay('CTUD', 3, [
            [{ CU: 0, CD: 0, R: 0, LD: 1 }, { CV: 3 }],
            [{ CU: 0, CD: 0, R: 1, LD: 1 }, { CV: 0 }],
            [{ CU: 0, CD: 0, R: 0, LD: 1 }, { CV: 3 }],
        ]);
    });

    test('an up edge and a down edge in one scan cancel; a falling CU does not count', () => {
        replay('CTUD', 5, [
            [{ CU: 0, CD: 0, R: 0, LD: 1 }, { CV: 5 }],
            [{ CU: 1, CD: 1, R: 0, LD: 0 }, { CV: 5 }],
            [{ CU: 0, CD: 0, R: 0, LD: 0 }, { CV: 5 }],
            [{ CU: 1, CD: 0, R: 0, LD: 0 }, { CV: 6 }],
            [{ CU: 0, CD: 1, R: 0, LD: 0 }, { CV: 5 }],
        ]);
    });

    test('QU and QD compare CV with PV and with 0 as signed values', () => {
        replay('CTUD', -1, [
            [
                { CU: 0, CD: 1, R: 0, LD: 0 },
                { CV: -1, QU: 1, QD: 1 },
            ],
            [
                { CU: 0, CD: 0, R: 0, LD: 0 },
                { CV: -1, QU: 1, QD: 1 },
            ],
            [
                { CU: 0, CD: 1, R: 0, LD: 0 },
                { CV: -2, QU: 0, QD: 1 },
            ],
            [
                { CU: 0, CD: 0, R: 0, LD: 0 },
                { CV: -2, QU: 0, QD: 1 },
            ],
            [
                { CU: 1, CD: 0, R: 0, LD: 0 },
                { CV: -1, QU: 1, QD: 1 },
            ],
        ]);
    });

    test('CV stops at -32768 when counting down', () => {
        replay(
            'CTUD',
            0,
            [
                [{ CU: 0, CD: 1, R: 0, LD: 0 }, { CV: -32768 }],
                [{ CU: 0, CD: 0, R: 0, LD: 0 }, { CV: -32768 }],
                [{ CU: 0, CD: 1, R: 0, LD: 0 }, { CV: -32768 }],
            ],
            { CV: -32767 },
        );
    });

    test('CV stops at 32767, also when both edges arrive there', () => {
        replay('CTUD', 32767, [
            [
                { CU: 0, CD: 0, R: 0, LD: 1 },
                { CV: 32767, QU: 1 },
            ],
            [
                { CU: 1, CD: 0, R: 0, LD: 0 },
                { CV: 32767, QU: 1 },
            ],
            [
                { CU: 0, CD: 0, R: 0, LD: 0 },
                { CV: 32767, QU: 1 },
            ],
            [
                { CU: 1, CD: 1, R: 0, LD: 0 },
                { CV: 32767, QU: 1 },
            ],
        ]);
    });
});

// ============================================================================
// Layout: debug maps and retained programs depend on these offsets
// ============================================================================

describe('counter memory layout', () => {
    const layout = (name: string) => getFB(name)!.members.map((m) => [m.name, m.offset, m.size]);

    test('CTD keeps its layout', () => {
        expect(layout('CTD')).toEqual([
            ['CD', 0, 1],
            ['LD', 1, 1],
            ['_prev_cd', 2, 1],
            ['Q', 3, 1],
            ['PV', 4, 2],
            ['CV', 6, 2],
        ]);
    });

    test('CTUD keeps its layout', () => {
        expect(layout('CTUD')).toEqual([
            ['CU', 0, 1],
            ['CD', 1, 1],
            ['R', 2, 1],
            ['LD', 3, 1],
            ['_prev_cu', 4, 1],
            ['_prev_cd', 5, 1],
            ['QU', 6, 1],
            ['QD', 7, 1],
            ['PV', 8, 2],
            ['CV', 10, 2],
        ]);
    });
});
