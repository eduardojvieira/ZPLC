/**
 * The classroom setting as the main process holds it (AIX-002, D-32): whether Learn, the assistant and an MCP client may show a
 * lesson's reference solution. Studio mirrors its `hideSolutions` setting here, into one small private file under the user-data
 * directory, and the assistant (`aiProvider.ts`) and `zplc-mcp --user-data` read it from that file, never from a value a page or
 * an agent sends. Writing is atomic (temporary file, then rename), as in `shellPreferences.ts`. Reading fails closed: a missing,
 * corrupt, oversized or foreign file, or no user-data folder at all, means the solutions are hidden.
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export interface LearnPolicy {
  hideSolutions: boolean;
}

export const LEARN_POLICY_FILENAME = 'zplc-learn-policy.v1.json';
const MAX_BYTES = 1024;
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
  if (raw.length > MAX_BYTES) return HIDDEN;
  try {
    return parseLearnPolicy(JSON.parse(raw)) ?? HIDDEN;
  } catch {
    return HIDDEN;
  }
}

/** True unless `<userData>` holds a valid policy that shows the solutions. */
export async function readSolutionsHidden(userDataPath: string | undefined): Promise<boolean> {
  if (!userDataPath) return true;
  try {
    return readLearnPolicy(await readFile(path.join(userDataPath, LEARN_POLICY_FILENAME), 'utf8')).hideSolutions;
  } catch {
    return true;
  }
}

export function createLearnPolicyStore(userDataPath: string) {
  const file = path.join(userDataPath, LEARN_POLICY_FILENAME);
  let writing: Promise<void> = Promise.resolve();
  return {
    /** Writes the mirrored setting; a write that fails leaves the old file in place. */
    save(next: LearnPolicy): void {
      const text = JSON.stringify({ hideSolutions: next.hideSolutions });
      writing = writing.then(async () => {
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(temporary, text, { mode: 0o600 });
          await rename(temporary, file);
        } catch {
          await unlink(temporary).catch(() => undefined);
        }
      });
    },
    /** Read from the file each time, after any write in flight: no copy held here can be changed from outside. */
    async solutionsHidden(): Promise<boolean> {
      await writing;
      return readSolutionsHidden(userDataPath);
    },
    settled(): Promise<void> {
      return writing;
    },
  };
}
