import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseColor, resolveThemeTokens, type ThemeName } from './themeTokens';
import { SIGNAL_TEXT_CLASS, signalTone } from './signalTone';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const watchPanel = readFileSync(new URL('../components/DebugWatchPanel.tsx', import.meta.url), 'utf8');

/** UX-009 stopgap: FALSE is neutral, green is confirmed TRUE, amber is forced, red is fault only. */
describe('signal tone of a watched value', () => {
  it('keeps FALSE neutral, shows TRUE as confirmed and forced as attention', () => {
    expect(signalTone({ forced: false, type: 'BOOL', value: false })).toBe('false');
    expect(signalTone({ forced: false, type: 'BOOL', value: true })).toBe('true');
    expect(signalTone({ forced: true, type: 'BOOL', value: false })).toBe('forced');
    expect(signalTone({ forced: true, type: 'INT', value: 7 })).toBe('forced');
  });

  it('treats a value that has not been read as neutral, never as a fault', () => {
    expect(signalTone({ forced: false, type: 'BOOL', value: null })).toBe('false');
    expect(signalTone({ forced: false, type: undefined, value: undefined })).toBe('value');
  });

  it('leaves numbers and strings in the plain value tone', () => {
    expect(signalTone({ forced: false, type: 'INT', value: 0 })).toBe('value');
    expect(signalTone({ forced: false, type: 'STRING', value: '' })).toBe('value');
  });

  it('never colours a value red and uses only theme tokens, not the stock palette', () => {
    for (const className of Object.values(SIGNAL_TEXT_CLASS)) {
      expect(className).not.toMatch(/red|rose/);
      expect(className).toMatch(/^text-\[var\(--[\w-]+\)\]$/);
    }
    expect(SIGNAL_TEXT_CLASS.true).toContain('accent-green');
    expect(SIGNAL_TEXT_CLASS.forced).toContain('accent-yellow');
    expect(SIGNAL_TEXT_CLASS.false).not.toMatch(/accent/);
  });

  it('is what the Watch panel uses for its values', () => {
    expect(watchPanel).toContain('SIGNAL_TEXT_CLASS[signalTone(result)]');
    expect(watchPanel).not.toMatch(/result\.value \? 'text-green-400' : 'text-red-400'/);
  });
});

describe('Structured Text value chips', () => {
  const themes: ThemeName[] = ['light', 'dark', 'system-dark'];
  for (const theme of themes) {
    it(`draw FALSE in a neutral gray in the ${theme} theme`, () => {
      const tokens = resolveThemeTokens(css, theme);
      for (const name of ['bg', 'border', 'text']) {
        const { r, g, b } = parseColor(tokens[`--debug-chip-false-${name}`]);
        expect({ name, spread: Math.max(r, g, b) - Math.min(r, g, b) <= 40 }).toEqual({ name, spread: true });
      }
    });
  }

  it('still draw TRUE in green', () => {
    const { r, g, b } = parseColor(resolveThemeTokens(css, 'light')['--debug-chip-true-border']);
    expect(g).toBeGreaterThan(Math.max(r, b));
  });

  it('mark a forced Watch value with text as well as colour', () => {
    expect(css).toMatch(/\[data-forced="true"\]::after\s*\{[^}]*content:\s*" \(forced\)"/);
  });
});
