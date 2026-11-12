/**
 * The program a project shows when it opens with no saved session (SHL-014): the first program of its first task.
 */
import type { FileTreeNode, ProjectFileWithHandle, ZPLCProjectConfig } from '../types';
import { sourceNameKey } from '../utils/fileSystem';

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/**
 * The path, among `files`, of the first program of the first task that is on disk; null when the project has no task or none
 * of the programs of its first task is there. A task names a program by file name ("main.ld" is the file main.ld.json), and
 * a program it names that is not on disk is skipped.
 */
export function entryProgramPath(config: ZPLCProjectConfig | null, files: readonly string[]): string | null {
  for (const program of config?.tasks?.[0]?.programs ?? []) {
    const key = sourceNameKey(program);
    const found = files.find((path) => sourceNameKey(baseName(path)) === key);
    if (found !== undefined) return found;
  }
  return null;
}

function filePaths(node: FileTreeNode): string[] {
  return node.type === 'file' ? [node.path] : (node.children ?? []).flatMap(filePaths);
}

export interface EntryTabs {
  files: Map<string, ProjectFileWithHandle>;
  openTabs: string[];
  activeFileId: string;
}

/**
 * The tab a project opens with when no session was restored (`restored` false), or null: a restored session, empty or not,
 * is never replaced. A file that cannot be read is no tab.
 */
export async function entryTabs(
  restored: boolean,
  config: ZPLCProjectConfig | null,
  tree: FileTreeNode,
  load: (path: string) => Promise<ProjectFileWithHandle | null>,
): Promise<EntryTabs | null> {
  if (restored) return null;
  const path = entryProgramPath(config, filePaths(tree));
  if (path === null) return null;
  try {
    const loaded = await load(path);
    if (!loaded) return null;
    return { files: new Map([[loaded.id, loaded]]), openTabs: [loaded.id], activeFileId: loaded.id };
  } catch {
    return null;
  }
}
