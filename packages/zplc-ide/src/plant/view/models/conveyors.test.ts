/** The conveyor models (plan-vis C1; VIS-014, VIS-016): the belt of belt-to-sensor as the real plant core publishes it. */
import { describe, expect, it } from 'bun:test';
import { levellingLeg, slotted, type Piece } from './shared';
import { BELT, CONVEYORS } from './conveyors';
import { modelBounds, partModel, pieceExtent } from './index';
import { beltToSensor, bottom, shown, slot } from './models.fixtures';

const plant = beltToSensor();

describe('conveyor models (VIS-014)', () => {
  it('PRT-009 the conveyor family draws the belt', () => {
    expect(Object.keys(CONVEYORS)).toEqual(['belt']);
  });

  it('VIS-014 a belt has a band, two side frames, two end drums, and legs with feet and braces that stand on the floor', async () => {
    const belt = (await plant.views()).belt!;
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
    const feet = pieces.filter((p) => p.slot.startsWith('foot-'));
    expect(feet.length).toBe(legs.length);
    for (const foot of feet) expect(bottom(foot)).toBeCloseTo(floor, 9);
    expect(pieces.filter((p) => p.slot.startsWith('brace-')).length).toBe(legs.length / 2);
    // The top of the band is the conveying surface the physics uses.
    const band = slot(pieces, 'band');
    expect(band.at[1] + pieceExtent(band)[1]).toBeCloseTo(belt.pose.size[1] / 2, 9);
  });

  it('VIS-014 the band wraps a steel drum at each end, and the side frames stop at the drum axis so the end shows', async () => {
    const belt = (await plant.views()).belt!;
    const pieces = partModel(belt)!;
    const [length, thickness, width] = belt.pose.size;
    for (const end of ['a', 'b']) {
      const wrap = slot(pieces, `wrap-${end}`);
      const drum = slot(pieces, `drum-${end}`);
      expect(wrap.role).toBe('band');
      expect(wrap.at[1] + pieceExtent(wrap)[1]).toBeCloseTo(thickness / 2, 9); // the band runs over the top of the drum
      expect(Math.abs(wrap.at[0]) + pieceExtent(wrap)[0]).toBeCloseTo(length / 2, 9); // and round the end of the belt
      expect(pieceExtent(wrap)[2]).toBeCloseTo(width / 2, 9);
      expect(drum.at).toEqual(wrap.at); // one axis
      expect(pieceExtent(drum)[2]).toBeGreaterThan(width / 2); // the steel shows beside the band
      for (const rail of ['rail-a', 'rail-b']) expect(pieceExtent(slot(pieces, rail))[0]).toBeLessThanOrEqual(Math.abs(drum.at[0]) + 1e-9);
    }
    // A round end cap on each side of each end holds a drum.
    const caps = pieces.filter((p) => p.slot.startsWith('cap-'));
    expect(caps.length).toBe(4);
    for (const cap of caps) expect(Math.abs(cap.at[2])).toBeGreaterThan(width / 2);
  });

  it('VIS-014 the frame of a belt is slotted aluminium profile on levelling feet, in the boxes the plain frame filled', async () => {
    const belt = (await plant.views()).belt!;
    const pieces = partModel(belt)!;
    const [length, thickness] = belt.pose.size;
    const { rail, drum, leg } = BELT;
    const railBottom = thickness / 2 + rail.lip - rail.height;
    for (const s of ['rail-a', 'rail-b']) {
      const r = slot(pieces, s);
      expect(r.shape).toEqual(slotted(rail.width, rail.height, length - 2 * drum, 'x'));
      expect(r.role).toBe('frame');
      expect(pieceExtent(r)).toEqual([length / 2 - drum, rail.height / 2, rail.width / 2]); // the sensor bracket and the bounds hold
    }
    for (const k of [0, 1, 2])
      for (const side of ['a', 'b'] as const) {
        const legPieces = pieces.filter((p) => p.slot.endsWith(`-${k}-${side}`) && /^(leg|stem|foot)-/.test(p.slot));
        const at = slot(pieces, `leg-${k}-${side}`).at;
        expect(legPieces).toEqual(levellingLeg(`${k}-${side}`, at[0], at[2], railBottom, -belt.pose.p[1], leg));
      }
    for (const k of [0, 1, 2]) {
      const brace = slot(pieces, `brace-${k}`);
      expect(brace.shape.kind).toBe('extrusion');
      expect(brace.role).toBe('frame');
    }
    // The model fills the box the pilot's belt filled (the feet 0.04 m out from the rail's centre line), so the first view of every
    // scene stays as it was (VIS-002).
    const railZ = belt.pose.size[2] / 2 + rail.width / 2;
    const bounds = modelBounds(belt)!;
    const ends = length / 2 + 0.008; // the end caps, 8 mm wider than the drums
    const expected = [-ends, ends, -belt.pose.p[1], -railZ - 0.04, railZ + 0.04];
    [bounds.min[0], bounds.max[0], bounds.min[1], bounds.min[2], bounds.max[2]].forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
  });

  it('VIS-014 a belt close to the floor has no legs', async () => {
    const belt = (await plant.views()).belt!;
    const low = { ...belt, pose: { ...belt.pose, p: [0, 0.08, 0] as const } };
    expect(partModel(low)!.some((p) => p.slot.startsWith('leg-'))).toBe(false);
  });

  it('VIS-016 a stopped belt shows no direction mark; a running one shows marks that point its way and travel with the band', async () => {
    const belt = (await plant.views()).belt!;
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
});
