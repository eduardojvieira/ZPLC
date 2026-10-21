/**
 * Recent projects (IDE-008), owned by the main process.
 *
 * Only a folder that the user chose through the native dialog is ever recorded, and only its real path, so a project
 * can be reopened without a dialog only if the user chose that exact folder earlier. The list lives in one small
 * private file under the user-data directory (never in a project folder); the renderer never sees a path, only the
 * opaque id (a hash of the real path), the folder's base name and the time. Reading is tolerant: a corrupt, oversized
 * or linked file is an empty list that the next record replaces. Writing is atomic (temporary file, then rename).
 */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const RECENT_PROJECTS_FILENAME = 'zplc-recent-projects.v1.json';
export const RECENT_PROJECTS_LIMITS = {
  /** Entries kept, most recent first. */
  maxEntries: 10,
  /** Longest real path recorded (the longest path the platforms accept is 4096). */
  maxPathChars: 4096,
  /** Largest list file read: ten entries of the longest path fit with room to spare. */
  maxBytes: 128 * 1024,
} as const;

export interface RecentEntry {
  id: string;
  path: string;
  lastOpenedAt: number;
}

/** The key of a project in main-process storage: a hash of its real path. It is also the opaque id the renderer gets. */
export function projectKey(realPath: string): string {
  return createHash('sha256').update(realPath, 'utf8').digest('hex');
}

function isPlausiblePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= RECENT_PROJECTS_LIMITS.maxPathChars &&
    !value.includes('\0') &&
    path.isAbsolute(value)
  );
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

/** The entries of a list file, most recent first, or undefined for anything that is not exactly the format written here. */
export function parseRecentProjects(raw: string): RecentEntry[] | undefined {
  if (raw.length > RECENT_PROJECTS_LIMITS.maxBytes) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isPlainObject(value) || !hasExactKeys(value, ['schemaVersion', 'projects']) || value.schemaVersion !== 1) return undefined;
    const projects = value.projects;
    if (!Array.isArray(projects) || projects.length > RECENT_PROJECTS_LIMITS.maxEntries) return undefined;
    const seen = new Set<string>();
    const entries: RecentEntry[] = [];
    for (const item of projects) {
      if (!isPlainObject(item) || !hasExactKeys(item, ['id', 'path', 'lastOpenedAt'])) return undefined;
      const { id, path: entryPath, lastOpenedAt } = item;
      if (!isPlausiblePath(entryPath) || id !== projectKey(entryPath) || seen.has(id)) return undefined;
      if (typeof lastOpenedAt !== 'number' || !Number.isSafeInteger(lastOpenedAt) || lastOpenedAt < 0) return undefined;
      seen.add(id);
      entries.push({ id, path: entryPath, lastOpenedAt });
    }
    return entries.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
  } catch {
    return undefined;
  }
}

const INVALID = 'Invalid recent project';

export function createRecentProjects(userDataPath: string, now: () => number = Date.now) {
  const file = path.join(userDataPath, RECENT_PROJECTS_FILENAME);
  let pending: Promise<unknown> = Promise.resolve();

  const validDirectory = async (): Promise<boolean> => {
    try {
      const status = await lstat(userDataPath);
      return status.isDirectory() && !status.isSymbolicLink();
    } catch {
      return false;
    }
  };

  const read = async (): Promise<RecentEntry[]> => {
    try {
      if (!(await validDirectory())) return [];
      const status = await lstat(file);
      if (status.isSymbolicLink() || !status.isFile() || status.size > RECENT_PROJECTS_LIMITS.maxBytes) return [];
      return parseRecentProjects(await readFile(file, 'utf8')) ?? [];
    } catch {
      return [];
    }
  };

  const write = async (entries: readonly RecentEntry[]): Promise<void> => {
    await mkdir(userDataPath, { recursive: true, mode: 0o700 });
    if (!(await validDirectory())) throw new Error('Invalid recent projects directory');
    const temporary = path.join(userDataPath, `.${RECENT_PROJECTS_FILENAME}.${randomUUID()}`);
    try {
      await writeFile(temporary, JSON.stringify({ schemaVersion: 1, projects: entries }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  };

  /** Runs one read-modify-write at a time, so that concurrent records cannot overwrite each other. */
  const update = <T>(change: (entries: RecentEntry[]) => { entries: RecentEntry[]; result: T }): Promise<T> => {
    const run = async () => {
      const { entries, result } = change(await read());
      await write(entries);
      return result;
    };
    const result = pending.then(run, run);
    pending = result.catch(() => undefined);
    return result;
  };

  return {
    list: read,

    async get(id: string): Promise<RecentEntry | undefined> {
      return (await read()).find((entry) => entry.id === id);
    },

    /** Puts a folder (by its real path) at the top of the list, once, dropping the oldest beyond the limit. */
    record(realPath: string): Promise<void> {
      if (!isPlausiblePath(realPath)) return Promise.reject(new Error(INVALID));
      return update((entries) => ({
        entries: [
          { id: projectKey(realPath), path: realPath, lastOpenedAt: now() },
          ...entries.filter((entry) => entry.path !== realPath),
        ].slice(0, RECENT_PROJECTS_LIMITS.maxEntries),
        result: undefined,
      }));
    },

    /** True when the entry was in the list. */
    forget(id: string): Promise<boolean> {
      return update((entries) => {
        const kept = entries.filter((entry) => entry.id !== id);
        return { entries: kept, result: kept.length !== entries.length };
      });
    },
  };
}

export type RecentProjects = ReturnType<typeof createRecentProjects>;
