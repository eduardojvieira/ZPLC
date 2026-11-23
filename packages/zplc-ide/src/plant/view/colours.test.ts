/**
 * Item and part colours (spec 012 VIS-018, finding F3): a "red" item is red, a "blue" one blue, an item with no colour is neither,
 * a base and a lid have colours of their own, and the parts keep their own colours under every display mode.
 */
import { describe, expect, it } from 'bun:test';
import type { BodyPose } from '../contracts';
import { paletteFor, type DisplayMode } from './displayModes';
import { itemToneOf } from './geometry';
import { partColour } from './look';

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
