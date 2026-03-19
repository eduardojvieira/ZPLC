import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import { WATCH_FORCE_STATE, type WatchForceEntry } from '../runtime/debugAdapter';
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
    const rows = buildDebugWatchRows(
      ['Counter'],
      DEBUG_MAP,
      new Map([['Counter', 42]]),
      new Map(),
      true,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.result.value).toBe(42);
    expect(rows[0]?.result.loading).toBe(false);
    expect(rows[0]?.result.address).toBe(0x2000);
    expect(rows[0]?.result.forced).toBe(false);
  });

  it('shows loading only when polling and no live value exists yet', () => {
    const rows = buildDebugWatchRows(['Counter'], DEBUG_MAP, new Map(), new Map(), true);

    expect(rows[0]?.result.loading).toBe(true);
    expect(rows[0]?.result.value).toBeNull();
  });

  it('marks rows as forced when a force entry exists for the watch path', () => {
    const forceEntry: WatchForceEntry = {
      path: 'Counter',
      address: 0x2000,
      type: 'INT',
      bytesHex: '2A00',
      state: WATCH_FORCE_STATE.FORCED,
    };

    const rows = buildDebugWatchRows(
      ['Counter'],
      DEBUG_MAP,
      new Map([['Counter', 42]]),
      new Map([['Counter', forceEntry]]),
      false,
    );

    expect(rows[0]?.result.forced).toBe(true);
    expect(rows[0]?.result.forceEntry).toEqual(forceEntry);
  });
});
