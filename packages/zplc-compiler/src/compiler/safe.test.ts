/**
 * The project declares the value an output takes in the safe state; the artifact carries it (RT-023)
 *
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, test } from 'bun:test';
import { CompilerError, compileMultiTaskProject, readArtifact } from './index.ts';
import type { ProgramSource } from './index.ts';

const config = { name: 'S', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic' as const, interval: 10, priority: 1, programs: ['P'] }] };
const sources: ProgramSource[] = [{
    name: 'P',
    content: 'PROGRAM P\nVAR relay AT %QX0.0 : BOOL; valve AT %QX1.3 : BOOL; END_VAR\n    relay := TRUE;\n    valve := FALSE;\nEND_PROGRAM',
    sourceRef: 'src/p.st',
}];

describe('a declared safe value reaches the artifact (RT-023)', () => {
    test('a build that declares nothing builds the artifact it built before', () => {
        const plain = compileMultiTaskProject(config, sources);
        expect(plain.safe).toEqual([]);
        expect(compileMultiTaskProject(config, sources, { safeOutputs: [] }).zplcFile).toEqual(plain.zplcFile);
        expect(readArtifact(plain.zplcFile).safe).toEqual([]);
    });

    test('the declaration is in the artifact and in the result, in the order the project wrote it', () => {
        const safeOutputs = [{ offset: 1, bit: 3, value: 1 as const }, { offset: 0, bit: 0, value: 0 as const }];
        const result = compileMultiTaskProject(config, sources, { safeOutputs });
        expect(result.safe).toEqual(safeOutputs);
        expect(readArtifact(result.zplcFile).safe).toEqual(safeOutputs);
    });

    test('the code of the program and its identity do not depend on what it declares', () => {
        const plain = compileMultiTaskProject(config, sources);
        const declared = compileMultiTaskProject(config, sources, { safeOutputs: [{ offset: 0, bit: 0, value: 1 }] });
        expect(Array.from(declared.bytecode)).toEqual(Array.from(plain.bytecode));
        expect(readArtifact(declared.zplcFile).buildId).toBe(readArtifact(plain.zplcFile).buildId);
        expect(declared.debugMap.buildId).toBe(plain.debugMap.buildId);
    });

    test('a declaration the loader would refuse is a build error that says so', () => {
        const attempt = (safeOutputs: Array<{ offset: number; bit: number; value: 0 | 1 }>) => () => compileMultiTaskProject(config, sources, { safeOutputs });
        expect(attempt([{ offset: 0x1000, bit: 0, value: 1 }])).toThrow(CompilerError);
        expect(attempt([{ offset: 0x1000, bit: 0, value: 1 }])).toThrow(/safe value.*offset/i);
        expect(attempt([{ offset: 0, bit: 3, value: 1 }, { offset: 0, bit: 3, value: 0 }])).toThrow(/twice/);
    });
});
