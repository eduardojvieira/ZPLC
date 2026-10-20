// The recorder of the hardware check (LRN-024, LRN-015): it samples the lesson's inputs and outputs through the watch path of a
// session the learner connected, deployed and started. Every session here is a FAKE that counts each call it receives; no
// board is involved.
import { describe, expect, it } from 'bun:test';

import type { IDebugAdapter, VMState, WatchVariable } from '../runtime/debugAdapter';
import { recordHardwareTrace } from './hardwareRecorder';

const VARIABLES: WatchVariable[] = [
  { name: 'Start', address: 0x0000, bitOffset: 0, type: 'BOOL', forceable: true },
  { name: 'Motor', address: 0x1000, bitOffset: 0, type: 'BOOL', forceable: false },
  { name: 'Level', address: 0x1002, type: 'INT', forceable: false },
];

/** A fake session: `connected` and `state` as given, a value per read, and every call recorded by name. */
function fakeSession(connected: boolean, state: VMState, values: (read: number) => Record<string, number | boolean>) {
  const calls: string[] = [];
  let reads = 0;
  const session = new Proxy({ connected, state } as Record<string, unknown>, {
    get(target, key) {
      if (key === 'connected' || key === 'state') return target[key];
      if (key === 'readWatchVariables') {
        return async (variables: WatchVariable[]) => {
          calls.push('readWatchVariables');
          const now = values(reads++);
          return variables.map((variable) => ({ ...variable, value: now[variable.name] }));
        };
      }
      if (typeof key === 'string') return async () => { calls.push(key); };
      return undefined;
    },
  }) as unknown as IDebugAdapter & { connected: boolean; state: VMState };
  return { session, calls };
}

function clock() {
  let now = 1000;
  return { now: () => now, wait: async (ms: number) => { now += ms; } };
}

describe('the hardware recorder (LRN-024)', () => {
  it('LRN-024 samples the lesson signals at the interval, as whole ms since the start, BOOL as booleans', async () => {
    const { session, calls } = fakeSession(true, 'running', (read) => ({ Start: read >= 2 ? 1 : 0, Motor: read >= 3, Level: 40 + read }));
    const recording = await recordHardwareTrace(session, VARIABLES, { durationMs: 200, intervalMs: 50, ...clock() });
    expect(recording).toEqual({
      ok: true,
      trace: [
        { atMs: 0, values: { Start: false, Motor: false, Level: 40 } },
        { atMs: 50, values: { Start: false, Motor: false, Level: 41 } },
        { atMs: 100, values: { Start: true, Motor: false, Level: 42 } },
        { atMs: 150, values: { Start: true, Motor: true, Level: 43 } },
        { atMs: 200, values: { Start: true, Motor: true, Level: 44 } },
      ],
    });
    expect(new Set(calls)).toEqual(new Set(['readWatchVariables']));
  });

  it('LRN-024 ends when the learner says the run is done, keeping what it read', async () => {
    const { session } = fakeSession(true, 'running', () => ({ Start: false, Motor: false, Level: 0 }));
    const done = new AbortController();
    const time = clock();
    const recording = await recordHardwareTrace(session, VARIABLES, { durationMs: 10_000, intervalMs: 50, now: time.now, wait: async (ms) => { await time.wait(ms); if (time.now() >= 1100) done.abort(); }, signal: done.signal });
    // Done is pressed during the wait after the second read: no further read is made.
    expect(recording.ok && recording.trace.map((sample) => sample.atMs)).toEqual([0, 50]);
    // A caller that follows the samples can end the run itself.
    const enough = new AbortController();
    const seen: number[] = [];
    const followed = await recordHardwareTrace(session, VARIABLES, { durationMs: 10_000, intervalMs: 50, ...clock(), signal: enough.signal, onSample: (trace) => { seen.push(trace.length); if (trace.length === 3) enough.abort(); } });
    expect(seen).toEqual([1, 2, 3]);
    expect(followed.ok && followed.trace).toHaveLength(3);
  });
});

describe('the hardware recorder starts no physical operation (LRN-015)', () => {
  it('LRN-015 refuses a session that is not connected, and reads nothing', async () => {
    const { session, calls } = fakeSession(false, 'disconnected', () => ({}));
    expect(await recordHardwareTrace(session, VARIABLES, { durationMs: 100, intervalMs: 50, ...clock() })).toEqual({ ok: false, reason: 'not-connected', trace: [] });
    expect(calls).toEqual([]);
  });

  it('LRN-015 refuses a session the learner has not started, and does not start it', async () => {
    for (const state of ['idle', 'paused', 'error'] as const) {
      const { session, calls } = fakeSession(true, state, () => ({}));
      expect(await recordHardwareTrace(session, VARIABLES, { durationMs: 100, intervalMs: 50, ...clock() })).toEqual({ ok: false, reason: 'not-running', trace: [] });
      expect(calls).toEqual([]);
    }
  });

  it('LRN-015 stops, keeping what it read, when the session stops running or a read fails, and never restarts it', async () => {
    const stopping = fakeSession(true, 'running', () => ({ Start: false, Motor: false, Level: 0 }));
    const time = clock();
    const recording = await recordHardwareTrace(stopping.session, VARIABLES, {
      durationMs: 1000, intervalMs: 50, now: time.now,
      wait: async (ms) => { await time.wait(ms); if (time.now() >= 1100) (stopping.session as { state: VMState }).state = 'idle'; },
    });
    expect(recording).toEqual({ ok: false, reason: 'session-ended', trace: [{ atMs: 0, values: { Start: false, Motor: false, Level: 0 } }, { atMs: 50, values: { Start: false, Motor: false, Level: 0 } }] });
    expect(new Set(stopping.calls)).toEqual(new Set(['readWatchVariables']));

    const failing = fakeSession(true, 'running', () => { throw new Error('link lost'); });
    expect(await recordHardwareTrace(failing.session, VARIABLES, { durationMs: 100, intervalMs: 50, ...clock() })).toEqual({ ok: false, reason: 'read-failed', trace: [] });
    expect(new Set(failing.calls)).toEqual(new Set(['readWatchVariables']));
  });
});

describe('the polling recorder with "arm, then the learner presses Run" (LRN-024)', () => {
  it('LRN-024 waits while the program is stopped and makes the first sample of the run time 0', async () => {
    const waiting = fakeSession(true, 'idle', (read) => ({ Start: false, Motor: read >= 1, Level: read }));
    const time = clock();
    const recording = await recordHardwareTrace(waiting.session, VARIABLES, {
      durationMs: 1000, intervalMs: 100, awaitRun: true, now: time.now,
      wait: async (ms) => { await time.wait(ms); if (time.now() >= 1300) (waiting.session as { state: VMState }).state = 'running'; },
      signal: AbortSignal.timeout(60_000),
    });
    expect(recording.ok).toBe(true);
    expect(recording.trace[0]).toEqual({ atMs: 0, values: { Start: false, Motor: false, Level: 0 } });
    expect(recording.trace[1]!.atMs).toBe(100);
    expect(waiting.calls[0]).toBe('readWatchVariables'); // nothing was read, or driven, while the program was stopped
  });
});
