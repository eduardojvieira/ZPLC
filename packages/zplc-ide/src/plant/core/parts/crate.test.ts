import { afterEach, describe, expect, it } from 'bun:test';
import type { PartDefinition, PlantCore, PlantSceneFile, ScenePart } from '../../contracts';
import { catalogue } from '../catalogue';
import { createPlantCore } from '../plantCore';
import { SCENE_SCHEMA_VERSION } from '../sceneSchema';
import { CRATE_MASS_KG, CRATE_OUTER } from './items';

const cores: PlantCore[] = [];
afterEach(() => {
  for (const c of cores.splice(0)) c.dispose();
});
const part = (id: string, name: string, position: [number, number, number], config: ScenePart['config'] = {}): ScenePart => ({
  id: name.toLowerCase(),
  part: id,
  name,
  position,
  rotationYDeg: 0,
  config,
});
const sceneOf = (parts: ScenePart[]): PlantSceneFile => ({ schemaVersion: SCENE_SCHEMA_VERSION, name: 'crate', parts, cameras: [] });
const make = async (parts: ScenePart[]) => {
  const core = await createPlantCore(sceneOf(parts));
  cores.push(core);
  return core;
};
const run = (core: PlantCore, ms: number) => {
  for (let t = 0; t < ms; t += 10) core.advance(10);
};
const def = (id: string): PartDefinition => catalogue.get(id)!;

// Five workpieces spread over the interior (the interior is 0.76 by 0.56 m); one centre line would stack them above the wall.
const DROPS: [number, number][] = [
  [-0.25, -0.13],
  [0, -0.13],
  [0.25, -0.13],
  [-0.12, 0.13],
  [0.12, 0.13],
];
const workpieces = (drops: [number, number][], y: number) => drops.map(([x, z], k) => part('workpiece', `W${k}`, [x, y, z], { mass: 0.5 }));

describe('crate item', () => {
  it('PRT-001 the catalogue has a crate with English and Spanish names and documentation', () => {
    const d = def('crate');
    expect(d.family).toBe('items');
    expect(d.names).toEqual({ en: 'Crate', es: 'Cajón' });
    expect(d.doc.en.length).toBeGreaterThan(10);
    expect(d.doc.es.length).toBeGreaterThan(10);
    expect(d.config).toEqual({});
  });

  it('PRT-001 an initial crate spawns with the right size, mass and tag in trackedItems and in the snapshot pose', async () => {
    const core = await make([part('crate', 'C1', [0, 0, 0])]);
    run(core, 500);
    const [pose] = core.snapshot().items;
    expect(pose!.kind).toBe('item');
    expect(pose!.tag).toBe('crate');
    expect(pose!.size).toEqual(CRATE_OUTER);
    expect(CRATE_MASS_KG).toBe(4);
    expect(Math.abs(pose!.p[1] - CRATE_OUTER[1] / 2)).toBeLessThan(0.01);
  });

  it('PLT-007 five workpieces dropped into a crate stay inside it and the fact loaded:crate:0 reads 5', async () => {
    const core = await make([part('crate', 'C1', [0, 0, 0]), ...workpieces(DROPS, 0.4)]);
    run(core, 6000);
    const snap = core.snapshot();
    const crate = snap.items.find((i) => i.tag === 'crate')!;
    const inside = snap.items.filter((i) => i.tag !== 'crate');
    expect(inside.length).toBe(5);
    for (const w of inside) {
      expect(Math.abs(w.p[0] - crate.p[0])).toBeLessThan(0.38);
      expect(Math.abs(w.p[2] - crate.p[2])).toBeLessThan(0.28);
      expect(w.p[1]).toBeGreaterThan(crate.p[1] - CRATE_OUTER[1] / 2 + 0.02); // above the floor top, not sunk into it
      expect(w.p[1]).toBeLessThan(crate.p[1] + CRATE_OUTER[1] / 2);
    }
    expect(snap.facts['loaded:crate:0']).toBe(5);
  });

  it('PLT-007 a crate set on a crate stays stacked for 60 simulated seconds', async () => {
    const core = await make([part('crate', 'Low', [0, 0, 0]), part('crate', 'High', [0, CRATE_OUTER[1] + 0.01, 0])]);
    run(core, 5000);
    const at = (name: string) => core.snapshot().items.find((i) => i.id === name.toLowerCase())!.p;
    const before = at('High');
    run(core, 60000);
    const after = at('High');
    expect(Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])).toBeLessThan(0.001);
    expect(after[1]).toBeGreaterThan(at('Low')[1] + CRATE_OUTER[1] - 0.02); // still on the rims, not nested or fallen
  });

  it('PLT-007 a crate rides a belt', async () => {
    const core = await make([part('belt', 'B1', [0, 0.45, 0], { length: 4, width: 0.8 }), part('crate', 'C1', [-1, 0.45, 0])]);
    run(core, 500);
    const x0 = core.snapshot().items[0]!.p[0];
    core.apply({ 'B1.run': true });
    run(core, 3000);
    expect(core.snapshot().items[0]!.p[0]).toBeGreaterThan(x0 + 0.5);
  });

  it('PRT-001 an emitter of crates emits one at its interval and counts it', async () => {
    const core = await make([part('emitter', 'E1', [0, 0, 0], { kind: 'crate', intervalMs: 2000, maxItems: 2 })]);
    run(core, 2100);
    expect(core.snapshot().facts['emitted:E1']).toBe(1);
    const [pose] = core.snapshot().items;
    expect(pose!.tag).toBe('crate');
    expect(pose!.size).toEqual(CRATE_OUTER);
    run(core, 4000);
    expect(core.snapshot().facts['emitted:E1']).toBe(2); // maxItems caps it
  });

  it('PRT-001 the emitter still emits boxes, pallets, lids, bases and workpieces exactly as before', async () => {
    for (const [kind, size] of [
      ['box', [0.4, 0.3, 0.3]],
      ['pallet', [1.2, 0.144, 0.8]],
      ['lid', [0.4, 0.04, 0.3]],
      ['base', [0.4, 0.15, 0.3]],
      ['workpiece', [0.2, 0.1, 0.2]],
    ] as const) {
      const core = await make([part('emitter', 'E1', [0, 0, 0], { kind })]);
      core.apply({ 'E1.emit': true });
      run(core, 100);
      const [pose] = core.snapshot().items;
      expect(pose!.size).toEqual(size as unknown as typeof pose.size);
      expect(pose!.tag).toBe(kind === 'box' || kind === 'lid' || kind === 'base' ? kind : undefined);
    }
  });

  it('PRT-010 adding the crate changes no scene schema version', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });
});
