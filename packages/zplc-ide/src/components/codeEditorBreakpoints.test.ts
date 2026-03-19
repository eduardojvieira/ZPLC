import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import {
  getBreakpointPCForLine,
  getEligibleBreakpointLines,
  isLineBreakpointEligible,
} from './codeEditorBreakpoints';

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

  it('matches debug map keys that include file extensions', () => {
    const extensionMap: DebugMap = {
      ...DEBUG_MAP,
      pou: {
        'main.st': DEBUG_MAP.pou.main,
      },
    };

    expect(isLineBreakpointEligible(extensionMap, 'main.st', 22)).toBe(true);
    expect(getBreakpointPCForLine(extensionMap, 'main.st', 25)).toBe(41);
  });

  it('rejects unknown files and missing debug maps', () => {
    expect(isLineBreakpointEligible(DEBUG_MAP, 'other.st', 22)).toBe(false);
    expect(isLineBreakpointEligible(null, 'main.st', 22)).toBe(false);
  });

  it('returns sorted executable code lines only', () => {
    expect(getEligibleBreakpointLines(DEBUG_MAP, 'main.st')).toEqual([22, 25]);
  });

  it('maps an eligible line to its PC', () => {
    expect(getBreakpointPCForLine(DEBUG_MAP, 'main.st', 25)).toBe(41);
    expect(getBreakpointPCForLine(DEBUG_MAP, 'main.st', 13)).toBe(null);
  });
});

describe('sourceMap fallback', () => {
  const FALLBACK_MAP: DebugMap = {
    ...DEBUG_MAP,
    pou: {
      main: {
        ...DEBUG_MAP.pou.main,
        breakpoints: [],
        sourceMap: [
          { line: 24, pc: 29, length: 2 },
          { line: 27, pc: 46, length: 3 },
        ],
      },
    },
  };

  it('allows executable lines when explicit breakpoint metadata is absent', () => {
    expect(isLineBreakpointEligible(FALLBACK_MAP, 'main.st', 24)).toBe(true);
    expect(isLineBreakpointEligible(FALLBACK_MAP, 'main.st', 14)).toBe(false);
  });

  it('falls back to source-map PCs when needed', () => {
    expect(getBreakpointPCForLine(FALLBACK_MAP, 'main.st', 27)).toBe(46);
  });
});
