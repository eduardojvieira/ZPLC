/**
 * The application settings of the user (IDE-010) as a small store of their own: the shell's store is large and
 * changes on every keystroke, and a component that reads a setting should not subscribe to it. The theme stays in
 * the shell's store, where it has always been.
 */
import { create } from 'zustand';
import { loadSettings, parseSettings, saveSettings, type AppSettings, type SettingsStorage } from '../utils/appSettings';
import { resolveLanguage, systemLanguage } from '../i18n/locale';

export interface AppSettingsState {
  settings: AppSettings;
  /** Applies the valid fields of `changes` and remembers the result; a value outside its choices is ignored. */
  update: (changes: Partial<AppSettings>) => void;
}

export function createAppSettingsStore(storage: SettingsStorage | undefined) {
  return create<AppSettingsState>()((set) => ({
    settings: loadSettings(storage),
    update: (changes) =>
      set((state) => {
        const settings = parseSettings({ ...state.settings, ...changes }, state.settings);
        saveSettings(storage, settings);
        return { settings };
      }),
  }));
}

function browserStorage(): SettingsStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export const useAppSettings = createAppSettingsStore(browserStorage());

/** What the settings change outside React: the density (a CSS hook, UX-008) and the language of the document. */
export function applyDisplaySettings(settings: AppSettings, root: { dataset: Record<string, string | undefined>; lang: string }): void {
  root.dataset.density = settings.density;
  root.lang = resolveLanguage(settings.language, systemLanguage());
}

/** Applies the saved display settings before the first paint and keeps them applied. Call once, at start-up. */
export function initializeSettings(): void {
  if (typeof document === 'undefined') return;
  const apply = (settings: AppSettings) => applyDisplaySettings(settings, document.documentElement);
  apply(useAppSettings.getState().settings);
  useAppSettings.subscribe((state, previous) => {
    if (state.settings.density !== previous.settings.density || state.settings.language !== previous.settings.language)
      apply(state.settings);
  });
}
