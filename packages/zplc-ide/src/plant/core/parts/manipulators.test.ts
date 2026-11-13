import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { PartView, ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { SCENE_SCHEMA_VERSION } from '../sceneSchema';
import { createWorld, type PhysicsWorld } from '../world';
import { conveyorParts } from './conveyors';
import { flowParts } from './flow';
import { boxSize, itemParts, spawnItem, type PartRuntime } from './items';
import { manipulatorParts } from './manipulators';

const defs = [...itemParts, ...conveyorParts, ...flowParts, ...manipulatorParts];
const catalogue = createCatalogue(defs);
const part = (
  id: string,
  partId: string,
  position: [number, number, number],
  config: ScenePart['config'] = {},
  rotationYDeg = 0,
): ScenePart => ({ id, part: partId, name: id.replace(/-/g, '_'), position, rotationYDeg, config });

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});

type Commands = Record<string, boolean | number>;
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
  const runtimes = new Map<string, PartRuntime>();
  for (const p of scene) {
    const rt = defs.find((d) => d.id === p.part)!.runtime(p, () => 0.5);
    rt.build(world, p);
    runtimes.set(p.name, rt);
  }
  const all = [...runtimes.values()];
  const api = {
    world,
    rt: (name: string) => runtimes.get(name)!,
    sense: (name: string) => runtimes.get(name)!.sense(),
    facts: (name: string) => runtimes.get(name)!.facts(),
    body: (id: string) => world.bodies().find((b) => b.id === id)!,
    run(ms: number, commands: Commands = {}) {
      for (let i = 0; i < ms / 5; i += 1) {
        for (const r of all) r.beforeStep(commands);
        world.step(5);
        for (const r of all) r.afterStep();
      }
    },
    /** Runs until `done()` or `limitMs`; returns the elapsed ms. */
    until(done: () => boolean, commands: Commands, limitMs = 20000) {
      let t = 0;
      while (!done() && t < limitMs) {
        api.run(5, commands);
        t += 5;
      }
      return t;
    },
  };
  return api;
}
type Plant = Awaited<ReturnType<typeof plant>>;

/** Numeric pick and place driver: moves to (x, y) with the grip as given and waits for the axes to arrive. */
function goto(p: Plant, name: string, x: number, y: number, grip: boolean, z?: number) {
  const cmd: Commands = { [`${name}.xSet`]: x, [`${name}.ySet`]: y, [`${name}.grip`]: grip };
  if (z !== undefined) cmd[`${name}.zSet`] = z;
  const near = (key: string, v: number) => Math.abs((p.sense(name)[`${name}.${key}`] as number) - v) < 0.001;
  p.until(() => near('xPos', x) && near('yPos', y) && (z === undefined || near('zPos', z)), cmd);
  p.run(100, cmd);
}

const NUMERIC = { variant: 'numeric', strokeYM: 1 } as const;
const BELT_TOP = 0.45;
const BOX = boxSize(0.3);

const pickAndPlace = async (gripper: 'vacuum' | 'clamp' = 'vacuum') => {
  const p = await plant([
    part('belt', 'belt', [1, BELT_TOP, 0], { length: 1 }),
    part('box1', 'box', [0.4, 0, 0], { height: '0.3', mass: '2' }),
    part('pick1', 'pick-place', [0, 0, 0], { ...NUMERIC, gripper }),
  ]);
  p.run(500);
  return p;
};
const pickPlaceCycle = (p: Plant) => {
  goto(p, 'pick1', 0, 0.5, false);
  goto(p, 'pick1', 0.4, 0.5, false);
  goto(p, 'pick1', 0.4, 0.3, false);
  goto(p, 'pick1', 0.4, 0.3, true);
  goto(p, 'pick1', 0.4, 0.75, true);
  goto(p, 'pick1', 1, 0.75, true);
  goto(p, 'pick1', 1, 0.76, true);
  goto(p, 'pick1', 1, 0.76, false);
  goto(p, 'pick1', 1, 1, false);
};

describe('manipulator parts', () => {
  it('PRT-004 the digital variant has hold-to-move commands, limit sensors, grip and gripped; the numeric variant has setpoints', () => {
    const sig = (id: string, config: ScenePart['config']) =>
      defs
        .find((d) => d.id === id)!
        .signals(part('m1', id, [0, 0, 0], config))
        .map((s) => [s.name, s.direction, s.type, s.unit, s.range]);
    const cmd = (n: string) => [`m1.${n}`, 'command', 'BOOL', undefined, undefined];
    const snsr = (n: string) => [`m1.${n}`, 'sensor', 'BOOL', undefined, undefined];
    const real = (n: string, direction: string, max: number) => [`m1.${n}`, direction, 'REAL', 'm', { min: 0, max }];
    expect(sig('pick-place', {})).toEqual([
      cmd('xPlus'),
      cmd('xMinus'),
      cmd('yPlus'),
      cmd('yMinus'),
      snsr('xAtMin'),
      snsr('xAtMax'),
      snsr('yAtMin'),
      snsr('yAtMax'),
      cmd('grip'),
      snsr('gripped'),
    ]);
    expect(sig('pick-place', { variant: 'numeric', strokeXM: 2, strokeYM: 0.8 })).toEqual([
      real('xSet', 'command', 2),
      real('ySet', 'command', 0.8),
      real('xPos', 'sensor', 2),
      real('yPos', 'sensor', 0.8),
      cmd('grip'),
      snsr('gripped'),
    ]);
    expect(sig('gantry', { strokeZM: 2 }).map((s) => s[0])).toEqual([
      'm1.xPlus',
      'm1.xMinus',
      'm1.yPlus',
      'm1.yMinus',
      'm1.zPlus',
      'm1.zMinus',
      'm1.xAtMin',
      'm1.xAtMax',
      'm1.yAtMin',
      'm1.yAtMax',
      'm1.zAtMin',
      'm1.zAtMax',
      'm1.grip',
      'm1.gripped',
    ]);
    expect(sig('gantry', { variant: 'numeric', strokeZM: 2 }).map((s) => [s[0], s[4]])).toEqual([
      ['m1.xSet', { min: 0, max: 1.2 }],
      ['m1.ySet', { min: 0, max: 0.5 }],
      ['m1.zSet', { min: 0, max: 2 }],
      ['m1.xPos', { min: 0, max: 1.2 }],
      ['m1.yPos', { min: 0, max: 0.5 }],
      ['m1.zPos', { min: 0, max: 2 }],
      ['m1.grip', undefined],
      ['m1.gripped', undefined],
    ]);
    for (const d of manipulatorParts) expect(d.family).toBe('manipulators');
  });

  it('PRT-003 a digital axis moves only while its command is held, stops at its stroke end and reports the limit', async () => {
    const p = await plant([part('pick1', 'pick-place', [0, 0, 0], { strokeXM: 0.4, speedMps: 1 })]);
    p.run(100);
    expect(p.sense('pick1')).toMatchObject({ 'pick1.xAtMin': true, 'pick1.xAtMax': false });
    p.run(300, { 'pick1.xPlus': true });
    const mid = p.facts('pick1')['axis:pick1:x'] as number;
    expect(mid).toBeGreaterThan(0.05);
    expect(mid).toBeLessThan(0.4);
    p.run(300); // released: it brakes and stays
    const rest = p.facts('pick1')['axis:pick1:x'] as number;
    expect(rest).toBeGreaterThanOrEqual(mid);
    p.run(100);
    expect(p.facts('pick1')['axis:pick1:x']).toBe(rest);
    p.run(2000, { 'pick1.xPlus': true });
    expect(p.facts('pick1')['axis:pick1:x']).toBe(0.4);
    expect(p.sense('pick1')).toMatchObject({ 'pick1.xAtMax': true, 'pick1.xAtMin': false });
    p.run(2000, { 'pick1.xMinus': true });
    expect(p.facts('pick1')['axis:pick1:x']).toBe(0);
    expect(p.sense('pick1')['pick1.xAtMin']).toBe(true);
  });

  it('PRT-003 both directions commanded together do not move the axis', async () => {
    const p = await plant([part('pick1', 'pick-place', [0, 0, 0])]);
    p.run(500, { 'pick1.xPlus': true, 'pick1.xMinus': true, 'pick1.yPlus': true, 'pick1.yMinus': true });
    expect(p.facts('pick1')).toMatchObject({ 'axis:pick1:x': 0, 'axis:pick1:y': 0 });
  });

  it('PRT-003 a numeric axis follows a setpoint within 0.001 m and reports its position', async () => {
    const p = await plant([part('pick1', 'pick-place', [0, 0, 0], { variant: 'numeric' })]);
    const cmd = { 'pick1.xSet': 0.7, 'pick1.ySet': 0.3 };
    p.until(() => Math.abs((p.sense('pick1')['pick1.xPos'] as number) - 0.7) < 0.001, cmd);
    p.run(500, cmd);
    expect(p.sense('pick1')['pick1.xPos']).toBeCloseTo(0.7, 3);
    expect(p.sense('pick1')['pick1.yPos']).toBeCloseTo(0.3, 3);
    expect(p.facts('pick1')['axis:pick1:x']).toBeCloseTo(0.7, 3);
    expect(p.facts('pick1')['axis:pick1:y']).toBeCloseTo(0.3, 3);
  });

  it('PRT-003 a setpoint outside the stroke is clamped and a non-finite one is ignored', async () => {
    const p = await plant([part('pick1', 'pick-place', [0, 0, 0], { variant: 'numeric', strokeXM: 1 })]);
    p.run(5000, { 'pick1.xSet': 9 });
    expect(p.sense('pick1')['pick1.xPos']).toBe(1);
    p.run(5000, { 'pick1.xSet': -4 });
    expect(p.sense('pick1')['pick1.xPos']).toBe(0);
    p.run(5000, { 'pick1.xSet': 0.5 });
    p.run(2000, { 'pick1.xSet': Number.NaN });
    expect(p.sense('pick1')['pick1.xPos']).toBeCloseTo(0.5, 3);
    p.run(2000, {}); // an absent setpoint keeps the previous target
    expect(p.sense('pick1')['pick1.xPos']).toBeCloseTo(0.5, 3);
  });

  it('PRT-004 the digital and numeric variants make the same motion for the same trajectory', async () => {
    const cfg = { speedMps: 0.2, accelMps2: 3 };
    const num = await plant([part('pick1', 'pick-place', [0, 0, 0], { ...cfg, variant: 'numeric' })]);
    num.until(() => Math.abs((num.sense('pick1')['pick1.xPos'] as number) - 0.6) < 0.0005, { 'pick1.xSet': 0.6 });
    num.run(500, { 'pick1.xSet': 0.6 });
    const dig = await plant([part('pick1', 'pick-place', [0, 0, 0], cfg)]);
    const brake = (cfg.speedMps * cfg.speedMps) / (2 * cfg.accelMps2);
    dig.until(() => (dig.facts('pick1')['axis:pick1:x'] as number) >= 0.6 - brake, { 'pick1.xPlus': true });
    dig.run(1000);
    const a = num.body('pick1-pad').p;
    const b = dig.body('pick1-pad').p;
    for (let k = 0; k < 3; k += 1) expect(Math.abs(a[k]! - b[k]!)).toBeLessThan(0.002);
  });

  it('PLT-007 a pick-place with a vacuum gripper picks a box and places it on a belt', async () => {
    const p = await pickAndPlace();
    pickPlaceCycle(p);
    const facts = p.facts('pick1');
    expect(facts).toMatchObject({ 'picked:pick1': 1, 'placed:pick1': 1, 'drops:pick1': 0 });
    expect(facts['axis:pick1:x']).toBe(1);
    const box = p.body('box1').p;
    expect(box[0]).toBeCloseTo(1, 1);
    expect(box[1]).toBeCloseTo(BELT_TOP + BOX[1] / 2, 1);
    expect(p.sense('pick1')['pick1.gripped']).toBe(false);
  });

  it('PLT-007 the gantry carries a box along X, Z and Y and lowers it onto a pallet', async () => {
    const p = await plant([
      part('box1', 'box', [0.3, 0, 0.6], { height: '0.3', mass: '2' }),
      part('pallet1', 'pallet', [1.2, 0, 0.6]),
      part('gan1', 'gantry', [0, 0, 0], { variant: 'numeric', strokeYM: 1, strokeZM: 1 }),
    ]);
    p.run(500);
    goto(p, 'gan1', 0, 0.6, false, 0);
    goto(p, 'gan1', 0.3, 0.6, false, 0.6);
    goto(p, 'gan1', 0.3, 0.3, false, 0.6);
    goto(p, 'gan1', 0.3, 0.3, true, 0.6);
    goto(p, 'gan1', 0.3, 0.7, true, 0.6);
    goto(p, 'gan1', 1.2, 0.7, true, 0.4);
    goto(p, 'gan1', 1.2, 0.46, true, 0.4);
    goto(p, 'gan1', 1.2, 0.46, false, 0.4);
    p.run(500);
    expect(p.facts('gan1')).toMatchObject({ 'picked:gan1': 1, 'placed:gan1': 1, 'drops:gan1': 0 });
    expect(p.facts('gan1')['axis:gan1:z']).toBe(0.4);
    const box = p.body('box1').p;
    expect(box[0]).toBeCloseTo(1.2, 1);
    expect(box[2]).toBeCloseTo(0.4, 1);
    expect(box[1]).toBeCloseTo(0.145 + 0.15, 1);
  });

  it('PLT-007 a clamp variant picks a box from a belt stopped by a blade', async () => {
    const p = await plant([
      part('belt', 'belt', [1, BELT_TOP, 0], { length: 2 }),
      part('blade', 'stop-blade', [1.5, BELT_TOP, 0]),
      part('pick1', 'pick-place', [0, 0, 0], { ...NUMERIC, gripper: 'clamp' }),
    ]);
    spawnItem(p.world, 'box1', 'item', BOX, 2, [0.3, BELT_TOP, 0], 0, 'box');
    const run = { 'belt.run': true, 'blade.extend': true };
    p.until(() => Math.abs(p.body('box1').v[0]) < 0.01 && p.body('box1').p[0] > 1, run);
    p.run(200, run);
    const stop = p.body('box1').p[0];
    expect(stop).toBeGreaterThan(1.2);
    const go = (x: number, y: number, grip: boolean) => {
      const cmd = { ...run, 'pick1.xSet': x, 'pick1.ySet': y, 'pick1.grip': grip };
      p.until(
        () =>
          Math.abs((p.sense('pick1')['pick1.xPos'] as number) - x) < 0.001 &&
          Math.abs((p.sense('pick1')['pick1.yPos'] as number) - y) < 0.001,
        cmd,
      );
      p.run(grip ? 400 : 100, cmd);
    };
    go(stop, 1, false);
    go(stop, 0.8, false);
    go(stop, 0.8, true);
    expect(p.facts('pick1')['picked:pick1']).toBe(1);
    expect(p.sense('pick1')['pick1.gripped']).toBe(true);
    go(stop, 1, true);
    expect(p.body('box1').p[1]).toBeGreaterThan(0.7);
    const view = p.rt('pick1').views()[0]!;
    expect(view.state).toMatchObject({ holding: true, gripper: 'clamp', closeFraction: 1 });
  });

  it('PRT-008 stuckX stops the X axis, stuckY the Y axis, the gripped sensor can be stuck, an unknown action throws', async () => {
    const p = await plant([part('pick1', 'pick-place', [0, 0, 0], { variant: 'numeric', strokeYM: 1 })]);
    const rt = p.rt('pick1');
    expect(manipulatorParts.map((d) => d.actions)).toEqual([
      ['stuckX', 'stuckY', 'gripFail', 'dropLoad', 'grippedStuckOn', 'grippedStuckOff'],
      ['stuckX', 'stuckY', 'stuckZ', 'gripFail', 'dropLoad', 'grippedStuckOn', 'grippedStuckOff'],
    ]);
    rt.act('stuckX');
    p.run(2000, { 'pick1.xSet': 0.8, 'pick1.ySet': 0.4 });
    expect(p.facts('pick1')).toMatchObject({ 'axis:pick1:x': 0, 'axis:pick1:y': 0.4 });
    rt.act('stuckY');
    p.run(1000, { 'pick1.ySet': 0.1 });
    expect(p.facts('pick1')['axis:pick1:y']).toBe(0.4);
    rt.act('grippedStuckOn');
    p.run(50);
    expect(p.sense('pick1')['pick1.gripped']).toBe(true);
    expect(rt.facts()['picked:pick1']).toBe(0);
    expect(() => rt.act('nope')).toThrow('part "pick1" has no action "nope"');
    expect(() => rt.act('stuckZ')).toThrow('part "pick1" has no action "stuckZ"');

    const q = await pickAndPlace();
    goto(q, 'pick1', 0, 0.5, false);
    goto(q, 'pick1', 0.4, 0.5, false);
    goto(q, 'pick1', 0.4, 0.3, false);
    goto(q, 'pick1', 0.4, 0.3, true);
    expect(q.sense('pick1')['pick1.gripped']).toBe(true);
    q.rt('pick1').act('grippedStuckOff');
    q.run(10, { 'pick1.grip': true });
    expect(q.sense('pick1')['pick1.gripped']).toBe(false);
    q.rt('pick1').act('dropLoad');
    q.run(2000, { 'pick1.grip': true });
    expect(q.facts('pick1')['drops:pick1']).toBe(1);
  });

  it('PRT-003 the manipulator config honours its limits', () => {
    const scene = (config: ScenePart['config'], id = 'pick-place') => ({
      schemaVersion: 1,
      name: 't',
      cameras: [],
      parts: [part('m1', id, [0, 0, 0], config)],
    });
    expect(validateScene(scene({ strokeXM: 5 }), catalogue)).toEqual([
      { path: 'parts[0].config.strokeXM', message: 'strokeXM 5 is above the limit 3 m' },
    ]);
    expect(validateScene(scene({ maxLoadKg: 0.5 }), catalogue)[0]?.path).toBe('parts[0].config.maxLoadKg');
    expect(validateScene(scene({ strokeZM: 5 }, 'gantry'), catalogue)[0]?.path).toBe('parts[0].config.strokeZM');
    expect(validateScene(scene({ strokeZM: 1 }), catalogue)[0]?.path).toBe('parts[0].config.strokeZM'); // a two-axis part has no Z
    expect(validateScene(scene({ variant: 'numeric', gripper: 'clamp' }), catalogue)).toEqual([]);
  });

  it('PRT-002 each part has English and Spanish names, documentation and equations', () => {
    expect(manipulatorParts.map((d) => d.id)).toEqual(['pick-place', 'gantry']);
    for (const d of manipulatorParts) {
      expect(d.names.en.length).toBeGreaterThan(3);
      expect(d.names.es.length).toBeGreaterThan(3);
      for (const lang of ['en', 'es'] as const) {
        expect(d.doc[lang].length).toBeGreaterThan(100);
        expect(d.equations![lang].length).toBeGreaterThan(50);
        for (const word of ['grip', 'stuckX', 'axis:']) expect(d.doc[lang]).toContain(word);
      }
    }
  });

  it('PRT-010 adding the parts changes no scene schema version', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PRT-007 the snap points span the footprint and name the pick and place anchors', () => {
    const snaps = (id: string, config: ScenePart['config']) => defs.find((d) => d.id === id)!.snapPoints(part('m1', id, [0, 0, 0], config));
    const flat = snaps('pick-place', { strokeXM: 2 });
    expect(flat.map((s) => s.name)).toEqual(['corner0', 'corner1', 'corner2', 'corner3', 'pickLow', 'placeLow']);
    const xs = flat.slice(0, 4).map((s) => s.position[0]);
    const zs = flat.slice(0, 4).map((s) => s.position[2]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.6, 9);
    expect(flat.find((s) => s.name === 'placeLow')).toMatchObject({ position: [2, 0, 0], accepts: expect.arrayContaining(['belt']) });
    const gantryZ = snaps('gantry', { strokeZM: 2 })
      .slice(0, 4)
      .map((s) => s.position[2]);
    expect(Math.max(...gantryZ) - Math.min(...gantryZ)).toBe(2);
  });

  it('PLT-010 the view state carries the keys the view and panel read, plus a frame and a beam with no signals', async () => {
    const p = await pickAndPlace();
    goto(p, 'pick1', 0.5, 0.25, false);
    const views: readonly PartView[] = p.rt('pick1').views();
    expect(views.map((v) => [v.id, v.part])).toEqual([
      ['pick1', 'pick-place'],
      ['pick1-frame', 'manipulator-frame'],
      ['pick1-beam', 'manipulator-beam'],
    ]);
    expect(views[0]!.state).toEqual({
      x: 0.5,
      y: 0.25,
      z: 0,
      strokeX: 1.2,
      strokeY: 1,
      strokeZ: 0,
      fraction: 0.5 / 1.2,
      text: 'X 0.50 m, Y 0.25 m',
      holding: false,
      gripper: 'vacuum',
      variant: 'numeric',
      closeFraction: 0,
    });
    expect(views[0]!.signals).toEqual({ xPos: 0.5, yPos: 0.25, gripped: false });
    expect(views[0]!.pose.size).toEqual([0.3, 0.03, 0.2]);
    expect(views[0]!.pose.p[0]).toBeCloseTo(0.5, 9);
    for (const v of views.slice(1)) expect([v.signals, v.name]).toEqual([{}, 'pick1']);
  });

  it('PLT-010 the gantry view text names the Z axis', async () => {
    const p = await plant([part('gan1', 'gantry', [0, 0, 0], { variant: 'numeric' })]);
    p.run(2000, { 'gan1.zSet': 0.5 });
    expect(p.rt('gan1').views()[0]!.state).toMatchObject({ z: 0.5, strokeZ: 1, text: 'X 0.00 m, Y 0.00 m, Z 0.50 m' });
  });

  it('PLT-006 a pick and place cycle gives the same trace on three fresh worlds', async () => {
    const run = async () => {
      const p = await pickAndPlace();
      const nums: number[] = [];
      const sample = () => nums.push(...p.body('box1').p, ...p.body('pick1-pad').p);
      const orig = p.run;
      p.run = (ms, c) => {
        orig(ms, c);
        sample();
      };
      pickPlaceCycle(p);
      return createHash('sha256').update(new Float64Array(nums)).digest('hex') + JSON.stringify(p.facts('pick1'));
    };
    const [a, b, c] = [await run(), await run(), await run()];
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(a).toContain('"picked:pick1":1');
  });

  it('PLT-006 a rotated part moves its pad along its own local axes', async () => {
    const p = await plant([part('pick1', 'pick-place', [1, 0, 1], { variant: 'numeric' }, 90)]);
    p.run(3000, { 'pick1.xSet': 0.6 });
    const pad = p.body('pick1-pad').p;
    expect(pad[0]).toBeCloseTo(1, 3);
    expect(pad[2]).toBeCloseTo(0.4, 3); // local +x turned by 90 degrees about +y points to world -z
  });
});
