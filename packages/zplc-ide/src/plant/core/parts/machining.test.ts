import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { SCENE_SCHEMA_VERSION } from '../sceneSchema';
import { createWorld, type PhysicsWorld } from '../world';
import { conveyorParts } from './conveyors';
import { itemParts, trackedItems, type PartRuntime } from './items';
import { machiningParts } from './machining';

const defs = [...itemParts, ...conveyorParts, ...machiningParts];
const catalogue = createCatalogue(defs);
const def = machiningParts[0]!;
const TOP = 0.45;

const part = (id: string, partId: string, position: [number, number, number], config: ScenePart['config'] = {}): ScenePart => ({
  id,
  part: partId,
  name: id.replace(/-/g, '_'),
  position,
  rotationYDeg: 0,
  config,
});
const machine = (config: ScenePart['config'] = {}) => part('mc', 'machining-centre', [0, TOP, 0], { cycleMs: 1000, ...config });
const infeed = () => part('inb', 'belt', [-1, TOP, 0], { length: 1 }); // ends where the chamber starts
const blank = (id: string, x: number, colour = 'red') => part(id, 'workpiece', [x, TOP, 0], { colour });
const box = (id: string, x: number) => part(id, 'box', [x, TOP, 0], { height: 0.2 });

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});

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
  const mc = runtimes[scene.findIndex((p) => p.part === 'machining-centre')]!;
  let commands: Record<string, boolean | number> = {};
  return {
    world,
    mc,
    set(c: Record<string, boolean>) {
      commands = Object.fromEntries(Object.entries(c).map(([k, v]) => [k.includes('.') ? k : `mc.${k}`, v]));
    },
    run(ms: number, each?: () => void) {
      for (let i = 0; i < ms / 5; i += 1) {
        for (const rt of runtimes) rt.beforeStep(commands);
        world.step(5);
        for (const rt of runtimes) rt.afterStep();
        each?.();
      }
    },
    sense: () => mc.sense(),
    facts: () => mc.facts(),
    body: (id: string) => world.bodies().find((b) => b.id === id),
    tag: (id: string) => trackedItems(world).get(id)?.tag,
    products: () => world.bodies().filter((b) => b.id.startsWith('mc-p')),
  };
}
type Rig = Awaited<ReturnType<typeof plant>>;

/** Feeds the blank to rest inside the chamber with the belt stopped, and checks it is there. */
async function loaded(config: ScenePart['config'] = {}): Promise<Rig> {
  const r = await plant([machine(config), blank('w1', -0.3)]);
  r.set({ feed: true });
  r.run(600);
  r.set({});
  r.run(600);
  return r;
}

describe('machining centre', () => {
  it('PRT-003 a workpiece fed into the chamber stops at rest and ready reads TRUE', async () => {
    const r = await plant([machine(), blank('w1', -0.3)]);
    expect(r.sense()['mc.ready']).toBe(false);
    r.set({ feed: true });
    r.run(600);
    expect(r.sense()['mc.ready']).toBe(false); // it is moving
    expect(r.body('w1')!.p[0]).toBeGreaterThan(-0.3);
    r.set({});
    r.run(600);
    const x = r.body('w1')!.p[0];
    expect(Math.abs(x)).toBeLessThan(0.5);
    expect(r.sense()).toEqual({ 'mc.ready': true, 'mc.busy': false, 'mc.done': false, 'mc.doorClosed': false });
    expect(r.facts()).toEqual({ 'produced:mc': 0, 'misfires:mc': 0 });
  });

  it('PLT-007 start closes the doors, the belt holds, and after cycleMs the blank is replaced by one lid and done reads TRUE', async () => {
    const r = await loaded();
    const at = r.body('w1')!.p[0];
    r.set({ feed: true, start: true });
    r.run(500);
    expect(r.sense()).toEqual({ 'mc.ready': false, 'mc.busy': true, 'mc.done': false, 'mc.doorClosed': true });
    expect(Math.abs(r.body('w1')!.p[0] - at)).toBeLessThan(0.01); // feed is on, the belt holds
    const views = r.mc.views();
    expect(views.map((v) => v.part)).toEqual(['machining-centre', 'machining-door', 'machining-door']);
    expect(views[0]!.state.busy).toBe(true);
    expect(String(views[0]!.state.text)).toMatch(/^busy \d\.\d s$/);
    expect(views[1]!.pose.p[1]).toBeGreaterThan(TOP); // the doors stand over the belt
    r.run(600);
    expect(r.body('w1')).toBeUndefined();
    expect(r.products().length).toBe(1);
    const p = r.products()[0]!;
    expect(r.tag(p.id)).toBe('lid');
    expect(Math.abs(p.p[0])).toBeLessThan(0.01);
    expect(Math.abs(p.p[2])).toBeLessThan(0.01);
    expect(p.p[1]).toBeCloseTo(TOP + 0.02, 1); // a lid 0.04 m high rests on the belt
    expect(r.sense()['mc.done']).toBe(true);
    expect(r.sense()['mc.busy']).toBe(false);
    r.run(500);
    expect(r.sense()['mc.doorClosed']).toBe(false);
    expect(r.sense()['mc.done']).toBe(true); // the product is still in the chamber
  });

  it('PLT-007 product base makes a base, and the cycle takes cycleMs of plant time', async () => {
    const r = await loaded({ product: 'base', cycleMs: 2000 });
    r.set({ start: true });
    r.run(1900);
    expect(r.sense()['mc.busy']).toBe(true);
    r.run(200);
    expect(r.sense()['mc.busy']).toBe(false);
    expect(r.tag(r.products()[0]!.id)).toBe('base');
    expect(r.products()[0]!.p[1]).toBeCloseTo(TOP + 0.075, 1);
  });

  it('PLT-010 produced counts one per finished cycle and the body count is unchanged by the swap', async () => {
    const r = await loaded();
    const before = r.world.bodies().length;
    r.set({ start: true });
    r.run(1100);
    expect(r.world.bodies().length).toBe(before);
    expect(trackedItems(r.world).size).toBe(1);
    expect(r.facts()['produced:mc']).toBe(1);
    // the product leaves, a second blank enters, a second cycle counts a second time
    r.set({ feed: true });
    r.run(2500);
    expect(r.sense()['mc.done']).toBe(false);
    expect(r.facts()['produced:mc']).toBe(1);
  });

  it('PLT-007 a second blank waits at the closed door and enters after the doors open', async () => {
    const r = await plant([machine(), infeed(), blank('w1', -0.3), blank('w2', -0.9)]);
    r.set({ feed: true });
    r.run(600);
    r.set({});
    r.run(600);
    r.set({ start: true, feed: true, 'inb.run': true });
    r.run(800);
    const waiting = r.body('w2')!.p[0];
    expect(r.sense()['mc.busy']).toBe(true);
    expect(waiting).toBeLessThan(-0.55); // stopped by the closed door, outside the chamber
    r.run(200);
    expect(r.body('w2')!.p[0]).toBeLessThan(-0.55);
    r.run(2500); // the cycle ends, the doors lower, the lid leaves, the second blank enters
    expect(r.sense()['mc.doorClosed']).toBe(false);
    expect(r.sense()['mc.done']).toBe(false);
    expect(r.body('w2')!.p[0]).toBeGreaterThan(-0.45);
    expect(r.facts()['produced:mc']).toBe(1);
  });

  it(
    'PLT-010 a start with no blank, a box in the chamber, or two blanks does nothing but add one to misfires per rising ' + 'edge',
    async () => {
      const edges = async (r: Rig) => {
        r.set({ start: true });
        r.run(200); // held: one edge
        r.set({});
        r.run(20);
        r.set({ start: true });
        r.run(20); // a second edge
        return { misfires: r.facts()['misfires:mc'], produced: r.facts()['produced:mc'], items: trackedItems(r.world).size };
      };
      const empty = await plant([machine()]);
      expect(await edges(empty)).toEqual({ misfires: 2, produced: 0, items: 0 });
      expect(empty.sense()['mc.busy']).toBe(false);
      const withBox = await plant([machine(), box('b1', 0)]);
      withBox.run(600);
      expect(withBox.sense()['mc.ready']).toBe(false);
      expect(await edges(withBox)).toEqual({ misfires: 2, produced: 0, items: 1 });
      expect(withBox.sense()['mc.doorClosed']).toBe(false);
      const two = await plant([machine(), blank('w1', -0.25), blank('w2', 0.25)]);
      two.run(600);
      expect(two.sense()['mc.ready']).toBe(false);
      expect(await edges(two)).toEqual({ misfires: 2, produced: 0, items: 2 });
      expect(two.body('w1')).toBeDefined();
      expect(two.body('w2')).toBeDefined();
      // a blank next to a box is also not ready, and a start while busy is a misfire too
      const r = await loaded();
      r.set({ start: true });
      r.run(100);
      r.set({});
      r.run(10);
      r.set({ start: true });
      r.run(10);
      expect(r.facts()['misfires:mc']).toBe(1);
      expect(r.sense()['mc.busy']).toBe(true);
    },
  );

  it(
    'PRT-008 doorStuck makes every start a misfire, cycleSlow doubles the cycle, readyStuckOff hides ready, stall stops the ' + 'belt',
    async () => {
      const stuck = await loaded();
      stuck.mc.act('doorStuck');
      stuck.set({ start: true });
      stuck.run(300);
      expect(stuck.facts()).toEqual({ 'produced:mc': 0, 'misfires:mc': 1 });
      expect(stuck.sense()['mc.busy']).toBe(false);
      expect(stuck.sense()['mc.doorClosed']).toBe(false);

      const slow = await loaded({ cycleMs: 1000 });
      slow.mc.act('cycleSlow');
      slow.set({ start: true });
      slow.run(1500);
      expect(slow.sense()['mc.busy']).toBe(true);
      slow.run(600);
      expect(slow.sense()['mc.busy']).toBe(false);
      expect(slow.facts()['produced:mc']).toBe(1);

      const off = await loaded();
      expect(off.sense()['mc.ready']).toBe(true);
      off.mc.act('readyStuckOff');
      off.run(20);
      expect(off.sense()['mc.ready']).toBe(false);
      off.set({ start: true });
      off.run(100);
      expect(off.facts()['misfires:mc']).toBe(1); // the program sees no ready, and a start is refused

      const stalled = await plant([machine(), blank('w1', -0.3)]);
      stalled.mc.act('stall');
      stalled.set({ feed: true });
      stalled.run(1000);
      expect(stalled.body('w1')!.p[0]).toBeCloseTo(-0.3, 1);

      expect(() => stuck.mc.act('melt')).toThrow('part "mc" has no action "melt"');
      expect(def.actions).toEqual(['doorStuck', 'cycleSlow', 'readyStuckOff', 'stall']);
    },
  );

  it('PRT-003 settings outside their limits and an unknown product are refused with a located message', () => {
    const scene = (config: ScenePart['config']) => ({
      schemaVersion: 1,
      name: 'x',
      cameras: [],
      parts: [part('mc', 'machining-centre', [0, TOP, 0], config)],
    });
    const bads: ScenePart['config'][] = [
      { product: 'gear' },
      { cycleMs: 500 },
      { cycleMs: 31000 },
      { lengthM: 0.5 },
      { lengthM: 1.5 },
      { widthM: 0.4 },
      { widthM: 0.9 },
      { speedMps: 0.1 },
      { speedMps: 1.5 },
    ];
    for (const bad of bads) {
      const problems = validateScene(scene(bad), catalogue);
      expect(problems[0]?.path).toBe(`parts[0].config.${Object.keys(bad)[0]}`);
    }
    expect(validateScene(scene({}), catalogue)).toEqual([]);
    expect(validateScene(scene({ product: 'base', cycleMs: 30000 }), catalogue)).toEqual([]);
  });

  it('PRT-002 names and documentation in both languages', () => {
    expect(def.names).toEqual({ en: 'Machining centre', es: 'Centro de mecanizado' });
    for (const lang of ['en', 'es'] as const) {
      expect(def.doc[lang].length).toBeGreaterThan(300);
      expect(def.doc[lang]).toContain('start');
      expect(def.doc[lang]).toContain('misfires');
    }
    expect(def.doc.en).toContain('model event');
    expect(def.doc.es).toContain('evento del modelo');
    expect(def.doc.es).not.toMatch(/\b(puedes|tú|tu)\b/);
    expect(def.family).toBe('stations');
    expect(def.signals(machine()).map((s) => s.name)).toEqual(['mc.feed', 'mc.start', 'mc.ready', 'mc.busy', 'mc.done', 'mc.doorClosed']);
  });

  it('PRT-010 no scene schema version change', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PRT-007 the snap points are in and out', () => {
    const snaps = def.snapPoints(machine({ lengthM: 1.2 }));
    expect(snaps.map((s) => [s.name, s.position[0], s.normalYDeg])).toEqual([
      ['in', -0.6, 180],
      ['out', 0.6, 0],
    ]);
    for (const s of snaps) expect(s.accepts).toEqual(['belt', 'roller', 'curved']);
  });

  const script = async (): Promise<{ hash: string; rig: Rig }> => {
    const r = await plant([machine(), infeed(), blank('w1', -0.3), blank('w2', -0.9)]);
    const h = createHash('sha256');
    const sample = () => h.update(JSON.stringify(r.world.bodies())).update(JSON.stringify(r.facts())).update(JSON.stringify(r.sense()));
    r.set({ feed: true });
    r.run(600, sample);
    r.set({});
    r.run(600, sample);
    r.set({ start: true, 'inb.run': true });
    r.run(1500, sample);
    r.set({ feed: true, 'inb.run': true });
    r.run(1500, sample);
    return { hash: h.digest('hex'), rig: r };
  };

  it('PLT-006 the machining centre calls no libm function while stepping and the facts and poses are identical on three runs', async () => {
    const a = (await script()).hash;
    expect(Object.keys((await script()).rig.facts())).toEqual(['produced:mc', 'misfires:mc']);
    expect((await script()).hash).toBe(a);
    const real = { sin: Math.sin, cos: Math.cos, atan2: Math.atan2, random: Math.random };
    // The product spawns through `world.addBody`, which turns its yaw into a quaternion with sin and cos (as every emitter spawn
    // does, world.ts addBody): that call is the world's, so it is let through; any call from the part itself throws.
    const boom =
      (name: keyof typeof real) =>
      (...args: number[]) => {
        if (new Error().stack?.includes('addBody')) return (real[name] as (...a: number[]) => number)(...args);
        throw new Error('libm call in a step');
      };
    const r = await plant([machine(), infeed(), blank('w1', -0.3), blank('w2', -0.9)]);
    const h = createHash('sha256');
    const sample = () => h.update(JSON.stringify(r.world.bodies())).update(JSON.stringify(r.facts())).update(JSON.stringify(r.sense()));
    Object.assign(Math, { sin: boom('sin'), cos: boom('cos'), atan2: boom('atan2'), random: boom('random') });
    try {
      r.set({ feed: true });
      r.run(600, sample);
      r.set({});
      r.run(600, sample);
      r.set({ start: true, 'inb.run': true });
      r.run(1500, sample);
      r.set({ feed: true, 'inb.run': true });
      r.run(1500, sample);
    } finally {
      Object.assign(Math, real);
    }
    expect(h.digest('hex')).toBe(a);
  });

  it('PLT-012 a capture mid-cycle restores and finishes with the same hash', async () => {
    // The core restores by replaying the history on a fresh world: the same history must give the same bytes mid-cycle and at the end.
    const upTo = async (ms: number) => {
      const r = await plant([machine(), blank('w1', -0.3)]);
      r.set({ feed: true });
      r.run(600);
      r.set({});
      r.run(600);
      r.set({ start: true });
      r.run(ms);
      return r;
    };
    const a = await upTo(500);
    expect(a.sense()['mc.busy']).toBe(true);
    const bytes = a.world.capture();
    const facts = JSON.stringify(a.facts());
    const b = await upTo(500);
    expect(Buffer.from(b.world.capture()).equals(Buffer.from(bytes))).toBe(true);
    expect(JSON.stringify(b.facts())).toBe(facts);
    a.run(1000);
    b.run(1000);
    expect(a.sense()['mc.done']).toBe(true);
    expect(Buffer.from(a.world.capture()).equals(Buffer.from(b.world.capture()))).toBe(true);
    expect(JSON.stringify(a.world.bodies())).toBe(JSON.stringify(b.world.bodies()));
    expect(JSON.stringify(a.facts())).toBe(JSON.stringify(b.facts()));
    expect(JSON.stringify(a.mc.views())).toBe(JSON.stringify(b.mc.views()));
  });
});
