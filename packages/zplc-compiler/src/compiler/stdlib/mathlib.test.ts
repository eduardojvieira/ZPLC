/**
 * Accuracy of the REAL math routines (CMP-058)
 *
 * SPDX-License-Identifier: MIT
 *
 * Each routine of mathlib.ts runs on the instruction simulator (routine-sim.ts) over a dense grid and is
 * compared with Math.*. The bounds are the ones stated in mathlib.ts and in
 * docs/docs/runtime/stdlib.md; each is about 1.3 times the largest error measured, so a change that
 * costs a bit of precision shows here. The same functions run on the real VM in
 * conformance/cmp/cmp-058-*.st.
 */

import { describe, expect, test } from 'bun:test';
import { asReal, bitsOf, simulate } from './routine-sim.ts';
import {
    ACOSF_LABEL, ASINF_LABEL, ATAN2F_LABEL, ATANF_LABEL, EXPF_LABEL, LOG2G_LABEL, SINCOSF_LABEL, SQRTF_LABEL, TANF_LABEL,
} from './mathlib.ts';

/** A repeatable pseudo-random sequence in [0, 1). */
function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

const linear = (from: number, to: number, count: number): number[] =>
    Array.from({ length: count + 1 }, (_, index) => Math.fround(from + ((to - from) * index) / count));

function logarithmic(from: number, to: number, count: number, seed: number): number[] {
    const next = seeded(seed);
    return Array.from({ length: count }, () => Math.fround(Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * next())));
}

const call = (label: string, ...args: number[]): number => asReal(simulate(label, args.map(bitsOf)).stack[0]!);
const sine = (x: number): number => asReal(simulate(SINCOSF_LABEL, [bitsOf(x), 0]).stack[0]!);
const cosine = (x: number): number => asReal(simulate(SINCOSF_LABEL, [bitsOf(x), 1]).stack[0]!);
// LN and LOG scale the base-2 logarithm by a REAL constant, as the code of math.ts does
const ln = (x: number): number => Math.fround(call(LOG2G_LABEL, x) * Math.fround(Math.LN2));
const log10 = (x: number): number => Math.fround(call(LOG2G_LABEL, x) * Math.fround(Math.LOG10E * Math.LN2));

/** The largest |got - want| and |got - want| / |want| over the grid. */
function worst(grid: number[], got: (x: number) => number, want: (x: number) => number): { absolute: number; relative: number } {
    let absolute = 0;
    let relative = 0;
    for (const x of grid) {
        const expected = want(x);
        const error = Math.abs(got(x) - expected);
        if (!(error <= absolute)) absolute = error;
        const ratio = error / Math.abs(expected);
        if (Number.isFinite(ratio) && ratio > relative) relative = ratio;
    }
    return { absolute, relative };
}

describe('mathlib accuracy against Math.*', () => {
    test('SQRT: relative 1.3e-7 over 1e-45 to 1e30', () => {
        for (const grid of [logarithmic(1e-45, 1e30, 10000, 1), linear(0.0001, 100, 10000)]) {
            expect(worst(grid, (x) => call(SQRTF_LABEL, x), Math.sqrt).relative).toBeLessThan(1.3e-7);
        }
    });

    test('EXP: relative 1.3e-7 from -87 to 88', () => {
        expect(worst(linear(-87, 88, 20000), (x) => call(EXPF_LABEL, x), Math.exp).relative).toBeLessThan(1.3e-7);
        expect(worst(linear(-1, 1, 10000), (x) => call(EXPF_LABEL, x), Math.exp).relative).toBeLessThan(1.3e-7);
    });

    test('LN and LOG: relative 3e-7 over the whole range of REAL, subnormals included', () => {
        const grid = [...logarithmic(1e-45, 1e37, 20000, 2), ...linear(0.1, 10, 10000)].filter((x) => x !== 1);
        expect(worst(grid, ln, Math.log).relative).toBeLessThan(3e-7);
        expect(worst(grid, log10, Math.log10).relative).toBeLessThan(3e-7);
        // the points the requirement names
        expect(Math.abs(ln(10) - 2.302585)).toBeLessThan(1e-6);
        expect(Math.abs(log10(1000) - 3)).toBeLessThan(1e-6);
        expect(ln(1)).toBe(0);
    });

    test('SIN and COS: absolute 2e-7 to |x| of 1000 and 2e-6 below 100000', () => {
        for (const [reference, f] of [[Math.sin, sine], [Math.cos, cosine]] as const) {
            expect(worst(linear(-1000, 1000, 30000), f, reference).absolute).toBeLessThan(2e-7);
            expect(worst(linear(-99999, 99999, 30000), f, reference).absolute).toBeLessThan(2e-6);
            // the multiples of pi/2 and their neighbours
            const edges = Array.from({ length: 400 }, (_, k) => Math.fround((k - 200) * (Math.PI / 2)));
            expect(worst(edges, f, reference).absolute).toBeLessThan(2e-7);
        }
    });

    test('SIN and COS of a large angle: absolute 2e-6 up to 2^40, as for a small one', () => {
        // the exact sine of the REAL (Math.sin reduces a double exactly) is the reference
        const grids = [
            linear(100000, 1000000, 8000),
            linear(1e6, 1e9, 8000),
            logarithmic(1e5, 2 ** 40, 12000, 21),
            logarithmic(1e5, 2 ** 40, 12000, 22).map((x) => -x),
            [100000, 100001, 131072, 2 ** 24, 2 ** 30, 2 ** 31, 1e9, 1e10, 2 ** 36, 2 ** 40 - 2 ** 16].map(Math.fround),
        ];
        for (const grid of grids) {
            expect(worst(grid, sine, Math.sin).absolute).toBeLessThan(2e-6);
            expect(worst(grid, cosine, Math.cos).absolute).toBeLessThan(2e-6);
        }
    });

    test('SIN and COS of an angle up to 2^48: absolute 1e-4 (the part of 2 pi the stages do not hold grows with x)', () => {
        const grid = [...logarithmic(2 ** 40, 2 ** 48, 8000, 23), ...logarithmic(2 ** 40, 2 ** 48, 8000, 24).map((x) => -x)];
        expect(worst(grid, sine, Math.sin).absolute).toBeLessThan(1e-4);
        expect(worst(grid, cosine, Math.cos).absolute).toBeLessThan(1e-4);
    });

    test('TAN of a large angle: within the error of its angle, up to 2^40', () => {
        // an angle error of 2e-6 moves tan by 2e-6 * (1 + tan^2); the result adds a rounding of 5e-7 of its size
        const grid = [...linear(100000, 1e9, 12000), ...logarithmic(1e5, 2 ** 40, 12000, 25)].filter((x) => Math.abs(Math.cos(x)) > 0.01);
        const excess = grid.map((x) => {
            const want = Math.tan(x);
            return Math.abs(call(TANF_LABEL, x) - want) - (2e-6 * (1 + want * want) + 5e-7 * Math.abs(want));
        });
        expect(Math.max(...excess)).toBeLessThanOrEqual(0);
    });

    test('TAN: relative 3e-7 for |x| up to 1000', () => {
        expect(worst(linear(-1000, 1000, 30000), (x) => call(TANF_LABEL, x), Math.tan).relative).toBeLessThan(3e-7);
    });

    test('ATAN: absolute 2e-7 for every REAL', () => {
        const grid = [...linear(-10, 10, 20000), ...logarithmic(1e-12, 1e30, 10000, 3), ...logarithmic(1e-12, 1e30, 10000, 4).map((x) => -x)];
        expect(worst(grid, (x) => call(ATANF_LABEL, x), Math.atan).absolute).toBeLessThan(2e-7);
    });

    test('ASIN and ACOS: absolute 4e-7 over -1 to 1, the ends included', () => {
        const grid = [...linear(-1, 1, 20000), Math.fround(1 - 2 ** -24), Math.fround(-1 + 2 ** -24), 0, -0];
        expect(worst(grid, (x) => call(ASINF_LABEL, x), Math.asin).absolute).toBeLessThan(4e-7);
        expect(worst(grid, (x) => call(ACOSF_LABEL, x), Math.acos).absolute).toBeLessThan(4e-7);
    });

    test('ATAN2: absolute 4e-7 in every quadrant', () => {
        const next = seeded(5);
        let worstError = 0;
        for (let i = 0; i < 20000; i += 1) {
            const y = Math.fround((next() - 0.5) * 2 * 10 ** (Math.floor(next() * 12) - 6));
            const x = Math.fround((next() - 0.5) * 2 * 10 ** (Math.floor(next() * 12) - 6));
            worstError = Math.max(worstError, Math.abs(call(ATAN2F_LABEL, y, x) - Math.atan2(y, x)));
        }
        expect(worstError).toBeLessThan(4e-7);
    });
});

describe('mathlib special values', () => {
    const real = (bits: number): number => asReal(bits);

    test('SQRT of zero, a negative number and the limits', () => {
        expect(call(SQRTF_LABEL, 0)).toBe(0);
        expect(call(SQRTF_LABEL, -4)).toBe(0);
        expect(call(SQRTF_LABEL, Infinity)).toBe(Infinity);
        expect(Number.isNaN(call(SQRTF_LABEL, NaN))).toBe(true);
        expect(real(simulate(SQRTF_LABEL, [0xffc00000]).stack[0]!)).toBeNaN();
        expect(call(SQRTF_LABEL, 16)).toBe(4);
    });

    test('EXP at the ends of its range', () => {
        expect(call(EXPF_LABEL, 0)).toBe(1);
        expect(call(EXPF_LABEL, 89)).toBe(Infinity);
        expect(call(EXPF_LABEL, Infinity)).toBe(Infinity);
        expect(call(EXPF_LABEL, -Infinity)).toBe(0);
        expect(call(EXPF_LABEL, -104)).toBe(0);
        expect(Number.isNaN(call(EXPF_LABEL, NaN))).toBe(true);
        expect(call(EXPF_LABEL, 88.7)).toBeGreaterThan(3e38);
    });

    test('LN of zero, a negative number and infinity', () => {
        expect(call(LOG2G_LABEL, 0)).toBe(-Infinity);
        expect(call(LOG2G_LABEL, -0)).toBe(-Infinity);
        expect(Number.isNaN(call(LOG2G_LABEL, -1))).toBe(true);
        expect(Number.isNaN(call(LOG2G_LABEL, NaN))).toBe(true);
        expect(call(LOG2G_LABEL, Infinity)).toBe(Infinity);
        expect(call(LOG2G_LABEL, 8)).toBe(3);
    });

    test('SIN and COS of 0, of NaN and of infinity', () => {
        expect(sine(0)).toBe(0);
        expect(cosine(0)).toBe(1);
        expect(Number.isNaN(sine(NaN))).toBe(true);
        expect(Number.isNaN(cosine(NaN))).toBe(true);
        expect(Number.isNaN(sine(Infinity))).toBe(true);
        expect(Number.isNaN(cosine(-Infinity))).toBe(true);
        expect(Number.isNaN(call(TANF_LABEL, Infinity))).toBe(true);
    });

    test('SIN, COS and TAN of a finite angle are finite, whatever its size', () => {
        const largest = 3.4028234663852886e38;
        const angles = [100000, -100000, 1e6, 1e9, -1e9, 2 ** 31, 2 ** 40, 2 ** 48, 2 ** 60, 1e20, 1e30, largest, -largest];
        for (const angle of angles) {
            const x = Math.fround(angle);
            expect(Math.abs(sine(x))).toBeLessThanOrEqual(1);
            expect(Math.abs(cosine(x))).toBeLessThanOrEqual(1);
            expect(Number.isFinite(call(TANF_LABEL, x))).toBe(true);
        }
    });

    test('ASIN, ACOS and ATAN2 at the corners', () => {
        expect(call(ASINF_LABEL, 1)).toBeCloseTo(Math.PI / 2, 6);
        expect(call(ASINF_LABEL, -1)).toBeCloseTo(-Math.PI / 2, 6);
        expect(Number.isNaN(call(ASINF_LABEL, 1.0001))).toBe(true);
        expect(call(ACOSF_LABEL, 1)).toBe(0);
        expect(call(ACOSF_LABEL, -1)).toBeCloseTo(Math.PI, 6);
        expect(Number.isNaN(call(ACOSF_LABEL, -2))).toBe(true);
        expect(call(ATAN2F_LABEL, 0, 0)).toBe(0);
        expect(call(ATAN2F_LABEL, 0, -1)).toBeCloseTo(Math.PI, 6);
        expect(call(ATAN2F_LABEL, -0, -1)).toBeCloseTo(-Math.PI, 6);
        expect(call(ATAN2F_LABEL, 1, 0)).toBeCloseTo(Math.PI / 2, 6);
        expect(call(ATAN2F_LABEL, -1, 0)).toBeCloseTo(-Math.PI / 2, 6);
        expect(call(ATANF_LABEL, Infinity)).toBeCloseTo(Math.PI / 2, 6);
        expect(call(ATANF_LABEL, -Infinity)).toBeCloseTo(-Math.PI / 2, 6);
        expect(real(simulate(ATANF_LABEL, [0x7fc00000]).stack[0]!)).toBeNaN();
    });
});

describe('mathlib stack discipline', () => {
    const next = seeded(9);
    const patterns = Array.from({ length: 6000 }, () => (Math.imul(next() * 4294967296, 1) >>> 0));
    // an exponent field of every value, with a random mantissa and sign, and the neighbours of 0, 1 and infinity
    const edges = [0, 0x80000000, 0x00000001, 0x007fffff, 0x00800000, 0x3f800000, 0xbf800000, 0x7f7fffff, 0x7f800000, 0xff800000, 0x7fc00000, 0xffc00000];
    const routines: Array<[string, number]> = [
        [SQRTF_LABEL, 1], [LOG2G_LABEL, 1], [EXPF_LABEL, 1], [TANF_LABEL, 1], [ATANF_LABEL, 1], [ASINF_LABEL, 1], [ACOSF_LABEL, 1],
        [SINCOSF_LABEL, 2], [ATAN2F_LABEL, 2],
    ];

    for (const [label, arity] of routines) {
        test(`${label} leaves exactly one value and never divides by zero, on ${patterns.length + edges.length * edges.length} patterns`, () => {
            let longest = 0;
            const run = (args: number[]): void => {
                const result = simulate(label, args);
                expect(result.stack.length).toBe(1);
                longest = Math.max(longest, result.steps);
            };
            for (const bits of [...patterns, ...edges]) {
                // sin/cos and atan2 take a second argument: the phase 0 or 1, and any REAL
                if (label === SINCOSF_LABEL) run([bits, bits & 1]);
                else if (arity === 1) run([bits]);
                else run([bits, patterns[(bits >>> 7) % patterns.length]!]);
            }
            if (arity === 2) for (const a of edges) for (const b of edges) run(label === SINCOSF_LABEL ? [a, b & 1] : [a, b]);
            // no loop depends on the argument: the longest run is a fixed number of instructions (mathlib.ts states them)
            const bound = label === SINCOSF_LABEL ? 430 : label === TANF_LABEL ? 520 : 250;
            expect(longest).toBeLessThanOrEqual(bound);
        });
    }
});
