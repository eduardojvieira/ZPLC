import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import type { WatchForceEntry } from '../runtime/debugAdapter';
import { itNative, nativeRuntimeBinary } from './nativeRuntimeGuard';
import { createNativeScenarioRuntime, createNativeScenarioSession } from './nativeScenarioRuntime';

// The sessions of this file create their persistence roots under a temporary directory of their own, so that the
// roots another process (a second suite, the CLI of a developer) keeps in the shared temporary directory are never
// counted here. `tmpdir()` reads TMPDIR on every call, and the native runtime inherits it.
const sharedTemp = tmpdir();
const previousTemp = process.env.TMPDIR;
let privateTemp = '';

beforeAll(async () => {
  privateTemp = await mkdtemp(join(sharedTemp, 'zplc-scenario-suite-'));
  process.env.TMPDIR = privateTemp;
});

afterAll(async () => {
  if (previousTemp === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previousTemp;
  await rm(privateTemp, { recursive: true, force: true });
});

async function scenarioRoots(): Promise<string[]> {
  return (await readdir(tmpdir())).filter((entry) => entry.startsWith('zplc-scenario-')).sort();
}

class FakeNativeAdapter {
  readonly calls: string[] = [];
  readonly memory = new Map<number, Uint8Array>();
  forced = false;

  async loadProgram(bytes: Uint8Array): Promise<void> { this.calls.push(`load:${bytes.length}`); }
  async reset(): Promise<void> { this.calls.push('reset'); }
  async scenarioStep(atMs: number): Promise<void> { this.calls.push(`scenario-step:${atMs}`); }
  // Only the number of forced entries matters to the scenario runtime port, so one empty entry stands in for a real one.
  async listForcedValues(): Promise<WatchForceEntry[]> { this.calls.push('forces'); return this.forced ? [{} as WatchForceEntry] : []; }
  async peek(address: number, length: number): Promise<Uint8Array> {
    this.calls.push(`peek:${address}:${length}`);
    return this.memory.get(address) ?? new Uint8Array([0]);
  }
  async poke(address: number, value: number): Promise<void> {
    this.calls.push(`poke:${address}:${value}`);
    this.memory.set(address, new Uint8Array([value]));
  }
}

describe('createNativeScenarioRuntime', () => {
  it('delegates program lifecycle and detects forces', async () => {
    const adapter = new FakeNativeAdapter();
    const runtime = createNativeScenarioRuntime(adapter);

    await runtime.loadProgram(new Uint8Array([1, 2]));
    await runtime.reset();
    await runtime.step(0);
    expect(await runtime.hasForces()).toBe(false);
    adapter.forced = true;
    expect(await runtime.hasForces()).toBe(true);
    expect(adapter.calls).toEqual(['load:2', 'reset', 'scenario-step:0', 'forces', 'forces']);
  });

  it('updates one IPI bit without changing its siblings', async () => {
    const adapter = new FakeNativeAdapter();
    adapter.memory.set(0, new Uint8Array([0b0101_0010]));
    const runtime = createNativeScenarioRuntime(adapter);

    await runtime.setInput(0, 0, true);
    await runtime.setInput(0, 4, false);

    expect([...adapter.memory.get(0)!]).toEqual([0b0100_0011]);
    expect(adapter.calls).toEqual(['peek:0:1', 'poke:0:83', 'peek:0:1', 'poke:0:67']);
  });

  it('reads the requested bit from one OPI byte', async () => {
    const adapter = new FakeNativeAdapter();
    adapter.memory.set(0x1000, new Uint8Array([0b0010_0000]));
    const runtime = createNativeScenarioRuntime(adapter);

    await expect(runtime.readOutput(0x1000, 5)).resolves.toBe(true);
    await expect(runtime.readOutput(0x1000, 0)).resolves.toBe(false);
    expect(adapter.calls).toEqual(['peek:4096:1', 'peek:4096:1']);
  });

  it('fails closed before adapter calls for invalid addresses, bits, and reads', async () => {
    const adapter = new FakeNativeAdapter();
    const runtime = createNativeScenarioRuntime(adapter);

    await expect(runtime.setInput(0x1000, 0, true)).rejects.toThrow('IPI');
    await expect(runtime.setInput(0, 8, true)).rejects.toThrow('bitOffset');
    await expect(runtime.readOutput(0, 0)).rejects.toThrow('OPI');
    await expect(runtime.readOutput(0x1000, -1)).rejects.toThrow('bitOffset');
    expect(adapter.calls).toEqual([]);

    adapter.memory.set(0, new Uint8Array());
    await expect(runtime.setInput(0, 0, true)).rejects.toThrow('exactly one byte');
    adapter.memory.set(0x1000, new Uint8Array());
    await expect(runtime.readOutput(0x1000, 0)).rejects.toThrow('exactly one byte');
    expect(adapter.calls).toEqual(['peek:0:1', 'peek:4096:1']);
    expect(adapter.calls.some((call) => call.startsWith('poke:'))).toBe(false);
  });
});

describe('createNativeScenarioSession', () => {
  it('does not count the scenario directories that other processes keep in the shared temporary directory', async () => {
    expect(tmpdir()).toBe(privateTemp);
    const before = await scenarioRoots();
    const foreign = join(sharedTemp, `zplc-scenario-foreign-${process.pid}-${Date.now()}`);
    let root = '';
    const session = await createNativeScenarioSession(process.env, {
      createLifecycle: (persistRoot) => {
        root = persistRoot;
        return {
          adapter: {
            // another suite creates its root while this one connects
            connect: async () => { await mkdir(foreign); },
            disconnect: async () => undefined,
            loadProgram: async () => undefined,
            reset: async () => undefined,
            scenarioStep: async () => undefined,
            listForcedValues: async () => [],
            peek: async () => new Uint8Array([0]),
            poke: async () => undefined,
          },
          supervisor: { stopSession: async () => undefined },
        };
      },
    });
    try {
      const during = await scenarioRoots();
      expect(during.filter((entry) => !before.includes(entry))).toHaveLength(1);
      expect(root.startsWith(privateTemp)).toBe(true);
      expect(during).not.toContain(foreign.slice(sharedTemp.length + 1));
    } finally {
      await session.close();
      await rm(foreign, { recursive: true, force: true });
    }
    expect(await scenarioRoots()).toEqual(before);
  });

  it('removes its private persistence root after a missing simulator failure', async () => {
    const before = await scenarioRoots();
    const environment = {
      ...process.env,
      ZPLC_NATIVE_SIM_BIN: join(tmpdir(), 'zplc-missing-simulator'),
      ZPLC_PERSIST_ROOT: 'caller-persistence-root',
    };

    await expect(createNativeScenarioSession(environment)).rejects.toThrow('Native simulator binary not found');

    expect(await scenarioRoots()).toEqual(before);
    expect(environment.ZPLC_PERSIST_ROOT).toBe('caller-persistence-root');
  });

  it('does not create a persistence root for an already cancelled session', async () => {
    const before = await scenarioRoots();
    const controller = new AbortController();
    controller.abort();
    await expect(createNativeScenarioSession(process.env, { signal: controller.signal })).rejects.toHaveProperty('name', 'AbortError');
    expect(await scenarioRoots()).toEqual(before);
  });

  it('starts one close during connect cancellation and waits for cleanup before rejecting', async () => {
    const before = await scenarioRoots();
    const controller = new AbortController();
    const calls: string[] = [];
    let connectReady: (() => void) | undefined;
    let stopReady: (() => void) | undefined;
    let connectStarted: (() => void) | undefined;
    let root = '';
    const connectStartedPromise = new Promise<void>((resolve) => { connectStarted = resolve; });
    const connect = new Promise<void>((resolve) => { connectReady = resolve; });
    const stop = new Promise<void>((resolve) => { stopReady = resolve; });
    const creating = createNativeScenarioSession(process.env, {
      signal: controller.signal,
      createLifecycle: (persistRoot) => {
        root = persistRoot;
        return {
          adapter: {
            connect: async () => { calls.push('connect'); connectStarted?.(); await connect; },
            disconnect: async () => { calls.push('disconnect'); },
            loadProgram: async () => undefined,
            reset: async () => undefined,
            scenarioStep: async () => undefined,
            listForcedValues: async () => [],
            peek: async () => new Uint8Array([0]),
            poke: async () => undefined,
          },
          supervisor: { stopSession: async () => { calls.push('stop'); await stop; } },
        };
      },
    });
    await connectStartedPromise;
    controller.abort();
    await Promise.resolve();
    expect(calls).toEqual(['connect', 'disconnect', 'stop']);
    let settled = false;
    void creating.then(() => { settled = true; }, () => { settled = true; });
    connectReady?.();
    await Promise.resolve();
    expect(settled).toBe(false);
    stopReady?.();
    await expect(creating).rejects.toHaveProperty('name', 'AbortError');
    await Promise.resolve();
    expect(settled).toBe(true);
    expect(root).toMatch(/zplc-scenario-/);
    expect(await scenarioRoots()).toEqual(before);
  });

  it('uses the same idempotent close for a live-session abort', async () => {
    const before = await scenarioRoots();
    const controller = new AbortController();
    const calls: string[] = [];
    let releaseStop: (() => void) | undefined;
    const stopped = new Promise<void>((resolve) => { releaseStop = resolve; });
    const session = await createNativeScenarioSession(process.env, {
      signal: controller.signal,
      createLifecycle: () => ({
        adapter: {
          connect: async () => { calls.push('connect'); },
          disconnect: async () => { calls.push('disconnect'); },
          loadProgram: async () => undefined,
          reset: async () => undefined,
          scenarioStep: async () => undefined,
          listForcedValues: async () => [],
          peek: async () => new Uint8Array([0]),
          poke: async () => undefined,
        },
        supervisor: { stopSession: async () => { calls.push('stop'); await stopped; } },
      }),
    });
    controller.abort();
    await Promise.resolve();
    expect(calls).toEqual(['connect', 'disconnect', 'stop']);
    let settled = false;
    const closing = session.close().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseStop?.();
    await closing;
    expect(calls).toEqual(['connect', 'disconnect', 'stop']);
    expect(await scenarioRoots()).toEqual(before);
  });

  itNative('handshakes with the POSIX runtime and idempotently removes its private persistence root', async () => {
    const before = await scenarioRoots();
    const session = await createNativeScenarioSession({ ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary });

    const during = await scenarioRoots();
    expect(during.filter((entry) => !before.includes(entry))).toHaveLength(1);
    expect(await session.runtime.hasForces()).toBe(false);
    await Promise.all([session.close(), session.close()]);

    expect(await scenarioRoots()).toEqual(before);
  }, 30_000);
});
