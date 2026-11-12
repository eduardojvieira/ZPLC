import { afterEach, describe, expect, it } from 'bun:test';

import type { DebugMap } from '../../compiler';
import { listIoMap } from '../../runtime/ioMap';
import type { PlantMapV2 } from '../../plants/plantMap';
import { compileScenario, runScenario, type ScenarioRuntimePort } from '../../test-engine';
import type { PlantCore, PlantRuntimePort, PlantSceneFile, PlantSessionEvent, ScenePart } from '../contracts';
import { createPlantCore } from '../core/plantCore';
import { createPlantSession } from './plantSession';

const layout = {
  ipiBase: 0,
  ipiSize: 16,
  opiBase: 0x1000,
  opiSize: 16,
  workBase: 0x2000,
  workSize: 1,
  retainBase: 0x3000,
  retainSize: 1,
  codeBase: 0x4000,
  codeSize: 1,
};
const bool = (addr: number, bitOffset: number, region: 'IPI' | 'OPI') => ({ addr, bitOffset, type: 'BOOL' as const, region, size: 1 });
const debugMap: DebugMap = {
  version: '1.0.0',
  programName: 'Cell',
  compilerVersion: 'test',
  generatedAt: '',
  memoryLayout: layout,
  pou: {
    Cell: {
      type: 'PROGRAM',
      sourceMap: [],
      breakpoints: [],
      vars: { Eye: bool(0, 0, 'IPI'), Start: bool(0, 1, 'IPI'), Belt: bool(0x1000, 0, 'OPI') },
    },
  },
};
const ioMap = listIoMap(debugMap);
const map: PlantMapV2 = {
  schemaVersion: 2,
  target: { scene: 'cell' },
  signals: {
    'belt.run': { direction: 'command', type: 'BOOL', point: 'Cell.Belt' },
    'eye.detect': { direction: 'sensor', type: 'BOOL', point: 'Cell.Eye' },
    'start.pressed': { direction: 'sensor', type: 'BOOL', point: 'Cell.Start' },
  },
};

/** A runtime that scans like the C one: the program is a latch (Start starts the belt, the eye stops it). */
function fakeRuntime(options: { scanIntervalMs?: number; failStep?: number; holdSteps?: number[] } = {}) {
  const ipi = new Uint8Array(16);
  const opi = new Uint8Array(16);
  const calls: string[] = [];
  let latch = false;
  let cycles = 0;
  let steps = 0;
  let heldAt: number | undefined;
  let mode = 'free';
  const scanOnce = () => {
    if ((ipi[0]! & 2) !== 0) latch = true;
    opi[0] = latch && (ipi[0]! & 1) === 0 ? 1 : 0;
    cycles += 1;
  };
  const port: PlantRuntimePort & { reset(): Promise<void> } = {
    setClockMode: async (m) => {
      calls.push(`clock:${m}`);
      mode = m;
      return { scanIntervalMs: options.scanIntervalMs ?? 10 };
    },
    scenarioStep: async (atMs) => {
      steps += 1;
      calls.push(`step@${atMs}`);
      if (steps === options.failStep) throw new Error('RUNTIME_FAILURE: zplc_core_run_cycle failed');
      if (options.holdSteps?.includes(steps)) {
        heldAt = atMs;
        return;
      }
      if (heldAt !== undefined && atMs !== heldAt) throw new Error('scenario at_ms must repeat the held timestamp while a scan is held');
      heldAt = undefined;
      scanOnce();
    },
    getInfo: async () => ({ cycles }),
    peek: async (address, length) => {
      calls.push(`peek@${address}+${length}`);
      return address >= 0x1000 ? opi.slice(address - 0x1000, address - 0x1000 + length) : ipi.slice(address, address + length);
    },
    pokeN: async (address, bytes) => {
      calls.push(`poke@${address}+${bytes.length}`);
      ipi.set(bytes, address);
    },
    reset: async () => void calls.push('reset'),
  };
  const graded: ScenarioRuntimePort = {
    loadProgram: async () => undefined,
    reset: async () => undefined,
    hasForces: async () => false,
    setInput: async (address, bit, value) => {
      ipi[address] = value ? ipi[address]! | (1 << bit) : ipi[address]! & ~(1 << bit);
    },
    step: async () => scanOnce(),
    readOutput: async (address, bit) => (opi[address - 0x1000]! & (1 << bit)) !== 0,
  };
  return { port, graded, calls, ipi, opi, mode: () => mode, cycles: () => cycles };
}

/** A fake plant that only counts: advance costs `costMs` of the injected clock. */
function fakeCore(clock = { ms: 0 }, costMs = 0) {
  const advances: number[] = [];
  let timeMs = 0;
  const core = {
    stepMs: 5,
    signals: [],
    apply: () => undefined,
    advance: (ms: number) => {
      advances.push(ms);
      timeMs += ms;
      clock.ms += costMs;
    },
    sense: () => ({ 'eye.detect': timeMs >= 500, 'start.pressed': false }),
    snapshot: () => ({ timeMs, scans: 0, parts: [], items: [], facts: {} }),
    reset: () => {
      timeMs = 0;
      advances.length = 0;
    },
  } as unknown as PlantCore;
  return { core, advances, timeMs: () => timeMs, clock };
}

const instant = async () => undefined;
const sessions: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const s of sessions.splice(0)) await s.stop().catch(() => undefined);
});
const make = (ports: Parameters<typeof createPlantSession>[0]) => {
  const session = createPlantSession(ports);
  sessions.push(session);
  return session;
};

describe('the lock-step session over fakes', () => {
  it('PLT-005 N ms of scans is N ms of plant', async () => {
    const plant = fakeCore();
    const rt = fakeRuntime();
    const session = make({
      core: plant.core,
      runtime: rt.port,
      map,
      ioMap,
      paceMs: async () => {
        if (session.scans >= 100) session.pause();
      },
    });
    await session.start();
    await session.settled();
    expect(session.state).toBe('paused');
    expect(rt.cycles()).toBe(100);
    expect(plant.timeMs()).toBe(1000);
    expect(plant.advances.every((ms) => ms === 10)).toBe(true);
    expect(rt.calls.filter((call) => call.startsWith('step@')).slice(0, 3)).toEqual(['step@0', 'step@10', 'step@20']);
  });

  it('PLT-005 pause freezes both and step advances both by one scan', async () => {
    const plant = fakeCore();
    const rt = fakeRuntime();
    const session = make({
      core: plant.core,
      runtime: rt.port,
      map,
      ioMap,
      paceMs: async () => {
        if (session.scans >= 100) session.pause();
      },
    });
    await session.start();
    await session.settled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect([rt.cycles(), plant.timeMs()]).toEqual([100, 1000]);
    await session.step();
    expect([rt.cycles(), plant.timeMs(), session.state]).toEqual([101, 1010, 'paused']);
    expect(() => session.resume()).not.toThrow();
    session.pause();
    await session.settled();
    expect(session.state).toBe('paused');
  });

  it('PLT-005 a runtime failure stops the plant at the last completed scan', async () => {
    const plant = fakeCore();
    const rt = fakeRuntime({ failStep: 51 });
    const events: PlantSessionEvent[] = [];
    const session = make({ core: plant.core, runtime: rt.port, map, ioMap, paceMs: instant });
    session.onChange((event) => events.push(event));
    await session.start();
    await session.settled();
    expect(session.state).toBe('faulted');
    expect(rt.cycles()).toBe(50);
    expect(session.scans).toBe(50);
    const failure = events.find((e) => e.kind === 'state' && e.state === 'faulted');
    expect(failure && 'reason' in failure ? failure.reason : '').toBe('RUNTIME_FAILURE: zplc_core_run_cycle failed');
    // events report the last completed scan (500 ms); the plant had already stepped for the scan in flight when it failed, and never steps
    // again
    const last = events.filter((e) => e.kind === 'scan').at(-1);
    expect(last && last.kind === 'scan' ? [last.scans, last.snapshot.timeMs] : []).toEqual([50, 500]);
    expect(plant.timeMs()).toBe(510);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(plant.timeMs()).toBe(510);
  });

  it('PLT-005 a held scan costs no clock: the plant does not step again and the continuation repeats the held time', async () => {
    const plant = fakeCore();
    const rt = fakeRuntime({ holdSteps: [4] });
    const session = make({
      core: plant.core,
      runtime: rt.port,
      map,
      ioMap,
      paceMs: async () => {
        if (session.scans >= 5) session.pause();
      },
    });
    await session.step();
    await session.step();
    await session.step();
    expect([session.scans, plant.timeMs()]).toEqual([3, 30]);
    await session.step();
    expect([session.state, session.heldSteps, session.scans, plant.timeMs()]).toEqual(['held', 1, 3, 40]);
    session.resume();
    await session.settled();
    session.pause();
    await session.settled();
    const steps = rt.calls.filter((call) => call.startsWith('step@'));
    expect(steps.slice(2, 6)).toEqual(['step@20', 'step@30', 'step@30', 'step@40']);
    expect(session.state).toBe('paused');
    // the held scan was exchanged once: 5 completed scans advanced the plant exactly 5 times
    expect([session.scans, plant.advances.length]).toEqual([5, 5]);
  });

  it('LNK-003 the exchange is one memory.write, one input read and one output read per scan', async () => {
    const plant = fakeCore();
    const rt = fakeRuntime();
    const session = make({
      core: plant.core,
      runtime: rt.port,
      map,
      ioMap,
      paceMs: async () => {
        if (session.scans >= 7) session.pause();
      },
    });
    await session.start();
    await session.settled();
    expect(rt.calls.filter((call) => call.startsWith('poke@'))).toEqual(Array(7).fill('poke@0+1'));
    expect(rt.calls.filter((call) => call.startsWith('peek@4096'))).toEqual(Array(7).fill('peek@4096+1'));
    // per scan: read, write, step, in this order
    expect(rt.calls.filter((call) => call.startsWith('peek@0'))).toEqual(Array(7).fill('peek@0+1'));
    expect(rt.calls.slice(1, 5)).toEqual(['peek@4096+1', 'peek@0+1', 'poke@0+1', 'step@0']);
  });

  it('PLT-016 a plant that cannot keep up slows both and says so, dropping no step', async () => {
    const clock = { ms: 0 };
    const plant = fakeCore(clock, 20); // each advance costs 2 scan intervals of the injected clock
    const rt = fakeRuntime();
    const events: PlantSessionEvent[] = [];
    const waits: number[] = [];
    const session = make({
      core: plant.core,
      runtime: rt.port,
      map,
      ioMap,
      now: () => clock.ms,
      paceMs: async (ms) => {
        waits.push(ms);
        if (session.scans >= 60) session.pause();
      },
    });
    session.onChange((event) => events.push(event));
    await session.start();
    await session.settled();
    expect(session.slowdown).toBeCloseTo(0.5, 1);
    const slow = events.filter((e) => e.kind === 'slowdown');
    expect(slow).toHaveLength(1);
    expect(slow[0] && 'message' in slow[0] ? slow[0].message : '').toContain('50 %');
    expect(plant.advances).toHaveLength(60); // one advance per completed scan, none skipped
    expect(rt.cycles()).toBe(60);
    expect(waits.every((ms) => ms >= 0)).toBe(true);
  });

  it('PLT-004 a scan interval that is not a multiple of 5 ms is refused with a located message', async () => {
    const plant = fakeCore();
    const rt = fakeRuntime({ scanIntervalMs: 7 });
    const session = make({ core: plant.core, runtime: rt.port, map, ioMap, paceMs: instant });
    await expect(session.start()).rejects.toThrow(
      'plant: the scan interval of 7 ms is not a multiple of the plant step of 5 ms; set the task interval to a multiple of 5 ms',
    );
    expect(session.state).toBe('idle');
    expect(rt.calls).not.toContain('step@0');
    expect(rt.mode()).toBe('free');
  });

  it('LNK-004 a map that the program does not declare is refused before the clock changes', async () => {
    const plant = fakeCore();
    const rt = fakeRuntime();
    const bad: PlantMapV2 = {
      ...map,
      signals: { ...map.signals, 'eye.detect': { direction: 'sensor', type: 'BOOL', point: 'Cell.Nope' } },
    };
    const session = make({ core: plant.core, runtime: rt.port, map: bad, ioMap, paceMs: instant });
    await expect(session.start()).rejects.toThrow('the program has no input Cell.Nope');
    expect(rt.calls).toEqual([]);
  });

  it('PLT-005 two steps at once run two scans in order, never overlapping', async () => {
    const plant = fakeCore();
    const rt = fakeRuntime();
    const session = make({ core: plant.core, runtime: rt.port, map, ioMap, paceMs: instant });
    await session.step();
    await Promise.allSettled([session.step(), session.step()]);
    expect(rt.calls.filter((call) => call.startsWith('step@'))).toEqual(['step@0', 'step@10', 'step@20']);
    expect([session.scans, plant.timeMs()]).toEqual([3, 30]);
  });

  it('PLT-005 a stop during a step ends stopped, not faulted', async () => {
    const plant = fakeCore();
    const rt = fakeRuntime();
    const session = make({ core: plant.core, runtime: rt.port, map, ioMap, paceMs: instant });
    await session.step();
    const stepping = session.step();
    const stopping = session.stop();
    await Promise.allSettled([stepping, stopping]);
    expect(session.state).toBe('stopped');
    expect(rt.mode()).toBe('free');
  });

  it('LNK-006 a bit the plant does not drive keeps the value a person set', async () => {
    const plant = fakeCore();
    const rt = fakeRuntime();
    rt.ipi[0] = 4; // Aux, set from the Faceplate
    const session = make({
      core: plant.core,
      runtime: rt.port,
      map,
      ioMap,
      paceMs: async () => {
        if (session.scans >= 3) session.pause();
      },
    });
    await session.start();
    await session.settled();
    expect(rt.ipi[0]! & 4).toBe(4);
  });

  it('PLT-005 stop gives the clock back and reset returns the session to idle', async () => {
    const plant = fakeCore();
    const rt = fakeRuntime();
    const session = make({
      core: plant.core,
      runtime: rt.port,
      map,
      ioMap,
      paceMs: async () => {
        if (session.scans >= 3) session.pause();
      },
    });
    await session.start();
    await session.settled();
    await session.stop();
    expect(session.state).toBe('stopped');
    expect(rt.calls.slice(-2)).toEqual(['reset', 'clock:free']);
    await session.reset();
    expect([session.state, session.scans, plant.timeMs()]).toEqual(['idle', 0, 0]);
  });
});

// A scene with a belt, a box on it, an eye and a start button: the program starts the belt on Start and stops it at the eye.
const TOP = 0.45;
const part = (
  id: string,
  partId: string,
  position: [number, number, number],
  config: ScenePart['config'] = {},
  rotationYDeg = 0,
): ScenePart => ({
  id,
  part: partId,
  name: id,
  position,
  rotationYDeg,
  config,
});
const scene: PlantSceneFile = {
  schemaVersion: 1,
  name: 'cell',
  cameras: [],
  parts: [
    part('belt', 'belt', [0, TOP, 0], { length: 4 }),
    part('crate', 'box', [-0.45, TOP, 0]),
    part('eye', 'sensor-diffuse', [0, TOP, -0.5], { rangeM: 1 }, 270),
    part('start', 'push-button', [-2, TOP, 1]),
  ],
};
const SCANS = 101; // 0..1000 ms every 10 ms
const SCRIPT = [
  { atMs: 100, operate: { signal: 'start.pressed', value: true } },
  { atMs: 200, operate: { signal: 'start.pressed', value: false } },
];

describe('the lock-step session on the real plant core', () => {
  const cores: PlantCore[] = [];
  afterEach(() => {
    for (const core of cores.splice(0)) core.dispose();
  });
  const fresh = async () => {
    const core = await createPlantCore(scene);
    cores.push(core);
    return core;
  };

  /** Live: the script events are applied between scans, at the time the graded run applies them. */
  async function live(waitFor: (ms: number) => Promise<void> = instant) {
    const core = await fresh();
    const rt = fakeRuntime();
    const session = make({
      core,
      runtime: rt.port,
      map,
      ioMap,
      paceMs: async (ms) => {
        await waitFor(ms);
        for (const event of SCRIPT)
          if (event.atMs === session.scans * session.scanMs) core.operate(event.operate.signal, event.operate.value);
        if (session.scans >= SCANS) session.pause();
      },
    });
    await session.start();
    await session.settled();
    return { core, rt, session };
  }

  it('PLT-017 host pacing does not change the trace', async () => {
    const plain = await live();
    let seed = 7;
    const jitter = async () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      await new Promise((resolve) => setTimeout(resolve, seed % 6));
    };
    const paced = await live(jitter);
    expect(plain.session.scans).toBe(SCANS);
    expect(await paced.core.traceHash()).toBe(await plain.core.traceHash());
    expect(plain.core.facts()['count:eye']).toBeGreaterThan(0); // the scene did something: the belt ran and the box reached the eye
  });

  it('PLT-017 live equals graded', async () => {
    const liveRun = await live();
    const gradedCore = await fresh();
    const gradedRuntime = fakeRuntime();
    const scenario = compileScenario(
      {
        schemaVersion: 1,
        id: 'live-equals-graded',
        tickMs: 10,
        durationMs: 1000,
        scene: { file: 'scene.json', map: 'plant-map.json', script: SCRIPT },
        events: [],
        expectations: [{ kind: 'ALWAYS', condition: { 'fact:itemsDropped': false } }],
      },
      debugMap,
      { port: { core: gradedCore, map }, scene },
    );
    const result = await runScenario(scenario, new Uint8Array([1]), gradedRuntime.graded);
    expect(result.assertions[0]?.passed).toBe(true);
    expect(await gradedCore.traceHash()).toBe(await liveRun.core.traceHash());
    expect(gradedCore.facts()).toEqual(liveRun.core.facts());
    expect(gradedRuntime.cycles()).toBe(liveRun.rt.cycles());
  });
});
