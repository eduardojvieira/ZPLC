import { afterEach, describe, expect, it } from 'bun:test';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { createWorld, type PhysicsWorld } from '../world';
import { conveyorParts } from './conveyors';
import { itemParts, trackedItems, type PartRuntime } from './items';
import { sourceParts } from './sources';

export const defs = [...itemParts, ...conveyorParts, ...sourceParts];
export const parts = createCatalogue(defs);

export const part = (
  id: string,
  partId: string,
  position: [number, number, number],
  config: ScenePart['config'] = {},
  rotationYDeg = 0,
): ScenePart => ({ id, part: partId, name: id.replace(/-/g, '_'), position, rotationYDeg, config });

/** A seeded generator for tests (the core hands one to every part runtime). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});

/** The minimal composition P4 will do: a floor with its top at y = 0, then every part in scene order. */
export async function plant(scene: ScenePart[], seed = 1) {
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
  const rng = mulberry32(seed);
  const runtimes: PartRuntime[] = scene.map((p) => {
    const rt = defs.find((d) => d.id === p.part)!.runtime(p, rng);
    rt.build(world, p);
    return rt;
  });
  let commands: Record<string, boolean | number> = {};
  return {
    world,
    runtimes,
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
    body: (id: string) => world.bodies().find((b) => b.id === id)!,
  };
}

export const tiltDeg = (q: readonly number[]) => (Math.acos(Math.min(1, Math.max(-1, 1 - 2 * (q[0]! ** 2 + q[2]! ** 2)))) * 180) / Math.PI;
export const yawDeg = (q: readonly number[]) => (2 * Math.atan2(q[1]!, q[3]!) * 180) / Math.PI;

const TOP = 0.45;
const belt = (config: ScenePart['config'] = {}, at: [number, number, number] = [0, TOP, 0]) =>
  part('belt-a', 'belt', at, { length: 4, ...config });
const box = (id: string, at: [number, number, number], config: ScenePart['config'] = {}) => part(id, 'box', at, config);

describe('transport parts', () => {
  it('PLT-007 a box pushed off a belt falls', async () => {
    const p = await plant([belt({ length: 2 }), box('b1', [0.6, TOP, 0])]);
    p.set({ belt_a: true, 'belt_a.run': true });
    p.run(2000);
    const b = p.body('b1');
    expect(b.p[0]).toBeGreaterThan(1.0); // carried past the end of the belt at x = 1
    expect(b.p[1]).toBeLessThan(0.25); // lying on the floor, well below the belt top (0.45)
  });

  it('PLT-007 items are carried, stopped and blocked by the physics', async () => {
    const p = await plant([belt(), box('b1', [0, TOP, 0])]);
    p.world.addBody({
      id: 'wall',
      kind: 'box',
      half: [0.05, 0.3, 0.4],
      position: [1.5, TOP + 0.3, 0],
      rotationYDeg: 0,
      massKg: 0,
      friction: 0.6,
      motion: 'static',
      layer: 'static',
    });
    p.set({ 'belt_a.run': true });
    p.run(1000);
    expect(p.body('b1').v[0]).toBeGreaterThan(0.45); // reaches belt speed 0.5 m/s
    p.run(5000);
    const b = p.body('b1');
    expect(Math.hypot(...b.v)).toBeLessThan(0.005); // blocked by the wall while the belt still runs
    expect(b.p[0]).toBeLessThan(1.5 - 0.05 + 0.001); // never through the wall
    expect(b.p[0]).toBeGreaterThan(1.2);
  });

  it('PLT-008 a five-box stack stays stacked while the pallet travels and while the belt starts and stops', async () => {
    const stack = [0, 1, 2, 3, 4].map((k) => box(`s${k}`, [-3, TOP + 0.144 + 0.2 * k + 0.002 * (k + 1), 0], { height: '0.2', mass: '5' }));
    const p = await plant([belt({ length: 8 }), part('pal', 'pallet', [-3, TOP, 0]), ...stack]);
    p.run(1000); // settle at rest
    const pal0 = p.body('pal').p;
    const rel = () => stack.map((s) => p.body(s.id).p.map((v, i) => v - p.body('pal').p[i]!));
    const start = rel();
    let worst = 0;
    let tilt = 0;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const on of [true, false]) {
        p.set({ 'belt_a.run': on });
        for (let i = 0; i < (on ? 400 : 200); i += 1) {
          p.run(5);
          const now = rel();
          now.forEach((r, k) => {
            worst = Math.max(worst, Math.abs(r[0]! - start[k]![0]!), Math.abs(r[2]! - start[k]![2]!));
            tilt = Math.max(tilt, tiltDeg(p.body(stack[k]!.id).q));
          });
        }
      }
    }
    expect(p.body('pal').p[0] - pal0[0]).toBeGreaterThan(1.5); // the pallet really travelled
    expect(worst).toBeLessThanOrEqual(0.01);
    expect(tilt).toBeLessThanOrEqual(1);
    const ys = stack.map((s) => p.body(s.id).p[1]);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys); // same order in y
  }, 60000);

  it('PRT-003 a belt honours its limits', async () => {
    const problems = validateScene({ schemaVersion: 1, name: 'x', cameras: [], parts: [belt({ speedMps: 1.5 })] }, parts);
    expect(problems.map((x) => x.path)).toEqual(['parts[0].config.speedMps']);
    expect(problems[0]!.message).toContain('1.5');
    expect(problems[0]!.message).toContain('1');

    const stalled = await plant([belt(), box('b1', [0, TOP, 0])]);
    stalled.runtimes[0]!.act('stall');
    stalled.set({ 'belt_a.run': true });
    stalled.run(3000);
    expect(Math.abs(stalled.body('b1').p[0])).toBeLessThan(0.001);

    const rev = await plant([belt({ allowReverse: true }), box('b1', [0, TOP, 0])]);
    expect(
      defs
        .find((d) => d.id === 'belt')!
        .signals(belt({ allowReverse: true }))
        .map((s) => s.name),
    ).toEqual(['belt_a.run', 'belt_a.runReverse']);
    expect(
      defs
        .find((d) => d.id === 'belt')!
        .signals(belt())
        .map((s) => s.name),
    ).toEqual(['belt_a.run']);
    rev.set({ 'belt_a.runReverse': true });
    rev.run(1500);
    expect(rev.body('b1').p[0]).toBeLessThan(-0.3);
    const noReverse = await plant([belt(), box('b1', [0, TOP, 0])]);
    noReverse.set({ 'belt_a.runReverse': true });
    noReverse.run(1500);
    expect(Math.abs(noReverse.body('b1').p[0])).toBeLessThan(0.001);
  });

  it('PRT-003 a jammed belt blocks its items', async () => {
    const p = await plant([belt(), box('b1', [-1, TOP, 0])]);
    p.runtimes[0]!.act('jam');
    p.set({ 'belt_a.run': true });
    p.run(6000);
    const x = p.body('b1').p[0];
    expect(x).toBeLessThan(0); // stopped short of the bar at x = 0
    expect(x).toBeGreaterThan(-0.4);
  });

  it('PRT-003 the emitter emits on the rising edge only and is repeatable with a seed', async () => {
    const em = (config: ScenePart['config'] = {}) => part('em', 'emitter', [-1.5, TOP, 0], { maxItems: 2, ...config });
    const p = await plant([belt(), em()]);
    const count = () => trackedItems(p.world).size;
    p.set({ em: true, 'em.emit': true });
    p.run(100);
    expect(count()).toBe(1); // held high: one item
    p.run(100);
    expect(count()).toBe(1);
    p.set({ 'em.emit': false });
    p.run(50);
    p.set({ 'em.emit': true });
    p.run(50);
    expect(count()).toBe(2);
    p.set({ 'em.emit': false });
    p.run(50);
    p.set({ 'em.emit': true });
    p.run(50);
    expect(count()).toBe(2); // maxItems caps it
    expect(p.runtimes[1]!.facts()).toEqual({ 'emitted:em': 2 });

    const trace = async (seed: number) => {
      const q = await plant([belt({ length: 8 }), em({ intervalMs: 500, maxItems: 5 })], seed);
      q.set({ 'belt_a.run': true });
      q.run(3000);
      return JSON.stringify(q.world.bodies().map((b) => [b.id, b.p]));
    };
    expect(await trace(7)).toBe(await trace(7));
    expect(await trace(7)).not.toBe(await trace(8));
  });

  it('PRT-003 the remover takes items in its volume and counts them', async () => {
    const rm = part('rm', 'remover', [1.5, TOP + 0.3, 0], { width: 0.6, height: 0.6, depth: 0.6 });
    const p = await plant([belt(), box('b1', [0, TOP, 0]), rm]);
    p.set({ 'belt_a.run': true });
    p.run(4000);
    expect(p.world.bodies().some((b) => b.id === 'b1')).toBe(false);
    expect(trackedItems(p.world).size).toBe(0);
    expect(p.runtimes[2]!.facts()).toEqual({ 'delivered:rm': 1 });
  });

  it('PRT-003 the curved conveyor turns a box through ninety degrees at catalogue speed', async () => {
    const r = 1.5;
    const p = await plant([
      part('feed', 'belt', [-1, TOP, 0], { length: 2 }),
      part('arc', 'curved', [0, TOP, 0], { radius: r }),
      part('out', 'belt', [r, TOP, r + 1], { length: 2 }, -90),
      box('b1', [-1.5, TOP, 0]),
    ]);
    p.set({ 'feed.run': true, 'arc.run': true, 'out.run': true });
    p.run(10000);
    const b = p.body('b1');
    // A box is symmetric under 180 degrees, so the long axis is compared modulo 180: from +x to +z is 90 degrees.
    expect(Math.abs((((yawDeg(b.q) % 180) + 180) % 180) - 90)).toBeLessThanOrEqual(5);
    expect(b.p[1]).toBeGreaterThan(0.45); // still on the belts
    expect(b.p[2]).toBeGreaterThan(r); // past the arc, on the exit belt
    expect(Math.abs(b.p[0] - r)).toBeLessThan(0.3); // on the exit belt's centreline
  });

  it('PRT-003 a box rides the curved conveyor around the arc and stays on the belts', async () => {
    const r = 1.5;
    const p = await plant([
      part('feed', 'belt', [-1, TOP, 0], { length: 2 }),
      part('arc', 'curved', [0, TOP, 0], { radius: r }),
      part('out', 'belt', [r, TOP, r + 1], { length: 2 }, -90),
      box('b1', [-1.5, TOP, 0]),
    ]);
    p.set({ 'feed.run': true, 'arc.run': true, 'out.run': true });
    p.run(10000);
    const b = p.body('b1');
    expect(b.p[1]).toBeGreaterThan(0.45);
    expect(b.p[2]).toBeGreaterThan(r + 0.5); // carried round the quarter turn onto the exit belt
    expect(Math.abs(b.p[0] - r)).toBeLessThan(0.3);
    expect(Math.abs((((yawDeg(b.q) % 180) + 180) % 180) - 90)).toBeLessThanOrEqual(15); // turned most of the way
  });

  it('PRT-009 every item and belt has generated geometry data and no asset path', async () => {
    const scene = [
      belt(),
      part('rol', 'roller', [0, TOP, 2]),
      part('arc', 'curved', [3, TOP, 0]),
      part('em', 'emitter', [0, TOP, 0]),
      part('rm', 'remover', [5, 1, 0]),
      box('bx', [0, TOP, 3]),
      part('pl', 'pallet', [0, TOP, 4]),
    ];
    const text = JSON.stringify([
      defs,
      scene.map((p) => [defs.find((d) => d.id === p.part)!.signals(p), defs.find((d) => d.id === p.part)!.snapPoints(p)]),
    ]);
    expect(text).not.toMatch(/\.(glb|gltf|png|webp|jpg)\b/i);
    const p = await plant(scene);
    for (const view of p.runtimes.flatMap((r) => r.views())) {
      expect(view.pose.size.length).toBe(3);
      expect(view.pose.size.every((s) => Number.isFinite(s) && s > 0)).toBe(true);
    }
    expect(p.runtimes.flatMap((r) => r.views()).length).toBe(scene.length);
  });
});
