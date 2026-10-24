/**
 * The one definition of a file the assistant may read and propose a change to (IDE-030): a program in one of the five
 * languages directly in `src`, and, for a proposal, the manifest `zplc.json`. The main process, the request validator and
 * the renderer share it; it imports nothing so every bundle can take it.
 */

export type CandidateLanguage = 'ST' | 'IL' | 'LD' | 'FBD' | 'SFC';

/** The most files one change set may hold. */
export const CANDIDATE_CHANGE_CAP = 4;
export const CANDIDATE_PATH_MAX_LENGTH = 512;

export const isCandidateSourcePathPattern = /^src\/[^/\\\0\r\n]+\.(st|il|ld\.json|fbd\.json|sfc\.json)$/;

export function isCandidateSourcePath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= CANDIDATE_PATH_MAX_LENGTH && isCandidateSourcePathPattern.test(path);
}

/** A path a change set may name: a program source, or the manifest. */
export function isCandidateChangePath(path: unknown): path is string {
  return path === 'zplc.json' || isCandidateSourcePath(path);
}

export function candidateLanguageOf(path: string): CandidateLanguage | undefined {
  if (!isCandidateSourcePath(path)) return undefined;
  if (path.endsWith('.st')) return 'ST';
  if (path.endsWith('.il')) return 'IL';
  if (path.endsWith('.ld.json')) return 'LD';
  return path.endsWith('.fbd.json') ? 'FBD' : 'SFC';
}
