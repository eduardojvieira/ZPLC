/**
 * The LREAL routines of the standard library (CMP-015, CMP-057), swept over many operands.
 *
 * SPDX-License-Identifier: MIT
 *
 * The conformance cases under conformance/cmp run each of these routines on the real VM at chosen
 * points; this file runs them on the routine simulator over grids and edge values and compares with a
 * reference written here with JavaScript numbers and BigInt, not with the routine's own method.
 */

import { describe, expect, test } from 'bun:test';

import { asDouble, simulate, wordsOf } from './routine-sim.ts';
import { D2U32_LABEL, ROUNDAD_LABEL, TRUNCD_LABEL } from './routines.ts';

const VALUES = [
    0,
    -0,
    0.1,
    -0.1,
    0.5,
    -0.5,
    0.49999999999999994,
    -0.49999999999999994,
    1,
    -1,
    1.5,
    -1.5,
    2.5,
    -2.5,
    3.5,
    -3.5,
    2.7,
    -2.7,
    123456789.5,
    -123456789.5,
    4503599627370495.5,
    -4503599627370495.5,
    4503599627370496,
    4503599627370497,
    9007199254740991,
    9007199254740992,
    9223372036854774784,
    9223372036854775808,
    -9223372036854775808,
    1e19,
    1e300,
    -1e300,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
    2.2250738585072014e-308,
    5e-324,
    Infinity,
    -Infinity,
    NaN,
    2147483647.5,
    2147483648,
    4294967295,
    4294967295.5,
    4294967296,
    -3000000000.25,
    3000000000.4,
];

function runDouble(label: string, value: number): number {
    const [low, high] = wordsOf(value);
    const result = simulate(label, [low, high]);
    expect(result.stack).toHaveLength(2);
    return asDouble(result.stack[0]!, result.stack[1]!);
}

const same = (got: number, want: number): void => {
    if (Number.isNaN(want)) expect(got).toBeNaN();
    else expect(Object.is(got, want) || got === want).toBe(true);
};

describe('TRUNC of an LREAL', () => {
    test.each(VALUES)('%p', (value) => {
        // beyond 2^63, an infinity and a NaN are returned as they are; below, the integer part
        const want = !Number.isFinite(value) || Math.abs(value) >= 2 ** 63 ? value : Math.trunc(value);
        const got = runDouble(TRUNCD_LABEL, value);
        // the sign of a zero result is not kept (documented): -0.4 gives +0.0
        if (want === 0) expect(got).toBe(0);
        else same(got, want);
    });

    test('has the same stack effect on every path', () => {
        for (const value of VALUES) expect(simulate(TRUNCD_LABEL, [...wordsOf(value)]).stack).toHaveLength(2);
    });
});

describe('ROUND of an LREAL', () => {
    /** Half away from zero, exact: the fraction of x - trunc(x) is exact in double precision. */
    const reference = (value: number): number => {
        if (!Number.isFinite(value) || Math.abs(value) >= 2 ** 52) return value;
        const whole = Math.trunc(value);
        const fraction = Math.abs(value - whole);
        return fraction >= 0.5 ? whole + Math.sign(value) : whole;
    };

    test.each(VALUES)('%p', (value) => {
        const want = reference(value);
        const got = runDouble(ROUNDAD_LABEL, value);
        if (want === 0) expect(got).toBe(0);
        else same(got, want);
    });

    test('a sweep of halves and near-halves', () => {
        for (let n = -300; n <= 300; n += 1) {
            for (const fraction of [0, 0.25, 0.5, 0.75, 0.5 - 2 ** -30, 0.5 + 2 ** -30]) {
                const value = n + fraction;
                const want = reference(value);
                const got = runDouble(ROUNDAD_LABEL, value);
                if (want === 0) expect(got).toBe(0);
                else expect(got).toBe(want);
            }
        }
    });
});

describe('LREAL to UDINT', () => {
    /** The nearest integer, an exact half to the even one, saturating at 0 and 4294967295; NaN is 0. */
    const reference = (value: number): number => {
        if (Number.isNaN(value) || value < 0.5) return 0;
        const floor = Math.floor(value);
        const fraction = value - floor;
        const nearest = fraction < 0.5 ? floor : fraction > 0.5 ? floor + 1 : floor % 2 === 0 ? floor : floor + 1;
        return Math.min(nearest, 4294967295);
    };

    test.each(VALUES)('%p', (value) => {
        const [low, high] = wordsOf(value);
        const result = simulate(D2U32_LABEL, [low, high]);
        expect(result.stack).toHaveLength(1);
        expect(result.stack[0]).toBe(reference(value) >>> 0);
    });
});
