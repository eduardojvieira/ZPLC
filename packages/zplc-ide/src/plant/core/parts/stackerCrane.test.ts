import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { createWorld, type PhysicsWorld } from '../world';
import { boxSize, spawnItem, type PartRuntime } from './items';
import { stackerParts } from './stackerCrane';

const def = stackerParts[0]!;
const catalogue = createCatalogue(stackerParts);
const part = (config: ScenePart['config'] = {}, rotationYDeg = 0): ScenePart => ({
  id: 'crane',
  part: 'stacker-crane',
  name: 'Crane1',
  position: [0, 0, 0],
  rotationYDeg,
  config,
});
const N = 'Crane1';
const PITCH = 1;
const LEVEL = 0.6;
const STROKE = 0.8;
const FORK_TOP_RAISED_L0 = 0.13; // dock level: 0.1 shelf top + 0.03

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});

async function rig(config: ScenePart['config'] = {}, rotationYDeg = 0) {
  const world = createWorld(await loadJolt());
  worlds.push(world);
  world.addBody({
    id: 'floor',
    kind: 'box',
    half: [20, 0.5, 20],
    position: [0, -0.5, 0],
    rotationYDeg: 0,
    massKg: 0,
    friction: 0.6,
    motion: 'static',
    layer: 'static',
  });
  const p = part(config, rotationYDeg);
  const rt: PartRuntime = def.runtime(p, () => 0);
  rt.build(world, p);
  const cmd: Record<string, boolean | number> = {};
  const rad = (rotationYDeg * Math.PI) / 180;
  // local (x, z) to world, for the test only
  const at = (lx: number, y: number, lz: number): [number, number, number] => [
    lx * Math.cos(rad) + lz * Math.sin(rad),
    y,
    -lx * Math.sin(rad) + lz * Math.cos(rad),
  ];
  const r = {
    world,
    rt,
    cmd,
    set(c: Record<string, boolean | number>) {
      for (const k of Object.keys(cmd)) delete cmd[k];
      for (const [k, v] of Object.entries(c)) cmd[`${N}.${k}`] = v;
    },
    patch(c: Record<string, boolean | number>) {
      for (const [k, v] of Object.entries(c)) cmd[`${N}.${k}`] = v;
    },
    tick() {
      rt.beforeStep(cmd);
      world.step(5);
      rt.afterStep();
    },
    run(ms: number, each?: () => void) {
      for (let i = 0; i < ms / 5; i += 1) {
        r.tick();
        each?.();
      }
    },
    /** Runs until the sensor is TRUE (or fails after maxMs). */
    until(sensor: string, maxMs = 20000): number {
      for (let t = 0; t < maxMs; t += 5) {
        if (r.sense(sensor) === true) return t;
        r.tick();
      }
      throw new Error(`${sensor} never became TRUE`);
    },
    sense: (k: string) => rt.sense()[`${N}.${k}`],
    fact: (k: string) => rt.facts()[k],
    box(id: string, kg: number, lx: number, bottomY: number, lz: number, h = 0.2) {
      // The box is 0.4 m along local z: its x size (0.4) is turned a quarter turn from the crane frame.
      spawnItem(world, id, 'item', boxSize(h), kg, at(lx, bottomY, lz), rotationYDeg + 90);
    },
    body: (id: string) => world.bodies().find((b) => b.id === id)!,
    /** Local (x, z) of a body relative to the crane origin. */
    local(id: string): [number, number, number] {
      const b = r.body(id);
      return [b.p[0] * Math.cos(rad) - b.p[2] * Math.sin(rad), b.p[1], b.p[0] * Math.sin(rad) + b.p[2] * Math.cos(rad)];
    },
    async raiseAt(level: number, bay: number) {
      r.patch({ raise: true, level, bay });
      r.run(300);
      r.until('inPosition');
      r.until('raised');
    },
    /** Store the box on the fork in cell (bay, level): raised, extend right, lower, retract. */
    async store(bay: number, level: number) {
      await r.raiseAt(level, bay);
      r.patch({ forkRight: true });
      r.until('forkAtRight');
      r.patch({ raise: false });
      r.run(1500);
      r.patch({ forkRight: false });
      r.until('forkCentre');
      r.run(500);
    },
    async retrieve(bay: number, level: number) {
      r.patch({ raise: false, level, bay });
      r.run(300);
      r.until('inPosition');
      r.patch({ forkRight: true });
      r.until('forkAtRight');
      r.run(500);
      r.patch({ raise: true });
      r.until('raised');
      r.run(500);
      r.patch({ forkRight: false });
      r.until('forkCentre');
      r.run(500);
    },
  };
  return r;
}

describe('stacker crane', () => {
  it('PRT-003 X and Y travel to the INT setpoints at their speeds and inPosition reports it within 0.005 m', async () => {
    const r = await rig();
    expect(r.sense('inPosition')).toBe(true);
    r.set({ bay: 2, level: 1 });
    r.run(100);
    expect(r.sense('inPosition')).toBe(false);
    expect(r.fact(`axis:${N}:x`) as number).toBeGreaterThan(0);
    expect(r.fact(`axis:${N}:x`) as number).toBeLessThan(0.5); // a ramp, not a jump
    let ms = 0;
    r.run(8000, () => {
      if (r.sense('inPosition') !== true) ms += 5;
    });
    expect(r.sense('inPosition')).toBe(true);
    expect(r.fact(`axis:${N}:x`) as number).toBeCloseTo(2 * PITCH, 2);
    expect(r.fact(`axis:${N}:y`) as number).toBeCloseTo(LEVEL, 2);
    // 2 m at 1 m/s with a 1.5 m/s2 ramp takes about 2.7 s, and it is the slower axis of the two
    expect(ms).toBeGreaterThan(2400);
    expect(ms).toBeLessThan(3400);
  });

  it('PRT-003 bay and level outside their ranges saturate and a value that is not a number changes nothing', async () => {
    const r = await rig({ columns: 2, levels: 2 });
    r.set({ bay: 9, level: -4 });
    r.run(8000);
    expect(r.fact(`axis:${N}:x`) as number).toBeCloseTo(2 * PITCH, 2);
    expect(r.fact(`axis:${N}:y`) as number).toBeCloseTo(0, 2);
    const hash = (rg: typeof r) => createHash('sha256').update(rg.world.capture()).update(JSON.stringify(rg.rt.facts())).digest('hex');
    const a = await rig();
    const b = await rig();
    a.set({ bay: 1 });
    b.set({ bay: 1 });
    b.patch({ level: Number.NaN });
    a.run(2000);
    b.run(2000);
    expect(hash(b)).toBe(hash(a));
    expect(def.signals(part()).find((s) => s.name === `${N}.bay`)).toEqual({
      name: `${N}.bay`,
      direction: 'command',
      type: 'INT',
      unit: 'bay',
      range: { min: 0, max: 4 },
    });
    expect(def.signals(part({ levels: 2 })).find((s) => s.name === `${N}.level`)?.range).toEqual({ min: 0, max: 2 });
  });

  it(
    'PRT-003 the fork extends to forkStrokeM on each side and centres when released, reporting forkAtLeft, forkAtRight and ' + 'forkCentre',
    async () => {
      const r = await rig();
      expect(r.sense('forkCentre')).toBe(true);
      r.set({ forkRight: true });
      r.until('forkAtRight');
      r.run(500);
      expect(r.fact(`axis:${N}:z`) as number).toBeCloseTo(STROKE, 2);
      expect(r.sense('forkCentre')).toBe(false);
      r.set({});
      r.until('forkCentre');
      r.set({ forkLeft: true });
      r.until('forkAtLeft');
      r.run(500);
      expect(r.fact(`axis:${N}:z`) as number).toBeCloseTo(-STROKE, 2);
      r.set({});
      r.run(400);
      const mid = r.fact(`axis:${N}:z`) as number;
      expect(mid).toBeGreaterThan(-STROKE);
      r.set({ forkLeft: true, forkRight: true }); // both hold the place
      r.run(500);
      expect((r.fact(`axis:${N}:z`) as number) - mid).toBeLessThan(0.15);
      expect(r.fact(`axis:${N}:z`) as number).toBeLessThan(0);
      r.set({});
      r.until('forkCentre');
    },
  );

  it('PRT-003 raise moves the fork 0.06 m and raised reports the limit', async () => {
    const r = await rig();
    r.box('b', 2, 0, 0.07, 0);
    r.run(500);
    const rest = r.body('b').p[1];
    expect(r.sense('raised')).toBe(false);
    r.set({ raise: true });
    r.until('raised');
    r.run(500);
    expect(r.body('b').p[1] - rest).toBeCloseTo(0.06, 2);
    r.set({});
    r.run(1500);
    expect(r.sense('raised')).toBe(false);
    expect(r.body('b').p[1] - rest).toBeCloseTo(0, 2);
  });

  it('PLT-007 a box from a dock belt is taken onto the fork by beltRight and is reported loaded', async () => {
    const r = await rig();
    // a dock belt ending 0.02 m from the extended fork tip (z = -1.1), its top at the raised fork top
    r.world.addBody({
      id: 'dock',
      kind: 'box',
      half: [0.3, 0.05, 0.6],
      position: [0, FORK_TOP_RAISED_L0 - 0.05, -(STROKE + 0.3 + 0.02 + 0.6)],
      rotationYDeg: 0,
      massKg: 0,
      friction: 0.6,
      motion: 'static',
      layer: 'static',
    });
    r.world.addBelt({ id: 'dock', bodyId: 'dock', axis: [0, 0, 1], accelMps2: 2 });
    r.world.setBeltTarget('dock', 0.4);
    r.set({ raise: true, forkLeft: true });
    r.until('raised');
    r.until('forkAtLeft');
    r.box('b', 2, 0, FORK_TOP_RAISED_L0, -(STROKE + 0.3 + 0.6));
    r.patch({ beltRight: true });
    r.until('loaded', 12000);
    r.patch({ beltRight: false, forkLeft: false });
    r.until('forkCentre');
    r.run(500);
    expect(r.sense('loaded')).toBe(true);
    expect(Math.abs(r.local('b')[2])).toBeLessThan(0.15); // brought to the centre by the belt and the retraction
  });

  it(
    'PLT-007 the crane stores a box on a rack cell: extend, lower, retract leave it at rest on the rails and the cell reads ' + 'TRUE',
    async () => {
      for (const kg of [2, 5]) {
        const r = await rig();
        r.set({ raise: true });
        r.run(1500);
        r.box('b', kg, 0, FORK_TOP_RAISED_L0, 0);
        r.run(500);
        expect(r.sense('loaded')).toBe(true);
        await r.store(1, 1);
        expect(r.fact(`cell:${N}:1:1`)).toBe(true);
        expect(r.fact(`stored:${N}`)).toBe(1);
        expect(r.sense('loaded')).toBe(false); // the plate is empty
        const [lx, ly, lz] = r.local('b');
        expect(lx).toBeCloseTo(PITCH, 2);
        expect(lz).toBeCloseTo(STROKE, 2);
        expect(ly - 0.1).toBeCloseTo(LEVEL + 0.1, 2); // half the box height over the rail tops
      }
    },
  );

  it('PLT-007 the crane retrieves it: extend lowered, raise, retract bring it back and the cell reads FALSE', async () => {
    const r = await rig();
    r.set({ raise: true });
    r.run(1500);
    r.box('b', 5, 0, FORK_TOP_RAISED_L0, 0);
    r.run(500);
    await r.store(2, 2);
    expect(r.fact(`cell:${N}:2:2`)).toBe(true);
    await r.retrieve(2, 2);
    expect(r.fact(`cell:${N}:2:2`)).toBe(false);
    expect(r.fact(`stored:${N}`)).toBe(0);
    expect(r.sense('loaded')).toBe(true);
    const [lx, , lz] = r.local('b');
    expect(Math.abs(lx - 2 * PITCH)).toBeLessThan(0.05);
    expect(Math.abs(lz)).toBeLessThan(0.05);
  });

  it('PLT-007 a box on the fork survives X, Y and fork moves at the maximum speeds and accelerations', async () => {
    const r = await rig({ speedXMps: 1.5, speedYMps: 1, forkSpeedMps: 0.8, accelMps2: 3 });
    r.set({ raise: true });
    r.run(1500);
    r.box('b', 5, 0, FORK_TOP_RAISED_L0, 0);
    r.run(500);
    for (const [bay, level] of [
      [4, 3],
      [0, 0],
      [3, 2],
      [1, 3],
    ] as const) {
      r.patch({ bay, level });
      r.run(300);
      r.until('inPosition');
      r.patch({ forkRight: true });
      r.until('forkAtRight');
      r.patch({ forkRight: false, forkLeft: true });
      r.until('forkAtLeft');
      r.patch({ forkLeft: false });
      r.until('forkCentre');
      r.run(300);
      expect(r.sense('loaded')).toBe(true);
      const fork = r.rt.views()[0]!.pose.p;
      const b = r.body('b').p;
      expect(Math.abs(b[0] - fork[0])).toBeLessThan(0.08);
      expect(Math.abs(b[2] - fork[2])).toBeLessThan(0.08);
    }
  });

  it('PRT-009 the fork view has the size of the fork body: narrow across x, long along z', async () => {
    const r = await rig();
    expect(r.rt.views()[0]!.pose.size).toEqual([0.16, 0.04, 0.6]);
  });

  it('PRT-003 X and Y are held while the fork is out and blocked counts one rising edge per refused request', async () => {
    const r = await rig();
    r.set({ forkRight: true });
    r.until('forkAtRight');
    expect(r.fact(`blocked:${N}`)).toBe(0);
    r.patch({ bay: 2 });
    r.run(1000);
    expect(r.fact(`axis:${N}:x`)).toBe(0);
    expect(r.fact(`blocked:${N}`)).toBe(1);
    r.patch({ level: 1 }); // a second setpoint while the request is still refused is the same request
    r.run(500);
    expect(r.fact(`axis:${N}:y`)).toBe(0);
    expect(r.fact(`blocked:${N}`)).toBe(1);
    r.patch({ forkRight: false }); // centred: the held setpoints are honoured
    r.until('forkCentre');
    r.run(8000);
    expect(r.sense('inPosition')).toBe(true);
    expect(r.fact(`axis:${N}:x`) as number).toBeCloseTo(2, 2);
    r.patch({ forkRight: true });
    r.until('forkAtRight');
    r.patch({ bay: 0 });
    r.run(500);
    expect(r.fact(`blocked:${N}`)).toBe(2);
    expect(r.fact(`axis:${N}:x`) as number).toBeCloseTo(2, 2);
  });

  it(
    'PLT-008 a box at rest on a cell stays at rest for 60 simulated seconds without drift above 0.001 m and stored reads the number of ' +
      'boxes',
    async () => {
      const r = await rig();
      const railTop = (l: number) => l * LEVEL + 0.1;
      r.box('b1', 5, PITCH, railTop(1), STROKE);
      r.box('b2', 2, 2 * PITCH, railTop(2), STROKE);
      r.box('b3', 5, 3 * PITCH, railTop(1), STROKE);
      r.run(3000);
      expect(r.fact(`stored:${N}`)).toBe(3);
      expect(r.fact(`cell:${N}:1:1`)).toBe(true);
      expect(r.fact(`cell:${N}:2:2`)).toBe(true);
      expect(r.fact(`cell:${N}:3:1`)).toBe(true);
      expect(r.fact(`cell:${N}:1:2`)).toBe(false);
      const before = ['b1', 'b2', 'b3'].map((id) => r.body(id).p);
      r.run(60000);
      ['b1', 'b2', 'b3'].forEach((id, i) => {
        for (let k = 0; k < 3; k += 1) expect(Math.abs(r.body(id).p[k]! - before[i]![k]!)).toBeLessThan(0.001);
      });
      expect(r.fact(`stored:${N}`)).toBe(3);
    },
  );

  it(
    'PRT-008 stuckX, stuckY and forkStuck freeze their axis, loadedStuckOff makes loaded read FALSE with the box still on the fork, ' +
      'beltStall stops the fork surface, an unknown action throws a located message',
    async () => {
      const x = await rig();
      x.rt.act('stuckX');
      x.set({ bay: 2, level: 1 });
      x.run(1500);
      expect(x.fact(`axis:${N}:x`)).toBe(0);
      expect(x.fact(`axis:${N}:y`) as number).toBeGreaterThan(0.1); // only X froze
      const y = await rig();
      y.rt.act('stuckY');
      y.set({ bay: 1, level: 1 });
      y.run(2500);
      expect(y.fact(`axis:${N}:y`)).toBe(0);
      expect(y.fact(`axis:${N}:x`) as number).toBeGreaterThan(0.5);
      const f = await rig();
      f.rt.act('forkStuck');
      f.set({ forkRight: true });
      f.run(1500);
      expect(f.fact(`axis:${N}:z`)).toBe(0);
      expect(f.sense('forkCentre')).toBe(true);

      const l = await rig();
      l.set({ raise: true });
      l.run(1500);
      l.box('b', 2, 0, FORK_TOP_RAISED_L0, 0);
      l.run(500);
      expect(l.sense('loaded')).toBe(true);
      l.rt.act('loadedStuckOff');
      l.run(100);
      expect(l.sense('loaded')).toBe(false);
      expect(Math.abs(l.local('b')[2])).toBeLessThan(0.05);

      const travelled = async (stall: boolean) => {
        const s = await rig();
        if (stall) s.rt.act('beltStall');
        s.set({ raise: true });
        s.run(1500);
        s.box('b', 2, 0, FORK_TOP_RAISED_L0, 0);
        s.run(300);
        s.patch({ beltRight: true });
        s.run(400);
        return s.local('b')[2];
      };
      expect(await travelled(false)).toBeGreaterThan(0.1);
      expect(Math.abs(await travelled(true))).toBeLessThan(0.02);
      expect(() => x.rt.act('nope')).toThrow(/Crane1.*nope/);
    },
  );

  it('PRT-003 a load above maxLoadKg holds X and Y like an out fork and is counted', async () => {
    const r = await rig({ maxLoadKg: 5 });
    r.set({ raise: true });
    r.run(1500);
    r.box('b', 8, 0, FORK_TOP_RAISED_L0, 0);
    r.run(500);
    r.patch({ bay: 1 });
    r.run(1500);
    expect(r.fact(`axis:${N}:x`)).toBe(0);
    expect(r.fact(`blocked:${N}`)).toBe(1);
  });

  it('PRT-003 settings outside their limits are refused with a located message', () => {
    const scene = (config: ScenePart['config']) => ({ schemaVersion: 1, name: 'x', cameras: [], parts: [part(config)] });
    const bads: ScenePart['config'][] = [
      { columns: 0 },
      { columns: 9 },
      { levels: 5 },
      { bayPitchM: 0.5 },
      { levelPitchM: 1.2 },
      { forkStrokeM: 0.4 },
      { speedXMps: 2 },
      { speedYMps: 0.1 },
      { forkSpeedMps: 1 },
      { beltSpeedMps: 0.05 },
      { accelMps2: 4 },
      { maxLoadKg: 40 },
    ];
    for (const bad of bads) expect(validateScene(scene(bad), catalogue)[0]?.path).toBe(`parts[0].config.${Object.keys(bad)[0]}`);
    expect(validateScene(scene({}), catalogue)).toEqual([]);
  });

  it('PRT-002 names and documentation in both languages', () => {
    expect(def.names).toEqual({ en: 'Stacker crane', es: 'Transelevador' });
    expect(def.family).toBe('stations');
    for (const lang of ['en', 'es'] as const) expect(def.doc[lang].length).toBeGreaterThan(400);
    expect(def.doc.es).not.toMatch(/\b(puedes|tú|tu)\b/);
    expect(def.doc.en).toContain('Level 0 is the dock');
    expect(def.doc.es).toContain('El nivel 0 es el muelle');
    for (const a of def.actions) {
      expect(def.doc.en).toContain(a);
      expect(def.doc.es).toContain(a);
    }
  });

  it('PRT-010 no scene schema version change', async () => {
    const { SCENE_SCHEMA_VERSION } = await import('../sceneSchema');
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PRT-007 the snap points include dockIn, dockOut and the rack corners, and the signals are the documented ones', () => {
    const snaps = def.snapPoints(part());
    expect(snaps.map((s) => s.name)).toEqual(['dockIn', 'dockOut', 'rackNearMin', 'rackNearMax', 'rackFarMin', 'rackFarMax']);
    expect(snaps[0]!.position).toEqual([0, 0, -1.1]);
    expect(snaps[1]!.position).toEqual([0, 0, 1.1]);
    expect(snaps[0]!.accepts).toContain('belt');
    expect(snaps[1]!.accepts).toContain('belt');
    expect(snaps[2]!.position).toEqual([0.8, 0, 0.5]);
    expect(snaps[5]!.position).toEqual([4.2, 0, 1.1]);
    expect(def.signals(part()).map((s) => s.name.slice(N.length + 1))).toEqual([
      'bay',
      'level',
      'inPosition',
      'raise',
      'raised',
      'forkLeft',
      'forkRight',
      'forkCentre',
      'forkAtLeft',
      'forkAtRight',
      'beltLeft',
      'beltRight',
      'loaded',
    ]);
  });

  const trace = async (rotationYDeg = 0) => {
    const r = await rig({}, rotationYDeg);
    const h = createHash('sha256');
    const seen = () => h.update(JSON.stringify(r.world.bodies())).update(JSON.stringify(r.rt.facts()));
    r.set({ raise: true });
    r.run(1500, seen);
    r.box('b', 5, 0, FORK_TOP_RAISED_L0, 0);
    r.run(500, seen);
    await r.store(1, 1);
    r.run(0, seen);
    await r.retrieve(1, 1);
    r.run(500, seen);
    return { hash: h.update(r.world.capture()).digest('hex'), r };
  };

  it(
    'PLT-006 the crane calls no libm function while stepping and the pose sequence of a store-and-retrieve run is identical on three ' +
      'runs',
    async () => {
      // The store and retrieve helpers do not hash each step, so hash the poses at the end of each run and the whole capture.
      const a = (await trace()).hash;
      expect((await trace()).hash).toBe(a);
      expect((await trace()).hash).toBe(a);
      const real = { sin: Math.sin, cos: Math.cos, tan: Math.tan, atan2: Math.atan2, pow: Math.pow, random: Math.random };
      const boom = () => {
        throw new Error('libm call in a step');
      };
      const r = await rig();
      r.set({ raise: true });
      r.run(1500);
      r.box('b', 5, 0, FORK_TOP_RAISED_L0, 0);
      r.run(500);
      Object.assign(Math, { sin: boom, cos: boom, tan: boom, atan2: boom, pow: boom, random: boom });
      try {
        await r.store(1, 1);
        await r.retrieve(1, 1);
      } finally {
        Object.assign(Math, real);
      }
      expect(r.sense('loaded')).toBe(true);
      // a crane turned a quarter turn does the same job
      const q = await rig({}, 90);
      q.set({ raise: true });
      q.run(1500);
      q.box('b', 5, 0, FORK_TOP_RAISED_L0, 0);
      q.run(500);
      await q.store(1, 1);
      expect(q.fact(`cell:${N}:1:1`)).toBe(true);
    },
  );

  it('PLT-012 a capture with the fork extended and a box on it restores to the same exact state', async () => {
    const go = async () => {
      const r = await rig();
      r.set({ raise: true });
      r.run(1500);
      r.box('b', 5, 0, FORK_TOP_RAISED_L0, 0);
      r.run(500);
      r.patch({ bay: 1, level: 1, forkRight: false });
      r.until('inPosition');
      r.patch({ forkRight: true });
      r.run(1000);
      return r;
    };
    const a = await go();
    const b = await go();
    expect(a.fact(`axis:${N}:z`) as number).toBeGreaterThan(0.1);
    expect(a.sense('loaded')).toBe(true);
    expect(Buffer.from(a.world.capture()).equals(Buffer.from(b.world.capture()))).toBe(true);
    expect(JSON.stringify(a.rt.facts())).toBe(JSON.stringify(b.rt.facts()));
    const bytes = a.world.capture();
    a.run(1500);
    expect(Buffer.from(a.world.capture()).equals(Buffer.from(bytes))).toBe(false);
    a.world.restore(bytes);
    expect(Buffer.from(a.world.capture()).equals(Buffer.from(bytes))).toBe(true);
  });

  it('PLT-010 the time of one store cycle at default speeds (reported and bounded)', async () => {
    const r = await rig();
    r.set({ raise: true });
    r.run(1500);
    r.box('b', 5, 0, FORK_TOP_RAISED_L0, 0);
    r.run(500);
    let ms = 0;
    const tick = () => {
      r.tick();
      ms += 5;
    };
    r.patch({ raise: true, level: 3, bay: 4 });
    r.run(0);
    for (let t = 0; t < 30000 && !(ms > 100 && r.sense('inPosition') === true); t += 5) tick();
    r.patch({ forkRight: true });
    for (let t = 0; t < 10000 && r.sense('forkAtRight') !== true; t += 5) tick();
    r.patch({ raise: false });
    for (let t = 0; t < 3000; t += 5) tick();
    r.patch({ forkRight: false });
    for (let t = 0; t < 10000 && r.sense('forkCentre') !== true; t += 5) tick();
    expect(r.fact(`cell:${N}:4:3`)).toBe(true);
    r.patch({ raise: true, level: 0, bay: 0 });
    for (let t = 0; t < 30000 && !(r.sense('inPosition') === true && r.sense('raised') === true); t += 5) tick();
    console.log(`store cycle to the farthest cell (bay 4, level 3) and back to the dock: ${ms / 1000} s`);
    expect(ms).toBeLessThan(40000);
  });
});
