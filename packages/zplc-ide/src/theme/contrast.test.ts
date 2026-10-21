import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CONTRAST_PAIRS, THEME_IDS, contrastResults, resolveTokens } from './tokens';
import { renderTokensCss } from './tokensCss';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

/** WCAG 2.2 AA (UX-024): 4.5:1 for text, 3:1 for graphics that carry meaning. Rules and borders that only decorate are exempt. */
describe('theme token contrast (UX-024 stopgap: the main screens have no automated check yet)', () => {
  for (const theme of THEME_IDS) {
    it(`meets WCAG 2.2 AA for every declared pair in the ${theme} theme`, () => {
      const failures = contrastResults(theme)
        .filter((result) => !result.ok)
        .map(
          ({ pair, ratio }) =>
            `${pair.fg} on ${pair.bg}${pair.over ? ` over ${pair.over}` : ''}: ${ratio.toFixed(2)}:1, needs ${pair.min}:1`,
        );
      expect(failures).toEqual([]);
    });
  }

  it('declares the pairs of the kit, the signals, the focus ring and the code editor', () => {
    const names = new Set(CONTRAST_PAIRS.flatMap((pair) => [pair.fg, pair.bg]));
    for (const required of [
      '--button-fg',
      '--input-border',
      '--signal-true-fg',
      '--signal-fault-fg',
      '--focus-ring-color',
      '--syntax-keyword',
      '--tooltip-fg',
    ]) {
      expect({ required, declared: names.has(required) }).toEqual({ required, declared: true });
    }
    expect(CONTRAST_PAIRS.every((pair) => pair.min === 3 || pair.min === 4.5)).toBe(true);
  });
});

describe('theme token consistency (UX-003)', () => {
  it('applies the dark tokens when the system prefers dark, but never over an explicit light, dark or high-contrast choice', () => {
    const rendered = renderTokensCss();
    const media = /@media \(prefers-color-scheme: dark\) \{\s*(:root:not\([^{]*\))\s*\{([^}]*)\}/.exec(rendered);
    expect(media).not.toBeNull();
    for (const excluded of ['.light', '.dark', '.high-contrast']) expect(media![1]).toContain(`:not(${excluded})`);
    const dark = /:root\.dark \{([^}]*)\}/.exec(rendered)![1];
    const lines = (body: string) =>
      body
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    expect(lines(media![2])).toEqual(lines(dark));
  });

  it('puts the high-contrast block after the system preference, so it wins at equal specificity', () => {
    const rendered = renderTokensCss();
    expect(rendered.indexOf(':root.high-contrast {')).toBeGreaterThan(rendered.indexOf('prefers-color-scheme: dark'));
  });

  it('gives the dark and the high-contrast theme a canvas that differs from the light one', () => {
    const [light, dark, highContrast] = THEME_IDS.map((theme) => resolveTokens(theme)['--color-surface-900']);
    expect(new Set([light, dark, highContrast]).size).toBe(3);
  });

  it('gives text-white on a solid accent fill the on-accent colour of the theme until the kit replaces it', () => {
    const bridge = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
      ([, selector]) => selector.includes('[class~="text-white"]') && selector.includes('bg-[var(--color-accent-'),
    );
    expect(bridge?.[2]).toMatch(/color:\s*var\(--color-on-accent\)/);
  });
});
