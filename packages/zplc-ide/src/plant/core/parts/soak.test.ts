import { afterEach, describe, expect, it } from 'bun:test';
import type { ScenePart } from '../../contracts';
import { loadJolt } from '../jolt';
import { createWorld, type PhysicsWorld } from '../world';
import { conveyorParts } from './conveyors';
import { itemParts } from './items';

const defs = [...itemParts, ...conveyorParts];
const TOP = 0.45;
const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});
const part = (id: string, partId: string, position: [number, number, number], config: ScenePart['config'] = {}): ScenePart => ({
  id,
  part: partId,
  name: id,
  position,
  rotationYDeg: 0,
  config,
});
const tiltDeg = (q: readonly number[]) => (Math.acos(Math.min(1, 1 - 2 * (q[0]! ** 2 + q[2]! ** 2))) * 180) / Math.PI;

describe('rest soak', () => {
  it('PLT-008 an item at rest stays at rest for ten simulated minutes', async () => {
    const world = createWorld(await loadJolt());
    worlds.push(world);
    world.addBody({
      id: 'floor',
      kind: 'box',
      half: [10, 0.5, 5],
      position: [0, -0.5, 0],
      rotationYDeg: 0,
      massKg: 0,
      friction: 0.6,
      motion: 'static',
      layer: 'static',
    });
    // A stopped belt carrying a five-box stack on a pallet, a loose box beside it, and a box on the floor.
    const stack = [0, 1, 2, 3, 4].map((k) =>
      part(`s${k}`, 'box', [0, TOP + 0.144 + 0.2 * k + 0.002 * (k + 1), 0], { height: '0.2', mass: '5' }),
    );
    const scene = [
      part('belt', 'belt', [0, TOP, 0], { length: 4 }),
      part('pal', 'pallet', [0, TOP, 0]),
      ...stack,
      part('loose', 'box', [1.5, TOP, 0.1]),
      part('ground', 'box', [3, 0, 2]),
    ];
    for (const p of scene)
      defs
        .find((d) => d.id === p.part)!
        .runtime(p, () => 0.5)
        .build(world, p);
    const sample = () => new Map(world.bodies().map((b) => [b.id, b]));
    world.step(1000);
    const first = sample();
    expect(first.size).toBe(8);
    let drift = 0;
    let turn = 0;
    let speed = 0;
    const started = performance.now();
    for (let second = 2; second <= 600; second += 1) {
      world.step(1000);
      for (const [id, b] of sample()) {
        const ref = first.get(id)!;
        drift = Math.max(drift, Math.hypot(b.p[0] - ref.p[0], b.p[1] - ref.p[1], b.p[2] - ref.p[2]));
        turn = Math.max(
          turn,
          Math.abs(tiltDeg(b.q) - tiltDeg(ref.q)),
          Math.abs(((2 * Math.atan2(b.q[1], b.q[3]) - 2 * Math.atan2(ref.q[1], ref.q[3])) * 180) / Math.PI),
        );
        speed = Math.max(speed, Math.hypot(...b.v));
      }
    }
    console.log(`PLT-008 soak: ${world.timeMs} simulated ms in ${Math.round(performance.now() - started)} host ms`);
    expect(world.timeMs).toBe(600000);
    expect(drift).toBeLessThanOrEqual(0.001);
    expect(turn).toBeLessThanOrEqual(0.1);
    expect(speed).toBeLessThanOrEqual(0.001);
  }, 300000);
});
