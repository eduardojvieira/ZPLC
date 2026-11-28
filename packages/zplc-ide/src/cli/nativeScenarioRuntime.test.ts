import { mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import type { WatchForceEntry } from '../runtime/debugAdapter';
import type { FactValue, PlantCore, PlantSceneFile } from '../plant/contracts';
import { compileScenario, runScenario } from '../test-engine';
import type { DebugMap } from '../compiler';
import { itNative, nativeRuntimeBinary } from './nativeRuntimeGuard';
import { createNativeScenarioRuntime, createNativeScenarioSession } from './nativeScenarioRuntime';

// The sessions of this file create their persistence roots under a temporary directory of their own, so that the
// roots another process (a second suite, the CLI of a developer) keeps in the shared temporary directory are never
// counted here. `tmpdir()` reads TMPDIR on POSIX and TEMP, then TMP, on Windows, on every call, and the native runtime
// inherits them.
const TEMP_VARIABLES = ['TMPDIR', 'TEMP', 'TMP'] as const;
const sharedTemp = tmpdir();
const previousTemp = TEMP_VARIABLES.map((name) => process.env[name]);
let privateTemp = '';

beforeAll(async () => {
  privateTemp = await realpath(await mkdtemp(join(sharedTemp, 'zplc-scenario-suite-')));
  for (const name of TEMP_VARIABLES) process.env[name] = privateTemp;
});

afterAll(async () => {
  TEMP_VARIABLES.forEach((name, index) => {
    if (previousTemp[index] === undefined) delete process.env[name];
    else process.env[name] = previousTemp[index];
  });
  await rm(privateTemp, { recursive: true, force: true });
});

async function scenarioRoots(): Promise<string[]> {
  return (await readdir(tmpdir())).filter((entry) => entry.startsWith('zplc-scenario-')).sort();
}

class FakeNativeAdapter {
  readonly calls: string[] = [];
  readonly memory = new Map<number, Uint8Array>();
  forced = false;
  shortRead = false;

  async loadProgram(bytes: Uint8Array): Promise<void> {
    this.calls.push(`load:${bytes.length}`);
  }
  async reset(): Promise<void> {
    this.calls.push('reset');
  }
  async scenarioStep(atMs: number): Promise<void> {
    this.calls.push(`scenario-step:${atMs}`);
  }
  // Only the number of forced entries matters to the scenario runtime port, so one empty entry stands in for a real one.
  async listForcedValues(): Promise<WatchForceEntry[]> {
    this.calls.push('forces');
    return this.forced ? [{} as WatchForceEntry] : [];
  }
  async peek(address: number, length: number): Promise<Uint8Array> {
    this.calls.push(`peek:${address}:${length}`);
    // one byte per address in the sparse map; `shortRead` simulates an adapter that returns too few bytes
    const out = new Uint8Array(this.shortRead ? length - 1 : length);
    for (let i = 0; i < out.length; i++) out[i] = this.memory.get(address + i)?.[0] ?? 0;
    return out;
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
    // the writes land in the shadow; the sibling bits only reach the adapter at the step, in one range
    expect([...adapter.memory.get(0)!]).toEqual([0b0101_0010]);
    await runtime.step(0);

    expect([...adapter.memory.get(0)!]).toEqual([0b0100_0011]);
    expect(adapter.calls).toEqual(['peek:0:64', 'poke:0:67', 'scenario-step:0']);
  });

  it('reads the requested bit from one OPI byte', async () => {
    const adapter = new FakeNativeAdapter();
    adapter.memory.set(0x1000, new Uint8Array([0b0010_0000]));
    const runtime = createNativeScenarioRuntime(adapter);

    await expect(runtime.readOutput(0x1000, 5)).resolves.toBe(true);
    await expect(runtime.readOutput(0x1000, 0)).resolves.toBe(false);
    expect(adapter.calls).toEqual(['peek:4096:64']); // both reads come from one chunk read
  });

  it('AI-08 readMemory refuses a size that is not a positive integer, before any adapter call', async () => {
    const adapter = new FakeNativeAdapter();
    const runtime = createNativeScenarioRuntime(adapter);
    for (const size of [Number.NaN, 0, 0.5, 1.5, -1]) await expect(runtime.readMemory!(0x2000, size)).rejects.toThrow('size');
    expect(adapter.calls).toEqual([]);
  });

  it('fails closed before adapter calls for invalid addresses, bits, and reads', async () => {
    const adapter = new FakeNativeAdapter();
    const runtime = createNativeScenarioRuntime(adapter);

    await expect(runtime.setInput(0x1000, 0, true)).rejects.toThrow('IPI');
    await expect(runtime.setInput(0, 8, true)).rejects.toThrow('bitOffset');
    await expect(runtime.readOutput(0, 0)).rejects.toThrow('OPI');
    await expect(runtime.readOutput(0x1000, -1)).rejects.toThrow('bitOffset');
    expect(adapter.calls).toEqual([]);

    adapter.shortRead = true;
    await expect(runtime.setInput(0, 0, true)).rejects.toThrow('exactly 64 bytes');
    await expect(runtime.readOutput(0x1000, 0)).rejects.toThrow('exactly 64 bytes');
    expect(adapter.calls).toEqual(['peek:0:64', 'peek:4096:64']);
    expect(adapter.calls.some((call) => call.startsWith('poke:'))).toBe(false);
  });
});

describe('a scene scenario on the native scenario runtime', () => {
  it('LNK-009 the headless runner needs no hardware or session: only load, reset, step, peek, poke and the force check', async () => {
    const adapter = new FakeNativeAdapter();
    const allowed = new Set(['loadProgram', 'reset', 'scenarioStep', 'listForcedValues', 'peek', 'poke']);
    // any other method of the adapter would be a hardware or session call: the proxy throws on it
    const strict = new Proxy(adapter, {
      get: (target, key) => {
        if (typeof key === 'string' && !allowed.has(key) && !['calls', 'memory', 'forced', 'shortRead', 'then'].includes(key))
          throw new Error(`unexpected adapter call ${key}`);
        return Reflect.get(target, key) as unknown;
      },
    });
    const bit = (addr: number, bitOffset: number, region: 'IPI' | 'OPI') => ({ addr, bitOffset, type: 'BOOL' as const, region, size: 1 });
    const debugMap = {
      version: '1.0.0',
      programName: 'Cell',
      compilerVersion: 'test',
      generatedAt: '',
      memoryLayout: {
        ipiBase: 0,
        ipiSize: 1,
        opiBase: 0x1000,
        opiSize: 1,
        workBase: 0x2000,
        workSize: 1,
        retainBase: 0x3000,
        retainSize: 1,
        codeBase: 0x4000,
        codeSize: 1,
      },
      pou: { Cell: { type: 'PROGRAM', sourceMap: [], breakpoints: [], vars: { Eye: bit(0, 0, 'IPI'), Belt: bit(0x1000, 0, 'OPI') } } },
    } as unknown as DebugMap;
    let advanced = 0;
    const core = {
      stepMs: 5,
      signals: [
        { name: 'Belt1.run', direction: 'command', type: 'BOOL' },
        { name: 'EyeA.detect', direction: 'sensor', type: 'BOOL' },
      ],
      apply: () => undefined,
      advance: () => void advanced++,
      sense: () => ({ 'EyeA.detect': true }),
      facts: (): Record<string, FactValue> => ({ itemsRemoved: 1 }),
      reset: () => undefined,
    } as unknown as PlantCore;
    const scene: PlantSceneFile = { schemaVersion: 1, name: 'c', parts: [], cameras: [] };
    const scenario = compileScenario(
      {
        schemaVersion: 1,
        id: 'lnk-009',
        tickMs: 10,
        durationMs: 20,
        scene: { file: 'scene.json', map: 'plant-map.json', script: [] },
        events: [],
        expectations: [{ kind: 'EVENTUALLY', fromMs: 0, withinMs: 20, condition: { 'fact:itemsRemoved': true } }],
      },
      debugMap,
      {
        scene,
        port: {
          core,
          map: {
            schemaVersion: 2,
            target: { scene: 'c' },
            signals: {
              'Belt1.run': { direction: 'command', type: 'BOOL', point: 'Cell.Belt' },
              'EyeA.detect': { direction: 'sensor', type: 'BOOL', point: 'Cell.Eye' },
            },
          },
        },
      },
    );
    const result = await runScenario(scenario, new Uint8Array([1]), createNativeScenarioRuntime(strict));
    expect(result.passed).toBe(true);
    expect(advanced).toBe(3);
    expect(adapter.calls.filter((call) => call.startsWith('scenario-step:'))).toEqual([
      'scenario-step:0',
      'scenario-step:10',
      'scenario-step:20',
    ]);
    expect(adapter.memory.get(0)![0]! & 1).toBe(1); // the eye reached input memory through poke
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
            connect: async () => {
              await mkdir(foreign);
            },
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
    const connectStartedPromise = new Promise<void>((resolve) => {
      connectStarted = resolve;
    });
    const connect = new Promise<void>((resolve) => {
      connectReady = resolve;
    });
    const stop = new Promise<void>((resolve) => {
      stopReady = resolve;
    });
    const creating = createNativeScenarioSession(process.env, {
      signal: controller.signal,
      createLifecycle: (persistRoot) => {
        root = persistRoot;
        return {
          adapter: {
            connect: async () => {
              calls.push('connect');
              connectStarted?.();
              await connect;
            },
            disconnect: async () => {
              calls.push('disconnect');
            },
            loadProgram: async () => undefined,
            reset: async () => undefined,
            scenarioStep: async () => undefined,
            listForcedValues: async () => [],
            peek: async () => new Uint8Array([0]),
            poke: async () => undefined,
          },
          supervisor: {
            stopSession: async () => {
              calls.push('stop');
              await stop;
            },
          },
        };
      },
    });
    await connectStartedPromise;
    controller.abort();
    await Promise.resolve();
    expect(calls).toEqual(['connect', 'disconnect', 'stop']);
    let settled = false;
    void creating.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
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
    const stopped = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const session = await createNativeScenarioSession(process.env, {
      signal: controller.signal,
      createLifecycle: () => ({
        adapter: {
          connect: async () => {
            calls.push('connect');
          },
          disconnect: async () => {
            calls.push('disconnect');
          },
          loadProgram: async () => undefined,
          reset: async () => undefined,
          scenarioStep: async () => undefined,
          listForcedValues: async () => [],
          peek: async () => new Uint8Array([0]),
          poke: async () => undefined,
        },
        supervisor: {
          stopSession: async () => {
            calls.push('stop');
            await stopped;
          },
        },
      }),
    });
    controller.abort();
    await Promise.resolve();
    expect(calls).toEqual(['connect', 'disconnect', 'stop']);
    let settled = false;
    const closing = session.close().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseStop?.();
    await closing;
    expect(calls).toEqual(['connect', 'disconnect', 'stop']);
    expect(await scenarioRoots()).toEqual(before);
  });

  itNative(
    'handshakes with the POSIX runtime and idempotently removes its private persistence root',
    async () => {
      const before = await scenarioRoots();
      const session = await createNativeScenarioSession({ ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary });

      const during = await scenarioRoots();
      expect(during.filter((entry) => !before.includes(entry))).toHaveLength(1);
      expect(await session.runtime.hasForces()).toBe(false);
      await Promise.all([session.close(), session.close()]);

      expect(await scenarioRoots()).toEqual(before);
    },
    30_000,
  );
});
