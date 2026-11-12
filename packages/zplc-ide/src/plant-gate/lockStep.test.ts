import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import productManifest from '../../../../package.json';
import { NativeSimulationSupervisor } from '../../shared/nativeSimulationSupervisor';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { compileGateProgram, GATE_PROGRAM_ST, GRADED_HASH, SCAN_MS } from './gateProgram';
import { loadJolt } from './jolt';
import { runLockStep, type GateAdapter, type LockStepOptions } from './lockStep';
import { beltBox } from './scenes';
import { createWorld } from './world';

const open: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((stop) => stop()));
});

async function openSession() {
  const built = compileGateProgram();
  const persist = await mkdtemp(join(tmpdir(), 'zplc-plant-gate-'));
  const supervisor = new NativeSimulationSupervisor({
    clientName: 'zplc-plant-gate',
    clientVersion: productManifest.version,
    environment: { ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary, ZPLC_PERSIST_ROOT: persist, ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1' },
  });
  const adapter = new NativeAdapter(supervisor);
  const world = createWorld(await loadJolt(), beltBox());
  open.push(async () => {
    world.dispose();
    await adapter.disconnect().catch(() => undefined);
    await supervisor.stopSession().catch(() => undefined);
    await rm(persist, { recursive: true, force: true });
  });
  await adapter.connect();
  await adapter.loadProgram(built.zplcFile);
  return { adapter, world, debugMap: built.debugMap };
}

const PULSE = { from: 10, to: 15 };
const run = (s: Awaited<ReturnType<typeof openSession>>, extra: Partial<LockStepOptions> & { steps: number }, adapter: GateAdapter = s.adapter) =>
  runLockStep({ adapter, world: s.world, startPulse: PULSE, ...extra });
const edges = (signals: number[]) => {
  const eyeOn = signals.findIndex((b) => (b & 2) !== 0);
  const beltOff = signals.findIndex((b, i) => i > eyeOn && (b & 0x80) === 0);
  return { eyeOn, beltOff, delta: beltOff - eyeOn };
};

describe('lock-step with the native runtime (gate check 4, graded side)', () => {
  itNative('the plant and the program share one clock', async () => {
    const s = await openSession();
    const result = await run(s, { steps: 800 });
    const { eyeOn, beltOff, delta } = edges(result.signals);
    console.log('plant-gate graded', JSON.stringify({ hash: result.hash, eyeOn, beltOff, delta }));
    expect(result.completedScans).toBe(800);
    expect(s.world.timeMs).toBe(8000);
    expect(result.heldSteps).toBe(0);
    expect([50, 51]).toContain(delta);
    expect(Math.hypot(...s.world.bodies()[0]!.v)).toBeLessThanOrEqual(0.005);
    expect(result.hash).toBe(GRADED_HASH);
  }, 120_000);

  itNative('host speed does not change the trace', async () => {
    const s = await openSession();
    let seed = 12345;
    const pace = async () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      await Bun.sleep(seed % 6);
    };
    const result = await run(s, { steps: 800, pace });
    expect(result.hash).toBe(GRADED_HASH);
  }, 120_000);

  itNative('pause and single step freeze both', async () => {
    const s = await openSession();
    let release: (() => void) | undefined;
    let blocked = false;
    const gate = async (k: number) => {
      if (k < 100) return;
      if (k === 100 && !blocked) { blocked = true; await new Promise<void>((resolve) => { release = resolve; }); }
      else if (k === 101) await new Promise<void>((resolve) => { release = resolve; });
    };
    const done = run(s, { steps: 102, gate });
    await Bun.sleep(300);
    expect((await s.adapter.getInfo()).cycles).toBe(100);
    expect(s.world.timeMs).toBe(1000);
    release!();
    await Bun.sleep(300);
    expect((await s.adapter.getInfo()).cycles).toBe(101);
    expect(s.world.timeMs).toBe(1010);
    release!();
    await done;
  }, 120_000);

  itNative('a breakpoint holds the plant', async () => {
    const s = await openSession();
    const line = GATE_PROGRAM_ST.split('\n').findIndex((l) => l.startsWith('Belt := Run')) + 1;
    const pc = Object.values(s.debugMap.pou).find((p) => p.sourceRef === 'src/main.st')!.breakpoints.find((b) => b.line === line)!.pc;
    const outcome: Record<string, unknown> = { pc, line };
    let atHold = { timeMs: -1, held: -1 };
    const gate = async (k: number) => {
      if (k === 100) outcome.setBreakpoint = await s.adapter.setBreakpoint(pc);
      if (k === 101) { atHold = { timeMs: s.world.timeMs, held: -1 }; outcome.removed = await s.adapter.removeBreakpoint(pc); }
    };
    let result;
    try {
      result = await run(s, { steps: 201, gate });
      outcome.returned = true;
    } catch (error) {
      outcome.returned = false;
      outcome.error = error instanceof Error ? error.message : String(error);
    }
    outcome.atHoldTimeMs = atHold.timeMs;
    if (result) Object.assign(outcome, { heldSteps: result.heldSteps, completedScans: result.completedScans, timeMs: s.world.timeMs });
    // Second run: the same hold between the eye seeing the box and the belt stopping measures the timer skew.
    const skew = await openSession();
    const skewGate = async (k: number) => {
      if (k === 520) await skew.adapter.setBreakpoint(pc);
      if (k === 521) await skew.adapter.removeBreakpoint(pc);
    };
    const held = await run(skew, { steps: 801, gate: skewGate });
    const base = 50;
    outcome.skewRun = { heldSteps: held.heldSteps, completedScans: held.completedScans, ...edges(held.signals), timerSkewScans: edges(held.signals).delta - base };
    console.log('plant-gate breakpoint', JSON.stringify(outcome));
    expect(outcome.returned).toBe(true);
    expect(result!.heldSteps).toBe(1);
    expect(atHold.timeMs).toBe(1000);
    expect(s.world.timeMs).toBe(result!.completedScans * 10);
  }, 120_000);

  itNative('a runtime failure stops the plant at the last completed scan', async () => {
    const s = await openSession();
    let calls = 0;
    const failing: GateAdapter = {
      pokeN: (a, b) => s.adapter.pokeN(a, b),
      peek: (a, l) => s.adapter.peek(a, l),
      getInfo: () => s.adapter.getInfo(),
      scenarioStep: async (at) => {
        calls += 1;
        if (calls === 51) throw new Error('runtime failed at scan 51');
        await s.adapter.scenarioStep(at);
      },
    };
    await expect(run(s, { steps: 100 }, failing)).rejects.toThrow('runtime failed at scan 51');
    expect(s.world.timeMs).toBe(500);
  }, 120_000);
});
