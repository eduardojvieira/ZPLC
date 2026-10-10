/**
 * Project archives (IDE-022): the channel names, message shapes and validators shared by the main process
 * (`projectArchive.ts`, reached through `projectFiles.ts`) and the renderer (`src/ipc/projectArchiveBridge.ts`). They are
 * operations of the project-files bridge: `PROJECT_FILES_CHANNEL` includes these channels, so the one registration of
 * the project-files handlers, with its sender check, covers them. Pure TypeScript with no Electron or Node import, so
 * both programs can import it; the sandboxed preload repeats the channel names.
 *
 * The renderer never names a path. Exporting takes the opaque id of the window's project folder, and the archive is
 * written where the user chooses in a native save dialog. Importing is two steps, both behind native dialogs: the user
 * chooses an archive, which the main process reads and keeps (the renderer gets a summary and an opaque id), and, once
 * the user has looked at the summary, an empty folder to extract it into.
 */

import { PROJECT_ARCHIVE_CHANNEL } from './ipcContract.js';

/** The channel names are defined once, in `ipcContract.ts`, and re-exported here for the callers that already import them from this module. */
export { PROJECT_ARCHIVE_CHANNEL };
export const PROJECT_ARCHIVE_OPS = ['exportArchive', 'inspectArchive', 'extractArchive'] as const satisfies readonly (keyof typeof PROJECT_ARCHIVE_CHANNEL)[];

/** Folders that are not part of a project: Studio's tree hides them and an archive leaves them out. */
export const PROJECT_ARCHIVE_IGNORED_FOLDERS = ['node_modules', '.git', 'build', 'dist', '.vscode'] as const;

export const PROJECT_ARCHIVE_LIMITS = {
  /** The archive file itself: the entries together may hold 64 MiB (`ZIP_LIMITS.maxTotalBytes`). */
  maxArchiveBytes: 64 * 1024 * 1024,
  /** The `zplc.json` text handed to the renderer for the migration preview. */
  maxManifestBytes: 1024 * 1024,
  maxIdChars: 64,
} as const;

export type ProjectArchiveErrorCode =
  | 'invalid-request' // the message did not match its schema
  | 'no-folder' // no project folder, or a different one since
  | 'not-found' // the archive file, or the id of an archive the main process no longer holds
  | 'not-empty' // the folder chosen to import into holds something
  | 'invalid-path' // a project path the archive cannot carry, or one a platform cannot address
  | 'not-a-zip'
  | 'unsupported' // encrypted, a symbolic link, zip64, an unknown method
  | 'unsafe-path' // an entry that would leave the folder
  | 'duplicate'
  | 'corrupt'
  | 'too-large'
  | 'too-many'
  | 'denied'
  | 'failed';

export type ProjectArchiveResult<T> = { ok: true; value: T } | { ok: false; code: ProjectArchiveErrorCode };

export interface ArchiveExportRequest { rootId: string }
export interface ArchiveExtractRequest { archiveId: string }

/** What an export wrote. `skipped` counts links, which a project does not carry. */
export interface ArchiveExported { fileName: string; fileCount: number; folderCount: number; bytes: number; skipped: number }

/** What the main process read from the archive the user chose: names and sizes, never the files' content. */
export interface ArchiveSummary {
  archiveId: string;
  fileName: string;
  fileCount: number;
  folderCount: number;
  bytes: number;
  files: Array<{ path: string; size: number }>;
  /** The text of the archive's root `zplc.json`, for the migration preview; null when it has none or it is too large. */
  manifest: string | null;
}

export interface ArchiveImported { name: string; fileCount: number }

export type ProjectArchiveBridge = {
  /** `null` when the user cancels the save dialog. */
  exportArchive(request: ArchiveExportRequest): Promise<ProjectArchiveResult<ArchiveExported | null>>;
  /** `null` when the user cancels the open dialog. */
  inspectArchive(): Promise<ProjectArchiveResult<ArchiveSummary | null>>;
  /** `null` when the user cancels the folder dialog. */
  extractArchive(request: ArchiveExtractRequest): Promise<ProjectArchiveResult<ArchiveImported | null>>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const isId = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= PROJECT_ARCHIVE_LIMITS.maxIdChars;

/** `{ rootId }` and nothing else, or null. */
export function parseExportRequest(args: readonly unknown[]): ArchiveExportRequest | null {
  const [request] = args;
  if (args.length !== 1 || !isPlainObject(request) || Object.keys(request).join() !== 'rootId' || !isId(request.rootId)) return null;
  return { rootId: request.rootId };
}

/** `{ archiveId }` and nothing else, or null. */
export function parseExtractRequest(args: readonly unknown[]): ArchiveExtractRequest | null {
  const [request] = args;
  if (args.length !== 1 || !isPlainObject(request) || Object.keys(request).join() !== 'archiveId' || !isId(request.archiveId)) return null;
  return { archiveId: request.archiveId };
}

const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** The summary as the renderer reads it: a fresh object when every field has its type, otherwise null. */
export function parseArchiveSummary(value: unknown): ArchiveSummary | null {
  if (!isPlainObject(value)) return null;
  const { archiveId, fileName, fileCount, folderCount, bytes, files, manifest } = value;
  if (!isId(archiveId) || typeof fileName !== 'string' || !count(fileCount) || !count(folderCount) || !count(bytes)) return null;
  if (manifest !== null && typeof manifest !== 'string') return null;
  if (!Array.isArray(files) || !files.every((file) => isPlainObject(file) && typeof file.path === 'string' && count(file.size))) return null;
  return {
    archiveId, fileName, fileCount, folderCount, bytes, manifest,
    files: files.map((file) => ({ path: (file as { path: string }).path, size: (file as { size: number }).size })),
  };
}

/** The result envelope as the renderer reads it, with the value checked by `parseValue`; anything else is `failed`. */
export function parseArchiveResult<T>(value: unknown, parseValue: (value: unknown) => T | null): ProjectArchiveResult<T | null> {
  if (!isPlainObject(value)) return { ok: false, code: 'failed' };
  if (value.ok === true) {
    if (value.value === null) return { ok: true, value: null };
    const parsed = parseValue(value.value);
    return parsed === null ? { ok: false, code: 'failed' } : { ok: true, value: parsed };
  }
  return { ok: false, code: typeof value.code === 'string' ? (value.code as ProjectArchiveErrorCode) : 'failed' };
}

export const parseArchiveExported = (value: unknown): ArchiveExported | null => {
  if (!isPlainObject(value)) return null;
  const { fileName, fileCount, folderCount, bytes, skipped } = value;
  return typeof fileName === 'string' && count(fileCount) && count(folderCount) && count(bytes) && count(skipped) ? { fileName, fileCount, folderCount, bytes, skipped } : null;
};

export const parseArchiveImported = (value: unknown): ArchiveImported | null => {
  if (!isPlainObject(value)) return null;
  const { name, fileCount } = value;
  return typeof name === 'string' && count(fileCount) ? { name, fileCount } : null;
};
