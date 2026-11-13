/**
 * The tests of a project (TST-001): the `tests/*.scenario.json` files, listed from the project folder with their id and their
 * expectations. The file tree of the explorer does not hold them, so the folder is read here. Tolerant: a file that cannot be
 * read or parsed is listed as not valid, never an exception.
 */
import type { ProjectTest } from './contracts';

const SCENARIO_FILE = /\.scenario\.json$/i;
const TESTS_FOLDER = 'tests';
/** The limit of `cli/workspace.ts` (`SCENARIOS_MAX_COUNT`): the build reads no more. */
export const PROJECT_TESTS_LIMIT = 64;

type FolderEntry = { kind: string; name: string; getFile?: () => Promise<{ text: () => Promise<string> }> };
/** The part of a folder handle this module needs, so that a test needs no browser. */
export interface TestsRoot {
  getDirectoryHandle(name: string): Promise<{ values(): AsyncIterable<FolderEntry> }>;
}
/** The text a scenario file has in an editor, by project path: unsaved edits win over the disk. */
export type OpenBuffers = ReadonlyMap<string, string>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function readTest(path: string, text: string): ProjectTest {
  const invalid: ProjectTest = { path, id: path.replace(/^.*\//, '').replace(SCENARIO_FILE, ''), expectations: [], valid: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid;
  }
  if (!isRecord(parsed) || typeof parsed.id !== 'string' || parsed.id === '' || !Array.isArray(parsed.expectations)) return invalid;
  const expectations = parsed.expectations.flatMap((item, index): ProjectTest['expectations'] => {
    if (!isRecord(item) || typeof item.kind !== 'string') return [];
    const at = typeof item.atMs === 'number' ? item.atMs : typeof item.fromMs === 'number' ? item.fromMs : undefined;
    return [{ index, kind: item.kind, ...(at === undefined ? {} : { atMs: at }) }];
  });
  return { path, id: parsed.id, expectations, valid: true };
}

export async function listProjectTests(root: TestsRoot | null, open: OpenBuffers = new Map()): Promise<ProjectTest[]> {
  if (!root) return [];
  let folder: Awaited<ReturnType<TestsRoot['getDirectoryHandle']>>;
  try {
    folder = await root.getDirectoryHandle(TESTS_FOLDER);
  } catch {
    return [];
  }
  const found: Array<{ path: string; read: () => Promise<string> }> = [];
  try {
    for await (const entry of folder.values()) {
      if (entry.kind !== 'file' || !SCENARIO_FILE.test(entry.name) || !entry.getFile) continue;
      const getFile = entry.getFile.bind(entry);
      found.push({ path: `${TESTS_FOLDER}/${entry.name}`, read: async () => (await getFile()).text() });
    }
  } catch {
    return [];
  }
  found.sort((a, b) => a.path.localeCompare(b.path));
  return Promise.all(
    found.slice(0, PROJECT_TESTS_LIMIT).map(async ({ path, read }) => {
      const buffer = open.get(path);
      try {
        return readTest(path, buffer ?? (await read()));
      } catch {
        return readTest(path, '');
      }
    }),
  );
}
