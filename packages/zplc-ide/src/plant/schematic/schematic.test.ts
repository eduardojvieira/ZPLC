import { describe, expect, it } from 'bun:test';
import type { PartDefinition, PlantSceneFile } from '../contracts';
import { createCatalogue } from '../core/catalogue';
import { schematicFor } from './schematic';

const def = (id: string, snap: [number, number, number][] = []): PartDefinition => ({
  id,
  family: 'conveyors',
  names: { en: id, es: id },
  config: {},
  signals: () => [],
  actions: [],
  snapPoints: () => snap.map((position, i) => ({ name: `s${i}`, position, normalYDeg: 0, accepts: [] })),
  doc: { en: '', es: '' },
});
const defs = [def('belt', [[-1, 0, 0], [1, 0, 0]]), def('sensor'), def('button')];
const cat = createCatalogue(defs);
const scene = (parts: PlantSceneFile['parts']): PlantSceneFile => ({ schemaVersion: 1, name: 'x', parts, cameras: [] });
const part = (id: string, kind: string, x: number, z: number) => ({
  id,
  part: kind,
  name: id.toUpperCase(),
  position: [x, 0, z] as const,
  rotationYDeg: 0,
  config: {},
});

describe('schematic', () => {
  it('VIS-007 every catalogue part draws in the schematic and no scene has a hand-made drawing', async () => {
    const s = schematicFor(scene(defs.map((d, i) => part(d.id, d.id, i, 0))), cat);
    expect(s.shapes.map((sh) => sh.part)).toEqual(['belt', 'sensor', 'button']);
    expect(s.labels.map((l) => l.text)).toEqual(['BELT', 'SENSOR', 'BUTTON']);
    for (const sh of s.shapes) expect(sh.w).toBeGreaterThan(0);
    const src = await Bun.file(new URL('./schematic.ts', import.meta.url)).text();
    expect(src).not.toMatch(/scene-|plant-scenes|import .*\.json/);
  });

  it('VIS-007 the schematic of the same scene is byte-identical on repeated generation', () => {
    const sc = scene([part('b1', 'belt', 0, 0), part('s1', 'sensor', 1, 1)]);
    expect(JSON.stringify(schematicFor(sc, cat))).toBe(JSON.stringify(schematicFor(sc, cat)));
  });

  it('VIS-007 shapes lie inside the canvas and a longer part draws wider', () => {
    const s = schematicFor(scene([part('b1', 'belt', 0, 0), part('s1', 'sensor', 3, -2)]), cat);
    for (const sh of s.shapes) {
      expect(sh.x).toBeGreaterThanOrEqual(0);
      expect(sh.y).toBeGreaterThanOrEqual(0);
      expect(sh.x + sh.w).toBeLessThanOrEqual(s.width);
      expect(sh.y + sh.h).toBeLessThanOrEqual(s.height);
    }
    expect(s.shapes[0]!.w).toBeGreaterThan(s.shapes[1]!.w);
  });

  it('VIS-007 a part missing from the catalogue still draws as a marker', () => {
    const s = schematicFor(scene([part('z', 'unknown', 0, 0)]), cat);
    expect(s.shapes).toHaveLength(1);
  });
});
