import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { contrastRatio, resolveThemeTokens, type ThemeName } from './themeTokens';

const raw = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const THEMES: ThemeName[] = ['light', 'dark', 'high-contrast', 'system-dark'];
const SURFACES = ['--color-surface-900', '--color-surface-800', '--color-surface-700'] as const;

/** Innermost `selector { body }` pairs, whether or not they sit inside an @media block. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));

/** UX-005: one focus indicator, defined once, visible in every theme and never removed without a replacement. */
describe('focus ring', () => {
  it('is defined as three tokens', () => {
    const light = resolveThemeTokens(raw, 'light');
    expect(light['--focus-ring-color']).toBeDefined();
    expect(light['--focus-ring-width']).toBe('2px');
    expect(light['--focus-ring-offset']).toBe('2px');
  });

  it('is applied by one global :focus-visible rule built from those tokens', () => {
    const outlines = rules.filter(({ selector, body }) => selector.includes(':focus-visible') && /outline/.test(body));
    expect(outlines.map(({ selector }) => selector)).toEqual([':focus-visible']);
    expect(outlines[0].body).toMatch(/outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--focus-ring-color\)/);
    expect(outlines[0].body).toMatch(/outline-offset:\s*var\(--focus-ring-offset\)/);
  });

  it('is never switched off by a rule of the stylesheet', () => {
    expect(css).not.toMatch(/outline(-style)?\s*:\s*(none|0)\b/);
    expect(css).not.toMatch(/@apply[^;]*outline-(none|hidden)/);
  });

  it('keeps no second focus system in the stylesheet', () => {
    const boxShadowFocus = rules.filter(({ selector, body }) => /:focus(-visible)?/.test(selector) && /box-shadow/.test(body));
    expect(boxShadowFocus).toEqual([]);
  });

  it('is thicker in the high-contrast theme and follows the system colour in forced-colors mode', () => {
    expect(resolveThemeTokens(raw, 'high-contrast')['--focus-ring-width']).toBe('3px');
    const forced = /@media \(forced-colors: active\) \{[\s\S]*$/.exec(css)?.[0] ?? '';
    expect(forced).toMatch(/--focus-ring-color:\s*Highlight/);
  });

  for (const theme of THEMES) {
    it(`has at least 3:1 contrast against the canvas, panel and node surfaces of the ${theme} theme`, () => {
      const tokens = resolveThemeTokens(raw, theme);
      for (const surface of SURFACES) expect({ surface, ratio: contrastRatio(tokens['--focus-ring-color'], tokens[surface]) >= 3 }).toEqual({ surface, ratio: true });
    });
  }
});
