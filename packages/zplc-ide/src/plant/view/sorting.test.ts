import { describe, expect, it } from 'bun:test';
import type { BodyPose, PartView, Vec3 } from '../contracts';
import { cuesFor } from './cues';
import { paletteFor, type DisplayMode } from './displayModes';
import { itemToneOf, OUTLINED_PARTS, partDecor, partShape } from './geometry';

// The view kinds the M4 parts publish (plan-m4 "View state keys"). Once K9 registers the parts, a real-snapshot test
// must assert these equal the `part` of the views of `createPlantCore` (the M1 'curve' / 'blade' defect).
const M4_KINDS = ['light-array', 'scale', 'vision-sensor', 'pusher', 'diverter-arm', 'chain-transfer', 'turntable', 'workpiece'] as const;

const view = (part: string, over: Partial<PartView> = {}, size: Vec3 = [0.4, 0.1, 0.3]): PartView => ({
  id: `${part}1`,
  part,
  name: `${part}1`,
  pose: { id: `${part}1`, part, kind: 'box', size, p: [1, 0.5, 0], q: [0, 0, 0, 1] },
  state: {},
  signals: {},
  ...over,
});
const item = (over: Partial<BodyPose> = {}): BodyPose => ({
  id: 'i',
  part: 'emitter',
  kind: 'box',
  size: [0.2, 0.2, 0.2],
  p: [0, 0, 0],
  q: [0, 0, 0, 1],
  ...over,
});
const lightness = (c: number): number => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);

describe('M4 view kinds', () => {
  it('VIS-003 every M4 view kind is matched by partShape, and an unknown name falls to the pose box', () => {
    for (const kind of M4_KINDS) expect(partShape(view(kind))).toEqual({ shape: 'box', size: [0.4, 0.1, 0.3] });
    expect(partShape(view('no-such-part'))).toEqual({ shape: 'box', size: [0.4, 0.1, 0.3] });
    for (const kind of M4_KINDS) expect(view(kind).pose.part).toBe(kind);
  });

  it('VIS-003 a beam sensor draws its beam with the length it publishes', () => {
    const len = (v: PartView): number => {
      const b = cuesFor(v).beam!;
      return Math.hypot(b.to[0] - b.from[0], b.to[1] - b.from[1], b.to[2] - b.from[2]);
    };
    const sensor = (state: PartView['state']): PartView => view('sensor', { state, signals: { 'S.detect': false } });
    expect(len(sensor({ beamLength: 0.3 }))).toBeCloseTo(0.3, 6);
    expect(len(sensor({}))).toBeCloseTo(1, 6);
  });

  it(
    'VIS-003 a diverter in motion is told by its fraction and text, a raised chain module by its decor and a turntable by its direction ' +
      'marker',
    () => {
      const arm = cuesFor(view('diverter-arm', { state: { fraction: 0.5, text: 'right' }, signals: { 'A.divert': true } }));
      expect(arm.value).toEqual({ text: 'right', fraction: 0.5 });
      expect(arm.state).toBe('true');
      expect(cuesFor(view('chain-transfer', { signals: { 'C.lift': false } })).state).toBe('false');
      expect(cuesFor(view('pusher', { state: { fraction: 1, text: 'extended' }, signals: { 'P.extended': true } })).value?.text).toBe(
        'extended',
      );

      const lowered = partDecor(view('chain-transfer', { state: { fraction: 0, text: 'lowered' } }));
      const raised = partDecor(view('chain-transfer', { state: { fraction: 1, text: 'raised' } }));
      expect(lowered.filter((d) => d.slot.startsWith('chain'))).toHaveLength(0);
      expect(raised.filter((d) => d.slot.startsWith('chain'))).toHaveLength(2);
      const dir = (ds: readonly { slot: string; size: Vec3 }[]) => ds.find((d) => d.slot === 'direction')!;
      expect(dir(lowered).size[0]).toBeGreaterThan(dir(lowered).size[2]); // along x while lowered
      expect(dir(raised).size[2]).toBeGreaterThan(dir(raised).size[0]); // across while raised: the shape tells the axis
      const turn = partDecor(view('turntable', {}, [0.5, 0.1, 0.5]));
      expect(dir(turn).size[0]).toBeGreaterThan(dir(turn).size[2]);
    },
  );

  it('VIS-003 a light array draws one line per beam, a scale a plate and a vision sensor an open frame', () => {
    expect(partDecor(view('light-array', { state: { beams: 4, pitchM: 0.1 } })).filter((d) => d.slot.startsWith('beam'))).toHaveLength(4);
    expect(partDecor(view('scale')).map((d) => d.slot)).toEqual(['plate']);
    expect(partDecor(view('vision-sensor')).map((d) => d.slot)).toEqual(['frame-n', 'frame-s', 'frame-e', 'frame-w']);
  });

  it('VIS-003 a numeric sensor view shows its reading text', () => {
    const v = cuesFor(view('scale', { state: { text: '3.50 kg, stable', fraction: 0.35 }, signals: { 'S.weight': 3.5 } }));
    expect(v.value).toEqual({ text: '3.50 kg, stable', fraction: 0.35 });
    expect(v.state).toBe('true'); // a reading of 0 would be a reading, not FALSE
  });

  it(
    'VIS-009 red, blue and metal items are three different tones in every display mode and the pair of colours differs in ' + 'lightness',
    () => {
      for (const mode of ['light', 'dark', 'high-contrast'] as DisplayMode[]) {
        const p = paletteFor({ mode, reducedMotion: false });
        const [red, blue, metal] = [item({ colour: 'red' }), item({ colour: 'blue' }), item({ metal: true })].map((i) => itemToneOf(i, p));
        expect(new Set([red, blue, metal]).size).toBe(3);
        expect(lightness(red!)).not.toBe(lightness(blue!));
      }
    },
  );

  it('VIS-009 high contrast outlines the new parts', () => {
    for (const kind of M4_KINDS) if (kind !== 'workpiece') expect(OUTLINED_PARTS.has(kind)).toBe(true);
    expect(OUTLINED_PARTS.has('sensor') && OUTLINED_PARTS.has('stop-blade')).toBe(true);
  });

  it('VIS-003 the cues and shapes of the M1 to M3 parts are unchanged', () => {
    for (const part of ['belt', 'roller', 'sensor', 'stop-blade', 'tank', 'stack-light', 'pick-place', 'lid'])
      expect(partShape(view(part)).shape).toBe(part === 'roller' ? 'cylinder' : 'box');
    expect(partShape(view('curved', { state: { radius: 1 } })).shape).toBe('curve');
    expect(cuesFor(view('sensor', { signals: { 'E.detect': true } })).state).toBe('true');
    expect(cuesFor(view('stop-blade', { signals: { 'B.extend': false } })).state).toBe('false');
    expect(cuesFor(view('pick-place', { signals: { 'P.gripped': true, 'P.run': false } })).state).toBe('true');
    expect(cuesFor(view('tank', { state: { level: 1, fraction: 0.5 }, signals: { 'T.level': 1 } })).value).toEqual({
      text: '1.00 m',
      fraction: 0.5,
    });
    expect(partDecor(view('stack-light')).map((d) => d.slot)).toEqual(['red', 'amber', 'green']);
    expect(partDecor(view('belt'))).toEqual([]);
    const p = paletteFor({ mode: 'light', reducedMotion: false });
    expect([itemToneOf(item({ tag: 'lid' }), p), itemToneOf(item({ tag: 'base' }), p), itemToneOf(item({ tag: 'box' }), p)]).toEqual([
      p.items.lid,
      p.items.base,
      p.item,
    ]);
  });
});
