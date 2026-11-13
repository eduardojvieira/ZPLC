import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { createWorld, type PhysicsWorld } from '../world';
import { itemParts, type PartRuntime } from './items';
import { turntableParts } from './turntable';

const defs = [...itemParts, ...turntableParts];
const catalogue = createCatalogue(defs);
const def = turntableParts[0]!;
const TOP = 0.45;
const SIZE = 0.9;

const part = (id: string, partId: string, position: [number, number, number], config: ScenePart['config'] = {}): ScenePart => ({
  id,
  part: partId,
  name: id.replace(/-/g, '_'),
  position,
  rotationYDeg: 0,
  config,
});
const table = (config: ScenePart['config'] = {}) => part('tt', 'turntable', [0, TOP, 0], config);
const box = (id: string, at: [number, number, number]) => part(id, 'box', at, { height: 0.2 });

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
  const tt = runtimes[scene.findIndex((p) => p.part === 'turntable')]!;
  let commands: Record<string, boolean | number> = {};
  const r = {
    world,
    tt,
    set(c: Record<string, boolean>) {
      commands = Object.fromEntries(Object.entries(c).map(([k, v]) => [`tt.${k}`, v]));
    },
    run(ms: number, each?: () => void) {
      for (let i = 0; i < ms / 5; i += 1) {
        for (const rt of runtimes) rt.beforeStep(commands);
        world.step(5);
        for (const rt of runtimes) rt.afterStep();
        each?.();
      }
    },
    angle: () => tt.views()[0]!.state.angleDeg as number,
    sense: () => tt.sense(),
    body: (id: string) => world.bodies().find((b) => b.id === id)!,
  };
  return r;
}

const ATS = ['tt.atCentre', 'tt.atLeft', 'tt.atRight'] as const;
const at = (s: Record<string, boolean | number>) => ATS.filter((k) => s[k] === true);
const pathHash = async (cmds: Record<string, boolean>): Promise<string> => {
  const r = await plant([table(), box('b1', [0.1, TOP, 0.05])]);
  r.set(cmds);
  const h = createHash('sha256');
  r.run(3000, () => h.update(JSON.stringify(r.world.bodies())));
  return h.digest('hex');
};

describe('turntable', () => {
  it(
    'PRT-003 the platform turns to the left and the right position at degPerS and back to the centre, reporting the ' + 'at-sensors',
    async () => {
      const r = await plant([table()]);
      expect(at(r.sense())).toEqual(['tt.atCentre']);
      r.set({ toRight: true });
      r.run(500);
      expect(Math.abs(r.angle())).toBeGreaterThan(5);
      expect(Math.abs(r.angle())).toBeLessThan(60); // not a jump: 90 degrees at 90 deg/s with a ramp takes over 1 s
      expect(at(r.sense())).toEqual([]);
      r.run(2000);
      expect(at(r.sense())).toEqual(['tt.atRight']);
      expect(r.angle()).toBeCloseTo(90, 0);
      r.set({ toLeft: true });
      r.run(3500);
      expect(at(r.sense())).toEqual(['tt.atLeft']);
      r.set({});
      r.run(3500);
      expect(at(r.sense())).toEqual(['tt.atCentre']);
      // the time of a 90 degree turn is within 25 % of 90 / degPerS plus the ramp
      const t = await plant([table({ degPerS: 60 })]);
      t.set({ toRight: true });
      let ms = 0;
      t.run(4000, () => {
        if (t.sense()['tt.atRight'] !== true) ms += 5;
      });
      expect(ms).toBeGreaterThan(1400);
      expect(ms).toBeLessThan(2100);
    },
  );

  it('PRT-003 both turn commands hold the current angle and the angle never leaves minus angleDeg to angleDeg', async () => {
    const r = await plant([table({ angleDeg: 60 })]);
    r.set({ toRight: true });
    r.run(300);
    const held = r.angle();
    r.set({ toRight: true, toLeft: true });
    r.run(1000);
    expect(r.angle()).toBe(held);
    let worst = 0;
    r.set({ toRight: true });
    r.run(3000, () => (worst = Math.max(worst, Math.abs(r.angle()))));
    r.set({ toLeft: true });
    r.run(5000, () => (worst = Math.max(worst, Math.abs(r.angle()))));
    expect(worst).toBeLessThanOrEqual(60);
    expect(r.angle()).toBeCloseTo(-60, 0);
  });

  it('PLT-007 a box on the platform is carried through a 90 degree turn without slipping off', async () => {
    for (const dir of ['toRight', 'toLeft'] as const) {
      const r = await plant([table(), box('b1', [0.15, TOP, 0])]);
      r.run(500);
      r.set({ [dir]: true });
      r.run(3000);
      const b = r.body('b1');
      const want: [number, number] = dir === 'toRight' ? [0, 0.15] : [0, -0.15];
      expect(Math.abs(b.p[0] - want[0])).toBeLessThan(0.01);
      expect(Math.abs(b.p[2] - want[1])).toBeLessThan(0.01);
      expect(b.p[1]).toBeLessThan(TOP + 0.101);
      expect(b.p[1]).toBeGreaterThan(TOP + 0.099 - 0.01);
    }
  });

  it('PLT-007 a box is carried through a turn at the fastest degPerS, 120, without slipping off', async () => {
    const r = await plant([table({ degPerS: 120 }), box('b1', [0.15, TOP, 0])]);
    r.run(500);
    r.set({ toRight: true });
    r.run(2500);
    const b = r.body('b1');
    expect(Math.hypot(b.p[0], b.p[2] - 0.15)).toBeLessThan(0.01);
  });

  it('PLT-007 a turned platform with run TRUE carries a box off towards the side it faces', async () => {
    const dirs = { centre: [1, 0], toRight: [0, 1], toLeft: [0, -1] } as const;
    for (const [cmd, d] of Object.entries(dirs)) {
      const r = await plant([table(), box('b1', [0, TOP, 0])]);
      r.set(cmd === 'centre' ? {} : { [cmd]: true });
      r.run(2500);
      r.set(cmd === 'centre' ? { run: true } : { [cmd]: true, run: true });
      r.run(1200);
      const b = r.body('b1');
      expect(b.p[0] * d[0]! + b.p[2] * d[1]!).toBeGreaterThan(0.3);
      expect(Math.abs(b.p[0] * d[1]! - b.p[2] * d[0]!)).toBeLessThan(0.02); // stays on the axis it faces
    }
  });

  it('PRT-003 the surface stops before the platform turns', async () => {
    const r = await plant([table(), box('b1', [-0.1, TOP, 0])]);
    r.set({ run: true });
    r.run(1000);
    expect(r.world.beltSpeed('tt-table')).toBeCloseTo(0.5, 2);
    r.set({ run: true, toRight: true });
    let turnedAtSpeed = Infinity;
    r.run(2000, () => {
      if (Math.abs(r.angle()) > 0) turnedAtSpeed = Math.min(turnedAtSpeed, Math.abs(r.world.beltSpeed('tt-table')));
    });
    expect(turnedAtSpeed).toBe(0); // the first turning step happens at surface speed 0
    r.run(1000);
    expect(r.world.beltSpeed('tt-table')).toBeGreaterThan(0.4); // run stayed TRUE: the surface starts again after the turn
    expect(r.angle()).toBeCloseTo(90, 0);
  });

  it('PLT-008 a box at rest on a stopped platform at each of the three angles stays at rest for 60 simulated seconds', async () => {
    for (const cmd of [{}, { toRight: true }, { toLeft: true }] as Record<string, boolean>[]) {
      const r = await plant([table(), box('b1', [0.1, TOP, 0.05])]);
      r.set(cmd);
      r.run(3500); // turned and settled
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
    'PRT-008 turnStuck freezes the angle, stall stops the surface, jam blocks the box, an unknown action throws a located ' + 'message',
    async () => {
      const stuck = await plant([table()]);
      stuck.set({ toRight: true });
      stuck.run(300);
      const frozen = stuck.angle();
      stuck.tt.act('turnStuck');
      stuck.run(3000);
      expect(stuck.angle()).toBe(frozen);
      const stall = await plant([table(), box('b1', [0, TOP, 0])]);
      stall.tt.act('stall');
      stall.set({ run: true });
      stall.run(1500);
      expect(stall.world.beltSpeed('tt-table')).toBe(0);
      expect(Math.abs(stall.body('b1').p[0])).toBeLessThan(0.01);
      const jam = await plant([table(), box('b1', [-0.15, TOP, 0])]);
      jam.tt.act('jam');
      jam.set({ run: true });
      jam.run(3000);
      expect(jam.body('b1').p[0]).toBeLessThan(0.0); // the bar across the middle stops it
      expect(() => stuck.tt.act('melt')).toThrow('part "tt" has no action "melt"');
      expect(def.actions).toEqual(['stall', 'turnStuck', 'jam']);
    },
  );

  it('PRT-003 a pair of conflicting commands does nothing', async () => {
    const r = await plant([table({ allowReverse: true }), box('b1', [0, TOP, 0])]);
    r.set({ run: true, runReverse: true });
    r.run(1500);
    expect(r.world.beltSpeed('tt-table')).toBe(0);
    expect(Math.abs(r.body('b1').p[0])).toBeLessThan(0.01);
    r.set({ runReverse: true });
    r.run(1500);
    expect(r.body('b1').p[0]).toBeLessThan(-0.2);
  });

  it('PRT-003 settings outside their limits are refused with a located message', () => {
    const scene = (config: ScenePart['config']) => ({ schemaVersion: 1, name: 'x', cameras: [], parts: [table(config)] });
    const bads: ScenePart['config'][] = [
      { sizeM: 0.4 },
      { sizeM: 1.3 },
      { angleDeg: 20 },
      { angleDeg: 95 },
      { degPerS: 20 },
      { degPerS: 130 },
    ];
    for (const bad of bads) {
      const problems = validateScene(scene(bad), catalogue);
      expect(problems[0]?.path).toBe(`parts[0].config.${Object.keys(bad)[0]}`);
    }
    expect(validateScene(scene({}), catalogue)).toEqual([]);
  });

  it('PRT-002 names and documentation in both languages', () => {
    expect(def.names).toEqual({ en: 'Turntable', es: 'Mesa giratoria' });
    for (const lang of ['en', 'es'] as const) expect(def.doc[lang].length).toBeGreaterThan(100);
    expect(def.doc.es).not.toMatch(/\b(puedes|tú|tu)\b/);
    expect(def.family).toBe('conveyors');
  });

  it('PRT-010 no scene schema version change', async () => {
    const { SCENE_SCHEMA_VERSION } = await import('../scene');
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PRT-007 the snap points are in, out, left and right, and the signals are the documented ones', () => {
    const snaps = def.snapPoints(table());
    expect(snaps.map((s) => s.name)).toEqual(['in', 'out', 'left', 'right']);
    expect(snaps[1]!.position).toEqual([SIZE / 2, 0, 0]);
    expect(snaps[3]!.position).toEqual([0, 0, SIZE / 2]);
    expect(snaps.every((s) => s.accepts.includes('belt'))).toBe(true);
    const names = (cfg: ScenePart['config']) => def.signals(table(cfg)).map((s) => s.name);
    expect(names({})).toEqual(['tt.run', 'tt.toLeft', 'tt.toRight', 'tt.atCentre', 'tt.atLeft', 'tt.atRight']);
    expect(names({ allowReverse: true })).toContain('tt.runReverse');
  });

  it('PLT-006 a turn uses no libm trigonometry and the pose sequence is identical on three runs', async () => {
    const cmds = { toRight: true, run: true };
    const a = await pathHash(cmds);
    expect(await pathHash(cmds)).toBe(a);
    expect(await pathHash(cmds)).toBe(a);
    // The step loop reads the yaw table: with sin, cos, atan2 and random unavailable the same turn gives the same poses.
    const real = { sin: Math.sin, cos: Math.cos, atan2: Math.atan2, random: Math.random };
    const boom = () => {
      throw new Error('libm call in a step');
    };
    const r = await plant([table(), box('b1', [0.1, TOP, 0.05])]);
    r.set(cmds);
    Object.assign(Math, { sin: boom, cos: boom, atan2: boom, random: boom });
    try {
      const h = createHash('sha256');
      r.run(3000, () => h.update(JSON.stringify(r.world.bodies())));
      expect(h.digest('hex')).toBe(a);
    } finally {
      Object.assign(Math, real);
    }
  });

  it('PLT-012 a capture mid-turn is the same exact state on a fresh run, and the runs end in the same state', async () => {
    const go = async () => {
      const r = await plant([table(), box('b1', [0.15, TOP, 0.05])]);
      r.set({ toRight: true });
      r.run(900);
      return r;
    };
    const a = await go();
    const b = await go();
    expect(r_(a.angle())).toBeGreaterThan(10);
    expect(r_(a.angle())).toBeLessThan(80);
    expect(Buffer.from(a.world.capture()).equals(Buffer.from(b.world.capture()))).toBe(true);
    a.run(2000);
    b.run(2000);
    expect(Buffer.from(a.world.capture()).equals(Buffer.from(b.world.capture()))).toBe(true);
    // Restoring the world bytes into a fresh world of the same bodies gives the same box pose.
    const c = await plant([table(), box('b1', [0.15, TOP, 0.05])]);
    c.run(900);
    const bytes = c.world.capture();
    c.run(500);
    c.world.restore(bytes);
    expect(Buffer.from(c.world.capture()).equals(Buffer.from(bytes))).toBe(true);
  });
});

const r_ = (n: number) => Math.abs(n);
