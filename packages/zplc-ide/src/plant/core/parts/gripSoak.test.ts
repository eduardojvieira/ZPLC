import { afterEach, describe, expect, it } from 'bun:test';
import type { ScenePart } from '../../contracts';
import { loadJolt } from '../jolt';
import { createSupportTracker } from '../support';
import { createWorld, type PhysicsWorld } from '../world';
import { boxSize, itemParts, trackedItems, PALLET_SIZE, type PartRuntime } from './items';
import { manipulatorParts } from './manipulators';

const defs = [...itemParts, ...manipulatorParts];
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
const yawDeg = (q: readonly number[]) => (2 * Math.atan2(q[1]!, q[3]!) * 180) / Math.PI;

describe('gripper rest soak', () => {
  it('PLT-008 a pallet loaded by a gantry stays at rest for ten simulated minutes', async () => {
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
    const pickAt: [number, number][] = [
      [0.6, 0.4],
      [1.1, 0.4],
      [0.6, 0.9],
      [1.1, 0.9],
    ];
    const placeAt: [number, number][] = [
      [2.1, 0.4],
      [2.7, 0.4],
      [2.1, 0.8],
      [2.7, 0.8],
    ];
    const scene = [
      ...pickAt.map(([x, z], k) => part(`box${k}`, 'box', [x, 0, z], { height: '0.3', mass: '2' })),
      part('pallet1', 'pallet', [2.4, 0, 0.6]),
      part('gan1', 'gantry', [0, 0, 0], { variant: 'numeric', strokeXM: 3, strokeYM: 1.2, strokeZM: 1.2 }),
    ];
    const runtimes = scene.map((p) => {
      const rt: PartRuntime = defs.find((d) => d.id === p.part)!.runtime(p, () => 0.5);
      rt.build(world, p);
      return rt;
    });
    const gantry = runtimes[runtimes.length - 1]!;
    const tracker = createSupportTracker();
    const tick = (cmd: Record<string, boolean | number>) => {
      for (const r of runtimes) r.beforeStep(cmd);
      world.step(5);
      for (const r of runtimes) r.afterStep();
      const tracked = trackedItems(world);
      tracker.update(
        world.bodies().flatMap((b) => {
          const info = tracked.get(b.id);
          return info ? [{ id: b.id, kind: info.kind, tag: info.tag, size: info.size, p: b.p, v: b.v }] : [];
        }),
      );
    };
    const run = (ms: number, cmd: Record<string, boolean | number> = {}) => {
      for (let i = 0; i < ms / 5; i += 1) tick(cmd);
    };
    const goto = (x: number, y: number, z: number, grip: boolean) => {
      const cmd = { 'gan1.xSet': x, 'gan1.ySet': y, 'gan1.zSet': z, 'gan1.grip': grip };
      const near = (k: string, v: number) => Math.abs((gantry.sense()[`gan1.${k}`] as number) - v) < 0.001;
      for (let t = 0; t < 20000 && !(near('xPos', x) && near('yPos', y) && near('zPos', z)); t += 5) tick(cmd);
      run(100, cmd);
    };
    run(500);
    pickAt.forEach(([px, pz], k) => {
      const [tx, tz] = placeAt[k]!;
      const top = PALLET_SIZE[1] + boxSize(0.3)[1] + 0.016;
      goto(px, 1, pz, false);
      goto(px, 0.3, pz, false);
      goto(px, 0.3, pz, true);
      goto(px, 1, pz, true);
      goto(tx, 1, tz, true);
      goto(tx, top, tz, true);
      goto(tx, top, tz, false);
      goto(tx, 1, tz, false);
    });
    run(2000);
    expect(gantry.facts()).toMatchObject({ 'picked:gan1': 4, 'placed:gan1': 4, 'drops:gan1': 0 });
    expect(tracker.facts()['stacked:pallet:0']).toBe(4);

    const sample = () => new Map(world.bodies().map((b) => [b.id, b]));
    const first = sample();
    const stacked = tracker.facts()['stacked:pallet:0'];
    let drift = 0;
    let turn = 0;
    const started = performance.now();
    for (let second = 1; second <= 600; second += 1) {
      run(1000);
      for (const [id, b] of sample()) {
        if (!id.startsWith('box') && id !== 'pallet1') continue;
        const ref = first.get(id)!;
        drift = Math.max(drift, Math.hypot(b.p[0] - ref.p[0], b.p[1] - ref.p[1], b.p[2] - ref.p[2]));
        turn = Math.max(turn, Math.abs(tiltDeg(b.q) - tiltDeg(ref.q)), Math.abs(yawDeg(b.q) - yawDeg(ref.q)));
      }
      expect(tracker.facts()['stacked:pallet:0']).toBe(stacked);
    }
    console.log(`PLT-008 gantry soak: drift ${drift} m, turn ${turn} deg, ${Math.round(performance.now() - started)} host ms`);
    expect(drift).toBeLessThanOrEqual(0.001);
    expect(turn).toBeLessThanOrEqual(0.1);
  }, 300000);
});
