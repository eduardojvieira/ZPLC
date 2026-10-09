import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseColor, readThemeTokens, resolveThemeTokens, type ThemeName } from './themeTokens';

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

  it('knows every theme the stylesheet defines', () => {
    const names: ThemeName[] = ['light', 'dark', 'high-contrast', 'system-dark'];
    for (const name of names) expect(Object.keys(resolveThemeTokens(css, name)).length).toBeGreaterThan(20);
  });
});
