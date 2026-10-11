import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { contrastRatio, parseColor, composite } from './color';
import { SIGNAL_CHIP_CLASS, SIGNAL_CUES, SIGNAL_TEXT_CLASS, SIGNAL_TONES, signalTone } from './signalTone';
import { THEME_IDS, TOKEN_NAMES, resolveTokens } from './tokens';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const watchPanel = readFileSync(new URL('../components/DebugWatchPanel.tsx', import.meta.url), 'utf8');

/** UX-009: FALSE is neutral, green is confirmed TRUE, amber is forced or a warning, red is fault only, and every state has a cue other than colour. */
describe('signal tone of a watched value (UX-009)', () => {
  it('keeps FALSE neutral, shows TRUE as confirmed and forced as attention', () => {
    expect(signalTone({ forced: false, type: 'BOOL', value: false })).toBe('false');
    expect(signalTone({ forced: false, type: 'BOOL', value: true })).toBe('true');
    expect(signalTone({ forced: true, type: 'BOOL', value: false })).toBe('forced');
    expect(signalTone({ forced: true, type: 'INT', value: 7 })).toBe('forced');
  });

  it('treats a value that has not been read as unknown, neutral and never as FALSE or a fault', () => {
    expect(signalTone({ forced: false, type: 'BOOL', value: null })).toBe('unknown');
    expect(signalTone({ forced: false, type: undefined, value: undefined })).toBe('unknown');
  });

  it('shows a fault only for a fault, and a fault outranks a force', () => {
    expect(signalTone({ forced: false, fault: true, type: 'BOOL', value: false })).toBe('fault');
    expect(signalTone({ forced: true, fault: true, type: 'BOOL', value: true })).toBe('fault');
  });

  it('leaves numbers and strings in the plain value tone', () => {
    expect(signalTone({ forced: false, type: 'INT', value: 0 })).toBe('value');
    expect(signalTone({ forced: false, type: 'STRING', value: '' })).toBe('value');
  });

  it('defines every state from the signal tokens of the token source, never from the stock palette', () => {
    for (const tone of SIGNAL_TONES) {
      for (const className of [SIGNAL_TEXT_CLASS[tone], SIGNAL_CHIP_CLASS[tone]]) {
        expect(className).not.toMatch(/\b(?:text|bg|border)-(?:red|rose|green|amber|blue|yellow|orange)-\d/);
        for (const [, name] of className.matchAll(/var\((--[\w-]+)\)/g)) expect(TOKEN_NAMES.has(name)).toBe(true);
      }
    }
    expect(SIGNAL_TEXT_CLASS.true).toContain('--signal-true-fg');
    expect(SIGNAL_TEXT_CLASS.forced).toContain('--signal-forced-fg');
    expect(SIGNAL_TEXT_CLASS.false).not.toMatch(/accent/);
  });

  it('gives every state a label and a glyph of its own, so colour never carries a state alone', () => {
    const cues = SIGNAL_TONES.map((tone) => SIGNAL_CUES[tone]);
    expect(new Set(cues.map((cue) => cue.label)).size).toBe(SIGNAL_TONES.length);
    expect(new Set(cues.map((cue) => cue.glyph)).size).toBe(SIGNAL_TONES.length);
    expect(SIGNAL_CHIP_CLASS.unknown).toContain('border-dashed');
  });

  for (const theme of THEME_IDS) {
    it(`draws FALSE and unknown in a neutral grey and TRUE in green in the ${theme} theme`, () => {
      const tokens = resolveTokens(theme);
      for (const state of ['false', 'unknown']) {
        const { r, g, b } = parseColor(tokens[`--signal-${state}-border`]);
        expect({ state, spread: Math.max(r, g, b) - Math.min(r, g, b) <= 40 }).toEqual({ state, spread: true });
      }
      const green = parseColor(tokens['--signal-true-border']);
      expect(green.g).toBeGreaterThan(Math.max(green.r, green.b));
      const red = parseColor(tokens['--signal-fault-border']);
      expect(red.r).toBeGreaterThan(Math.max(red.g, red.b));
    });

    it(`keeps every state readable on a panel in the ${theme} theme`, () => {
      const tokens = resolveTokens(theme);
      const panel = parseColor(tokens['--color-surface-800']);
      for (const tone of SIGNAL_TONES) {
        const fill = composite(parseColor(tokens[`--signal-${tone}-bg`]), panel);
        expect({ tone, ok: contrastRatio(tokens[`--signal-${tone}-fg`], fill) >= 4.5 }).toEqual({ tone, ok: true });
      }
    });
  }

  it('is what the Watch panel uses for its values', () => {
    expect(watchPanel).toContain('SIGNAL_TEXT_CLASS[signalTone(result)]');
    expect(watchPanel).not.toMatch(/result\.value \? 'text-green-400' : 'text-red-400'/);
  });

  it('marks a forced Watch value with text as well as colour, and colours the inline chips from the same tokens', () => {
    expect(css).toMatch(/\[data-forced="true"\]::after\s*\{[^}]*content:\s*" \(forced\)"/);
    expect(css).toMatch(/\.inline-debug-value-true\s*\{[^}]*--signal-true-fg/);
    expect(css).toMatch(/\.inline-debug-value-false\s*\{[^}]*--signal-false-fg/);
    expect(css).not.toContain('--debug-chip');
  });
});
