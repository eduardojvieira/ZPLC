import { describe, expect, it } from 'bun:test';
import { contrastRatio, parseColor } from '../theme/color';
import { resolveTokens } from '../theme/tokens';
import { ZPLC_DARK_THEME, ZPLC_HIGH_CONTRAST_THEME, ZPLC_LIGHT_THEME } from './monaco-themes';

const themes = [
  { id: 'light', theme: ZPLC_LIGHT_THEME, base: 'vs' },
  { id: 'dark', theme: ZPLC_DARK_THEME, base: 'vs-dark' },
  { id: 'high-contrast', theme: ZPLC_HIGH_CONTRAST_THEME, base: 'hc-black' },
] as const;

describe('Monaco themes are generated from the semantic roles (UX-003)', () => {
  for (const { id, theme, base } of themes) {
    it(`takes the editor background and text of the ${id} theme from the tokens`, () => {
      const tokens = resolveTokens(id);
      expect(theme.base).toBe(base);
      expect(parseColor(theme.colors['editor.background']!)).toEqual(parseColor(tokens['--editor-bg']));
      expect(parseColor(theme.colors['editor.foreground']!)).toEqual(parseColor(tokens['--editor-fg']));
    });

    it(`draws every syntax rule of the ${id} theme at 4.5:1 or more on the editor background`, () => {
      const background = theme.colors['editor.background']!;
      for (const rule of theme.rules) {
        const ratio = contrastRatio(`#${rule.foreground}`, background);
        expect({ token: rule.token, ok: ratio >= 4.5 }).toEqual({ token: rule.token, ok: true });
      }
    });
  }

  it('keeps the selection translucent, as #rrggbbaa', () => {
    expect(ZPLC_DARK_THEME.colors['editor.selectionBackground']).toMatch(/^#[0-9a-f]{8}$/);
  });

  it('colours keywords, types and addresses differently, so structure is not carried by one hue', () => {
    for (const { theme } of themes) {
      const by = Object.fromEntries(theme.rules.map((rule) => [rule.token, rule.foreground]));
      expect(new Set([by.keyword, by.type, by['variable.predefined'], by.string, by.number]).size).toBeGreaterThanOrEqual(3);
    }
  });
});
