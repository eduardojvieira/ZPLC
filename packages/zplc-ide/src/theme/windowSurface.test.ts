import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolveTokens } from './tokens';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../../index.html');
const main = read('../../electron/main.ts');

/** Window set-up (UX-016): the colours the shell paints before the app's own CSS runs must be the theme's canvas token. */
describe('window surface (UX-016)', () => {
  const canvas = (theme: 'light' | 'dark') => resolveTokens(theme)['--color-surface-900'];

  it('gives the native window the light and dark canvas tokens until the renderer reports its own', () => {
    const table = /WINDOW_SURFACE\s*=\s*\{\s*light:\s*'(#[0-9a-fA-F]{6})',\s*dark:\s*'(#[0-9a-fA-F]{6})'/.exec(main);
    expect(table).not.toBeNull();
    expect(table![1].toLowerCase()).toBe(canvas('light'));
    expect(table![2].toLowerCase()).toBe(canvas('dark'));
  });

  it('paints the page in the system theme canvas before any script or stylesheet loads', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(/html\s*\{\s*background:\s*(#[0-9a-fA-F]{6})/.exec(style)?.[1]?.toLowerCase()).toBe(canvas('light'));
    const dark = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*html\s*\{\s*background:\s*(#[0-9a-fA-F]{6})/.exec(style);
    expect(dark?.[1]?.toLowerCase()).toBe(canvas('dark'));
  });

  it('titles the window with the product name, the same one the page declares', () => {
    expect(/APP_WINDOW_TITLE\s*=\s*'([^']+)'/.exec(main)?.[1]).toBe('ZPLC Studio');
    expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toBe('ZPLC Studio');
    expect(main).toMatch(/title:\s*APP_WINDOW_TITLE/);
    expect(main).not.toMatch(/title:\s*`ZPLC IDE/);
  });

  it('keeps the window hidden until the renderer has painted', () => {
    expect(main).toMatch(/show:\s*false/);
    expect(main).toMatch(/once\('ready-to-show'/);
  });
});
