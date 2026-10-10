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

export type ArchiveOutcome<T> =
  | { status: 'unavailable' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string }
  | { status: 'done'; value: T };

const MESSAGES: Record<ProjectArchiveErrorCode, string> = {
  'invalid-request': 'The request was not valid. Try again.',
  'no-folder': 'The project folder is not open any more. Open the project and try again.',
  'not-found': 'The archive could not be found or read. Choose it again.',
  'not-empty': 'The folder is not empty. Choose an empty folder to import into.',
  'invalid-path': 'The project holds a file name that an archive cannot carry on every system.',
  'not-a-zip': 'The file is not a ZPLC project archive (a zip file).',
  unsupported: 'The archive uses something Studio does not read: encryption, a link, or a zip64 archive.',
  'unsafe-path': 'The archive holds a file that would be written outside the project folder, so it was refused.',
  duplicate: 'The archive holds two files with the same name, so it was refused.',
  corrupt: 'The archive is damaged: a file does not match its checksum or declared size.',
  'too-large': 'The archive, or a file in it, is larger than a project may be (64 MiB in all, 16 MiB a file).',
  'too-many': 'The archive holds more files than a project may (4096).',
  denied: 'The operating system refused access to the file or folder.',
  failed: 'The operation failed. Try again.',
};

export const archiveFailureMessage = (code: ProjectArchiveErrorCode): string => MESSAGES[code] ?? MESSAGES.failed;

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
    return { status: 'failed', message: MESSAGES.failed };
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
