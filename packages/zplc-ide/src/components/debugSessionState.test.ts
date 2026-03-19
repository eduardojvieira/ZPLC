import { describe, expect, it } from 'bun:test';

import { PROGRAM_LOAD_STATE, shouldAutoLoadBeforeStart } from './debugSessionState';

describe('shouldAutoLoadBeforeStart', () => {
  it('auto-loads only when idle and no program has been loaded in the session', () => {
    expect(shouldAutoLoadBeforeStart('idle', PROGRAM_LOAD_STATE.EMPTY)).toBe(true);
  });

  it('does not auto-load when a program is already loaded in the session', () => {
    expect(shouldAutoLoadBeforeStart('idle', PROGRAM_LOAD_STATE.LOADED)).toBe(false);
  });

  it('does not auto-load from paused or running states', () => {
    expect(shouldAutoLoadBeforeStart('paused', PROGRAM_LOAD_STATE.EMPTY)).toBe(false);
    expect(shouldAutoLoadBeforeStart('running', PROGRAM_LOAD_STATE.EMPTY)).toBe(false);
  });
});
