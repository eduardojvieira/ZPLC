/** The sensor models (plan-vis C3; VIS-014, VIS-016): the diffuse sensors of belt-to-sensor as the real plant core publishes them. */
import { describe, expect, it } from 'bun:test';
import { paletteFor } from '../displayModes';
import { partColour } from '../look';
import { partModel, pieceExtent } from './index';
import { beltToSensor, bottom, shown, slot } from './models.fixtures';
import { sensorMount, SENSORS } from './sensors';

const plant = beltToSensor();

describe('sensor models (VIS-014)', () => {
  it('PRT-009 the sensor family draws the diffuse photoelectric sensor', () => {
    expect(Object.keys(SENSORS)).toEqual(['sensor']);
  });

  it('VIS-016 the diffuse sensor draws a dashed beam while clear and a solid one with its lamp lit while it detects', async () => {
    const v = await plant.views();
    const clear = partModel(v['eye-far']!)!;
    expect(slot(clear, 'beam').visible).toBe(false);
    expect(shown(clear, 'dash-').length).toBeGreaterThan(5);
    expect(slot(clear, 'lamp').role).toBe('lampOff');
    const core = plant.core();
    core.act('EyeFar', 'stuckOn');
    core.advance(5);
    const eye = core.snapshot().parts.find((p) => p.id === 'eye-far')!;
    const detecting = partModel(eye)!;
    expect(slot(detecting, 'beam').visible).toBe(true);
    expect(shown(detecting, 'dash-')).toEqual([]);
    expect(slot(detecting, 'lamp').role).toBe('lamp');
    // The beam runs from the lens for the sensor's range, and the post reaches the floor.
    const beam = slot(detecting, 'beam');
    expect(beam.at[0] + pieceExtent(beam)[0]).toBeCloseTo(eye.state.beamLength as number, 9);
    expect(bottom(slot(detecting, 'base'))).toBeCloseTo(-eye.pose.p[1], 9);
  });

  it('VIS-014 a sensor beside a belt sits on a bracket bolted to the belt frame, with a fine beam and no post to the floor', async () => {
    const v = await plant.views();
    const eye = v['eye-far']!;
    // The outer face of the near rail, at its top: 0.17 m ahead of the lens and 0.088 m below it (scene belt-to-sensor).
    const mount = sensorMount(eye, Object.values(v))!;
    expect(mount.map((c) => Number(c.toFixed(6)) + 0)).toEqual([0.17, -0.088, 0]);
    const pieces = partModel(eye, { travel: 0, mount })!;
    expect(pieces.some((p) => p.slot === 'post' || p.slot === 'base')).toBe(false);
    const plate = slot(pieces, 'bracket-plate');
    expect(plate.at[0] + pieceExtent(plate)[0]).toBeCloseTo(mount[0], 9); // flat on the rail's outer face
    expect(bottom(plate)).toBeLessThan(mount[1]); // and down past the rail's top edge
    const arm = slot(pieces, 'bracket-arm');
    expect(arm.at[1] + pieceExtent(arm)[1]).toBeCloseTo(bottom(slot(pieces, 'housing')), 9); // the arm carries the housing
    expect(pieces.filter((p) => p.slot.startsWith('bolt-')).length).toBeGreaterThanOrEqual(2);
    // A fine beam: no thicker than 6 mm, solid or dashed.
    for (const p of pieces.filter((x) => x.role === 'beam')) expect(2 * pieceExtent(p)[1]).toBeLessThanOrEqual(0.006);
    // No belt frame in reach: the sensor keeps a post to the floor.
    expect(sensorMount(eye, [eye, v.start!])).toBeNull();
    // Nor does a bracket rise to a sensor far above the rail, as the stacked sensors of a height check are (height-sorting-chain: 0.24
    // and 0.34 m above it): on posts their feet differ, where two brackets on one spot would be drawn twice.
    for (const y of [0.75, 0.85])
      expect(sensorMount({ ...eye, pose: { ...eye.pose, p: [eye.pose.p[0], y, eye.pose.p[2]] } }, Object.values(v))).toBeNull();
  });

  it('VIS-014 the sensor body is a neutral grey, its own colour in every display mode', () => {
    for (const mode of ['light', 'dark'] as const) {
      const hex = partColour('sensor', paletteFor({ mode, reducedMotion: false }));
      const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(16);
    }
  });
});
