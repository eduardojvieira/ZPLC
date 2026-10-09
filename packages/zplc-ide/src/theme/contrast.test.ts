import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { SIGNAL_TEXT_CLASS } from './signalTone';
import { composite, contrastRatio, parseColor, resolveThemeTokens, type ThemeName, type TokenMap } from './themeTokens';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

/** Colour the interface puts on a solid accent fill. */
const ON_ACCENT = '--color-on-accent';

interface Pair { fg: string; bg: string; over?: string; min: number }

const SURFACES = ['--color-surface-900', '--color-surface-800', '--color-surface-700'];
const ACCENTS = ['--color-accent-blue', '--color-accent-green', '--color-accent-yellow', '--color-accent-red', '--color-accent-purple'];
const FILLS = ['--color-accent-blue', '--color-accent-green', '--color-accent-red', '--color-accent-purple', '--color-accent-yellow'];
const SIGNAL_TOKENS = Object.values(SIGNAL_TEXT_CLASS).map((className) => /var\((--[\w-]+)\)/.exec(className)![1]);

const text = (fgs: string[], bgs: string[]): Pair[] => fgs.flatMap((fg) => bgs.map((bg) => ({ fg, bg, min: 4.5 })));
const graphic = (fgs: string[], bgs: string[]): Pair[] => fgs.flatMap((fg) => bgs.map((bg) => ({ fg, bg, min: 3 })));

/** WCAG 2.2 AA (UX-024): 4.5:1 for text, 3:1 for graphics that carry meaning. Rules and borders that only decorate are exempt. */
const PAIRS: Pair[] = [
  ...text(['--text-primary', '--text-secondary', '--text-tertiary', '--text-muted'], SURFACES),
  ...text(ACCENTS, SURFACES),
  ...text(SIGNAL_TOKENS, ['--color-surface-800']),
  ...FILLS.map((bg) => ({ fg: ON_ACCENT, bg, min: 4.5 })),
  ...['--debug-chip', '--debug-chip-true', '--debug-chip-false'].map((chip) => ({ fg: `${chip}-text`, bg: `${chip}-bg`, over: '--color-surface-800', min: 4.5 })),
  ...graphic(['--visual-wire'], ['--visual-canvas']),
  ...graphic(['--focus-ring-color', '--separator-rule'], SURFACES),
];

const colour = (tokens: TokenMap, spec: string) => (spec.startsWith('--') ? parseColor(tokens[spec] ?? (() => { throw new Error(`Undefined token ${spec}`); })()) : parseColor(spec));

function failures(theme: ThemeName): string[] {
  const tokens = resolveThemeTokens(css, theme);
  return PAIRS.flatMap(({ fg, bg, over, min }) => {
    const back = over ? composite(colour(tokens, bg), colour(tokens, over)) : colour(tokens, bg);
    const ratio = contrastRatio(colour(tokens, fg), back);
    return ratio >= min ? [] : [`${fg} on ${bg}${over ? ` over ${over}` : ''}: ${ratio.toFixed(2)}:1, needs ${min}:1`];
  });
}

describe('theme token contrast', () => {
  for (const theme of ['light', 'dark', 'high-contrast', 'system-dark'] as const) {
    it(`meets WCAG 2.2 AA for every declared pair in the ${theme} theme`, () => {
      expect(failures(theme)).toEqual([]);
    });
  }
});

describe('theme token consistency', () => {
  it('applies the same tokens whether the dark theme is chosen or follows the system preference', () => {
    expect(resolveThemeTokens(css, 'system-dark')).toEqual(resolveThemeTokens(css, 'dark'));
  });

  it('gives text-white on a solid accent fill the on-accent colour of the theme', () => {
    const bridge = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, selector]) => selector.includes('[class~="text-white"]') && selector.includes('bg-[var(--color-accent-'));
    expect(bridge?.[2]).toMatch(/color:\s*var\(--color-on-accent\)/);
  });
});
