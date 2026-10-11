/**
 * The sources the editors know the project by (IDE-023): the Structured Text files the build reads (directly in `src`)
 * and those of the library folders, whether or not they are open, with an open file as it is being edited. From them
 * come the declarations that the project tree lists, that the FBD and LD palettes place, and that ST completion and
 * hover offer. (The palettes also take any other file the editor has loaded, as they always did.)
 *
 * The tracker follows the project store: it reads the files that are not loaded when the tree or the libraries
 * change, and re-parses when an open file does, a moment after the typing stops.
 */
import { create } from 'zustand';
import { projectDeclarations, setProjectDeclarations, type FileDeclarations } from '../project/projectDeclarations';
import { configuredLibraries, projectSourceFiles, unlistedSourceFiles } from '../project/libraries';
import { loadFileFromTree } from '../utils/fileSystem';
import { setCurrentProject } from '../langsvc/session';
import type { FileTreeNode, ProjectFileWithHandle } from '../types';

export interface ProjectSource { path: string; name: string; content: string; language: string }

interface ProjectSourcesState {
  sources: ProjectSource[];
  declarations: FileDeclarations[];
  /** Structured Text files of the project that no build reads: not in `src`, not directly in a library folder. */
  unlisted: string[];
}

export const useProjectSources = create<ProjectSourcesState>(() => ({ sources: [], declarations: [], unlisted: [] }));

/** The most files read for the declarations of a project: far above a PLC project, and a bound on a folder of generated files. */
const MAX_FILES = 400;
const SETTLE_MS = 250;

export interface ReadProjectSourcesInput {
  tree: FileTreeNode | null;
  libraries: readonly string[];
  loaded: ReadonlyMap<string, ProjectFileWithHandle>;
  read: (node: FileTreeNode) => Promise<string>;
}

export async function readProjectSources({ tree, libraries, loaded, read }: ReadProjectSourcesInput): Promise<ProjectSource[]> {
  const nodes = projectSourceFiles(tree, libraries).slice(0, MAX_FILES);
  const found = new Map<string, ProjectSource>();
  const results = await Promise.all(nodes.map(async (node): Promise<ProjectSource | null> => {
    const open = loaded.get(node.id);
    if (open) return { path: node.path, name: node.name, content: open.content, language: 'ST' };
    try {
      return { path: node.path, name: node.name, content: await read(node), language: 'ST' };
    } catch {
      return null;
    }
  }));
  for (const source of results) if (source) found.set(source.path, source);
  return [...found.values()];
}

export interface TrackedState {
  isProjectOpen: boolean;
  fileTree: FileTreeNode | null;
  loadedFiles: ReadonlyMap<string, ProjectFileWithHandle>;
  projectConfig: object | null;
  /** The identity of the open project session; the language service names its files by it. */
  projectSession?: number;
}

export interface TrackedStore {
  getState(): TrackedState;
  subscribe(listener: (state: TrackedState, previous: TrackedState) => void): () => void;
}

const readFromDisk = async (node: FileTreeNode): Promise<string> => {
  const file = await loadFileFromTree(node);
  if (!file) throw new Error('unreadable');
  return file.content;
};

/** Starts following the store; returns the function that stops it. */
export function trackProjectSources(
  store: TrackedStore,
  options: { read?: (node: FileTreeNode) => Promise<string>; delayMs?: number } = {},
): () => void {
  const read = options.read ?? readFromDisk;
  const delay = options.delayMs ?? SETTLE_MS;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const publish = (sources: ProjectSource[], unlisted: string[] = [], session = 0) => {
    const declarations = projectDeclarations(sources);
    useProjectSources.setState({ sources, declarations, unlisted });
    setProjectDeclarations(declarations.flatMap((group) => group.declarations));
    // the language service reads the same files: its index is the project with the buffer of the editor in place
    setCurrentProject(sources.map(({ path, content }) => ({ path, content })), session);
  };

  const run = async () => {
    const mine = ++generation;
    const { isProjectOpen, fileTree, loadedFiles, projectConfig, projectSession } = store.getState();
    if (!isProjectOpen || !fileTree) { publish([]); return; }
    const libraries = configuredLibraries(projectConfig);
    const [sources, unlisted] = await Promise.all([
      readProjectSources({ tree: fileTree, libraries, loaded: loadedFiles, read }),
      unlistedSourceFiles(fileTree, libraries),
    ]);
    if (!stopped && mine === generation) publish(sources, unlisted, projectSession ?? 0);
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { void run(); }, delay);
  };

  const unsubscribe = store.subscribe((state, previous) => {
    if (state.isProjectOpen !== previous.isProjectOpen || state.fileTree !== previous.fileTree
      || state.loadedFiles !== previous.loadedFiles || state.projectConfig !== previous.projectConfig) schedule();
  });
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    publish([]);
  };
}

