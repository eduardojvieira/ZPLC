/**
 * The renderer's side of the project archives (IDE-022): the three operations of the project-files bridge, with each
 * answer validated again here. A host without them (a browser build, an older preload) is "unavailable"; a dialog the
 * user closes is "cancelled"; a refusal is a sentence that names no path.
 */
import {
  parseArchiveExported,
  parseArchiveImported,
  parseArchiveResult,
  parseArchiveSummary,
  type ArchiveExported,
  type ArchiveImported,
  type ArchiveSummary,
  type ProjectArchiveErrorCode,
} from '../../electron/projectArchiveProtocol';
import type { ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import { t, type MessageKey } from '../i18n';

export type ArchiveOutcome<T> =
  | { status: 'unavailable' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string }
  | { status: 'done'; value: T };

const CODES: readonly string[] = [
  'invalid-request',
  'no-folder',
  'not-found',
  'not-empty',
  'invalid-path',
  'not-a-zip',
  'unsupported',
  'unsafe-path',
  'duplicate',
  'corrupt',
  'too-large',
  'too-many',
  'denied',
  'failed',
];

export const archiveFailureMessage = (code: ProjectArchiveErrorCode): string => t(CODES.includes(code) ? (`archive.${code}` as MessageKey) : 'archive.failed');

async function run<T>(
  call: (() => Promise<unknown>) | undefined,
  parseValue: (value: unknown) => T | null,
): Promise<ArchiveOutcome<T>> {
  if (!call) return { status: 'unavailable' };
  try {
    const answer = parseArchiveResult(await call(), parseValue);
    if (!answer.ok) return { status: 'failed', message: archiveFailureMessage(answer.code) };
    return answer.value === null ? { status: 'cancelled' } : { status: 'done', value: answer.value };
  } catch {
    return { status: 'failed', message: archiveFailureMessage('failed') };
  }
}

/** Writes the open project to an archive the user chooses; `rootId` is the id the main process gave the folder. */
export function exportArchive(bridge: ProjectFilesBridge | undefined, rootId: string): Promise<ArchiveOutcome<ArchiveExported>> {
  const call = bridge?.exportArchive;
  return run(call && (() => call.call(bridge, { rootId })), parseArchiveExported);
}

/** Reads an archive the user chooses; nothing is written, and the answer says what is in it. */
export function inspectArchive(bridge: ProjectFilesBridge | undefined): Promise<ArchiveOutcome<ArchiveSummary>> {
  const call = bridge?.inspectArchive;
  return run(call && (() => call.call(bridge)), parseArchiveSummary);
}

/** Writes the inspected archive into an empty folder the user chooses. */
export function extractArchive(bridge: ProjectFilesBridge | undefined, archiveId: string): Promise<ArchiveOutcome<ArchiveImported>> {
  const call = bridge?.extractArchive;
  return run(call && (() => call.call(bridge, { archiveId })), parseArchiveImported);
}
