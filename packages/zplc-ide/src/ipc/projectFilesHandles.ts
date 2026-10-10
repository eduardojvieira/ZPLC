/**
 * Folder and file handles backed by the project-files bridge of the Electron preload.
 *
 * The renderer code (`fileSystem.ts`, the store, the editor) was written against the browser's
 * FileSystemDirectoryHandle. In Electron the folder is chosen by a native dialog in the main process, which
 * keeps the root and confines every path to it; these objects implement the part of the handle interface the
 * application uses (`name`, `kind`, `values()`, `entries()`, `keys()`, `getFileHandle`, `getDirectoryHandle`,
 * `removeEntry`, `getFile`, `createWritable`, permission queries) on top of typed requests, so the open, create,
 * save, example and Learn flows run unchanged. A writable stream collects its chunks and writes them in one
 * request on `close()`; seeking, truncating and partial writes are not supported.
 */
import {
  PROJECT_FILES_LIMITS,
  type ProjectEntry,
  type ProjectFilesBridge,
  type ProjectFilesErrorCode,
  type ProjectFilesResult,
  type ProjectStat,
  type RecentProject,
} from '../../electron/projectFilesProtocol';

const MAX_MIB = PROJECT_FILES_LIMITS.maxFileBytes / (1024 * 1024);

/** Error name (the browser's where one exists, so existing `name` checks keep working) and a short message with no path. */
const FAILURES: Record<ProjectFilesErrorCode, readonly [name: string, message: string]> = {
  'not-found': ['NotFoundError', 'The folder, or a file in it, was not found.'],
  denied: ['NotAllowedError', 'Access to the file or folder was denied by the operating system.'],
  'not-a-file': ['TypeMismatchError', 'That entry is a folder, not a file.'],
  'not-a-directory': ['TypeMismatchError', 'That entry is a file, not a folder.'],
  exists: ['InvalidModificationError', 'An entry with that name already exists.'],
  'not-empty': ['InvalidModificationError', 'The folder is not empty.'],
  'too-large': ['QuotaExceededError', `The file is larger than ${MAX_MIB} MiB.`],
  'invalid-path': ['TypeError', 'The file name is not allowed.'],
  'outside-root': ['OutsideProjectError', 'The path leaves the project folder.'],
  'no-folder': ['ProjectFolderClosedError', 'The project folder is no longer open. Choose the folder again.'],
  'invalid-request': ['Error', 'The operation failed. Try again.'],
  failed: ['Error', 'The operation failed. Try again.'],
  // Project archives (IDE-022): the archive itself, never a path.
  'not-a-zip': ['TypeMismatchError', 'The file is not a project archive.'],
  unsupported: ['NotSupportedError', 'The archive uses something Studio does not read (encryption, a link, or a very large archive).'],
  'unsafe-path': ['OutsideProjectError', 'The archive holds a file whose path leaves the project folder.'],
  duplicate: ['InvalidModificationError', 'The archive holds two files with the same name.'],
  corrupt: ['DataError', 'The archive is damaged: a file does not match its checksum or size.'],
  'too-many': ['QuotaExceededError', 'The archive holds more files than a project may.'],
};

/** The error a failed project operation raises: the browser's error name where one exists, and a message with no path. */
export function projectFilesFailure(code: ProjectFilesErrorCode): Error {
  const [name, message] = FAILURES[code];
  return Object.assign(new Error(message), { name });
}

/** A bridge call that rejects (a revoked document, a closed window) is a failed operation, like any other. */
async function settle<T>(call: Promise<ProjectFilesResult<T>>): Promise<ProjectFilesResult<T>> {
  try {
    return await call;
  } catch {
    return { ok: false, code: 'failed' };
  }
}

function unwrap<T>(answer: ProjectFilesResult<T>): T {
  if (!answer.ok) throw projectFilesFailure(answer.code);
  return answer.value;
}

const ask = async <T>(call: Promise<ProjectFilesResult<T>>): Promise<T> => unwrap(await settle(call));

/** Names of direct children only, as the browser requires: no separator, no dot segment. */
function checkName(name: string): void {
  if (name === '' || name === '.' || name === '..' || /[\\/\0]/.test(name)) throw new TypeError('The name is not allowed.');
}

const childPath = (parent: string, name: string) => (parent ? `${parent}/${name}` : name);

async function toBytes(chunk: unknown): Promise<Uint8Array> {
  if (typeof chunk === 'string') return new TextEncoder().encode(chunk);
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk.slice(0));
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
  if (chunk instanceof Blob) return new Uint8Array(await chunk.arrayBuffer());
  throw new TypeError('Only whole text, bytes or Blob content can be written.');
}

interface Context { bridge: ProjectFilesBridge; rootId: string }

abstract class ProjectHandle {
  abstract readonly kind: 'file' | 'directory';
  readonly name: string;
  readonly path: string;
  protected readonly context: Context;

  constructor(context: Context, path: string, name: string) {
    this.context = context;
    this.path = path;
    this.name = name;
  }

  async isSameEntry(other: unknown): Promise<boolean> {
    return other instanceof ProjectHandle && other.context.rootId === this.context.rootId && other.path === this.path;
  }

  async queryPermission(): Promise<'granted'> { return 'granted'; }
  async requestPermission(): Promise<'granted'> { return 'granted'; }

  get rootId(): string { return this.context.rootId; }

  protected get request() { return { rootId: this.context.rootId, path: this.path }; }
}

class ProjectWritable {
  readonly #context: Context;
  readonly #path: string;
  #chunks: Uint8Array[] = [];
  #open = true;

  constructor(context: Context, path: string) {
    this.#context = context;
    this.#path = path;
  }

  async write(chunk: unknown): Promise<void> {
    if (!this.#open) throw new TypeError('The stream is closed.');
    this.#chunks.push(await toBytes(chunk));
  }

  async close(): Promise<void> {
    if (!this.#open) throw new TypeError('The stream is closed.');
    this.#open = false;
    const bytes = new Uint8Array(this.#chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of this.#chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    this.#chunks = [];
    await ask(this.#context.bridge.write({ rootId: this.#context.rootId, path: this.#path, bytes }));
  }

  async abort(): Promise<void> {
    this.#open = false;
    this.#chunks = [];
  }
}

class ProjectFileHandle extends ProjectHandle {
  readonly kind = 'file' as const;

  async getFile(): Promise<File> {
    const bytes = await ask(this.context.bridge.read(this.request));
    return new File([bytes as BlobPart], this.name, { lastModified: Date.now() });
  }

  async createWritable(): Promise<ProjectWritable> {
    return new ProjectWritable(this.context, this.path);
  }
}

class ProjectDirectoryHandle extends ProjectHandle {
  readonly kind = 'directory' as const;

  #child(entry: ProjectEntry): ProjectFileHandle | ProjectDirectoryHandle {
    const path = childPath(this.path, entry.name);
    return entry.kind === 'directory' ? new ProjectDirectoryHandle(this.context, path, entry.name) : new ProjectFileHandle(this.context, path, entry.name);
  }

  /** What is at a child path, or null when nothing is. */
  async #stat(path: string): Promise<ProjectStat | null> {
    const answer = await settle(this.context.bridge.stat({ rootId: this.context.rootId, path }));
    return !answer.ok && answer.code === 'not-found' ? null : unwrap(answer);
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<ProjectFileHandle> {
    checkName(name);
    const path = childPath(this.path, name);
    const found = await this.#stat(path);
    if (found && found.kind !== 'file') throw projectFilesFailure('not-a-file');
    if (!found) {
      if (!options?.create) throw projectFilesFailure('not-found');
      await ask(this.context.bridge.write({ rootId: this.context.rootId, path, bytes: new Uint8Array(0) }));
    }
    return new ProjectFileHandle(this.context, path, name);
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<ProjectDirectoryHandle> {
    checkName(name);
    const path = childPath(this.path, name);
    const found = await this.#stat(path);
    if (found && found.kind !== 'directory') throw projectFilesFailure('not-a-directory');
    if (!found) {
      if (!options?.create) throw projectFilesFailure('not-found');
      await ask(this.context.bridge.mkdir({ rootId: this.context.rootId, path }));
    }
    return new ProjectDirectoryHandle(this.context, path, name);
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    checkName(name);
    await ask(this.context.bridge.remove({ rootId: this.context.rootId, path: childPath(this.path, name), recursive: options?.recursive === true }));
  }

  async *values(): AsyncGenerator<ProjectFileHandle | ProjectDirectoryHandle> {
    for (const entry of await ask(this.context.bridge.list(this.request))) yield this.#child(entry);
  }

  async *keys(): AsyncGenerator<string> {
    for await (const entry of this.values()) yield entry.name;
  }

  async *entries(): AsyncGenerator<[string, ProjectFileHandle | ProjectDirectoryHandle]> {
    for await (const entry of this.values()) yield [entry.name, entry];
  }

  [Symbol.asyncIterator]() { return this.entries(); }
}

/**
 * Shows the native folder dialog (in the main process) and returns a handle for the folder it chose,
 * or null when the dialog was cancelled. Errors carry short messages with no path.
 *
 * ponytail: this compatibility layer lets the browser-handle code run unchanged over the bridge. WP-34 replaces
 * it with typed project operations used directly by the store, the tree, Build, Test, Simulate, Lab and Learn.
 */
export async function chooseProjectFolder(bridge: ProjectFilesBridge): Promise<FileSystemDirectoryHandle | null> {
  const folder = await ask(bridge.chooseFolder());
  // Cast: the class implements the subset above, not the whole interface (no `resolve`).
  return folder ? new ProjectDirectoryHandle({ bridge, rootId: folder.rootId }, '', folder.name) as unknown as FileSystemDirectoryHandle : null;
}

/**
 * The opaque id the main process gave the project folder, read from the handle of the folder itself (the one that
 * `chooseProjectFolder` returned); null for any other handle or value. The id is the only thing the renderer sends to
 * have that folder used as the workspace of Build, Tests and Simulate: it never names a path.
 */
export function projectRootId(handle: unknown): string | null {
  return handle instanceof ProjectDirectoryHandle && handle.path === '' ? handle.rootId : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Recent projects (IDE-008)
// ---------------------------------------------------------------------------------------------------------------------

/** A bridge call that may not exist (an older preload) or may throw at once is a failed call, like a rejected one. */
const guarded = <T>(call: () => Promise<ProjectFilesResult<T>>) => settle((async () => call())());

const isRecentProject = (value: unknown): value is RecentProject => {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.recentId === 'string' && typeof item.displayName === 'string'
    && typeof item.lastOpenedAt === 'number' && Number.isFinite(item.lastOpenedAt) && typeof item.available === 'boolean';
};

/** The folders the user chose before, most recent first. Never throws: no list is an empty list. */
export async function listRecentProjects(bridge: ProjectFilesBridge): Promise<RecentProject[]> {
  const answer = await guarded(() => bridge.listRecent());
  return answer.ok && Array.isArray(answer.value) && answer.value.every(isRecentProject) ? answer.value : [];
}

/**
 * Reopens a remembered folder: the main process checks that it is still there and makes it the window's folder, as the
 * dialog does, and the renderer gets the same handle. Rejects with a short message, naming no path, when it cannot.
 */
export async function openRecentFolder(bridge: ProjectFilesBridge, recentId: string): Promise<FileSystemDirectoryHandle> {
  const folder = await ask(bridge.openRecent({ recentId }));
  return new ProjectDirectoryHandle({ bridge, rootId: folder.rootId }, '', folder.name) as unknown as FileSystemDirectoryHandle;
}

/** Drops an entry from the list. A failure leaves the list as it was, and says nothing. */
export async function forgetRecentProject(bridge: ProjectFilesBridge, recentId: string): Promise<void> {
  await guarded(() => bridge.forgetRecent({ recentId }));
}

/** Tells the main process that the folder of this handle opened as a project, so that it is remembered. Silent on failure. */
export async function markProjectOpened(bridge: ProjectFilesBridge, handle: unknown): Promise<void> {
  const rootId = projectRootId(handle);
  if (rootId !== null) await guarded(() => bridge.markOpened({ rootId }));
}
