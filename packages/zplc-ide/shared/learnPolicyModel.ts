/**
 * The one reader of the classroom setting (AIX-002, D-32): whether Learn, the assistant and an MCP client may show a lesson's
 * reference solution. Studio writes it into `<userData>` (electron/learnPolicy.ts); Studio's main process and
 * `zplc-mcp --user-data` (src/mcp/resources.ts) both read it here, so the rule has one implementation.
 *
 * Reading fails closed: a missing, linked, corrupt, oversized or foreign file, or no user-data folder at all, means the
 * solutions are hidden.
 */
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface LearnPolicy {
  hideSolutions: boolean;
}

export const LEARN_POLICY_FILENAME = 'zplc-learn-policy.v1.json';
/** The largest policy file read, in bytes and in characters. */
export const LEARN_POLICY_MAX_BYTES = 1024;
const HIDDEN: LearnPolicy = { hideSolutions: true };

/** The policy of a value, or null for anything that is not exactly `{ hideSolutions: boolean }`. */
export function parseLearnPolicy(value: unknown): LearnPolicy | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || typeof record.hideSolutions !== 'boolean') return null;
  return { hideSolutions: record.hideSolutions };
}

/** The policy in a file's text; solutions hidden for anything else. */
export function readLearnPolicy(raw: string): LearnPolicy {
  if (raw.length > LEARN_POLICY_MAX_BYTES) return HIDDEN;
  try {
    return parseLearnPolicy(JSON.parse(raw)) ?? HIDDEN;
  } catch {
    return HIDDEN;
  }
}

/** True unless `<userData>` holds a regular, unlinked, small file with a valid policy that shows the solutions. */
export async function readSolutionsHidden(userDataPath: string | undefined): Promise<boolean> {
  if (!userDataPath) return true;
  const file = path.join(userDataPath, LEARN_POLICY_FILENAME);
  try {
    const status = await lstat(file);
    if (!status.isFile() || status.size > LEARN_POLICY_MAX_BYTES) return true;
    return readLearnPolicy(await readFile(file, 'utf8')).hideSolutions;
  } catch {
    return true;
  }
}
