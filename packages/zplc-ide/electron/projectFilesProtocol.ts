/**
 * Project files: the one definition of the channel names, limits, message shapes and validators
 * shared by the main process (`projectFiles.ts`, `main.ts`) and the renderer (`src/ipc`).
 * Pure TypeScript with no Electron or Node import, so both programs can import it.
 *
 * The channel names are defined once, in `ipcContract.ts`, and re-exported here for the callers that already import them from this module.
 *
 * Paths are always relative to the project root, separated by "/" ("" is the root). The renderer never
 * supplies a root: the main process takes it from the native folder dialog and hands back an opaque
 * `rootId` that every later request must repeat, so a handle from a closed project cannot act on the next one.
 */

export { PROJECT_FILES_CHANNEL, PROJECT_FILES_EVENT } from './ipcContract.js';

export const PROJECT_FILES_LIMITS = {
  /** Largest file the project operations will read or write: 16 MiB (a PLC source file is a few KiB). */
  maxFileBytes: 16 * 1024 * 1024,
  /** Longest relative path accepted in a request. */
  maxPathChars: 1024,
  /** Most entries returned for one folder. */
  maxListEntries: 10_000,
  /** Longest opaque root identifier accepted in a request. */
  maxRootIdChars: 64,
} as const;

export type ProjectFilesErrorCode =
  | 'invalid-request' // the message did not match its schema
  | 'invalid-path' // absolute, "..", or a name the platforms cannot all address
  | 'outside-root' // resolves, through a link, outside the project folder
  | 'no-folder' // no folder chosen, or a different one has been chosen since
  | 'not-found'
  | 'exists'
  | 'not-a-file'
  | 'not-a-directory'
  | 'not-empty'
  | 'too-large'
  | 'denied' // the operating system refused (permissions, read-only volume)
  | 'failed';

export type ProjectFilesResult<T> = { ok: true; value: T } | { ok: false; code: ProjectFilesErrorCode };

export type ProjectEntryKind = 'file' | 'directory';
export interface ProjectFolder { rootId: string; name: string }
/**
 * A folder the user chose earlier through the native dialog (IDE-008). `recentId` is opaque (a hash of the real path),
 * `displayName` is the folder's base name, never its path, and `available` says whether the folder is still there.
 */
export interface RecentProject { recentId: string; displayName: string; lastOpenedAt: number; available: boolean }
export interface ProjectEntry { name: string; kind: ProjectEntryKind }
export interface ProjectStat { kind: ProjectEntryKind; size: number }

export interface ProjectFilesRequests {
  list: { rootId: string; path: string };
  stat: { rootId: string; path: string };
  read: { rootId: string; path: string };
  write: { rootId: string; path: string; bytes: Uint8Array };
  mkdir: { rootId: string; path: string };
  remove: { rootId: string; path: string; recursive: boolean };
  rename: { rootId: string; from: string; to: string };
}

export interface ProjectFilesValues {
  list: ProjectEntry[];
  stat: ProjectStat;
  read: Uint8Array;
  write: null;
  mkdir: null;
  remove: null;
  rename: null;
}

export type ProjectFilesOp = keyof ProjectFilesRequests;
export const PROJECT_FILES_OPS = ['list', 'stat', 'read', 'write', 'mkdir', 'remove', 'rename'] as const satisfies readonly ProjectFilesOp[];

/** Recent projects: reopening a remembered folder is the only way, besides the dialog, to give a window a project folder. */
export interface RecentRequests {
  openRecent: { recentId: string };
  forgetRecent: { recentId: string };
  /** The window's current folder opened as a project: remember it. The folder is the window's own, never a path from the renderer. */
  markOpened: { rootId: string };
}
export type RecentOp = 'listRecent' | keyof RecentRequests;
export const PROJECT_RECENT_OPS = ['listRecent', 'openRecent', 'forgetRecent', 'markOpened'] as const satisfies readonly RecentOp[];

/**
 * Watching the window's folder for changes made outside Studio (IDE-004). One request names the folder by its opaque id;
 * asking again replaces the watch. The main process answers with `ProjectChange` events, batched.
 */
export interface WatchRequests { watch: { rootId: string } }
export const PROJECT_WATCH_OPS = ['watch'] as const;

/** Paths (relative, "/"-separated) that changed under the folder; `overflow` says there were too many to list, so look at everything. */
export interface ProjectChange { rootId: string; paths: string[]; overflow: boolean }

export const PROJECT_CHANGE_LIMITS = { maxPaths: 256 } as const;

/** A fresh, validated change event, or null for anything that is not exactly one. */
export function parseProjectChange(value: unknown): ProjectChange | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value).sort().join();
  const { rootId, paths, overflow } = value;
  if (keys !== 'overflow,paths,rootId' || typeof rootId !== 'string' || rootId.length < 1 || rootId.length > PROJECT_FILES_LIMITS.maxRootIdChars) return null;
  if (typeof overflow !== 'boolean' || !Array.isArray(paths) || paths.length > PROJECT_CHANGE_LIMITS.maxPaths) return null;
  if (!paths.every((path) => typeof path === 'string' && path.length >= 1 && path.length <= PROJECT_FILES_LIMITS.maxPathChars)) return null;
  return { rootId, paths: [...paths] as string[], overflow };
}

/** The only object the preload exposes for project files: narrow calls, no generic file access. */
export type ProjectFilesBridge = {
  chooseFolder(): Promise<ProjectFilesResult<ProjectFolder | null>>;
  listRecent(): Promise<ProjectFilesResult<RecentProject[]>>;
  openRecent(request: RecentRequests['openRecent']): Promise<ProjectFilesResult<ProjectFolder>>;
  forgetRecent(request: RecentRequests['forgetRecent']): Promise<ProjectFilesResult<null>>;
  markOpened(request: RecentRequests['markOpened']): Promise<ProjectFilesResult<null>>;
  /** Both are absent where nothing watches (a test host, an older preload): the renderer then simply never hears of a change. */
  watch?(request: WatchRequests['watch']): Promise<ProjectFilesResult<null>>;
  /** Subscribes to the batches of changes (IDE-004); returns the function that stops listening. */
  onChanged?(callback: (change: unknown) => void): () => void;
} & { [Op in ProjectFilesOp]: (request: ProjectFilesRequests[Op]) => Promise<ProjectFilesResult<ProjectFilesValues[Op]>> };

type Field = 'id' | 'path' | 'bytes' | 'bool';
/** Field name to field type, for each operation's single request object. */
const SHAPES: Record<ProjectFilesOp, Record<string, Field>> = {
  list: { rootId: 'id', path: 'path' },
  stat: { rootId: 'id', path: 'path' },
  read: { rootId: 'id', path: 'path' },
  write: { rootId: 'id', path: 'path', bytes: 'bytes' },
  mkdir: { rootId: 'id', path: 'path' },
  remove: { rootId: 'id', path: 'path', recursive: 'bool' },
  rename: { rootId: 'id', from: 'path', to: 'path' },
};

const RECENT_SHAPES: Record<keyof RecentRequests, Record<string, Field>> = {
  openRecent: { recentId: 'id' },
  forgetRecent: { recentId: 'id' },
  markOpened: { rootId: 'id' },
};

const CHECKS: Record<Field, (value: unknown) => boolean> = {
  id: (value) => typeof value === 'string' && value.length >= 1 && value.length <= PROJECT_FILES_LIMITS.maxRootIdChars,
  path: (value) => typeof value === 'string' && value.length <= PROJECT_FILES_LIMITS.maxPathChars,
  // Any size: the handler answers 'too-large' for an oversize body instead of calling it a malformed message.
  bytes: (value) => value instanceof Uint8Array,
  bool: (value) => typeof value === 'boolean',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseShape(shape: Record<string, Field>, args: readonly unknown[]): Record<string, unknown> | null {
  const [request] = args;
  if (args.length !== 1 || !isPlainObject(request)) return null;
  const keys = Object.keys(request);
  const fields = Object.keys(shape);
  if (keys.length !== fields.length || !fields.every((field) => Object.hasOwn(request, field) && CHECKS[shape[field]](request[field]))) return null;
  return request;
}

/**
 * Validates the arguments of one project operation: exactly one plain object holding exactly the fields
 * of that operation, each of the right type. Returns the request, or null for anything else.
 */
export function parseProjectFilesRequest(op: string, args: readonly unknown[]): ProjectFilesRequests[ProjectFilesOp] | null {
  if (!Object.hasOwn(SHAPES, op)) return null;
  return parseShape(SHAPES[op as ProjectFilesOp], args) as ProjectFilesRequests[ProjectFilesOp] | null;
}

/** The same for the watch request: exactly `{ rootId }`. */
export function parseWatchRequest(args: readonly unknown[]): WatchRequests['watch'] | null {
  return parseShape({ rootId: 'id' }, args) as WatchRequests['watch'] | null;
}

/** The same for the recent-project operations that take a request (`listRecent` takes none). */
export function parseRecentRequest(op: string, args: readonly unknown[]): RecentRequests[keyof RecentRequests] | null {
  if (!Object.hasOwn(RECENT_SHAPES, op)) return null;
  return parseShape(RECENT_SHAPES[op as keyof RecentRequests], args) as RecentRequests[keyof RecentRequests] | null;
}
