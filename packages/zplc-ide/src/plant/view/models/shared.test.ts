/**
 * The helpers every family uses (plan-vis C0; VIS-014): the slotted aluminium profile of a frame, the extrusion it is drawn as, and
 * the leg on a levelling foot, as in the concept image of the station.
 */
import { describe, expect, it } from 'bun:test';
import { bottom, top } from './models.fixtures';
import { extrusion, LEVELLING_FOOT, levellingLeg, pieceExtent, piece, slotted, slottedSection, type Section } from './shared';

/** Twice the signed area of a closed outline: positive when it runs counter-clockwise. */
const area = (s: Section) => s.reduce((sum, [a, b], i) => sum + a * s[(i + 1) % s.length]![1] - s[(i + 1) % s.length]![0] * b, 0) / 2;
/** True when two edges of the outline that do not share a corner cross or touch. */
const selfCrossing = (s: Section): boolean => {
  const n = s.length;
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) =>
    (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [p, q, r, t] = [s[i]!, s[(i + 1) % n]!, s[j]!, s[(j + 1) % n]!];
      const d1 = cross(r, t, p);
      const d2 = cross(r, t, q);
      const d3 = cross(p, q, r);
      const d4 = cross(p, q, t);
      if (d1 * d2 <= 0 && d3 * d4 <= 0 && (d1 !== 0 || d2 !== 0)) return true;
    }
  return false;
};
/** How many slots open on the face of the outline at `b` = `at` (bottom or top face) or `a` = `at` (side faces). */
const slotsOn = (s: Section, coordinate: 0 | 1, at: number) => (s.filter((p) => Math.abs(p[coordinate] - at) < 1e-12).length - 2) / 2;

describe('slotted aluminium profile (VIS-014)', () => {
  it('VIS-014 a slotted profile fills the box it replaces, with T-slots on every face, one per module of its narrow side', () => {
    const s = slottedSection(0.03, 0.13); // the side frame of a belt
    expect(Math.min(...s.map((p) => p[0]))).toBeCloseTo(-0.015, 12);
    expect(Math.max(...s.map((p) => p[0]))).toBeCloseTo(0.015, 12);
    expect(Math.min(...s.map((p) => p[1]))).toBeCloseTo(-0.065, 12);
    expect(Math.max(...s.map((p) => p[1]))).toBeCloseTo(0.065, 12);
    expect([slotsOn(s, 0, -0.015), slotsOn(s, 0, 0.015), slotsOn(s, 1, -0.065), slotsOn(s, 1, 0.065)]).toEqual([4, 4, 1, 1]);
    const square = slottedSection(0.04, 0.04); // a leg
    expect([slotsOn(square, 0, -0.02), slotsOn(square, 0, 0.02), slotsOn(square, 1, -0.02), slotsOn(square, 1, 0.02)]).toEqual([
      1, 1, 1, 1,
    ]);
    // A profile, neither a plain box nor a hollow shell: the slots take some of the section, most of it stays metal.
    for (const [w, h] of [
      [0.03, 0.13],
      [0.04, 0.04],
    ] as const) {
      const metal = area(slottedSection(w, h)) / (w * h);
      expect(metal).toBeLessThan(0.97);
      expect(metal).toBeGreaterThan(0.5);
    }
  });

  it('VIS-014 the outline of a slotted profile of any proportion is one simple loop, counter-clockwise', () => {
    for (const [w, h] of [
      [0.03, 0.13],
      [0.04, 0.04],
      [0.03, 0.03],
      [0.02, 0.2],
      [0.045, 0.09],
      [0.08, 0.04],
      [0.03, 0.059],
    ] as const) {
      const s = slottedSection(w, h);
      expect(area(s)).toBeGreaterThan(0);
      expect(selfCrossing(s)).toBe(false);
    }
  });

  it('VIS-014 an extrusion runs its length along its axis with its section across: (z, y) along x, (x, z) along y, (x, y) along z', () => {
    const s: Section = [
      [-0.01, -0.02],
      [0.01, -0.02],
      [0.01, 0.02],
      [-0.01, 0.02],
    ];
    const extent = (axis: 'x' | 'y' | 'z') => pieceExtent(piece('p', extrusion(s, 1, axis), [0, 0, 0], 'frame'));
    expect(extent('x')).toEqual([0.5, 0.02, 0.01]);
    expect(extent('y')).toEqual([0.01, 0.5, 0.02]);
    expect(extent('z')).toEqual([0.01, 0.02, 0.5]);
    // A slotted profile is that extrusion with its slots drawn dark, as light does not reach into them.
    expect(slotted(0.03, 0.13, 2, 'x')).toEqual({
      kind: 'extrusion',
      section: slottedSection(0.03, 0.13),
      length: 2,
      axis: 'x',
      recessDark: true,
    });
    expect(extrusion(s, 1, 'x')).not.toHaveProperty('recessDark');
  });
});

describe('leg on a levelling foot (VIS-014)', () => {
  const slotOf = (pieces: ReturnType<typeof levellingLeg>, prefix: string) => pieces.find((p) => p.slot.startsWith(prefix))!;

  it('VIS-014 a leg is a slotted profile down to a threaded stem on a rubber pad that stands on the floor', () => {
    const pieces = levellingLeg('0-a', 0.4, -0.3, 0.7, -0.1);
    // Two meshes for the foot, as the plain leg had one for its foot plate: every leg of every scene is drawn each frame.
    expect(pieces.map((p) => p.slot)).toEqual(['leg-0-a', 'stem-0-a', 'foot-0-a']);
    const [leg, stem, pad] = ['leg-', 'stem-', 'foot-'].map((prefix) => slotOf(pieces, prefix)) as [
      ReturnType<typeof slotOf>,
      ReturnType<typeof slotOf>,
      ReturnType<typeof slotOf>,
    ];
    for (const p of pieces) expect([p.at[0], p.at[2]]).toEqual([0.4, -0.3]);
    expect(leg.shape).toEqual(slotted(0.04, 0.04, 0.8 - LEVELLING_FOOT.rise, 'y'));
    expect(leg.role).toBe('frame');
    expect(top(leg)).toBeCloseTo(0.7, 12);
    expect(bottom(pad)).toBeCloseTo(-0.1, 12); // on the floor
    expect(pad.role).toBe('rubber');
    expect(bottom(stem)).toBeCloseTo(top(pad), 12);
    expect(top(stem)).toBeCloseTo(bottom(leg), 12); // the stem carries the leg
    expect(pieceExtent(stem)[0]).toBeLessThan(pieceExtent(leg)[0] / 2);
    expect(pieceExtent(pad)[0]).toBeGreaterThan(pieceExtent(leg)[0]);
    // The pad spans the 0.08 m of the pilot's square foot plate, so the bounds of a scene, and its first view, stay as they were.
    expect(pieceExtent(pad)[0]).toBe(0.04);
  });

  it('VIS-014 a short leg keeps half its height as profile: the foot rises at most half way', () => {
    const pieces = levellingLeg('k', 0, 0, 0.06, 0);
    const leg = slotOf(pieces, 'leg-');
    expect(bottom(slotOf(pieces, 'foot-'))).toBeCloseTo(0, 12);
    expect(bottom(leg)).toBeCloseTo(0.03, 12);
    expect(top(leg)).toBeCloseTo(0.06, 12);
  });
});
