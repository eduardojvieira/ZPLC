import { describe, expect, it } from 'bun:test';
import { applyDisplayPrefs, paletteFor, type DisplayMode } from './displayModes';

const lum = (hex: number): number => {
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: number, b: number): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const modes: DisplayMode[] = ['light', 'dark', 'high-contrast'];

describe('display modes', () => {
  it('VIS-009 high contrast outlines sensors, actuators and items', () => {
    expect(paletteFor({ mode: 'high-contrast', reducedMotion: false }).outline).not.toBeNull();
    expect(paletteFor({ mode: 'light', reducedMotion: false }).outline).toBeNull();
    expect(paletteFor({ mode: 'dark', reducedMotion: false }).outline).toBeNull();
  });

  it('VIS-009 reduced motion turns off camera animation', () => {
    const calls: boolean[] = [];
    const target = { setCameraAnimation: (on: boolean) => calls.push(on) };
    applyDisplayPrefs(target, { mode: 'light', reducedMotion: true });
    applyDisplayPrefs(target, { mode: 'light', reducedMotion: false });
    expect(calls).toEqual([false, true]);
  });

  it('VIS-009 a renderer without camera animation or palette support is left alone', () => {
    expect(() => applyDisplayPrefs({}, { mode: 'dark', reducedMotion: true })).not.toThrow();
  });

  it('VIS-009 the palette reaches the renderer when it can take one', () => {
    const got: unknown[] = [];
    applyDisplayPrefs({ setPalette: (p) => got.push(p) }, { mode: 'dark', reducedMotion: false });
    expect(got).toEqual([paletteFor({ mode: 'dark', reducedMotion: false })]);
  });

  for (const mode of modes) {
    it(`VIS-009 the ${mode} palette meets a 4.5:1 contrast ratio for the beam and every item tone against the floor`, () => {
      const p = paletteFor({ mode, reducedMotion: false });
      for (const tone of [p.beam, p.item, ...Object.values(p.items)]) expect(contrast(tone, p.floor)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
