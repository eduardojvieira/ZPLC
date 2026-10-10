/**
 * What Studio can tell about an archive before it writes anything (IDE-022): the project it holds, whether Studio
 * opens it, and, for a version 1 project, the difference that migrating its zplc.json makes. It uses the same
 * `parseAndMigrateProject` that opening a folder uses, so the answer here is the answer there.
 */
import type { ArchiveSummary } from '../../electron/projectArchiveProtocol';
import { describeMigration, type MigrationDifference } from './migrationDiff';
import { parseAndMigrateProject } from './projectModel';

export interface ArchiveReview {
  /** Studio opens the folder this archive makes. */
  openable: boolean;
  name: string | null;
  version: string | null;
  schemaVersion: 1 | 2 | null;
  fileCount: number;
  folderCount: number;
  /** What migrating zplc.json changes; null when it needs no migration or the archive is not openable. */
  difference: MigrationDifference | null;
  /** Why the archive is not openable; null when it is. A message never repeats a value from the file. */
  problem: string | null;
}

export function reviewArchive(summary: ArchiveSummary): ArchiveReview {
  const base = { name: null, version: null, schemaVersion: null, fileCount: summary.fileCount, folderCount: summary.folderCount, difference: null } as const;
  if (summary.manifest === null) {
    return { ...base, openable: false, problem: 'The archive has no zplc.json at its root, or it is larger than a project file may be: it is not a ZPLC project.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(summary.manifest);
  } catch {
    return { ...base, openable: false, problem: 'The zplc.json of the archive is not valid JSON.' };
  }
  const result = parseAndMigrateProject(parsed);
  if (!result.ok) {
    const first = result.diagnostics[0];
    return { ...base, openable: false, problem: first ? `Studio would not open this project: ${first.path}: ${first.message}.` : 'Studio would not open this project.' };
  }
  return {
    ...base,
    openable: true,
    name: result.project.name,
    version: result.project.version,
    schemaVersion: result.sourceSchemaVersion,
    difference: result.changed ? describeMigration(summary.manifest, result.project) : null,
    problem: null,
  };
}
