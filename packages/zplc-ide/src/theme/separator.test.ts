import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { contrastRatio } from './color';
import { THEME_IDS, resolveTokens } from './tokens';

const raw = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const rule = (selector: string) =>
  rules
    .filter((item) => item.selector === selector)
    .map((item) => item.body)
    .join('\n');

/** UX-017: react-resizable-panels 4.x marks a separator with data-separator = inactive | hover | active | focus | disabled. */
describe('panel separator styles', () => {
  it('no longer target attributes the installed library does not emit', () => {
    expect(css).not.toContain('data-panel-resize-handle-id');
    expect(css).not.toContain('data-panel-group-direction');
    expect(css).not.toContain('data-resize-handle-active');
  });

  it('give the separator a 4px grab area in both orientations', () => {
    expect(rule('[data-separator][aria-orientation="horizontal"]')).toMatch(/height:\s*4px/);
    expect(rule('[data-separator][aria-orientation="vertical"]')).toMatch(/width:\s*4px/);
  });

  it('UX-017 show hover, active and focus as three different looks, from tokens only', () => {
    const fill = (state: string): string | undefined =>
      /background-color:\s*(var\(--[a-z0-9-]+\))/.exec(rule(`[data-separator="${state}"]`))?.[1];
    expect(fill('hover')).toBe('var(--color-surface-500)');
    expect(fill('active')).toBe('var(--color-accent-blue)');
    expect(fill('focus')).toBe('var(--color-surface-500)');
    // under the pointer the rule stays and gets stronger; while dragged and on focus the bar is a plain fill
    expect(rule('[data-separator="hover"]')).toMatch(/linear-gradient\(var\(--color-surface-300\)/);
    expect(rule('[data-separator="active"]')).toMatch(/background-image:\s*none/);
    expect(fill('active')).not.toBe(fill('hover'));
    expect(css).not.toMatch(/\[data-separator[^{]*\{[^}]*#[0-9a-fA-F]{3,8}/);
  });

  it('keep a rule at rest that is visible against the panels in every theme', () => {
    expect(rule('[data-separator]')).toMatch(/var\(--separator-rule\)/);
    for (const theme of THEME_IDS) {
      const tokens = resolveTokens(theme);
      for (const surface of ['--color-surface-900', '--color-surface-800']) {
        expect({ theme, surface, visible: contrastRatio(tokens['--separator-rule'], tokens[surface]) >= 3 }).toEqual({
          theme,
          surface,
          visible: true,
        });
      }
    }
  });
});
