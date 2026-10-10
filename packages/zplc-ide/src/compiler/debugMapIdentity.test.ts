/**
 * A debug map is attached to a program only when it is the map of that program (CMP-056)
 *
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from 'bun:test';
import { compileSingleFileWithTask, judgeDebugMapAttachment } from './index';

const PROGRAM = (value: number) => `PROGRAM Main\nVAR out AT %QW0 : INT; END_VAR\n    out := ${value};\nEND_PROGRAM\n`;

describe('judgeDebugMapAttachment', () => {
  it('attaches the map of the program it is given with', () => {
    const built = compileSingleFileWithTask(PROGRAM(1), 'ST');
    expect(judgeDebugMapAttachment(built.debugMap, built.zplcFile)).toEqual({ action: 'attach' });
  });

  it('refuses the map of another build, naming both identities', () => {
    const first = compileSingleFileWithTask(PROGRAM(1), 'ST');
    const second = compileSingleFileWithTask(PROGRAM(2), 'ST');
    const judged = judgeDebugMapAttachment(first.debugMap, second.zplcFile);
    expect(judged.action).toBe('refuse');
    expect(judged.message).toContain(first.debugMap.buildId!);
    expect(judged.message).toContain(second.debugMap.buildId!);
  });

  it('warns, and does not refuse, when the map or the program has no identity', () => {
    const built = compileSingleFileWithTask(PROGRAM(1), 'ST');
    const older = { ...built.debugMap };
    delete older.buildId;
    expect(judgeDebugMapAttachment(older, built.zplcFile).action).toBe('warn');
    expect(judgeDebugMapAttachment(built.debugMap, new Uint8Array(40)).action).toBe('warn');
  });
});
