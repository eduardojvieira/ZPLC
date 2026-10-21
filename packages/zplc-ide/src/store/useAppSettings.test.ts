import { describe, expect, it } from 'bun:test';

import { SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS } from '../utils/appSettings';
import { applyDisplaySettings, createAppSettingsStore } from './useAppSettings';

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
};

describe('application settings store (IDE-010)', () => {
  it('starts from what the user saved and writes every change back, so it persists per user across a restart', () => {
    const storage = memory({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ editorFontSize: 18, density: 'compact' }) });
    const first = createAppSettingsStore(storage);
    expect(first.getState().settings).toMatchObject({ editorFontSize: 18, density: 'compact', editorTabSize: 4 });
    first.getState().update({ editorTabSize: 2, autosaveSeconds: 15 });
    const restarted = createAppSettingsStore(storage);
    expect(restarted.getState().settings).toMatchObject({ editorFontSize: 18, density: 'compact', editorTabSize: 2, autosaveSeconds: 15 });
  });

  it('refuses a value outside the choices: the previous value stays', () => {
    const store = createAppSettingsStore(memory());
    store.getState().update({ editorFontSize: 99 });
    store.getState().update({ editorTabSize: 7 as never });
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('puts density and language on the document root, where the style sheet and assistive technology read them', () => {
    const root = { dataset: {} as Record<string, string | undefined>, lang: '' };
    applyDisplaySettings({ ...DEFAULT_SETTINGS, density: 'compact', language: 'es' }, root);
    expect(root.dataset.density).toBe('compact');
    expect(root.lang).toBe('es');
  });
});
