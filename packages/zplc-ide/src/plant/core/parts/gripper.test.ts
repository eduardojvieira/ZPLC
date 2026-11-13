import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { createWorld, type PhysicsWorld, type WorldBodySpec } from '../world';
import { loadJolt } from '../jolt';
import { BASE_SIZE, boxSize, LID_SIZE, PALLET_SIZE, removeTrackedItem, spawnItem } from './items';
import { createGripper, type Gripper, type GripperSpec, type Pad } from './gripper';

const floor: WorldBodySpec = {
  id: 'floor',
  kind: 'box',
  half: [5, 0.5, 5],
  position: [0, -0.5, 0],
  rotationYDeg: 0,
  friction: 0.6,
  massKg: 0,
  motion: 'static',
  layer: 'static',
};
const PAD_HALF: readonly [number, number] = [0.15, 0.1];
const padBody = (half: readonly [number, number]): WorldBodySpec => ({
  id: 'pad',
  kind: 'box',
  half: [half[0], 0.015, half[1]],
  position: [0, 1.5, 0],
  rotationYDeg: 0,
  friction: 0.6,
  massKg: 0,
  motion: 'kinematic',
  layer: 'static',
});
const BOX = boxSize(0.3); // top face at 0.301 on the floor
const at = (w: PhysicsWorld, id: string) => w.bodies().find((b) => b.id === id)!;

interface Rig {
  w: PhysicsWorld;
  g: Gripper;
  /** Pad bottom-face centre, driven by the test. */
  p: [number, number, number];
  /** One plant step as a part would run it: pose the pad, update, step the world, settle. */
  tick(grip: boolean): void;
  /** Linear move of the pad bottom to a target in `steps` steps, grip held as given. */
  move(to: [number, number, number], steps: number, grip: boolean): void;
}
async function rig(
  spec: GripperSpec,
  setup: (w: PhysicsWorld) => void,
  half: readonly [number, number] = PAD_HALF,
  withFloor = true,
): Promise<Rig> {
  const w = createWorld(await loadJolt());
  if (withFloor) w.addBody(floor);
  w.addBody(padBody(half));
  setup(w);
  const g = createGripper(w, spec);
  const r: Rig = {
    w,
    g,
    p: [0, 1.5, 0],
    tick(grip) {
      w.setKinematicPose('pad', [r.p[0], r.p[1] + 0.015, r.p[2]], [0, 0, 0, 1]);
      g.update(grip, { id: 'pad', centre: [...r.p], half });
      w.step(5);
      g.settle();
    },
    move(to, steps, grip) {
      const from = [...r.p];
      for (let i = 1; i <= steps; i += 1) {
        r.p = [0, 1, 2].map((k) => from[k]! + ((to[k]! - from[k]!) * i) / steps) as [number, number, number];
        r.tick(grip);
      }
    },
  };
  return r;
}
const vacuum: GripperSpec = { kind: 'vacuum', maxLoadKg: 10, maxItems: 1 };
const clamp: GripperSpec = { kind: 'clamp', maxLoadKg: 10, maxItems: 1 };
const settleWorld = (r: Rig, n = 100) => {
  for (let i = 0; i < n; i += 1) r.tick(false);
};

/** A box on the floor at x = -1 and a pallet at x = 1; the pad starts above the box. */
const pickPlaceSetup = (w: PhysicsWorld) => {
  spawnItem(w, 'box', 'item', BOX, 2, [-1, 0, 0], 0, 'box');
  spawnItem(w, 'pallet', 'pallet', PALLET_SIZE, 25, [1, 0, 0], 0);
};
/** Over the box, down onto it, grip, lift, carry over the pallet, lower by `lowerTo` above the pallet top (m). */
function carryToPallet(r: Rig, spec: GripperSpec, releaseAboveM: number) {
  r.p = [-1, 0.9, 0];
  settleWorld(r);
  r.move([-1, 0.302, 0], 120, false);
  r.move([-1, 0.302, 0], spec.kind === 'clamp' ? 70 : 3, true);
  expect(r.g.held()).toEqual(['box']);
  const offset = r.p[1] - (at(r.w, 'box').p[1] - 0.15); // pad bottom minus box bottom
  r.move([-1, 0.9, 0], 120, true);
  r.move([1, 0.9, 0], 200, true);
  const palletTop = PALLET_SIZE[1] + 0.001;
  r.move([1, palletTop + releaseAboveM + offset, 0], 120, true);
}

describe('gripper', () => {
  it('PLT-007 a vacuum pad over a box captures it on grip, lifts it and puts it down on release', async () => {
    const r = await rig(vacuum, pickPlaceSetup);
    carryToPallet(r, vacuum, 0.003);
    const lifted = at(r.w, 'box');
    expect(lifted.p[0]).toBeCloseTo(1, 1);
    expect(r.g.held()).toEqual(['box']);
    expect(r.w.attachedTo('box')).toBe('pad');
    expect(r.g.counts()).toEqual({ picked: 1, placed: 0, drops: 0 });
    for (let i = 0; i < 60; i += 1) r.tick(false);
    expect(r.g.held()).toEqual([]);
    expect(r.w.attachedTo('box')).toBeNull();
    expect(r.g.counts()).toEqual({ picked: 1, placed: 1, drops: 0 });
    const down = at(r.w, 'box');
    expect(down.p[1] - 0.15).toBeCloseTo(PALLET_SIZE[1], 2); // resting on the pallet, no jump, no penetration
    expect(Math.abs(down.p[1] - lifted.p[1])).toBeLessThan(0.02);
  });

  it('PLT-007 a clamp closes for 0.3 s before it holds and picks a box from the side-and-top capture volume', async () => {
    const r = await rig(clamp, pickPlaceSetup);
    r.p = [-1, 0.9, 0];
    settleWorld(r);
    // 0.12 m above the box top and 0.04 m off centre: inside the clamp window, outside any vacuum window
    r.move([-0.96, 0.42, 0], 120, false);
    expect(r.g.closeFraction()).toBe(0);
    for (let i = 0; i < 59; i += 1) r.tick(true);
    expect(r.g.held()).toEqual([]);
    expect(r.g.closeFraction()).toBeCloseTo(59 / 60, 6);
    r.tick(true);
    expect(r.g.closeFraction()).toBe(1);
    expect(r.g.held()).toEqual(['box']);
    expect(r.g.counts().picked).toBe(1);
    r.tick(false);
    expect(r.g.closeFraction()).toBe(0);
  });

  it('PLT-007 a clamp over a lid on a base takes the lid, the item nearest the pad', async () => {
    const r = await rig(clamp, (w) => {
      spawnItem(w, 'base', 'item', BASE_SIZE, 1, [0, 0, 0], 0, 'base');
      spawnItem(w, 'lid', 'item', LID_SIZE, 1, [0, BASE_SIZE[1], 0], 0, 'lid');
    });
    r.p = [0, 0.9, 0];
    settleWorld(r, 200);
    const baseAt = at(r.w, 'base').p;
    r.move([0, 0.2, 0], 100, false);
    for (let i = 0; i < 70; i += 1) r.tick(true);
    expect(r.g.held()).toEqual(['lid']);
    expect(r.w.attachedTo('base')).toBeNull();
    r.move([0, 0.9, 0], 100, true);
    expect(at(r.w, 'base').p[1]).toBeCloseTo(baseAt[1], 2); // the base stays resting
    expect(at(r.w, 'lid').p[1]).toBeGreaterThan(0.7);
  });

  it('PRT-003 an item above maxLoadKg is never captured and the pad reports it holds nothing', async () => {
    const r = await rig({ ...vacuum, maxLoadKg: 1.9 }, pickPlaceSetup);
    r.p = [-1, 0.9, 0];
    settleWorld(r);
    r.move([-1, 0.302, 0], 120, false);
    r.move([-1, 0.302, 0], 20, true);
    expect(r.g.held()).toEqual([]);
    expect(r.w.attachedTo('box')).toBeNull();
    expect(r.g.counts()).toEqual({ picked: 0, placed: 0, drops: 0 });
    const light = await rig({ ...vacuum, maxLoadKg: 2 }, pickPlaceSetup);
    light.p = [-1, 0.9, 0];
    settleWorld(light);
    light.move([-1, 0.302, 0], 120, false);
    light.move([-1, 0.302, 0], 3, true);
    expect(light.g.held()).toEqual(['box']); // the limit is inclusive
  });

  it('PRT-003 a gripper never holds more than maxItems', async () => {
    const layer = (w: PhysicsWorld) => {
      for (const [i, [x, z]] of (
        [
          [-0.205, -0.155],
          [0.205, -0.155],
          [-0.205, 0.155],
          [0.205, 0.155],
        ] as const
      ).entries())
        spawnItem(w, `b${i}`, 'item', BOX, 2, [x, 0, z], 0, 'box');
    };
    for (const [maxItems, expected] of [
      [4, 4],
      [3, 3],
    ] as const) {
      const r = await rig({ kind: 'clamp', maxLoadKg: 10, maxItems }, layer, [0.5, 0.4]);
      r.p = [0, 0.9, 0];
      settleWorld(r);
      r.move([0, 0.302, 0], 120, false);
      r.move([0, 0.302, 0], 70, true);
      expect(r.g.held().length).toBe(expected);
      expect(r.g.counts().picked).toBe(expected);
    }
  });

  it('PLT-007 a grip on a moving item misses', async () => {
    const r = await rig(
      vacuum,
      (w) => {
        w.addBody({ ...floor, id: 'belt', half: [4, 0.05, 0.5], position: [0, -0.05, 0] });
        w.addBelt({ id: 'belt1', bodyId: 'belt', axis: [1, 0, 0], accelMps2: 100 });
        w.setBeltTarget('belt1', 0.5);
        spawnItem(w, 'box', 'item', BOX, 2, [-1.5, 0, 0], 0, 'box');
      },
      PAD_HALF,
      false,
    );
    r.p = [0, 0.302, 0];
    for (let i = 0; i < 140; i += 1) r.tick(true);
    expect(at(r.w, 'box').p[0]).toBeGreaterThan(-1.3); // not yet under the pad, moving
    const speeds: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      r.tick(true);
      if (Math.abs(at(r.w, 'box').p[0]) < 0.3) speeds.push(at(r.w, 'box').v[0]);
    }
    expect(speeds.length).toBeGreaterThan(50); // it did pass under the pad
    expect(r.g.held()).toEqual([]);
    expect(r.g.counts().picked).toBe(0);
    for (const v of speeds) expect(v).toBeCloseTo(0.5, 1);
  });

  it('PLT-010 releasing onto a pallet counts placed, releasing 0.3 m above it counts a drop', async () => {
    const onPallet = await rig(vacuum, pickPlaceSetup);
    carryToPallet(onPallet, vacuum, 0.003);
    for (let i = 0; i < 80; i += 1) onPallet.tick(false);
    expect(onPallet.g.counts()).toEqual({ picked: 1, placed: 1, drops: 0 });

    const high = await rig(vacuum, pickPlaceSetup);
    carryToPallet(high, vacuum, 0.3);
    for (let i = 0; i < 600; i += 1) high.tick(false);
    expect(high.g.counts()).toEqual({ picked: 1, placed: 0, drops: 1 });
    expect(at(high.w, 'box').p[1] - 0.15).toBeCloseTo(PALLET_SIZE[1], 2); // it still landed on the pallet: a drop is about how it got there
  });

  it('PLT-010 a box that bounces off a pallet edge and falls to the floor is a drop and never also placed', async () => {
    const r = await rig(vacuum, pickPlaceSetup);
    carryToPallet(r, vacuum, 0.003);
    r.move([1.6 + 0.005, r.p[1], 0], 30, true); // centre just beyond the pallet edge (x = 1.6)
    for (let i = 0; i < 700; i += 1) r.tick(false);
    expect(r.g.counts()).toEqual({ picked: 1, placed: 0, drops: 1 });
    expect(at(r.w, 'box').p[1]).toBeLessThan(0.2); // on the floor
  });

  it('PLT-010 each item is counted once even if grabbed and released twice', async () => {
    const r = await rig(vacuum, pickPlaceSetup);
    carryToPallet(r, vacuum, 0.003);
    for (let i = 0; i < 80; i += 1) r.tick(false);
    expect(r.g.counts()).toEqual({ picked: 1, placed: 1, drops: 0 });
    r.move([1, 0.9, 0], 100, false);
    r.move([1, PALLET_SIZE[1] + 0.3 + 0.002, 0], 100, false);
    r.move([1, PALLET_SIZE[1] + 0.3 + 0.002, 0], 4, true);
    expect(r.g.held()).toEqual(['box']);
    r.move([1, PALLET_SIZE[1] + 0.3 + 0.002, 0], 4, false);
    for (let i = 0; i < 80; i += 1) r.tick(false);
    expect(r.g.counts()).toEqual({ picked: 2, placed: 2, drops: 0 });
  });

  it('PRT-008 gripFail captures nothing and keeps existing holds; dropLoad drops everything held at once and counts drops', async () => {
    const r = await rig(vacuum, pickPlaceSetup);
    r.p = [-1, 0.9, 0];
    settleWorld(r);
    r.move([-1, 0.302, 0], 120, false);
    r.move([-1, 0.302, 0], 3, true);
    r.g.act('gripFail');
    r.move([-1, 0.6, 0], 40, true);
    expect(r.g.held()).toEqual(['box']); // the existing hold stays
    expect(at(r.w, 'box').p[1]).toBeGreaterThan(0.4);
    r.g.act('dropLoad');
    expect(r.g.held()).toEqual([]);
    expect(r.w.attachedTo('box')).toBeNull();
    expect(r.g.counts()).toEqual({ picked: 1, placed: 0, drops: 1 });
    for (let i = 0; i < 800; i += 1) r.tick(true); // the grip stays on: the shed item is not re-captured
    expect(r.g.counts()).toEqual({ picked: 1, placed: 0, drops: 1 });

    const fail = await rig(vacuum, pickPlaceSetup);
    fail.g.act('gripFail');
    fail.p = [-1, 0.9, 0];
    settleWorld(fail);
    fail.move([-1, 0.302, 0], 120, false);
    fail.move([-1, 0.302, 0], 30, true);
    expect(fail.g.held()).toEqual([]);
    expect(fail.g.counts().picked).toBe(0);

    const again = await rig(vacuum, pickPlaceSetup); // dropLoad alone does not break later grips
    again.p = [-1, 0.9, 0];
    settleWorld(again);
    again.move([-1, 0.302, 0], 120, false);
    again.move([-1, 0.302, 0], 3, true);
    again.g.act('dropLoad');
    again.move([-1, 0.302, 0], 5, false);
    for (let i = 0; i < 700; i += 1) again.tick(false);
    again.move([-1, 0.302, 0], 3, true);
    expect(again.g.counts().picked).toBe(2);
  });

  it('PLT-006 a pick, carry and place cycle gives the same hash of poses and counts on three fresh worlds', async () => {
    const run = async () => {
      const r = await rig(vacuum, pickPlaceSetup);
      const poses: number[] = [];
      const orig = r.tick;
      r.tick = (grip) => {
        orig(grip);
        const b = at(r.w, 'box');
        poses.push(...b.p, ...b.q);
      };
      carryToPallet(r, vacuum, 0.003);
      for (let i = 0; i < 100; i += 1) r.tick(false);
      return createHash('sha256').update(new Float64Array(poses)).digest('hex') + JSON.stringify(r.g.counts());
    };
    const [a, b, c] = [await run(), await run(), await run()];
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(a.endsWith('{"picked":1,"placed":1,"drops":0}')).toBe(true);
  });

  it('PLT-008 a placed box stays at rest for 60 simulated seconds, with no drift above 0.001 m', async () => {
    const r = await rig(vacuum, pickPlaceSetup);
    carryToPallet(r, vacuum, 0.003);
    for (let i = 0; i < 60; i += 1) r.tick(false);
    expect(r.g.counts().placed).toBe(1);
    const start = at(r.w, 'box').p;
    let worst = 0;
    for (let i = 0; i < 12000; i += 1) {
      r.tick(false);
      const p = at(r.w, 'box').p;
      worst = Math.max(worst, Math.abs(p[0] - start[0]), Math.abs(p[1] - start[1]), Math.abs(p[2] - start[2]));
    }
    expect(worst).toBeLessThan(0.001);
    expect(r.g.counts()).toEqual({ picked: 1, placed: 1, drops: 0 });
  });

  it('PLT-007 an item removed while held is forgotten with no count and no error', async () => {
    const r = await rig(vacuum, pickPlaceSetup);
    r.p = [-1, 0.9, 0];
    settleWorld(r);
    r.move([-1, 0.302, 0], 120, false);
    r.move([-1, 0.302, 0], 3, true);
    expect(r.g.held()).toEqual(['box']);
    removeTrackedItem(r.w, 'box');
    expect(() => r.tick(true)).not.toThrow();
    expect(r.g.held()).toEqual([]);
    expect(r.g.counts()).toEqual({ picked: 1, placed: 0, drops: 0 });
    expect(() => r.tick(false)).not.toThrow();
    expect(r.g.counts()).toEqual({ picked: 1, placed: 0, drops: 0 });
  });

  it('PLT-016 update refuses a pad whose id is not a body of the world with a located message', async () => {
    const r = await rig(vacuum, pickPlaceSetup);
    const ghost: Pad = { id: 'ghost-pad', centre: [0, 1, 0], half: PAD_HALF };
    expect(() => r.g.update(true, ghost)).toThrow('gripper: pad ghost-pad is not a body of the world');
    expect(r.g.held()).toEqual([]);
  });
});
