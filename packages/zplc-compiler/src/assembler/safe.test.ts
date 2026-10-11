/**
 * The safe values a project declares for its outputs travel in the artifact (RT-023)
 *
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, test } from 'bun:test';
import {
    TASK_TYPE,
    ZPLC_CONSTANTS,
    assemble,
    createMultiTaskZplcFile,
    crc32,
    readArtifact,
} from './index';
import type { SafeEntry, TaskDef } from './index';

const code = assemble('PUSH8 1\nDROP\nHALT').bytecode;
const task: TaskDef = { id: 0, type: TASK_TYPE.CYCLIC, priority: 1, intervalUs: 10_000, entryPoint: 0, stackSize: 1, callDepth: 1 };

function crcHolds(file: Uint8Array): boolean {
    const payload = new Uint8Array(file.length - 4);
    payload.set(file.subarray(0, 12), 0);
    payload.set(file.subarray(16), 12);
    return new DataView(file.buffer, file.byteOffset).getUint32(12, true) === crc32(payload);
}

describe('the SAFE segment of an artifact (RT-023)', () => {
    test('an artifact that declares nothing has no SAFE segment and is the artifact it was before', () => {
        const without = createMultiTaskZplcFile(code, [task]);
        expect(createMultiTaskZplcFile(code, [task], [], [])).toEqual(without);
        expect(readArtifact(without).segments.map((segment) => segment.type)).not.toContain(ZPLC_CONSTANTS.SEGMENT_TYPE_SAFE);
        expect(readArtifact(without).safe).toEqual([]);
    });

    test('is written once, in four bytes an entry: offset, bit, value', () => {
        const safe: SafeEntry[] = [{ offset: 0, bit: 0, value: 1 }, { offset: 3, bit: 5, value: 0 }];
        const file = createMultiTaskZplcFile(code, [task], [], safe);
        const artifact = readArtifact(file);
        const segment = artifact.segments.filter((each) => each.type === ZPLC_CONSTANTS.SEGMENT_TYPE_SAFE);
        expect(segment).toHaveLength(1);
        expect(segment[0]!.size).toBe(2 * ZPLC_CONSTANTS.SAFE_ENTRY_SIZE);
        expect(Array.from(file.subarray(segment[0]!.offset, segment[0]!.offset + 8))).toEqual([0, 0, 0, 1, 3, 0, 5, 0]);
        expect(artifact.safe).toEqual(safe);
        expect(crcHolds(file)).toBe(true);
    });

    test('is counted in the header: the data size and the segment count', () => {
        const plain = createMultiTaskZplcFile(code, [task]);
        const declared = createMultiTaskZplcFile(code, [task], [], [{ offset: 1, bit: 2, value: 1 }]);
        const before = new DataView(plain.buffer);
        const after = new DataView(declared.buffer);
        expect(after.getUint32(20, true)).toBe(before.getUint32(20, true) + ZPLC_CONSTANTS.SAFE_ENTRY_SIZE);
        expect(after.getUint16(26, true)).toBe(before.getUint16(26, true) + 1);
        expect(declared.length).toBe(plain.length + ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE + ZPLC_CONSTANTS.SAFE_ENTRY_SIZE);
    });

    test('comes with the tags and does not move the identity of the program', () => {
        const tags = [{ varAddr: 0x2000, varType: 1, tagId: 1, value: 0 }];
        const plain = readArtifact(createMultiTaskZplcFile(code, [task], tags));
        const declared = readArtifact(createMultiTaskZplcFile(code, [task], tags, [{ offset: 0, bit: 7, value: 1 }]));
        expect(declared.buildId).toBe(plain.buildId);
        expect(declared.safe).toEqual([{ offset: 0, bit: 7, value: 1 }]);
        expect(declared.segments.map((segment) => segment.type)).toContain(ZPLC_CONSTANTS.SEGMENT_TYPE_TAGS);
    });

    test('is refused when an entry could not be loaded: past the image, a bit above 7, a value other than 0 or 1', () => {
        const attempt = (entry: SafeEntry) => () => createMultiTaskZplcFile(code, [task], [], [entry]);
        expect(attempt({ offset: 0x1000, bit: 0, value: 1 })).toThrow(/offset/);
        expect(attempt({ offset: -1, bit: 0, value: 1 })).toThrow(/offset/);
        expect(attempt({ offset: 0, bit: 8, value: 1 })).toThrow(/bit/);
        expect(attempt({ offset: 0, bit: 0, value: 2 as 0 | 1 })).toThrow(/value/);
        expect(attempt({ offset: 0.5, bit: 0, value: 1 })).toThrow(/offset/);
    });

    test('is refused when an output is declared twice or there are more than the loader takes', () => {
        const entry = { offset: 4, bit: 4, value: 1 as const };
        expect(() => createMultiTaskZplcFile(code, [task], [], [entry, { ...entry, value: 0 }])).toThrow(/twice|more than once|duplicate/i);
        const many: SafeEntry[] = Array.from({ length: ZPLC_CONSTANTS.MAX_SAFE_ENTRIES + 1 }, (_, index) => ({
            offset: Math.floor(index / 8), bit: index % 8, value: 1,
        }));
        expect(() => createMultiTaskZplcFile(code, [task], [], many)).toThrow(/at most/);
        expect(createMultiTaskZplcFile(code, [task], [], many.slice(0, ZPLC_CONSTANTS.MAX_SAFE_ENTRIES)).length).toBeGreaterThan(0);
    });
});
