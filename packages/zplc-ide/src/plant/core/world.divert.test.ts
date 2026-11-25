import { describe, expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createWorld, type PhysicsWorld, type WorldBodySpec } from './world';
import { loadJolt } from './jolt';
import type { Quat, Vec3 } from '../contracts';

const base = { rotationYDeg: 0, friction: 0.6 } as const;
const floor: WorldBodySpec = {
  ...base,
  id: 'floor',
  kind: 'box',
  half: [5, 0.5, 5],
  position: [0, -0.5, 0],
  massKg: 0,
  motion: 'static',
  layer: 'static',
};
// A belt body in the static layer, like the stop blade: its top is at y = 0.1.
const belt = (half: Vec3, motion: 'static' | 'kinematic' = 'kinematic'): WorldBodySpec => ({
  ...base,
  id: 'belt',
  kind: 'box',
  half,
  position: [0, 0.05, 0],
  massKg: 0,
  motion,
  layer: 'static',
});
const crate = (at: Vec3): WorldBodySpec => ({
  ...base,
  id: 'crate',
  kind: 'item',
  half: [0.1, 0.1, 0.1],
  position: at,
  massKg: 2,
  motion: 'dynamic',
  layer: 'moving',
});
const Q: Quat = [0, 0, 0, 1];
const STEP_MS = 5;
const yaw = (deg: number): Quat => {
  const a = (deg * Math.PI) / 360;
  return [0, Math.sin(a), 0, Math.cos(a)];
};
const crateOf = (w: PhysicsWorld) => w.bodies().find((b) => b.id === 'crate')!;

async function build(b: WorldBodySpec, at: Vec3): Promise<PhysicsWorld> {
  const w = createWorld(await loadJolt());
  w.addBody(floor);
  w.addBody(b);
  w.addBody(crate(at));
  return w;
}
/** Holds a kinematic body at `y` (and `q`) for `ms`, setting the pose every step as the parts do. */
const hold = (w: PhysicsWorld, y: number, ms: number, q: Quat = Q) => {
  for (let t = 0; t < ms; t += STEP_MS) {
    w.setKinematicPose('belt', [0, y, 0], q);
    w.step(STEP_MS);
  }
};
const move = (w: PhysicsWorld, from: number, to: number, ms: number) => {
  let worst = 0;
  const y0 = crateOf(w).p[1];
  for (let t = STEP_MS; t <= ms; t += STEP_MS) {
    const y = from + ((to - from) * t) / ms;
    w.setKinematicPose('belt', [0, y, 0], Q);
    w.step(STEP_MS);
    worst = Math.max(worst, Math.abs(crateOf(w).p[1] - (y0 + (y - from))));
  }
  return worst;
};
const BELT = { id: 'belt', bodyId: 'belt', accelMps2: 100 } as const;

describe('kinematic belts in the physics world', () => {
  it('PLT-007 a kinematic belt carries a resting box along its axis', async () => {
    const w = await build(belt([2, 0.05, 0.5]), [-1, 0.2, 0]);
    w.addBelt({ ...BELT, axis: [1, 0, 0] });
    hold(w, 0.05, 1000);
    const x0 = crateOf(w).p[0];
    w.setBeltTarget('belt', 0.5);
    hold(w, 0.05, 2000);
    const dx = crateOf(w).p[0] - x0;
    expect(Math.abs(dx - 1)).toBeLessThan(0.05);
    w.dispose();
  });

  it('PLT-007 a kinematic belt that starts moving wakes a sleeping box on it', async () => {
    const w = await build(belt([2, 0.05, 0.5]), [-1, 0.2, 0]);
    w.addBelt({ ...BELT, axis: [1, 0, 0] });
    w.step(1000);
    expect(crateOf(w).asleep).toBe(true);
    w.setBeltTarget('belt', 0.5);
    w.step(100);
    expect(crateOf(w).asleep).toBe(false);
    expect(crateOf(w).v[0]).toBeGreaterThan(0.1);
    w.dispose();
  });

  it('PLT-007 raising a kinematic belt lifts the box with no jump and lowering it puts the box down at rest', async () => {
    const w = await build(belt([2, 0.05, 0.5]), [-1, 0.2, 0]);
    w.addBelt({ ...BELT, axis: [1, 0, 0] });
    w.step(1000);
    expect(crateOf(w).asleep).toBe(true);
    const y0 = crateOf(w).p[1];
    expect(move(w, 0.05, 0.07, 400)).toBeLessThan(0.001);
    hold(w, 0.07, 1000);
    expect(Math.abs(crateOf(w).p[1] - (y0 + 0.02))).toBeLessThan(0.001);
    expect(move(w, 0.07, 0.05, 400)).toBeLessThan(0.001);
    hold(w, 0.05, 1000);
    expect(Math.abs(crateOf(w).p[1] - y0)).toBeLessThan(0.001);
    expect(Math.hypot(...crateOf(w).v)).toBeLessThan(0.01);
    w.dispose();
  });

  it('PLT-007 a raised kinematic belt still carries the box, and the box rides it out wide of the belt top', async () => {
    const w = await build(belt([2, 0.05, 0.5]), [-1, 0.2, 0]);
    w.addBelt({ ...BELT, axis: [1, 0, 0] });
    w.step(1000);
    move(w, 0.05, 0.07, 400);
    hold(w, 0.07, 200);
    const x0 = crateOf(w).p[0];
    w.setBeltTarget('belt', 0.5);
    hold(w, 0.07, 2000);
    expect(Math.abs(crateOf(w).p[0] - x0 - 1)).toBeLessThan(0.05);
    expect(Math.abs(crateOf(w).p[1] - 0.22)).toBeLessThan(0.002);
    w.dispose();
  });

  it('PLT-007 setBeltAxis turns the surface velocity: +x then +z moves the box along each axis', async () => {
    const w = await build(belt([2, 0.05, 2]), [0, 0.2, 0]);
    w.addBelt({ ...BELT, axis: [1, 0, 0] });
    w.setBeltTarget('belt', 0.5);
    hold(w, 0.05, 1000);
    const a = crateOf(w).p;
    expect(a[0]).toBeGreaterThan(0.4);
    expect(Math.abs(a[2])).toBeLessThan(0.01);
    w.setBeltTarget('belt', 0);
    hold(w, 0.05, 1000);
    expect(w.beltSpeed('belt')).toBe(0);
    w.setBeltAxis('belt', [0, 0, 1]);
    w.setBeltTarget('belt', 0.5);
    hold(w, 0.05, 1000);
    const b = crateOf(w).p;
    expect(b[2]).toBeGreaterThan(0.4);
    expect(Math.abs(b[0] - a[0])).toBeLessThan(0.05);
    w.dispose();
  });

  it(
    'PLT-007 setBeltAxis and beltSpeed refuse an unknown belt with a located message, and beltSpeed follows the acceleration ' + 'ramp',
    async () => {
      const w = await build(belt([2, 0.05, 0.5]), [-1, 0.2, 0]);
      w.addBelt({ id: 'belt', bodyId: 'belt', axis: [1, 0, 0], accelMps2: 1 });
      expect(() => w.setBeltAxis('nope', [0, 0, 1])).toThrow('unknown belt nope');
      expect(() => w.beltSpeed('nope')).toThrow('unknown belt nope');
      w.setBeltTarget('belt', 0.5);
      w.step(100);
      expect(w.beltSpeed('belt')).toBeCloseTo(0.1, 9);
      w.step(1000);
      expect(w.beltSpeed('belt')).toBe(0.5);
      w.dispose();
    },
  );

  it('PLT-007 a turning kinematic platform carries a box 0.3 m off its centre for 2 s without slip', async () => {
    const w = await build(belt([0.6, 0.05, 0.6]), [0.3, 0.2, 0]);
    w.step(1000);
    const DEG_PER_S = 90;
    const RAMP_MS = 500;
    let angle = 0;
    const lagAt: number[] = [];
    let radiusDrift = 0;
    for (let t = 0; t < 2500; t += STEP_MS) {
      const rate = DEG_PER_S * Math.min(1, (t + STEP_MS) / RAMP_MS);
      angle += rate * (STEP_MS / 1000);
      w.setKinematicPose('belt', [0, 0.05, 0], yaw(-angle));
      w.step(STEP_MS);
      const p = crateOf(w).p;
      if (t >= RAMP_MS) {
        // Wrap the lag into -180..180 degrees: atan2 turns over after half a revolution.
        lagAt.push(((((angle - (Math.atan2(p[2], p[0]) * 180) / Math.PI) % 360) + 540) % 360) - 180);
        radiusDrift = Math.max(radiusDrift, Math.abs(Math.hypot(p[0], p[2]) - 0.3));
      }
    }
    // No slip: once the platform is at speed the box keeps its place on it (arc drift of the lag within 2 mm, radius within 5 mm).
    const arcDrift = ((Math.max(...lagAt) - Math.min(...lagAt)) * Math.PI * 0.3) / 180;
    expect(arcDrift).toBeLessThan(0.002);
    expect(radiusDrift).toBeLessThan(0.005);
    w.dispose();
  });

  it('PLT-012 capture mid-rotation restores to the same exact state', async () => {
    const run = async (restoreAt: Uint8Array | null) => {
      const w = await build(belt([0.6, 0.05, 0.6]), [0.3, 0.2, 0]);
      w.addBelt({ ...BELT, axis: [1, 0, 0] });
      let snap: Uint8Array | null = null;
      const trail: string[] = [];
      if (restoreAt) w.restore(restoreAt);
      for (let k = restoreAt ? 201 : 0; k < 400; k += 1) {
        w.setKinematicPose('belt', [0, 0.05, 0], yaw(-k * 0.45));
        w.step(STEP_MS);
        trail.push(JSON.stringify(crateOf(w).p));
        if (k === 200) snap = w.capture();
      }
      w.dispose();
      return { snap, trail };
    };
    const a = await run(null);
    const b = await run(a.snap);
    expect(b.trail.join('|')).toBe(a.trail.slice(201).join('|'));
  });

  it('PLT-006 the pose sequence of a kinematic-belt run is identical on three fresh worlds', async () => {
    const hashes: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const w = await build(belt([0.6, 0.05, 0.6]), [0.3, 0.2, 0]);
      w.addBelt({ ...BELT, axis: [1, 0, 0] });
      w.setBeltTarget('belt', 0.3);
      const h = createHash('sha256');
      for (let k = 0; k < 300; k += 1) {
        w.setKinematicPose('belt', [0, 0.05 + 0.0001 * k, 0], yaw(-k * 0.3));
        w.step(STEP_MS);
        h.update(JSON.stringify(crateOf(w).p));
      }
      hashes.push(h.digest('hex'));
      w.dispose();
    }
    expect(hashes[1]).toBe(hashes[0]!);
    expect(hashes[2]).toBe(hashes[0]!);
  });

  it('PLT-006 static belts and the M1 to M3 world tests step exactly as before', async () => {
    // A static belt wakes only while it ramps and never rebuilds its wake box: a box on it is carried as in M1.
    const w = await build(belt([2, 0.05, 0.5], 'static'), [-1, 0.2, 0]);
    w.addBelt({ ...BELT, axis: [1, 0, 0] });
    w.step(1000);
    w.setBeltTarget('belt', 0.5);
    w.step(2000);
    expect(crateOf(w).p[0]).toBeGreaterThan(-0.1);
    w.dispose();
    // The four core pins are the guard of the M1 to M3 traces: this task must not touch them.
    const pins = readFileSync(new URL('./hashes.json', import.meta.url), 'utf8');
    const head = spawnSync('git', ['show', 'HEAD:packages/zplc-ide/src/plant/core/hashes.json'], {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
    });
    expect(pins).toBe(head.stdout.toString());
  });
});
