/**
 * Project archives owned by the main process (IDE-022): export the window's project folder to one zip, and import a
 * zip into an empty folder.
 *
 * The renderer holds no path. An export is asked with the opaque id of the window's folder; where the archive goes is
 * the user's answer to a native save dialog. An import is two requests: `inspect` opens a native dialog for the archive
 * and keeps what it read here, answering a summary and an id; `extract` takes that id, asks for an empty folder in a
 * native dialog and writes the files. The folder is then offered once to the window's next "choose folder", so the
 * project opens through the same code as any other, with its session, recent entry and watcher.
 *
 * Nothing is written before the user has seen the summary, and an extraction that fails leaves the folder empty again:
 * it was verified empty first, so everything in it is ours to remove.
 */
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  PROJECT_ARCHIVE_CHANNEL,
  PROJECT_ARCHIVE_IGNORED_FOLDERS,
  PROJECT_ARCHIVE_LIMITS,
  parseExportRequest,
  parseExtractRequest,
  type ArchiveExported,
  type ArchiveImported,
  type ArchiveSummary,
  type ProjectArchiveErrorCode,
  type ProjectArchiveResult,
} from './projectArchiveProtocol.js';
import { readZip, writeZip, ZIP_LIMITS, ZipError, type ZipEntry } from './projectArchiveZip.js';

export interface ProjectArchiveDeps {
  /** The real path of the window's project folder when `rootId` is its current id (`projectFiles.rootOf`). */
  rootOf(ownerId: number, rootId: string): string | null;
  dialogs: {
    saveFile(ownerId: number, defaultName: string): Promise<string | null>;
    openFile(ownerId: number): Promise<string | null>;
    chooseFolder(ownerId: number): Promise<string | null>;
  };
  now?: () => number;
}

class Refusal extends Error {
  readonly code: ProjectArchiveErrorCode;
  constructor(code: ProjectArchiveErrorCode) {
    super(code);
    this.code = code;
  }
}

const ERRNO_CODES: Record<string, ProjectArchiveErrorCode> = {
  ENOENT: 'not-found',
  EACCES: 'denied',
  EPERM: 'denied',
  EROFS: 'denied',
  ENOTEMPTY: 'not-empty',
  ENAMETOOLONG: 'invalid-path',
};

function codeOf(error: unknown): ProjectArchiveErrorCode {
  if (error instanceof Refusal || error instanceof ZipError) return error.code;
  const errno = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return ERRNO_CODES[errno] ?? 'failed';
}

/** How long an imported folder waits to be opened before the window's next folder dialog is a real dialog again. */
const IMPORTED_FOLDER_TTL_MS = 30_000;
const IGNORED = new Set<string>(PROJECT_ARCHIVE_IGNORED_FOLDERS);

interface Collected {
  entries: ZipEntry[];
  skipped: number;
}

/** The files and folders of a project folder, as archive entries; links are skipped, not followed. */
async function collectProject(root: string): Promise<Collected> {
  const entries: ZipEntry[] = [];
  let skipped = 0;
  const visit = async (directory: string, prefix: string): Promise<void> => {
    for (const name of (await readdir(directory)).sort()) {
      const absolute = path.join(directory, name);
      const relative = `${prefix}${name}`;
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) {
        skipped += 1;
        continue;
      }
      if (info.isDirectory()) {
        if (IGNORED.has(name)) continue;
        if (entries.length >= ZIP_LIMITS.maxEntries) throw new Refusal('too-many');
        entries.push({ path: `${relative}/`, kind: 'directory', bytes: new Uint8Array(0) });
        await visit(absolute, `${relative}/`);
      } else if (info.isFile()) {
        if (info.size > ZIP_LIMITS.maxFileBytes) throw new Refusal('too-large');
        if (entries.length >= ZIP_LIMITS.maxEntries) throw new Refusal('too-many');
        entries.push({ path: relative, kind: 'file', bytes: new Uint8Array(await readFile(absolute)) });
      } else {
        skipped += 1; // a socket, a device: not a project file
      }
    }
  };
  await visit(root, '');
  return { entries, skipped };
}

export function createProjectArchive(deps: ProjectArchiveDeps) {
  const now = deps.now ?? Date.now;
  /** What `inspect` read, per window: one archive at a time, replaced by the next inspection. */
  const pending = new Map<number, { id: string; fileName: string; entries: ZipEntry[] }>();
  /** The folder an import wrote, waiting for the window's next folder dialog. */
  const imported = new Map<number, { folder: string; at: number }>();

  async function exportArchive(ownerId: number, args: readonly unknown[]): Promise<ArchiveExported | null> {
    const request = parseExportRequest(args);
    if (!request) throw new Refusal('invalid-request');
    const root = deps.rootOf(ownerId, request.rootId);
    if (root === null) throw new Refusal('no-folder');
    const { entries, skipped } = await collectProject(root);
    const bytes = writeZip(entries);
    // An archive that this reader would refuse is no archive: say so now, not when someone tries to import it.
    try {
      readZip(bytes);
    } catch (error) {
      throw error instanceof ZipError && error.code === 'unsafe-path' ? new Refusal('invalid-path') : error;
    }
    let target = await deps.dialogs.saveFile(ownerId, `${path.basename(root) || 'project'}.zplc.zip`);
    if (target === null) return null;
    if (path.extname(target) === '') target = `${target}.zip`;
    await writeFile(target, bytes);
    return {
      fileName: path.basename(target),
      fileCount: entries.filter((entry) => entry.kind === 'file').length,
      folderCount: entries.filter((entry) => entry.kind === 'directory').length,
      bytes: bytes.length,
      skipped,
    };
  }

  async function inspectArchive(ownerId: number, args: readonly unknown[]): Promise<ArchiveSummary | null> {
    if (args.length !== 0) throw new Refusal('invalid-request');
    const chosen = await deps.dialogs.openFile(ownerId);
    if (chosen === null) return null;
    const info = await stat(chosen);
    if (!info.isFile()) throw new Refusal('not-found');
    if (info.size > PROJECT_ARCHIVE_LIMITS.maxArchiveBytes) throw new Refusal('too-large');
    const entries = readZip(new Uint8Array(await readFile(chosen)));
    const manifest = entries.find((entry) => entry.path === 'zplc.json' && entry.kind === 'file');
    const files = entries.filter((entry) => entry.kind === 'file');
    const summary: ArchiveSummary = {
      archiveId: randomUUID(),
      fileName: path.basename(chosen),
      fileCount: files.length,
      folderCount: entries.length - files.length,
      bytes: info.size,
      files: files.map((entry) => ({ path: entry.path, size: entry.bytes.length })),
      manifest:
        manifest && manifest.bytes.length <= PROJECT_ARCHIVE_LIMITS.maxManifestBytes ? new TextDecoder().decode(manifest.bytes) : null,
    };
    pending.set(ownerId, { id: summary.archiveId, fileName: summary.fileName, entries });
    return summary;
  }

  async function extractArchive(ownerId: number, args: readonly unknown[]): Promise<ArchiveImported | null> {
    const request = parseExtractRequest(args);
    if (!request) throw new Refusal('invalid-request');
    const held = pending.get(ownerId);
    if (!held || held.id !== request.archiveId) throw new Refusal('not-found');
    const chosen = await deps.dialogs.chooseFolder(ownerId);
    if (chosen === null) return null;
    const destination = await realpath(chosen);
    if (!(await stat(destination)).isDirectory()) throw new Refusal('not-found');
    if ((await readdir(destination)).length > 0) throw new Refusal('not-empty');
    pending.delete(ownerId);
    try {
      for (const entry of held.entries) {
        const target = path.join(destination, ...entry.path.split('/').filter((segment) => segment !== ''));
        if (entry.kind === 'directory') {
          await mkdir(target, { recursive: true });
          continue;
        }
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, entry.bytes, { flag: 'wx' });
      }
    } catch (error) {
      for (const name of await readdir(destination).catch(() => [] as string[]))
        await rm(path.join(destination, name), { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
    imported.set(ownerId, { folder: destination, at: now() });
    return { name: path.basename(destination) || 'Project', fileCount: held.entries.filter((entry) => entry.kind === 'file').length };
  }

  const operations: Record<string, (ownerId: number, args: readonly unknown[]) => Promise<unknown>> = {
    [PROJECT_ARCHIVE_CHANNEL.exportArchive]: exportArchive,
    [PROJECT_ARCHIVE_CHANNEL.inspectArchive]: inspectArchive,
    [PROJECT_ARCHIVE_CHANNEL.extractArchive]: extractArchive,
  };

  return {
    /** The single entry point behind every archive channel: a typed result, never a path or an operating-system message. */
    async handle(ownerId: number, channel: string, args: readonly unknown[]): Promise<ProjectArchiveResult<unknown>> {
      try {
        const operation = operations[channel];
        if (!operation) throw new Refusal('invalid-request');
        return { ok: true, value: await operation(ownerId, args) };
      } catch (error) {
        return { ok: false, code: codeOf(error) };
      }
    },

    /** The folder the window's last import wrote, once and only while it is fresh; null otherwise. */
    takeImportedFolder(ownerId: number): string | null {
      const entry = imported.get(ownerId);
      imported.delete(ownerId);
      return entry !== undefined && now() - entry.at <= IMPORTED_FOLDER_TTL_MS ? entry.folder : null;
    },

    /** The window went away or its document changed: what it had is not anyone's any more. */
    revokeOwner(ownerId: number): void {
      pending.delete(ownerId);
      imported.delete(ownerId);
    },
  };
}
