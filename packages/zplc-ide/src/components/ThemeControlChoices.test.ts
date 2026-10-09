import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { THEME_CHOICES, chooseTheme } from './ThemeControlChoices';

describe('theme control choices', () => {
  it('offers Light, Dark and High contrast, once each and in that order', () => {
    expect(THEME_CHOICES.map((choice) => choice.label)).toEqual(['Light', 'Dark', 'High contrast']);
    expect(THEME_CHOICES.map((choice) => choice.id)).toEqual(['light', 'dark', 'high-contrast']);
  });

  it('sets the theme that each option stands for', () => {
    for (const choice of THEME_CHOICES) {
      const set: string[] = [];
      expect(chooseTheme(choice.id, (theme) => set.push(theme))).toBe(true);
      expect(set).toEqual([choice.id]);
    }
  });

  it('ignores a value that is not one of the options', () => {
    const set: string[] = [];
    for (const value of ['', 'system', 'Dark', 'solarized', '__proto__']) expect(chooseTheme(value, (theme) => set.push(theme))).toBe(false);
    expect(set).toEqual([]);
  });
});

describe('theme control component', () => {
  const source = readFileSync(join(import.meta.dir, 'ThemeControl.tsx'), 'utf8');

  it('is one labelled native select that uses the shared theme hook', () => {
    expect(source).toContain('useTheme');
    expect(source).toContain('<select');
    expect(source).toContain('Theme');
    expect(source).toContain('THEME_CHOICES.map');
    expect(source).toContain('chooseTheme(event.target.value, setTheme)');
    // 'system' is not an option, so the select shows the theme the system resolves to.
    expect(source).toContain('value={effectiveTheme}');
    expect(source).toContain('focus-visible:outline-2');
    expect(source).not.toContain('Contrast');
    expect(source).not.toContain('<button');
  });
});
