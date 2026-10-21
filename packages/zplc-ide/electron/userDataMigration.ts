/**
 * The userData folder of the release candidates, carried over to the one of ZPLC (decision D-03).
 *
 * Electron names the userData folder after the product: the release candidates kept their settings, recent projects, Learn
 * progress, recovery store and audit log in `<appData>/ZPLC IDE`, and ZPLC keeps them in `<appData>/ZPLC`. On start, before
 * anything opens the new folder, a missing or empty new folder receives a copy of the old one. The copy is made beside it
 * and renamed into place, so a failure leaves no half-copied folder; the old folder is never deleted, and a marker in it
 * says where its content went, so that it is copied once. A failure is logged and never stops the start.
 *
 * Only the folder named after the product is migrated: a folder chosen with `--user-data-dir` (the tests, the smokes), or
 * the development build's `@zplc/ide`, is left alone. Keychain and safeStorage entries tied to the old name may not follow.
 */
import { cpSync, existsSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The names the product had before decision D-03, as electron-builder gave them to the packaged application. */
const PREVIOUS_PRODUCT_NAMES = ['ZPLC IDE'];
export const MIGRATED_MARKER = 'MOVED-TO-ZPLC.txt';
/** Chromium's single-instance locks belong to the instance that made them, not to the folder. */
const INSTANCE_LOCKS = /^(?:Singleton(?:Lock|Socket|Cookie)|lockfile)$/;

export type UserDataMigration = 'migrated' | 'kept' | 'none' | 'failed';

export function migrateUserData({
  appData,
  userData,
  log = console.error,
}: {
  appData: string;
  userData: string;
  log?: (message: string) => void;
}): UserDataMigration {
  if (path.dirname(userData) !== appData) return 'none';
  const old = PREVIOUS_PRODUCT_NAMES.map((name) => path.join(appData, name)).find(
    (folder) => folder !== userData && existsSync(folder) && !existsSync(path.join(folder, MIGRATED_MARKER)),
  );
  if (old === undefined) return 'none';
  const staging = `${userData}.migrating`;
  try {
    if (existsSync(userData) && readdirSync(userData).length > 0) return 'kept';
    rmSync(staging, { recursive: true, force: true });
    cpSync(old, staging, { recursive: true, verbatimSymlinks: true, filter: (source) => !INSTANCE_LOCKS.test(path.basename(source)) });
    if (existsSync(userData)) rmdirSync(userData);
    renameSync(staging, userData);
    writeFileSync(
      path.join(old, MIGRATED_MARKER),
      `ZPLC copied this folder to ${userData} on ${new Date().toISOString()} and uses that one from then on. This folder is kept as it ` +
        `was; it can be deleted.\n`,
    );
    return 'migrated';
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    log(
      `ZPLC could not copy the settings of ${old} to ${userData}, and starts without them: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 'failed';
  }
}
