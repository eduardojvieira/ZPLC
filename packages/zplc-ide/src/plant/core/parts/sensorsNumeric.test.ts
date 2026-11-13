import { afterEach, describe, expect, it } from 'bun:test';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { SCENE_SCHEMA_VERSION } from '../sceneSchema';
import { createWorld, type PhysicsWorld } from '../world';
import { conveyorParts } from './conveyors';
import { itemParts, type PartRuntime } from './items';
import { numericSensorParts } from './sensorsNumeric';

const defs = [...itemParts, ...conveyorParts, ...numericSensorParts];
const catalogue = createCatalogue(defs);
const part = (id: string, partId: string, position: [number, number, number], config: ScenePart['config'] = {}): ScenePart => ({
  id,
  part: partId,
  name: id.replace(/-/g, '_'),
  position,
  rotationYDeg: 0,
  config,
});

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
  const rt = (name: string) => runtimes[scene.findIndex((p) => p.id === name)]!;
  return {
    world,
    rt,
    run(ms: number, commands: Record<string, boolean | number> = {}) {
      for (let i = 0; i < ms / 5; i += 1) {
        for (const r of runtimes) r.beforeStep(commands);
        world.step(5);
        for (const r of runtimes) r.afterStep();
      }
    },
    sense: (name: string) => rt(name).sense(),
  };
}
const check = (p: ScenePart) => validateScene({ schemaVersion: 1, name: 'x', cameras: [], parts: [p] }, catalogue);
const array = (config: ScenePart['config'] = {}) => part('arr', 'light-array', [0, 0, -0.5], config);
const box = (id: string, x: number, config: ScenePart['config'] = {}, z = 0) => part(id, 'box', [x, 0, z], config);

describe('light array', () => {
  it('PRT-005 the light array reports 0.20, 0.30 and 0.40 for the three box heights and 0 for an empty belt', async () => {
    const empty = await plant([array()]);
    empty.run(50);
    expect(empty.sense('arr')).toEqual({ 'arr.height': 0, 'arr.detect': false });
    for (const h of ['0.2', '0.3', '0.4']) {
      const p = await plant([array(), box('b', 0, { height: h })]);
      p.run(200);
      expect(p.sense('arr')['arr.height']).toBe(Number(h));
      expect(p.sense('arr')['arr.detect']).toBe(true);
    }
  });

  it('PRT-005 a lid on a base reads the top of the lid', async () => {
    const alone = await plant([array(), part('ba', 'base', [0, 0, 0])]);
    alone.run(100);
    expect(alone.sense('arr')['arr.height']).toBe(0.15);
    const p = await plant([array(), part('ba', 'base', [0, 0, 0]), part('l', 'lid', [0, 0.152, 0])]);
    p.run(300);
    expect(p.sense('arr')['arr.height']).toBe(0.2);
  });

  it('PRT-005 the light array height is inside 0 to beams times pitch for any item', async () => {
    const p = await plant([array({ beams: 4, pitchM: 0.05 }), box('b', 0, { height: '0.4' })]);
    p.run(200);
    expect(p.sense('arr')['arr.height']).toBe(0.2);
    const sig = defs.find((d) => d.id === 'light-array')!.signals(array({ beams: 4, pitchM: 0.05 }));
    expect(sig.find((s) => s.name === 'arr.height')).toMatchObject({ type: 'REAL', unit: 'm', range: { min: 0, max: 0.2 } });
    const dflt = defs.find((d) => d.id === 'light-array')!.signals(array());
    expect(dflt.find((s) => s.name === 'arr.height')!.range).toEqual({ min: 0, max: 0.6 });
  });
});

describe('scale', () => {
  const scale = (config: ScenePart['config'] = {}) => part('sc', 'scale', [0, 0, 0], config);

  it('PRT-005 the scale reports the mass of a box at rest, the sum of two boxes, and 0 while the box moves', async () => {
    const one = await plant([scale(), box('b', 0, { mass: '5' })]);
    one.run(800);
    expect(one.sense('sc')).toEqual({ 'sc.weight': 5, 'sc.stable': true });
    const two = await plant([scale(), box('b', 0, { mass: '5' }, -0.16), box('c', 0, { mass: '2' }, 0.16)]);
    two.run(800);
    expect(two.sense('sc')['sc.weight']).toBe(7);
    const moving = await plant([scale(), part('belt', 'belt', [0, 0, 0], { length: 4 }), box('b', -0.2, { mass: '5' })]);
    for (let i = 0; i < 100; i += 1) {
      moving.run(5, { 'belt.run': true });
      expect(moving.sense('sc')).toEqual({ 'sc.weight': 0, 'sc.stable': false });
    }
  });

  it('PRT-005 the scale is stable only after settleMs at rest', async () => {
    const p = await plant([scale({ settleMs: 300 }), box('b', 0, { mass: '5' })]);
    p.run(100);
    expect(p.sense('sc')).toEqual({ 'sc.weight': 0, 'sc.stable': false });
    p.run(500);
    expect(p.sense('sc')).toEqual({ 'sc.weight': 5, 'sc.stable': true });
  });

  it('PRT-005 the scale reading is inside 0 to rangeKg and a heavier load saturates at rangeKg', async () => {
    const p = await plant([scale({ rangeKg: 5 }), box('b', 0, { mass: '5' }, -0.16), box('c', 0, { mass: '5' }, 0.16)]);
    p.run(800);
    expect(p.sense('sc')['sc.weight']).toBe(5);
    const sig = defs.find((d) => d.id === 'scale')!.signals(scale({ rangeKg: 5 }));
    expect(sig.find((s) => s.name === 'sc.weight')).toMatchObject({ type: 'REAL', unit: 'kg', range: { min: 0, max: 5 } });
  });
});

describe('vision sensor', () => {
  const eye = part('eye', 'vision-sensor', [0, 0, 0]);
  const work = (id: string, x: number, code: number) => part(id, 'workpiece', [x, 0, 0], { code });

  it(
    'PRT-005 the vision sensor reports the code of the item in view, 0 for an unlabelled item and for an empty field, and the nearest ' +
      'item when two are in view',
    async () => {
      const empty = await plant([eye]);
      empty.run(50);
      expect(empty.sense('eye')).toEqual({ 'eye.code': 0, 'eye.detect': false });
      const coded = await plant([eye, box('b', 0, { code: 3 })]);
      coded.run(100);
      expect(coded.sense('eye')).toEqual({ 'eye.code': 3, 'eye.detect': true });
      const plain = await plant([eye, box('b', 0)]);
      plain.run(100);
      expect(plain.sense('eye')).toEqual({ 'eye.code': 0, 'eye.detect': true });
      const two = await plant([eye, work('far', -0.2, 5), work('near', 0.05, 2)]);
      two.run(100);
      expect(two.sense('eye')['eye.code']).toBe(2);
    },
  );

  it('PRT-005 the vision code is an integer 0 to 9', async () => {
    const sig = defs.find((d) => d.id === 'vision-sensor')!.signals(eye);
    expect(sig.find((s) => s.name === 'eye.code')).toMatchObject({ type: 'INT', unit: 'code', range: { min: 0, max: 9 } });
    const p = await plant([eye, box('b', 0, { code: 9 })]);
    p.run(100);
    const c = p.sense('eye')['eye.code'] as number;
    expect(Number.isInteger(c) && c >= 0 && c <= 9).toBe(true);
  });
});

describe('numeric sensor faults and catalogue', () => {
  it(
    'PRT-008 readingStuck holds the last reading, readingOffset adds its offset and clamps, blind reads 0, misread reads another code, ' +
      'an unknown action throws a located message',
    async () => {
      const p = await plant([
        array(),
        part('sc', 'scale', [3, 0, 0], { rangeKg: 5 }),
        part('eye', 'vision-sensor', [6, 0, 0]),
        box('a', 0),
        box('c', 3, { mass: '5' }),
        box('d', 6, { code: 4 }),
      ]);
      p.run(800);
      expect(p.sense('arr')['arr.height']).toBe(0.3);
      p.rt('arr').act('readingOffset');
      p.run(5);
      expect(p.sense('arr')['arr.height']).toBe(0.35);
      p.rt('sc').act('readingOffset');
      p.run(5);
      expect(p.sense('sc')['sc.weight']).toBe(5); // 5 + 2 clamps at rangeKg
      p.rt('eye').act('misread');
      p.run(5);
      expect(p.sense('eye')['eye.code']).toBe(5);
      p.rt('eye').act('blind');
      p.run(5);
      expect(p.sense('eye')['eye.code']).toBe(0);
      for (const n of ['arr', 'sc', 'eye']) expect(() => p.rt(n).act('nope')).toThrow(`part "${n}" has no action "nope"`);

      const s = await plant([array({ pitchM: 0.05 }), box('a', 0)]);
      s.run(200);
      s.rt('arr').act('readingStuck');
      s.world.removeBody('a');
      s.run(100);
      expect(s.sense('arr')['arr.height']).toBe(0.3);
      expect(s.sense('arr')['arr.detect']).toBe(false);
    },
  );

  it('PLT-010 detect is true while any item is in the field or any beam hits', async () => {
    const p = await plant([array(), part('eye', 'vision-sensor', [0, 0, 0]), box('a', 0)]);
    p.run(100);
    expect(p.sense('arr')['arr.detect']).toBe(true);
    expect(p.sense('eye')['eye.detect']).toBe(true);
    p.world.removeBody('a');
    p.run(10);
    expect(p.sense('arr')['arr.detect']).toBe(false);
    expect(p.sense('eye')['eye.detect']).toBe(false);
    expect(p.rt('arr').facts()).toEqual({ 'count:arr': 1 });
    expect(p.rt('eye').facts()).toEqual({});
  });

  it('PRT-003 beams above 32 and a pitch below 0.025 are refused with a located message', () => {
    for (const [key, value] of [
      ['beams', 33],
      ['pitchM', 0.02],
      ['spanM', 1.3],
    ] as const) {
      const bad = check(array({ [key]: value }));
      expect(bad.length).toBe(1);
      expect(bad[0]!.path).toBe(`parts[0].config.${key}`);
    }
    expect(check(array({ beams: 32, pitchM: 0.025 }))).toEqual([]);
  });

  it('PRT-002 each part has English and Spanish names and documentation', () => {
    expect(numericSensorParts.map((d) => d.id)).toEqual(['light-array', 'scale', 'vision-sensor']);
    for (const d of numericSensorParts) {
      expect(d.family).toBe('sensors');
      expect(d.names.en.length).toBeGreaterThan(2);
      expect(d.names.es.length).toBeGreaterThan(2);
      expect(d.doc.en.length).toBeGreaterThan(10);
      expect(d.doc.es.length).toBeGreaterThan(10);
    }
  });

  it('PRT-010 adding the parts changes no scene schema version', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PRT-007 the snap points span the footprint', () => {
    const span = (id: string, config: ScenePart['config'], n: string) => {
      const pts = defs.find((d) => d.id === id)!.snapPoints(part(n, id, [0, 0, 0], config));
      expect(pts.length).toBe(4);
      return [Math.max(...pts.map((s) => s.position[0])), Math.max(...pts.map((s) => s.position[2]))];
    };
    expect(span('light-array', { spanM: 0.8 }, 'a')).toEqual([0.05, 0.4]);
    expect(span('scale', { lengthM: 0.6, widthM: 0.4 }, 's')).toEqual([0.3, 0.2]);
    expect(span('vision-sensor', { fieldM: 0.5 }, 'v')).toEqual([0.25, 0.25]);
  });

  it('PLT-006 the readings are identical on three runs and the views show the reading', async () => {
    const trace = async () => {
      const p = await plant([
        array(),
        part('sc', 'scale', [0, 0, 0]),
        part('eye', 'vision-sensor', [0, 0, 0]),
        part('belt', 'belt', [-2, 0, 0], { length: 4 }),
        box('a', -2.5, { code: 2 }),
        box('b', 1, { mass: '5' }),
      ]);
      const out: unknown[] = [];
      for (let i = 0; i < 300; i += 1) {
        p.run(5, { 'belt.run': true });
        out.push(p.sense('arr'), p.sense('sc'), p.sense('eye'));
      }
      return { out, views: ['arr', 'sc', 'eye'].map((n) => p.rt(n).views()[0]!) };
    };
    const a = await trace();
    expect(JSON.stringify(await trace())).toBe(JSON.stringify(a));
    expect(JSON.stringify(await trace())).toBe(JSON.stringify(a));
    expect(a.views.map((v) => v.part)).toEqual(['light-array', 'scale', 'vision-sensor']);
    for (const v of a.views) expect(typeof v.state.text).toBe('string');
  });

  it('PRT-005 the views tell the reading as text and as a fraction of the range', async () => {
    const p = await plant([
      array(),
      part('sc', 'scale', [3, 0, 0]),
      part('eye', 'vision-sensor', [6, 0, 0]),
      box('a', 0),
      box('c', 3, { mass: '5' }),
      box('d', 6, { code: 2 }),
    ]);
    p.run(800);
    const [a, s, e] = ['arr', 'sc', 'eye'].map((n) => p.rt(n).views()[0]!);
    expect(a!.state).toMatchObject({ text: '0.30 m', fraction: 0.5 });
    expect(s!.state).toMatchObject({ text: '5.00 kg, stable', fraction: 0.25 });
    expect(e!.state).toMatchObject({ text: 'code 2', fraction: 2 / 9 });
  });
});
