import { describe, expect, it } from 'bun:test';
import type { languages } from 'monaco-editor';
import { language as monacoStLanguage } from 'monaco-editor/esm/vs/basic-languages/st/st.js';
import { contrastRatio, parseColor } from '../theme/color';
import { resolveTokens } from '../theme/tokens';
import { ilLanguage, stLanguage } from './monaco-languages';
import { ZPLC_DARK_THEME, ZPLC_HIGH_CONTRAST_THEME, ZPLC_LIGHT_THEME } from './monaco-themes';

/** Every token class a Monarch grammar can emit: the strings of its actions and cases, and the tokens of its brackets. */
function tokenClasses(grammar: languages.IMonarchLanguage): string[] {
  const found = new Set<string>();
  const visit = (action: unknown): void => {
    if (typeof action === 'string') {
      // '@brackets', '@rematch' and '$S0' are directives, and whitespace draws nothing.
      if (action !== '' && !/^[@$]/.test(action) && action !== 'white') found.add(action);
    } else if (Array.isArray(action)) action.forEach(visit);
    else if (action !== null && typeof action === 'object') {
      const { token, cases } = action as { token?: unknown; cases?: Record<string, unknown> };
      visit(token);
      if (cases) Object.values(cases).forEach(visit);
    }
  };
  for (const rules of Object.values(grammar.tokenizer))
    for (const rule of rules) visit(Array.isArray(rule) ? rule[1] : 'action' in rule ? rule.action : undefined);
  for (const bracket of grammar.brackets ?? []) visit((bracket as { token?: string }).token);
  return [...found].sort();
}

/** Monaco gives a token the rule whose name is the token class or a dot-separated prefix of it. */
const ruleFor = (theme: { rules: { token: string }[] }, cls: string) =>
  theme.rules.find((rule) => rule.token !== '' && (cls === rule.token || cls.startsWith(`${rule.token}.`)));

const themes = [
  { id: 'light', theme: ZPLC_LIGHT_THEME, base: 'vs' },
  { id: 'dark', theme: ZPLC_DARK_THEME, base: 'vs-dark' },
  { id: 'high-contrast', theme: ZPLC_HIGH_CONTRAST_THEME, base: 'hc-black' },
] as const;

describe('Monaco themes are generated from the semantic roles (UX-003)', () => {
  for (const { id, theme, base } of themes) {
    it(`takes the editor background and text of the ${id} theme from the tokens`, () => {
      const tokens = resolveTokens(id);
      expect(theme.base).toBe(base);
      expect(parseColor(theme.colors['editor.background']!)).toEqual(parseColor(tokens['--editor-bg']));
      expect(parseColor(theme.colors['editor.foreground']!)).toEqual(parseColor(tokens['--editor-fg']));
    });

    it(`draws every syntax rule of the ${id} theme at 4.5:1 or more on the editor background`, () => {
      const background = theme.colors['editor.background']!;
      for (const rule of theme.rules) {
        const ratio = contrastRatio(`#${rule.foreground}`, background);
        expect({ token: rule.token, ok: ratio >= 4.5 }).toEqual({ token: rule.token, ok: true });
      }
    });
  }

  // Without a rule of its own a token takes the colour of Monaco's built-in base theme: the maroon `tag` of the light base
  // put time literals and direct addresses at about 2:1 on the dark editor.
  for (const [name, grammar] of [
    ['Structured Text (the grammar Monaco ships, which the editor uses)', monacoStLanguage],
    ['Structured Text (the ZPLC grammar)', stLanguage],
    ['Instruction List', ilLanguage],
  ] as const) {
    it(`gives every token class of the ${name} grammar a ZPLC rule in each theme`, () => {
      for (const { id, theme } of themes) {
        const missing = tokenClasses(grammar).filter((cls) => ruleFor(theme, cls) === undefined);
        expect({ theme: id, missing }).toEqual({ theme: id, missing: [] });
      }
    });
  }

  it('keeps the selection translucent, as #rrggbbaa', () => {
    expect(ZPLC_DARK_THEME.colors['editor.selectionBackground']).toMatch(/^#[0-9a-f]{8}$/);
  });

  it('colours keywords, types and addresses differently, so structure is not carried by one hue', () => {
    for (const { theme } of themes) {
      const by = Object.fromEntries(theme.rules.map((rule) => [rule.token, rule.foreground]));
      expect(new Set([by.keyword, by.type, by['variable.predefined'], by.string, by.number]).size).toBeGreaterThanOrEqual(3);
    }
  });
});
