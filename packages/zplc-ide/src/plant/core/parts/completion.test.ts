import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { createWorld, type PhysicsWorld, type WorldBodySpec } from '../world';
import { completionParts } from './completion';
import { itemParts, type PartRuntime } from './items';

const defs = [...itemParts, ...completionParts];
const catalogue = createCatalogue(defs);
const defOf = (id: string) => completionParts.find((d) => d.id === id)!;

const part = (id: string, partId: string, position: [number, number, number], config: ScenePart['config'] = {}, yaw = 0): ScenePart => ({
  id,
  part: partId,
  name: id.replace(/-/g, '_'),
  position,
  rotationYDeg: yaw,
  config,
});
const box = (id: string, at: [number, number, number], yaw = 0) => part(id, 'box', at, { height: 0.2, mass: '2' }, yaw);

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});

const fixed = (id: string, half: [number, number, number], position: [number, number, number]): WorldBodySpec => ({
  id,
  kind: 'box',
  half,
  position,
  rotationYDeg: 0,
  massKg: 0,
  friction: 0.6,
  motion: 'static',
  layer: 'static',
});

/** A world with a floor whose top is y = 0 and an optional belt strip (top at `beltTop`, from x = beltFrom to beltFrom + 3). */
async function plant(scene: ScenePart[], belt?: { from: number; top: number; speed: number }) {
  const world = createWorld(await loadJolt());
  worlds.push(world);
  world.addBody(fixed('floor', [10, 0.5, 5], [0, -0.5, 0]));
  if (belt) {
    world.addBody(fixed('belt', [1.5, 0.05, 0.5], [belt.from + 1.5, belt.top - 0.05, 0]));
    world.addBelt({ id: 'belt', bodyId: 'belt', axis: [1, 0, 0], accelMps2: 5 });
    world.setBeltTarget('belt', belt.speed);
  }
  const runtimes: PartRuntime[] = scene.map((p) => {
    const rt = defs.find((d) => d.id === p.part)!.runtime(p, () => 0.5);
    rt.build(world, p);
    return rt;
  });
  let commands: Record<string, boolean | number> = {};
  const rtOf = (id: string) => runtimes[scene.findIndex((p) => p.id === id)]!;
  return {
    world,
    rtOf,
    set(c: Record<string, boolean>) {
      commands = c;
    },
    run(ms: number, each?: () => void) {
      for (let i = 0; i < ms / 5; i += 1) {
        for (const rt of runtimes) rt.beforeStep(commands);
        world.step(5);
        for (const rt of runtimes) rt.afterStep();
        each?.();
      }
    },
    body: (id: string) => world.bodies().find((b) => b.id === id)!,
  };
}
const yawDeg = (q: readonly number[]) => (2 * Math.atan2(q[1]!, q[3]!) * 180) / Math.PI;

describe('limit switch', () => {
  const sw = (config: ScenePart['config'] = {}, at: [number, number, number] = [1, 0, 0]) => part('ls', 'limit-switch', at, config);

  it('PRT-001 a limit switch is TRUE while an item touches its lever and counts the rising edges', async () => {
    const r = await plant([sw({ reachM: 0.1, heightM: 0.3 }, [1, 0.4, 0]), box('b1', [0, 0.4, 0]), box('b2', [-0.9, 0.4, 0])], {
      from: -1.5,
      top: 0.4,
      speed: 1,
    });
    const ls = r.rtOf('ls');
    expect(ls.sense()).toEqual({ 'ls.contact': false });
    expect(ls.facts()).toEqual({ 'count:ls': 0 });
    const seen: boolean[] = [];
    r.run(3000, () => seen.push(ls.sense()['ls.contact'] === true));
    // both boxes crossed the lever one after the other: two separate TRUE runs, never TRUE with nothing there
    const runs = seen.filter((v, i) => v && !seen[i - 1]).length;
    expect(runs).toBe(2);
    expect(ls.facts()).toEqual({ 'count:ls': 2 });
    expect(ls.sense()['ls.contact']).toBe(false);
    const view = ls.views()[0]!;
    expect(view.part).toBe('limit-switch');
    expect(view.state.count).toBe(2);
    expect(view.signals).toEqual({ contact: false });
  });

  it('PRT-001 the lever sits heightM above the part and an item below or beyond it is not touched', async () => {
    const low = await plant([sw({ reachM: 0.1, heightM: 0.05 }), box('b1', [1.05, 0, 0])]);
    low.run(500);
    expect(low.rtOf('ls').sense()['ls.contact']).toBe(false);
    const high = await plant([sw({ reachM: 0.1, heightM: 0.3 }), box('b1', [1.05, 0, 0])]);
    high.run(500);
    expect(high.rtOf('ls').sense()['ls.contact']).toBe(true);
    const far = await plant([sw({ reachM: 0.1, heightM: 0.3 }), box('b1', [1.5, 0, 0])]);
    far.run(500);
    expect(far.rtOf('ls').sense()['ls.contact']).toBe(false);
    // the lever follows the part's rotation: turned 90 degrees it reaches along -z
    const turned = await plant([part('ls', 'limit-switch', [1, 0, 0], { reachM: 0.1, heightM: 0.3 }, 90), box('b1', [1, 0, -0.05])]);
    turned.run(500);
    expect(turned.rtOf('ls').sense()['ls.contact']).toBe(true);
  });

  it('PRT-008 stuckOn and stuckOff force contact, an unknown action throws a located message', async () => {
    const on = await plant([sw({ heightM: 0.3 })]);
    on.rtOf('ls').act('stuckOn');
    on.run(50);
    expect(on.rtOf('ls').sense()['ls.contact']).toBe(true);
    expect(on.rtOf('ls').facts()).toEqual({ 'count:ls': 1 });
    const off = await plant([sw({ reachM: 0.1, heightM: 0.3 }), box('b1', [1.05, 0, 0])]);
    off.rtOf('ls').act('stuckOff');
    off.run(500);
    expect(off.rtOf('ls').sense()['ls.contact']).toBe(false);
    expect(off.rtOf('ls').facts()).toEqual({ 'count:ls': 0 });
    expect(() => off.rtOf('ls').act('melt')).toThrow('part "ls" has no action "melt"');
    expect(defOf('limit-switch').actions).toEqual(['stuckOn', 'stuckOff']);
  });
});

describe('aligner', () => {
  const al = (config: ScenePart['config'] = {}) => part('al', 'aligner', [0, 0, 0], { lengthM: 0.8, ...config });
  const sensed = (r: Awaited<ReturnType<typeof plant>>) => r.rtOf('al').sense();

  it('PLT-007 an aligner squares a skewed box to the belt axis and reports aligned and open at its limits', async () => {
    const r = await plant([al({ gapM: 0.3 }), box('b1', [0, 0, 0], 30)]);
    expect(sensed(r)).toEqual({ 'al.aligned': false, 'al.open': true });
    const skew = Math.abs(yawDeg(r.body('b1').q));
    expect(skew).toBeGreaterThan(25);
    r.run(300);
    expect(sensed(r)).toEqual({ 'al.aligned': false, 'al.open': true });
    r.set({ 'al.align': true });
    r.run(200);
    expect(sensed(r)).toEqual({ 'al.aligned': false, 'al.open': false }); // part way: 0.4 s between the limits
    r.run(600);
    expect(sensed(r)).toEqual({ 'al.aligned': true, 'al.open': false });
    expect(Math.abs(yawDeg(r.body('b1').q))).toBeLessThan(1);
    const view = r.rtOf('al').views()[0]!;
    expect(view.part).toBe('aligner');
    expect(view.state.fraction).toBe(1);
    expect(view.state.gapM).toBeCloseTo(0.3, 6);
    r.set({});
    r.run(800);
    expect(sensed(r)).toEqual({ 'al.aligned': false, 'al.open': true });
    expect(r.rtOf('al').facts()).toEqual({});
  });

  it('PLT-007 a gapM wider than the belt span never closes outwards and the default gap leaves a box squarer than it came', async () => {
    const wide = await plant([al({ widthM: 0.4, gapM: 0.6 })]);
    wide.set({ 'al.align': true });
    wide.run(800);
    expect(wide.rtOf('al').views()[0]!.state.gapM).toBeCloseTo(0.4, 6);
    const r = await plant([al(), box('b1', [0, 0, 0], 30)]);
    r.set({ 'al.align': true });
    r.run(1000);
    expect(Math.abs(yawDeg(r.body('b1').q))).toBeLessThan(12);
  });

  it('PRT-008 an aligner stuck holds where it is, an unknown action throws a located message', async () => {
    const r = await plant([al()]);
    r.set({ 'al.align': true });
    r.run(200);
    r.rtOf('al').act('stuck');
    const frozen = r.rtOf('al').views()[0]!.state.fraction;
    expect(frozen).toBeGreaterThan(0.2);
    expect(frozen).toBeLessThan(0.8);
    r.run(2000);
    expect(r.rtOf('al').views()[0]!.state.fraction).toBe(frozen);
    r.set({});
    r.run(2000);
    expect(r.rtOf('al').views()[0]!.state.fraction).toBe(frozen);
    expect(sensed(r)).toEqual({ 'al.aligned': false, 'al.open': false });
    expect(() => r.rtOf('al').act('melt')).toThrow('part "al" has no action "melt"');
    expect(defOf('aligner').actions).toEqual(['stuck']);
  });

  it('PRT-007 the signals of the aligner are align, aligned and open', () => {
    expect(
      defOf('aligner')
        .signals(al())
        .map((s) => `${s.name} ${s.direction}`),
    ).toEqual(['al.align command', 'al.aligned sensor', 'al.open sensor']);
    expect(defOf('aligner').snapPoints(al())).toEqual([]);
  });
});

describe('chute', () => {
  const chute = (config: ScenePart['config'] = {}) => part('ch', 'chute', [0, 0.6, 0], config);

  it('PLT-007 a box placed at the high end of a chute slides to the low end and onto a belt', async () => {
    const r = await plant([chute(), box('b1', [-0.3, 0.75, 0])], { from: 0.45, top: 0.4, speed: 0.5 });
    const start = r.body('b1').p;
    r.run(8000);
    const end = r.body('b1');
    expect(start[0]).toBeLessThan(-0.25);
    expect(end.p[0]).toBeGreaterThan(0.9); // it left the low end (x about 0.47) and rides the belt
    expect(end.p[1]).toBeCloseTo(0.4 + 0.1, 1); // standing on the belt, not fallen to the floor
    expect(Math.abs(end.v[0] - 0.5)).toBeLessThan(0.1);
    expect(r.rtOf('ch').facts()).toEqual({});
    expect(r.rtOf('ch').sense()).toEqual({});
  });

  it('PRT-003 settings outside their limits are refused with a located message', () => {
    const scene = (p: ScenePart) => ({ schemaVersion: 1, name: 'x', cameras: [], parts: [p] });
    const bads: [ScenePart, string][] = [
      [chute({ tiltDeg: 40 }), 'tiltDeg'],
      [chute({ tiltDeg: 4 }), 'tiltDeg'],
      [chute({ lengthM: 2.5 }), 'lengthM'],
      [chute({ widthM: 0.3 }), 'widthM'],
      [part('al', 'aligner', [0, 0, 0], { gapM: 0.7 }), 'gapM'],
      [part('al', 'aligner', [0, 0, 0], { widthM: 1.2 }), 'widthM'],
      [part('ls', 'limit-switch', [0, 0, 0], { reachM: 0.5 }), 'reachM'],
      [part('ls', 'limit-switch', [0, 0, 0], { heightM: 3 }), 'heightM'],
    ];
    for (const [bad, key] of bads) expect(validateScene(scene(bad), catalogue)[0]?.path).toBe(`parts[0].config.${key}`);
    for (const ok of [chute(), part('al', 'aligner', [0, 0, 0]), part('ls', 'limit-switch', [0, 0, 0])]) {
      expect(validateScene(scene(ok), catalogue)).toEqual([]);
    }
  });

  it('PRT-007 the snap points of the chute are in and out, the high end first', () => {
    const snaps = defOf('chute').snapPoints(chute({ lengthM: 1, tiltDeg: 20 }));
    expect(snaps.map((s) => s.name)).toEqual(['in', 'out']);
    expect(snaps[0]!.position[0]).toBeCloseTo(-0.4698, 3);
    expect(snaps[0]!.position[1]).toBeCloseTo(0.171, 3);
    expect(snaps[1]!.position[0]).toBeCloseTo(0.4698, 3);
    expect(snaps[1]!.position[1]).toBeCloseTo(-0.171, 3);
    expect(snaps.map((s) => s.normalYDeg)).toEqual([180, 0]);
    expect(snaps.every((s) => s.accepts.includes('belt'))).toBe(true);
    expect(defOf('chute').signals(chute())).toEqual([]);
    expect(defOf('chute').actions).toEqual([]);
  });

  it('PLT-007 the view of a chute is its tilted plate', async () => {
    const r = await plant([chute({ tiltDeg: 30, lengthM: 1.2 })]);
    const v = r.rtOf('ch').views()[0]!;
    expect(v.part).toBe('chute');
    expect(v.pose.size).toEqual([1.2, 0.02, 0.6]);
    expect(v.state).toEqual({ tiltDeg: 30, lengthM: 1.2, widthM: 0.6 });
    expect(Math.abs((2 * Math.asin(v.pose.q[2]!) * 180) / Math.PI)).toBeCloseTo(30, 3);
  });
});

describe('completion parts', () => {
  it('PRT-002 names and documentation in both languages', () => {
    expect(completionParts.map((d) => d.id)).toEqual(['limit-switch', 'aligner', 'chute']);
    expect(completionParts.map((d) => d.family)).toEqual(['sensors', 'flow', 'flow']);
    expect(completionParts.map((d) => d.names)).toEqual([
      { en: 'Limit switch', es: 'Final de carrera' },
      { en: 'Aligner', es: 'Alineador' },
      { en: 'Chute', es: 'Rampa de deslizamiento' },
    ]);
    for (const d of completionParts) {
      for (const lang of ['en', 'es'] as const) expect(d.doc[lang].length).toBeGreaterThan(100);
      expect(d.doc.es).not.toMatch(/\b(puedes|tú|tu)\b/);
    }
  });

  it('PRT-010 no scene schema version change', async () => {
    const { SCENE_SCHEMA_VERSION } = await import('../scene');
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PLT-006 the three parts call no libm function while stepping and the traces are identical on three runs', async () => {
    const hash = async (stub: boolean) => {
      const r = await plant(
        [
          part('ch', 'chute', [0, 0.6, 0], {}, 15),
          part('al', 'aligner', [3, 0, 0], { gapM: 0.3 }, 10),
          part('ls', 'limit-switch', [1, 0.4, 0], { heightM: 0.3 }, 20),
          box('b1', [3, 0, 0], 30),
          box('b2', [-0.4, 0.75, 0], 15),
        ],
        { from: 0.3, top: 0.4, speed: 0.5 },
      );
      r.set({ 'al.align': true });
      const real = { sin: Math.sin, cos: Math.cos, tan: Math.tan, atan2: Math.atan2, pow: Math.pow };
      const boom = () => {
        throw new Error('libm call in a step');
      };
      if (stub) Object.assign(Math, { sin: boom, cos: boom, tan: boom, atan2: boom, pow: boom });
      try {
        const h = createHash('sha256');
        r.run(4000, () => {
          h.update(JSON.stringify(r.world.bodies()));
          h.update(JSON.stringify([r.rtOf('ls').sense(), r.rtOf('al').sense(), r.rtOf('ls').facts()]));
        });
        return h.digest('hex');
      } finally {
        Object.assign(Math, real);
      }
    };
    const a = await hash(false);
    expect(await hash(false)).toBe(a);
    expect(await hash(true)).toBe(a);
  });
});
