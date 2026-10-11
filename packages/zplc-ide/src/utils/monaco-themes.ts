import type { editor } from 'monaco-editor';
import { parseColor, toHex } from '../theme/color';
import { resolveTokens, type ThemeId, type TokenMap } from '../theme/tokens';

/**
 * The Monaco themes of Studio (UX-003): generated from the semantic roles of the token source, so the code editor wears the
 * same colours as the rest of the interface in the light, dark and high-contrast themes and cannot drift from them. A role
 * with transparency (the selection) becomes the `#rrggbbaa` form Monaco accepts.
 */
const hex = (value: string): string => {
  const colour = parseColor(value);
  return colour.a < 1 ? `${toHex(colour)}${Math.round(colour.a * 255).toString(16).padStart(2, '0')}` : toHex(colour);
};

/** A token rule's foreground is the colour without the leading `#`. */
const rule = (tokens: TokenMap, token: string, role: string, fontStyle?: string): editor.ITokenThemeRule => ({
  token,
  foreground: hex(tokens[role]).slice(1, 7),
  ...(fontStyle !== undefined && { fontStyle }),
});

function themeFor(id: ThemeId, base: editor.BuiltinTheme): editor.IStandaloneThemeData {
  const tokens = resolveTokens(id);
  const color = (role: string): string => hex(tokens[role]);
  return {
    base,
    inherit: true,
    rules: [
      rule(tokens, 'comment', '--syntax-comment', 'italic'),
      // Keywords: control structures.
      rule(tokens, 'keyword', '--syntax-keyword', 'bold'),
      rule(tokens, 'type', '--syntax-type'),
      rule(tokens, 'operator', '--syntax-operator'),
      rule(tokens, 'identifier', '--editor-fg'),
      // Direct addresses (%I, %Q, %M) and predefined variables.
      rule(tokens, 'variable.predefined', '--syntax-address', 'bold'),
      rule(tokens, 'number', '--syntax-number'),
      rule(tokens, 'string', '--syntax-string'),
      rule(tokens, 'delimiter', '--syntax-operator'),
      rule(tokens, 'bracket', '--syntax-bracket'),
      // IL labels.
      rule(tokens, 'type.identifier', '--syntax-label', 'bold'),
    ],
    colors: {
      'editor.background': color('--editor-bg'),
      'editor.foreground': color('--editor-fg'),
      'editor.selectionBackground': color('--editor-selection-bg'),
      'editor.inactiveSelectionBackground': color('--editor-inactive-selection-bg'),
      'editorLineNumber.foreground': color('--editor-line-number'),
      'editorLineNumber.activeForeground': color('--editor-line-number-active'),
      'editorCursor.foreground': color('--editor-cursor'),
      // The gutter is the editor's own background, so breakpoints sit on it.
      'editorGutter.background': color('--editor-bg'),
      'editor.lineHighlightBackground': color('--editor-line-highlight'),
      'editor.lineHighlightBorder': '#00000000',
    },
  };
}

export const ZPLC_DARK_THEME: editor.IStandaloneThemeData = themeFor('dark', 'vs-dark');
export const ZPLC_LIGHT_THEME: editor.IStandaloneThemeData = themeFor('light', 'vs');
/** High contrast keeps Monaco's own high-contrast base (borders and focus rendering) and takes its colours from the roles. */
export const ZPLC_HIGH_CONTRAST_THEME: editor.IStandaloneThemeData = themeFor('high-contrast', 'hc-black');

// Theme IDs
export const ZPLC_DARK_THEME_ID = 'zplc-dark';
export const ZPLC_LIGHT_THEME_ID = 'zplc-light';
export const ZPLC_HIGH_CONTRAST_THEME_ID = 'zplc-high-contrast';
