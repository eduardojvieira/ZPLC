import { describe, expect, it } from 'bun:test';

import { deriveHardwareDebugState } from './debugStatus';
import type { StatusInfo } from './serialAdapter';

const BASE_STATUS: StatusInfo = {
  state: 'running',
  uptime_ms: 100,
  stats: {
    cycles: 10,
  },
  opi: [],
};

describe('deriveHardwareDebugState', () => {
  it('maps paused scheduler state to paused VM state', () => {
    expect(deriveHardwareDebugState({
      ...BASE_STATUS,
      state: 'paused',
      vm: { pc: 24, sp: 2, halted: true, error: 10 },
    })).toEqual({ vmState: 'paused', halted: true });
  });

  it('maps running scheduler state to running VM state', () => {
    expect(deriveHardwareDebugState(BASE_STATUS)).toEqual({ vmState: 'running', halted: false });
  });

  it('maps idle scheduler state to idle VM state', () => {
    expect(deriveHardwareDebugState({ ...BASE_STATUS, state: 'idle' })).toEqual({ vmState: 'idle', halted: false });
  });
});
