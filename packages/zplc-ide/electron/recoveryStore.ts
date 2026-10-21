/**
 * Recovery of modified files (IDE-006), owned by the main process.
 *
 * One small document per modified file, in a private directory per project under the user-data directory: the project
 * is named by a hash of its real path and the file by a hash of its relative path, so nothing is ever written inside the
 * user's project folder and no name reveals a path. A document is validated (`recoveryStoreProtocol.ts`) before it is
 * stored and again when it is read; anything else in the directory reads as absent. Writes are atomic (temporary file,
 * then rename) and one at a time. The store knows paths only as keys: the caller (the main process) resolves them from
 * a window's folder, so the renderer never names a location on the machine.
 */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { projectKey } from './recentProjects.js';
import { RECOVERY_LIMITS, parseRecoveryEntry, type RecoveryEntry } from './recoveryStoreProtocol.js';

export const RECOVERY_DIRECTORY = 'recovery';
const ENTRY_FILE = /^[0-9a-f]{64}\.json$/;
const PROJECT_DIRECTORY = /^[0-9a-f]{64}$/;
/** What an interrupted write leaves behind: `.<name>.json.<uuid>`. */
const LEFTOVER = /^\.[0-9a-f]{64}\.json\./;

const fileNameOf = (relative: string) => `${createHash('sha256').update(relative, 'utf8').digest('hex')}.json`;

async function isRealDirectory(directory: string): Promise<boolean> {
  try {
    const status = await lstat(directory);
    return status.isDirectory() && !status.isSymbolicLink();
  } catch {
    return false;
  }
}

export function createRecoveryStore(userDataPath: string, now: () => number = Date.now) {
  const root = path.join(userDataPath, RECOVERY_DIRECTORY);
  const directoryOf = (realPath: string) => path.join(root, projectKey(realPath));
  let pending: Promise<unknown> = Promise.resolve();
  /** Runs one change at a time, in the order they were asked; a failure rejects only its own caller. */
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const result = pending.then(task, task);
    pending = result.catch(() => undefined);
    return result;
  };

  const names = async (directory: string): Promise<string[]> => {
    try {
      return (await readdir(directory)).filter((name) => ENTRY_FILE.test(name));
    } catch {
      return [];
    }
  };

  return {
    /** The kept content of every modified file of the project, by path. Never throws: what cannot be trusted is skipped. */
    async list(realPath: string): Promise<RecoveryEntry[]> {
      const directory = directoryOf(realPath);
      if (!(await isRealDirectory(root)) || !(await isRealDirectory(directory))) return [];
      const entries: RecoveryEntry[] = [];
      for (const name of await names(directory)) {
        try {
          const file = path.join(directory, name);
          const status = await lstat(file);
          if (status.isSymbolicLink() || !status.isFile() || status.size > 4 * RECOVERY_LIMITS.maxContentChars) continue;
          const entry = parseRecoveryEntry(JSON.parse(await readFile(file, 'utf8')));
          if (entry && fileNameOf(entry.path) === name) entries.push(entry);
        } catch {
          /* unreadable, torn or foreign: not an entry */
        }
      }
      return entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    },

    /** Keeps `content` as the recoverable state of `relative`. Rejects, and writes nothing, for anything it cannot keep. */
    write(realPath: string, relative: string, content: string): Promise<void> {
      const entry = parseRecoveryEntry({ path: relative, content, savedAt: now() });
      if (!entry) return Promise.reject(new Error('Invalid recovery entry'));
      return serial(async () => {
        const directory = directoryOf(realPath);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        if (!(await isRealDirectory(root)) || !(await isRealDirectory(directory))) throw new Error('Invalid recovery directory');
        const file = path.join(directory, fileNameOf(entry.path));
        const document = JSON.stringify(entry);
        let others = 0;
        let held = 0;
        for (const name of await names(directory)) {
          if (name === path.basename(file)) continue;
          others += 1;
          held += (await lstat(path.join(directory, name)).catch(() => ({ size: 0 }))).size;
        }
        if (others >= RECOVERY_LIMITS.maxEntries || held + document.length > RECOVERY_LIMITS.maxProjectChars)
          throw new Error('Recovery store full');
        const temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}`);
        try {
          await writeFile(temporary, document, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
          await rename(temporary, file);
        } finally {
          await unlink(temporary).catch(() => undefined);
        }
      });
    },

    /** Removes the entry of one file, or of every file of the project when `relative` is null. Absent entries are fine. */
    discard(realPath: string, relative: string | null): Promise<void> {
      return serial(async () => {
        const directory = directoryOf(realPath);
        if (!(await isRealDirectory(root)) || !(await isRealDirectory(directory))) return;
        if (relative !== null) {
          await unlink(path.join(directory, fileNameOf(relative))).catch(() => undefined);
        } else {
          for (const name of await readdir(directory).catch(() => [] as string[])) {
            if (ENTRY_FILE.test(name) || LEFTOVER.test(name)) await unlink(path.join(directory, name)).catch(() => undefined);
          }
        }
        await rmdir(directory).catch(() => undefined); // only when it is empty
      });
    },

    /**
     * Removes the directories of projects whose key is not in `keep` (the remembered ones) and the leftovers of
     * interrupted writes, so the store cannot grow without bound. Anything it did not create is left alone.
     */
    prune(keep: ReadonlySet<string>): Promise<void> {
      return serial(async () => {
        if (!(await isRealDirectory(root))) return;
        for (const name of await readdir(root)) {
          if (!PROJECT_DIRECTORY.test(name)) continue;
          const directory = path.join(root, name);
          if (!keep.has(name)) {
            await rm(directory, { recursive: true, force: true }).catch(() => undefined);
            continue;
          }
          if (!(await isRealDirectory(directory))) continue;
          for (const leftover of await readdir(directory).catch(() => [] as string[])) {
            if (LEFTOVER.test(leftover)) await unlink(path.join(directory, leftover)).catch(() => undefined);
          }
        }
      });
    },
  };
}

export type RecoveryStore = ReturnType<typeof createRecoveryStore>;
