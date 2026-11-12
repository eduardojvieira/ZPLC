import { describe, expect, it } from 'bun:test';

import { loadJolt } from './jolt';
import { BELT_SPEED_MPS, beltBox, palletStack, restSoak, type GateScene } from './scenes';
import { createWorld, type BodyState } from './world';

const SLOW = 120_000;

async function build(scene: GateScene) {
  return createWorld(await loadJolt(), scene);
}

function tiltDegrees(q: BodyState['q']): number {
  // Angle between the body's y axis and world up.
  const [x, , z] = q;
  const upY = 1 - 2 * (x * x + z * z);
  return (Math.acos(Math.min(1, Math.max(-1, upY))) * 180) / Math.PI;
}

function angleBetween(a: BodyState['q'], b: BodyState['q']): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}

describe('conveyor and stack (gate check 1)', () => {
  it('a box reaches belt speed and stops with the belt', async () => {
    const world = await build(beltBox());
    world.setBeltTarget('belt', BELT_SPEED_MPS);
    world.step(1500);
    let [box] = world.bodies();
    expect(Math.abs(box!.v[0] - 0.5)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(box!.p[2])).toBeLessThanOrEqual(0.005);
    world.step(1500);
    world.setBeltTarget('belt', 0);
    world.step(1500);
    [box] = world.bodies();
    expect(Math.hypot(...box!.v)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(box!.p[2])).toBeLessThanOrEqual(0.005);
    world.dispose();
  });

  it('a five-box stack survives a travelling pallet', async () => {
    const world = await build(palletStack());
    const before = world.bodies();
    const pallet0 = before.find((b) => b.id === 'pallet')!;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      world.setBeltTarget('belt', BELT_SPEED_MPS);
      world.step(2000);
      world.setBeltTarget('belt', 0);
      world.step(1000);
    }
    const after = world.bodies();
    const pallet1 = after.find((b) => b.id === 'pallet')!;
    expect(pallet1.p[0] - pallet0.p[0]).toBeGreaterThan(0.5);
    const boxes = after.filter((b) => b.id.startsWith('box'));
    expect(boxes.length).toBe(5);
    for (const box of boxes) {
      const start = before.find((b) => b.id === box.id)!;
      expect(Math.abs(box.p[0] - pallet1.p[0] - (start.p[0] - pallet0.p[0]))).toBeLessThanOrEqual(0.01);
      expect(Math.abs(box.p[2] - pallet1.p[2] - (start.p[2] - pallet0.p[2]))).toBeLessThanOrEqual(0.01);
      expect(tiltDegrees(box.q)).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < boxes.length; i += 1) expect(boxes[i]!.p[1]).toBeGreaterThan(boxes[i - 1]!.p[1]);
    world.dispose();
  }, SLOW);

  it('an item at rest stays at rest for ten simulated minutes', async () => {
    const world = await build(restSoak());
    world.step(1000);
    const start = world.bodies();
    for (let second = 1; second < 600; second += 1) {
      world.step(1000);
      for (const box of world.bodies()) expect(Math.hypot(...box.v)).toBeLessThanOrEqual(0.001);
    }
    for (const box of world.bodies()) {
      const first = start.find((b) => b.id === box.id)!;
      expect(Math.hypot(box.p[0] - first.p[0], box.p[1] - first.p[1], box.p[2] - first.p[2])).toBeLessThanOrEqual(0.001);
      expect(angleBetween(box.q, first.q)).toBeLessThanOrEqual(0.1);
    }
    world.dispose();
  }, SLOW);

  it('a box asleep on a stopped belt moves when the belt starts', async () => {
    const world = await build(beltBox());
    world.step(60_000);
    world.setBeltTarget('belt', BELT_SPEED_MPS);
    world.step(1500);
    const [box] = world.bodies();
    expect(Math.abs(box!.v[0] - 0.5)).toBeLessThanOrEqual(0.01);
    world.dispose();
  }, SLOW);
});
