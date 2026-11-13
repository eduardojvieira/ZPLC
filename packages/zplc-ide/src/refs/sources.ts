/**
 * The input of the reference index, read from the project (plan-u2.md, Task R2): the tree, the buffers of the open
 * files (unsaved text wins over the disk, as in the search), the project's Structured Text sources, `zplc.json`, the
 * Watch table and the scenarios. `readReferenceInputFrom` takes everything as arguments and is the testable part;
 * `loadReferenceIndex` reads the stores and keeps the last index while the strings are the same ones.
 */
import { buildProjectIndex, type ProjectFile, type ProjectIndex } from '../langsvc/projectIndex';
import { readSearchableFiles } from '../shell/projectSearch';
import { useProjectSources } from '../store/projectSources';
import type { FileTreeNode, ProjectFileWithHandle } from '../types';
import { loadFileFromTree } from '../utils/fileSystem';
import { buildReferenceIndex, type ReferenceIndex, type ReferenceInput } from './referenceIndex';

/** The most files read, the cap of the project tracker (`MAX_FILES`, store/projectSources.ts). */
const MAX_FILES = 400;
const DIAGRAMS: ReadonlySet<string> = new Set(['LD', 'FBD', 'SFC']);
const SCENARIO = /\.scenario\.json$/i;

export interface ReferenceSources {
  tree: FileTreeNode | null;
  loaded: ReadonlyMap<string, ProjectFileWithHandle>;
  /** The Structured Text files the build reads, as the project tracker last read them. */
  sources: readonly ProjectFile[];
  config: ReferenceInput['config'];
  watch: readonly string[];
  read: (node: FileTreeNode) => Promise<string>;
}

let lastSt: { files: readonly ProjectFile[]; index: ProjectIndex } | undefined;
/** The index of the sources, the previous one when no path or text changed. */
function indexOf(files: readonly ProjectFile[]): ProjectIndex {
  const same =
    lastSt &&
    lastSt.files.length === files.length &&
    files.every((f, i) => f.path === lastSt!.files[i]!.path && f.content === lastSt!.files[i]!.content);
  if (same) return lastSt!.index;
  lastSt = { files, index: buildProjectIndex(files) };
  return lastSt.index;
}

export async function readReferenceInputFrom({ tree, loaded, sources, config, watch, read }: ReferenceSources): Promise<ReferenceInput> {
  const nodes: FileTreeNode[] = [];
  const visit = (node: FileTreeNode): void => {
    if (node.type === 'file') {
      if ((node.language && DIAGRAMS.has(node.language)) || SCENARIO.test(node.path)) nodes.push(node);
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  if (tree) visit(tree);
  // Structured Text and Instruction List: what the search reads. The diagrams and scenarios are read here until the
  // search reads them too (Task R3 widens its languages).
  const text = await readSearchableFiles({ tree, loaded, read });
  const others = (
    await Promise.all(
      nodes.slice(0, MAX_FILES).map(async (node) => {
        const open = loaded.get(node.id);
        try {
          return { node, content: open ? open.content : await read(node) };
        } catch {
          return null;
        }
      }),
    )
  ).filter((file): file is { node: FileTreeNode; content: string } => file !== null);
  const language = new Map<string, string>();
  const visitLanguages = (node: FileTreeNode): void => {
    if (node.language) language.set(node.path, node.language);
    node.children?.forEach(visitLanguages);
  };
  if (tree) visitLanguages(tree);
  return {
    st: indexOf(sources),
    files: [
      ...text.map((f) => ({ ...f, language: language.get(f.path) ?? 'ST' })),
      ...others
        .filter((f) => !SCENARIO.test(f.node.path))
        .map((f) => ({ path: f.node.path, language: f.node.language!, content: f.content })),
    ],
    config,
    watch,
    scenarios: others.filter((f) => SCENARIO.test(f.node.path)).map((f) => ({ path: f.node.path, content: f.content })),
  };
}

export async function readReferenceInput(): Promise<ReferenceInput> {
  // loaded on demand: the application store pulls in the bundled projects, which a unit test of the pure part does not need
  const { useIDEStore } = await import('../store/useIDEStore');
  const state = useIDEStore.getState();
  return readReferenceInputFrom({
    tree: state.fileTree,
    loaded: state.loadedFiles,
    sources: useProjectSources.getState().sources.map(({ path, content }) => ({ path, content })),
    config: state.projectConfig,
    watch: state.debug.watchVariables,
    read: async (node) => {
      const file = await loadFileFromTree(node);
      if (!file) throw new Error('unreadable');
      return file.content;
    },
  });
}

let lastIndex: { input: ReferenceInput; index: ReferenceIndex } | undefined;
const sameStrings = (a: ReadonlyArray<{ path: string; content: string }>, b: ReadonlyArray<{ path: string; content: string }>): boolean =>
  a.length === b.length && a.every((f, i) => f.path === b[i]!.path && f.content === b[i]!.content);
/** The index of the input, the previous one when the project's strings are the same ones: a second query is free. */
export function referenceIndexFor(input: ReferenceInput): ReferenceIndex {
  const last = lastIndex?.input;
  if (
    last &&
    last.st === input.st &&
    last.config === input.config &&
    last.watch.length === input.watch.length &&
    last.watch.every((w, i) => w === input.watch[i]) &&
    sameStrings(last.files, input.files) &&
    sameStrings(last.scenarios, input.scenarios)
  ) {
    return lastIndex!.index;
  }
  lastIndex = { input, index: buildReferenceIndex(input) };
  return lastIndex.index;
}

export async function loadReferenceIndex(): Promise<ReferenceIndex> {
  return referenceIndexFor(await readReferenceInput());
}
