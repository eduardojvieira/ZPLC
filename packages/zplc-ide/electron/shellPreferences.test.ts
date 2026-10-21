import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_SHELL_PREFERENCES,
  SHELL_PREFERENCES_FILENAME,
  WINDOW_SURFACE,
  createShellPreferencesStore,
  parseShellPreferences,
  readShellPreferences,
  windowSurface,
} from './shellPreferences';

const directories: string[] = [];
const scratch = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zplc-shell-'));
  directories.push(directory);
  return directory;
};
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('window colour from the stored theme (UX-016)', () => {
  it('UX-016 takes the canvas of the chosen theme, whatever the system mode', () => {
    expect(windowSurface('light', true)).toBe(WINDOW_SURFACE.light);
    expect(windowSurface('dark', false)).toBe(WINDOW_SURFACE.dark);
    expect(windowSurface('high-contrast', false)).toBe(WINDOW_SURFACE['high-contrast']);
  });

  it('UX-016 follows the system mode only for the system theme', () => {
    expect(windowSurface('system', true)).toBe(WINDOW_SURFACE.dark);
    expect(windowSurface('system', false)).toBe(WINDOW_SURFACE.light);
  });
});

describe('what the window reports (UX-014, UX-016)', () => {
  it('UX-014 accepts exactly a language and a theme of the lists', () => {
    expect(parseShellPreferences({ language: 'es', theme: 'dark' })).toEqual({ language: 'es', theme: 'dark' });
    for (const bad of [
      null,
      'es',
      [],
      {},
      { language: 'fr', theme: 'dark' },
      { language: 'es', theme: 'blue' },
      { language: 'es', theme: 'dark', extra: 1 },
      { language: 'es' },
    ]) {
      expect(parseShellPreferences(bad)).toBeNull();
    }
  });

  it('UX-014 reads a damaged, oversized or foreign file as the default', () => {
    expect(readShellPreferences('{"language":"es","theme":"light"}')).toEqual({ language: 'es', theme: 'light' });
    expect(readShellPreferences('not json')).toEqual(DEFAULT_SHELL_PREFERENCES);
    expect(readShellPreferences('{"language":"xx","theme":"light"}')).toEqual(DEFAULT_SHELL_PREFERENCES);
    expect(readShellPreferences(JSON.stringify({ language: 'es', theme: 'light', pad: 'x'.repeat(2000) }))).toEqual(
      DEFAULT_SHELL_PREFERENCES,
    );
  });
});

describe('the stored preferences (UX-014, UX-016)', () => {
  it('UX-016 starts as the default when nothing was stored', async () => {
    const store = createShellPreferencesStore(await scratch());
    expect(await store.load()).toEqual(DEFAULT_SHELL_PREFERENCES);
  });

  it('UX-016 keeps a report for the next start, and says whether it changed anything', async () => {
    const directory = await scratch();
    const store = createShellPreferencesStore(directory);
    await store.load();
    expect(store.save({ language: 'es', theme: 'high-contrast' })).toBe(true);
    expect(store.save({ language: 'es', theme: 'high-contrast' })).toBe(false);
    await store.settled();
    expect(JSON.parse(await readFile(path.join(directory, SHELL_PREFERENCES_FILENAME), 'utf8'))).toEqual({
      language: 'es',
      theme: 'high-contrast',
    });
    const next = createShellPreferencesStore(directory);
    expect(await next.load()).toEqual({ language: 'es', theme: 'high-contrast' });
  });

  it('UX-016 replaces a corrupt file at the next report', async () => {
    const directory = await scratch();
    await writeFile(path.join(directory, SHELL_PREFERENCES_FILENAME), '{broken');
    const store = createShellPreferencesStore(directory);
    expect(await store.load()).toEqual(DEFAULT_SHELL_PREFERENCES);
    store.save({ language: 'en', theme: 'dark' });
    await store.settled();
    expect(await createShellPreferencesStore(directory).load()).toEqual({ language: 'en', theme: 'dark' });
  });
});
