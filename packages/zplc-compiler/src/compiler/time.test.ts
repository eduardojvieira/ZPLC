/**
 * TIME literals (CMP-017)
 *
 * SPDX-License-Identifier: MIT
 *
 * TIME is an unsigned 32-bit millisecond count. The conformance cases under conformance/cmp run
 * the literals on the native VM; this file covers the grammar and the refusals.
 */

import { describe, it, expect } from 'bun:test';

import { parseTimeLiteral } from './ast.ts';
import { tokenize, TokenType } from './lexer.ts';

describe('parseTimeLiteral', () => {
    const accepted: Array<[string, number]> = [
        ['T#500ms', 500],
        ['5s', 5000],
        ['T#1h30m', 5400000],
        ['T#1.5s', 1500],
        ['T#0.25s', 250],
        ['T#1h30.5m', 3600000 + 30 * 60000 + 30000],
        ['T#1d_2h_3m_4s_5ms', 86400000 + 2 * 3600000 + 3 * 60000 + 4000 + 5],
        ['TIME#2s', 2000],
        ['T#1_000ms', 1000],
        ['T#1000us', 1],
        ['T#2000000ns', 2],
        ['T#5S', 5000],
        ['T#0s', 0],
        ['T#-0s', 0],
        ['T#4294967295ms', 4294967295],
        ['T#49d17h2m47s295ms', 4294967295],
    ];
    for (const [text, ms] of accepted) {
        it(`reads ${text} as ${ms} ms`, () => {
            expect(parseTimeLiteral(text)).toBe(ms);
        });
    }

    const refused: Array<[string, string]> = [
        ['T#50d', '4294967295'],
        ['T#4294967296ms', 'out of range'],
        ['T#-1s', 'negative'],
        ['T#1.5ms', 'millisecond'],
        ['T#1ns', 'millisecond'],
        ['T#1m1h', 'order'],
        ['T#1s1s', 'order'],
        ['T#1.5h30m', 'fraction'],
        ['T#', 'Invalid time literal'],
        ['T#5', 'Invalid time literal'],
        ['T#5x', 'Invalid time literal'],
    ];
    for (const [text, word] of refused) {
        it(`refuses ${text}`, () => {
            expect(() => parseTimeLiteral(text)).toThrow(word);
        });
    }
});

describe('time literal tokens', () => {
    it('keeps a fraction and several components in one token', () => {
        const tokens = tokenize('T#1.5s T#1h30m');
        expect(tokens.map((t) => [t.type, t.value])).toEqual([
            [TokenType.TIME_LITERAL, '1.5s'],
            [TokenType.TIME_LITERAL, '1h30m'],
            [TokenType.EOF, ''],
        ]);
    });

    it('takes the sign only straight after the hash, so T#5s-T#3s is a subtraction', () => {
        const tokens = tokenize('T#-5s T#5s-T#3s');
        expect(tokens.map((t) => [t.type, t.value])).toEqual([
            [TokenType.TIME_LITERAL, '-5s'],
            [TokenType.TIME_LITERAL, '5s'],
            [TokenType.MINUS, '-'],
            [TokenType.TIME_LITERAL, '3s'],
            [TokenType.EOF, ''],
        ]);
    });
});
