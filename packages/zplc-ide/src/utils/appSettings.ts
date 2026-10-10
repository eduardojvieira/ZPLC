/**
 * Application settings of the user (IDE-007, IDE-010): editor font size and tab size, density, language, autosave and
 * the update check. The theme is the one setting that has always lived in the store of the shell (`useIDEStore`), and
 * stays there. The settings are one JSON entry of the storage of the user (the renderer's local storage lives in the
 * user's profile directory, so they persist per user). Every field is validated when it is read: a missing, corrupt
 * or out-of-range value reads as its default, never as an error.
 */

export const SETTINGS_STORAGE_KEY = 'zplc-ide-settings';

export const FONT_SIZE_RANGE = { min: 10, max: 32 } as const;
export const TAB_SIZE_CHOICES = [2, 3, 4, 8] as const;
export const DENSITY_CHOICES = ['comfortable', 'compact'] as const;
export const LANGUAGE_CHOICES = ['en', 'es'] as const;
/** Seconds after the last change before a modified file is saved; 0 is off. */
export const AUTOSAVE_CHOICES = [0, 5, 15, 30, 60] as const;

export type TabSize = (typeof TAB_SIZE_CHOICES)[number];
export type Density = (typeof DENSITY_CHOICES)[number];
export type Language = (typeof LANGUAGE_CHOICES)[number];
export type AutosaveSeconds = (typeof AUTOSAVE_CHOICES)[number];

export interface AppSettings {
  editorFontSize: number;
  editorTabSize: TabSize;
  density: Density;
  language: Language;
  autosaveSeconds: AutosaveSeconds;
  checkForUpdates: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  editorFontSize: 14,
  editorTabSize: 4,
  density: 'comfortable',
  // Spanish, as the Learn lessons have always begun (the rest of the interface is English until the UX package).
  language: 'es',
  autosaveSeconds: 0,
  checkForUpdates: false,
};

/** What the settings need of a storage; the renderer's `localStorage` has it. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const oneOf = <T extends readonly unknown[]>(choices: T, value: unknown): value is T[number] => choices.includes(value);

/** A fresh, valid settings object from anything: each field is kept when valid and otherwise takes its default. */
export function parseSettings(raw: unknown, defaults: AppSettings = DEFAULT_SETTINGS): AppSettings {
  const value = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const { editorFontSize, editorTabSize, density, language, autosaveSeconds, checkForUpdates } = value;
  return {
    editorFontSize: typeof editorFontSize === 'number' && Number.isInteger(editorFontSize)
      && editorFontSize >= FONT_SIZE_RANGE.min && editorFontSize <= FONT_SIZE_RANGE.max ? editorFontSize : defaults.editorFontSize,
    editorTabSize: oneOf(TAB_SIZE_CHOICES, editorTabSize) ? editorTabSize : defaults.editorTabSize,
    density: oneOf(DENSITY_CHOICES, density) ? density : defaults.density,
    language: oneOf(LANGUAGE_CHOICES, language) ? language : defaults.language,
    autosaveSeconds: oneOf(AUTOSAVE_CHOICES, autosaveSeconds) ? autosaveSeconds : defaults.autosaveSeconds,
    checkForUpdates: typeof checkForUpdates === 'boolean' ? checkForUpdates : defaults.checkForUpdates,
  };
}

/** The saved settings; the defaults when there are none or the storage fails. */
export function loadSettings(storage: SettingsStorage | undefined): AppSettings {
  try {
    const stored = storage?.getItem(SETTINGS_STORAGE_KEY);
    return stored ? parseSettings(JSON.parse(stored)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Remembers the settings; a private window or a full quota leaves them unremembered, never an error. */
export function saveSettings(storage: SettingsStorage | undefined, settings: AppSettings): void {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not remembered this session.
  }
}
