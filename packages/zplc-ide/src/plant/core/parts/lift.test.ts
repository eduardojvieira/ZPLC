import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { createWorld, type PhysicsWorld } from '../world';
import { itemParts, type PartRuntime } from './items';
import { liftParts } from './lift';

const defs = [...itemParts, ...liftParts];
const catalogue = createCatalogue(defs);
const def = liftParts[0]!;
const TOP = 0.45;
const BOX_H = 0.2;

const part = (id: string, partId: string, position: [number, number, number], config: ScenePart['config'] = {}): ScenePart => ({
  id,
  part: partId,
  name: id.replace(/-/g, '_'),
  position,
  rotationYDeg: 0,
  config,
});
const lift = (config: ScenePart['config'] = {}) => part('lf', 'lift', [0, TOP, 0], config);
const box = (id: string, at: [number, number, number], massKg = 2) => part(id, 'box', at, { height: BOX_H, massKg });

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});

const fixed = (id: string, half: [number, number, number], position: [number, number, number]) => ({
  id,
  kind: 'box' as const,
  half,
  position,
  rotationYDeg: 0,
  massKg: 0,
  friction: 0.6,
  motion: 'static' as const,
  layer: 'static' as const,
});

async function plant(scene: ScenePart[], landingTop?: number) {
  const world = createWorld(await loadJolt());
  worlds.push(world);
  world.addBody(fixed('floor', [10, 0.5, 5], [0, -0.5, 0]));
  // A fixed landing beside the platform, flush with a level top, for "carried off" tests.
  if (landingTop !== undefined) {
    world.addBody(fixed('landing', [0.5, 0.05, 0.4], [1, landingTop - 0.05, 0]));
    world.addBelt({ id: 'landing', bodyId: 'landing', axis: [1, 0, 0], accelMps2: 1 });
    world.setBeltTarget('landing', 0.5);
  }
  const runtimes: PartRuntime[] = scene.map((p) => {
    const rt = defs.find((d) => d.id === p.part)!.runtime(p, () => 0.5);
    rt.build(world, p);
    return rt;
  });
  const lf = runtimes[scene.findIndex((p) => p.part === 'lift')]!;
  let commands: Record<string, boolean | number> = {};
  return {
    world,
    lf,
    set(c: Record<string, boolean>) {
      commands = Object.fromEntries(Object.entries(c).map(([k, v]) => [`lf.${k}`, v]));
    },
    run(ms: number, each?: () => void) {
      for (let i = 0; i < ms / 5; i += 1) {
        for (const rt of runtimes) rt.beforeStep(commands);
        world.step(5);
        for (const rt of runtimes) rt.afterStep();
        each?.();
      }
    },
    y: () => lf.facts()['axis:lf:y'] as number,
    sense: () => lf.sense(),
    body: (id: string) => world.bodies().find((b) => b.id === id)!,
  };
}

const atLevels = (s: Record<string, boolean | number>) => Object.keys(s).filter((k) => s[k] === true);
const bottom = (b: { p: readonly number[] }) => b.p[1]! - BOX_H / 2;

describe('lift', () => {
  it('PRT-003 the platform travels between levels at travelSpeedMps and atLevelK reports each level within 0.01 m', async () => {
    const r = await plant([lift({ levels: 3, levelPitchM: 0.5 })]);
    expect(atLevels(r.sense())).toEqual(['lf.atLevel1']);
    r.set({ up: true });
    let ms = 0;
    let top = 0;
    r.run(3000, () => {
      top = Math.max(top, r.world.bodies().find((b) => b.id === 'lf')!.p[1]! - (TOP - 0.05));
      if (r.y() < 1) ms += 5;
    });
    expect(r.y()).toBeCloseTo(1, 2);
    expect(atLevels(r.sense())).toEqual(['lf.atLevel3']);
    // 1 m at 0.4 m/s plus a 0.5 s ramp up and down: about 3 s
    expect(ms).toBeGreaterThan(2400);
    expect(ms).toBeLessThan(3000);
    expect(top).toBeLessThanOrEqual(1.0005);
    // one stop in the middle: level 2 reads TRUE and level 1 and 3 read FALSE
    const m = await plant([lift({ levels: 3, levelPitchM: 0.3, travelSpeedMps: 0.1 })]);
    m.set({ up: true });
    for (let i = 0; i < 2000 && m.y() < 0.295; i += 1) m.run(5);
    m.set({});
    m.run(1000);
    expect(atLevels(m.sense())).toEqual(['lf.atLevel2']);
    expect(Math.abs(m.y() - 0.3)).toBeLessThan(0.01);
  });

  it('PRT-003 up with down holds, the platform never leaves its stroke and stops at the ends', async () => {
    const r = await plant([lift()]);
    r.set({ up: true });
    r.run(500);
    const held = r.y();
    expect(held).toBeGreaterThan(0.05);
    r.set({ up: true, down: true });
    r.run(1000);
    expect(r.y()).toBeLessThan(held + 0.1); // decelerates, then holds
    const settled = r.y();
    r.run(1000);
    expect(r.y()).toBe(settled);
    r.set({ up: true });
    r.run(4000);
    expect(r.y()).toBe(0.6);
    r.set({ down: true });
    r.run(4000);
    expect(r.y()).toBe(0);
    r.set({ down: true });
    r.run(500);
    expect(r.y()).toBe(0);
  });

  it('PLT-007 a box rides the platform up one level and is carried off at the top by run', async () => {
    for (const massKg of [2, 5]) {
      const r = await plant([lift(), box('b1', [0, TOP, 0], massKg)], TOP + 0.6);
      r.run(500);
      r.set({ up: true });
      r.run(3500);
      expect(r.y()).toBe(0.6);
      const b = r.body('b1');
      expect(Math.abs(b.p[0]) + Math.abs(b.p[2])).toBeLessThan(0.02);
      expect(Math.abs(bottom(b) - (TOP + 0.6))).toBeLessThan(0.005);
      r.set({ run: true });
      r.run(2500);
      const off = r.body('b1');
      expect(off.p[0]).toBeGreaterThan(0.6);
      expect(Math.abs(bottom(off) - (TOP + 0.6))).toBeLessThan(0.005);
    }
  });

  it('PLT-007 a box carried down two levels arrives at rest', async () => {
    for (const massKg of [2, 5]) {
      for (const travelSpeedMps of [0.4, 1]) {
        const up = await plant([
          lift({ levels: 3, travelSpeedMps, accelMps2: travelSpeedMps === 1 ? 3 : 0.8 }),
          box('b1', [0, TOP, 0], massKg),
        ]);
        up.set({ up: true });
        up.run(4000);
        const start = up.body('b1');
        expect(Math.abs(bottom(start) - (TOP + 1.2))).toBeLessThan(0.005);
        up.set({ down: true });
        up.run(4000);
        const end = up.body('b1');
        expect(Math.abs(bottom(end) - TOP)).toBeLessThan(0.005);
        expect(Math.abs(end.p[0]) + Math.abs(end.p[2])).toBeLessThan(0.03);
        const rest = end.p[1]!;
        up.run(2000);
        expect(Math.abs(up.body('b1').p[1]! - rest)).toBeLessThan(0.001);
      }
    }
  }, 60_000);

  it('PLT-008 a box at rest on the stopped platform at each level stays at rest for 60 simulated seconds without drift', async () => {
    for (const hold of [0, 1]) {
      const r = await plant([lift(), box('b1', [0.1, TOP, 0.05], 5)]);
      r.run(500);
      if (hold) {
        r.set({ up: true });
        r.run(3500);
      }
      r.set({});
      r.run(1000);
      const ref = r.body('b1');
      let drift = 0;
      r.run(60_000, () => {
        const b = r.body('b1');
        drift = Math.max(drift, Math.hypot(b.p[0] - ref.p[0], b.p[1] - ref.p[1], b.p[2] - ref.p[2]));
      });
      expect(drift).toBeLessThan(0.001);
    }
  }, 120_000);

  it(
    'PRT-008 stuck freezes the axis, stall stops the surface, levelStuckOff makes every atLevelK read FALSE, unknown action ' + 'throws',
    async () => {
      const stuck = await plant([lift()]);
      stuck.set({ up: true });
      stuck.run(300);
      const frozen = stuck.y();
      stuck.lf.act('stuck');
      stuck.run(3000);
      expect(stuck.y()).toBe(frozen);
      expect(atLevels(stuck.sense())).toEqual([]);
      const stall = await plant([lift(), box('b1', [0, TOP, 0])]);
      stall.lf.act('stall');
      stall.set({ run: true });
      stall.run(1500);
      expect(stall.world.beltSpeed('lf')).toBe(0);
      expect(Math.abs(stall.body('b1').p[0])).toBeLessThan(0.01);
      const off = await plant([lift()]);
      off.lf.act('levelStuckOff');
      expect(atLevels(off.sense())).toEqual([]);
      off.set({ up: true });
      off.run(3500);
      expect(atLevels(off.sense())).toEqual([]);
      const view = off.lf.views()[0]!;
      expect(view.state.text).toBe('level 2');
      expect(view.state.fraction).toBe(1);
      expect(() => off.lf.act('melt')).toThrow('part "lf" has no action "melt"');
      expect(def.actions).toEqual(['stuck', 'stall', 'levelStuckOff']);
    },
  );

  it('PRT-003 settings outside their limits are refused with a located message', () => {
    const scene = (config: ScenePart['config']) => ({ schemaVersion: 1, name: 'x', cameras: [], parts: [lift(config)] });
    const bads: ScenePart['config'][] = [
      { levels: 1 },
      { levels: 5 },
      { levelPitchM: 0.2 },
      { lengthM: 2 },
      { widthM: 0.4 },
      { travelSpeedMps: 1.5 },
      { accelMps2: 4 },
    ];
    for (const bad of bads) {
      const problems = validateScene(scene(bad), catalogue);
      expect(problems[0]?.path).toBe(`parts[0].config.${Object.keys(bad)[0]}`);
    }
    expect(validateScene(scene({}), catalogue)).toEqual([]);
  });

  it('PRT-002 names and documentation in both languages', () => {
    expect(def.names).toEqual({ en: 'Lift', es: 'Elevador' });
    for (const lang of ['en', 'es'] as const) expect(def.doc[lang].length).toBeGreaterThan(100);
    expect(def.doc.es).not.toMatch(/\b(puedes|tú|tu)\b/);
    expect(def.family).toBe('conveyors');
  });

  it('PRT-010 no scene schema version change', async () => {
    const { SCENE_SCHEMA_VERSION } = await import('../scene');
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PRT-007 the snap points are in and out at every level, and the signals are the documented ones', () => {
    const snaps = def.snapPoints(lift({ levels: 3, levelPitchM: 0.5 }));
    expect(snaps.map((s) => s.name)).toEqual(['in1', 'in2', 'in3', 'out1', 'out2', 'out3']);
    expect(snaps[1]!.position).toEqual([-0.5, 0.5, 0]);
    expect(snaps[5]!.position).toEqual([0.5, 1, 0]);
    expect(snaps.every((s) => s.accepts.includes('belt'))).toBe(true);
    const names = (cfg: ScenePart['config']) => def.signals(lift(cfg)).map((s) => s.name);
    expect(names({})).toEqual(['lf.up', 'lf.down', 'lf.run', 'lf.atLevel1', 'lf.atLevel2']);
    expect(names({ allowReverse: true, levels: 3 })).toEqual([
      'lf.up',
      'lf.down',
      'lf.run',
      'lf.runReverse',
      'lf.atLevel1',
      'lf.atLevel2',
      'lf.atLevel3',
    ]);
  });

  it('PLT-006 the lift calls no libm function while stepping and the pose sequence is identical on three runs', async () => {
    const go = async () => {
      const r = await plant([lift(), box('b1', [0.1, TOP, 0.05])], TOP + 0.6);
      r.set({ up: true, run: true });
      return r;
    };
    const hash = async (stub: boolean) => {
      const r = await go();
      const real = { sin: Math.sin, cos: Math.cos, tan: Math.tan, atan2: Math.atan2, pow: Math.pow };
      const boom = () => {
        throw new Error('libm call in a step');
      };
      if (stub) Object.assign(Math, { sin: boom, cos: boom, tan: boom, atan2: boom, pow: boom });
      try {
        const h = createHash('sha256');
        r.run(4000, () => h.update(JSON.stringify(r.world.bodies())));
        return h.digest('hex');
      } finally {
        Object.assign(Math, real);
      }
    };
    const a = await hash(false);
    expect(await hash(false)).toBe(a);
    expect(await hash(true)).toBe(a);
  });

  it('PLT-012 a capture mid-travel with a box on the platform restores to the same exact state', async () => {
    const go = async () => {
      const r = await plant([lift(), box('b1', [0.15, TOP, 0.05])]);
      r.set({ up: true });
      r.run(700);
      return r;
    };
    const a = await go();
    const b = await go();
    expect(a.y()).toBeGreaterThan(0.05);
    expect(a.y()).toBeLessThan(0.55);
    expect(Buffer.from(a.world.capture()).equals(Buffer.from(b.world.capture()))).toBe(true);
    a.run(2000);
    b.run(2000);
    expect(Buffer.from(a.world.capture()).equals(Buffer.from(b.world.capture()))).toBe(true);
    const c = await go();
    const bytes = c.world.capture();
    c.run(500);
    c.world.restore(bytes);
    expect(Buffer.from(c.world.capture()).equals(Buffer.from(bytes))).toBe(true);
  });
});
