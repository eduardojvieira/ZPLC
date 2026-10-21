// Decision D-03 renamed the product, and Electron's userData folder follows the product name: release candidates kept
// their settings, recent projects, Learn progress, recovery store and audit log under `<appData>/ZPLC IDE`. These tests
// run the migration on real folders.
import { afterEach, describe, expect, it } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MIGRATED_MARKER, migrateUserData } from './userDataMigration';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** An appData folder with the folder of a release candidate in it, holding a few of the stores and a Chromium lock. */
function appDataWithOldFolder(): { appData: string; old: string; userData: string } {
  const appData = mkdtempSync(join(tmpdir(), 'zplc-userdata-'));
  roots.push(appData);
  const old = join(appData, 'ZPLC IDE');
  mkdirSync(join(old, 'learn-workspaces', 'first-blink'), { recursive: true });
  writeFileSync(join(old, 'recent-projects.json'), '[{"id":"a"}]');
  writeFileSync(join(old, 'learn-workspaces', 'first-blink', 'main.st'), 'PROGRAM Main END_PROGRAM');
  writeFileSync(join(old, 'SingletonCookie'), 'lock of the old instance');
  return { appData, old, userData: join(appData, 'ZPLC') };
}

const silent = () => undefined;

describe('the userData folder of the release candidates moves to the one of ZPLC (decision D-03)', () => {
  it('copies the old folder into a missing new one and leaves a marker in the old one, which it keeps', () => {
    const { appData, old, userData } = appDataWithOldFolder();
    expect(migrateUserData({ appData, userData, log: silent })).toBe('migrated');
    expect(readFileSync(join(userData, 'recent-projects.json'), 'utf8')).toBe('[{"id":"a"}]');
    expect(readFileSync(join(userData, 'learn-workspaces', 'first-blink', 'main.st'), 'utf8')).toBe('PROGRAM Main END_PROGRAM');
    // the lock of the old instance is not the lock of the new one
    expect(existsSync(join(userData, 'SingletonCookie'))).toBe(false);
    expect(readFileSync(join(old, MIGRATED_MARKER), 'utf8')).toContain(userData);
    expect(readFileSync(join(old, 'recent-projects.json'), 'utf8')).toBe('[{"id":"a"}]');
    expect(readdirSync(appData).sort()).toEqual(['ZPLC', 'ZPLC IDE']);
  });

  it('copies into a new folder that exists but is empty', () => {
    const { appData, userData } = appDataWithOldFolder();
    mkdirSync(userData);
    expect(migrateUserData({ appData, userData, log: silent })).toBe('migrated');
    expect(existsSync(join(userData, 'recent-projects.json'))).toBe(true);
  });

  it('never touches a new folder that already holds something, and does not mark the old one', () => {
    const { appData, old, userData } = appDataWithOldFolder();
    mkdirSync(userData);
    writeFileSync(join(userData, 'recent-projects.json'), '[]');
    expect(migrateUserData({ appData, userData, log: silent })).toBe('kept');
    expect(readdirSync(userData)).toEqual(['recent-projects.json']);
    expect(readFileSync(join(userData, 'recent-projects.json'), 'utf8')).toBe('[]');
    expect(existsSync(join(old, MIGRATED_MARKER))).toBe(false);
  });

  it('does nothing when there is no old folder, and creates no new one', () => {
    const appData = mkdtempSync(join(tmpdir(), 'zplc-userdata-'));
    roots.push(appData);
    expect(migrateUserData({ appData, userData: join(appData, 'ZPLC'), log: silent })).toBe('none');
    expect(readdirSync(appData)).toEqual([]);
  });

  it('copies an old folder once: after the marker, an emptied new folder stays empty', () => {
    const { appData, userData } = appDataWithOldFolder();
    expect(migrateUserData({ appData, userData, log: silent })).toBe('migrated');
    rmSync(userData, { recursive: true });
    expect(migrateUserData({ appData, userData, log: silent })).toBe('none');
    expect(existsSync(userData)).toBe(false);
  });

  it('leaves a folder chosen with --user-data-dir alone: only the folder named after the product is migrated', () => {
    const { appData, old } = appDataWithOldFolder();
    const chosen = join(appData, 'profiles', 'journey');
    expect(migrateUserData({ appData, userData: chosen, log: silent })).toBe('none');
    expect(existsSync(chosen)).toBe(false);
    expect(existsSync(join(old, MIGRATED_MARKER))).toBe(false);
  });

  // As root a folder with no permissions is still readable, so the failure cannot be made this way.
  it.skipIf(process.getuid?.() === 0)(
    'logs a failure and returns, so that the application still starts, with no half-copied folder and no marker',
    () => {
      const { appData, old, userData } = appDataWithOldFolder();
      const unreadable = join(old, 'learn-workspaces');
      chmodSync(unreadable, 0o000);
      const logged: string[] = [];
      try {
        expect(
          migrateUserData({
            appData,
            userData,
            log: (message) => {
              logged.push(message);
            },
          }),
        ).toBe('failed');
      } finally {
        chmodSync(unreadable, 0o755);
      }
      expect(logged).toHaveLength(1);
      expect(logged[0]).toContain(old);
      expect(readdirSync(appData)).toEqual(['ZPLC IDE']);
      expect(existsSync(join(old, MIGRATED_MARKER))).toBe(false);
    },
  );
});
