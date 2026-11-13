import { describe, expect, it } from 'bun:test';
import type { BodyPose, PartView, Vec3 } from '../contracts';
import { ACTIVE_SUFFIXES, cuesFor, type PartCues } from './cues';
import { paletteFor, type DisplayMode } from './displayModes';
import { crateBoxes, crateWallMatrices, instanceMatrices, itemToneOf, OUTLINED_PARTS, partDecor, partShape } from './geometry';

// View kinds the M5 parts publish (plan-m5 "View state keys"); limit-switch, aligner and chute are the names Task B4 is
// specified to publish. Real-snapshot tests belong to K10.
const KINDS = [
  ...['crate', 'lift', 'stacker-crane', 'stacker-mast', 'stacker-rack', 'machining-centre'],
  ...['machining-door', 'limit-switch', 'aligner', 'chute'],
] as const;
const MODES: readonly DisplayMode[] = ['light', 'dark', 'high-contrast'];

const view = (part: string, over: Partial<PartView> = {}, size: Vec3 = [0.4, 0.1, 0.3], p: Vec3 = [1, 0.5, 0]): PartView => ({
  id: `${part}1`,
  part,
  name: `${part}1`,
  pose: { id: `${part}1`, part, kind: 'box', size, p, q: [0, 0, 0, 1] },
  state: {},
  signals: {},
  ...over,
});
const crate = (over: Partial<BodyPose> = {}): BodyPose => ({
  id: 'c',
  part: 'box',
  kind: 'box',
  size: [0.8, 0.25, 0.6],
  p: [2, 0.2, 1],
  q: [0, 0, 0, 1],
  tag: 'crate',
  ...over,
});

describe('M5 view kinds', () => {
  it('VIS-003 every M5 view kind is matched by partShape, and an unknown name falls to the pose box', () => {
    for (const kind of KINDS) expect(partShape(view(kind))).toEqual({ shape: 'box', size: [0.4, 0.1, 0.3] });
    expect(partShape(view('no-such-part'))).toEqual({ shape: 'box', size: [0.4, 0.1, 0.3] });
  });

  it('VIS-003 a crate is drawn open: a floor and four wall bars and no top', () => {
    const boxes = crateBoxes([0.8, 0.25, 0.6]);
    expect(boxes).toHaveLength(5);
    const top = 0.25 / 2;
    for (const b of boxes) expect(b.centre[1] + b.size[1] / 2).toBeLessThanOrEqual(top + 1e-9);
    // Nothing covers the middle of the top: every box either is the floor (low) or sits at the rim, outside the middle.
    for (const b of boxes.slice(1)) expect(Math.abs(b.centre[0]) > 0.3 || Math.abs(b.centre[2]) > 0.2).toBe(true);
    expect(boxes[0]!.size).toEqual([0.8, 0.02, 0.6]);
    const walls = crateWallMatrices([crate(), crate({ tag: undefined })]);
    expect(walls).toHaveLength(64); // four walls of the one crate
    // The crate's own instance is its floor, lowered to the bottom; a plain box keeps its centre.
    const inst = instanceMatrices([crate(), crate({ tag: undefined, size: [0.2, 0.2, 0.2] })]);
    expect(inst[13]).toBeCloseTo(0.2 - (0.25 - 0.02) / 2, 6);
    expect(inst[5]).toBeCloseTo(0.02, 6);
    expect(inst[16 + 13]).toBeCloseTo(0.2, 6);
    expect(inst[16 + 5]).toBeCloseTo(0.2, 6);
  });

  it('VIS-003 a yawed crate carries its walls round with it', () => {
    const s = Math.SQRT1_2;
    const m = crateWallMatrices([crate({ q: [0, s, 0, s] })]); // 90 degrees about y: local x walls lie along world z
    expect(m[12]).toBeCloseTo(2, 6); // the first wall moved from x = -0.39 to z = +0.39 about the centre
    expect(m[14]).toBeCloseTo(1 + 0.39, 6);
  });

  it(
    'VIS-003 a lift is told by its fraction and text, a crane by its fork extension marker, a machining centre by its doors and ' + 'text',
    () => {
      const lift = view('lift', { state: { fraction: 0.5, text: 'level 2', level: 2 } }, [1, 0.1, 0.7], [0, 0.6, 0]);
      expect(cuesFor(lift).value).toEqual({ text: 'level 2', fraction: 0.5 });
      const slots = partDecor(lift).map((d) => d.slot);
      expect(slots).toEqual(['direction', 'rail-a', 'rail-b']);
      const rail = partDecor(lift)[1]!;
      expect(rail.centre[1] + rail.size[1] / 2).toBeCloseTo(0.05, 6); // reaches the platform top
      expect(rail.centre[1] - rail.size[1] / 2).toBeCloseTo(-0.6, 6); // and the floor

      const home = view('stacker-crane', { state: { fraction: 0, text: 'bay 1, level 1, fork centre' } }, [0.8, 0.05, 0.6]);
      const out = view('stacker-crane', { state: { fraction: -0.5, text: 'bay 1, level 1, fork left' } }, [0.8, 0.05, 0.6]);
      expect(partDecor(home).map((d) => d.slot)).toEqual(['extension']);
      const tip = partDecor(out).find((d) => d.slot === 'tip')!;
      expect(tip.centre[2]).toBeLessThan(0);
      expect(cuesFor(out).value?.text).toBe('bay 1, level 1, fork left');

      const mc = (fraction: number, busy: boolean, text: string) =>
        view('machining-centre', { state: { fraction, text, busy } }, [1, 0.5, 0.6]);
      const bar = (v: PartView) => partDecor(v).find((d) => d.slot === 'progress')!;
      expect(bar(mc(0, false, 'idle')).size[0]).toBe(0);
      expect(bar(mc(0.5, true, 'busy 2.5 s')).size[0]).toBeCloseTo(0.5, 6);
      expect(bar(mc(0.5, true, 'busy 2.5 s')).lit).toBe(true);
      expect(bar(mc(1, false, 'done')).lit).toBe(false);
      expect(partDecor(mc(0, false, 'idle')).filter((d) => d.slot.startsWith('post'))).toHaveLength(4);
      expect(cuesFor(mc(0.5, true, 'busy 2.5 s')).value).toEqual({ text: 'busy 2.5 s', fraction: 0.5 });
      expect(partDecor(view('machining-door', { state: { fraction: 1 } }))).toEqual([]);
    },
  );

  it('VIS-003 ACTIVE_SUFFIXES keeps its order and the chain transfer lift signal still reads as active', () => {
    expect<readonly string[]>(ACTIVE_SUFFIXES).toEqual([
      ...['gripped', 'divert', 'lift', 'detect', 'extended', 'run', 'extend', 'pressed', 'lit', 'emit'],
      ...['up', 'down', 'raise', 'start', 'align', 'contact'],
    ]);
    const ct = view('chain-transfer', { name: 'CT', signals: { 'CT.lift': true, 'CT.run': false } });
    expect(cuesFor(ct).state).toBe('true');
    expect(cuesFor(view('chain-transfer', { name: 'CT', signals: { 'CT.lift': false, 'CT.run': true } })).state).toBe('false');
    expect(cuesFor(view('limit-switch', { name: 'LS', signals: { 'LS.contact': true } })).state).toBe('true');
    expect(cuesFor(view('aligner', { name: 'A', signals: { 'A.open': true, 'A.align': false } })).state).toBe('false');
  });

  it('VIS-009 high contrast outlines the new parts and the crate keeps its tone in every display mode', () => {
    for (const kind of ['lift', 'stacker-crane', 'machining-centre', 'machining-door', 'limit-switch', 'aligner', 'chute'])
      expect(OUTLINED_PARTS.has(kind)).toBe(true);
    for (const mode of MODES) {
      const palette = paletteFor({ mode, reducedMotion: false });
      const tones = [itemToneOf(crate(), palette), itemToneOf(crate({ tag: 'lid' }), palette), itemToneOf(crate({ tag: 'base' }), palette)];
      expect(tones[0]).toBe(itemToneOf({}, palette)); // the item tone, as a plain box has
      expect(new Set(tones).size).toBe(3);
    }
  });

  it('VIS-003 the cues and shapes of the M1 to M4 parts are unchanged', () => {
    const table: [string, Partial<PartView>, PartCues['state']][] = [
      ['sensor', { name: 'S', signals: { 'S.detect': true } }, 'true'],
      ['pusher', { name: 'P', signals: { 'P.extended': false } }, 'false'],
      ['stop-blade', { name: 'B', signals: { 'B.lift': true } }, 'true'],
      ['scale', { name: 'W', signals: { 'W.weight': 3 } }, 'true'],
      ['belt', { name: 'K', signals: {} }, 'unknown'],
      ['turntable', { name: 'T', state: { fault: true } }, 'fault'],
    ];
    for (const [part, over, state] of table) {
      expect(cuesFor(view(part, over)).state).toBe(state);
      expect(partShape(view(part))).toEqual({ shape: 'box', size: [0.4, 0.1, 0.3] });
    }
    expect(partDecor(view('turntable')).map((d) => d.slot)).toEqual(['direction']);
    expect(partDecor(view('belt'))).toEqual([]);
    expect(instanceMatrices([crate({ tag: undefined })])[13]).toBeCloseTo(0.2, 6);
  });
});
