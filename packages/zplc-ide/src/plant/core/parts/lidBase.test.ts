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

describe('lid and base items', () => {
  it('PRT-001 the catalogue has a lid and a base with English and Spanish names and documentation', () => {
    for (const [id, en, es] of [
      ['lid', 'Lid', 'Tapa'],
      ['base', 'Base', 'Base'],
    ] as const) {
      const d = defs.find((x) => x.id === id)!;
      expect(d.family).toBe('items');
      expect(d.names).toEqual({ en, es });
      expect(d.doc.en.length).toBeGreaterThan(10);
      expect(d.doc.es.length).toBeGreaterThan(10);
      expect(d.signals(part('x', id, [0, 0, 0]))).toEqual([]);
      expect(d.actions).toEqual([]);
    }
  });

  it('PRT-010 adding lid and base changes no scene schema version', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it('PRT-003 a lid and a base honour their mass setting and refuse one outside it', () => {
    const check = (p: ScenePart) => validateScene({ schemaVersion: 1, name: 'x', cameras: [], parts: [p] }, catalogue);
    for (const id of ['lid', 'base']) {
      expect(check(part(id, id, [0, 0, 0], { mass: 1.5 }))).toEqual([]);
      const bad = check(part(id, id, [0, 0, 0], { mass: 500 }));
      expect(bad.length).toBe(1);
      expect(bad[0]!.path).toBe('parts[0].config.mass');
    }
  });

  it('PRT-001 an emitter of lids and one of bases emit items of the right size, mass and tag', async () => {
    const p = await plant([
      part('em-l', 'emitter', [-1, 0, 0], { kind: 'lid', mass: '5', height: '0.4' }),
      part('em-b', 'emitter', [1, 0, 0], { kind: 'base', mass: '2' }),
    ]);
    p.run(10, { 'em_l.emit': true });
    p.run(5, { 'em_l.emit': true, 'em_b.emit': true });
    const items = trackedItems(p.world);
    expect(items.get('em-l-1')).toEqual({ kind: 'item', size: [0.4, 0.04, 0.3], massKg: 5, tag: 'lid' });
    expect(items.get('em-b-1')).toEqual({ kind: 'item', size: [0.4, 0.15, 0.3], massKg: 2, tag: 'base' });
  });

  it('PLT-007 a lid placed on a base rests on it and stays at rest for 60 simulated seconds', async () => {
    const p = await plant([part('base-1', 'base', [0, 0, 0]), part('lid-1', 'lid', [0, 0.15, 0])]);
    p.run(1000);
    const settled = p.body('lid-1').p;
    p.run(60000);
    const after = p.body('lid-1').p;
    expect(settled[1]).toBeGreaterThan(0.15 + 0.02 - 0.005);
    for (const k of [0, 1, 2]) expect(Math.abs(after[k]! - settled[k]!)).toBeLessThan(0.001);
  });

  it('PRT-001 the emitter still emits boxes and pallets exactly as before', async () => {
    const p = await plant([
      part('em-b', 'emitter', [-1, 0.5, 0], { maxItems: 1 }),
      part('em-p', 'emitter', [1, 0.5, 0], { kind: 'pallet', maxItems: 1 }),
      part('box-1', 'box', [3, 0, 0]),
    ]);
    p.run(5, { 'em_b.emit': true, 'em_p.emit': true });
    const items = trackedItems(p.world);
    expect(items.get('em-b-1')).toEqual({ kind: 'item', size: [0.4, 0.3, 0.3], massKg: 2, tag: 'box' });
    expect(items.get('em-p-1')!.kind).toBe('pallet');
    expect(items.get('em-p-1')!.tag).toBeUndefined();
    expect(items.get('box-1')!.tag).toBe('box');
    // A box dropped on the floor from the emitter lands at the same pose as before the change.
    p.run(2000);
    const b = p.body('em-b-1');
    expect(b.p[0]).toBeCloseTo(-1, 3);
    expect(b.p[1]).toBeCloseTo(0.15, 2);
  });
});
