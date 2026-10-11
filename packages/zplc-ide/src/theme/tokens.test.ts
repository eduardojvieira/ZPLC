import { describe, expect, it } from 'bun:test';
import { THEME_IDS, TOKENS, resolveTokens } from './tokens';
import { renderTokensCss } from './tokensCss';

describe('design tokens (UX-003)', () => {
  it('declares every token once and documents each in a sentence', () => {
    const names = TOKENS.map((def) => def.name);
    expect(new Set(names).size).toBe(names.length);
    for (const def of TOKENS) {
      expect({ name: def.name, documented: def.doc.length >= 12 && /[.]$/.test(def.doc) }).toEqual({ name: def.name, documented: true });
    }
  });

  it('keeps the three tiers apart: roles name ramps, components and scales name roles', () => {
    const ramps = TOKENS.filter((def) => def.tier === 'ramp');
    expect(ramps.length).toBeGreaterThan(30);
    for (const def of TOKENS) {
      const values = [def.light, def.dark, def['high-contrast']];
      const namesRamp = values.some((value) => value.includes('--ramp-'));
      if (def.tier === 'role') continue;
      expect({ name: def.name, tier: def.tier, namesRamp }).toEqual({ name: def.name, tier: def.tier, namesRamp: false });
    }
    for (const def of TOKENS.filter((item) => item.tier === 'ramp')) expect(def.light).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('resolves every token in every theme and density, with no reference to an undefined token', () => {
    for (const theme of THEME_IDS) {
      for (const density of ['comfortable', 'compact'] as const) {
        const tokens = resolveTokens(theme, density);
        expect(Object.keys(tokens).length).toBe(TOKENS.length);
        for (const [name, value] of Object.entries(tokens)) expect({ name, theme, unresolved: value.includes('var(') }).toEqual({ name, theme, unresolved: false });
      }
    }
  });

  it('renders every token into the stylesheet, and only the tokens that differ into a theme override', () => {
    const css = renderTokensCss();
    for (const def of TOKENS) expect(css).toContain(`${def.name}:`);
    const dark = /:root\.dark \{([^}]*)\}/.exec(css)![1];
    expect(dark).toContain('--color-surface-900:');
    expect(dark).not.toMatch(/--ramp-[\w-]+:/);
    expect(dark).not.toContain('--button-bg:');
  });

  it('takes the colour of a component from a role, so a theme change reaches it without a rule of its own', () => {
    const light = resolveTokens('light');
    const dark = resolveTokens('dark');
    expect(light['--button-bg']).not.toBe(dark['--button-bg']);
    expect(light['--input-border']).not.toBe(dark['--input-border']);
    expect(resolveTokens('high-contrast')['--tooltip-bg']).toBe('#ffffff');
  });
});

describe('type, shape and density tokens (UX-006, UX-007, UX-008 stopgap)', () => {
  const light = resolveTokens('light');
  const px = (name: string): number => Number.parseFloat(light[name]);

  it('puts the floor of the type scale at 11 pixels and keeps the scale ascending', () => {
    const scale = ['--font-size-caption', '--font-size-label', '--font-size-body', '--font-size-title', '--font-size-heading'].map(px);
    expect(Math.min(...scale)).toBe(11);
    expect([...scale].sort((a, b) => a - b)).toEqual(scale);
  });

  it('names a bundled sans and a bundled mono face before the system faces', () => {
    expect(light['--font-sans']).toMatch(/^'Inter'/);
    expect(light['--font-mono']).toMatch(/^'JetBrains Mono'/);
    expect(light['--font-sans']).not.toMatch(/Bahnschrift|Aptos|Segoe UI Variable/);
  });

  it('makes radius, elevation and icon size tokens, flat at rest, with a shadow only for transient overlays', () => {
    expect(light['--elevation-flat']).toBe('none');
    expect(light['--elevation-overlay']).not.toBe('none');
    for (const name of ['--radius-control', '--radius-surface', '--radius-overlay', '--icon-size-sm', '--icon-size-md', '--icon-size-lg']) expect(light[name]).toMatch(/^\d+px$/);
    expect(resolveTokens('high-contrast')['--elevation-overlay']).toBe('none');
  });

  it('makes the compact density smaller in spacing, controls and rows', () => {
    const compact = resolveTokens('light', 'compact');
    for (const name of ['--control-height', '--control-height-sm', '--row-height', '--control-padding-x', '--gap-control']) {
      expect({ name, smaller: Number.parseFloat(compact[name]) < Number.parseFloat(light[name]) }).toEqual({ name, smaller: true });
    }
    expect(Number.parseFloat(compact['--spacing'])).toBeLessThan(Number.parseFloat(light['--spacing']));
    expect(renderTokensCss()).toMatch(/html\[data-density="compact"\] \{[^}]*--row-height:/);
  });
});
