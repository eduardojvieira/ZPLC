import { afterEach, describe, expect, it } from 'bun:test';
import type { ItemColour, PlantCore, PlantSceneFile, ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { createPlantCore } from '../plantCore';
import { validateScene } from '../scene';
import { SCENE_SCHEMA_VERSION } from '../sceneSchema';
import { sensorParts } from './sensors';

const cores: PlantCore[] = [];
afterEach(() => {
  for (const c of cores.splice(0)) c.dispose();
});

const part = (
  id: string,
  partId: string,
  position: [number, number, number],
  config: ScenePart['config'] = {},
  rotationYDeg = 0,
): ScenePart => ({
  id,
  part: partId,
  name: id.replace(/-/g, '_'),
  position,
  rotationYDeg,
  config,
});
const make = async (parts: ScenePart[]) => {
  const scene: PlantSceneFile = { schemaVersion: 1, name: 'test', parts, cameras: [] };
  const core = await createPlantCore(scene);
  cores.push(core);
  return core;
};
const TOP = 0.45;
const run = (core: PlantCore, ms: number) => {
  for (let t = 0; t < ms; t += 5) core.advance(5);
};
/** A sensor at z = -0.5 aiming along +z across the belt, 0.3 m long, low enough to hit a 0.1 m workpiece. */
const eye = (partId: string, config: ScenePart['config'] = {}) =>
  part('eye', partId, [0, TOP, -0.5], { rangeM: 0.3, heightM: 0.05, ...config }, 270);
const belt = part('belt', 'belt', [0, TOP, 0], { length: 4 });
// Items sit at z = -0.25 so that every sensor (the inductive one reaches 0.3 m at most) can reach their near face; a pallet is wider and
// sits at z = 0.
const piece = (config: ScenePart['config']) => part('w', 'workpiece', [0, TOP, -0.25], config);
const NEW = ['sensor-inductive', 'sensor-capacitive', 'sensor-colour'];
const catalogue = createCatalogue(sensorParts);
const check = (p: ScenePart) => validateScene({ schemaVersion: 1, name: 'x', cameras: [], parts: [p] }, catalogue);

const detects = async (sensor: string, items: ScenePart[], box?: 'box' | 'pallet', config: ScenePart['config'] = {}) => {
  const core = await make([belt, eye(sensor, config), ...items]);
  if (box) core.addItem(box, [0, TOP, box === 'pallet' ? 0 : -0.25]);
  run(core, 100);
  return core;
};

describe('inductive, capacitive and colour sensors', () => {
  it('PRT-006 an inductive sensor detects a metal workpiece and not a plastic one, a box or a pallet', async () => {
    expect((await detects('sensor-inductive', [piece({ material: 'metal' })])).sense()['eye.detect']).toBe(true);
    expect((await detects('sensor-inductive', [piece({ material: 'plastic' })])).sense()['eye.detect']).toBe(false);
    expect((await detects('sensor-inductive', [], 'box')).sense()['eye.detect']).toBe(false);
    expect((await detects('sensor-inductive', [], 'pallet', { heightM: 0.05 })).sense()['eye.detect']).toBe(false);
    expect((await detects('sensor-inductive', [])).sense()['eye.detect']).toBe(false);
  });

  it('PRT-006 a capacitive sensor detects a box, a workpiece and a pallet', async () => {
    expect((await detects('sensor-capacitive', [], 'box')).sense()['eye.detect']).toBe(true);
    expect((await detects('sensor-capacitive', [piece({})])).sense()['eye.detect']).toBe(true);
    expect((await detects('sensor-capacitive', [], 'pallet')).sense()['eye.detect']).toBe(true);
    expect((await detects('sensor-capacitive', [])).sense()['eye.detect']).toBe(false);
  });

  it('PRT-006 a colour sensor sets detect for any item and match only for its target colour', async () => {
    for (const [colour, target, match] of [
      ['red', 'red', true],
      ['blue', 'red', false],
      ['blue', 'blue', true],
      ['red', 'blue', false],
    ] as [ItemColour, ItemColour, boolean][]) {
      const s = (await detects('sensor-colour', [piece({ colour })], undefined, { target })).sense();
      expect([s['eye.detect'], s['eye.match']]).toEqual([true, match]);
    }
    const box = (await detects('sensor-colour', [], 'box')).sense(); // a box has no colour
    expect([box['eye.detect'], box['eye.match']]).toEqual([true, false]);
    const none = (await detects('sensor-colour', [])).sense();
    expect([none['eye.detect'], none['eye.match']]).toEqual([false, false]);
  });

  it('PRT-008 stuckOn and stuckOff force detect, wrongColour inverts match, an unknown action throws a located message', async () => {
    const core = await detects('sensor-colour', [piece({ colour: 'red' })], undefined, { target: 'red' });
    core.act('eye', 'wrongColour');
    run(core, 10);
    expect([core.sense()['eye.detect'], core.sense()['eye.match']]).toEqual([true, false]);
    core.act('eye', 'stuckOff');
    run(core, 10);
    expect(core.sense()['eye.detect']).toBe(false);
    core.act('eye', 'stuckOn');
    run(core, 10);
    expect(core.sense()['eye.detect']).toBe(true);
    expect(() => core.act('eye', 'melt')).toThrow('has no action "melt"; it has: stuckOn, stuckOff, wrongColour');
    const plain = await detects('sensor-inductive', []);
    expect(() => plain.act('eye', 'wrongColour')).toThrow('has no action "wrongColour"; it has: stuckOn, stuckOff');
  });

  it('PLT-010 count counts rising edges of detect for the three new sensors', async () => {
    for (const sensor of NEW) {
      const core = await make([belt, eye(sensor), piece({ material: 'metal' })]);
      run(core, 50);
      expect(core.facts()['count:eye']).toBe(1);
      run(core, 50);
      expect(core.facts()['count:eye']).toBe(1); // still detecting: no new edge
    }
  });

  it('PRT-003 the range and height settings are honoured and refused outside their limits', async () => {
    for (const [id, min, max] of [
      ['sensor-inductive', 0.02, 0.3],
      ['sensor-capacitive', 0.02, 0.5],
      ['sensor-colour', 0.05, 1],
    ] as const) {
      expect(check(part('s', id, [0, 0, 0], { rangeM: max, heightM: 2 }))).toEqual([]);
      expect(check(part('s', id, [0, 0, 0], { rangeM: min }))).toEqual([]);
      for (const bad of [min / 2, max * 2]) {
        const e = check(part('s', id, [0, 0, 0], { rangeM: bad }));
        expect(e.length).toBe(1);
        expect(e[0]!.path).toBe('parts[0].config.rangeM');
      }
      expect(check(part('s', id, [0, 0, 0], { heightM: 3 }))[0]!.path).toBe('parts[0].config.heightM');
    }
    expect(check(part('s', 'sensor-colour', [0, 0, 0], { target: 'green' }))[0]!.path).toBe('parts[0].config.target');
    // The range is honoured: an item 0.35 m away is out of a 0.1 m inductive beam and inside a 0.3 m one.
    const near = await make([belt, eye('sensor-inductive', { rangeM: 0.1 }), piece({ material: 'metal' })]);
    const far = await make([belt, eye('sensor-inductive', { rangeM: 0.3 }), piece({ material: 'metal' })]);
    run(near, 50);
    run(far, 50);
    expect(near.sense()['eye.detect']).toBe(false);
    expect(far.sense()['eye.detect']).toBe(true);
  });

  it('VIS-003 every beam sensor view carries beamLength equal to its rangeM', async () => {
    for (const [sensor, range] of [
      ['sensor-diffuse', 0.5],
      ['sensor-retro', 1.5],
      ['sensor-inductive', 0.1],
      ['sensor-capacitive', 0.15],
      ['sensor-colour', 0.3],
    ] as const) {
      const core = await make([eye(sensor, { rangeM: range })]);
      const view = core.snapshot().parts.find((p) => p.name === 'eye')!;
      expect(view.state.beamLength).toBe(range);
    }
    const dflt = await make([part('eye', 'sensor-diffuse', [0, 0, 0])]);
    expect(dflt.snapshot().parts[0]!.state.beamLength).toBe(0.5);
  });

  it('PRT-002 each part has English and Spanish names and documentation, and signals match the table', () => {
    for (const id of NEW) {
      const d = sensorParts.find((x) => x.id === id)!;
      expect(d.family).toBe('sensors');
      expect(d.names.en.length).toBeGreaterThan(3);
      expect(d.names.es.length).toBeGreaterThan(3);
      expect(d.doc.en.length).toBeGreaterThan(10);
      expect(d.doc.es.length).toBeGreaterThan(10);
      expect(d.signals(part('eye', id, [0, 0, 0])).map((s) => s.name)).toEqual(
        id === 'sensor-colour' ? ['eye.detect', 'eye.match'] : ['eye.detect'],
      );
    }
  });

  it('PRT-010 adding the parts changes no scene schema version', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PRT-006 the diffuse and retro sensors detect exactly as before', async () => {
    for (const sensor of ['sensor-diffuse', 'sensor-retro']) {
      expect((await detects(sensor, [], 'box')).sense()['eye.detect']).toBe(true);
      expect((await detects(sensor, [])).sense()['eye.detect']).toBe(false);
    }
  });
});
