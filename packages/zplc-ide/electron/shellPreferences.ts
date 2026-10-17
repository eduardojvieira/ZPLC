/**
 * The two preferences that the main process needs before the page exists (UX-014, UX-016): the interface language, for
 * the language of the application menu, and the theme, for the colour of the window before the page has painted. They live
 * in the page's own settings; the page reports them over one typed channel whenever they change, and this module keeps
 * the last report in one small private file under the user-data directory. Reading is tolerant (a missing, corrupt,
 * oversized or foreign file is the default) and writing is atomic (temporary file, then rename).
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const SHELL_LANGUAGES = ['en', 'es'] as const;
export const SHELL_THEMES = ['light', 'dark', 'high-contrast', 'system'] as const;
export type ShellLanguage = (typeof SHELL_LANGUAGES)[number];
export type ShellTheme = (typeof SHELL_THEMES)[number];
export interface ShellPreferences { language: ShellLanguage; theme: ShellTheme }

export const SHELL_PREFERENCES_FILENAME = 'zplc-shell-preferences.v1.json';
const MAX_BYTES = 1024;

export const DEFAULT_SHELL_PREFERENCES: ShellPreferences = { language: 'en', theme: 'system' };

/** --color-surface-900 of each theme in src/theme/tokens.ts (src/theme/windowSurface.test.ts keeps them equal). */
export const WINDOW_SURFACE = { light: '#e7ece8', dark: '#0f171b', 'high-contrast': '#000000' } as const;

/** The window colour for a theme; `system` follows the operating system's dark mode. */
export function windowSurface(theme: ShellTheme, systemIsDark: boolean): string {
  return theme === 'system' ? (systemIsDark ? WINDOW_SURFACE.dark : WINDOW_SURFACE.light) : WINDOW_SURFACE[theme];
}

/** The preferences of a value, or null for anything that is not exactly a language and a theme of the lists. */
export function parseShellPreferences(value: unknown): ShellPreferences | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes('language') || !keys.includes('theme')) return null;
  const { language, theme } = record;
  if (!SHELL_LANGUAGES.includes(language as ShellLanguage) || !SHELL_THEMES.includes(theme as ShellTheme)) return null;
  return { language: language as ShellLanguage, theme: theme as ShellTheme };
}

/** The preferences in a file's text; the default for anything else. */
export function readShellPreferences(raw: string): ShellPreferences {
  if (raw.length > MAX_BYTES) return DEFAULT_SHELL_PREFERENCES;
  try { return parseShellPreferences(JSON.parse(raw)) ?? DEFAULT_SHELL_PREFERENCES; } catch { return DEFAULT_SHELL_PREFERENCES; }
}

export function createShellPreferencesStore(userDataPath: string) {
  const file = path.join(userDataPath, SHELL_PREFERENCES_FILENAME);
  let current: ShellPreferences = DEFAULT_SHELL_PREFERENCES;
  let writing: Promise<void> = Promise.resolve();
  return {
    async load(): Promise<ShellPreferences> {
      try { current = readShellPreferences(await readFile(file, 'utf8')); } catch { current = DEFAULT_SHELL_PREFERENCES; }
      return current;
    },
    get(): ShellPreferences { return current; },
    /** Remembers a report; true when it differs from what was held. A write that fails leaves the old file in place. */
    save(next: ShellPreferences): boolean {
      if (next.language === current.language && next.theme === current.theme) return false;
      current = next;
      writing = writing.then(async () => {
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
          await rename(temporary, file);
        } catch { await unlink(temporary).catch(() => undefined); }
      });
      return true;
    },
    settled(): Promise<void> { return writing; },
  };
}
