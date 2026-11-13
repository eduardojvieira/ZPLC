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
import { createPlantCore } from '../core/plantCore';
import { parseScene } from '../core/scene';
import { createPlantSession } from '../session/plantSession';

// PLT-005, PLT-017, LNK-003, LNK-006, SCN-004 for a numeric scene (Task N9): a potentiometer (INT raw 0..1000 over 0..100 %) sets the
// inlet valve of a numeric tank, the program shows the level on a numeric display. The fixture is authored here, in fixtureNumeric/.
const dir = join(import.meta.dir, 'fixtureNumeric');
const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const parsed = parseScene(read('scene.json'));
if ('problems' in parsed) throw new Error(`fixtureNumeric/scene.json: ${parsed.problems.map((p) => p.message).join('; ')}`);
const scene = parsed.scene;
const map = JSON.parse(read('plant-map.json')) as PlantMapV2;
const scenario = JSON.parse(read('scenario.json')) as {
  tickMs: number;
  durationMs: number;
  scene: { script: Array<{ atMs: number; operate: { signal: string; value: boolean | number } }> };
};
const built = compileSingleFileWithTask(read('reference.st'), 'ST', { programName: 'NumericTank', intervalMs: scenario.tickMs });
const ioMap = listIoMap(built.debugMap);
const input = (path: string) => ioMap.inputs.find((entry) => entry.path === path)!.address;
const output = (path: string) => ioMap.outputs.find((entry) => entry.path === path)!.address;
// graded runs scenario.durationMs inclusive of the first step: 0, tick, ..., duration
const SCANS = scenario.durationMs / scenario.tickMs + 1;

const open: Array<() => Promise<void>> = [];
const cores: PlantCore[] = [];
afterEach(async () => {
  for (const stop of open.splice(0)) await stop();
  for (const core of cores.splice(0)) core.dispose();
});

async function nativeAdapter(virtualByEnvironment = false): Promise<NativeAdapter> {
  const persist = await mkdtemp(join(tmpdir(), 'zplc-plant-numeric-ci-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-plant-numeric-ci',
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

describe('a numeric scene live and graded over the real native runtime', () => {
  itNative('PLT-017 one numeric scene and script give the same trace live and graded', async () => {
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
    // the scene did something numeric: the potentiometer opened the valve and the tank filled
    expect(Number(liveCore.facts()['level:Tank1'])).toBeGreaterThan(0);
    expect(await gradedCore.traceHash()).toBe(await liveCore.traceHash());
    expect(gradedCore.facts()).toEqual(liveCore.facts());
    expect(gradedCore.snapshot().timeMs).toBe(liveCore.snapshot().timeMs);
  });

  itNative("LNK-006 a forced numeric input keeps its forced value over the plant's write", async () => {
    const adapter = await nativeAdapter();
    const core = await freshCore();
    const pot = new Uint8Array(2);
    new DataView(pot.buffer).setInt16(0, 321, true);
    const level = new Uint8Array(4);
    new DataView(level.buffer).setFloat32(0, 0.75, true);
    await adapter.forceValue(input('NumericTank.Pot'), pot); // INT raw 321, the plant writes 400 and later 800 there
    await adapter.forceValue(input('NumericTank.Level'), level); // REAL raw 0.75, the plant writes its own level there
    const session = live(adapter, core, 100);
    await session.start();
    await session.settled();
    expect(Number(core.facts()['level:Tank1'])).toBeGreaterThan(0); // the plant moved on its own...
    const fill = await adapter.peek(output('NumericTank.Fill'), 2);
    const shown = await adapter.peek(output('NumericTank.Shown'), 4);
    // ...but the program saw the forced values, whole, for both widths
    expect(new DataView(fill.buffer, fill.byteOffset, 2).getInt16(0, true)).toBe(321);
    expect(new DataView(shown.buffer, shown.byteOffset, 4).getFloat32(0, true)).toBe(0.75);
    expect((await adapter.listForcedValues()).map((entry) => entry.size).sort()).toEqual([2, 4]);
  });

  itNative('LNK-003 the numeric scan writes the input span once', async () => {
    const adapter = await nativeAdapter();
    const writes: Array<{ address: number; length: number }> = [];
    let inputReads = 0;
    const counting = new Proxy(adapter, {
      get(target, property) {
        const value = Reflect.get(target, property) as unknown;
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          if (property === 'pokeN') writes.push({ address: args[0] as number, length: (args[1] as Uint8Array).length });
          if (property === 'peek' && args[0] === input('NumericTank.Pot')) inputReads += 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    const session = live(counting, await freshCore(), 20);
    await session.start();
    await session.settled();
    expect(session.scans).toBe(20);
    // one write per scan, always the same span, and the span covers the INT slot and the REAL slot
    const span = { address: input('NumericTank.Pot'), length: input('NumericTank.Level') + 4 - input('NumericTank.Pot') };
    expect(writes).toEqual(Array(20).fill(span));
    expect(inputReads).toBe(20);
  });
});
