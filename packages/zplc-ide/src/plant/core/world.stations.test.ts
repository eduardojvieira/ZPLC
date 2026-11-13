import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { createWorld, type PhysicsWorld, type WorldBodySpec } from './world';
import { loadJolt } from './jolt';
import type { Quat, Vec3 } from '../contracts';

const Q: Quat = [0, 0, 0, 1];
const STEP_MS = 5;
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

// A crate: an open box 0.8 by 0.25 by 0.6 m with 0.02 m walls. The body origin is the box centre.
const CRATE_HALF: Vec3 = [0.4, 0.125, 0.3];
const WALL = 0.02;
const crateShapes = [
  { half: [0.4, WALL / 2, 0.3] as Vec3, offset: [0, -0.125 + WALL / 2, 0] as Vec3 },
  { half: [WALL / 2, 0.125, 0.3] as Vec3, offset: [-0.4 + WALL / 2, 0, 0] as Vec3 },
  { half: [WALL / 2, 0.125, 0.3] as Vec3, offset: [0.4 - WALL / 2, 0, 0] as Vec3 },
  { half: [0.4 - WALL, 0.125, WALL / 2] as Vec3, offset: [0, 0, -0.3 + WALL / 2] as Vec3 },
  { half: [0.4 - WALL, 0.125, WALL / 2] as Vec3, offset: [0, 0, 0.3 - WALL / 2] as Vec3 },
];
const crate = (id: string, at: Vec3): WorldBodySpec => ({
  ...base,
  id,
  kind: 'item',
  half: CRATE_HALF,
  position: at,
  massKg: 4,
  motion: 'dynamic',
  layer: 'moving',
  shapes: crateShapes,
});
const workpiece = (id: string, at: Vec3): WorldBodySpec => ({
  ...base,
  id,
  kind: 'item',
  half: [0.1, 0.05, 0.1],
  position: at,
  massKg: 0.5,
  motion: 'dynamic',
  layer: 'moving',
});
const box = (id: string, half: Vec3, at: Vec3, massKg: number): WorldBodySpec => ({
  ...base,
  id,
  kind: 'item',
  half,
  position: at,
  massKg,
  motion: 'dynamic',
  layer: 'moving',
});
const pose = (w: PhysicsWorld, id: string) => w.bodies().find((b) => b.id === id)!;
const run = (w: PhysicsWorld, ms: number) => {
  for (let t = 0; t < ms; t += STEP_MS) w.step(STEP_MS);
};
const speed = (v: Vec3) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
const digest = (w: PhysicsWorld, h: ReturnType<typeof createHash>) => {
  const f = new Float64Array(w.bodies().flatMap((b) => [...b.p, ...b.q, ...b.v]));
  h.update(new Uint8Array(f.buffer));
};

// Five workpieces dropped one every 1.5 s into a crate on the floor (the crate sits with its bottom face at y = 0).
const DROP_X = [-0.2, 0.2, -0.2, 0.2, 0];
const DROP_Z = [-0.15, -0.15, 0.15, 0.15, 0];
async function crateWorld(): Promise<PhysicsWorld> {
  const w = createWorld(await loadJolt());
  w.addBody(floor);
  w.addBody(crate('crate', [0, 0.125, 0]));
  for (let i = 0; i < 5; i += 1) w.addBody(workpiece(`w${i}`, [DROP_X[i], 5 + i, DROP_Z[i]]));
  return w;
}
/** Releases workpiece `i` 0.15 m above the rim: parked far away until then. */
async function dropRun(onStep?: (w: PhysicsWorld, tMs: number) => void): Promise<PhysicsWorld> {
  const w = await crateWorld();
  // Parked bodies hover high above: gravity acts on them, so they are created at the drop height instead and woken in order.
  w.removeBody('w0');
  for (let i = 1; i < 5; i += 1) w.removeBody(`w${i}`);
  for (let t = 0; t < 10_000; t += STEP_MS) {
    if (t % 1500 === 0 && t / 1500 < 5) {
      const i = t / 1500;
      w.addBody(workpiece(`w${i}`, [DROP_X[i], 0.25 + 0.15 + 0.05, DROP_Z[i]]));
    }
    w.step(STEP_MS);
    onStep?.(w, t);
  }
  return w;
}

describe('PLT-007 compound bodies', () => {
  it('PLT-007 a compound body is one rigid body: a box dropped into a compound crate stays in it', async () => {
    const w = await dropRun();
    const c = pose(w, 'crate');
    for (let i = 0; i < 5; i += 1) {
      const b = pose(w, `w${i}`);
      expect(Math.abs(b.p[0] - c.p[0])).toBeLessThan(0.38);
      expect(Math.abs(b.p[2] - c.p[2])).toBeLessThan(0.28);
      // Above the floor of the crate (top at 0.02) and not sunk into it; below the rim plus half a body.
      expect(b.p[1] - 0.05).toBeGreaterThan(0.02 - 0.003);
      expect(b.p[1]).toBeLessThan(0.3);
      expect(speed(b.v)).toBeLessThan(0.05);
    }
    expect(speed(c.v)).toBeLessThan(0.05);
    w.dispose();
  });

  it('PLT-007 a crate set on a crate rests on its rims', async () => {
    const w = createWorld(await loadJolt());
    w.addBody(floor);
    w.addBody(crate('low', [0, 0.125, 0]));
    w.addBody(crate('high', [0.02, 0.25 + 0.125 + 0.05, 0.01]));
    run(w, 2000);
    const before = pose(w, 'high').p;
    run(w, 60_000);
    const after = pose(w, 'high').p;
    expect(Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])).toBeLessThan(0.001);
    // Resting on the four rims: the upper floor is 0.25 above the lower floor, so its centre is 0.25 + 0.125 above the floor.
    expect(after[1]).toBeGreaterThan(0.37);
    expect(after[1]).toBeLessThan(0.385);
    w.dispose();
  });

  it('PLT-012 capture of a compound body mid-fall restores to the same exact state', async () => {
    const make = async () => {
      const w = createWorld(await loadJolt());
      w.addBody(floor);
      w.addBody(crate('crate', [0, 0.125, 0]));
      w.addBody(workpiece('w0', [0.1, 1, 0.05]));
      return w;
    };
    const a = await make();
    run(a, 200);
    const bytes = a.capture();
    run(a, 3000);
    const b = await make();
    b.restore(bytes);
    run(b, 3000);
    expect(b.timeMs).toBe(a.timeMs);
    expect(Buffer.from(b.capture()).equals(Buffer.from(a.capture()))).toBe(true);
    expect(pose(b, 'w0').p).toEqual(pose(a, 'w0').p);
    a.dispose();
    b.dispose();
  });

  it('PLT-006 the pose sequence of a compound run is identical on three fresh worlds', async () => {
    const hashes: string[] = [];
    for (let k = 0; k < 3; k += 1) {
      const h = createHash('sha256');
      const w = await dropRun((world) => digest(world, h));
      w.dispose();
      hashes.push(h.digest('hex'));
    }
    expect(hashes[1]).toBe(hashes[0]);
    expect(hashes[2]).toBe(hashes[0]);
  });
});

// A kinematic platform (static layer, like every belt body) lifted and lowered with its pose set every step.
const platform = (id: string, half: Vec3, at: Vec3): WorldBodySpec => ({
  ...base,
  id,
  kind: 'box',
  half,
  position: at,
  massKg: 0,
  motion: 'kinematic',
  layer: 'static',
});
/** A trapezoid profile: distance covered after `t` seconds of a move of `d` metres at top speed `v` and acceleration `a`. */
function profile(d: number, v: number, a: number) {
  const tAcc = v / a;
  const dAcc = (v * tAcc) / 2;
  const cruise = d - 2 * dAcc;
  const total = cruise >= 0 ? 2 * tAcc + cruise / v : 2 * Math.sqrt(d / a);
  const peak = cruise >= 0 ? v : Math.sqrt(d * a);
  const ta = peak / a;
  return {
    total,
    at(t: number) {
      if (t >= total) return d;
      if (t < ta) return (a * t * t) / 2;
      if (cruise >= 0 && t < total - ta) return dAcc + peak * (t - ta);
      const r = total - t;
      return d - (a * r * r) / 2;
    },
  };
}

describe('PLT-007 vertical carry', () => {
  const carry = async (massKg: number, v: number, a: number, asleep: boolean) => {
    const w = createWorld(await loadJolt());
    w.addBody(floor);
    w.addBody(platform('plat', [0.5, 0.05, 0.35], [0, 0.05, 0]));
    w.addBelt({ id: 'plat', bodyId: 'plat', axis: [1, 0, 0], accelMps2: 1 });
    w.addBody(box('box', [0.15, 0.1, 0.15], [0, 0.2, 0], massKg));
    run(w, asleep ? 4000 : 1000);
    if (asleep) expect(pose(w, 'box').asleep).toBe(true);
    const start = pose(w, 'box').p;
    const up = profile(1.2, v, a);
    let worst = 0;
    const move = (dir: 1 | -1, p: ReturnType<typeof profile>) => {
      for (let t = 0; t <= p.total + 1e-9; t += STEP_MS / 1000) {
        const y = 0.05 + (dir === 1 ? p.at(t) : 1.2 - p.at(t));
        w.setKinematicPose('plat', [0, y, 0], Q);
        w.step(STEP_MS);
        worst = Math.max(worst, Math.abs(pose(w, 'box').p[1] - 0.1 - (y + 0.05)));
      }
    };
    const hold = (ms: number, y: number) => {
      for (let t = 0; t < ms; t += STEP_MS) {
        w.setKinematicPose('plat', [0, y, 0], Q);
        w.step(STEP_MS);
        worst = Math.max(worst, Math.abs(pose(w, 'box').p[1] - 0.1 - (y + 0.05)));
      }
    };
    move(1, up);
    hold(2000, 1.25);
    const top = pose(w, 'box').p;
    move(-1, up);
    hold(2000, 0.05);
    const end = pose(w, 'box').p;
    w.dispose();
    return { worst, start, top, end };
  };

  for (const [massKg, v, a] of [
    [2, 0.4, 0.8],
    [5, 0.4, 0.8],
    [2, 1.0, 3],
    [5, 1.0, 3],
  ] as const) {
    it(`PLT-007 a kinematic belt carries a ${massKg} kg box 1.2 m up and back down without slip at ${v} m/s`, async () => {
      for (const asleep of [false, true]) {
        const r = await carry(massKg, v, a, asleep);
        // The box bottom follows the platform top within 2 mm in every phase.
        expect(r.worst).toBeLessThan(0.002);
        // At rest within 5 mm of its start position on the platform after each stop.
        expect(Math.abs(r.top[0] - r.start[0])).toBeLessThan(0.005);
        expect(Math.abs(r.top[2] - r.start[2])).toBeLessThan(0.005);
        expect(Math.abs(r.end[0] - r.start[0])).toBeLessThan(0.005);
        expect(Math.abs(r.end[1] - r.start[1])).toBeLessThan(0.005);
        expect(Math.abs(r.end[2] - r.start[2])).toBeLessThan(0.005);
      }
    });
  }

  it('PLT-008 the box at rest on a stopped platform stays at rest for 60 simulated seconds with drift under 0.001 m', async () => {
    const w = createWorld(await loadJolt());
    w.addBody(floor);
    w.addBody(platform('plat', [0.5, 0.05, 0.35], [0, 0.65, 0]));
    w.addBelt({ id: 'plat', bodyId: 'plat', axis: [1, 0, 0], accelMps2: 1 });
    w.addBody(box('box', [0.15, 0.1, 0.15], [0.1, 0.8, 0], 5));
    for (let t = 0; t < 2000; t += STEP_MS) {
      w.setKinematicPose('plat', [0, 0.65, 0], Q);
      w.step(STEP_MS);
    }
    const p0 = pose(w, 'box').p;
    for (let t = 0; t < 60_000; t += STEP_MS) {
      w.setKinematicPose('plat', [0, 0.65, 0], Q);
      w.step(STEP_MS);
    }
    const p1 = pose(w, 'box').p;
    expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])).toBeLessThan(0.001);
    w.dispose();
  });
});

describe('PLT-007 fork and rails', () => {
  // A 0.16 m wide plate (narrow across x, long along z) under a 0.3 x 0.4 x 0.3 m, 5 kg box; two static rails 0.24 m apart at x = 1.
  const scene = async () => {
    const w = createWorld(await loadJolt());
    w.addBody(floor);
    const rail = (id: string, x: number): WorldBodySpec => ({ ...platform(id, [0.025, 0.025, 0.4], [x, 0.475, 0.85]), motion: 'static' });
    w.addBody(rail('railL', 0.88));
    w.addBody(rail('railR', 1.12));
    // Rail tops at 0.5, the plate top 0.03 m above them: lowering the plate by 0.06 m hands the box to the rails.
    w.addBody(platform('fork', [0.08, 0.015, 0.4], [0, 0.515, 0]));
    w.addBody(box('box', [0.15, 0.15, 0.2], [0, 0.68, 0], 5));
    return w;
  };
  const drive = (w: PhysicsWorld, from: Vec3, to: Vec3, v: number, a: number) => {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const p = profile(d, v, a);
    for (let t = 0; t <= p.total + 1e-9; t += STEP_MS / 1000) {
      const f = p.at(t) / d;
      w.setKinematicPose('fork', [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, from[2] + (to[2] - from[2]) * f], Q);
      w.step(STEP_MS);
    }
  };
  const holdFork = (w: PhysicsWorld, at: Vec3, ms: number) => {
    for (let t = 0; t < ms; t += STEP_MS) {
      w.setKinematicPose('fork', at, Q);
      w.step(STEP_MS);
    }
  };

  for (const a of [1.5, 3]) {
    it(`PLT-007 a kinematic fork moving along x carries a box and puts it on rails by lowering (accel ${a})`, async () => {
      const w = await scene();
      holdFork(w, [0, 0.515, 0], 1500);
      // 1.0 m along x at 1.0 m/s, then 0.8 m out along z between the rails.
      drive(w, [0, 0.515, 0], [1, 0.515, 0], 1, a);
      holdFork(w, [1, 0.515, 0], 500);
      expect(Math.abs(pose(w, 'box').p[0] - 1)).toBeLessThan(0.01);
      expect(Math.abs(pose(w, 'box').p[2])).toBeLessThan(0.01);
      drive(w, [1, 0.515, 0], [1, 0.515, 0.8], 0.4, a);
      holdFork(w, [1, 0.515, 0.8], 500);
      expect(Math.abs(pose(w, 'box').p[2] - 0.8)).toBeLessThan(0.01);
      // Lower 0.06 m, retract empty.
      drive(w, [1, 0.515, 0.8], [1, 0.455, 0.8], 0.1, a);
      holdFork(w, [1, 0.455, 0.8], 1000);
      drive(w, [1, 0.455, 0.8], [1, 0.455, 0], 0.4, a);
      holdFork(w, [1, 0.455, 0], 1500);
      const b = pose(w, 'box');
      expect(Math.abs(b.p[2] - 0.8)).toBeLessThan(0.01);
      expect(Math.abs(b.p[0] - 1)).toBeLessThan(0.01);
      expect(speed(b.v)).toBeLessThan(0.05);
      // Resting on the rails: the box bottom at the rail tops (0.5).
      expect(Math.abs(b.p[1] - 0.15 - 0.5)).toBeLessThan(0.005);
      // The reverse: the plate below, extending, rising 0.06 m and retracting takes the box with it.
      drive(w, [1, 0.455, 0], [1, 0.455, 0.8], 0.4, a);
      drive(w, [1, 0.455, 0.8], [1, 0.515, 0.8], 0.1, a);
      holdFork(w, [1, 0.515, 0.8], 500);
      drive(w, [1, 0.515, 0.8], [1, 0.515, 0], 0.4, a);
      holdFork(w, [1, 0.515, 0], 1500);
      const c = pose(w, 'box');
      expect(Math.abs(c.p[2])).toBeLessThan(0.02);
      expect(speed(c.v)).toBeLessThan(0.05);
      w.dispose();
    });
  }
});

describe('PLT-007 tilt and the layer filter', () => {
  it('PLT-007 a tilted static ramp slides a box', async () => {
    const w = createWorld(await loadJolt());
    w.addBody(floor);
    // A 20 degree ramp about z (descending towards +x), friction 0.2, and a belt-height floor patch below its low end.
    w.addBody({ ...platform('ramp', [0.6, 0.02, 0.3], [0, 0.6, 0]), motion: 'static', friction: 0.2, tiltDeg: -20 });
    w.addBody(box('box', [0.1, 0.1, 0.1], [-0.4, 0.8, 0], 2));
    run(w, 10_000);
    const b = pose(w, 'box');
    // It left the ramp's low end and came down to the floor, at rest far from where it started.
    expect(b.p[0]).toBeGreaterThan(0.5);
    expect(b.p[1]).toBeLessThan(0.15);
    expect(speed(b.v)).toBeLessThan(0.05);
    w.dispose();
  });

  it('PLT-007 a kinematic body poses through a static one without being blocked', async () => {
    const w = createWorld(await loadJolt());
    w.addBody(floor);
    w.addBody({ ...platform('rail', [0.025, 0.1, 0.4], [0, 0.3, 0.5]), motion: 'static' });
    w.addBody(platform('plate', [0.08, 0.015, 0.4], [0, 0.3, -0.5]));
    for (let t = 0; t < 1000; t += STEP_MS) {
      w.setKinematicPose('plate', [0, 0.3, -0.5 + (t / 1000) * 1.0], Q);
      w.step(STEP_MS);
    }
    expect(pose(w, 'plate').p[2]).toBeGreaterThan(0.49);
    w.dispose();
  });

  it('PLT-016 tiltDeg on a dynamic body is refused with a located message', async () => {
    const w = createWorld(await loadJolt());
    expect(() => w.addBody({ ...box('b', [0.1, 0.1, 0.1], [0, 1, 0], 1), tiltDeg: 10 })).toThrow(/addBody b: tiltDeg/);
    expect(w.has('b')).toBe(false);
    w.dispose();
  });
});

describe('PLT-006 bodies without shapes or tilt', () => {
  it('PLT-006 a body with no shapes and no tilt is created exactly as before', async () => {
    const run1 = async (extra: Partial<WorldBodySpec>) => {
      const w = createWorld(await loadJolt());
      w.addBody(floor);
      w.addBody({ ...box('b', [0.1, 0.1, 0.1], [0.05, 0.6, 0], 2), ...extra });
      run(w, 2000);
      const bytes = w.capture();
      w.dispose();
      return bytes;
    };
    const plain = await run1({});
    const explicit = await run1({ shapes: undefined, tiltDeg: undefined });
    expect(Buffer.from(explicit).equals(Buffer.from(plain))).toBe(true);
  });
});
