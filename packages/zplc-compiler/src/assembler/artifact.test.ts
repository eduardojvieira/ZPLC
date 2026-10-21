/**
 * The call depth of a task and the build identity of an artifact (CMP-050, CMP-056)
 *
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, test } from 'bun:test';
import { TASK_TYPE, ZPLC_CONSTANTS, assemble, buildIdOf, createMultiTaskZplcFile, createZplcFile, crc32, readArtifact } from './index';
import type { TaskDef } from './index';

const code = assemble('PUSH8 1\nPUSH8 2\nADD\nDROP\nHALT\nsecond:\nNOP\nHALT').bytecode;

function task(overrides: Partial<TaskDef> = {}): TaskDef {
    return { id: 0, type: TASK_TYPE.CYCLIC, priority: 1, intervalUs: 10_000, entryPoint: 0, stackSize: 2, callDepth: 1, ...overrides };
}

describe('the call depth of a task is a field of its definition (CMP-050)', () => {
    test('is written at byte 12 of the task entry, with the reserved half after it zero', () => {
        const file = createMultiTaskZplcFile(code, [task({ callDepth: 3 })]);
        const view = new DataView(file.buffer);
        const taskAt = ZPLC_CONSTANTS.HEADER_SIZE + 3 * ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE + code.length;
        expect(view.getUint16(taskAt + 10, true)).toBe(2); // stack_size
        expect(view.getUint16(taskAt + 12, true)).toBe(3); // call_depth
        expect(view.getUint16(taskAt + 14, true)).toBe(0); // reserved
    });

    test('is read back with the rest of the task table', () => {
        const file = createMultiTaskZplcFile(code, [task({ callDepth: 4 }), task({ id: 1, entryPoint: 5, stackSize: 1, callDepth: 2 })]);
        const artifact = readArtifact(file);
        expect(artifact.tasks.map((each) => [each.id, each.entryPoint, each.stackSize, each.callDepth])).toEqual([
            [0, 0, 2, 4],
            [1, 5, 1, 2],
        ]);
    });

    test('an artifact without the field declares 0, not declared', () => {
        const { callDepth: _omitted, ...bare } = task();
        const artifact = readArtifact(createMultiTaskZplcFile(code, [bare]));
        expect(artifact.tasks[0]!.callDepth).toBe(0);
    });

    test('a value that does not fit 16 bits is an error', () => {
        expect(() => createMultiTaskZplcFile(code, [task({ callDepth: 0x10000 })])).toThrow(/call depth/);
        expect(() => createMultiTaskZplcFile(code, [task({ callDepth: -1 })])).toThrow(/call depth/);
    });
});

describe('the build identity of an artifact (CMP-056)', () => {
    test('is the CRC-32 of the code and the task segment, in a BUILD segment after the others', () => {
        const file = createMultiTaskZplcFile(code, [task()]);
        const artifact = readArtifact(file);
        const taskSegment = file.subarray(
            ZPLC_CONSTANTS.HEADER_SIZE + 3 * ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE + code.length,
            ZPLC_CONSTANTS.HEADER_SIZE + 3 * ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE + code.length + ZPLC_CONSTANTS.TASK_DEF_SIZE,
        );
        const joined = new Uint8Array(code.length + taskSegment.length);
        joined.set(code, 0);
        joined.set(taskSegment, code.length);
        expect(artifact.buildId).toBe(crc32(joined));
        expect(artifact.buildId).toBe(buildIdOf(code, taskSegment));
        expect(artifact.segments.map((segment) => segment.type)).toEqual([
            ZPLC_CONSTANTS.SEGMENT_TYPE_CODE,
            ZPLC_CONSTANTS.SEGMENT_TYPE_TASK,
            ZPLC_CONSTANTS.SEGMENT_TYPE_BUILD,
        ]);
        // the header counts it as data, like the other segments that are not code
        expect(new DataView(file.buffer).getUint32(20, true)).toBe(ZPLC_CONSTANTS.TASK_DEF_SIZE + ZPLC_CONSTANTS.BUILD_ENTRY_SIZE);
    });

    test('is the same for the same build and different for a different one', () => {
        const first = readArtifact(createMultiTaskZplcFile(code, [task()])).buildId;
        expect(readArtifact(createMultiTaskZplcFile(code, [task()])).buildId).toBe(first);
        const changedCode = code.slice();
        changedCode[1] = 9;
        expect(readArtifact(createMultiTaskZplcFile(changedCode, [task()])).buildId).not.toBe(first);
        expect(readArtifact(createMultiTaskZplcFile(code, [task({ intervalUs: 20_000 })])).buildId).not.toBe(first);
        expect(readArtifact(createMultiTaskZplcFile(code, [task({ callDepth: 2 })])).buildId).not.toBe(first);
    });

    test('is not changed by the tags of the artifact, which are not the program', () => {
        const without = readArtifact(createMultiTaskZplcFile(code, [task()])).buildId;
        const withTag = readArtifact(
            createMultiTaskZplcFile(code, [task()], [{ varAddr: 0x2000, varType: 4, tagId: 2, value: 1 }]),
        ).buildId;
        expect(withTag).toBe(without);
    });

    test('is never 0, which is what an artifact without an identity reads as', () => {
        for (let seed = 0; seed < 300; seed += 1) {
            const body = new Uint8Array([0x40, seed & 0xff, 0x11, 0x01]);
            expect(readArtifact(createMultiTaskZplcFile(body, [task({ entryPoint: 0 })])).buildId).not.toBe(0);
        }
    });

    test('a file of one program has one too, of its code alone', () => {
        const file = createZplcFile(code, 0);
        const artifact = readArtifact(file);
        expect(artifact.buildId).toBe(buildIdOf(code));
        expect(artifact.segments.map((segment) => segment.type)).toEqual([
            ZPLC_CONSTANTS.SEGMENT_TYPE_CODE,
            ZPLC_CONSTANTS.SEGMENT_TYPE_BUILD,
        ]);
    });

    test('an artifact that is not a ZPLC file, or has no BUILD segment, reads as having none', () => {
        expect(readArtifact(new Uint8Array(4)).buildId).toBeUndefined();
        const draft = new Uint8Array(ZPLC_CONSTANTS.HEADER_SIZE + ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE + 1);
        const view = new DataView(draft.buffer);
        view.setUint32(0, ZPLC_CONSTANTS.MAGIC, true);
        view.setUint16(26, 1, true);
        view.setUint16(32, ZPLC_CONSTANTS.SEGMENT_TYPE_CODE, true);
        view.setUint32(36, 1, true);
        view.setUint32(16, 1, true);
        expect(readArtifact(draft).buildId).toBeUndefined();
    });
});
