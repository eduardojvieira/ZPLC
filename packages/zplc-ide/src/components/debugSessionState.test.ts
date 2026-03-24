import { describe, expect, it } from 'bun:test';

import {
  nextProgramLoadStateAfterCompile,
  nextProgramLoadStateAfterConnect,
  PROGRAM_LOAD_STATE,
  shouldAutoLoadBeforeStart,
} from './debugSessionState';

describe('debugSessionState', () => {
  it('auto-loads before start when idle and program state is empty', () => {
    expect(shouldAutoLoadBeforeStart('idle', PROGRAM_LOAD_STATE.EMPTY)).toBe(true);
  });

  it('does not auto-load before start when a program is already marked loaded', () => {
    expect(shouldAutoLoadBeforeStart('idle', PROGRAM_LOAD_STATE.LOADED)).toBe(false);
  });

  it('invalidates program load state after a successful compile', () => {
    expect(nextProgramLoadStateAfterCompile()).toBe(PROGRAM_LOAD_STATE.EMPTY);
  });

  it('invalidates program load state after establishing a new session', () => {
    expect(nextProgramLoadStateAfterConnect()).toBe(PROGRAM_LOAD_STATE.EMPTY);
  });
});
