/**
 * The sources the editors know the project by (IDE-023): the files the build reads and the files of the library
 * folders, whether or not they are open, with the text of an open file as it is being edited.
 */
import { afterEach, describe, expect, it } from 'bun:test';

import type { FileTreeNode, ProjectFileWithHandle } from '../types';
import { getProjectDeclarations, setProjectDeclarations } from '../project/projectDeclarations';
import { readProjectSources, trackProjectSources, useProjectSources, type TrackedStore } from './projectSources';

const file = (path: string, language: FileTreeNode['language'] = 'ST'): FileTreeNode => ({ id: `file:${path}`, name: path.split('/').at(-1)!, type: 'file', path, language });
const folder = (path: string, children: FileTreeNode[]): FileTreeNode => ({ id: `dir:${path}`, name: path.split('/').at(-1)!, type: 'directory', path, children });
const tree: FileTreeNode = folder('', [
  folder('src', [file('src/Main.st'), file('src/Other.st')]),
  folder('lib', [file('lib/Debounce.st')]),
  folder('docs', [file('docs/Example.st')]),
]);
const DISK: Record<string, string> = {
  'src/Main.st': 'PROGRAM Main\nEND_PROGRAM\n',
  'src/Other.st': 'FUNCTION_BLOCK Other\nEND_FUNCTION_BLOCK\n',
  'lib/Debounce.st': 'FUNCTION_BLOCK Debounce\nEND_FUNCTION_BLOCK\n',
  'docs/Example.st': 'FUNCTION_BLOCK Example\nEND_FUNCTION_BLOCK\n',
};
const loaded = (path: string, content: string): ProjectFileWithHandle => ({ id: `file:${path}`, name: path.split('/').at(-1)!, path, language: 'ST', content, isModified: true, diskContent: DISK[path] ?? '' } as ProjectFileWithHandle);
const reader = (reads: string[] = []) => async (node: FileTreeNode) => { reads.push(node.path); return DISK[node.path]; };

afterEach(() => { setProjectDeclarations([]); useProjectSources.setState({ sources: [], declarations: [] }); });

describe('readProjectSources (IDE-023)', () => {
  it('reads the files of src and of the libraries from disk, and none of the others', async () => {
    const reads: string[] = [];
    const sources = await readProjectSources({ tree, libraries: ['lib'], loaded: new Map(), read: reader(reads) });
    expect(sources.map((source) => source.path)).toEqual(['src/Main.st', 'src/Other.st', 'lib/Debounce.st']);
    expect(reads).toEqual(['src/Main.st', 'src/Other.st', 'lib/Debounce.st']);
  });

  it('takes the text of an open file as it is being edited, without reading it', async () => {
    const reads: string[] = [];
    const edited = 'FUNCTION_BLOCK Other\nVAR_INPUT Go : BOOL; END_VAR\nEND_FUNCTION_BLOCK\n';
    const sources = await readProjectSources({ tree, libraries: [], loaded: new Map([['file:src/Other.st', loaded('src/Other.st', edited)]]), read: reader(reads) });
    expect(sources.find((source) => source.path === 'src/Other.st')?.content).toBe(edited);
    expect(reads).toEqual(['src/Main.st']);
  });

  it('does not take a file for a source of the project because it is open: it must be in src or in a library', async () => {
    const sources = await readProjectSources({ tree, libraries: [], loaded: new Map([['file:docs/Example.st', loaded('docs/Example.st', DISK['docs/Example.st']!)]]), read: reader() });
    expect(sources.map((source) => source.path)).not.toContain('docs/Example.st');
  });

  it('leaves out a file that cannot be read, and goes on', async () => {
    const sources = await readProjectSources({ tree, libraries: ['lib'], loaded: new Map(), read: async (node) => { if (node.path === 'src/Other.st') throw new Error('gone'); return DISK[node.path]; } });
    expect(sources.map((source) => source.path)).toEqual(['src/Main.st', 'lib/Debounce.st']);
  });
});

describe('trackProjectSources (IDE-023)', () => {
  /** A store that holds what the tracker reads, and tells its subscribers what changed. */
  function fakeStore(initial: Partial<ReturnType<TrackedStore['getState']>>) {
    let state = { isProjectOpen: true, fileTree: tree, loadedFiles: new Map<string, ProjectFileWithHandle>(), projectConfig: { name: 'P', version: '1.0.0' } as { name: string; version: string; libraries?: string[] } | null, ...initial };
    const listeners = new Set<(next: typeof state, previous: typeof state) => void>();
    const store: TrackedStore & { set(partial: Partial<typeof state>): void } = {
      getState: () => state,
      subscribe: (listener) => { listeners.add(listener as never); return () => listeners.delete(listener as never); },
      set(partial) { const previous = state; state = { ...state, ...partial }; for (const listener of listeners) listener(state, previous); },
    };
    return store;
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

  it('publishes the declarations of the project to the store and to the editors', async () => {
    const store = fakeStore({});
    const stop = trackProjectSources(store, { read: reader(), delayMs: 1 });
    await settle();
    expect(useProjectSources.getState().declarations.map((group) => group.file)).toEqual(['src/Other.st', 'src/Main.st'].sort());
    expect(getProjectDeclarations().map((entry) => entry.name).sort()).toEqual(['Main', 'Other']);
    stop();
  });

  it('adds the declarations of a library when the configuration names it, and takes them away when it does not', async () => {
    const store = fakeStore({});
    const stop = trackProjectSources(store, { read: reader(), delayMs: 1 });
    await settle();
    expect(getProjectDeclarations().map((entry) => entry.name)).not.toContain('Debounce');
    store.set({ projectConfig: { name: 'P', version: '1.0.0', libraries: ['lib'] } });
    await settle();
    expect(getProjectDeclarations().map((entry) => entry.name)).toContain('Debounce');
    store.set({ projectConfig: { name: 'P', version: '1.0.0' } });
    await settle();
    expect(getProjectDeclarations().map((entry) => entry.name)).not.toContain('Debounce');
    stop();
  });

  it('is empty when no project is open, and after it is stopped it publishes nothing more', async () => {
    const store = fakeStore({ isProjectOpen: false });
    const stop = trackProjectSources(store, { read: reader(), delayMs: 1 });
    await settle();
    expect(getProjectDeclarations()).toEqual([]);
    stop();
    store.set({ isProjectOpen: true });
    await settle();
    expect(getProjectDeclarations()).toEqual([]);
  });
});
