import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { createWorld, type PhysicsWorld, type WorldBodySpec } from './world';
import { loadJolt } from './jolt';
import { scaleDefaultTimeout } from '../../test/platformTime';

scaleDefaultTimeout(); // a test with no timeout of its own gets bun's 5 s scaled for the system (src/test/platformTime.ts)

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
const box = (id: string, at: [number, number, number]): WorldBodySpec => ({
  ...base,
  id,
  kind: 'item',
  half: [0.15, 0.15, 0.15],
  position: at,
  massKg: 5,
  motion: 'dynamic',
  layer: 'moving',
});
// The pad lives in the static layer, like the stop blade.
const pad = (at: [number, number, number]): WorldBodySpec => ({
  ...base,
  id: 'pad',
  kind: 'box',
  half: [0.15, 0.015, 0.1],
  position: at,
  massKg: 0,
  motion: 'kinematic',
  layer: 'static',
});
const Q: [number, number, number, number] = [0, 0, 0, 1];
const STEP_S = 0.005;

async function make(...specs: WorldBodySpec[]): Promise<PhysicsWorld> {
  const w = createWorld(await loadJolt());
  w.addBody(floor);
  for (const s of specs) w.addBody(s);
  return w;
}
const at = (w: PhysicsWorld, id: string) => w.bodies().find((b) => b.id === id)!;
const hashPoses = (poses: number[][]) => createHash('sha256').update(new Float64Array(poses.flat())).digest('hex');

/** Pad at 0.45, box at 0.15 (0.3 m below), settled, attached; the pad accelerates at 3 m/s2 for 1 m up, then 1 m sideways. */
function carry(w: PhysicsWorld, onStep?: () => void) {
  for (let i = 0; i < 100; i += 1) w.step(5);
  w.attach('pad', 'box');
  const travel = (axis: 0 | 1, from: [number, number, number]) => {
    const steps = Math.ceil(Math.sqrt((2 * 1) / 3) / STEP_S);
    const p: [number, number, number] = [...from];
    for (let i = 1; i <= steps; i += 1) {
      p[axis] = from[axis] + Math.min(1, 0.5 * 3 * (i * STEP_S) ** 2);
      w.setKinematicPose('pad', p, Q);
      w.step(5);
      onStep?.();
    }
    return p;
  };
  return travel(0, travel(1, [0, 0.45, 0]));
}

describe('world grip primitive', () => {
  it('PLT-007 an attached box follows its kinematic anchor up and sideways and is not left behind', async () => {
    const w = await make(pad([0, 0.45, 0]), box('box', [0, 0.15, 0]));
    const offset = 0.3;
    let worst = 0;
    carry(w, () => {
      const p = at(w, 'pad').p;
      const b = at(w, 'box').p;
      worst = Math.max(worst, Math.abs(p[0] - b[0]), Math.abs(p[1] - b[1] - offset), Math.abs(p[2] - b[2]));
    });
    expect(worst).toBeLessThan(0.002);
    expect(at(w, 'box').p[0]).toBeCloseTo(1, 1);
    expect(at(w, 'box').p[1]).toBeCloseTo(1.15, 1);
    w.dispose();
  });

  it('PLT-007 a detached box falls and rests on the floor without a jump', async () => {
    // Box bottom 0.05 above the floor, the pad 0.3 m above the box centre.
    const w = await make(pad([0, 0.5, 0]), box('box', [0, 0.2, 0]));
    w.attach('pad', 'box');
    w.step(10);
    w.detach('box');
    expect(w.attachedTo('box')).toBeNull();
    const before = at(w, 'box').p[1];
    w.step(5);
    expect(Math.abs(at(w, 'box').p[1] - before)).toBeLessThan(0.01); // no jump on release
    w.step(1000);
    const b = at(w, 'box');
    expect(Math.abs(b.p[1] - 0.15)).toBeLessThan(0.001);
    expect(Math.hypot(...b.v)).toBeLessThan(0.005);
    w.dispose();
  });

  it('PLT-007 an item removed while attached leaves no constraint and the world keeps stepping', async () => {
    const w = await make(pad([0, 0.45, 0]), box('a', [0, 0.15, 0]), box('b', [0.6, 0.15, 0]));
    w.attach('pad', 'a');
    w.attach('pad', 'b');
    w.removeBody('a');
    expect(w.attachedTo('a')).toBeNull();
    expect(w.has('a')).toBe(false);
    w.setKinematicPose('pad', [0, 0.6, 0], Q);
    w.step(100);
    expect(at(w, 'b').p[1]).toBeGreaterThan(0.2);
    w.dispose();
  });

  it('PLT-007 removing the anchor of an attached item detaches it', async () => {
    const w = await make(pad([0, 0.45, 0]), box('a', [0, 0.15, 0]), box('b', [0.6, 0.15, 0]));
    w.attach('pad', 'a');
    w.attach('pad', 'b');
    w.removeBody('pad');
    expect(w.attachedTo('a')).toBeNull();
    expect(w.attachedTo('b')).toBeNull();
    w.step(100);
    expect(Math.abs(at(w, 'a').p[1] - 0.15)).toBeLessThan(0.01);
    w.dispose();
  });

  it('PLT-007 dispose with an attachment does not throw', async () => {
    const w = await make(pad([0, 0.45, 0]), box('box', [0, 0.15, 0]));
    w.attach('pad', 'box');
    w.step(10);
    expect(() => w.dispose()).not.toThrow();
    expect(() => w.dispose()).not.toThrow();
  });

  it('PLT-006 bodiesInBox returns creation order, whatever the order the bodies were moved in', async () => {
    const w = await make(box('a', [0, 0.15, 0]), box('b', [1, 0.15, 0]), box('c', [2, 0.15, 0]), pad([8, 3, 0]));
    // Park every item inside one volume, in reverse order, and let them rest there.
    w.removeBody('c');
    w.addBody(box('c', [0.6, 0.15, 0.5]));
    w.removeBody('b');
    w.addBody(box('b', [0.2, 0.15, 0.5]));
    w.step(100);
    // `c` and `b` were re-created: creation order is now a, pad, c, b.
    expect(w.bodiesInBox([-1, 0, -1], [1, 1, 1])).toEqual(['a', 'c', 'b']);
    // Kinematic bodies are listed; a centre outside the volume excludes the body; the static floor is never returned.
    expect(w.bodiesInBox([-1, 0, -1], [0.4, 1, 1])).toEqual(['a', 'b']);
    expect(w.bodiesInBox([-1, -2, -1], [1, 1, 1])).not.toContain('floor');
    expect(w.bodiesInBox([7, 2, -1], [9, 4, 1])).toEqual(['pad']);
    expect(w.bodiesInBox([20, 20, 20], [21, 21, 21])).toEqual([]);
    w.dispose();
  });

  it('PLT-007 gapBelow measures the distance to the surface under a body, any layer', async () => {
    const belt: WorldBodySpec = { ...floor, id: 'belt', half: [2, 0.05, 0.3], position: [0, 0.4, 3] };
    const w = await make(belt, box('onFloor', [0, 0.5, 0]), box('over', [0, 0.65, 3]), box('away', [4.5, 0.65, 0]));
    // The belt top is 0.45 and the static floor is the only surface under the first box.
    expect(w.gapBelow('over')).toBeCloseTo(0.05, 3);
    expect(w.gapBelow('onFloor')).toBeCloseTo(0.35, 3);
    expect(w.gapBelow('away')).toBeCloseTo(0.5, 3);
    w.removeBody('floor');
    expect(w.gapBelow('away')).toBe(Infinity);
    w.addBody(floor);
    w.addBody(box('top', [0, 1.2, 0]));
    w.removeBody('onFloor');
    w.addBody(box('low', [0, 0.15, 0]));
    // `top` bottom at 1.05, `low` top at 0.30.
    expect(w.gapBelow('top')).toBeCloseTo(0.75, 3);
    w.dispose();
  });

  it('PLT-012 capture and restore keep the attachments', async () => {
    const build = () => make(pad([0, 0.45, 0]), box('box', [0, 0.15, 0]));
    const script = (w: PhysicsWorld, from: number, to: number) => {
      for (let i = from; i <= to; i += 1) {
        w.setKinematicPose('pad', [0.2 * (i / 400), 0.45 + 0.8 * (i / 400), 0], Q);
        w.step(5);
      }
    };
    const a = await build();
    a.attach('pad', 'box');
    script(a, 1, 200);
    const mid = a.capture();
    script(a, 201, 400);
    const endA = a.capture();
    const b = await build();
    b.attach('pad', 'box');
    script(b, 1, 50);
    b.restore(mid);
    expect(b.capture()).toEqual(mid);
    b.setKinematicPose('pad', [0.1, 0.85, 0], Q);
    script(b, 201, 400);
    expect(b.capture()).toEqual(endA);
    const bare = await build();
    expect(() => bare.restore(mid)).toThrow('capture belongs to a different set of attachments');
    for (const w of [a, b, bare]) w.dispose();
  });

  it('PLT-006 the pose sequence of an attach, carry and release is identical on three fresh worlds', async () => {
    const hashes: string[] = [];
    for (let run = 0; run < 3; run += 1) {
      const w = await make(pad([0, 0.45, 0]), box('box', [0, 0.15, 0]));
      const poses: number[][] = [];
      carry(w, () => poses.push([...at(w, 'box').p, ...at(w, 'box').q]));
      w.detach('box');
      for (let i = 0; i < 100; i += 1) {
        w.step(5);
        poses.push([...at(w, 'box').p, ...at(w, 'box').q]);
      }
      hashes.push(hashPoses(poses));
      w.dispose();
    }
    expect(hashes[1]).toBe(hashes[0]);
    expect(hashes[2]).toBe(hashes[0]);
  });

  it('PLT-007 attach refuses an unknown id and an item that is already attached with a located message', async () => {
    const w = await make(pad([0, 0.45, 0]), box('box', [0, 0.15, 0]));
    expect(() => w.attach('nope', 'box')).toThrow('attach: unknown anchor body nope');
    expect(() => w.attach('pad', 'nope')).toThrow('attach: unknown item body nope');
    w.attach('pad', 'box');
    expect(() => w.attach('pad', 'box')).toThrow('attach: box is already attached to pad');
    expect(w.attachedTo('box')).toBe('pad');
    w.detach('box');
    expect(() => w.detach('box')).not.toThrow();
    w.dispose();
  });

  it('PLT-006 a world with no attachment steps exactly as before', async () => {
    const w = await make(box('box', [0, 1, 0]));
    w.step(200);
    expect(w.bodiesInBox([-1, 0, -1], [1, 2, 1])).toEqual(['box']);
    const head = JSON.parse(new TextDecoder().decode(w.capture().subarray(4, 4 + new DataView(w.capture().buffer).getUint32(0, true))));
    expect(head.attachments).toEqual([]);
    w.restore(w.capture());
    w.dispose();
  });
});
