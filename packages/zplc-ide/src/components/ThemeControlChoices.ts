import type { MessageKey } from '../i18n';

/** The themes the single theme control offers (UX-016, UX-022). `system` is the default, not a choice: the control shows what it resolves to. */
export type ThemeChoiceId = 'light' | 'dark' | 'high-contrast';

export const THEME_CHOICES: ReadonlyArray<{ id: ThemeChoiceId; label: MessageKey }> = [
  { id: 'light', label: 'theme.light' },
  { id: 'dark', label: 'theme.dark' },
  { id: 'high-contrast', label: 'theme.highContrast' },
];

/** Applies the option a `<select>` reports; a value that is not an option changes nothing. */
export function chooseTheme(value: string, setTheme: (theme: ThemeChoiceId) => void): boolean {
  const choice = THEME_CHOICES.find((candidate) => candidate.id === value);
  if (!choice) return false;
  setTheme(choice.id);
  return true;
}
