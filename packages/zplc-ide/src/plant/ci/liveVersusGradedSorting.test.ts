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

// PLT-005, PLT-012, PLT-017, LNK-003, LNK-006, SCN-004, SCN-011 to SCN-013 for a sorting scene (Task S4): workpieces with a seeded code
// ride a belt to a stop blade, a scale, a vision sensor and a light array read them, and a diverter arm sends code 2 to a side belt.
// The fixture also holds an idle turntable, for the capture mid-rotation. It is authored here, in fixtureSorting/.
const dir = join(import.meta.dir, 'fixtureSorting');
const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const parsed = parseScene(read('scene.json'));
if ('problems' in parsed) throw new Error(`fixtureSorting/scene.json: ${parsed.problems.map((p) => p.message).join('; ')}`);
const scene = parsed.scene;
const map = JSON.parse(read('plant-map.json')) as PlantMapV2;
type ScriptEvent = { atMs: number; operate: { signal: string; value: boolean | number } };
const scenario = JSON.parse(read('scenario.json')) as { tickMs: number; durationMs: number; scene: { script: ScriptEvent[] } };
const referenceText = read('reference.st');
const compile = (source: string) => compileSingleFileWithTask(source, 'ST', { programName: 'SortCycle', intervalMs: scenario.tickMs });
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
  const persist = await mkdtemp(join(tmpdir(), 'zplc-plant-sorting-ci-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-plant-sorting-ci',
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

const f32 = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);
/** What the program latched: the code, the raw weight and the raw height it decided on. */
async function decision(adapter: NativeAdapter) {
  const code = await adapter.peek(output('SortCycle.CSeen'), 2);
  return {
    code: new DataView(code.buffer, code.byteOffset, 2).getInt16(0, true),
    weight: f32(await adapter.peek(output('SortCycle.WSeen'), 4)),
    height: f32(await adapter.peek(output('SortCycle.HSeen'), 4)),
  };
}
const held = (core: PlantCore) => core.sense()['Scale1.stable'] === true && core.sense()['Scale1.weight'] !== 0;
const tableAngle = (core: PlantCore) => Number(core.snapshot().parts.find((view) => view.name === 'Table1')!.state.angleDeg);
const TABLE = { x: 0, z: -1.6 }; // the idle turntable of the fixture

describe('a sorting scene live and graded over the real native runtime', () => {
  itNative(
    'PLT-017 the live session and the graded run give the same trace hash over 1000 scans for the sorting fixture',
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
      // the scene did something physical: the codes drawn are 2, 1, 2; code 1 went straight on, the two code 2 were diverted, none
      // misrouted
      expect(liveCore.facts()).toMatchObject({
        'sorted:Bin1': 1,
        'sorted:Bin2': 2,
        'delivered:Bin1': 1,
        'delivered:Bin2': 2,
        'misrouted:Bin1': 0,
        'misrouted:Bin2': 0,
        itemsDropped: 0,
      });
      expect(await gradedCore.traceHash()).toBe(await liveCore.traceHash());
      expect(gradedCore.facts()).toEqual(liveCore.facts());
      expect(gradedCore.snapshot().timeMs).toBe(liveCore.snapshot().timeMs);
      expect(JSON.stringify(gradedCore.snapshot())).toBe(JSON.stringify(liveCore.snapshot()));
    },
    TEST_TIMEOUT_MS,
  );

  itNative(
    'PLT-017 an INT code and REAL readings reach the program with the scaling of rules R-S1 and R-S2 on both paths',
    async () => {
      const liveCore = await freshCore();
      const liveAdapter = await nativeAdapter();
      const seen = new Map<string, Awaited<ReturnType<typeof decision>>>();
      const session = live(liveAdapter, liveCore, SCANS, async () => {
        if (!held(liveCore)) return;
        const latched = await decision(liveAdapter);
        if (latched.code !== 0) seen.set(JSON.stringify(latched), latched);
      });
      await session.start();
      await session.settled();
      const liveFinal = await decision(liveAdapter);

      // R-S2, plant to program: code 0..9 over 0..9 is the identity, a workpiece of 0.5 kg over 0..20 kg is raw 50 of 0..2000, and
      // the top of the workpiece (0.1 m) over 0..0.6 m is raw 10 of 0..60; the REAL slots hold the 32-bit float of that
      const triples = [...seen.values()].map((entry) => [entry.code, entry.weight, entry.height]);
      expect(triples).toContainEqual([2, Math.fround(50), Math.fround(10)]);
      expect(triples).toContainEqual([1, Math.fround(50), Math.fround(10)]);
      for (const [code] of triples) expect([1, 2]).toContain(code);

      const gradedCore = await freshCore();
      const gradedAdapter = await nativeAdapter(built, true);
      const graded = await runScenario(
        compileScenario(scenario, built.debugMap, { port: { core: gradedCore, map }, scene }),
        built.zplcFile,
        createNativeScenarioRuntime(gradedAdapter),
      );
      expect(graded.passed).toBe(true);
      // both paths end with the program holding the same raw numbers
      expect(await decision(gradedAdapter)).toEqual(liveFinal);
      expect(liveFinal.weight).toBe(Math.fround(50));
      expect(await gradedCore.traceHash()).toBe(await liveCore.traceHash());
    },
    TEST_TIMEOUT_MS,
  );

  itNative(
    'PLT-012 a capture taken while a box rides a turning platform restores and finishes with the same hash',
    async () => {
      const real = await freshCore();
      const { core, ops } = recording(real);
      const commands = { 'Table1.toRight': true }; // the surface stands still: the box rides the turn itself
      core.addItem('workpiece', [TABLE.x + 0.1, 0.55, TABLE.z]);
      let state: ReturnType<PlantCore['capture']> | undefined;
      let opsAtCapture = 0;
      let hashAtCapture = '';
      let snapshotAtCapture = '';
      let angleAtCapture = 0;
      for (let ms = 0; ms < 3500; ms += 5) {
        // before the emitter of the fixture drops its first workpiece
        core.apply(commands);
        core.advance(5);
        const angle = tableAngle(core);
        if (state === undefined && angle > 30 && angle < 60) {
          state = core.capture();
          opsAtCapture = ops.length;
          hashAtCapture = await core.traceHash();
          snapshotAtCapture = JSON.stringify(core.snapshot());
          angleAtCapture = angle;
        }
      }
      expect(state).toBeDefined();
      expect(angleAtCapture).toBeGreaterThan(30); // taken while the platform is between centre and right
      expect(angleAtCapture).toBeLessThan(60);
      expect(tableAngle(real)).toBeGreaterThan(80); // and the run went on to turn it right
      // the box rode the turn: from 0.1 m right of the centre to 0.1 m in front of it, still on the platform
      const box = real.snapshot().items.find((item) => item.id === 'added-1')!;
      expect(box.p[1]).toBeGreaterThan(0.5);
      expect(box.p[0]).toBeCloseTo(TABLE.x, 1);
      expect(box.p[2]).toBeCloseTo(TABLE.z + 0.1, 1);
      const endHash = await real.traceHash();

      const restored = await freshCore();
      restored.restore(state!);
      expect(JSON.stringify(restored.snapshot())).toBe(snapshotAtCapture);
      expect(tableAngle(restored)).toBe(angleAtCapture);
      expect(await restored.traceHash()).toBe(hashAtCapture);
      for (const [name, args] of ops.slice(opsAtCapture)) (restored[name] as (...a: unknown[]) => unknown)(...args);
      expect(await restored.traceHash()).toBe(endHash);
      expect(restored.facts()).toEqual(real.facts());
      expect(JSON.stringify(restored.snapshot())).toBe(JSON.stringify(real.snapshot()));
    },
    TEST_TIMEOUT_MS,
  );

  itNative(
    'PLT-005 pause and step mid-run leave the plant frozen and the trace unchanged',
    async () => {
      const core = await freshCore();
      const session = live(await nativeAdapter(), core, SCANS, async () => {
        if (held(core) && session.state === 'running') session.pause();
      });
      await session.start();
      await session.settled();
      expect(session.state).toBe('paused');
      expect(held(core)).toBe(true); // a workpiece waits at the blade while the scale reads it

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
    'SCN-012 the generated declarations of the fixture map have an INT, two REAL and the BOOL signals with their addresses',
    async () => {
      const text = generateDeclarations((await freshCore()).signals, 'st');
      const [inputs, outputs] = text.split('  VAR_OUTPUT');
      expect(inputs).toContain('Eye1_code : INT; (* code *)');
      expect(inputs).toContain('Scale1_weight : REAL; (* kg *)');
      expect(inputs).toContain('Array1_height : REAL; (* m *)');
      expect(inputs).toContain('Scale1_stable : BOOL;');
      expect(inputs).toContain('Start1_pressed : BOOL;');
      expect(outputs).toContain('Arm1_divert : BOOL;');
      expect(outputs).toContain('Blade1_extend : BOOL;');
      expect(text.match(/: INT;/g)?.length).toBe(1);
      expect(text.match(/: REAL;/g)?.length).toBe(2);
      // the map binds each signal to a point of the program, and the program's points sit at the declared addresses, one slot each
      const at = (path: string) => ioMap.inputs.find((entry) => entry.path === `SortCycle.${path}`)!;
      expect([at('Code').size, at('Weight').size, at('Height').size]).toEqual([2, 4, 4]);
      expect(new Set([at('Start').address, at('Code').address, at('Weight').address, at('Height').address]).size).toBe(4);
      const mapped = Object.values(map.signals).map((signal) => signal.point.replace('SortCycle.', ''));
      for (const point of mapped)
        expect([...ioMap.inputs, ...ioMap.outputs].some((entry) => entry.path === `SortCycle.${point}`)).toBe(true);
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
      // the same declarations with no statements: nothing runs, nothing is sorted
      const lastEndVar = referenceText.lastIndexOf('END_VAR') + 'END_VAR'.length;
      expect((await run(`${referenceText.slice(0, lastEndVar)}\n\nEND_PROGRAM\n`)).passed).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});
