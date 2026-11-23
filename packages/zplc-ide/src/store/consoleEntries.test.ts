import { describe, expect, it } from 'bun:test';

import type { ConsoleEntry } from '../types';
import { createAppSettingsStore } from './useAppSettings';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  outputLevelOf,
  parseSettings,
  SETTINGS_STORAGE_KEY,
  type SettingsStorage,
} from '../utils/appSettings';
import { appendConsoleEntries, entriesForLevel, MAX_CONSOLE_ENTRIES } from './consoleEntries';

function createExistingEntry(index: number): ConsoleEntry {
  return {
    id: `id-${index}`,
    type: 'info',
    message: `entry-${index}`,
    timestamp: new Date(`2026-03-16T00:00:${String(index % 60).padStart(2, '0')}Z`),
    source: 'device',
  };
}

describe('appendConsoleEntries', () => {
  it('appends multiple entries in one pass', () => {
    const result = appendConsoleEntries(
      [],
      [
        { type: 'info', message: 'a', source: 'device' },
        { type: 'info', message: 'b', source: 'runtime' },
      ],
    );

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.message)).toEqual(['a', 'b']);
  });

  it('caps console history to the newest entries', () => {
    const existing = Array.from({ length: MAX_CONSOLE_ENTRIES }, (_, index) => createExistingEntry(index));
    const result = appendConsoleEntries(existing, [{ type: 'info', message: 'new-entry', source: 'device' }]);

    expect(result).toHaveLength(MAX_CONSOLE_ENTRIES);
    expect(result[0]?.message).toBe('entry-1');
    expect(result[result.length - 1]?.message).toBe('new-entry');
  });
});

const entry = (type: ConsoleEntry['type'], message: string, step?: true): ConsoleEntry => ({
  id: message,
  type,
  message,
  timestamp: new Date(0),
  ...(step ? { step } : {}),
});

const wrote = [
  entry('info', 'Opening folder'),
  entry('command', '> zplc status'),
  entry('info', 'Build finished: 302 bytes, 1 task', true),
  entry('warning', 'Build cancelled'),
  entry('error', 'Build failed'),
  entry('success', 'Opened project'),
];

describe('the two levels of Output (MSG-005)', () => {
  it('MSG-005 the normal level shows errors, warnings, successes and steps, and hides other info', () => {
    const shown = entriesForLevel(wrote, 'normal').map((shownEntry) => shownEntry.message);
    expect(shown).toEqual(['Build finished: 302 bytes, 1 task', 'Build cancelled', 'Build failed', 'Opened project']);
    // a message that reports a failure is never hidden, marked as a step or not (open question 5)
    for (const type of ['error', 'warning', 'success'] as const) expect(entriesForLevel([entry(type, type)], 'normal')).toHaveLength(1);
    expect(entriesForLevel([entry('info', 'unmarked')], 'normal')).toEqual([]);
  });

  it('MSG-005 the detailed level shows everything 2.0 wrote', () => {
    expect(entriesForLevel(wrote, 'detailed')).toEqual(wrote);
  });

  it('MSG-005 the choice is remembered and a missing setting reads as normal', () => {
    // a 2.0 blob of settings has no outputLevel: it reads as the default and every other field keeps its value
    const old = { editorFontSize: 18, density: 'compact' };
    expect(outputLevelOf(DEFAULT_SETTINGS)).toBe('normal');
    expect(parseSettings(old)).toEqual({ ...DEFAULT_SETTINGS, editorFontSize: 18, density: 'compact' });
    expect(outputLevelOf(parseSettings({ outputLevel: 'verbose' }))).toBe('normal');
    const memory = new Map<string, string>([[SETTINGS_STORAGE_KEY, JSON.stringify(old)]]);
    const storage: SettingsStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => void memory.set(key, value) };
    expect(outputLevelOf(loadSettings(storage))).toBe('normal');
    const store = createAppSettingsStore(storage);
    store.getState().update({ outputLevel: 'detailed' });
    expect(outputLevelOf(loadSettings(storage))).toBe('detailed');
    expect(outputLevelOf(createAppSettingsStore(storage).getState().settings)).toBe('detailed');
    expect(JSON.parse(memory.get(SETTINGS_STORAGE_KEY)!).editorFontSize).toBe(18);
  });
});
