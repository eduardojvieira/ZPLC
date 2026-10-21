/**
 * Why a progress file the learner chose is refused (LRN-032). The parser of `learnProgressModel.ts` answers only that a file
 * is valid or not; the learner needs to know which: too large, not JSON, not a progress file, a version this build does not
 * know (and which), or a progress file of a known version with a part that is damaged. Pure; it reads nothing but the text.
 */
import {
  LEARN_PROGRESS_EXPORT_KIND,
  LEARN_PROGRESS_PREVIOUS_SCHEMA_VERSIONS,
  LEARN_PROGRESS_SCHEMA_VERSION,
  parseImport,
} from '../../shared/learnProgressModel';

export type ProgressFileProblem = 'too-large' | 'not-json' | 'not-progress' | 'unknown-version' | 'malformed';
export type ProgressFileDiagnosis = { ok: true } | { ok: false; problem: ProgressFileProblem; version: number | null };

const LEGACY_VERSION = 1;
const refused = (problem: ProgressFileProblem, version: number | null = null): ProgressFileDiagnosis => ({ ok: false, problem, version });

export function diagnoseProgressFile(text: string): ProgressFileDiagnosis {
  const parsed = parseImport(text);
  if (parsed.ok) return { ok: true };
  if (parsed.reason === 'too-large') return refused('too-large');
  if (parsed.reason === 'not-json') return refused('not-json');
  const value = JSON.parse(text) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return refused('not-progress');
  const { kind, schemaVersion, mastered } = value as Record<string, unknown>;
  const version = typeof schemaVersion === 'number' && Number.isInteger(schemaVersion) ? schemaVersion : null;
  // An export of this release (kind) or the file of the first release (a list of mastered lessons): the version decides what it is.
  if (kind === LEARN_PROGRESS_EXPORT_KIND)
    return version !== null && (version === LEARN_PROGRESS_SCHEMA_VERSION || LEARN_PROGRESS_PREVIOUS_SCHEMA_VERSIONS.includes(version))
      ? refused('malformed', version)
      : refused('unknown-version', version);
  if (Array.isArray(mastered)) return version === LEGACY_VERSION ? refused('malformed', version) : refused('unknown-version', version);
  return refused('not-progress');
}
