import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { SCENE_SCHEMA_VERSION } from '../sceneSchema';
import { createWorld, type PhysicsWorld } from '../world';
import { chainParts } from './chainTransfer';
import { conveyorParts } from './conveyors';
import { itemParts, type PartRuntime } from './items';

const defs = [...itemParts, ...conveyorParts, ...chainParts];
const catalogue = createCatalogue(defs);
const TOP = 0.45;
const LIFT = 0.05;

const part = (id: string, partId: string, position: [number, number, number], config: ScenePart['config'] = {}): ScenePart => ({
  id,
  part: partId,
  name: id,
  position,
  rotationYDeg: 0,
  config,
});

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});

/** A floor, then every part in scene order, stepped the way the core steps a plant. */
async function plant(scene: ScenePart[]) {
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
  const runtimes: PartRuntime[] = scene.map((p) => {
    const rt = defs.find((d) => d.id === p.part)!.runtime(p, () => 0.5);
    rt.build(world, p);
    return rt;
  });
  let commands: Record<string, boolean | number> = {};
  const body = (id: string) => world.bodies().find((b) => b.id === id)!;
  return {
    world,
    runtimes,
    body,
    set(c: Record<string, boolean | number>) {
      commands = c;
    },
    run(ms: number) {
      for (let i = 0; i < ms / 5; i += 1) {
        for (const r of runtimes) r.beforeStep(commands);
        world.step(5);
        for (const r of runtimes) r.afterStep();
      }
    },
    sense: () => runtimes.reduce<Record<string, boolean | number>>((acc, r) => ({ ...acc, ...r.sense() }), {}),
  };
}

const chain = (config: ScenePart['config'] = {}) => part('chain', 'chain-transfer', [0, TOP, 0], { ...config });
const box = (at: [number, number, number]) => part('b1', 'box', at, { height: '0.2' });
const feeder = (id: string, x: number) => part(id, 'belt', [x, TOP, 0], { length: 4 });

describe('chain transfer', () => {
  it('PLT-007 a lowered chain transfer carries a box along +x like a belt and passes it to the next belt', async () => {
    const p = await plant([feeder('in', -2.4), chain(), feeder('out', 2.4), box([-1.5, TOP, 0])]);
    p.set({ in: true, 'in.run': true, 'chain.run': true, 'out.run': true });
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 1200; i += 1) {
      p.run(5);
      const b = p.body('b1');
      if (b.p[0] > -1.2 && b.p[0] < 2) {
        lo = Math.min(lo, b.p[1]);
        hi = Math.max(hi, b.p[1]);
      }
    }
    expect(p.body('b1').p[0]).toBeGreaterThan(1.3); // crossed both joints (6 s at 0.5 m/s)
    expect(hi - lo).toBeLessThan(0.01); // no step or jump at the joints
    expect(Math.abs(p.body('b1').p[2])).toBeLessThan(0.02);
  });

  it('PLT-007 a raised chain transfer moves a box to the right with moveRight and to the left with moveLeft', async () => {
    const p = await plant([chain({ widthM: 0.8 }), box([0, TOP, 0])]);
    p.set({ 'chain.lift': true });
    p.run(600);
    expect(p.sense()['chain.raised']).toBe(true);
    p.set({ 'chain.lift': true, 'chain.moveRight': true });
    p.run(600);
    p.set({ 'chain.lift': true });
    p.run(1500);
    const right = p.body('b1').p;
    expect(right[2]).toBeGreaterThan(0.1); // right is +z
    expect(Math.abs(right[0])).toBeLessThan(0.02);
    p.set({ 'chain.lift': true, 'chain.moveLeft': true });
    p.run(1000);
    expect(p.body('b1').p[2]).toBeLessThan(right[2] - 0.2);
    expect(Math.abs(p.body('b1').p[0])).toBeLessThan(0.02);
  });

  it('PRT-003 the lift takes 400 ms and raised and lowered report the limits', async () => {
    const p = await plant([chain()]);
    expect(p.sense()).toEqual({ 'chain.raised': false, 'chain.lowered': true });
    p.set({ 'chain.lift': true });
    p.run(395);
    expect(p.sense()).toEqual({ 'chain.raised': false, 'chain.lowered': false });
    p.run(5);
    expect(p.sense()).toEqual({ 'chain.raised': true, 'chain.lowered': false });
    expect(p.body('chain').p[1]).toBeCloseTo(TOP - 0.05 + LIFT, 6);
    p.set({});
    p.run(395);
    expect(p.sense()['chain.lowered']).toBe(false);
    p.run(5);
    expect(p.sense()).toEqual({ 'chain.raised': false, 'chain.lowered': true });
    expect(p.body('chain').p[1]).toBeCloseTo(TOP - 0.05, 6);
  });

  it('PRT-003 the surface switches axis only after it has stopped, and a command pair in conflict does nothing', async () => {
    const p = await plant([chain({ allowReverse: true, lengthM: 1.6 }), box([0, TOP, 0])]);
    const switches: number[] = [];
    const real = p.world.setBeltAxis.bind(p.world);
    p.world.setBeltAxis = (id, axis) => {
      switches.push(p.world.beltSpeed(id));
      real(id, axis);
    };
    // run with lift: nothing moves, the lift holds
    p.set({ 'chain.run': true, 'chain.lift': true });
    p.run(1000);
    expect(p.sense()).toEqual({ 'chain.raised': false, 'chain.lowered': true });
    expect(p.world.beltSpeed('chain')).toBe(0);
    expect(Math.abs(p.body('b1').p[0])).toBeLessThan(0.01);
    // run with runReverse, moveLeft with moveRight: nothing moves
    p.set({ 'chain.run': true, 'chain.runReverse': true });
    p.run(500);
    expect(p.world.beltSpeed('chain')).toBe(0);
    // run, then lift while the surface is still moving, then moveRight: the surface stops before it changes axis
    p.set({ 'chain.run': true });
    p.run(500);
    expect(p.world.beltSpeed('chain')).toBeGreaterThan(0.4);
    p.set({ 'chain.lift': true });
    p.run(400);
    p.set({ 'chain.lift': true, 'chain.moveRight': true, 'chain.moveLeft': true });
    p.run(1000);
    expect(p.world.beltSpeed('chain')).toBe(0);
    const z0 = p.body('b1').p[2];
    p.set({ 'chain.lift': true, 'chain.moveRight': true });
    p.run(1500);
    expect(p.body('b1').p[2]).toBeGreaterThan(z0 + 0.1);
    expect(switches.length).toBeGreaterThan(0);
    expect(switches.every((s) => s === 0)).toBe(true);
  });

  it('PLT-008 a box at rest on a raised module stays at rest for 60 simulated seconds without drift above 0.001 m', async () => {
    const p = await plant([chain(), box([0, TOP, 0])]);
    p.set({ 'chain.lift': true });
    p.run(1500);
    const at = [...p.body('b1').p];
    for (let s = 0; s < 60; s += 1) {
      p.run(1000);
      const now = p.body('b1').p;
      expect(Math.hypot(now[0] - at[0]!, now[1] - at[1]!, now[2] - at[2]!)).toBeLessThan(0.001);
    }
  });

  it(
    'PRT-008 liftStuck freezes the lift, stall stops the surface, jam blocks the box, an unknown action throws a located ' + 'message',
    async () => {
      const stuck = await plant([chain()]);
      stuck.set({ 'chain.lift': true });
      stuck.run(200);
      stuck.runtimes[0]!.act('liftStuck');
      stuck.run(1000);
      expect(stuck.sense()).toEqual({ 'chain.raised': false, 'chain.lowered': false });
      stuck.set({});
      stuck.run(1000);
      expect(stuck.sense()['chain.lowered']).toBe(false);

      const stall = await plant([chain(), box([0, TOP, 0])]);
      stall.set({ 'chain.run': true });
      stall.run(500);
      stall.runtimes[0]!.act('stall');
      stall.run(1000);
      expect(stall.world.beltSpeed('chain')).toBe(0);
      const x = stall.body('b1').p[0];
      stall.run(1000);
      expect(Math.abs(stall.body('b1').p[0] - x)).toBeLessThan(0.002);

      const jam = await plant([chain({ lengthM: 1.2 }), box([-0.4, TOP, 0])]);
      jam.runtimes[0]!.act('jam');
      jam.set({ 'chain.run': true });
      jam.run(4000);
      expect(jam.body('b1').p[0]).toBeLessThan(-0.19); // stopped by the bar at x = 0, not carried across
      expect(() => jam.runtimes[0]!.act('explode')).toThrow('part "chain" has no action "explode"');
    },
  );

  it('PRT-003 settings outside their limits are refused with a located message', () => {
    const scene = (config: ScenePart['config']) => ({ schemaVersion: 1, name: 't', cameras: [], parts: [chain(config)] });
    expect(validateScene(scene({}), catalogue)).toEqual([]);
    for (const key of ['widthM', 'lengthM', 'liftM', 'liftTravelMs', 'speedMps'])
      expect(validateScene(scene({ [key]: 99999 }), catalogue)[0]?.path).toBe(`parts[0].config.${key}`);
  });

  it('PRT-002 names and documentation in both languages', () => {
    const def = chainParts[0]!;
    expect(def.id).toBe('chain-transfer');
    expect(def.family).toBe('conveyors');
    expect(def.names.en).toBe('Chain transfer');
    expect(def.names.es).not.toBe(def.names.en);
    expect(def.doc.en.length).toBeGreaterThan(40);
    expect(def.doc.es.length).toBeGreaterThan(40);
    expect(def.doc.es).not.toBe(def.doc.en);
    expect(def.signals(chain({ allowReverse: true })).map((s) => s.name)).toEqual([
      'chain.lift',
      'chain.run',
      'chain.runReverse',
      'chain.moveRight',
      'chain.moveLeft',
      'chain.raised',
      'chain.lowered',
    ]);
    expect([...def.actions]).toEqual(['liftStuck', 'stall', 'jam']);
  });

  it('PRT-010 adding the chain transfer changes no scene schema version', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
    expect(validateScene({ schemaVersion: 1, name: 'x', cameras: [], parts: [chain()] }, catalogue)).toEqual([]);
  });

  it('PRT-007 the snap points are in and out', () => {
    const snaps = chainParts[0]!.snapPoints(chain({ lengthM: 1 }));
    expect(snaps.map((s) => s.name)).toEqual(['in', 'out']);
    expect(snaps[0]!.position).toEqual([-0.5, 0, 0]);
    expect(snaps[1]!.position).toEqual([0.5, 0, 0]);
    expect(snaps[1]!.accepts).toContain('belt');
  });

  it('PLT-006 no Math function beyond abs, min, max, round and floor and an identical pose sequence on three runs', async () => {
    // The runtime's own code (not the physics engine) must not reach for libm, a clock or a random source.
    const forbidden = ['sqrt', 'pow', 'exp', 'log', 'sin', 'cos', 'tan', 'atan2', 'hypot', 'cbrt', 'random'] as const;
    const math = Math as unknown as Record<string, unknown>;
    const saved = new Map<string, unknown>(forbidden.map((k) => [k, math[k]]));
    const guarded = <T>(fn: () => T): T => {
      for (const k of forbidden)
        math[k] = () => {
          throw new Error(`Math.${k} used by the chain transfer`);
        };
      try {
        return fn();
      } finally {
        for (const [k, v] of saved) math[k] = v;
      }
    };
    const guard = (rt: PartRuntime): PartRuntime => ({
      ...rt,
      beforeStep: (c) => guarded(() => rt.beforeStep(c)),
      views: () => guarded(() => rt.views()),
      sense: () => guarded(() => rt.sense()),
    });
    const trace = async () => {
      const p = await plant([chain({ allowReverse: true }), box([0, TOP, 0])]);
      p.runtimes[0] = guard(p.runtimes[0]!);
      const h = createHash('sha256');
      const script: Array<Record<string, boolean>> = [
        { 'chain.run': true },
        { 'chain.lift': true },
        { 'chain.lift': true, 'chain.moveRight': true },
        {},
        { 'chain.runReverse': true },
      ];
      for (const c of script) {
        p.set(c);
        for (let i = 0; i < 100; i += 1) {
          p.run(5);
          p.runtimes[0]!.views();
          h.update(JSON.stringify([p.body('chain').p, p.body('b1').p, p.body('b1').q]));
        }
      }
      return h.digest('hex');
    };
    const [a, b, c] = [await trace(), await trace(), await trace()];
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
});
