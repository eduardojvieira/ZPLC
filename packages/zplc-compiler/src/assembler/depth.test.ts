/**
 * Evaluation-stack and call depth of a task (CMP-050)
 *
 * SPDX-License-Identifier: MIT
 *
 * These are the unit tests of the analysis over assembly text. That the numbers are the ones the loader
 * measures is checked on every conformance artifact by the conformance suite.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from './index';
import { DepthError, analyzeDepths } from './depth';

function depths(source: string, entries: number[] = [0]): Array<{ stack: number; frames: number }> {
    const parsed = parse(source);
    return analyzeDepths(parsed.instructions, entries);
}

describe('the evaluation stack of a task', () => {
    test('is the deepest point of straight-line code', () => {
        expect(depths('PUSH8 1\nPUSH8 2\nPUSH8 3\nADD\nADD\nDROP\nHALT')).toEqual([{ stack: 3, frames: 1 }]);
    });

    test('is the deepest of the branches of a conditional', () => {
        const source = [
            'PUSH8 1',
            'JZ other',
            'PUSH8 1',
            'PUSH8 2',
            'PUSH8 3',
            'DROP',
            'DROP',
            'DROP',
            'JMP done',
            'other:',
            'PUSH8 1',
            'DROP',
            'done:',
            'HALT',
        ].join('\n');
        expect(depths(source)).toEqual([{ stack: 3, frames: 1 }]);
    });

    test('of a balanced loop is the depth of its body', () => {
        const source = ['loop:', 'PUSH8 1', 'PUSH8 2', 'ADD', 'DROP', 'PUSH8 0', 'JNZ loop', 'HALT'].join('\n');
        expect(depths(source)).toEqual([{ stack: 2, frames: 1 }]);
    });

    test('takes the stack effect from the opcode table: a 64-bit multiply takes four words and leaves two', () => {
        const source = ['PUSH8 1', 'PUSH8 0', 'PUSH8 2', 'PUSH8 0', 'MUL64', 'DROP', 'DROP', 'HALT'].join('\n');
        expect(depths(source)).toEqual([{ stack: 4, frames: 1 }]);
    });

    test('PICK needs the depth its operand names', () => {
        const source = ['PUSH8 1', 'PUSH8 2', 'PICK 1', 'DROP', 'DROP', 'DROP', 'HALT'].join('\n');
        expect(depths(source)).toEqual([{ stack: 3, frames: 1 }]);
        expect(() => depths(['PUSH8 1', 'PICK 3', 'HALT'].join('\n'))).toThrow(DepthError);
    });
});

describe('a call', () => {
    test('adds the deepest point of the callee to the depth where it is called, and a frame', () => {
        const source = [
            'PUSH8 1',
            'PUSH8 2',
            'CALL deep',
            'DROP',
            'DROP',
            'HALT',
            'deep:',
            'PUSH8 3',
            'PUSH8 4',
            'PUSH8 5',
            'DROP',
            'DROP',
            'DROP',
            'RET',
        ].join('\n');
        expect(depths(source)).toEqual([{ stack: 5, frames: 2 }]);
    });

    test('takes the effect of the callee on the stack: an argument in, a result out', () => {
        const source = ['PUSH8 7', 'CALL twice', 'DROP', 'HALT', 'twice:', 'DUP', 'ADD', 'RET'].join('\n');
        expect(depths(source)).toEqual([{ stack: 2, frames: 2 }]);
    });

    test('nested calls count one frame each, the deepest chain winning', () => {
        const source = [
            'CALL a',
            'HALT',
            'a:',
            'CALL b',
            'RET',
            'b:',
            'CALL c',
            'RET',
            'c:',
            'PUSH8 1',
            'DROP',
            'RET',
            'd:',
            'CALL c',
            'RET',
        ].join('\n');
        expect(depths(source)).toEqual([{ stack: 1, frames: 4 }]);
    });

    test('a callee called from two places is analysed once and serves both', () => {
        const source = ['CALL f', 'CALL f', 'HALT', 'f:', 'PUSH8 1', 'DROP', 'RET'].join('\n');
        expect(depths(source)).toEqual([{ stack: 1, frames: 2 }]);
    });

    test('each entry of the program is a task of its own', () => {
        const source = ['PUSH8 1', 'PUSH8 2', 'HALT', 'second:', 'CALL f', 'HALT', 'f:', 'PUSH8 1', 'DROP', 'RET'].join('\n');
        const parsed = parse(source);
        expect(analyzeDepths(parsed.instructions, [0, parsed.labels.get('SECOND')!.address])).toEqual([
            { stack: 2, frames: 1 },
            { stack: 1, frames: 2 },
        ]);
    });
});

describe('what no depth can be given for', () => {
    test('recursion', () => {
        const source = ['CALL f', 'HALT', 'f:', 'CALL f', 'RET'].join('\n');
        expect(() => depths(source)).toThrow(/recurs/i);
    });

    test('a loop that leaves one more value on the stack at each turn', () => {
        const source = ['loop:', 'PUSH8 1', 'JMP loop'].join('\n');
        expect(() => depths(source)).toThrow(/without bound/);
    });

    test('code that takes values the task does not have', () => {
        expect(() => depths(['DROP', 'HALT'].join('\n'))).toThrow(/takes 1 value/);
    });
});
