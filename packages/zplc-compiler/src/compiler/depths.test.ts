/**
 * The depth of a task is measured, recorded and limited (CMP-050); the build identity ties a map to its program
 * (CMP-056)
 *
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, test } from 'bun:test';
import {
    CompilerError,
    compileMultiTaskProject,
    compileToBinary,
    debugMapMatchesArtifact,
    parseDebugMap,
    readArtifact,
    serializeDebugMap,
} from './index.ts';
import type { ProgramSource } from './index.ts';

const config = {
    name: 'D',
    version: '1.0.0',
    tasks: [{ name: 'Main', trigger: 'cyclic' as const, interval: 10, priority: 1, programs: ['P'] }],
};
const source = (content: string): ProgramSource[] => [{ name: 'P', content, sourceRef: 'src/p.st' }];

/** `a + (a + (a + ... ))` with `depth` operands: the right operand is evaluated while the left waits. */
function nested(depth: number): string {
    let expression = 'a';
    for (let level = 1; level < depth; level += 1) expression = `a + (${expression})`;
    return `PROGRAM P\nVAR a : DINT; r AT %QD0 : DINT; END_VAR\n    r := ${expression};\nEND_PROGRAM`;
}

describe('the depth of a task is measured and recorded in the artifact (CMP-050)', () => {
    test('a deeper program declares a deeper stack, and the task definition and the file agree', () => {
        const shallow = compileMultiTaskProject(config, source(nested(2)));
        const deep = compileMultiTaskProject(config, source(nested(30)));
        expect(deep.tasks[0]!.stackSize).toBeGreaterThan(shallow.tasks[0]!.stackSize);
        expect(deep.tasks[0]!.stackSize).toBeGreaterThanOrEqual(30);
        for (const result of [shallow, deep]) {
            const recorded = readArtifact(result.zplcFile).tasks;
            expect(recorded.map((task) => [task.stackSize, task.callDepth])).toEqual(
                result.tasks.map((task) => [task.stackSize, task.callDepth]),
            );
        }
    });

    test('call depth counts the frames: the body, then each function in the chain', () => {
        const withFunctions = [
            'FUNCTION Inner : DINT\nVAR_INPUT x : DINT; END_VAR\n    Inner := x + 1;\nEND_FUNCTION',
            'FUNCTION Outer : DINT\nVAR_INPUT x : DINT; END_VAR\n    Outer := Inner(x := x) + 1;\nEND_FUNCTION',
            'PROGRAM P\nVAR r AT %QD0 : DINT; END_VAR\n    r := Outer(x := 1);\nEND_PROGRAM',
        ].join('\n');
        const plain = compileMultiTaskProject(config, source(nested(2)));
        const chained = compileMultiTaskProject(config, source(withFunctions));
        expect(chained.tasks[0]!.callDepth!).toBeGreaterThan(plain.tasks[0]!.callDepth!);
        expect(chained.tasks[0]!.callDepth!).toBeGreaterThanOrEqual(3);
    });
});

describe('a depth over the limit of the target fails the build (CMP-050)', () => {
    test('an expression too deep for the stack the loader proves names the task, the depth and the limit', () => {
        let error: CompilerError | undefined;
        try {
            compileMultiTaskProject(config, source(nested(140)));
        } catch (caught) {
            error = caught as CompilerError;
        }
        expect(error).toBeInstanceOf(CompilerError);
        expect(error!.detail).toContain("Task 'Main'");
        expect(error!.detail).toMatch(/needs an evaluation stack of \d+ values and the target holds 127/);
        expect(error!.sourceRef).toBe('src/p.st');
        expect(error!.line).toBe(1);
    });

    test('the limit is the one of the target profile', () => {
        const profile = { workSize: 0x2000, retainSize: 0x1000, codeSizeMax: 0xb000, stackMaxDepth: 8, callStackMax: 32 };
        expect(() => compileMultiTaskProject(config, source(nested(4)), { memoryProfile: profile })).not.toThrow();
        expect(() => compileMultiTaskProject(config, source(nested(12)), { memoryProfile: profile })).toThrow(/holds 8/);
    });

    test('the call stack of the target is a limit too', () => {
        const chain = [
            'FUNCTION F1 : DINT\n    F1 := 1;\nEND_FUNCTION',
            'FUNCTION F2 : DINT\n    F2 := F1() + 1;\nEND_FUNCTION',
            'FUNCTION F3 : DINT\n    F3 := F2() + 1;\nEND_FUNCTION',
            'PROGRAM P\nVAR r AT %QD0 : DINT; END_VAR\n    r := F3();\nEND_PROGRAM',
        ].join('\n');
        const profile = { workSize: 0x2000, retainSize: 0x1000, codeSizeMax: 0xb000, callStackMax: 2 };
        expect(() => compileMultiTaskProject(config, source(chain))).not.toThrow();
        expect(() => compileMultiTaskProject(config, source(chain), { memoryProfile: profile })).toThrow(
            /nests calls \d+ deep and the target's call stack holds 2/,
        );
    });

    test('a file of one program is checked against the same limit', () => {
        expect(() => compileToBinary(nested(140))).toThrow(/evaluation stack/);
    });

    test('a profile that names a depth the VM cannot have is refused', () => {
        const profile = { workSize: 0x2000, retainSize: 0x1000, codeSizeMax: 0xb000, stackMaxDepth: 100000 };
        expect(() => compileMultiTaskProject(config, source(nested(2)), { memoryProfile: profile })).toThrow();
    });
});

describe('the build identity ties a debug map to its program (CMP-056)', () => {
    const build = (content: string) => compileMultiTaskProject(config, source(content));

    test('the map records the identity the artifact carries', () => {
        const result = build(nested(3));
        const carried = readArtifact(result.zplcFile).buildId!;
        expect(result.debugMap.buildId).toBe(carried.toString(16).padStart(8, '0'));
        expect(debugMapMatchesArtifact(result.debugMap, result.zplcFile)).toEqual({ ok: true, buildId: result.debugMap.buildId! });
    });

    test('the identity is the same for the same build and survives the serialized map', () => {
        const first = build(nested(3));
        const second = build(nested(3));
        expect(second.debugMap.buildId).toBe(first.debugMap.buildId);
        expect(Buffer.from(second.zplcFile).equals(Buffer.from(first.zplcFile))).toBe(true);
        const reread = parseDebugMap(serializeDebugMap(first.debugMap));
        expect(reread.buildId).toBe(first.debugMap.buildId);
    });

    test('the map of another build is told apart, by the artifact bytes', () => {
        const mine = build(nested(3));
        const other = build(nested(4));
        const verdict = debugMapMatchesArtifact(mine.debugMap, other.zplcFile);
        expect(verdict.ok).toBe(false);
        expect(!verdict.ok && verdict.reason).toBe('different-build');
        expect(!verdict.ok && verdict.message).toContain(mine.debugMap.buildId!);
    });

    test('a map with no identity, and an artifact with none, are said so rather than matched', () => {
        const result = build(nested(3));
        const older = { ...result.debugMap };
        delete older.buildId;
        const noMap = debugMapMatchesArtifact(older, result.zplcFile);
        expect(!noMap.ok && noMap.reason).toBe('map-has-no-identity');
        const noArtifact = debugMapMatchesArtifact(result.debugMap, new Uint8Array(40));
        expect(!noArtifact.ok && noArtifact.reason).toBe('artifact-has-no-identity');
    });

    test('the single-program build records it too', () => {
        const result = compileToBinary(nested(3), { generateDebugMap: true });
        expect(result.debugMap?.buildId).toBe(readArtifact(result.zplcFile).buildId!.toString(16).padStart(8, '0'));
    });
});
