/**
 * Per-project session storage (IDE-008), owned by the main process.
 *
 * One small document per project, in a private directory under the user-data directory and named by a hash of the
 * project's real path: nothing is ever written inside the user's project folder, and the file name does not reveal the
 * path. A document is validated (`sessionStoreProtocol.ts`) before it is stored and again when it is read; a corrupt,
 * oversized, wrongly shaped or linked file reads as "no session". Writes are atomic (temporary file, then rename) and
 * one at a time. The store knows paths only as keys: the caller (the main process) resolves them from a window's folder.
 */
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { projectKey } from './recentProjects.js';
import { SESSION_LIMITS, parseSessionState, type SessionState } from './sessionStoreProtocol.js';

export const SESSION_DIRECTORY = 'sessions';
const SESSION_FILE = /^[0-9a-f]{64}\.json$/;
/** What an interrupted write leaves behind: `.<name>.json.<uuid>`. */
const LEFTOVER = /^\.[0-9a-f]{64}\.json\./;

export function createSessionStore(userDataPath: string) {
  const directory = path.join(userDataPath, SESSION_DIRECTORY);
  const fileOf = (realPath: string) => path.join(directory, `${projectKey(realPath)}.json`);
  let pending: Promise<unknown> = Promise.resolve();

  const validDirectory = async (): Promise<boolean> => {
    try { const status = await lstat(directory); return status.isDirectory() && !status.isSymbolicLink(); } catch { return false; }
  };

  return {
    /** The saved session of a project, or null when there is none or it cannot be trusted. Never throws. */
    async load(realPath: string): Promise<SessionState | null> {
      try {
        if (!await validDirectory()) return null;
        const file = fileOf(realPath);
        const status = await lstat(file);
        if (status.isSymbolicLink() || !status.isFile() || status.size > SESSION_LIMITS.maxBytes) return null;
        const raw = await readFile(file, 'utf8');
        return raw.length > SESSION_LIMITS.maxBytes ? null : parseSessionState(JSON.parse(raw));
      } catch {
        return null;
      }
    },

    /** Replaces the project's session. Rejects, and writes nothing, for anything that is not exactly a session document. */
    save(realPath: string, value: unknown): Promise<void> {
      const state = parseSessionState(value);
      if (!state) return Promise.reject(new Error('Invalid session'));
      const write = async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        if (!await validDirectory()) throw new Error('Invalid session directory');
        const file = fileOf(realPath);
        const temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}`);
        try {
          await writeFile(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
          await rename(temporary, file);
        } finally {
          await unlink(temporary).catch(() => undefined);
        }
      };
      const result = pending.then(write, write);
      pending = result.catch(() => undefined);
      return result;
    },

    /**
     * Settles once every save accepted so far has finished, written or failed. The process waits on it before it exits,
     * so the last session a closing window sent is on the disk.
     */
    settled(): Promise<void> {
      return pending.then(() => undefined);
    },

    /**
     * Deletes the sessions of projects whose key is not in `keep` (the remembered ones) and the leftovers of interrupted
     * writes, so the directory cannot grow without bound. Files it did not create are left alone.
     */
    async prune(keep: ReadonlySet<string>): Promise<void> {
      if (!await validDirectory()) return;
      for (const name of await readdir(directory)) {
        const orphan = SESSION_FILE.test(name) ? !keep.has(name.slice(0, -'.json'.length)) : LEFTOVER.test(name);
        if (orphan) await unlink(path.join(directory, name)).catch(() => undefined);
      }
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
