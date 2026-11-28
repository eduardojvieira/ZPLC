import { describe, expect, it } from 'bun:test';

import { SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS } from '../utils/appSettings';
import { applyDisplaySettings, createAppSettingsStore, initializeSettings, mirrorLearnPolicy, useAppSettings } from './useAppSettings';

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

  it('mirrors the classroom setting to the main process at start and on each change of it, and on nothing else (AIX-002)', () => {
    const store = createAppSettingsStore(memory({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ hideSolutions: true }) }));
    const reports: unknown[] = [];
    const stop = mirrorLearnPolicy(store, (policy) => reports.push(policy));
    store.getState().update({ editorFontSize: 16 });
    store.getState().update({ hideSolutions: false });
    store.getState().update({ hideSolutions: false });
    stop();
    store.getState().update({ hideSolutions: true });
    expect(reports).toEqual([{ hideSolutions: true }, { hideSolutions: false }]);
  });

  it('keeps applying display settings only while a document exists: a change after the document is gone throws nothing', () => {
    const scope = globalThis as { document?: unknown };
    const saved = scope.document;
    scope.document = { documentElement: { dataset: {}, lang: '' } };
    try {
      initializeSettings();
      delete scope.document;
      const { density } = useAppSettings.getState().settings;
      expect(() => useAppSettings.getState().update({ density: density === 'compact' ? 'comfortable' : 'compact' })).not.toThrow();
    } finally {
      if (saved === undefined) delete scope.document;
      else scope.document = saved;
    }
  });
});
