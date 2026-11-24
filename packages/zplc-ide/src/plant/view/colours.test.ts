/**
 * Item and part colours (spec 012 VIS-018, finding F3): a "red" item is red, a "blue" one blue, an item with no colour is neither,
 * a base and a lid have colours of their own, and the parts keep their own colours under every display mode.
 */
import { describe, expect, it } from 'bun:test';
import type { BodyPose } from '../contracts';
import { paletteFor, type DisplayMode } from './displayModes';
import { itemToneOf } from './geometry';
import { epoxyFloor, partColour, roleLook } from './look';

const hsl = (hex: number) => {
  const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, l };
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, l };
};
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const item = (over: Partial<BodyPose> = {}): Pick<BodyPose, 'kind' | 'tag' | 'colour' | 'metal'> => ({ kind: 'item', ...over });
const MODES: DisplayMode[] = ['light', 'dark', 'high-contrast'];

describe('item colours (VIS-018)', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`VIS-018 in ${mode} mode a red item is red, a blue one blue, and a box with no colour is neither`, () => {
      const p = paletteFor({ mode, reducedMotion: false });
      const red = hsl(itemToneOf(item({ colour: 'red' }), p));
      const blue = hsl(itemToneOf(item({ colour: 'blue' }), p));
      const box = hsl(itemToneOf(item({ tag: 'box' }), p));
      expect(hueDistance(red.h, 0)).toBeLessThanOrEqual(25);
      expect(hueDistance(blue.h, 240)).toBeLessThanOrEqual(25);
      for (const named of [red, blue]) expect(hueDistance(box.h, named.h) > 25 || Math.abs(box.l - named.l) >= 0.15).toBe(true);
    });
  }

  it('VIS-018 a base and a lid have colours of their own, never the colour of a conveyor, in every display mode', () => {
    for (const mode of MODES) {
      const p = paletteFor({ mode, reducedMotion: false });
      const [base, lid, box] = (['base', 'lid', 'box'] as const).map((tag) => itemToneOf(item({ tag }), p));
      expect(new Set([base, lid, box]).size).toBe(3);
      for (const conveyor of ['belt', 'curved', 'roller']) expect([base, lid]).not.toContain(partColour(conveyor, p));
    }
  });

  it('VIS-018 the three display modes draw a red item in three different tones', () => {
    expect(new Set(MODES.map((mode) => itemToneOf(item({ colour: 'red' }), paletteFor({ mode, reducedMotion: false })))).size).toBe(3);
  });
});

describe('part colours (VIS-018)', () => {
  it('VIS-018 parts keep their own colours under every palette: a belt, a tank, a stack light and a pusher differ', () => {
    for (const mode of MODES) {
      const p = paletteFor({ mode, reducedMotion: false });
      expect(new Set(['belt', 'tank', 'stack-light', 'pusher', 'sensor'].map((part) => partColour(part, p))).size).toBe(5);
    }
  });
});

describe('the floor of the medium and high levels (VIS-015)', () => {
  it('VIS-015 in light and dark the floor fades into a haze of another tone at the horizon, under a wall of a third tone', () => {
    for (const mode of ['light', 'dark'] as const) {
      const f = epoxyFloor(paletteFor({ mode, reducedMotion: false }))!;
      expect(new Set([f.floor, f.haze, f.wall]).size).toBe(3);
    }
    expect(epoxyFloor(paletteFor({ mode: 'high-contrast', reducedMotion: false }))).toBeNull(); // flat, as it was
  });
});

describe('material roles of the composed models (VIS-014, VIS-015)', () => {
  const light = paletteFor({ mode: 'light', reducedMotion: false });
  const spread = (hex: number) => {
    const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    return Math.max(r, g, b) - Math.min(r, g, b);
  };

  it('VIS-014 a frame is silver anodised aluminium on every part, satin beside the brushed steel of drums and plates', () => {
    const frame = roleLook('frame', 'belt', light);
    expect(frame.skin).toBe('brushed-metal');
    expect(frame.metalness).toBe(1);
    expect(spread(frame.colour)).toBeLessThanOrEqual(16); // silver, not a painted colour
    expect(hsl(frame.colour).l).toBeGreaterThan(hsl(roleLook('steel', 'belt', light).colour).l);
    expect(frame.roughness).toBeGreaterThan(roleLook('steel', 'belt', light).roughness);
    for (const part of ['belt', 'gantry', 'stacker-crane']) expect(roleLook('frame', part, light)).toEqual(frame);
  });

  it('VIS-014 a painted part keeps its own colour on painted steel; a rubber pad is dark and not metallic', () => {
    for (const mode of ['light', 'dark', 'high-contrast'] as const) {
      const palette = paletteFor({ mode, reducedMotion: false });
      expect(roleLook('painted', 'gantry', palette).colour).toBe(partColour('gantry', palette));
    }
    expect(roleLook('painted', 'gantry', light).skin).toBe('painted-steel');
    const rubber = roleLook('rubber', 'belt', light);
    expect(rubber.metalness).toBe(0);
    expect(hsl(rubber.colour).l).toBeLessThan(0.2);
  });
});
