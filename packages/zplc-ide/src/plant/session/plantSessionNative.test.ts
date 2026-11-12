import { afterEach, describe, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import productManifest from '../../../../../package.json';
import { NativeSimulationSupervisor } from '../../../shared/nativeSimulationSupervisor';
import { itNative, nativeRuntimeBinary } from '../../cli/nativeRuntimeGuard';
import { itWasm, builtWasmModule } from '../../cli/wasmModuleGuard';
import { createNativeScenarioRuntime } from '../../cli/nativeScenarioRuntime';
import { compileSingleFileWithTask } from '../../compiler';
import { NativeAdapter } from '../../runtime/nativeAdapter';
import { WASMAdapter } from '../../runtime/wasmAdapter';
import { listIoMap } from '../../runtime/ioMap';
import type { PlantMapV2 } from '../../plants/plantMap';
import { compileScenario, runScenario } from '../../test-engine';
import type { PlantCore, PlantSceneFile, ScenePart } from '../contracts';
import { createPlantCore } from '../core/plantCore';
import { createPlantSession, PLANT_WASM_GAPS } from './plantSession';

// The gate program idea, written fresh: a Start pulse latches the belt, the eye stops it, and a 500 ms timer runs while the belt runs.
const SOURCE = `PROGRAM Cell
VAR
  Eye AT %IX0.0 : BOOL;
  Start AT %IX0.1 : BOOL;
  Aux AT %IX0.2 : BOOL;
  Running : BOOL := FALSE;
  Hold : TON;
END_VAR
VAR_OUTPUT
  Belt AT %QX0.0 : BOOL;
  Done AT %QX0.1 : BOOL;
  AuxOut AT %QX0.2 : BOOL;
END_VAR
Running := (Running OR Start) AND NOT Eye;
Belt := Running;
Hold(IN := Belt, PT := T#500ms);
Done := Hold.Q;
AuxOut := Aux;
END_PROGRAM`;
const built = compileSingleFileWithTask(SOURCE, 'ST', { programName: 'Cell', intervalMs: 10 });
const ioMap = listIoMap(built.debugMap);
const map: PlantMapV2 = {
  schemaVersion: 2,
  target: { scene: 'cell' },
  signals: {
    'belt.run': { direction: 'command', type: 'BOOL', point: 'Cell.Belt' },
    'eye.detect': { direction: 'sensor', type: 'BOOL', point: 'Cell.Eye' },
    'start.pressed': { direction: 'sensor', type: 'BOOL', point: 'Cell.Start' },
  },
};
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
const SCRIPT = [
  { atMs: 100, operate: { signal: 'start.pressed', value: true } },
  { atMs: 200, operate: { signal: 'start.pressed', value: false } },
];
const DONE = 0x1000;

const open: Array<() => Promise<void>> = [];
const cores: PlantCore[] = [];
afterEach(async () => {
  for (const stop of open.splice(0)) await stop();
  for (const core of cores.splice(0)) core.dispose();
});

async function nativeAdapter(virtualByEnvironment = false): Promise<NativeAdapter> {
  const persist = await mkdtemp(join(tmpdir(), 'zplc-plant-session-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-plant-session',
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
const bit = (byte: number | undefined, index: number) => ((byte ?? 0) & (1 << index)) !== 0;

interface RunOptions {
  scans: number;
  /** Called after every completed scan, before the next exchange, with the number of completed scans. */
  after?: (scans: number) => Promise<void> | void;
  script?: boolean;
}

/** Runs the session until `scans` scans completed (or it stops for another reason) and records Belt and Done after each scan. */
async function live(adapter: NativeAdapter | WASMAdapter, core: PlantCore, options: RunOptions) {
  const outputs: Array<{ belt: boolean; done: boolean }> = [];
  const session = createPlantSession({
    core,
    runtime: adapter,
    map,
    ioMap,
    paceMs: async () => {
      const image = await adapter.peek(DONE, 1);
      outputs.push({ belt: bit(image[0], 0), done: bit(image[0], 1) });
      if (options.script !== false)
        for (const event of SCRIPT)
          if (event.atMs === session.scans * session.scanMs) core.operate(event.operate.signal, event.operate.value);
      await options.after?.(session.scans);
      if (session.scans >= options.scans && session.state === 'running') session.pause();
    },
  });
  open.push(() => session.stop().catch(() => undefined));
  return { session, outputs };
}

describe('the lock-step session over the real native runtime', () => {
  itNative('PLT-005 the plant follows the completed scans of the runtime: belt, eye and the 500 ms timer', async () => {
    const adapter = await nativeAdapter();
    const core = await freshCore();
    const { session, outputs } = await live(adapter, core, { scans: 100 });
    await session.start();
    await session.settled();
    expect(session.state).toBe('paused');
    expect(session.scans).toBe(100);
    expect(core.snapshot().timeMs).toBe(1000);
    expect((await adapter.getInfo()).cycles).toBe(100);
    expect(core.facts()['count:eye']).toBe(1); // the belt carried the box to the eye
    const belt = outputs.findIndex((o) => o.belt);
    const done = outputs.findIndex((o) => o.done);
    expect(belt).toBeGreaterThan(0);
    expect(done - belt).toBe(50); // 500 ms of virtual time is 50 completed scans
    await session.stop();
    expect(session.state).toBe('stopped');
  });

  itNative('PLT-005 a breakpoint holds the plant and a held scan costs no clock', async () => {
    const baseline = await (async () => {
      const adapter = await nativeAdapter();
      const { session, outputs } = await live(adapter, await freshCore(), { scans: 90 });
      await session.start();
      await session.settled();
      return outputs;
    })();
    const interval = (rows: typeof baseline) => rows.findIndex((o) => o.done) - rows.findIndex((o) => o.belt);

    const adapter = await nativeAdapter();
    const core = await freshCore();
    const pc = built.debugMap.pou.Cell!.breakpoints.find((location) => location.valid)!.pc;
    let armed = false;
    const { session, outputs } = await live(adapter, core, {
      scans: 90,
      after: async (scans) => {
        if (scans === 30 && !armed) {
          armed = true;
          await adapter.setBreakpoint(pc); // while the timer runs: the next scan is held
        }
      },
    });
    await session.start();
    await session.settled();
    expect(session.state).toBe('held');
    expect(session.heldSteps).toBeGreaterThanOrEqual(1);
    expect(session.scans).toBe(30);
    // the plant stepped for the held scan once and never again: it is one scan interval ahead of the completed scans
    expect(core.snapshot().timeMs).toBe(31 * session.scanMs);
    expect((await adapter.getInfo()).cycles).toBe(30);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(core.snapshot().timeMs).toBe(31 * session.scanMs);
    await adapter.removeBreakpoint(pc);
    session.resume();
    await session.settled();
    expect(session.scans).toBe(90);
    expect(session.state).toBe('paused');
    expect(interval(outputs)).toBe(50); // the timer interval in completed scans: not 49, not 51
    expect(interval(outputs)).toBe(interval(baseline));
    expect(await core.traceHash()).toBeTypeOf('string');
  });

  itNative('LNK-006 a forced input keeps its forced value over the plant', async () => {
    const adapter = await nativeAdapter();
    const core = await freshCore();
    await adapter.forceValue(0x0000, new Uint8Array([0x02])); // Start forced true, Eye forced false
    const { session, outputs } = await live(adapter, core, { scans: 100, script: false }); // the plant never presses Start
    await session.start();
    await session.settled();
    expect(core.facts()['count:eye']).toBe(1); // the plant's eye saw the box reach it...
    expect(core.sense()['eye.detect']).toBe(true);
    expect(outputs.some((o) => o.belt)).toBe(true); // ...but the program saw Start true (forced) though the plant never pressed it,
    expect(outputs.at(-1)?.belt).toBe(true); // and never saw its Eye: the belt was not stopped
    expect(bit((await adapter.peek(0x0000, 1))[0], 0)).toBe(false);
    expect(bit((await adapter.peek(0x0000, 1))[0], 1)).toBe(true);
    await adapter.clearForcedValue(0x0000);
    expect((await adapter.listForcedValues()).length).toBe(0);
  });

  itNative('LNK-006 the plant sees its eye but the program does not while the input is forced', async () => {
    const adapter = await nativeAdapter();
    const core = await freshCore();
    await adapter.forceValue(0x0000, new Uint8Array([0x00])); // both inputs forced false
    const { session, outputs } = await live(adapter, core, { scans: 100 }); // the plant presses Start at 100 ms
    await session.start();
    await session.settled();
    expect(outputs.some((o) => o.belt)).toBe(false); // the program never saw the plant's Start
  });

  itNative('LNK-006 a bit the plant does not drive keeps the value a person set from the Faceplate', async () => {
    const adapter = await nativeAdapter();
    const core = await freshCore();
    const current = (await adapter.peek(0, 1))[0]!;
    await adapter.pokeN(0, new Uint8Array([current | 4])); // Aux, a read-modify-write like the Faceplate's
    const { session } = await live(adapter, core, { scans: 20 });
    await session.start();
    await session.settled();
    expect(bit((await adapter.peek(DONE, 1))[0], 2)).toBe(true);
  });

  itNative('PLT-017 live equals graded on the real runtime', async () => {
    const liveCore = await freshCore();
    const { session } = await live(await nativeAdapter(), liveCore, { scans: 101 });
    await session.start();
    await session.settled();

    const gradedCore = await freshCore();
    const gradedAdapter = await nativeAdapter(true);
    const scenario = compileScenario(
      {
        schemaVersion: 1,
        id: 'live-equals-graded',
        tickMs: 10,
        durationMs: 1000,
        scene: { file: 'scene.json', map: 'plant-map.json', script: SCRIPT },
        events: [],
        expectations: [{ kind: 'EVENTUALLY', fromMs: 0, withinMs: 1000, condition: { 'Cell.Done': true } }],
      },
      built.debugMap,
      { port: { core: gradedCore, map }, scene },
    );
    const result = await runScenario(scenario, built.zplcFile, createNativeScenarioRuntime(gradedAdapter));
    expect(result.assertions[0]?.passed).toBe(true);
    expect(await gradedCore.traceHash()).toBe(await liveCore.traceHash());
    expect(gradedCore.facts()).toEqual(liveCore.facts());
  });

  itWasm('LNK-005 the same session runs over the WASM adapter and gives the same trace', async () => {
    const nativeCore = await freshCore();
    const nativeRun = await live(await nativeAdapter(), nativeCore, { scans: 100 });
    await nativeRun.session.start();
    await nativeRun.session.settled();

    const wasm = new WASMAdapter({ loadModule: async () => builtWasmModule().bytes });
    await wasm.connect();
    open.push(() => wasm.disconnect().catch(() => undefined));
    await wasm.loadProgram(built.zplcFile);
    const browserCore = await freshCore();
    const browserRun = await live(wasm, browserCore, { scans: 100 });
    await browserRun.session.start();
    await browserRun.session.settled();
    expect(browserRun.session.state).toBe('paused');
    const gaps: string[] = [];
    if ((await browserCore.traceHash()) !== (await nativeCore.traceHash())) gaps.push('the plant trace differs from the native one');
    if (JSON.stringify(browserRun.outputs) !== JSON.stringify(nativeRun.outputs)) gaps.push('the program outputs differ from native');
    expect(gaps).toEqual([...PLANT_WASM_GAPS]);
  });
});
