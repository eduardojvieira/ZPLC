/**
 * ZPLC Standard Library - reference data tests (DOC-007)
 *
 * SPDX-License-Identifier: MIT
 *
 * The reference pages are generated from the registry (index.ts) and from reference.ts. These tests are the
 * compiler-side guard of that pair: a registered name without an entry, an entry that names nothing, a pin table
 * that disagrees with the member layout of its block, and an example that no longer compiles all fail here, before
 * the docs job runs the examples on the native runtime.
 */

import { describe, expect, test } from 'bun:test';
import { compileST } from '../index.ts';
import { getAllFBNames, getAllFnNames, getFB, getFn } from './index.ts';
import { conversionResultType } from './conversions.ts';
import { BLOCK_CATEGORIES, BLOCK_DOCS, FUNCTION_CATEGORIES, FUNCTION_DOCS } from './reference.ts';

/** Bytes of a member of each IEC type that a pin table may name. */
const TYPE_SIZE: Record<string, number> = {
    BOOL: 1, USINT: 1, INT: 2, UINT: 2, DINT: 4, UDINT: 4, REAL: 4, TIME: 4, STRING: 85,
};

const documentedFunctions = getAllFnNames().filter((name) => conversionResultType(name) === undefined);
const sorted = (names: string[]) => [...names].sort();

describe('standard library reference data: every registered name has an entry (DOC-007)', () => {
    test('every registered function that is not a type conversion has an entry', () => {
        expect(sorted(Object.keys(FUNCTION_DOCS))).toEqual(sorted(documentedFunctions));
    });

    test('every registered function block has an entry', () => {
        expect(sorted(Object.keys(BLOCK_DOCS))).toEqual(sorted(getAllFBNames()));
    });

    test('every entry has an English and a Spanish description and a known category', () => {
        const functionCategories = new Set(FUNCTION_CATEGORIES.map((category) => category.id));
        const blockCategories = new Set(BLOCK_CATEGORIES.map((category) => category.id));
        for (const [name, entry] of Object.entries(FUNCTION_DOCS)) {
            expect([name, entry.en.trim() !== '', entry.es.trim() !== '', functionCategories.has(entry.category)]).toEqual([name, true, true, true]);
        }
        for (const [name, entry] of Object.entries(BLOCK_DOCS)) {
            expect([name, entry.en.trim() !== '', entry.es.trim() !== '', blockCategories.has(entry.category)]).toEqual([name, true, true, true]);
        }
    });
});

describe('standard library reference data: signatures and pin tables follow the registry (DOC-007)', () => {
    test('the parameters of a function are as many as the registry takes', () => {
        for (const [name, entry] of Object.entries(FUNCTION_DOCS)) {
            const registered = getFn(name);
            const ok = registered !== undefined && (registered.variadic ? entry.variadic === true && entry.params.length >= registered.argCount : entry.params.length === registered.argCount);
            expect([name, ok]).toEqual([name, true]);
        }
    });

    test('the pins of a block are its members that are not internal, with the size of their type', () => {
        for (const [name, entry] of Object.entries(BLOCK_DOCS)) {
            const members = (getFB(name)?.members ?? []).filter((member) => !member.isInternal);
            expect([name, sorted(entry.pins.map((pin) => pin.name))]).toEqual([name, sorted(members.map((member) => member.name))]);
            for (const pin of entry.pins) {
                const member = members.find((candidate) => candidate.name === pin.name)!;
                expect([name, pin.name, TYPE_SIZE[pin.type]]).toEqual([name, pin.name, member.size]);
            }
        }
    });
});

describe('standard library reference data: the examples are programs (DOC-007)', () => {
    test('every example compiles', () => {
        const entries = [...Object.entries(FUNCTION_DOCS), ...Object.entries(BLOCK_DOCS)];
        for (const [name, entry] of entries) {
            const program = `PROGRAM Example\n${entry.example.source}\nEND_PROGRAM\n`;
            expect(() => compileST(program), name).not.toThrow();
        }
    });

    test('every example states the value it must hold', () => {
        for (const [name, entry] of [...Object.entries(FUNCTION_DOCS), ...Object.entries(BLOCK_DOCS)]) {
            expect([name, /^[A-Za-z_][\w]*(:[A-Z]+)?=\S+( [A-Za-z_][\w]*(:[A-Z]+)?=\S+)*$/.test(entry.example.expect)]).toEqual([name, true]);
        }
    });
});
