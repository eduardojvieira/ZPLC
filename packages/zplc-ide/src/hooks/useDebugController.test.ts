import { describe, expect, it } from 'bun:test';

import { resolveExecutionLocation } from './debugExecutionLocation';
import type { DebugMap } from '../compiler';

const DEBUG_MAP: DebugMap = {
  version: '1.0.0',
  programName: 'WorkflowDebug',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-14T00:00:00Z',
  pou: {
    Main: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: {},
      sourceMap: [
        { pc: 16, line: 4, column: 1, length: 4 },
        { pc: 32, line: 8, column: 1, length: 4 },
      ],
      breakpoints: [
        { line: 4, pc: 16, valid: true },
        { line: 8, pc: 32, valid: true },
      ],
    },
  },
  memoryLayout: {
    ipiBase: 0x0000,
    ipiSize: 0x1000,
    opiBase: 0x1000,
    opiSize: 0x1000,
    workBase: 0x2000,
    workSize: 0x2000,
    retainBase: 0x4000,
    retainSize: 0x1000,
    codeBase: 0x0000,
    codeSize: 128,
  },
};

describe('resolveExecutionLocation', () => {
  it('resolves mapped breakpoint locations from the debug map', () => {
    expect(resolveExecutionLocation(DEBUG_MAP, 32)).toEqual({
      line: 8,
      pc: 32,
      pouName: 'Main',
    });
  });

  it('falls back to the provided line when the pc is not mapped', () => {
    expect(resolveExecutionLocation(DEBUG_MAP, 48, 11)).toEqual({
      line: 11,
      pc: 48,
      pouName: null,
    });
  });

  it('returns a null pou when no debug map exists', () => {
    expect(resolveExecutionLocation(null, 64)).toEqual({
      line: null,
      pc: 64,
      pouName: null,
    });
  });
});
