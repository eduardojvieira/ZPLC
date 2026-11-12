import type { JoltModule } from './jolt';
import type { GateScene } from './scenes';
import { createWorld, type GateWorld } from './world';

const FLOATS_PER_BODY = 7;

export class TraceRecorder {
  private readonly chunks: Uint8Array[] = [];
  private readonly scratch: Float32Array;
  private readonly world: GateWorld;

  constructor(world: GateWorld) {
    this.world = world;
    this.scratch = new Float32Array(world.bodies().length * FLOATS_PER_BODY);
  }

  // Appends the raw float32 state of every dynamic body, then one byte of signals.
  sample(signals: number): void {
    this.world.writeState(this.scratch, 0);
    const chunk = new Uint8Array(this.scratch.byteLength + 1);
    chunk.set(new Uint8Array(this.scratch.buffer, this.scratch.byteOffset, this.scratch.byteLength));
    chunk[chunk.length - 1] = signals & 0xff;
    this.chunks.push(chunk);
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of this.chunks) { out.set(c, at); at += c.length; }
    return out;
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface BeltScript { scans: number; scanMs: number; events: ReadonlyArray<{ scan: number; belt: string; speedMps: number }> }

export const STACK_SCRIPT: BeltScript = {
  scans: 6000,
  scanMs: 10,
  events: [100, 1000, 1900].map((scan) => ({ scan, belt: 'belt', speedMps: 0.5 })).concat([700, 1600, 2500].map((scan) => ({ scan, belt: 'belt', speedMps: 0 }))),
};

// Applies the events of a scan, steps the world by scanMs, then samples.
export async function runScripted(Jolt: JoltModule, scene: GateScene, script: BeltScript): Promise<string> {
  const world = createWorld(Jolt, scene);
  try {
    const recorder = new TraceRecorder(world);
    let beltOn = 0;
    for (let scan = 0; scan < script.scans; scan += 1) {
      for (const event of script.events) {
        if (event.scan !== scan) continue;
        world.setBeltTarget(event.belt, event.speedMps);
        beltOn = event.speedMps !== 0 ? 0x80 : 0;
      }
      world.step(script.scanMs);
      recorder.sample(beltOn);
    }
    return await sha256Hex(recorder.bytes());
  } finally {
    world.dispose();
  }
}
