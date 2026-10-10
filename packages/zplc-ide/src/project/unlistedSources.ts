/**
 * The Structured Text files of a project folder that no build reads (CMP-046): they are neither directly in `src` nor
 * directly in a folder listed under `libraries` of zplc.json. The Tool API finds them on disk when it reads the workspace
 * (`unlistedSources` of the workspace, reported by the build as `SOURCE_NOT_COMPILED`), and Studio finds them in the
 * project tree to mark them; both walk with this one rule, over a listing of a folder that each supplies.
 *
 * The scan is bounded: the folders next to `src` and the folders inside them (two levels), at most 64 folders and 256
 * files. Folders that hold the project's own other things (`src`, `tests`, `build`, `node_modules`, `dist`, `coverage`)
 * are not entered at the top level, a name that starts with "." is skipped, links are never followed, and a listed
 * folder is neither scanned nor entered.
 */

export const UNLISTED_SCAN_FOLDERS = 64;
export const UNLISTED_SCAN_FILES = 256;
export const UNLISTED_SCAN_SKIP: ReadonlySet<string> = new Set(['src', 'tests', 'build', 'node_modules', 'dist', 'coverage']);

export interface ScanEntry { name: string; kind: 'file' | 'directory' | 'link' | 'other' }

/** The entries of the folder at this "/"-separated path ("" is the project folder), or null when it cannot be listed. */
export type ListFolder = (logical: string) => Promise<ScanEntry[] | null>;

/** `listed` is `src` and the library folders: the folders whose files a build reads. */
export async function scanUnlistedSources(list: ListFolder, listed: readonly string[]): Promise<string[]> {
  const found: string[] = [];
  const known = new Set(listed.map((folder) => folder.toLowerCase()));
  let folders = 0;
  const scan = async (logical: string, depth: number): Promise<void> => {
    if (found.length >= UNLISTED_SCAN_FILES || folders >= UNLISTED_SCAN_FOLDERS) return;
    folders += 1;
    const entries = await list(logical);
    if (entries === null) return;
    const ordered = [...entries].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of ordered) {
      const path = logical === '' ? entry.name : `${logical}/${entry.name}`;
      if (entry.kind === 'link' || entry.name.startsWith('.')) continue;
      if (entry.kind === 'file' && /\.st$/i.test(entry.name) && !known.has(logical.toLowerCase())) {
        if (found.length < UNLISTED_SCAN_FILES) found.push(path);
      } else if (entry.kind === 'directory' && depth < 2 && !(depth === 0 && UNLISTED_SCAN_SKIP.has(entry.name.toLowerCase())) && !known.has(path.toLowerCase())) {
        await scan(path, depth + 1);
      }
    }
  };
  await scan('', 0);
  return found;
}
