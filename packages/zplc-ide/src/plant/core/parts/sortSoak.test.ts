import { afterEach, describe, expect, it } from 'bun:test';
import type { ScenePart } from '../../contracts';
import { loadJolt } from '../jolt';
import { createWorld, type PhysicsWorld } from '../world';
import { chainParts } from './chainTransfer';
import { itemParts, type PartRuntime } from './items';
import { turntableParts } from './turntable';

const defs = [...itemParts, ...turntableParts, ...chainParts];
const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});
const TOP = 0.45;
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

describe('kinematic surface rest soak', () => {
  it(
    'PLT-008 a box at rest on a turntable at each angle and on a raised chain transfer stays at rest for ten simulated ' + 'minutes',
    async () => {
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
      const scene = [
        part('ttCentre', 'turntable', [-6, TOP, 0]),
        part('ttLeft', 'turntable', [-3, TOP, 0]),
        part('ttRight', 'turntable', [0, TOP, 0]),
        part('chain', 'chain-transfer', [3, TOP, 0]),
        ...['boxC', 'boxL', 'boxR', 'boxChain'].map((id, k) => part(id, 'box', [-6 + 3 * k + 0.1, TOP, 0.05], { height: '0.2' })),
      ];
      const runtimes: PartRuntime[] = scene.map((p) => {
        const rt = defs.find((d) => d.id === p.part)!.runtime(p, () => 0.5);
        rt.build(world, p);
        return rt;
      });
      // The tables turn to their angle and the chain transfer lifts; then every command is held and the world is left alone.
      const commands = { 'ttLeft.toLeft': true, 'ttRight.toRight': true, 'chain.lift': true };
      const run = (ms: number) => {
        for (let i = 0; i < ms / 5; i += 1) {
          for (const r of runtimes) r.beforeStep(commands);
          world.step(5);
          for (const r of runtimes) r.afterStep();
        }
      };
      run(5000);
      const sensed = Object.assign({}, ...runtimes.map((r) => r.sense()));
      expect(sensed).toMatchObject({ 'ttCentre.atCentre': true, 'ttLeft.atLeft': true, 'ttRight.atRight': true, 'chain.raised': true });

      const boxes = ['boxC', 'boxL', 'boxR', 'boxChain'];
      const sample = () => new Map(world.bodies().map((b) => [b.id, b]));
      const first = sample();
      // the boxes ride their surface: on top of it, and turned with the table (a box on the centre table does not turn)
      for (const id of boxes) expect(first.get(id)!.p[1]).toBeGreaterThan(TOP + 0.05);
      expect(Math.abs(yawDeg(first.get('boxC')!.q))).toBeLessThan(5);
      expect(Math.abs(yawDeg(first.get('boxL')!.q))).toBeGreaterThan(80);
      expect(Math.abs(yawDeg(first.get('boxR')!.q))).toBeGreaterThan(80);
      let drift = 0;
      let turn = 0;
      const started = performance.now();
      for (let second = 1; second <= 600; second += 1) {
        run(1000);
        for (const [id, b] of sample()) {
          if (!boxes.includes(id)) continue;
          const ref = first.get(id)!;
          drift = Math.max(drift, Math.hypot(b.p[0] - ref.p[0], b.p[1] - ref.p[1], b.p[2] - ref.p[2]));
          turn = Math.max(turn, Math.abs(tiltDeg(b.q) - tiltDeg(ref.q)), Math.abs(yawDeg(b.q) - yawDeg(ref.q)));
        }
      }
      console.log(`PLT-008 sorting soak: drift ${drift} m, turn ${turn} deg, ${Math.round(performance.now() - started)} host ms`);
      expect(drift).toBeLessThanOrEqual(0.001);
      expect(turn).toBeLessThanOrEqual(0.1);
    },
    300000,
  );
});
