import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

import { contrastRatio, resolveThemeTokens, type ThemeName } from '../theme/themeTokens';
import { breakpointDecorationClasses, breakpointHoverMessage } from './codeEditorBreakpoints';

const raw = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const rule = (selector: string) => rules.filter((item) => item.selector === selector).map((item) => item.body).join('\n');
const THEMES: ThemeName[] = ['light', 'dark', 'high-contrast', 'system-dark'];
const REASON = 'the runtime cannot stop at a breakpoint right now';

/** LX-2b: a breakpoint the runtime will not stop at has to look inactive, not only say so in its hover text. */
describe('breakpoint dots the runtime will not stop at', () => {
  // Fails while the editor gives every dot the plain breakpoint-glyph class (components/codeEditorBreakpoints.ts).
  it('get the inactive classes only while the store holds a reason, next to the hover text that gives it', () => {
    expect(breakpointDecorationClasses(null)).toEqual({ glyph: 'breakpoint-glyph', line: 'breakpoint-line-decoration' });
    expect(breakpointDecorationClasses(REASON)).toEqual({
      glyph: 'breakpoint-glyph breakpoint-glyph-inactive',
      line: 'breakpoint-line-decoration breakpoint-line-decoration-inactive',
    });
    expect(breakpointHoverMessage(7, REASON)).toContain('not active');
  });

  // Fails without the .breakpoint-glyph-inactive rule in index.css: the dot stays a filled red disc.
  it('are drawn hollow and grey from design tokens, with no raw colour', () => {
    const glyph = rule('.breakpoint-glyph.breakpoint-glyph-inactive');
    expect(glyph).toMatch(/background:\s*transparent/);
    expect(glyph).toMatch(/border:\s*2px solid var\(--color-surface-400\)/);
    expect(glyph).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(rule('.breakpoint-line-decoration.breakpoint-line-decoration-inactive')).toMatch(/background:\s*transparent/);
  });

  // Fails if the ring's colour is lowered below the filled dot's: it keeps the contrast the red dot has in every theme.
  it('keep a ring at least as visible as the filled dot against the editor margin in every theme', () => {
    const filled = /background:\s*(#[0-9a-f]{6})/i.exec(rule('.breakpoint-glyph'))![1];
    for (const theme of THEMES) {
      const tokens = resolveThemeTokens(raw, theme);
      const margin = tokens['--color-surface-800'];
      const ring = contrastRatio(tokens['--color-surface-400'], margin);
      expect({ theme, atLeast3: ring >= 3, atLeastFilledDot: ring >= contrastRatio(filled, margin) }).toEqual({ theme, atLeast3: true, atLeastFilledDot: true });
    }
  });
});
