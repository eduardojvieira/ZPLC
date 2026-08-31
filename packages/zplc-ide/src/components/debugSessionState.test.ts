import { describe, expect, it } from 'bun:test';

import {
  canRunCurrentProgram,
  HARDWARE_DEPLOY_UNCONFIRMED_MESSAGE,
  isCompileResultCurrent,
  nextProgramLoadStateAfterDeploy,
  nextProgramLoadStateAfterCompile,
  nextProgramLoadStateAfterConnect,
  PROGRAM_LOAD_STATE,
  shouldAutoLoadBeforeStart,
} from './debugSessionState';

describe('debugSessionState', () => {
  it('never asserts a safe physical program state after an unconfirmed deploy', () => {
    expect(HARDWARE_DEPLOY_UNCONFIRMED_MESSAGE).toBe('Deploy was not confirmed. Device program state is unknown; reconnect and inspect before proceeding.');
    expect(HARDWARE_DEPLOY_UNCONFIRMED_MESSAGE).not.toContain('not deployed');
    expect(canRunCurrentProgram('hardware', true, PROGRAM_LOAD_STATE.EMPTY)).toBe(false);
  });

  it('auto-loads only simulation sessions before start when idle and program state is empty', () => {
    expect(shouldAutoLoadBeforeStart('simulate', 'idle', PROGRAM_LOAD_STATE.EMPTY)).toBe(true);
    expect(shouldAutoLoadBeforeStart('hardware', 'idle', PROGRAM_LOAD_STATE.EMPTY)).toBe(false);
  });

  it('does not auto-load before start when a program is already marked loaded', () => {
    expect(shouldAutoLoadBeforeStart('simulate', 'idle', PROGRAM_LOAD_STATE.LOADED)).toBe(false);
  });

  it('requires an explicitly deployed program before hardware can run', () => {
    expect(canRunCurrentProgram('hardware', true, PROGRAM_LOAD_STATE.EMPTY)).toBe(false);
    expect(canRunCurrentProgram('hardware', true, PROGRAM_LOAD_STATE.LOADED)).toBe(true);
    expect(canRunCurrentProgram('simulate', true, PROGRAM_LOAD_STATE.EMPTY)).toBe(true);
  });

  it('accepts only the compile result built for the current compiler generation', () => {
    expect(isCompileResultCurrent(7, 7)).toBe(true);
    expect(isCompileResultCurrent(7, 8)).toBe(false);
    expect(isCompileResultCurrent(null, 8)).toBe(false);
  });

  it('invalidates program load state after a successful compile', () => {
    expect(nextProgramLoadStateAfterCompile()).toBe(PROGRAM_LOAD_STATE.EMPTY);
  });

  it('invalidates program load state after establishing a new session', () => {
    expect(nextProgramLoadStateAfterConnect()).toBe(PROGRAM_LOAD_STATE.EMPTY);
  });

  it('marks a deploy loaded only when its revision and compiler generation are still current', () => {
    expect(nextProgramLoadStateAfterDeploy(4, 4, 7, 7)).toBe(PROGRAM_LOAD_STATE.LOADED);
    expect(nextProgramLoadStateAfterDeploy(4, 5, 7, 7)).toBe(PROGRAM_LOAD_STATE.EMPTY);
    expect(nextProgramLoadStateAfterDeploy(4, 4, 7, 8)).toBe(PROGRAM_LOAD_STATE.EMPTY);
  });
});
