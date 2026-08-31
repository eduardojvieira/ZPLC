import { describe, expect, it } from 'bun:test';

import { presentOperationalStatus, type OperationalStatusInput } from './operationalStatusPresentation';

const base = {
  mode: 'simulate',
  adapterType: null,
  connected: false,
  vmInfo: null,
  status: { text: 'Disconnected', tone: 'neutral' as const },
  projectTargetBoard: 'rpi_pico',
  projectTasks: [],
  controllerInfo: null,
  controllerStatus: null,
  forcedValuesCount: 0,
  forcesUnconfirmed: false,
  nativeTrace: [],
} satisfies OperationalStatusInput;

describe('presentOperationalStatus', () => {
  it('keeps a disconnected simulation honest', () => {
    expect(presentOperationalStatus(base)).toMatchObject({
      mode: 'SIMULATION', runtime: 'No runtime session', status: { text: 'Disconnected', tone: 'neutral' },
    });
    expect(presentOperationalStatus(base).target).toBeUndefined();
  });

  it('presents native POSIX cycles and the last reported overrun count', () => {
    const result = presentOperationalStatus({
      ...base,
      adapterType: 'native',
      connected: true,
      vmInfo: { cycles: 0 },
      status: { text: 'Running', tone: 'success' },
      projectTasks: [{ interval_ms: 10 }],
      nativeTrace: [{ source: 'native', overruns: 2 }],
    });

    expect(result).toMatchObject({
      runtime: 'Native POSIX', target: 'Local POSIX', cycles: 0, taskIntervalMs: 10, overruns: 2,
    });
  });

  it('prefers a safe serial handshake board over the configured target and permits a safe version', () => {
    const result = presentOperationalStatus({
      ...base,
      mode: 'hardware',
      adapterType: 'serial',
      connected: true,
      controllerInfo: { board: 'Nucleo H743ZI', zplc_version: '1.5.0' },
      projectTargetBoard: 'rpi_pico',
      controllerStatus: { stats: { overruns: 3 } },
    });

    expect(result).toMatchObject({ runtime: 'Serial runtime · 1.5.0', target: 'Nucleo H743ZI', overruns: 3 });
  });

  it('labels an unhandshaken hardware target as configured only', () => {
    expect(presentOperationalStatus({ ...base, mode: 'hardware' }).target).toBe('rpi_pico (configured)');
  });

  it('does not revive disconnected controller, cycle, or overrun state', () => {
    const result = presentOperationalStatus({
      ...base,
      mode: 'hardware',
      vmInfo: { cycles: 12 },
      controllerInfo: { board: 'Nucleo H743ZI', zplc_version: '1.5.0' },
      controllerStatus: { stats: { overruns: 3 } },
    });

    expect(result).toMatchObject({ runtime: 'No runtime session', target: 'rpi_pico (configured)' });
    expect(result).not.toHaveProperty('cycles');
    expect(result).not.toHaveProperty('overruns');
    expect(JSON.stringify(result)).not.toContain('Nucleo');
  });

  it('makes the WASM fallback degraded without inventing a target', () => {
    const result = presentOperationalStatus({ ...base, adapterType: 'wasm', connected: true });
    expect(result.runtime).toBe('WASM fallback · degraded');
    expect(result.target).toBeUndefined();
  });

  it('omits absent metrics, only names one-task intervals, and otherwise reports task count', () => {
    expect(presentOperationalStatus(base)).not.toHaveProperty('cycles');
    expect(presentOperationalStatus({ ...base, projectTasks: [{ interval_ms: 0 }] })).not.toHaveProperty('taskIntervalMs');
    expect(presentOperationalStatus({ ...base, projectTasks: [{ interval_ms: 10 }, { interval_ms: 20 }] })).toMatchObject({ taskCount: 2 });
  });

  it('shows active forces only in a compatible session and makes unconfirmed state dominate', () => {
    const connected = { ...base, adapterType: 'native' as const, connected: true };
    expect(presentOperationalStatus({ ...connected, forcedValuesCount: 1 }).force).toEqual({ kind: 'active', text: '1 active force' });
    expect(presentOperationalStatus({ ...connected, forcedValuesCount: 4 }).force).toEqual({ kind: 'active', text: '4 active forces' });
    expect(presentOperationalStatus({ ...connected, forcedValuesCount: 8 }).force).toEqual({ kind: 'active', text: '8 active forces' });
    expect(presentOperationalStatus({ ...connected, forcedValuesCount: 4, forcesUnconfirmed: true }).force).toEqual({
      kind: 'unconfirmed', text: 'Force state unconfirmed — verify and reconnect before operating.',
    });
    expect(presentOperationalStatus({ ...base, forcedValuesCount: 1 }).force).toEqual({
      kind: 'unconfirmed', text: 'Force state unconfirmed — verify and reconnect before operating.',
    });
    expect(presentOperationalStatus({ ...connected, forcedValuesCount: 9 }).force).toEqual({
      kind: 'unconfirmed', text: 'Force state unconfirmed — verify and reconnect before operating.',
    });
  });

  it('fails closed for connected runtime mode mismatches', () => {
    for (const incompatible of [
      { ...base, mode: 'simulate' as const, adapterType: 'serial' as const, connected: true, vmInfo: { cycles: 7 }, controllerInfo: { board: 'Nucleo H743ZI', zplc_version: '1.5.0' }, controllerStatus: { stats: { overruns: 3 } } },
      { ...base, mode: 'hardware' as const, adapterType: 'native' as const, connected: true, vmInfo: { cycles: 7 }, nativeTrace: [{ source: 'native', overruns: 3 }] },
    ]) {
      const result = presentOperationalStatus(incompatible);
      expect(result).toMatchObject({ runtime: 'No compatible runtime session', status: { text: 'Runtime mode mismatch · reconnect required', tone: 'danger' } });
      expect(result).not.toHaveProperty('cycles');
      expect(result).not.toHaveProperty('overruns');
      expect(result.target).toBe(incompatible.mode === 'hardware' ? 'rpi_pico (configured)' : undefined);
    }
  });

  it('fails closed for hostile strings and invalid numbers', () => {
    const result = presentOperationalStatus({
      ...base,
      mode: 'hardware',
      adapterType: 'serial',
      connected: true,
      vmInfo: { cycles: -1 },
      projectTargetBoard: '../../secret',
      controllerInfo: { board: '<token>', zplc_version: 'v=secret' },
      controllerStatus: { stats: { overruns: Number.POSITIVE_INFINITY } },
      forcedValuesCount: -1,
      status: { text: '<unsafe>', tone: 'success' },
    });

    expect(result).toMatchObject({ runtime: 'Serial runtime', status: { text: 'Status unavailable', tone: 'neutral' } });
    expect(result.target).toBeUndefined();
    expect(result).not.toHaveProperty('cycles');
    expect(result).not.toHaveProperty('overruns');
    expect(result.force).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
