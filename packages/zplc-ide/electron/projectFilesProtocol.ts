/**
 * Project files: the one definition of the channel names, limits, message shapes and validators
 * shared by the main process (`projectFiles.ts`, `main.ts`) and the renderer (`src/ipc`).
 * Pure TypeScript with no Electron or Node import, so both programs can import it.
 *
 * The sandboxed preload cannot `require` a local module, so `preload.ts` imports only the types
 * and repeats the channel names; `projectFilesIpc.test.ts` keeps that copy equal to this one.
 *
 * Paths are always relative to the project root, separated by "/" ("" is the root). The renderer never
 * supplies a root: the main process takes it from the native folder dialog and hands back an opaque
 * `rootId` that every later request must repeat, so a handle from a closed project cannot act on the next one.
 */

export const PROJECT_FILES_CHANNEL = {
  chooseFolder: 'project-files:choose-folder',
  list: 'project-files:list',
  stat: 'project-files:stat',
  read: 'project-files:read',
  write: 'project-files:write',
  mkdir: 'project-files:mkdir',
  remove: 'project-files:remove',
  rename: 'project-files:rename',
} as const;

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

/** The only object the preload exposes for project files: eight narrow calls, no generic file access. */
export type ProjectFilesBridge = {
  chooseFolder(): Promise<ProjectFilesResult<ProjectFolder | null>>;
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

/**
 * Validates the arguments of one project operation: exactly one plain object holding exactly the fields
 * of that operation, each of the right type. Returns the request, or null for anything else.
 */
export function parseProjectFilesRequest(op: string, args: readonly unknown[]): ProjectFilesRequests[ProjectFilesOp] | null {
  if (!Object.hasOwn(SHAPES, op)) return null;
  const shape = SHAPES[op as ProjectFilesOp];
  const [request] = args;
  if (args.length !== 1 || !isPlainObject(request)) return null;
  const keys = Object.keys(request);
  const fields = Object.keys(shape);
  if (keys.length !== fields.length || !fields.every((field) => Object.hasOwn(request, field) && CHECKS[shape[field]](request[field]))) return null;
  return request as unknown as ProjectFilesRequests[ProjectFilesOp];
}
