import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import { buildPolledDebugPaths } from './debugPollingPaths';

const DEBUG_MAP: DebugMap = {
  version: '1.0.0',
  programName: 'Main',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-18T00:00:00Z',
  pou: {
    Main: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: {
        Counter: { addr: 0x2000, type: 'INT', region: 'WORK', size: 2 },
        Enabled: { addr: 0x2002, type: 'BOOL', region: 'WORK', size: 1 },
      },
      sourceMap: [],
      breakpoints: [],
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

describe('buildPolledDebugPaths', () => {
  it('polls only explicit watch variables when live preview is disabled', () => {
    expect(buildPolledDebugPaths(['Counter'], DEBUG_MAP, false)).toEqual(['Counter']);
  });

  it('adds debug-map variables when live preview is enabled', () => {
    expect(buildPolledDebugPaths(['Counter'], DEBUG_MAP, true)).toEqual(['Counter', 'Enabled']);
  });

  it('respects the cap while keeping watched variables first', () => {
    expect(buildPolledDebugPaths(['Counter'], DEBUG_MAP, true, 1)).toEqual(['Counter']);
  });
});
