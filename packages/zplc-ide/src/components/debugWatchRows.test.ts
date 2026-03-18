import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import { buildDebugWatchRows } from './debugWatchRows';

const DEBUG_MAP: DebugMap = {
  version: '1.0.0',
  programName: 'main',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-16T00:00:00Z',
  pou: {
    main: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: {
        Counter: {
          addr: 0x2000,
          type: 'INT',
          region: 'WORK',
          size: 2,
          tags: {},
        },
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

describe('buildDebugWatchRows', () => {
  it('uses live values from the store for existing watch variables', () => {
    const rows = buildDebugWatchRows(['Counter'], DEBUG_MAP, new Map([['Counter', 42]]), true);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.result.value).toBe(42);
    expect(rows[0]?.result.loading).toBe(false);
    expect(rows[0]?.result.address).toBe(0x2000);
  });

  it('shows loading only when polling and no live value exists yet', () => {
    const rows = buildDebugWatchRows(['Counter'], DEBUG_MAP, new Map(), true);

    expect(rows[0]?.result.loading).toBe(true);
    expect(rows[0]?.result.value).toBeNull();
  });
});
