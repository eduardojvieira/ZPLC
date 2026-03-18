import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import { isLineBreakpointEligible } from './codeEditorBreakpoints';

const DEBUG_MAP: DebugMap = {
  version: '1.0.0',
  programName: 'main',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-16T00:00:00Z',
  pou: {
    main: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: {},
      sourceMap: [
        { line: 22, pc: 24, length: 2 },
        { line: 25, pc: 41, length: 3 },
      ],
      breakpoints: [
        { line: 22, pc: 24, valid: true },
        { line: 25, pc: 41, valid: true },
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
    codeBase: 0x5000,
    codeSize: 128,
  },
};

describe('isLineBreakpointEligible', () => {
  it('allows executable lines from the debug map', () => {
    expect(isLineBreakpointEligible(DEBUG_MAP, 'main.st', 22)).toBe(true);
  });

  it('rejects declaration lines that do not have executable breakpoint locations', () => {
    expect(isLineBreakpointEligible(DEBUG_MAP, 'main.st', 13)).toBe(false);
  });

  it('matches file names case-insensitively', () => {
    expect(isLineBreakpointEligible(DEBUG_MAP, 'MAIN.ST', 25)).toBe(true);
  });

  it('rejects unknown files and missing debug maps', () => {
    expect(isLineBreakpointEligible(DEBUG_MAP, 'other.st', 22)).toBe(false);
    expect(isLineBreakpointEligible(null, 'main.st', 22)).toBe(false);
  });
});
