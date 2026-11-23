/**
 * The composed models of the pilot parts (VIS-014, VIS-016, PRT-009): what each builder puts in the frame and how a state moves or
 * shows a piece. The views are the ones the real plant core publishes for belt-to-sensor.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PartView, PlantCore, PlantSceneFile } from '../contracts';
import { createPlantCore } from '../core/plantCore';
import { snapshotBounds } from './geometry';
import { BELT, MODELS, modelBounds, partModel, pieceExtent, PUSH_BUTTON, type Piece } from './models';

const scene = JSON.parse(readFileSync(join(import.meta.dir, '../../../plant-scenes/belt-to-sensor/scene.json'), 'utf8')) as PlantSceneFile;
let core: PlantCore | undefined;
afterEach(() => {
  core?.dispose();
  core = undefined;
});
const views = async (): Promise<Record<string, PartView>> => {
  core = await createPlantCore(scene);
  return Object.fromEntries(core.snapshot().parts.map((p) => [p.id, p]));
};
const slot = (pieces: readonly Piece[], name: string) => pieces.find((p) => p.slot === name)!;
const shown = (pieces: readonly Piece[], prefix: string) => pieces.filter((p) => p.slot.startsWith(prefix) && p.visible);
/** The lowest point of a piece in the part's frame. */
const bottom = (p: Piece) => p.at[1] - pieceExtent(p)[1];

describe('composed part models (VIS-014)', () => {
  it('PRT-009 the belt, sensor, push button and emitter have a builder; any other part kind keeps its single shape', async () => {
    const v = await views();
    expect(Object.keys(MODELS).sort()).toEqual(['belt', 'emitter', 'push-button', 'sensor']);
    for (const id of ['belt', 'eye-far', 'start', 'emitter']) expect(partModel(v[id]!)?.length).toBeGreaterThan(3);
    expect(partModel({ ...v.belt!, part: 'stop-blade' })).toBeNull();
  });

  it('VIS-014 a belt has a band, two side frames, two end drums, and legs with feet and braces that stand on the floor', async () => {
    const belt = (await views()).belt!;
    const pieces = partModel(belt)!;
    const floor = -belt.pose.p[1];
    expect(['band', 'rail-a', 'rail-b', 'drum-a', 'drum-b'].map((s) => slot(pieces, s).role)).toEqual([
      'band',
      'frame',
      'frame',
      'steel',
      'steel',
    ]);
    const legs = pieces.filter((p) => p.slot.startsWith('leg-'));
    expect(legs.length).toBe(6); // a 2.4 m belt: three pairs
    for (const leg of legs) expect(bottom(leg)).toBeCloseTo(floor, 9);
    expect(pieces.filter((p) => p.slot.startsWith('foot-')).length).toBe(legs.length);
    expect(pieces.filter((p) => p.slot.startsWith('brace-')).length).toBe(legs.length / 2);
    // The top of the band is the conveying surface the physics uses.
    const band = slot(pieces, 'band');
    expect(band.at[1] + pieceExtent(band)[1]).toBeCloseTo(belt.pose.size[1] / 2, 9);
  });

  it('VIS-014 a belt close to the floor has no legs', async () => {
    const belt = (await views()).belt!;
    const low = { ...belt, pose: { ...belt.pose, p: [0, 0.08, 0] as const } };
    expect(partModel(low)!.some((p) => p.slot.startsWith('leg-'))).toBe(false);
  });

  it('VIS-016 a stopped belt shows no direction mark; a running one shows marks that point its way and travel with the band', async () => {
    const belt = (await views()).belt!;
    expect(shown(partModel(belt)!, 'mark-')).toEqual([]);
    const running = { ...belt, state: { ...belt.state, speedMps: 0.5 } };
    const at0 = shown(partModel(running, { travel: 0 })!, 'mark-');
    const at1 = shown(partModel(running, { travel: 0.1 })!, 'mark-');
    expect(at0.length).toBeGreaterThan(4);
    expect(at0.every((m) => m.yaw === Math.PI / 2)).toBe(true);
    const x = (marks: Piece[], s: string) => marks.find((m) => m.slot === s)?.at[0];
    expect(x(at1, 'mark-3')! - x(at0, 'mark-3')!).toBeCloseTo(0.1, 9);
    // Each mark stays on the band, wrapping round at the end.
    const length = belt.pose.size[0];
    for (const travel of [0, 0.7, 5.3, -2])
      for (const m of shown(partModel(running, { travel })!, 'mark-'))
        expect(Math.abs(m.at[0]) + BELT.markRadius).toBeLessThanOrEqual(length / 2 + 1e-9);
    const back = { ...belt, state: { ...belt.state, speedMps: -0.5 } };
    expect(shown(partModel(back)!, 'mark-').every((m) => m.yaw === -Math.PI / 2)).toBe(true);
  });

  it('VIS-016 the diffuse sensor draws a dashed beam while clear and a solid one with its lamp lit while it detects', async () => {
    const v = await views();
    const clear = partModel(v['eye-far']!)!;
    expect(slot(clear, 'beam').visible).toBe(false);
    expect(shown(clear, 'dash-').length).toBeGreaterThan(5);
    expect(slot(clear, 'lamp').role).toBe('lampOff');
    core!.act('EyeFar', 'stuckOn');
    core!.advance(5);
    const eye = core!.snapshot().parts.find((p) => p.id === 'eye-far')!;
    const detecting = partModel(eye)!;
    expect(slot(detecting, 'beam').visible).toBe(true);
    expect(shown(detecting, 'dash-')).toEqual([]);
    expect(slot(detecting, 'lamp').role).toBe('lamp');
    // The beam runs from the lens for the sensor's range, and the post reaches the floor.
    const beam = slot(detecting, 'beam');
    expect(beam.at[0] + pieceExtent(beam)[0]).toBeCloseTo(eye.state.beamLength as number, 9);
    expect(bottom(slot(detecting, 'base'))).toBeCloseTo(-eye.pose.p[1], 9);
  });

  it('VIS-016 the head of a pressed push button travels into its collar', async () => {
    const v = await views();
    const head = (view: PartView) => slot(partModel(view)!, 'head');
    const released = head(v.start!);
    core!.operate('StartButton.pressed', true);
    core!.advance(5);
    const pressed = head(core!.snapshot().parts.find((p) => p.id === 'start')!);
    expect(released.at[1] - pressed.at[1]).toBeCloseTo(PUSH_BUTTON.released - PUSH_BUTTON.pressed, 9);
    expect(released.at[1] - pressed.at[1]).toBeGreaterThanOrEqual(0.015);
  });

  it('VIS-014 the emitter is an open frame of eight bars around the zone where items appear', async () => {
    const pieces = partModel((await views()).emitter!)!;
    expect(pieces.length).toBe(8);
    expect(new Set(pieces.map((p) => p.role))).toEqual(new Set(['cage']));
  });

  it('VIS-014 no two pieces of a model have the same place and shape, in any state', async () => {
    const v = await views();
    const running = { ...v.belt!, state: { ...v.belt!.state, speedMps: 0.5 } };
    for (const view of [v.belt!, running, v['eye-far']!, v.start!, v.emitter!]) {
      const keys = partModel(view)!.map((p) => JSON.stringify([p.at, p.shape, p.yaw]));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('VIS-017 the bounds of the scene hold every piece: legs and posts down to the floor, the beam to its end', async () => {
    const v = await views();
    const bounds = snapshotBounds(core!.snapshot())!;
    expect(bounds.min[1]).toBeCloseTo(0, 6); // the feet stand on the floor
    const eye = v['eye-far']!;
    const local = modelBounds(eye)!;
    expect(local.max[0]).toBeGreaterThanOrEqual(eye.state.beamLength as number);
    expect(local.min[1]).toBeCloseTo(-eye.pose.p[1], 6);
  });
});
