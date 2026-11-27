import { describe, expect, it } from 'bun:test';
import type { DisplayMode } from '../../src/plant/view/displayModes';
import { colourProblems, OUTLINE_MIN, PAIR_MIN, stateProblems, type ColourRecord, type StateRecord } from './e1Checks';

const MODES: readonly DisplayMode[] = ['light', 'dark', 'high-contrast'];
const RECT = { x: 10, y: 20, w: 100, h: 80 };

const stateRecord = (over: Partial<StateRecord> = {}): StateRecord => ({
  key: 'push-button',
  scene: 'belt-to-sensor',
  view: 'start',
  mode: 'light',
  reducedMotion: false,
  a: 'released',
  b: 'pressed',
  rect: RECT,
  fraction: 0.05,
  crops: null,
  ...over,
});

const allModes = (over: Partial<StateRecord> = {}): StateRecord[] => MODES.map((mode) => stateRecord({ ...over, mode }));

const colourRecord = (over: Partial<ColourRecord> = {}): ColourRecord => ({
  mode: 'light',
  quality: 'medium',
  scene: 'colour-separation',
  item: 'item-1',
  named: 'red',
  rgb: [220, 40, 40],
  hsl: { h: 0, s: 0.72, l: 0.51 },
  white: 0.05,
  rect: RECT,
  ...over,
});

const validColourSet = (mode: DisplayMode = 'light'): ColourRecord[] => [
  colourRecord({ mode, item: 'red-1', named: 'red', rgb: [220, 40, 40], hsl: { h: 4, s: 0.72, l: 0.51 } }),
  colourRecord({ mode, item: 'blue-1', named: 'blue', rgb: [40, 70, 220], hsl: { h: 230, s: 0.72, l: 0.51 } }),
  colourRecord({ mode, item: 'plain-1', named: null, rgb: [185, 145, 95], hsl: { h: 33, s: 0.38, l: 0.55 } }),
  colourRecord({
    mode,
    scene: 'two-axis-assembly',
    item: 'lid-1',
    named: 'lid',
    rgb: [210, 175, 70],
    hsl: { h: 45, s: 0.6, l: 0.55 },
    ground: { part: 'belt-lid', rgb: [60, 62, 66], hsl: { h: 220, s: 0.05, l: 0.25 } },
  }),
  colourRecord({
    mode,
    scene: 'two-axis-assembly',
    item: 'base-1',
    named: 'base',
    rgb: [90, 165, 110],
    hsl: { h: 136, s: 0.3, l: 0.5 },
    ground: { part: 'belt-base', rgb: [60, 62, 66], hsl: { h: 220, s: 0.05, l: 0.25 } },
  }),
];

describe('E1 stateProblems', () => {
  it('VIS-016 reports a state pair below 1 % of its box and accepts one at or above 1 %', () => {
    const below = stateProblems({
      records: [
        stateRecord({ mode: 'light', fraction: PAIR_MIN - 0.0001 }),
        stateRecord({ mode: 'dark', fraction: PAIR_MIN }),
        stateRecord({ mode: 'high-contrast', fraction: 0.05 }),
      ],
      missing: [],
    });
    expect(below).toHaveLength(1);
    expect(below[0]).toContain('VIS-016');
    expect(below[0]).toContain('0.99 %');

    expect(stateProblems({ records: allModes({ fraction: PAIR_MIN }), missing: [] })).toEqual([]);
    expect(stateProblems({ records: allModes({ fraction: 0.05 }), missing: [] })).toEqual([]);
  });

  it('VIS-016 reports a missing box, a missing display mode, and conveyor motion violations', () => {
    expect(
      stateProblems({
        records: [
          stateRecord({ mode: 'light', rect: null, fraction: 0 }),
          stateRecord({ mode: 'dark' }),
          stateRecord({ mode: 'high-contrast' }),
        ],
        missing: [],
      }),
    ).toEqual([expect.stringContaining('no box in the frame')]);

    expect(stateProblems({ records: [stateRecord({ mode: 'light' }), stateRecord({ mode: 'dark' })], missing: [] })).toEqual([
      expect.stringContaining('not drawn in each display mode'),
    ]);

    const stalled = stateProblems({
      records: [
        ...allModes({ key: 'belt', motion: 0.04 }),
        stateRecord({ key: 'belt', mode: 'light', reducedMotion: true, motion: 0.02 }),
      ],
      missing: [],
    });
    expect(stalled).toEqual([expect.stringContaining('moves')]);

    const frozen = stateProblems({
      records: [
        stateRecord({ key: 'belt', mode: 'light', motion: 0 }),
        stateRecord({ key: 'belt', mode: 'dark', motion: 0.04 }),
        stateRecord({ key: 'belt', mode: 'high-contrast', motion: 0.04 }),
      ],
      missing: [],
    });
    expect(frozen).toEqual([expect.stringContaining('does not move')]);
  });
});

describe('E1 colourProblems', () => {
  it('VIS-018 accepts valid coloured, plain, lid, base and high-contrast records', () => {
    expect(colourProblems(['red', 'blue'], [...validColourSet('light'), ...validColourSet('high-contrast')])).toEqual([]);
  });

  it('VIS-018 reports a named item drawn with the wrong hue', () => {
    const records = validColourSet('light').map((r) => (r.named === 'red' ? { ...r, hsl: { h: 120, s: 0.72, l: 0.51 } } : r));
    const problems = colourProblems(['red', 'blue'], records);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('VIS-018');
    expect(problems[0]).toContain('hue 120');
  });

  it('VIS-018 reports a lid whose colour matches the conveyor belt under it', () => {
    const beltHsl = { h: 220, s: 0.05, l: 0.25 };
    const records = validColourSet('light').map((r) =>
      r.named === 'lid' ? { ...r, hsl: beltHsl, ground: { part: 'belt-lid', rgb: [60, 62, 66], hsl: beltHsl } } : r,
    );
    const problems = colourProblems(['red', 'blue'], records);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('VIS-018');
    expect(problems[0]).toContain('looks like the conveyor belt-lid');
  });

  it('VIS-009 reports a coloured item in high contrast whose white outline is below the floor', () => {
    const records = validColourSet('high-contrast').map((r) => (r.named === 'blue' ? { ...r, white: OUTLINE_MIN - 0.005 } : r));
    const problems = colourProblems(['red', 'blue'], records);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('VIS-009');
    expect(problems[0]).toContain('outlined');
  });
});
