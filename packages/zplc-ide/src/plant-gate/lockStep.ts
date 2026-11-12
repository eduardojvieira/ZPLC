import type { NativeAdapter } from '../runtime/nativeAdapter';
import { IO, SCAN_MS } from './gateProgram';
import { BELT_SPEED_MPS } from './scenes';
import { sha256Hex, TraceRecorder } from './trace';
import type { GateWorld } from './world';

export type GateAdapter = Pick<NativeAdapter, 'pokeN' | 'peek' | 'scenarioStep' | 'getInfo'>;

export interface LockStepOptions {
  adapter: GateAdapter; // connected, with the gate program loaded
  world: GateWorld; // a beltBox world
  steps: number; // scenario steps to request
  startPulse: { from: number; to: number }; // steps during which Start is TRUE
  gate?: (step: number) => Promise<void>; // awaited before each step: pause and single step
  pace?: (step: number) => Promise<void>; // awaited after each step: real-time pacing
}

export interface LockStepResult { hash: string; completedScans: number; heldSteps: number; signals: number[] }

// The plant follows completed scans, never timestamps.
export async function runLockStep(options: LockStepOptions): Promise<LockStepResult> {
  const { adapter, world, steps, startPulse, gate, pace } = options;
  const recorder = new TraceRecorder(world);
  const signals: number[] = [];
  let completedScans = 0;
  let heldSteps = 0;
  let cycles = 0;
  let written = -1;
  for (let k = 0; k < steps; k += 1) {
    await gate?.(k);
    const inputs = (k >= startPulse.from && k < startPulse.to ? 1 << IO.start.bit : 0) | (world.eye('eye') ? 1 << IO.eye.bit : 0);
    if (inputs !== written) {
      await adapter.pokeN(IO.start.address, new Uint8Array([inputs]));
      written = inputs;
    }
    await adapter.scenarioStep(k * SCAN_MS);
    const after = (await adapter.getInfo()).cycles;
    if (after === cycles) {
      heldSteps += 1; // a breakpoint held the scan: the plant does not move
    } else {
      cycles = after;
      const belt = (((await adapter.peek(IO.belt.address, 1))[0] ?? 0) & (1 << IO.belt.bit)) !== 0;
      world.setBeltTarget('belt', belt ? BELT_SPEED_MPS : 0);
      world.step(SCAN_MS);
      const byte = inputs | (belt ? 0x80 : 0);
      recorder.sample(byte);
      signals.push(byte);
      completedScans += 1;
    }
    await pace?.(k);
  }
  return { hash: await sha256Hex(recorder.bytes()), completedScans, heldSteps, signals };
}
