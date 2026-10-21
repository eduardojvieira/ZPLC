import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

import { contrastRatio } from '../theme/color';
import { THEME_IDS, resolveTokens } from '../theme/tokens';
import { breakpointDecorationClasses, breakpointHoverMessage } from './breakpoints';

const raw = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const rule = (selector: string) =>
  rules
    .filter((item) => item.selector === selector)
    .map((item) => item.body)
    .join('\n');
const REASON = 'the runtime cannot stop at a breakpoint right now';

/** LX-2b: a breakpoint the runtime will not stop at has to look inactive, not only say so in its hover text. */
describe('breakpoint dots the runtime will not stop at', () => {
  // Fails while the editor gives every dot the plain breakpoint-glyph class (utils/breakpoints.ts).
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

  // Fails if the ring's colour is lowered below the 3:1 a graphic needs, or made the colour of the armed dot.
  it('keep a grey ring that meets 3:1 against the editor margin in every theme and differs from the armed dot', () => {
    // The filled dot is the breakpoint token (--debug-breakpoint), whatever the theme makes of it.
    expect(rule('.breakpoint-glyph')).toMatch(/background:\s*var\(--debug-breakpoint\)/);
    for (const theme of THEME_IDS) {
      const tokens = resolveTokens(theme);
      const margin = tokens['--color-surface-800'];
      const ring = contrastRatio(tokens['--color-surface-400'], margin);
      expect({ theme, atLeast3: ring >= 3, differsFromArmed: tokens['--color-surface-400'] !== tokens['--debug-breakpoint'] }).toEqual({
        theme,
        atLeast3: true,
        differsFromArmed: true,
      });
    }
  });
});
