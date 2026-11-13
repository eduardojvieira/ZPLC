import { afterEach, describe, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import productManifest from '../../../../../package.json';
import { NativeSimulationSupervisor } from '../../../shared/nativeSimulationSupervisor';
import { itNative, nativeRuntimeBinary } from '../../cli/nativeRuntimeGuard';
import { createNativeScenarioRuntime } from '../../cli/nativeScenarioRuntime';
import { compileSingleFileWithTask } from '../../compiler';
import { NativeAdapter } from '../../runtime/nativeAdapter';
import { listIoMap } from '../../runtime/ioMap';
import type { PlantMapV2 } from '../../plants/plantMap';
import { compileScenario, runScenario } from '../../test-engine';
import type { PlantCore } from '../contracts';
import { generateDeclarations } from '../editor/declarations';
import { createPlantCore } from '../core/plantCore';
import { parseScene } from '../core/scene';
import { createPlantSession } from '../session/plantSession';

// PLT-005, PLT-012, PLT-017, LNK-003, LNK-006, SCN-004, SCN-011 to SCN-013 for a station scene (Task S5): a stacker crane stores a box in
// its rack and retrieves it, a lift carries a crate up and down, and a machining centre turns a blank into a lid. The scene is
// authored here, in fixtureStations/.
const dir = join(import.meta.dir, 'fixtureStations');
const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const parsed = parseScene(read('scene.json'));
if ('problems' in parsed) throw new Error(`fixtureStations/scene.json: ${parsed.problems.map((p) => p.message).join('; ')}`);
const scene = parsed.scene;
const map = JSON.parse(read('plant-map.json')) as PlantMapV2;
type ScriptEvent = { atMs: number; operate: { signal: string; value: boolean | number } };
const scenario = JSON.parse(read('scenario.json')) as { tickMs: number; durationMs: number; scene: { script: ScriptEvent[] } };
const referenceText = read('reference.st');
const compile = (source: string) => compileSingleFileWithTask(source, 'ST', { programName: 'StationCycle', intervalMs: scenario.tickMs });
const built = compile(referenceText);
const ioMap = listIoMap(built.debugMap);
const output = (path: string) => ioMap.outputs.find((entry) => entry.path === path)!.address;
// graded runs scenario.durationMs inclusive of the first step: 0, tick, ..., duration
const SCANS = scenario.durationMs / scenario.tickMs + 1;
const TEST_TIMEOUT_MS = 120_000;

const open: Array<() => Promise<void>> = [];
const cores: PlantCore[] = [];
afterEach(async () => {
  for (const stop of open.splice(0)) await stop();
  for (const core of cores.splice(0)) core.dispose();
});

async function nativeAdapter(program = built, virtualByEnvironment = false): Promise<NativeAdapter> {
  const persist = await mkdtemp(join(tmpdir(), 'zplc-plant-stations-ci-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-plant-stations-ci',
    clientVersion: productManifest.version,
    environment: {
      ...process.env,
      ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary,
      ZPLC_PERSIST_ROOT: persist,
      ...(virtualByEnvironment ? { ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1' } : {}),
    },
  });
  const adapter = new NativeAdapter(supervisor);
  open.push(async () => {
    await adapter.disconnect().catch(() => undefined);
    await supervisor.stopSession().catch(() => undefined);
    await rm(persist, { recursive: true, force: true });
  });
  await adapter.connect();
  await adapter.loadProgram(program.zplcFile);
  return adapter;
}

const freshCore = async () => {
  const core = await createPlantCore(scene);
  cores.push(core);
  return core;
};

type Op = readonly [name: 'apply' | 'advance' | 'operate' | 'addItem', args: unknown[]];
/** A core that records every call that changes the plant, in order, so the rest of a run can be replayed on another core. */
function recording(core: PlantCore): { core: PlantCore; ops: Op[] } {
  const ops: Op[] = [];
  const proxy = new Proxy(core, {
    get(target, property) {
      const value = Reflect.get(target, property) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (property === 'apply' || property === 'advance' || property === 'operate' || property === 'addItem')
          ops.push([property, structuredClone(args)]);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { core: proxy, ops };
}

/** The live session over `runtime` until `scans` scans completed; the scenario script is applied at its virtual times. */
function live(runtime: NativeAdapter, core: PlantCore, scans: number, after?: (done: number) => Promise<void>) {
  const session = createPlantSession({
    core,
    runtime,
    map,
    ioMap,
    paceMs: async () => {
      for (const event of scenario.scene.script)
        if (event.atMs === session.scans * session.scanMs) core.operate(event.operate.signal, event.operate.value);
      await after?.(session.scans);
      if (session.scans >= scans && session.state === 'running') session.pause();
    },
  });
  open.push(() => session.stop().catch(() => undefined));
  return session;
}

const peekInt = async (adapter: NativeAdapter, path: string) => {
  const bytes = await adapter.peek(output(path), 2);
  return new DataView(bytes.buffer, bytes.byteOffset, 2).getInt16(0, true);
};
const fact = (core: PlantCore, key: string) => core.facts()[key] as number;
const crate = (core: PlantCore) => core.snapshot().items.find((item) => item.id === 'crates-1')!;

/** Advances the core in plant steps until `done` holds; a failure to arrive is a test failure, not a hang. */
const advanceUntil = (core: PlantCore, done: () => boolean, maxMs = 20000) => {
  for (let ms = 0; ms < maxMs; ms += 5) {
    if (done()) return;
    core.advance(5);
  }
  throw new Error('the condition never held');
};
const sensed = (core: PlantCore, key: string) => () => core.sense()[key] === true;

describe('a station scene live and graded over the real native runtime', () => {
  itNative(
    'PLT-017 the live session and the graded run give the same trace hash over 1000 scans for the station fixture',
    async () => {
      const liveCore = await freshCore();
      const liveAdapter = await nativeAdapter();
      const session = live(liveAdapter, liveCore, SCANS);
      await session.start();
      await session.settled();
      expect(session.scans).toBe(SCANS);
      expect(SCANS).toBeGreaterThan(1000);

      const gradedCore = await freshCore();
      const graded = await runScenario(
        compileScenario(scenario, built.debugMap, { port: { core: gradedCore, map }, scene }),
        built.zplcFile,
        createNativeScenarioRuntime(await nativeAdapter(built, true)),
      );
      expect(graded.passed).toBe(true);
      // the stations did something physical: the box went into the rack and came out, the blank became one lid, the crate rode the lift
      expect(liveCore.facts()).toMatchObject({
        'produced:Mc1': 1,
        'misfires:Mc1': 0,
        'blocked:Crane1': 0,
        'stored:Crane1': 0,
        'cell:Crane1:1:1': false,
        itemsDropped: 0,
      });
      expect(fact(liveCore, 'axis:Crane1:z')).toBe(0); // the fork is back at the centre
      expect(fact(liveCore, 'axis:Lift1:y')).toBe(0); // and the lift is back at level 1
      expect(liveCore.sense()['Crane1.loaded']).toBe(true); // with the retrieved box on it
      expect(await gradedCore.traceHash()).toBe(await liveCore.traceHash());
      expect(gradedCore.facts()).toEqual(liveCore.facts());
      expect(gradedCore.snapshot().timeMs).toBe(liveCore.snapshot().timeMs);
      expect(JSON.stringify(gradedCore.snapshot())).toBe(JSON.stringify(liveCore.snapshot()));
    },
    TEST_TIMEOUT_MS,
  );

  itNative(
    'PLT-017 an INT bay and level reach the plant with the scaling of rules R-S1 and R-S2 on both paths',
    async () => {
      const liveCore = await freshCore();
      const liveAdapter = await nativeAdapter();
      const raw = new Set<string>();
      let farthest = 0;
      let highest = 0;
      let cellSeen = false;
      const session = live(liveAdapter, liveCore, SCANS, async (done) => {
        farthest = Math.max(farthest, fact(liveCore, 'axis:Crane1:x'));
        highest = Math.max(highest, fact(liveCore, 'axis:Crane1:y'));
        cellSeen ||= liveCore.facts()['cell:Crane1:1:1'] === true;
        if (done % 25 === 0)
          raw.add(`${await peekInt(liveAdapter, 'StationCycle.Bay')},${await peekInt(liveAdapter, 'StationCycle.Level')}`);
      });
      await session.start();
      await session.settled();

      // R-S1 and R-S2: bay 0..2 and level 0..2 over raw 0..2 are the identity; the plant reads bay x 1.0 m and level x 0.6 m
      expect(raw.has('0,0')).toBe(true);
      expect(raw.has('1,1')).toBe(true);
      for (const pair of raw) expect(['0,0', '1,1']).toContain(pair); // no other raw value was ever written
      expect(farthest).toBeCloseTo(1, 2); // bay 1 and never bay 2
      expect(highest).toBeCloseTo(0.6, 2); // level 1 and never level 2
      expect(cellSeen).toBe(true); // the box rested on its rails in cell (1, 1)
      expect([await peekInt(liveAdapter, 'StationCycle.Bay'), await peekInt(liveAdapter, 'StationCycle.Level')]).toEqual([1, 1]);

      const gradedCore = await freshCore();
      const gradedAdapter = await nativeAdapter(built, true);
      const graded = await runScenario(
        compileScenario(scenario, built.debugMap, { port: { core: gradedCore, map }, scene }),
        built.zplcFile,
        createNativeScenarioRuntime(gradedAdapter),
      );
      expect(graded.passed).toBe(true);
      // both paths end with the same raw numbers in the program and the same positions in the plant
      expect([await peekInt(gradedAdapter, 'StationCycle.Bay'), await peekInt(gradedAdapter, 'StationCycle.Level')]).toEqual([1, 1]);
      for (const axis of ['x', 'y', 'z']) expect(fact(gradedCore, `axis:Crane1:${axis}`)).toBe(fact(liveCore, `axis:Crane1:${axis}`));
      expect(await gradedCore.traceHash()).toBe(await liveCore.traceHash());
    },
    TEST_TIMEOUT_MS,
  );

  itNative(
    'PLT-012 a capture taken while a crate rides the lift and one with the fork extended restore and finish with the same hash',
    async () => {
      const real = await freshCore();
      const { core, ops } = recording(real);
      type Capture = { state: ReturnType<PlantCore['capture']>; ops: number; hash: string; snapshot: string };
      const take = async (): Promise<Capture> => ({
        state: core.capture(),
        ops: ops.length,
        hash: await core.traceHash(),
        snapshot: JSON.stringify(core.snapshot()),
      });

      // a crate is emitted onto the lift at level 1 and carried up by friction
      core.advance(300);
      core.apply({ 'Crate1.emit': true });
      core.advance(10);
      core.apply({ 'Crate1.emit': false });
      core.advance(1000);
      const crateBefore = crate(core).p[1];
      core.apply({ 'Lift1.up': true });
      advanceUntil(core, () => fact(core, 'axis:Lift1:y') > 0.25);
      const midLift = await take();
      const liftAtCapture = fact(core, 'axis:Lift1:y');
      expect(liftAtCapture).toBeLessThan(0.55); // taken between level 1 and level 2, still moving
      expect(core.sense()['Lift1.atLevel1']).toBe(false);
      expect(core.sense()['Lift1.atLevel2']).toBe(false);
      expect(crate(core).p[1]).toBeGreaterThan(crateBefore + 0.2); // the crate rides the platform
      advanceUntil(core, sensed(core, 'Lift1.atLevel2'));
      core.apply({ 'Lift1.up': false });
      core.advance(500);
      expect(crate(core).p[1]).toBeCloseTo(crateBefore + 0.6, 1);
      expect(fact(core, 'loaded:crate:0')).toBe(0);

      // the crane carries the box on its fork to the rack and puts it down: captured with the fork out and the box on it
      core.apply({ 'Crane1.raise': true, 'Crane1.level': 1, 'Crane1.bay': 1 });
      core.advance(300); // the setpoint latches on the next step: wait before trusting inPosition
      advanceUntil(core, sensed(core, 'Crane1.inPosition'));
      advanceUntil(core, sensed(core, 'Crane1.raised'));
      core.apply({ 'Crane1.forkRight': true });
      advanceUntil(core, () => fact(core, 'axis:Crane1:z') > 0.3);
      const midFork = await take();
      expect(fact(core, 'axis:Crane1:z')).toBeLessThan(0.7); // out, not yet at the end of its stroke
      expect(core.sense()['Crane1.loaded']).toBe(true); // the box is on the fork
      expect(fact(core, 'stored:Crane1')).toBe(0);
      advanceUntil(core, sensed(core, 'Crane1.forkAtRight'));
      core.apply({ 'Crane1.raise': false });
      core.advance(1500);
      core.apply({ 'Crane1.forkRight': false });
      advanceUntil(core, sensed(core, 'Crane1.forkCentre'));
      core.advance(500);
      expect(real.facts()).toMatchObject({ 'stored:Crane1': 1, 'cell:Crane1:1:1': true, 'blocked:Crane1': 0, itemsDropped: 0 });
      const endHash = await real.traceHash();
      const endSnapshot = JSON.stringify(real.snapshot());

      for (const taken of [midLift, midFork]) {
        const restored = await freshCore();
        restored.restore(taken.state);
        expect(JSON.stringify(restored.snapshot())).toBe(taken.snapshot);
        expect(await restored.traceHash()).toBe(taken.hash);
        for (const [name, args] of ops.slice(taken.ops)) (restored[name] as (...a: unknown[]) => unknown)(...args);
        expect(await restored.traceHash()).toBe(endHash);
        expect(restored.facts()).toEqual(real.facts());
        expect(JSON.stringify(restored.snapshot())).toBe(endSnapshot);
      }
      expect(midLift.ops).toBeLessThan(midFork.ops);
    },
    TEST_TIMEOUT_MS,
  );

  itNative(
    'PLT-005 pause and step mid-run leave the plant frozen and the trace unchanged',
    async () => {
      const core = await freshCore();
      const out = (c: PlantCore) => c.sense()['Crane1.forkAtRight'] === true;
      const session = live(await nativeAdapter(), core, SCANS, async () => {
        if (out(core) && session.state === 'running') session.pause();
      });
      await session.start();
      await session.settled();
      expect(session.state).toBe('paused');
      expect(out(core)).toBe(true); // the fork is out at the rack while the program waits

      const frozen = JSON.stringify(core.snapshot());
      const hash = await core.traceHash();
      const scans = session.scans;
      await new Promise((resolve) => setTimeout(resolve, 150)); // wall time passes; the plant does not
      expect(session.scans).toBe(scans);
      expect(JSON.stringify(core.snapshot())).toBe(frozen);
      expect(await core.traceHash()).toBe(hash);

      const timeBefore = core.snapshot().timeMs;
      await session.step();
      expect(session.state).toBe('paused');
      expect(session.scans).toBe(scans + 1);
      expect(core.snapshot().timeMs).toBe(timeBefore + session.scanMs);
      expect(await core.traceHash()).not.toBe(hash); // one scan of trace, and only one
    },
    TEST_TIMEOUT_MS,
  );

  itNative(
    'SCN-012 the generated declarations of the fixture map have two INT and the BOOL signals with their addresses, and the span is at ' +
      'most 64 bytes',
    async () => {
      const text = generateDeclarations((await freshCore()).signals, 'st');
      const [inputs, outputs] = text.split('  VAR_OUTPUT');
      for (const sensor of ['Start1_pressed', 'Crane1_inPosition', 'Crane1_raised', 'Crane1_forkCentre', 'Crane1_forkAtRight'])
        expect(inputs).toContain(`${sensor} : BOOL;`);
      for (const sensor of ['Lift1_atLevel1', 'Lift1_atLevel2', 'Mc1_ready']) expect(inputs).toContain(`${sensor} : BOOL;`);
      expect(outputs).toContain('Crane1_bay : INT;');
      expect(outputs).toContain('Crane1_level : INT;');
      for (const command of ['Crane1_raise', 'Crane1_forkRight', 'Lift1_up', 'Lift1_down', 'Crate1_emit', 'Mc1_feed', 'Mc1_start'])
        expect(outputs).toContain(`${command} : BOOL;`);
      expect(text.match(/: INT;/g)?.length).toBe(2);
      expect(text.match(/: REAL;/g)).toBeNull();
      // the map binds each signal to a point of the program, and the program's points sit at distinct addresses of the declared size
      const at = (path: string) => ioMap.outputs.find((entry) => entry.path === `StationCycle.${path}`)!;
      expect([at('Bay').size, at('Level').size]).toEqual([2, 2]);
      const points = [...ioMap.inputs, ...ioMap.outputs];
      const mapped = Object.values(map.signals).map((signal) => signal.point.replace('StationCycle.', ''));
      for (const point of mapped) expect(points.some((entry) => entry.path === `StationCycle.${point}`)).toBe(true);
      expect(new Set([at('Bay').address, at('Level').address]).size).toBe(2);
      const span = (entries: typeof points) =>
        Math.max(...entries.map((entry) => entry.address + entry.size)) - Math.min(...entries.map((entry) => entry.address));
      expect(span(ioMap.inputs)).toBeLessThanOrEqual(64);
      expect(span(ioMap.outputs)).toBeLessThanOrEqual(64);
    },
  );

  itNative(
    'SCN-004 the fixture reference passes and an empty program fails',
    async () => {
      const run = async (source: string) => {
        const program = compile(source);
        const core = await freshCore();
        return runScenario(
          compileScenario(scenario, program.debugMap, { port: { core, map }, scene }),
          program.zplcFile,
          createNativeScenarioRuntime(await nativeAdapter(program, true)),
        );
      };
      expect((await run(referenceText)).passed).toBe(true);
      // the same declarations with no statements: nothing runs, nothing is stored, nothing is machined
      const lastEndVar = referenceText.lastIndexOf('END_VAR') + 'END_VAR'.length;
      expect((await run(`${referenceText.slice(0, lastEndVar)}\n\nEND_PROGRAM\n`)).passed).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});
