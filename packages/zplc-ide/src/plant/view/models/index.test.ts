/**
 * The composed models together (VIS-014, VIS-017, PRT-009): the families join without overlap, a part kind with no builder keeps
 * its single shape, no model draws two pieces in one place, and the bounds of a scene hold every piece.
 */
import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PartView, PlantSceneFile } from '../../contracts';
import { createPlantCore } from '../../core/plantCore';
import { snapshotBounds } from '../geometry';
import { FAMILIES, modelBounds, MODELS, partModel, sensorMount } from './index';
import { beltToSensor } from './models.fixtures';
import type { Piece } from './shared';

const plant = beltToSensor();
const SCENES = join(import.meta.dir, '../../../../plant-scenes');
/** Two pieces of one model in the same place with the same shape: VIS-014 asks that each be drawn once. */
const twice = (pieces: readonly Piece[]) => {
  const keys = pieces.map((p) => JSON.stringify([p.at, p.shape, p.yaw]));
  return keys.filter((k, i) => keys.indexOf(k) !== i);
};

describe('composed part models (VIS-014)', () => {
  it('PRT-009 the pilot parts have a builder, no part kind is in two families, and any other kind keeps its single shape', async () => {
    const v = await plant.views();
    // Each family's test names the builders of its own file; here only that the families are all joined, and none twice.
    expect(Object.keys(MODELS).sort()).toEqual(FAMILIES.flatMap((family) => Object.keys(family)).sort());
    expect(Object.keys(MODELS)).toEqual(expect.arrayContaining(['belt', 'emitter', 'push-button', 'sensor']));
    expect(FAMILIES.reduce((n, family) => n + Object.keys(family).length, 0)).toBe(Object.keys(MODELS).length);
    for (const id of ['belt', 'eye-far', 'start', 'emitter']) expect(partModel(v[id]!)?.length).toBeGreaterThan(3);
    expect(partModel({ ...v.belt!, part: 'no-such-part' })).toBeNull();
  });

  it('VIS-014 no two pieces of a model have the same place and shape, in any state', async () => {
    const v = await plant.views();
    const running = { ...v.belt!, state: { ...v.belt!.state, speedMps: 0.5 } };
    const mounted = partModel(v['eye-far']!, { travel: 0, mount: sensorMount(v['eye-far']!, Object.values(v)) })!;
    for (const pieces of [v.belt!, running, v['eye-far']!, v.start!, v.emitter!].map((view) => partModel(view)!).concat([mounted]))
      expect(twice(pieces)).toEqual([]);
  });

  it('VIS-014 no model of a part of the 21 reference scenes draws two pieces in one place', async () => {
    for (const id of readdirSync(SCENES).sort()) {
      const scene = JSON.parse(readFileSync(join(SCENES, id, 'scene.json'), 'utf8')) as PlantSceneFile;
      const core = await createPlantCore(scene);
      try {
        const parts: readonly PartView[] = core.snapshot().parts;
        for (const view of parts) {
          const pieces = partModel(view, { travel: 0, mount: sensorMount(view, parts) });
          if (pieces) expect({ scene: id, part: view.id, twice: twice(pieces) }).toEqual({ scene: id, part: view.id, twice: [] });
        }
      } finally {
        core.dispose();
      }
    }
  });

  it('VIS-017 the bounds of the scene hold every piece: legs and posts down to the floor, the beam to its end', async () => {
    const v = await plant.views();
    const bounds = snapshotBounds(plant.core().snapshot())!;
    expect(bounds.min[1]).toBeCloseTo(0, 6); // the feet stand on the floor
    const eye = v['eye-far']!;
    const local = modelBounds(eye)!;
    expect(local.max[0]).toBeGreaterThanOrEqual(eye.state.beamLength as number);
    expect(local.min[1]).toBeCloseTo(-eye.pose.p[1], 6);
  });
});
