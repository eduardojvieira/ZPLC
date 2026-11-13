import { afterEach, describe, expect, it } from 'bun:test';
import type { ScenePart } from '../../contracts';
import { createCatalogue } from '../catalogue';
import { loadJolt } from '../jolt';
import { validateScene } from '../scene';
import { SCENE_SCHEMA_VERSION } from '../sceneSchema';
import { createWorld, type PhysicsWorld } from '../world';
import { conveyorParts } from './conveyors';
import { itemParts, trackedItems, type PartRuntime } from './items';
import { sourceParts } from './sources';

const defs = [...itemParts, ...conveyorParts, ...sourceParts];
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
  return {
    world,
    runtimes,
    run(ms: number, commands: Record<string, boolean | number> = {}) {
      for (let i = 0; i < ms / 5; i += 1) {
        for (const r of runtimes) r.beforeStep(commands);
        world.step(5);
        for (const r of runtimes) r.afterStep();
      }
    },
    body: (id: string) => world.bodies().find((b) => b.id === id)!,
  };
}
const check = (p: ScenePart) => validateScene({ schemaVersion: 1, name: 'x', cameras: [], parts: [p] }, catalogue);

describe('workpiece item', () => {
  it('PRT-001 the catalogue has a workpiece with English and Spanish names and documentation', () => {
    const d = defs.find((x) => x.id === 'workpiece')!;
    expect(d.family).toBe('items');
    expect(d.names).toEqual({ en: 'Workpiece', es: 'Pieza' });
    expect(d.doc.en.length).toBeGreaterThan(10);
    expect(d.doc.es.length).toBeGreaterThan(10);
    expect(catalogue.get('workpiece')).toBeDefined();
  });

  it('PRT-003 a workpiece honours its colour, material, code and mass settings and refuses one outside them', () => {
    expect(check(part('w', 'workpiece', [0, 0, 0], { colour: 'blue', material: 'metal', code: 9, mass: 5 }))).toEqual([]);
    for (const [key, value] of [
      ['code', 10],
      ['mass', 6],
      ['mass', 0.05],
      ['colour', 'green'],
      ['material', 'wood'],
    ] as const) {
      const bad = check(part('w', 'workpiece', [0, 0, 0], { [key]: value }));
      expect(bad.length).toBe(1);
      expect(bad[0]!.path).toBe(`parts[0].config.${key}`);
    }
  });

  it('PRT-001 an initial workpiece spawns with the right size, mass and properties in trackedItems', async () => {
    const p = await plant([
      part('w1', 'workpiece', [0, 0, 0], { colour: 'blue', material: 'metal', code: 3, mass: 1.5 }),
      part('w2', 'workpiece', [1, 0, 0]),
    ]);
    expect(trackedItems(p.world).get('w1')).toEqual({
      kind: 'item',
      size: [0.2, 0.1, 0.2],
      massKg: 1.5,
      colour: 'blue',
      metal: true,
      code: 3,
    });
    expect(trackedItems(p.world).get('w2')).toEqual({ kind: 'item', size: [0.2, 0.1, 0.2], massKg: 0.5, colour: 'red', metal: false });
    const view = p.runtimes[0]!.views()[0]!;
    expect(view.part).toBe('workpiece');
    expect(view.pose).toMatchObject({ colour: 'blue', metal: true, code: 3 });
    expect(p.runtimes[1]!.views()[0]!.pose).not.toHaveProperty('code');
  });

  it('PRT-010 adding the workpiece changes no scene schema version', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PLT-007 a workpiece rests on a belt and rides it', async () => {
    const p = await plant([part('belt', 'belt', [0, 0, 0], { length: 4 }), part('w', 'workpiece', [-1, 0.0, 0])]);
    const x0 = p.body('w').p[0];
    p.run(1500, { 'belt.run': true });
    const b = p.body('w');
    expect(b.p[0]).toBeGreaterThan(x0 + 0.3);
    expect(b.p[1]).toBeGreaterThan(0.04);
  });

  it('PRT-001 a box, a pallet, a lid and a base keep their ItemInfo shape and gain a box code only when set', async () => {
    const p = await plant([
      part('b', 'box', [0, 0, 0]),
      part('c', 'box', [1, 0, 0], { code: 2 }),
      part('pl', 'pallet', [3, 0, 0]),
      part('l', 'lid', [5, 0, 0]),
      part('ba', 'base', [6, 0, 0]),
    ]);
    const t = trackedItems(p.world);
    expect(t.get('b')).toEqual({ kind: 'item', size: [0.4, 0.3, 0.3], massKg: 2, tag: 'box' });
    expect(t.get('c')).toEqual({ kind: 'item', size: [0.4, 0.3, 0.3], massKg: 2, tag: 'box', code: 2 });
    expect(t.get('pl')).toEqual({ kind: 'pallet', size: [1.2, 0.144, 0.8], massKg: 25 });
    expect(t.get('l')!.tag).toBe('lid');
    expect(t.get('ba')!.tag).toBe('base');
    expect(p.runtimes[0]!.views()[0]!.pose).not.toHaveProperty('colour');
  });
});
