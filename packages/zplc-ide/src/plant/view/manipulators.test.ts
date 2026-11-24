import { describe, expect, it } from 'bun:test';
import type { BodyPose, PartView } from '../contracts';
import { cuesFor } from './cues';
import { paletteFor } from './displayModes';
import { itemToneOf, partDecor, partShape } from './geometry';

const pose = (over: Partial<BodyPose> = {}): BodyPose => ({
  id: 'g',
  part: 'gantry',
  kind: 'box',
  size: [0.3, 0.03, 0.2],
  p: [0, 1, 0],
  q: [0, 0, 0, 1],
  ...over,
});
const view = (part: string, state: PartView['state'] = {}, signals: PartView['signals'] = {}, over: Partial<PartView> = {}): PartView => ({
  id: 'g',
  part,
  name: 'Gantry1',
  pose: pose({ part }),
  state,
  signals,
  ...over,
});
const gantry = (gripped: boolean): PartView =>
  view(
    'gantry',
    { x: 0.52, y: 0.2, strokeX: 1, fraction: 0.52, text: 'X 0.52 m, Y 0.20 m', holding: gripped },
    { 'Gantry1.gripped': gripped, 'Gantry1.x': 0.52 },
  );

describe('manipulator view', () => {
  it('VIS-003 a manipulator holding an item is told TRUE with a solid marker, an empty one FALSE with a dashed marker', () => {
    const on = cuesFor(gantry(true));
    const off = cuesFor(gantry(false));
    expect([on.state, on.marker, on.stateWord]).toEqual(['true', 'solid', 'Confirmed TRUE']);
    expect([off.state, off.marker, off.stateWord]).toEqual(['false', 'dashed', 'FALSE']);
  });

  it('VIS-003 a manipulator view carries its axis position as text and a fraction', () => {
    expect(cuesFor(gantry(false)).value).toEqual({ text: 'X 0.52 m, Y 0.20 m', fraction: 0.52 });
  });

  it('PRT-009 the pick-place, gantry and palletizer shapes are generated in code and need no asset', () => {
    for (const p of ['pick-place', 'gantry', 'layer-palletizer', 'manipulator-frame', 'manipulator-beam', 'lid', 'base']) {
      const spec = partShape(view(p));
      expect(spec).toEqual({ shape: 'box', size: [0.3, 0.03, 0.2] });
      expect(JSON.stringify(spec)).not.toMatch(/\.(glb|gltf|png|svg|obj)|http|url/i);
    }
  });

  it('VIS-003 a clamp draws its jaws closer as closeFraction grows', () => {
    const gap = (closeFraction: number): number => {
      const jaws = partDecor(view('gantry', { gripper: 'clamp', closeFraction }));
      expect(jaws.length).toBe(2);
      return jaws[1]!.centre[0] - jaws[0]!.centre[0];
    };
    expect(gap(0)).toBeGreaterThan(gap(0.5));
    expect(gap(0.5)).toBeGreaterThan(gap(1));
    expect(partDecor(view('gantry', { gripper: 'vacuum' })).length).toBe(1);
    expect(partDecor(view('gantry', {}))).toEqual([]);
  });

  it('VIS-009 lids and bases are drawn with their own tone and an outline', () => {
    for (const mode of ['light', 'dark', 'high-contrast'] as const) {
      const palette = paletteFor({ mode, reducedMotion: false });
      const tones = (['box', 'lid', 'base'] as const).map((tag) => itemToneOf(pose({ tag }), palette));
      expect(new Set(tones).size).toBe(3);
    }
    const hc = paletteFor({ mode: 'high-contrast', reducedMotion: false });
    expect(hc.outline).not.toBeNull(); // the shared wireframe pass outlines every item in high contrast
  });

  it('VIS-003 the frame and beam views have no signals and the part name', () => {
    const frame = view('manipulator-frame', {}, {}, { id: 'g-frame' });
    const c = cuesFor(frame);
    expect([c.label, c.state, c.marker]).toEqual(['Gantry1', 'unknown', 'dotted']);
  });

  it('VIS-003 the cues of the M1 and M2 parts are unchanged', () => {
    const row = (part: string, signals: PartView['signals'], state: PartView['state'] = {}) => {
      const c = cuesFor(view(part, state, signals));
      return [c.state, c.marker, c.value?.text ?? null];
    };
    expect(row('sensor', { 'EyeA.detect': true })).toEqual(['true', 'solid', null]);
    expect(row('sensor', { 'EyeA.detect': false })).toEqual(['false', 'dashed', null]);
    expect(row('belt', { 'Belt1.run': true })).toEqual(['true', 'solid', null]);
    expect(row('stack-light', { 'S.red': true, 'S.green': false })).toEqual(['true', 'solid', null]);
    expect(row('tank', { 'T.level': 1 }, { fraction: 0.4, text: '0.40 m' })).toEqual(['true', 'solid', '0.40 m']);
    expect(row('emergency-stop', { 'Gantry1.ok': false })).toEqual(['false', 'outline', null]);
    expect(row('sensor', {}, { fault: true })).toEqual(['fault', 'outline', null]);
    expect(partShape(view('roller', {}, {}, { pose: pose({ size: [2, 0.1, 0.5] }) }))).toEqual({
      shape: 'cylinder',
      radius: 0.05,
      length: 2,
    });
  });
});
