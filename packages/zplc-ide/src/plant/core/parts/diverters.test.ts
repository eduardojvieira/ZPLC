import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { SCENE_SCHEMA_VERSION } from '../sceneSchema';
import { createWorld, type PhysicsWorld } from '../world';
import { conveyorParts } from './conveyors';
import { diverterParts } from './diverters';
import { itemParts, type PartRuntime } from './items';

const defs = [...itemParts, ...conveyorParts, ...diverterParts];
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
/** The minimal composition of the core: a floor with its top at y = 0, then every part in scene order, on a real world. */
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
    sense: (name: string) => runtimes.get(name)!.sense(),
    view: (name: string) => runtimes.get(name)!.views()[0]!,
    rt: (name: string) => runtimes.get(name)!,
    body: (id: string) => world.bodies().find((b) => b.id === id)!,
    run(ms: number, commands: Commands = {}) {
      for (let i = 0; i < ms / 5; i += 1) {
        for (const r of all) r.beforeStep(commands);
        world.step(5);
        for (const r of all) r.afterStep();
      }
    },
    /** Runs until `done()` or `limitMs`; returns the elapsed ms. */
    until(done: () => boolean, commands: Commands, limitMs = 10000) {
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

const TOP = 0.45;
const belt = (id: string, z: number, config: ScenePart['config'] = {}) => part(id, 'belt', [0, TOP, z], { length: 3, ...config });
const box = (id: string, x: number, z = 0) => part(id, 'box', [x, TOP, z], { height: '0.3', mass: '2' });
const check = (p: ScenePart) => validateScene({ schemaVersion: 1, name: 'x', cameras: [], parts: [p] }, catalogue);

describe('pusher', () => {
  it('PRT-003 the pusher extends at its speed to its stroke and retracts, reporting extended and retracted at the limits', async () => {
    const p = await plant([part('push1', 'pusher', [0, TOP, 0], { strokeM: 0.6, speedMps: 0.8, accelMps2: 4 })]);
    const z = () => p.body('push1-plate').p[2];
    expect(p.sense('push1')).toEqual({ 'push1.extended': false, 'push1.retracted': true });
    let max = 0;
    const out = p.until(() => (max = Math.max(max, z())) > 100 || p.sense('push1')['push1.extended'] === true, { 'push1.extend': true });
    // 0.6 m at 0.8 m/s plus the ramp (0.2 s at 4 m/s2): about 0.95 s
    expect(out).toBeGreaterThan(700);
    expect(out).toBeLessThan(1200);
    expect(z()).toBeCloseTo(0.6, 2);
    expect(p.sense('push1')).toEqual({ 'push1.extended': true, 'push1.retracted': false });
    expect(p.view('push1').state).toMatchObject({ fraction: 1, text: 'extended' });
    p.run(300, { 'push1.extend': true });
    expect(z()).toBeLessThan(0.6 + 0.005);
    p.run(100, {});
    expect(p.view('push1').state.text).toBe('moving');
    p.until(() => p.sense('push1')['push1.retracted'] === true, {});
    expect(z()).toBeCloseTo(0, 2);
    expect(p.view('push1').signals).toEqual({ extended: false, retracted: true });
  });

  it('PRT-003 the pusher never leaves 0 to strokeM and ignores a contradictory pair', async () => {
    const p = await plant([part('push1', 'pusher', [0, TOP, 0], { strokeM: 0.4 })]);
    p.rt('push1').act('stuck');
    p.run(1000, { 'push1.extend': true }); // commanded to extend, but stuck at 0
    expect(p.body('push1-plate').p[2]).toBeCloseTo(0, 3);
    expect(p.sense('push1')['push1.retracted']).toBe(true);
    const q = await plant([part('push1', 'pusher', [0, TOP, 0], { strokeM: 0.4 })]);
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < 400; i += 1) {
      // extend and the (nonexistent) opposite command together: only extend is a signal of the part
      q.run(5, { 'push1.extend': i < 200 || i % 7 === 0, 'push1.retract': true });
      lo = Math.min(lo, q.body('push1-plate').p[2]);
      hi = Math.max(hi, q.body('push1-plate').p[2]);
    }
    expect(lo).toBeGreaterThanOrEqual(-0.001);
    expect(hi).toBeLessThanOrEqual(0.4 + 0.005);
  });

  it('PLT-007 a pusher pushes a box off a belt onto a side belt', async () => {
    const p = await plant([belt('belt-a', 0), belt('belt-b', 0.6), part('push1', 'pusher', [0, TOP, -0.45], { strokeM: 1 }), box('b1', 0)]);
    p.run(500); // settle
    p.until(() => p.sense('push1')['push1.extended'] === true, { 'push1.extend': true });
    p.until(() => p.sense('push1')['push1.retracted'] === true, {});
    p.run(500);
    const b = p.body('b1');
    expect(b.p[2]).toBeGreaterThan(0.5); // on the side belt (z 0.3 to 0.9)
    expect(b.p[1]).toBeCloseTo(TOP + 0.15, 2); // resting on it
    expect(Math.hypot(...b.v)).toBeLessThan(0.02);
  });

  it('PLT-007 a box pushed past the edge of the only belt falls to the floor', async () => {
    const p = await plant([belt('belt-a', 0), part('push1', 'pusher', [0, TOP, -0.45], { strokeM: 1 }), box('b1', 0)]);
    p.run(500);
    p.until(() => p.sense('push1')['push1.extended'] === true, { 'push1.extend': true });
    p.until(() => p.sense('push1')['push1.retracted'] === true, {});
    p.run(1000);
    const b = p.body('b1');
    expect(b.p[2]).toBeGreaterThan(0.3);
    expect(b.p[1]).toBeLessThan(0.25); // on the floor, well under the belt top
  });
});

describe('diverter arm', () => {
  // Measured: a 0.4 m box jams against an arm steeper than about 38 degrees, so angleDeg is capped at 35.
  const ARM = { lengthM: 1.2, angleDeg: 30, degPerS: 90 };
  const scene = (angleDeg = 30) => [
    belt('belt-a', 0, { length: 4 }),
    belt('belt-b', 0.6, { length: 4 }),
    part('arm1', 'diverter-arm', [-0.2, TOP, -0.35], { ...ARM, angleDeg }),
    box('b1', -1.7),
  ];

  it('PLT-007 a box crosses to the side belt at the smallest and the largest accepted angle', async () => {
    for (const angle of [25, 35]) {
      const p = await plant(scene(angle));
      p.run(8000, { 'arm1.divert': true, 'belt_a.run': true, 'belt_b.run': true });
      expect(p.body('b1').p[2]).toBeGreaterThan(0.3); // its centre is over the side belt (z 0.3 to 0.9)
    }
  });

  it('PRT-003 the arm swings to angleDeg at degPerS and back, reporting diverted and home within 0.5 degrees', async () => {
    const p = await plant([part('arm1', 'diverter-arm', [0, TOP, 0], { angleDeg: 40, degPerS: 80 })]);
    expect(p.sense('arm1')).toEqual({ 'arm1.diverted': false, 'arm1.home': true });
    const out = p.until(() => p.sense('arm1')['arm1.diverted'] === true, { 'arm1.divert': true });
    // 40 degrees at 80 degrees per second is 0.5 s, plus the ramp
    expect(out).toBeGreaterThan(450);
    expect(out).toBeLessThan(800);
    const e = p.body('arm1-plate');
    // the plate centre is half a length (0.4 m) from the hinge, turned by 40 degrees towards +z
    expect(e.p[0]).toBeCloseTo(0.4 * Math.cos((40 * Math.PI) / 180), 2);
    expect(e.p[2]).toBeCloseTo(0.4 * Math.sin((40 * Math.PI) / 180), 2);
    expect(p.view('arm1').state).toMatchObject({ text: 'diverted' });
    expect(p.view('arm1').state.fraction).toBeCloseTo(1, 2);
    let max = 0;
    p.until(() => ((max = Math.max(max, p.view('arm1').state.fraction as number)), p.sense('arm1')['arm1.home'] === true), {});
    expect(max).toBeLessThanOrEqual(1);
    expect(p.body('arm1-plate').p[2]).toBeCloseTo(0, 1);
    expect(p.view('arm1').state).toMatchObject({ text: 'home', fraction: 0 });
  });

  it('PLT-007 the arm deflects a box travelling on a belt onto a side belt and a retracted arm lets it pass', async () => {
    const hit = await plant(scene());
    hit.run(200, { 'arm1.divert': true });
    hit.run(7000, { 'arm1.divert': true, 'belt_a.run': true, 'belt_b.run': true });
    expect(hit.body('b1').p[2]).toBeGreaterThan(0.35); // sent onto the side belt
    expect(hit.body('b1').p[1]).toBeGreaterThan(TOP + 0.1); // still on a belt, not on the floor
    const pass = await plant(scene());
    pass.run(7000, { 'belt_a.run': true, 'belt_b.run': true });
    expect(Math.abs(pass.body('b1').p[2])).toBeLessThan(0.1); // stayed on its belt
    expect(pass.body('b1').p[0]).toBeGreaterThan(1.5); // and went past the arm
  });
});

describe('diverters, shared rules', () => {
  it('PRT-008 stuck freezes the pusher and the arm where they are, an unknown action throws a located message', async () => {
    const p = await plant([part('push1', 'pusher', [0, TOP, -2], { strokeM: 0.8 }), part('arm1', 'diverter-arm', [0, TOP, 2])]);
    p.run(300, { 'push1.extend': true, 'arm1.divert': true });
    const z = p.body('push1-plate').p;
    const a = p.body('arm1-plate').p;
    expect(z[2]).toBeGreaterThan(-2.0 + 0.05);
    p.rt('push1').act('stuck');
    p.rt('arm1').act('stuck');
    p.run(1500, { 'push1.extend': false, 'arm1.divert': false });
    expect(p.body('push1-plate').p).toEqual(z);
    expect(p.body('arm1-plate').p).toEqual(a);
    expect(p.view('push1').state.stuck).toBe(true);
    expect(() => p.rt('push1').act('jam')).toThrow('part "push1" has no action "jam"');
    expect(() => p.rt('arm1').act('stall')).toThrow('part "arm1" has no action "stall"');
  });

  it('PRT-003 settings outside their limits are refused with a located message', () => {
    expect(check(part('p', 'pusher', [0, 0, 0], { strokeM: 1, widthM: 0.8, heightM: 0.4, speedMps: 1.5, accelMps2: 10 }))).toEqual([]);
    expect(check(part('a', 'diverter-arm', [0, 0, 0], { lengthM: 1.2, heightM: 0.4, angleDeg: 35, degPerS: 180 }))).toEqual([]);
    const bad: [string, string, number][] = [
      ['pusher', 'strokeM', 0.1],
      ['pusher', 'strokeM', 1.1],
      ['pusher', 'widthM', 0.9],
      ['pusher', 'heightM', 0.05],
      ['pusher', 'speedMps', 2],
      ['pusher', 'accelMps2', 0.5],
      ['diverter-arm', 'lengthM', 0.3],
      ['diverter-arm', 'heightM', 0.5],
      ['diverter-arm', 'angleDeg', 40],
      ['diverter-arm', 'angleDeg', 10],
      ['diverter-arm', 'degPerS', 20],
    ];
    for (const [id, key, value] of bad) {
      const errors = check(part('x', id, [0, 0, 0], { [key]: value }));
      expect(errors.length).toBe(1);
      expect(errors[0]!.path).toBe(`parts[0].config.${key}`);
    }
  });

  it('PRT-002 each part has English and Spanish names, documentation', () => {
    expect(diverterParts.map((d) => d.id)).toEqual(['pusher', 'diverter-arm']);
    for (const d of diverterParts) {
      expect(d.family).toBe('flow');
      expect(d.names.en.length).toBeGreaterThan(2);
      expect(d.names.es.length).toBeGreaterThan(2);
      expect(d.names.es).not.toBe(d.names.en);
      expect(d.doc.en).toContain('stuck');
      expect(d.doc.es).toContain('stuck');
      expect(d.doc.en).toContain('+z');
      expect(d.doc.es).toContain('+z');
      expect(catalogue.get(d.id)).toBeDefined();
    }
  });

  it('PRT-010 adding the parts changes no scene schema version', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PRT-007 the snap points span the footprint', () => {
    const span = (pts: readonly { position: readonly number[] }[], axis: 0 | 2) => {
      const v = pts.map((s) => s.position[axis]!);
      return [Math.min(...v), Math.max(...v)];
    };
    const push = diverterParts[0]!.snapPoints(part('p', 'pusher', [0, 0, 0], { widthM: 0.5, strokeM: 0.7 }));
    expect(push.length).toBe(4);
    expect(span(push, 0)).toEqual([-0.25, 0.25]);
    expect(span(push, 2)).toEqual([0, 0.7]);
    const swing = diverterParts[1]!.snapPoints(part('a', 'diverter-arm', [0, 0, 0], { lengthM: 0.9 }));
    expect(swing.length).toBe(4);
    expect(span(swing, 0)).toEqual([0, 0.9]);
    expect(span(swing, 2)).toEqual([0, 0.9]);
  });

  it('PLT-006 the pusher and the arm pose sequence is identical on three runs', async () => {
    const hashes: string[] = [];
    for (let run = 0; run < 3; run += 1) {
      const p = await plant([
        belt('belt-a', 0),
        part('push1', 'pusher', [0.5, TOP, -0.45], { strokeM: 0.8 }, 30),
        part('arm1', 'diverter-arm', [-0.5, TOP, -0.4], { angleDeg: 33 }),
        box('b1', 0),
      ]);
      const h = createHash('sha256');
      for (let i = 0; i < 400; i += 1) {
        p.run(5, { 'push1.extend': i % 200 < 100, 'arm1.divert': i % 150 < 80, 'belt_a.run': true });
        for (const id of ['push1-plate', 'arm1-plate', 'b1']) h.update(JSON.stringify(p.body(id)));
      }
      hashes.push(h.digest('hex'));
    }
    expect(hashes[1]).toBe(hashes[0]!);
    expect(hashes[2]).toBe(hashes[0]!);
  });
});
