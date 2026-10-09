import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { composite, contrastRatio, parseColor, readThemeTokens, resolveThemeTokens, type ThemeName } from './themeTokens';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

describe('theme token reader', () => {
  it('resolves the canvas surface of each theme from index.css', () => {
    expect(resolveThemeTokens(css, 'light')['--color-surface-900']).toBe('#e7ece8');
    expect(resolveThemeTokens(css, 'dark')['--color-surface-900']).toBe('#0f171b');
    expect(resolveThemeTokens(css, 'high-contrast')['--color-surface-900']).toBe('#000');
  });

  it('lets a theme override the light defaults and keeps what it does not override', () => {
    const tokens = readThemeTokens('light-only { }\n:root { --a: #111; --b: #222; }\n:root.dark { --a: #333; }');
    expect(tokens.light).toEqual({ '--a': '#111', '--b': '#222' });
    expect(tokens.dark).toEqual({ '--a': '#333', '--b': '#222' });
  });

  it('resolves var() references against the theme that declares the override', () => {
    const tokens = resolveThemeTokens(':root { --base: #fff; --alias: var(--base); }\n:root.dark { --base: #000; }', 'dark');
    expect(tokens['--alias']).toBe('#000');
  });

  it('ignores comments', () => {
    expect(resolveThemeTokens('/* :root { --a: #111; } */ :root { --a: #222; }', 'light')['--a']).toBe('#222');
  });

  it('reads the dark tokens that the system preference applies', () => {
    expect(resolveThemeTokens(css, 'system-dark')['--color-surface-900']).toBe('#0f171b');
  });

  it('parses hex, rgb and rgba colours', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#0f171b')).toEqual({ r: 15, g: 23, b: 27, a: 1 });
    expect(parseColor('rgb(23 33 39 / 0.08)')).toEqual({ r: 23, g: 33, b: 39, a: 0.08 });
    expect(parseColor('rgba(37, 99, 235, 0.12)')).toEqual({ r: 37, g: 99, b: 235, a: 0.12 });
    expect(() => parseColor('Highlight')).toThrow();
  });

  it('leaves out the forced-colors overrides, whose colours the operating system picks', () => {
    const source = ':root { --ring: #111; }\n@media (forced-colors: active) {\n  :root { --ring: Highlight; }\n  a { color: red; }\n}\n:root.dark { --other: #222; }';
    expect(resolveThemeTokens(source, 'light')['--ring']).toBe('#111');
    expect(resolveThemeTokens(source, 'dark')['--other']).toBe('#222');
  });

  it('knows every theme the stylesheet defines', () => {
    const names: ThemeName[] = ['light', 'dark', 'high-contrast', 'system-dark'];
    for (const name of names) expect(Object.keys(resolveThemeTokens(css, name)).length).toBeGreaterThan(20);
  });
});

describe('WCAG 2.2 contrast', () => {
  it('matches the reference ratios', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('is symmetric, so a pair does not depend on which side is the text', () => {
    expect(contrastRatio('#5ba7df', '#0f171b')).toBe(contrastRatio('#0f171b', '#5ba7df'));
  });

  it('reproduces the white-on-accent figures the design review reported for the dark theme', () => {
    expect(contrastRatio('#ffffff', '#5ba7df')).toBeCloseTo(2.61, 2);
    expect(contrastRatio('#ffffff', '#ed7070')).toBeCloseTo(2.94, 2);
  });

  it('composites a translucent colour over its backdrop before measuring', () => {
    expect(composite(parseColor('rgba(0, 0, 0, 0.5)'), parseColor('#ffffff'))).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(contrastRatio('rgba(0, 0, 0, 0.5)', '#ffffff')).toBeCloseTo(contrastRatio('#808080', '#ffffff'), 1);
  });
});
