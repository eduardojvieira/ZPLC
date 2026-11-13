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

// PLT-005, PLT-012, PLT-017, LNK-003, LNK-006, SCN-004, SCN-013 for a gripping scene (Task S3): a numeric two-axis pick and place with a
// vacuum pad lifts a box from x 0.4 m and sets it on a pallet centred at x 1.3 m, over x 1.0 m. The fixture is authored here, in
// fixtureGrip/.
const dir = join(import.meta.dir, 'fixtureGrip');
const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const parsed = parseScene(read('scene.json'));
if ('problems' in parsed) throw new Error(`fixtureGrip/scene.json: ${parsed.problems.map((p) => p.message).join('; ')}`);
const scene = parsed.scene;
const map = JSON.parse(read('plant-map.json')) as PlantMapV2;
type ScriptEvent =
  | { atMs: number; operate: { signal: string; value: boolean | number } }
  | { atMs: number; emit: { kind: string; at: [number, number, number] } };
const scenario = JSON.parse(read('scenario.json')) as { tickMs: number; durationMs: number; scene: { script: ScriptEvent[] } };
const built = compileSingleFileWithTask(read('reference.st'), 'ST', { programName: 'GripCycle', intervalMs: scenario.tickMs });
const ioMap = listIoMap(built.debugMap);
const input = (path: string) => ioMap.inputs.find((entry) => entry.path === path)!.address;
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

async function nativeAdapter(virtualByEnvironment = false): Promise<NativeAdapter> {
  const persist = await mkdtemp(join(tmpdir(), 'zplc-plant-grip-ci-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-plant-grip-ci',
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
  await adapter.loadProgram(built.zplcFile);
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
      for (const event of scenario.scene.script) {
        if (event.atMs !== session.scans * session.scanMs) continue;
        if ('operate' in event) core.operate(event.operate.signal, event.operate.value);
        else core.addItem(event.emit.kind, event.emit.at);
      }
      await after?.(session.scans);
      if (session.scans >= scans && session.state === 'running') session.pause();
    },
  });
  open.push(() => session.stop().catch(() => undefined));
  return session;
}

const carrying = (core: PlantCore) => core.sense()['Pick1.gripped'] === true && Number(core.facts()['axis:Pick1:x']) >= 0.6;
const BOX = 'added-1'; // the first scripted emit; the pallet is added-2
const boxX = (core: PlantCore) => core.snapshot().items.find((item) => item.id === BOX)!.p[0];

describe('a gripping scene live and graded over the real native runtime', () => {
  itNative(
    'PLT-017 a gripping scene gives the same trace hash live and graded',
    async () => {
      const liveCore = await freshCore();
      const session = live(await nativeAdapter(), liveCore, SCANS);
      await session.start();
      await session.settled();
      expect(session.scans).toBe(SCANS);

      const gradedCore = await freshCore();
      const graded = await runScenario(
        compileScenario(scenario, built.debugMap, { port: { core: gradedCore, map }, scene }),
        built.zplcFile,
        createNativeScenarioRuntime(await nativeAdapter(true)),
      );
      expect(graded.passed).toBe(true);
      // the scene did something physical: the box was picked, carried across and placed on the pallet, nothing dropped
      expect(liveCore.facts()).toMatchObject({ 'picked:Pick1': 1, 'placed:Pick1': 1, 'drops:Pick1': 0 });
      expect(boxX(liveCore)).toBeCloseTo(1, 1);
      // the trace covers scan 0 (the hash starts at the first advance) through the last
      expect(await gradedCore.traceHash()).toBe(await liveCore.traceHash());
      expect(gradedCore.facts()).toEqual(liveCore.facts());
      expect(gradedCore.snapshot().timeMs).toBe(liveCore.snapshot().timeMs);
      expect(JSON.stringify(gradedCore.snapshot())).toBe(JSON.stringify(liveCore.snapshot()));
    },
    TEST_TIMEOUT_MS,
  );

  itNative(
    'PLT-005 pause freezes the carriage and the held box, and a single step advances both by one scan',
    async () => {
      const core = await freshCore();
      const adapter = await nativeAdapter();
      const session = live(adapter, core, SCANS, async () => {
        if (carrying(core) && session.state === 'running') session.pause();
      });
      await session.start();
      await session.settled();
      expect(session.state).toBe('paused');
      expect(carrying(core)).toBe(true);

      const frozen = JSON.stringify(core.snapshot());
      const scans = session.scans;
      await new Promise((resolve) => setTimeout(resolve, 150)); // wall time passes; the plant does not
      expect(session.scans).toBe(scans);
      expect(JSON.stringify(core.snapshot())).toBe(frozen);

      const padBefore = Number(core.facts()['axis:Pick1:x']);
      const boxBefore = boxX(core);
      const timeBefore = core.snapshot().timeMs;
      await session.step();
      expect(session.state).toBe('paused');
      expect(session.scans).toBe(scans + 1);
      expect(core.snapshot().timeMs).toBe(timeBefore + session.scanMs);
      const padMoved = Number(core.facts()['axis:Pick1:x']) - padBefore;
      expect(padMoved).toBeGreaterThan(0); // the carriage moved on this scan (0.8 m/s: about 8 mm)
      expect(boxX(core) - boxBefore).toBeCloseTo(padMoved, 2); // and the held box with it, within 5 mm
      expect(core.sense()['Pick1.gripped']).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  itNative(
    'PLT-012 capturing the plant mid-carry and restoring it gives the same remaining trace as the uninterrupted run',
    async () => {
      const real = await freshCore();
      const { core, ops } = recording(real);
      let state: ReturnType<PlantCore['capture']> | undefined;
      let opsAtCapture = 0;
      let hashAtCapture = '';
      let snapshotAtCapture = '';
      const session = live(await nativeAdapter(), core, SCANS, async () => {
        if (state === undefined && carrying(core)) {
          state = core.capture();
          opsAtCapture = ops.length;
          hashAtCapture = await core.traceHash();
          snapshotAtCapture = JSON.stringify(core.snapshot());
        }
      });
      await session.start();
      await session.settled();
      expect(state).toBeDefined();
      expect(real.facts()).toMatchObject({ 'picked:Pick1': 1, 'placed:Pick1': 1 });
      const endHash = await real.traceHash();

      // a fresh plant takes the capture and is fed the commands the uninterrupted run received after it
      const restored = await freshCore();
      restored.restore(state!);
      expect(JSON.stringify(restored.snapshot())).toBe(snapshotAtCapture);
      expect(await restored.traceHash()).toBe(hashAtCapture);
      expect(restored.sense()['Pick1.gripped']).toBe(true);
      for (const [name, args] of ops.slice(opsAtCapture)) (restored[name] as (...a: unknown[]) => unknown)(...args);
      expect(await restored.traceHash()).toBe(endHash);
      expect(restored.facts()).toEqual(real.facts());
      expect(JSON.stringify(restored.snapshot())).toBe(JSON.stringify(real.snapshot()));
    },
    TEST_TIMEOUT_MS,
  );

  itNative(
    "LNK-006 a forced numeric setpoint keeps its forced value over the plant's write while the pad is carrying",
    async () => {
      const adapter = await nativeAdapter();
      const core = await freshCore();
      const forced = new Uint8Array(4);
      new DataView(forced.buffer).setFloat32(0, 55, true); // raw 55 cm: the program must see this, not the 100 the plant writes
      let forcedAt = -1;
      const session = live(adapter, core, SCANS, async () => {
        if (forcedAt < 0 && carrying(core)) {
          await adapter.forceValue(input('GripCycle.XPos'), forced);
          forcedAt = session.scans;
        }
        if (forcedAt >= 0 && session.scans >= forcedAt + 150) session.pause();
      });
      await session.start();
      await session.settled();
      expect(forcedAt).toBeGreaterThan(0);
      // the plant went on carrying to its end of stroke and kept writing its own position there...
      expect(Number(core.facts()['axis:Pick1:x'])).toBeGreaterThan(0.99);
      expect(core.sense()['Pick1.gripped']).toBe(true);
      // ...but the program saw the forced value, whole, on every scan since (and so never released: it waits for x 100)
      const seen = await adapter.peek(output('GripCycle.XSeen'), 4);
      expect(new DataView(seen.buffer, seen.byteOffset, 4).getFloat32(0, true)).toBe(55);
      expect(core.facts()['placed:Pick1']).toBe(0);
      expect((await adapter.listForcedValues()).map((entry) => entry.size)).toEqual([4]);
    },
    TEST_TIMEOUT_MS,
  );

  itNative(
    'LNK-003 the numeric scan writes the input span once',
    async () => {
      const adapter = await nativeAdapter();
      const writes: Array<{ address: number; length: number }> = [];
      let inputReads = 0;
      const first = Math.min(...ioMap.inputs.filter((entry) => entry.path.startsWith('GripCycle.')).map((entry) => entry.address));
      const counting = new Proxy(adapter, {
        get(target, property) {
          const value = Reflect.get(target, property) as unknown;
          if (typeof value !== 'function') return value;
          return (...args: unknown[]) => {
            if (property === 'pokeN') writes.push({ address: args[0] as number, length: (args[1] as Uint8Array).length });
            if (property === 'peek' && args[0] === first) inputReads += 1;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      });
      const session = live(counting, await freshCore(), 20);
      await session.start();
      await session.settled();
      expect(session.scans).toBe(20);
      // one write per scan, always the same span, and it covers every mapped sensor slot (two BOOL bits and two REAL words)
      const mapped = ioMap.inputs.filter((entry) => entry.path.startsWith('GripCycle.'));
      const start = Math.min(...mapped.map((entry) => entry.address));
      const end = Math.max(...mapped.map((entry) => entry.address + entry.size));
      expect(writes.length).toBe(20);
      expect(new Set(writes.map((write) => JSON.stringify(write))).size).toBe(1);
      expect(writes[0]!.address).toBe(start);
      expect(writes[0]!.length).toBe(end - start);
      expect(inputReads).toBe(20);
    },
    TEST_TIMEOUT_MS,
  );

  itNative('SCN-013 the declaration generator names the gantry signals with their types', async () => {
    const text = generateDeclarations((await freshCore()).signals, 'st');
    const [inputs, outputs] = text.split('  VAR_OUTPUT');
    expect(inputs).toContain('Pick1_xPos : REAL; (* m *)');
    expect(inputs).toContain('Pick1_yPos : REAL; (* m *)');
    expect(inputs).toContain('Pick1_gripped : BOOL;');
    expect(inputs).toContain('Start1_pressed : BOOL;');
    expect(outputs).toContain('Pick1_xSet : REAL; (* m *)');
    expect(outputs).toContain('Pick1_ySet : REAL; (* m *)');
    expect(outputs).toContain('Pick1_grip : BOOL;');
    expect(text).not.toContain('Pick1_zSet'); // a two-axis part has no Z
  });
});
