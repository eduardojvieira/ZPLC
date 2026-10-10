import { describe, expect, it } from 'bun:test';

import {
  AUTOSAVE_CHOICES,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  parseSettings,
  saveSettings,
  type SettingsStorage,
} from './appSettings';

const memory = (initial: Record<string, string> = {}): SettingsStorage & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
};

describe('application settings (IDE-007, IDE-010)', () => {
  it('start with autosave off, the update check off, Spanish lessons as before and a 14 px editor with 4-space tabs', () => {
    expect(DEFAULT_SETTINGS).toEqual({ editorFontSize: 14, editorTabSize: 4, density: 'comfortable', language: 'es', autosaveSeconds: 0, checkForUpdates: false });
    expect(AUTOSAVE_CHOICES[0]).toBe(0);
  });

  it('keep what is valid, field by field, and fall back to the default for anything else', () => {
    expect(parseSettings({ editorFontSize: 18, editorTabSize: 2, density: 'compact', language: 'es', autosaveSeconds: 30, checkForUpdates: true }))
      .toEqual({ editorFontSize: 18, editorTabSize: 2, density: 'compact', language: 'es', autosaveSeconds: 30, checkForUpdates: true });
    expect(parseSettings({ editorFontSize: 400, editorTabSize: 5, density: 'huge', language: 'fr', autosaveSeconds: 7, checkForUpdates: 'yes' })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ editorFontSize: 16.5, density: 'compact' })).toEqual({ ...DEFAULT_SETTINGS, density: 'compact' });
    for (const bad of [null, undefined, 'x', 7, []]) expect(parseSettings(bad)).toEqual(DEFAULT_SETTINGS);
  });

  it('are read from and written to one JSON entry of the storage of the user', () => {
    const storage = memory();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    const changed = { ...DEFAULT_SETTINGS, editorFontSize: 20, autosaveSeconds: 15 as const };
    saveSettings(storage, changed);
    expect(JSON.parse(storage.data[SETTINGS_STORAGE_KEY]!)).toEqual(changed);
    expect(loadSettings(storage)).toEqual(changed);
  });

  it('read as the defaults when the stored text is corrupt, and a storage that throws is not an error', () => {
    expect(loadSettings(memory({ [SETTINGS_STORAGE_KEY]: '{ not json' }))).toEqual(DEFAULT_SETTINGS);
    const broken: SettingsStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow();
  });

});
