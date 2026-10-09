/**
 * Project files owned by the main process (IDE-001, first task).
 *
 * The folder is chosen through the native dialog, or reopened from the list of folders that the user chose that way
 * before (IDE-008, `recentProjects.ts`); its real path is kept here, per window, and never reaches the renderer. The renderer asks for typed operations on paths relative to that root. Every
 * operation resolves its path through `locate`, the one containment check: no absolute path, no ".."
 * segment, and the real path of the target (or of its nearest existing ancestor) must lie inside the
 * real path of the root, so a link that leaves the folder is refused. Results carry a typed code and
 * never a path or an operating-system message. Only `rootOf` hands the real path out, to the main process.
 *
 * ponytail: the check and the use are separate system calls, so a local process that swaps a link inside
 * the project between them can defeat containment. Upgrade: descriptor-relative operations (`openat`)
 * in the native project service of WP-34.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  PROJECT_FILES_CHANNEL,
  PROJECT_FILES_LIMITS,
  PROJECT_FILES_OPS,
  parseProjectFilesRequest,
  parseRecentRequest,
  type ProjectEntry,
  type ProjectEntryKind,
  type ProjectFilesErrorCode,
  type ProjectFilesOp,
  type ProjectFilesRequests,
  type ProjectFilesResult,
  type ProjectFilesValues,
  type ProjectFolder,
  type RecentProject,
  type RecentRequests,
} from './projectFilesProtocol.js';
import type { RecentEntry, RecentProjects } from './recentProjects.js';

class Refusal extends Error {
  code: ProjectFilesErrorCode;
  constructor(code: ProjectFilesErrorCode) {
    super(code);
    this.code = code;
  }
}

const ERRNO_CODES: Record<string, ProjectFilesErrorCode> = {
  ENOENT: 'not-found', ENOTDIR: 'not-a-directory', EISDIR: 'not-a-file', EEXIST: 'exists', ENOTEMPTY: 'not-empty',
  EACCES: 'denied', EPERM: 'denied', EROFS: 'denied', ENAMETOOLONG: 'invalid-path',
};

function codeOf(error: unknown): ProjectFilesErrorCode {
  if (error instanceof Refusal) return error.code;
  const errno = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return ERRNO_CODES[errno] ?? 'failed';
}

/** Separators, drive and stream colons and NUL, and names ending in a dot or space (Windows trims those silently). */
const UNADDRESSABLE_NAME = /[\\:\0]|[. ]$/;

/** The segments of a relative project path: "" and "." vanish, a leading "/", ".." or an unaddressable name is refused. */
function projectPathSegments(relative: string): string[] {
  if (relative.startsWith('/')) throw new Refusal('invalid-path');
  const segments = relative.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.some((segment) => segment === '..' || UNADDRESSABLE_NAME.test(segment))) throw new Refusal('invalid-path');
  return segments;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

interface Located {
  /** The path to use: resolved through links up to its nearest existing ancestor, then the names still to be created. */
  real: string;
  exists: boolean;
}

/** The one containment check. `root` is the real path of the project folder. */
async function locate(root: string, relative: string): Promise<Located> {
  let ancestor = path.join(root, ...projectPathSegments(relative));
  const missing: string[] = [];
  for (;;) {
    try {
      await lstat(ancestor);
      break;
    } catch (error) {
      if (codeOf(error) !== 'not-found') throw error;
      missing.unshift(path.basename(ancestor));
      ancestor = path.dirname(ancestor); // the root exists, so this ends
    }
  }
  let resolved: string;
  try {
    resolved = await realpath(ancestor);
  } catch (error) {
    // A link whose target does not exist: writing through it would create the target wherever it points.
    throw codeOf(error) === 'not-found' ? new Refusal('outside-root') : error;
  }
  if (!isInside(root, resolved)) throw new Refusal('outside-root');
  return { real: path.join(resolved, ...missing), exists: missing.length === 0 };
}

/** The entry itself, not what it links to: for delete and rename, where a final link must be acted on, not followed. */
async function locateEntry(root: string, relative: string): Promise<string> {
  const segments = projectPathSegments(relative);
  const name = segments.pop();
  if (name === undefined) throw new Refusal('invalid-path'); // the root itself
  const parent = await locate(root, segments.join('/'));
  if (!parent.exists) throw new Refusal('not-found');
  return path.join(parent.real, name);
}

async function existingPath(root: string, relative: string): Promise<string> {
  const target = await locate(root, relative);
  if (!target.exists) throw new Refusal('not-found');
  return target.real;
}

type Operations = { [Op in ProjectFilesOp]: (root: string, request: ProjectFilesRequests[Op]) => Promise<ProjectFilesValues[Op]> };

const operations: Operations = {
  async list(root, { path: relative }) {
    const directory = await existingPath(root, relative);
    const names = (await readdir(directory, { withFileTypes: true })).filter((entry) => !UNADDRESSABLE_NAME.test(entry.name));
    if (names.length > PROJECT_FILES_LIMITS.maxListEntries) throw new Refusal('too-large');
    const entries: ProjectEntry[] = [];
    for (const entry of names) {
      let kind: ProjectEntryKind | undefined = entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : undefined;
      if (entry.isSymbolicLink()) {
        // A link is listed as what it points to, only when that lies inside the root.
        const info = await locate(root, relative ? `${relative}/${entry.name}` : entry.name).then((target) => stat(target.real), () => undefined);
        kind = info?.isDirectory() ? 'directory' : info?.isFile() ? 'file' : undefined;
      }
      if (kind) entries.push({ name: entry.name, kind });
    }
    return entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  },

  async stat(root, { path: relative }) {
    const info = await stat(await existingPath(root, relative));
    if (info.isDirectory()) return { kind: 'directory', size: 0 };
    if (info.isFile()) return { kind: 'file', size: info.size };
    throw new Refusal('not-a-file');
  },

  async read(root, { path: relative }) {
    const file = await existingPath(root, relative);
    const info = await stat(file);
    if (!info.isFile()) throw new Refusal('not-a-file'); // checked before opening: a named pipe would block the open
    if (info.size > PROJECT_FILES_LIMITS.maxFileBytes) throw new Refusal('too-large');
    const bytes = await readFile(file);
    if (bytes.byteLength > PROJECT_FILES_LIMITS.maxFileBytes) throw new Refusal('too-large'); // grew since the check
    return Uint8Array.from(bytes); // its own buffer: a cloned Buffer view would carry its pool neighbours
  },

  async write(root, { path: relative, bytes }) {
    if (bytes.byteLength > PROJECT_FILES_LIMITS.maxFileBytes) throw new Refusal('too-large');
    const target = await locate(root, relative);
    const directory = path.dirname(target.real);
    if (!(await stat(directory)).isDirectory()) throw new Refusal('not-a-directory');
    if (target.exists && !(await stat(target.real)).isFile()) throw new Refusal('not-a-file');
    // Write beside the target and rename over it, so a crash leaves the old file or the new one, never a torn one.
    const temporary = path.join(directory, `.${path.basename(target.real)}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, target.real);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return null;
  },

  async mkdir(root, { path: relative }) {
    const target = await locate(root, relative);
    if (target.exists) {
      if (!(await stat(target.real)).isDirectory()) throw new Refusal('exists');
      return null;
    }
    await mkdir(target.real, { recursive: true });
    return null;
  },

  async remove(root, { path: relative, recursive }) {
    const entry = await locateEntry(root, relative);
    if ((await lstat(entry)).isDirectory()) await (recursive ? rm(entry, { recursive: true }) : rmdir(entry));
    else await unlink(entry);
    return null;
  },

  async rename(root, { from, to }) {
    const source = await locateEntry(root, from);
    const target = await locateEntry(root, to);
    await lstat(source);
    if (await lstat(target).then(() => true, () => false)) throw new Refusal('exists');
    // ponytail: a file created at the target between the check above and this call is replaced. Upgrade: link-then-unlink in WP-34.
    await rename(source, target);
    return null;
  },
};

const OP_BY_CHANNEL = new Map<string, ProjectFilesOp>(PROJECT_FILES_OPS.map((op) => [PROJECT_FILES_CHANNEL[op], op]));

interface Folder { id: string; real: string }

/**
 * The real path of a remembered folder if the user's choice still stands: it exists, is a directory, and its real path
 * is the one recorded. A folder that was moved, deleted, or replaced by a link to somewhere else is not the folder that
 * the user chose through the dialog, so it is refused rather than followed.
 */
async function reopenable(entry: RecentEntry): Promise<string> {
  const real = await realpath(entry.path);
  if (real !== entry.path) throw new Refusal('not-found');
  if (!(await stat(real)).isDirectory()) throw new Refusal('not-a-directory');
  return real;
}

/**
 * `chooseDirectory` shows the native dialog for a window and resolves to the chosen path, or null when cancelled.
 * `recent` gives the list of folders remembered across runs, once the main process has one (IDE-008).
 * `handle` is the single entry point behind every IPC channel: it validates the message, finds the window's
 * folder and runs the operation, answering with a typed result.
 */
export function createProjectFiles(chooseDirectory: (ownerId: number) => Promise<string | null>, recent: () => RecentProjects | null = () => null) {
  const folders = new Map<number, Folder>();
  const choosing = new Map<number, Promise<ProjectFolder | null>>();

  /** Makes `real` the window's folder, replacing the previous one. */
  function adopt(ownerId: number, real: string): ProjectFolder {
    const folder = { id: randomUUID(), real };
    folders.set(ownerId, folder);
    return { rootId: folder.id, name: path.basename(real) || 'Project' };
  }

  async function choose(ownerId: number): Promise<ProjectFolder | null> {
    const chosen = await chooseDirectory(ownerId);
    if (chosen === null) return null;
    const real = await realpath(chosen);
    if (!(await stat(real)).isDirectory()) throw new Refusal('not-a-directory');
    return adopt(ownerId, real);
  }

  async function listRecent(): Promise<RecentProject[]> {
    const entries = (await recent()?.list()) ?? [];
    return Promise.all(entries.map(async (entry) => ({
      recentId: entry.id,
      displayName: path.basename(entry.path) || 'Project',
      lastOpenedAt: entry.lastOpenedAt,
      available: await reopenable(entry).then(() => true, () => false),
    })));
  }

  return {
    async handle(ownerId: number, channel: string, args: readonly unknown[]): Promise<ProjectFilesResult<unknown>> {
      try {
        if (channel === PROJECT_FILES_CHANNEL.chooseFolder) {
          if (args.length !== 0) throw new Refusal('invalid-request');
          let flight = choosing.get(ownerId);
          if (!flight) {
            flight = choose(ownerId).finally(() => choosing.delete(ownerId));
            choosing.set(ownerId, flight);
          }
          return { ok: true, value: await flight };
        }
        if (channel === PROJECT_FILES_CHANNEL.listRecent) {
          if (args.length !== 0) throw new Refusal('invalid-request');
          return { ok: true, value: await listRecent() };
        }
        if (channel === PROJECT_FILES_CHANNEL.openRecent) {
          const request = parseRecentRequest('openRecent', args) as RecentRequests['openRecent'] | null;
          if (!request) throw new Refusal('invalid-request');
          const entry = await recent()?.get(request.recentId);
          if (!entry) throw new Refusal('not-found');
          return { ok: true, value: adopt(ownerId, await reopenable(entry)) };
        }
        if (channel === PROJECT_FILES_CHANNEL.forgetRecent) {
          const request = parseRecentRequest('forgetRecent', args) as RecentRequests['forgetRecent'] | null;
          if (!request) throw new Refusal('invalid-request');
          await recent()?.forget(request.recentId);
          return { ok: true, value: null };
        }
        if (channel === PROJECT_FILES_CHANNEL.markOpened) {
          const request = parseRecentRequest('markOpened', args) as RecentRequests['markOpened'] | null;
          if (!request) throw new Refusal('invalid-request');
          const folder = folders.get(ownerId);
          if (!folder || folder.id !== request.rootId) throw new Refusal('no-folder');
          await recent()?.record(folder.real);
          return { ok: true, value: null };
        }
        const op = OP_BY_CHANNEL.get(channel);
        const request = op ? parseProjectFilesRequest(op, args) : null;
        if (!op || !request) throw new Refusal('invalid-request');
        const folder = folders.get(ownerId);
        if (!folder || folder.id !== request.rootId) throw new Refusal('no-folder');
        const run = operations[op] as (root: string, request: unknown) => Promise<unknown>;
        return { ok: true, value: await run(folder.real, request) };
      } catch (error) {
        return { ok: false, code: codeOf(error) };
      }
    },

    /**
     * The real path of the window's folder, for the main process only: Build, Tests and Simulate register it as their
     * workspace (IDE-001) without the renderer ever naming a path. Null unless `rootId` is the id of the window's current folder.
     */
    rootOf(ownerId: number, rootId: string): string | null {
      const folder = folders.get(ownerId);
      return folder !== undefined && folder.id === rootId ? folder.real : null;
    },

    /** Forgets the window's folder: the document changed or the window went away. */
    revokeOwner(ownerId: number): void {
      folders.delete(ownerId);
    },
  };
}
