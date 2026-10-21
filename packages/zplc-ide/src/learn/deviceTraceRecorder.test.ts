// The device-trace recorder of the hardware check (LRN-024, LRN-015): it reads the per-scan trace a board keeps, and with
// "arm, then the learner presses Run" its time 0 is the first scan of the run. Every device here is a FAKE trace that serves
// SYNTHETIC samples and records each call it receives; no board is involved.
import { describe, expect, it } from 'bun:test';

import type { DeviceTrace, DeviceTraceSample, DeviceTraceStatus } from '../runtime/deviceTrace';
import type { VMState, WatchVariable } from '../runtime/debugAdapter';
import { recordDeviceTrace, traceLayoutOf } from './deviceTraceRecorder';

const VARIABLES: WatchVariable[] = [
  { name: 'Button', address: 0x0000, bitOffset: 0, type: 'BOOL', forceable: false },
  { name: 'Led', address: 0x1000, bitOffset: 0, type: 'BOOL', forceable: false },
  { name: 'OnBoardLed', address: 0x1000, bitOffset: 4, type: 'BOOL', forceable: false },
];

/** A device that has kept `samples` (with `ringFirst` the oldest it still holds); every call is recorded. */
function fakeTrace(samples: DeviceTraceSample[], options: { available?: boolean; ringFirst?: number } = {}) {
  const calls: string[] = [];
  let armed = false;
  const status = (): DeviceTraceStatus => ({
    available: options.available ?? true,
    armed,
    capacity: 200,
    inBytes: 1,
    outBytes: 1,
    written: samples.length,
    first: options.ringFirst ?? 0,
    maxIoBytes: 32,
  });
  const trace: DeviceTrace = {
    status: async () => {
      calls.push('status');
      return status();
    },
    arm: async (capacity, inBytes, outBytes) => {
      calls.push(`arm ${capacity} ${inBytes} ${outBytes}`);
      armed = true;
      return status();
    },
    read: async (from, count) => {
      calls.push('read');
      const start = Math.max(from, options.ringFirst ?? 0);
      const chunk = samples.slice(start, start + count);
      return { from: start, next: start + chunk.length, samples: chunk };
    },
    clear: async () => {
      calls.push('clear');
      armed = false;
      return status();
    },
  };
  return { trace, calls };
}

const sample = (seq: number, tUs: number, batch: number, button: boolean, led: boolean): DeviceTraceSample => ({
  seq,
  tUs,
  batch,
  inputs: Uint8Array.of(button ? 1 : 0),
  outputs: Uint8Array.of(led ? 0x11 : 0),
});

function clock() {
  let now = 0;
  return {
    now: () => now,
    wait: async (ms: number) => {
      now += ms;
    },
  };
}

const session = (state: VMState) => ({ connected: true, state });

describe('the layout of a device trace (LRN-024)', () => {
  it('LRN-024 keeps the bytes of the images the BOOL signals live in, and reads each bit', () => {
    const layout = traceLayoutOf(VARIABLES, 32)!;
    expect([layout.inBytes, layout.outBytes]).toEqual([1, 1]);
    expect(layout.valuesOf(sample(0, 0, 1, true, true))).toEqual({ Button: true, Led: true, OnBoardLed: true });
  });

  it('LRN-024 leaves to polling a signal outside the I/O images, a non-BOOL one, or one past what a sample holds', () => {
    expect(traceLayoutOf([{ name: 'Count', address: 0x2000, bitOffset: 0, type: 'BOOL', forceable: false }], 32)).toBeNull();
    expect(traceLayoutOf([{ name: 'Level', address: 0x0002, type: 'INT', forceable: false }], 32)).toBeNull();
    expect(traceLayoutOf([{ name: 'Far', address: 0x1040, bitOffset: 0, type: 'BOOL', forceable: false }], 32)).toBeNull();
  });
});

describe('the device-trace recorder (LRN-024, LRN-015)', () => {
  it('LRN-024 arms in STOP and makes the first scan of the run time 0, dropping what came before it', async () => {
    const { trace, calls } = fakeTrace([
      sample(0, 4_000, 7, false, false), // a scan of an earlier run, still in the ring
      sample(1, 50_000, 1, false, false),
      sample(2, 60_000, 2, false, false),
      sample(3, 70_000, 3, true, true),
    ]);
    const recording = await recordDeviceTrace(session('running'), trace, VARIABLES, {
      awaitRun: true,
      durationMs: 300,
      intervalMs: 100,
      ...clock(),
    });
    expect(recording).toMatchObject({ ok: true, anchored: true });
    expect(recording!.trace).toEqual([
      { atMs: 0, values: { Button: false, Led: false, OnBoardLed: false } },
      { atMs: 10, values: { Button: false, Led: false, OnBoardLed: false } },
      { atMs: 20, values: { Button: true, Led: true, OnBoardLed: true } },
    ]);
    expect(calls[0]).toBe('status');
    expect(calls[1]).toBe('arm 0 1 1');
    expect(calls.at(-1)).toBe('clear');
  });

  it('LRN-024 waits while the program is stopped until the learner presses Run', async () => {
    const { trace } = fakeTrace([]);
    const stopped = session('idle');
    const time = clock();
    const recording = await recordDeviceTrace(stopped, trace, VARIABLES, { awaitRun: true, durationMs: 500, intervalMs: 100, ...time });
    expect(recording).toMatchObject({ ok: true, trace: [] });
    expect(time.now()).toBeGreaterThan(500);
  });

  it('LRN-024 without the start makes the first sample read time 0, like the polling recorder', async () => {
    const { trace } = fakeTrace([sample(0, 120_000, 40, false, false), sample(1, 130_000, 41, false, true)]);
    const recording = await recordDeviceTrace(session('running'), trace, VARIABLES, {
      awaitRun: false,
      durationMs: 100,
      intervalMs: 100,
      ...clock(),
    });
    expect(recording).toMatchObject({ ok: true, anchored: false });
    expect(recording!.trace.map((entry) => entry.atMs)).toEqual([0, 10]);
  });

  it('LRN-024 gives the check back to polling when the device keeps no trace', async () => {
    const { trace, calls } = fakeTrace([], { available: false });
    expect(
      await recordDeviceTrace(session('running'), trace, VARIABLES, { awaitRun: false, durationMs: 100, intervalMs: 100, ...clock() }),
    ).toBeNull();
    expect(calls).toEqual(['status']);
  });

  it('LRN-024 refuses a run with a hole: samples the ring overwrote before they were read', async () => {
    const { trace } = fakeTrace([sample(0, 0, 1, false, false), sample(1, 10_000, 2, false, false), sample(2, 20_000, 3, false, false)], {
      ringFirst: 2,
    });
    const recording = await recordDeviceTrace(session('running'), trace, VARIABLES, {
      awaitRun: false,
      durationMs: 100,
      intervalMs: 100,
      ...clock(),
    });
    expect(recording).toMatchObject({ ok: false, reason: 'read-failed' });
  });

  it('LRN-015 only asks the trace for its status, arms, reads and clears it: the session is read for its state, never driven', async () => {
    const { trace, calls } = fakeTrace([sample(0, 0, 1, false, false)]);
    const touched: string[] = [];
    const watched = new Proxy({ connected: true, state: 'running' } as Record<string, unknown>, {
      get: (target, key) => {
        touched.push(String(key));
        return target[key as string];
      },
    }) as unknown as { connected: boolean; state: VMState };
    await recordDeviceTrace(watched, trace, VARIABLES, { awaitRun: true, durationMs: 100, intervalMs: 100, ...clock() });
    expect(new Set(touched)).toEqual(new Set(['connected', 'state']));
    expect(new Set(calls.map((call) => call.split(' ')[0]))).toEqual(new Set(['status', 'arm', 'read', 'clear']));
  });
});
