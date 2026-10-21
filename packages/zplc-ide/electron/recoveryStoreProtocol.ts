/**
 * The recovery store (IDE-006): the one definition of its channel names, limits and message shapes, shared by the main
 * process (`recoveryStore.ts`, `security.ts`, `main.ts`) and the renderer (`src/ipc/recoveryBridge.ts`). Pure TypeScript
 * with no Electron or Node import, so both programs can import it.
 *
 * The renderer sends the content of a modified file a moment after the user's last keystroke; the main process keeps it
 * under the user-data directory, named by the project and the relative path, and never inside the project folder. After
 * a crash the content is still there and the next start offers it back. A clean exit leaves nothing, because every way
 * out of a modified file (save, discard, close with discard) removes its entry.
 */
import { PROJECT_FILES_LIMITS } from './projectFilesProtocol.js';
import { isSessionPath } from './sessionStoreProtocol.js';

export { RECOVERY_CHANNEL } from './ipcContract.js';

export const RECOVERY_LIMITS = {
  /** Modified files kept per project. */
  maxEntries: 64,
  /** Longest content of one entry, in characters: what a project file may hold. */
  maxContentChars: PROJECT_FILES_LIMITS.maxFileBytes,
  /** All the content kept for one project, in characters. */
  maxProjectChars: 4 * PROJECT_FILES_LIMITS.maxFileBytes,
  /** Longest opaque root identifier accepted in a request (the same bound as a project file request). */
  maxRootIdChars: PROJECT_FILES_LIMITS.maxRootIdChars,
} as const;

/** What one modified file left behind: its project-relative path, its content, and when that content was kept. */
export interface RecoveryEntry {
  path: string;
  content: string;
  savedAt: number;
}

export interface RecoveryRequests {
  write: { rootId: string; path: string; content: string };
  list: { rootId: string };
  /** `path: null` removes every entry of the project. */
  discard: { rootId: string; path: string | null };
}

/** What the preload exposes for recovery: three narrow calls for the window's project folder, named by its opaque id. */
export interface RecoveryBridge {
  write(request: RecoveryRequests['write']): Promise<unknown>;
  list(request: RecoveryRequests['list']): Promise<unknown>;
  discard(request: RecoveryRequests['discard']): Promise<unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

const isRootId = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= RECOVERY_LIMITS.maxRootIdChars;

/** True for the exact content of one entry: a string within the bound that fits one project file. */
export function isRecoveryContent(value: unknown): value is string {
  return typeof value === 'string' && value.length <= RECOVERY_LIMITS.maxContentChars;
}

/** Exactly `{ rootId, path, content }`: a relative project path that session documents also accept, and bounded text. */
export function parseRecoveryWrite(value: unknown): RecoveryRequests['write'] | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ['rootId', 'path', 'content'])) return null;
  const { rootId, path, content } = value;
  return isRootId(rootId) && isSessionPath(path) && isRecoveryContent(content) ? { rootId, path, content } : null;
}

export function parseRecoveryList(value: unknown): RecoveryRequests['list'] | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ['rootId'])) return null;
  return isRootId(value.rootId) ? { rootId: value.rootId } : null;
}

export function parseRecoveryDiscard(value: unknown): RecoveryRequests['discard'] | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ['rootId', 'path'])) return null;
  const { rootId, path } = value;
  return isRootId(rootId) && (path === null || isSessionPath(path)) ? { rootId, path } : null;
}

/** A fresh, validated entry read back from storage or from the main process, or null for anything that is not one. */
export function parseRecoveryEntry(value: unknown): RecoveryEntry | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ['path', 'content', 'savedAt'])) return null;
  const { path, content, savedAt } = value;
  if (!isSessionPath(path) || !isRecoveryContent(content) || typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt < 0)
    return null;
  return { path, content, savedAt };
}
