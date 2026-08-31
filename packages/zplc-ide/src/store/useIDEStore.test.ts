import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, mock } from 'bun:test';

import { DEFAULT_DEBUG_POLLING_INTERVAL_MS } from './debugDefaults';
import { WATCH_FORCE_STATE, type WatchForceEntry } from '../runtime/debugAdapter';
import type { NativeTraceSample } from '../runtime/nativeTrace';
import { DEFAULT_ZPLC_CONFIG, type FileTreeNode } from '../types';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

const migrationPreview = {
  sourceSchemaVersion: 1 as const,
  targetSchemaVersion: 2 as const,
  changes: [{ op: 'add' as const, path: '/schemaVersion' }],
};
let loadedExample: { zplcConfig: typeof DEFAULT_ZPLC_CONFIG; migrationPreview: null } | null = null;
let loadedExampleAssets: Array<{ path: string; content: string }> | null = null;
mock.module('../utils/projectLoader', () => ({
  getAvailableProjects: () => [],
  loadProject: () => loadedExample,
  loadProjectAssets: () => loadedExampleAssets,
}));

const { useIDEStore } = await import('./useIDEStore');

describe('useIDEStore workspace-test boundary', () => {
  it('does not promise automatic workspace-test registration from browser folder handles', () => {
    const source = readFileSync(join(import.meta.dir, 'useIDEStore.ts'), 'utf8');

    expect(source).not.toContain('autoLinkWorkspaceTests');
    expect(source).not.toContain('registerProjectFile');
  });
});

describe('useIDEStore canonical saved-build evidence', () => {
  it('publishes only the current linked session/run and clears a relink', () => {
    useIDEStore.setState({
      isProjectOpen: true, isVirtualProject: false, projectSession: 77, compilerRunId: 9,
      workspaceScenarioLink: { workspaceId: 'workspace-token', projectSession: 77 }, canonicalWorkspaceBuildEvidence: null,
    });
    const evidence = { projectSession: 77, compilerRunId: 9, workspaceId: 'workspace-token', zplc: { kind: 'zplc' as const, sha256: 'a'.repeat(64), byteLength: 1 } };
    expect(useIDEStore.getState().recordCanonicalWorkspaceBuildEvidence(evidence)).toBe(true);
    expect(useIDEStore.getState().canonicalWorkspaceBuildEvidence).toEqual(evidence);
    expect(useIDEStore.getState().recordCanonicalWorkspaceBuildEvidence({ ...evidence, compilerRunId: 10 })).toBe(false);
    expect(useIDEStore.getState().linkWorkspaceScenarios('replacement-token', 77)).toBe(true);
    expect(useIDEStore.getState().canonicalWorkspaceBuildEvidence).toBeNull();
  });
});

function replaceProject(name = 'replacement') {
  const current = useIDEStore.getState();
  useIDEStore.setState({
    isProjectOpen: true, isVirtualProject: true, projectName: name, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name },
    projectMigrationPreview: null, directoryHandle: { name } as FileSystemDirectoryHandle,
    fileTree: { id: 'dir:/', name, type: 'directory', path: '/', children: [] }, loadedFiles: new Map(), activeFileId: null, openTabs: [],
    projectSession: current.projectSession + 1, workspaceScenarioLink: null, projectConfigDirty: false,
    compilerMessages: [], compilerMessagesChecked: false, compilerNavigationTarget: null, compilerRunId: current.compilerRunId + 1,
  });
}

describe('useIDEStore debug defaults', () => {
  it('uses a responsive live polling interval by default', () => {
    expect(DEFAULT_DEBUG_POLLING_INTERVAL_MS).toBe(100);
  });
});

describe('useIDEStore native trace', () => {
  const sample: NativeTraceSample = {
    source: 'native', uptimeMs: 1, cycles: 2, state: 'paused', pc: 3, error: 0, overruns: 0,
    opi: [0, 0, 0, 0, 0, 0, 0, 0], forceCount: 0, compilerRunId: 0, receivedAtMs: 0,
  };

  it('appends bounded samples and clears them with the debug session', () => {
    const state = useIDEStore.getState();
    state.clearNativeTrace();
    state.appendNativeTrace(sample);
    expect(useIDEStore.getState().debug.nativeTrace).toEqual([sample]);

    state.clearNativeTrace();
    expect(useIDEStore.getState().debug.nativeTrace).toEqual([]);
  });
});

describe('useIDEStore forced-value evidence', () => {
  const force: WatchForceEntry = {
    path: 'Motor.Enable', address: 16, size: 1, type: 'BOOL', bytesHex: '01', state: WATCH_FORCE_STATE.FORCED,
  };

  it('marks retained force evidence unconfirmed without losing its payload', () => {
    const state = useIDEStore.getState();
    state.clearForcedValues();
    state.setForcedValue(force);
    state.markForcedValuesUnconfirmed();

    const debug = useIDEStore.getState().debug;
    expect(debug.forcesUnconfirmed).toBe(true);
    expect(debug.forcedValues.get(force.path)).toEqual({ ...force, state: WATCH_FORCE_STATE.UNCONFIRMED });
  });

  it('clears forced values only through authoritative reconciliation', () => {
    const state = useIDEStore.getState();
    state.clearForcedValues();
    state.markForcedValuesUnconfirmed();
    expect(useIDEStore.getState().debug).toMatchObject({ forcesUnconfirmed: true });
    expect(useIDEStore.getState().debug.forcedValues.size).toBe(0);
    state.clearForcedValues();

    expect(useIDEStore.getState().debug).toMatchObject({ forcesUnconfirmed: false });
    expect(useIDEStore.getState().debug.forcedValues.size).toBe(0);
  });

  it('does not treat removing or clearing watches as releasing PLC forces', () => {
    const state = useIDEStore.getState();
    state.clearForcedValues();
    state.setForcedValue(force);
    state.markForcedValuesUnconfirmed();
    state.addWatchVariable(force.path);
    state.removeWatchVariable(force.path);
    state.clearWatchVariables();

    const debug = useIDEStore.getState().debug;
    expect(debug.forcedValues.get(force.path)?.state).toBe(WATCH_FORCE_STATE.UNCONFIRMED);
    expect(debug.forcesUnconfirmed).toBe(true);
  });

  it('blocks project close until retained force evidence is authoritatively cleared', () => {
    const state = useIDEStore.getState();
    state.clearForcedValues();
    state.setForcedValue(force);
    state.markForcedValuesUnconfirmed();
    useIDEStore.setState({ isProjectOpen: true, activeConsoleTab: 'output', isConsoleCollapsed: true });
    state.closeProject();

    let current = useIDEStore.getState();
    const debug = current.debug;
    expect(current.isProjectOpen).toBe(true);
    expect(current.activeConsoleTab).toBe('watch');
    expect(current.isConsoleCollapsed).toBe(false);
    expect(debug.forcedValues.get(force.path)?.state).toBe(WATCH_FORCE_STATE.UNCONFIRMED);
    expect(debug.forcesUnconfirmed).toBe(true);
    expect(current.consoleEntries.at(-1)?.message).toBe('Release or verify all forces before closing the project.');

    current.clearForcedValues();
    current.closeProject();
    current = useIDEStore.getState();
    expect(current.isProjectOpen).toBe(false);
  });

  it('blocks project close for an empty but unconfirmed force state', () => {
    const state = useIDEStore.getState();
    state.clearForcedValues();
    state.markForcedValuesUnconfirmed();
    useIDEStore.setState({ isProjectOpen: true, activeConsoleTab: 'output', isConsoleCollapsed: true });
    state.closeProject();

    const current = useIDEStore.getState();
    expect(current.isProjectOpen).toBe(true);
    expect(current.debug.forcedValues.size).toBe(0);
    expect(current.debug.forcesUnconfirmed).toBe(true);
    expect(current.activeConsoleTab).toBe('watch');
    expect(current.isConsoleCollapsed).toBe(false);
    current.clearForcedValues();
  });
});

describe('useIDEStore compiler problem status', () => {
  it('returns to the unbuilt state when compiler problems are cleared', () => {
    const initial = useIDEStore.getState();

    initial.clearCompilerMessages();
    expect(useIDEStore.getState().compilerMessagesChecked).toBe(false);

    initial.markCompilerMessagesChecked();
    expect(useIDEStore.getState().compilerMessagesChecked).toBe(true);

    initial.clearCompilerMessages();
    initial.addCompilerMessage({ type: 'error', message: 'Invalid expression' });
    expect(useIDEStore.getState().compilerMessagesChecked).toBe(true);

    initial.clearCompilerMessages();
    expect(useIDEStore.getState()).toMatchObject({
      compilerMessages: [],
      compilerMessagesChecked: false,
    });

    initial.markCompilerMessagesChecked();
    initial.addCompilerMessage({ type: 'warning', message: 'Unused variable' });
    initial.closeProject();
    expect(useIDEStore.getState()).toMatchObject({
      compilerMessages: [],
      compilerMessagesChecked: false,
    });
  });

  it('invalidates stale diagnostics after any source edit', () => {
    const state = useIDEStore.getState();
    state.clearCompilerMessages();
    const runBeforeEdit = useIDEStore.getState().compilerRunId;
    const file = { id: 'file-src-Motor-st', name: 'Motor.st', path: 'src/Motor.st', parentPath: 'src', language: 'ST' as const, content: 'PROGRAM Motor END_PROGRAM', isModified: false };
    useIDEStore.setState({ loadedFiles: new Map([[file.id, file]]) });
    state.addCompilerMessage({ type: 'error', message: 'old', file: 'src/Motor.st', line: 1, column: 1 });
    state.updateFileContent(file.id, 'PROGRAM Motor\n@\nEND_PROGRAM');
    expect(useIDEStore.getState()).toMatchObject({ compilerMessages: [], compilerMessagesChecked: false });
    expect(useIDEStore.getState().compilerRunId).toBe(runBeforeEdit + 1);

    const runBeforeClear = useIDEStore.getState().compilerRunId;
    state.clearCompilerMessages();
    expect(useIDEStore.getState().compilerRunId).toBe(runBeforeClear + 1);
  });

  it('navigates only to an exact loaded source and preserves newer navigation targets', async () => {
    const file = { id: 'file-src-Motor-st', name: 'Motor.st', path: 'src/Motor.st', parentPath: 'src', language: 'ST' as const, content: 'PROGRAM Motor END_PROGRAM', isModified: false };
    const tree = { id: 'root', name: '', path: '', type: 'directory' as const, children: [{ id: file.id, name: file.name, path: file.path, type: 'file' as const, language: 'ST' as const }] };
    useIDEStore.setState({ fileTree: tree, loadedFiles: new Map([[file.id, file]]), activeFileId: null, openTabs: [], showSettings: true, compilerNavigationTarget: null });
    const state = useIDEStore.getState();
    await expect(state.navigateToCompilerDiagnostic('src/Motor.st', 2, 3)).resolves.toBe(true);
    const first = useIDEStore.getState().compilerNavigationTarget!;
    expect(useIDEStore.getState()).toMatchObject({ activeFileId: file.id, showSettings: false });
    await expect(state.navigateToCompilerDiagnostic('src/Motor.st', 3, 1)).resolves.toBe(true);
    const second = useIDEStore.getState().compilerNavigationTarget!;
    state.consumeCompilerNavigationTarget(first);
    expect(useIDEStore.getState().compilerNavigationTarget).toBe(second);
    await expect(state.navigateToCompilerDiagnostic('Motor.st', 2, 1)).resolves.toBe(false);
    await expect(state.navigateToCompilerDiagnostic('src/Motor.st', 0, 1)).resolves.toBe(false);
  });

  it('opens an unloaded exact source before navigating and rejects stale workspace state', async () => {
    const file = { id: 'file-src-Motor-st', name: 'Motor.st', path: 'src/Motor.st', parentPath: 'src', language: 'ST' as const, content: 'PROGRAM Motor END_PROGRAM', isModified: false };
    const tree = { id: 'root', name: '', path: '', type: 'directory' as const, children: [{ id: file.id, name: file.name, path: file.path, type: 'file' as const, language: 'ST' as const }] };
    const originalOpenFile = useIDEStore.getState().openFile;

    useIDEStore.setState({ fileTree: tree, loadedFiles: new Map(), activeFileId: null, openTabs: [], compilerNavigationTarget: null });
    useIDEStore.setState({
      openFile: async (id) => {
        useIDEStore.setState({ loadedFiles: new Map([[id, file]]), activeFileId: id, openTabs: [id] });
      },
    });
    await expect(useIDEStore.getState().navigateToCompilerDiagnostic(file.path, 2, 1)).resolves.toBe(true);
    expect(useIDEStore.getState().compilerNavigationTarget).toMatchObject({ file: file.path, line: 2 });

    useIDEStore.setState({ loadedFiles: new Map(), activeFileId: null, openTabs: [], compilerNavigationTarget: null });
    useIDEStore.setState({
      openFile: async () => {
        useIDEStore.setState({ fileTree: { ...tree, children: [] } });
      },
    });
    await expect(useIDEStore.getState().navigateToCompilerDiagnostic(file.path, 2, 1)).resolves.toBe(false);
    expect(useIDEStore.getState().compilerNavigationTarget).toBeNull();

    useIDEStore.setState({ fileTree: tree, loadedFiles: new Map(), activeFileId: null, openTabs: [], compilerNavigationTarget: null });
    useIDEStore.setState({
      openFile: async (id) => {
        useIDEStore.setState({ loadedFiles: new Map([[id, file]]), activeFileId: id, openTabs: [id] });
        useIDEStore.getState().clearCompilerMessages();
      },
    });
    await expect(useIDEStore.getState().navigateToCompilerDiagnostic(file.path, 2, 1)).resolves.toBe(false);
    expect(useIDEStore.getState().compilerNavigationTarget).toBeNull();
    useIDEStore.setState({ openFile: originalOpenFile });
  });

  it('clears diagnostics and navigation when a workspace is replaced', () => {
    const state = useIDEStore.getState();
    state.addCompilerMessage({ type: 'error', message: 'old', file: 'src/Motor.st', line: 1, column: 1 });
    useIDEStore.setState({ compilerNavigationTarget: { file: 'src/Motor.st', line: 1, column: 1 } });
    const runBeforeReplacement = useIDEStore.getState().compilerRunId;

    replaceProject();

    expect(useIDEStore.getState()).toMatchObject({
      compilerMessages: [],
      compilerMessagesChecked: false,
      compilerNavigationTarget: null,
      compilerRunId: runBeforeReplacement + 1,
    });
  });
});

describe('useIDEStore live ST syntax diagnostics', () => {
  it('accepts only the active exact buffer identity and cannot let stale cleanup erase a newer result', () => {
    const file = { id: 'file-src-Motor-st-live', name: 'Motor.st', path: 'src/Motor.st', parentPath: 'src', language: 'ST' as const, content: 'PROGRAM Motor\nEND_PROGRAM', isModified: false };
    useIDEStore.setState({
      isProjectOpen: true,
      projectSession: 901,
      compilerRunId: 44,
      loadedFiles: new Map([[file.id, file]]),
      activeFileId: file.id,
      stBufferDiagnostics: null,
    });
    const state = useIDEStore.getState();
    const identity = { projectSession: 901, compilerRunId: 44, fileId: file.id, file: file.path };
    const first = { ...identity, diagnostics: [{ code: 'ST_PARSER' as const, type: 'error' as const, message: 'first', line: 1, column: 1 }] };
    expect(state.setSTBufferDiagnostics(first, file.content)).toBe(true);
    expect(useIDEStore.getState().stBufferDiagnostics).toEqual(first);

    const newer = { ...identity, diagnostics: [{ code: 'ST_LEXER' as const, type: 'error' as const, message: 'newer', line: 1, column: 1 }] };
    expect(state.setSTBufferDiagnostics(newer, file.content)).toBe(true);
    state.clearSTBufferDiagnostics({ ...identity, compilerRunId: 43 });
    expect(useIDEStore.getState().stBufferDiagnostics).toEqual(newer);

    expect(state.setSTBufferDiagnostics({ ...identity, compilerRunId: 43, diagnostics: [] }, file.content)).toBe(false);
    expect(state.setSTBufferDiagnostics({ ...identity, file: 'src/Other.st', diagnostics: [] }, file.content)).toBe(false);
    expect(state.setSTBufferDiagnostics({ ...identity, diagnostics: [] }, 'stale content')).toBe(false);
    useIDEStore.setState({ isProjectOpen: false });
    expect(state.setSTBufferDiagnostics({ ...identity, diagnostics: [] }, file.content)).toBe(false);
    useIDEStore.setState({ isProjectOpen: true, loadedFiles: new Map([[file.id, { ...file, language: 'IL' }]]) });
    expect(state.setSTBufferDiagnostics({ ...identity, diagnostics: [] }, file.content)).toBe(false);
  });

  it('clears live ST feedback immediately on edit and invalidates it when project or run changes', () => {
    const state = useIDEStore.getState();
    const file = { id: 'file-src-Live-st', name: 'Live.st', path: 'src/Live.st', parentPath: 'src', language: 'ST' as const, content: 'PROGRAM Live\nEND_PROGRAM', isModified: false };
    useIDEStore.setState({ isProjectOpen: true, projectSession: 902, compilerRunId: 55, loadedFiles: new Map([[file.id, file]]), activeFileId: file.id, stBufferDiagnostics: null });
    const identity = { projectSession: 902, compilerRunId: 55, fileId: file.id, file: file.path };
    expect(state.setSTBufferDiagnostics({ ...identity, diagnostics: [] }, file.content)).toBe(true);
    state.updateFileContent(file.id, 'PROGRAM Live\n@\nEND_PROGRAM');
    expect(useIDEStore.getState().stBufferDiagnostics).toBeNull();
    expect(state.setSTBufferDiagnostics({ ...identity, diagnostics: [] }, file.content)).toBe(false);
    useIDEStore.setState({ projectSession: 903 });
    expect(state.setSTBufferDiagnostics({ ...identity, diagnostics: [] }, 'PROGRAM Live\n@\nEND_PROGRAM')).toBe(false);
    useIDEStore.setState({ isProjectOpen: false, loadedFiles: new Map(), activeFileId: null, openTabs: [], projectConfigDirty: false, stBufferDiagnostics: null });
  });
});

describe('useIDEStore project migration disclosure', () => {
  it('clears the in-memory migration preview when a project closes or a virtual project replaces it', () => {
    useIDEStore.setState({ projectMigrationPreview: migrationPreview });

    useIDEStore.getState().closeProject();
    expect(useIDEStore.getState().projectMigrationPreview).toBeNull();

    useIDEStore.setState({ projectMigrationPreview: migrationPreview });
    replaceProject();
    expect(useIDEStore.getState().projectMigrationPreview).toBeNull();
  });

  it('does not expose virtual example-opening actions', () => {
    expect('openExampleProject' in useIDEStore.getState()).toBe(false);
    expect('createVirtualProject' in useIDEStore.getState()).toBe(false);
  });
});

describe('useIDEStore folder opening', () => {
  function missingProjectFile(): never {
    const error = new Error('Not found');
    error.name = 'NotFoundError';
    throw error;
  }

  async function withDirectoryPicker(
    handle: FileSystemDirectoryHandle | null | (() => Promise<FileSystemDirectoryHandle | null>),
    test: () => Promise<void>,
  ): Promise<void> {
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    if (!globalThis.window) Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis.window, 'showDirectoryPicker');
    Object.defineProperty(globalThis.window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => typeof handle === 'function' ? handle() : handle,
    });
    try {
      await test();
    } finally {
      if (descriptor) Object.defineProperty(globalThis.window, 'showDirectoryPicker', descriptor);
      else delete (globalThis.window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
      else delete (globalThis as { window?: unknown }).window;
    }
  }

  function validFolder(name: string): FileSystemDirectoryHandle {
    const config = { ...DEFAULT_ZPLC_CONFIG, name };
    const file = { getFile: async () => ({ size: JSON.stringify(config).length, text: async () => JSON.stringify(config) }) } as FileSystemFileHandle;
    return {
      name,
      getFileHandle: async () => file,
      values: async function* () { yield* [] as FileSystemHandle[]; },
    } as unknown as FileSystemDirectoryHandle;
  }

  function exampleDestination(name = 'copied-example') {
    const files = new Map<string, string>();
    const directories = new Set(['']);
    const missing = () => Object.assign(new Error('missing'), { name: 'NotFoundError' });
    const directory = (path = ''): FileSystemDirectoryHandle => ({
      name: path ? path.split('/').at(-1)! : name,
      getFileHandle: async (entry: string, options?: FileSystemGetFileOptions) => {
        const key = path ? `${path}/${entry}` : entry;
        if (!files.has(key)) { if (!options?.create) throw missing(); files.set(key, ''); }
        return {
          getFile: async () => ({ size: files.get(key)!.length, text: async () => files.get(key)! }),
          createWritable: async () => ({ write: async (content: string) => files.set(key, content), close: async () => {} }),
        } as unknown as FileSystemFileHandle;
      },
      getDirectoryHandle: async (entry: string, options?: FileSystemGetDirectoryOptions) => {
        const key = path ? `${path}/${entry}` : entry;
        if (!directories.has(key)) { if (!options?.create) throw missing(); directories.add(key); }
        return directory(key);
      },
      values: async function* () {
        const prefix = path ? `${path}/` : '';
        for (const entry of directories) if (entry && entry.startsWith(prefix) && !entry.slice(prefix.length).includes('/')) yield { kind: 'directory', name: entry.slice(prefix.length) } as FileSystemHandle;
        for (const entry of files.keys()) if (entry.startsWith(prefix) && !entry.slice(prefix.length).includes('/')) yield { kind: 'file', name: entry.slice(prefix.length) } as FileSystemHandle;
      },
    } as unknown as FileSystemDirectoryHandle);
    return { handle: directory(), files };
  }

  function seedExample() {
    loadedExample = { zplcConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'Copied example' }, migrationPreview: null };
    loadedExampleAssets = [
      { path: 'src/main.st', content: 'PROGRAM Main END_PROGRAM' },
      { path: 'tests/main.scenario.json', content: '{"schemaVersion":1}' },
    ];
  }

  function seedCleanProject() {
    const file = { id: 'file:src/old.st', name: 'old.st', path: 'src/old.st', parentPath: 'src', language: 'ST' as const, content: 'PROGRAM Old END_PROGRAM', isModified: false };
    const tree: FileTreeNode = { id: 'dir:/', name: 'old-project', type: 'directory', path: '/', children: [] };
    const config = { ...DEFAULT_ZPLC_CONFIG, name: 'old-project' };
    useIDEStore.getState().clearForcedValues();
    useIDEStore.setState({
      isProjectOpen: true, isVirtualProject: false, projectName: 'old-project', projectConfig: config, projectConfigDirty: false,
      projectSession: 710, directoryHandle: { name: 'old-project' } as FileSystemDirectoryHandle, fileTree: tree,
      loadedFiles: new Map([[file.id, file]]), activeFileId: file.id, openTabs: [file.id],
    });
    return { file, tree, config };
  }

  it('rejects a folder without zplc.json without changing disk or the open project', async () => {
    let createCalls = 0;
    let writableCalls = 0;
    let writeCalls = 0;
    let valuesCalls = 0;
    const configFile = {
      createWritable: async () => {
        writableCalls += 1;
        return { write: async () => { writeCalls += 1; }, close: async () => {} };
      },
    } as FileSystemFileHandle;
    const handle = {
      name: 'ordinary-folder',
      getFileHandle: async (_name: string, options?: FileSystemGetFileOptions) => {
        if (options?.create) {
          createCalls += 1;
          return configFile;
        }
        return missingProjectFile();
      },
      values: async function* () { valuesCalls += 1; yield* [] as FileSystemHandle[]; },
    } as unknown as FileSystemDirectoryHandle;
    seedCleanProject();
    const before = useIDEStore.getState();

    await withDirectoryPicker(handle, async () => {
      await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
    });

    const current = useIDEStore.getState();
    expect({ createCalls, writableCalls, writeCalls, valuesCalls }).toEqual({ createCalls: 0, writableCalls: 0, writeCalls: 0, valuesCalls: 0 });
    expect(current.projectSession).toBe(before.projectSession);
    expect(current.fileTree).toBe(before.fileTree);
    expect(current.projectConfig).toBe(before.projectConfig);
    expect(current.loadedFiles).toBe(before.loadedFiles);
    expect(current.activeFileId).toBe(before.activeFileId);
    expect(current.openTabs).toBe(before.openTabs);
    expect(current.consoleEntries.at(-1)?.message).toContain('folder was not changed');
    expect(current.consoleEntries.at(-1)?.message).toContain('New Project');
  });

  it('opens a valid manifest and rejects an invalid one without writing', async () => {
    const validHandle = validFolder('opened');
    await withDirectoryPicker(validHandle, async () => {
      await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(true);
    });
    expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: true, projectName: 'opened', projectConfig: { name: 'opened' } });

    let createCalls = 0;
    const invalidFile = { getFile: async () => ({ size: 1, text: async () => '{' }) } as FileSystemFileHandle;
    const invalidHandle = {
      name: 'invalid-folder',
      getFileHandle: async (_name: string, options?: FileSystemGetFileOptions) => {
        if (options?.create) createCalls += 1;
        return invalidFile;
      },
      values: async function* () { yield* (() => { throw new Error('must not read directory'); })() as FileSystemHandle[]; },
    } as unknown as FileSystemDirectoryHandle;
    await withDirectoryPicker(invalidHandle, async () => {
      await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
    });
    expect(createCalls).toBe(0);
  });

  it('blocks dirty work and retained force evidence before the picker', async () => {
    let pickerCalls = 0;
    await withDirectoryPicker(async () => {
      pickerCalls += 1;
      return validFolder('must-not-open');
    }, async () => {
      const { file } = seedCleanProject();
      useIDEStore.getState().updateFileContent(file.id, 'changed');
      await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
      expect(useIDEStore.getState().consoleEntries.at(-1)?.message).toContain('Save or discard');

      seedCleanProject();
      useIDEStore.setState({ projectConfigDirty: true });
      await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
      expect(useIDEStore.getState().consoleEntries.at(-1)?.message).toContain('Save or discard');

      seedCleanProject();
      useIDEStore.getState().setForcedValue({ path: 'Motor.Enable', address: 16, size: 1, type: 'BOOL', bytesHex: '01', state: WATCH_FORCE_STATE.FORCED });
      await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
      expect(useIDEStore.getState()).toMatchObject({ activeConsoleTab: 'watch', isConsoleCollapsed: false });
      expect(useIDEStore.getState().debug.forcedValues.get('Motor.Enable')?.state).toBe(WATCH_FORCE_STATE.FORCED);

      useIDEStore.getState().clearForcedValues();
      useIDEStore.getState().markForcedValuesUnconfirmed();
      await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
      expect(useIDEStore.getState().debug.forcesUnconfirmed).toBe(true);
      useIDEStore.getState().clearForcedValues();
    });
    expect(pickerCalls).toBe(0);
  });

  it('copies a bundled example through one picker into the selected physical project', async () => {
    seedExample();
    const destination = exampleDestination();
    let pickerCalls = 0;
    await withDirectoryPicker(async () => { pickerCalls += 1; return destination.handle; }, async () => {
      await expect(useIDEStore.getState().copyExampleProjectToFolder('example')).resolves.toBe(true);
    });
    const current = useIDEStore.getState();
    expect(pickerCalls).toBe(1);
    expect(destination.files.get('src/main.st')).toBe('PROGRAM Main END_PROGRAM');
    expect(destination.files.get('tests/main.scenario.json')).toBe('{"schemaVersion":1}');
    expect(destination.files.get('zplc.json')).toContain('"schemaVersion": 2');
    expect(current).toMatchObject({ isVirtualProject: false, directoryHandle: destination.handle, projectMigrationPreview: null, activeFileId: 'file:src/main.st', openTabs: ['file:src/main.st'] });
    expect(current.loadedFiles.get('file:src/main.st')?.handle).toBeDefined();
  });

  it('cancels or blocks example copying before the picker without replacing the project', async () => {
    seedExample();
    const { config } = seedCleanProject();
    let pickerCalls = 0;
    await withDirectoryPicker(async () => { pickerCalls += 1; return null; }, async () => {
      await expect(useIDEStore.getState().copyExampleProjectToFolder('example')).resolves.toBe(false);
    });
    expect(pickerCalls).toBe(1);
    expect(useIDEStore.getState().projectConfig).toBe(config);

    await withDirectoryPicker(async () => { pickerCalls += 1; return exampleDestination().handle; }, async () => {
      const { file } = seedCleanProject();
      useIDEStore.getState().updateFileContent(file.id, 'dirty');
      await expect(useIDEStore.getState().copyExampleProjectToFolder('example')).resolves.toBe(false);
      seedCleanProject();
      useIDEStore.getState().setForcedValue({ path: 'Motor.Enable', address: 16, size: 1, type: 'BOOL', bytesHex: '01', state: WATCH_FORCE_STATE.FORCED });
      await expect(useIDEStore.getState().copyExampleProjectToFolder('example')).resolves.toBe(false);
      useIDEStore.getState().clearForcedValues();
      useIDEStore.getState().markForcedValuesUnconfirmed();
      await expect(useIDEStore.getState().copyExampleProjectToFolder('example')).resolves.toBe(false);
      useIDEStore.getState().clearForcedValues();
    });
    expect(pickerCalls).toBe(1);
  });

  it('does not publish a stale example copy over a newer project', async () => {
    seedExample();
    useIDEStore.getState().clearConsole();
    const picker = deferred<FileSystemDirectoryHandle>();
    await withDirectoryPicker(() => picker.promise, async () => {
      const copying = useIDEStore.getState().copyExampleProjectToFolder('example');
      replaceProject('newer-project');
      picker.resolve(exampleDestination().handle);
      await expect(copying).resolves.toBe(false);
    });
    expect(useIDEStore.getState().projectName).toBe('newer-project');
    expect(useIDEStore.getState().consoleEntries.some((entry) => entry.message.includes('Copied example project'))).toBe(false);
  });

  it('lets the latest clean opening intent win without publishing stale results', async () => {
    const first = deferred<FileSystemDirectoryHandle>();
    const second = deferred<FileSystemDirectoryHandle>();
    let pickerCalls = 0;
    seedCleanProject();
    useIDEStore.getState().clearConsole();
    await withDirectoryPicker(async () => {
      pickerCalls += 1;
      return pickerCalls === 1 ? first.promise : second.promise;
    }, async () => {
      const older = useIDEStore.getState().openProjectFromFolder();
      const newer = useIDEStore.getState().openProjectFromFolder();
      second.resolve(validFolder('second'));
      await expect(newer).resolves.toBe(true);
      first.resolve(validFolder('first'));
      await expect(older).resolves.toBe(false);
    });
    expect(useIDEStore.getState().projectName).toBe('second');
    expect(useIDEStore.getState().consoleEntries.some((entry) => /Opened project: first|Failed to open folder/.test(entry.message))).toBe(false);
  });

  it('does not publish an opening after the project changes or becomes unsafe during a read', async () => {
    const picker = deferred<FileSystemDirectoryHandle>();
    seedCleanProject();
    useIDEStore.getState().clearConsole();
    await withDirectoryPicker(() => picker.promise, async () => {
      const opening = useIDEStore.getState().openProjectFromFolder();
      replaceProject();
      picker.resolve(validFolder('stale'));
      await expect(opening).resolves.toBe(false);
    });
    expect(useIDEStore.getState().projectName).toBe('replacement');
    expect(useIDEStore.getState().consoleEntries.some((entry) => /Opened project: stale|Failed to open folder/.test(entry.message))).toBe(false);

    const configRead = deferred<FileSystemFileHandle>();
    const delayedFolder = {
      name: 'delayed',
      getFileHandle: () => configRead.promise,
      values: async function* () { yield* [] as FileSystemHandle[]; },
    } as unknown as FileSystemDirectoryHandle;
    const { file } = seedCleanProject();
    await withDirectoryPicker(delayedFolder, async () => {
      const opening = useIDEStore.getState().openProjectFromFolder();
      useIDEStore.getState().updateFileContent(file.id, 'changed during open');
      useIDEStore.getState().setForcedValue({ path: 'Motor.Enable', address: 16, size: 1, type: 'BOOL', bytesHex: '01', state: WATCH_FORCE_STATE.FORCED });
      const config = { ...DEFAULT_ZPLC_CONFIG, name: 'delayed' };
      configRead.resolve({ getFile: async () => ({ size: JSON.stringify(config).length, text: async () => JSON.stringify(config) }) } as FileSystemFileHandle);
      await expect(opening).resolves.toBe(false);
    });
    expect(useIDEStore.getState().loadedFiles.get(file.id)?.isModified).toBe(true);
    expect(useIDEStore.getState().debug.forcedValues.get('Motor.Enable')?.state).toBe(WATCH_FORCE_STATE.FORCED);
    useIDEStore.getState().clearForcedValues();
  });
});

describe('useIDEStore workspace scenario links', () => {
  it('binds a local workspace only to the current physical project session', () => {
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 100, workspaceScenarioLink: null });
    const state = useIDEStore.getState();

    expect(state.linkWorkspaceScenarios('workspace-token', 99)).toBe(false);
    expect(useIDEStore.getState().workspaceScenarioLink).toBeNull();
    expect(state.linkWorkspaceScenarios('workspace-token', 100)).toBe(true);
    expect(useIDEStore.getState().workspaceScenarioLink).toEqual({ workspaceId: 'workspace-token', projectSession: 100 });

    replaceProject();
    expect(useIDEStore.getState().workspaceScenarioLink).toBeNull();
    expect(useIDEStore.getState().projectSession).toBe(101);
    expect(useIDEStore.getState().linkWorkspaceScenarios('workspace-token', 101)).toBe(false);
  });

  it('does not clear a link or advance the session when close is blocked by force evidence', () => {
    const state = useIDEStore.getState();
    state.clearForcedValues();
    state.setForcedValue({ path: 'Motor.Enable', address: 16, size: 1, type: 'BOOL', bytesHex: '01', state: WATCH_FORCE_STATE.FORCED });
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 200, workspaceScenarioLink: { workspaceId: 'workspace-token', projectSession: 200 } });

    state.closeProject();
    expect(useIDEStore.getState()).toMatchObject({ projectSession: 200, workspaceScenarioLink: { workspaceId: 'workspace-token', projectSession: 200 } });
    state.clearForcedValues();
  });

  it('treats unsaved configuration as unsaved work and clears it only on replacement or successful save', () => {
    useIDEStore.setState({ projectConfig: { name: 'local', version: '1.0.0', schemaVersion: 2, tasks: [] }, projectConfigDirty: false, loadedFiles: new Map() });
    const state = useIDEStore.getState();
    state.updateProjectConfig({ name: 'changed' });

    expect(useIDEStore.getState()).toMatchObject({ projectConfigDirty: true, compilerMessages: [], compilerMessagesChecked: false });
    expect(state.hasUnsavedChanges()).toBe(true);

    replaceProject();
    expect(useIDEStore.getState()).toMatchObject({ projectConfigDirty: false });
  });
});

describe('useIDEStore project close admission', () => {
  const file = {
    id: 'file-src-Motor-st', name: 'Motor.st', path: 'src/Motor.st', parentPath: 'src',
    language: 'ST' as const, content: 'PROGRAM Motor END_PROGRAM', isModified: true,
  };

  function seedOpenProject(overrides: Record<string, unknown> = {}) {
    const state = useIDEStore.getState();
    state.clearForcedValues();
    useIDEStore.setState({
      isProjectOpen: true,
      isVirtualProject: false,
      projectName: 'Unsaved project',
      projectConfig: { name: 'Unsaved project', version: '1.0.0', schemaVersion: 2, tasks: [] },
      projectSession: 900,
      workspaceScenarioLink: { workspaceId: 'workspace-token', projectSession: 900 },
      projectConfigDirty: false,
      loadedFiles: new Map([[file.id, file]]),
      activeFileId: file.id,
      openTabs: [file.id],
      ...overrides,
    });
  }

  it('fails closed for a dirty file without mutating the open project', () => {
    seedOpenProject();
    const before = useIDEStore.getState();

    expect(before.closeProject()).toBe(false);

    const current = useIDEStore.getState();
    expect(current).toMatchObject({
      isProjectOpen: true,
      projectSession: 900,
      workspaceScenarioLink: { workspaceId: 'workspace-token', projectSession: 900 },
      projectName: 'Unsaved project',
      activeFileId: file.id,
      openTabs: [file.id],
    });
    expect(current.loadedFiles.get(file.id)?.isModified).toBe(true);
  });

  it('fails closed for dirty configuration and closes only after explicit discard', () => {
    seedOpenProject({ loadedFiles: new Map([[file.id, { ...file, isModified: false }]]), projectConfigDirty: true });
    const state = useIDEStore.getState();

    expect(state.closeProject()).toBe(false);
    expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: true, projectConfigDirty: true, projectSession: 900 });

    expect(state.closeProject({ discardUnsaved: true })).toBe(true);
    expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: false, projectConfig: null, projectConfigDirty: false, workspaceScenarioLink: null, projectSession: 901 });
  });

  it('keeps force evidence ahead of explicit discard', () => {
    seedOpenProject();
    const state = useIDEStore.getState();
    state.setForcedValue({ path: 'Motor.Enable', address: 16, size: 1, type: 'BOOL', bytesHex: '01', state: WATCH_FORCE_STATE.FORCED });

    expect(state.closeProject({ discardUnsaved: true })).toBe(false);

    const current = useIDEStore.getState();
    expect(current).toMatchObject({ isProjectOpen: true, projectSession: 900, activeConsoleTab: 'watch', isConsoleCollapsed: false });
    expect(current.loadedFiles.get(file.id)?.isModified).toBe(true);
    expect(current.debug.forcedValues.get('Motor.Enable')?.state).toBe(WATCH_FORCE_STATE.FORCED);
    state.clearForcedValues();
  });
});

describe('useIDEStore deferred saves', () => {
  it('preserves an edit made while a physical file write is in flight', async () => {
    const closeStarted = deferred<void>();
    const completeWrite = deferred<void>();
    const handle = {
      createWritable: async () => ({
        write: async () => {},
        close: () => { closeStarted.resolve(); return completeWrite.promise; },
      }),
    } as unknown as FileSystemFileHandle;
    const file = { id: 'file-src-main-st', name: 'main.st', path: 'src/main.st', parentPath: 'src', language: 'ST' as const, content: 'old', isModified: true, handle };
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 300, loadedFiles: new Map([[file.id, file]]) });

    const saving = useIDEStore.getState().saveFile(file.id);
    await closeStarted.promise;
    useIDEStore.getState().updateFileContent(file.id, 'new');
    completeWrite.resolve();

    await expect(saving).resolves.toBe(false);
    expect(useIDEStore.getState().loadedFiles.get(file.id)).toMatchObject({ content: 'new', isModified: true });
  });

  it('clears a migration preview only after saving its current configuration', async () => {
    const configHandle = {
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
    } as unknown as FileSystemFileHandle;
    const directoryHandle = {
      queryPermission: async () => 'granted' as PermissionState,
      getFileHandle: async () => configHandle,
    } as unknown as FileSystemDirectoryHandle;
    useIDEStore.setState({
      isProjectOpen: true, isVirtualProject: false, projectSession: 300, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'legacy' },
      projectConfigDirty: true, projectMigrationPreview: migrationPreview, directoryHandle,
    });
    useIDEStore.getState().clearConsole();

    await useIDEStore.getState().saveProjectConfig();

    expect(useIDEStore.getState()).toMatchObject({ projectConfigDirty: false, projectMigrationPreview: null });
    expect(useIDEStore.getState().consoleEntries.some((entry) => entry.message === 'Saved zplc.json')).toBe(true);
  });

  it('keeps a migration preview when saving the configuration fails', async () => {
    const configHandle = {
      createWritable: async () => ({ write: async () => {}, close: async () => { throw new Error('write failed'); } }),
    } as unknown as FileSystemFileHandle;
    const directoryHandle = {
      queryPermission: async () => 'granted' as PermissionState,
      getFileHandle: async () => configHandle,
    } as unknown as FileSystemDirectoryHandle;
    useIDEStore.setState({
      isProjectOpen: true, isVirtualProject: false, projectSession: 300, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'legacy' },
      projectConfigDirty: true, projectMigrationPreview: migrationPreview, directoryHandle,
    });
    useIDEStore.getState().clearConsole();

    await useIDEStore.getState().saveProjectConfig();

    expect(useIDEStore.getState()).toMatchObject({ projectConfigDirty: true, projectMigrationPreview: migrationPreview });
    expect(useIDEStore.getState().consoleEntries.some((entry) => entry.message === 'Saved zplc.json')).toBe(false);
  });

  it('does not publish a stale config-save success or error after the project changes', async () => {
    const closeStarted = deferred<void>();
    const completeWrite = deferred<void>();
    const configHandle = {
      createWritable: async () => ({
        write: async () => {},
        close: () => { closeStarted.resolve(); return completeWrite.promise; },
      }),
    } as unknown as FileSystemFileHandle;
    const directoryHandle = {
      queryPermission: async () => 'granted' as PermissionState,
      getFileHandle: async () => configHandle,
    } as unknown as FileSystemDirectoryHandle;
    const config = { ...DEFAULT_ZPLC_CONFIG, name: 'local' };
    useIDEStore.getState().clearConsole();
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 301, projectConfig: config, projectConfigDirty: true, directoryHandle });

    const saving = useIDEStore.getState().saveProjectConfig();
    await closeStarted.promise;
    replaceProject();
    useIDEStore.setState({ projectMigrationPreview: migrationPreview });
    completeWrite.reject(new Error('stale write'));

    await expect(saving).resolves.toBeUndefined();
    expect(useIDEStore.getState().consoleEntries.some((entry) => /Saved zplc\.json|Failed to save config/.test(entry.message))).toBe(false);
    expect(useIDEStore.getState().projectMigrationPreview).toEqual(migrationPreview);
  });

  it('keeps newer configuration dirty and suppresses an old save success', async () => {
    const closeStarted = deferred<void>();
    const completeWrite = deferred<void>();
    const configHandle = {
      createWritable: async () => ({
        write: async () => {},
        close: () => { closeStarted.resolve(); return completeWrite.promise; },
      }),
    } as unknown as FileSystemFileHandle;
    const directoryHandle = {
      queryPermission: async () => 'granted' as PermissionState,
      getFileHandle: async () => configHandle,
    } as unknown as FileSystemDirectoryHandle;
    useIDEStore.getState().clearConsole();
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 302, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'before' }, projectConfigDirty: true, projectMigrationPreview: migrationPreview, directoryHandle });

    const saving = useIDEStore.getState().saveProjectConfig();
    await closeStarted.promise;
    useIDEStore.getState().updateProjectConfig({ name: 'after' });
    completeWrite.resolve();

    await expect(saving).resolves.toBeUndefined();
    expect(useIDEStore.getState()).toMatchObject({ projectConfigDirty: true, projectConfig: { name: 'after' }, projectMigrationPreview: migrationPreview });
    expect(useIDEStore.getState().consoleEntries.some((entry) => entry.message === 'Saved zplc.json')).toBe(false);
  });

  it('does not request a write after its session changes during permission checks', async () => {
    const queryStarted = deferred<void>();
    const queryResult = deferred<PermissionState>();
    let getFileHandleCalls = 0;
    const directoryHandle = {
      queryPermission: () => { queryStarted.resolve(); return queryResult.promise; },
      getFileHandle: async () => { getFileHandleCalls += 1; throw new Error('must not write'); },
    } as unknown as FileSystemDirectoryHandle;
    useIDEStore.getState().clearConsole();
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 303, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'permission-query' }, projectConfigDirty: true, directoryHandle });

    const saving = useIDEStore.getState().saveProjectConfig();
    await queryStarted.promise;
    replaceProject();
    useIDEStore.getState().clearConsole();
    queryResult.resolve('granted');

    await expect(saving).resolves.toBeUndefined();
    expect(getFileHandleCalls).toBe(0);
    expect(useIDEStore.getState().consoleEntries).toEqual([]);
  });

  it('does not report permission denial after its session changes during a request', async () => {
    const requestStarted = deferred<void>();
    const requestResult = deferred<PermissionState>();
    let getFileHandleCalls = 0;
    const directoryHandle = {
      queryPermission: async () => 'prompt' as PermissionState,
      requestPermission: () => { requestStarted.resolve(); return requestResult.promise; },
      getFileHandle: async () => { getFileHandleCalls += 1; throw new Error('must not write'); },
    } as unknown as FileSystemDirectoryHandle;
    useIDEStore.getState().clearConsole();
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 304, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'permission-request' }, projectConfigDirty: true, directoryHandle });

    const saving = useIDEStore.getState().saveProjectConfig();
    await requestStarted.promise;
    replaceProject();
    useIDEStore.getState().clearConsole();
    requestResult.resolve('denied');

    await expect(saving).resolves.toBeUndefined();
    expect(getFileHandleCalls).toBe(0);
    expect(useIDEStore.getState().consoleEntries).toEqual([]);
  });

  it('does not save a matching later file after the project session changes', async () => {
    const firstCloseStarted = deferred<void>();
    const completeFirstClose = deferred<void>();
    let replacementWrites = 0;
    const first = {
      id: 'first', name: 'first.st', path: 'src/first.st', parentPath: 'src', language: 'ST' as const, content: 'PROGRAM First END_PROGRAM', isModified: true,
      handle: { createWritable: async () => ({ write: async () => {}, close: () => { firstCloseStarted.resolve(); return completeFirstClose.promise; } }) } as unknown as FileSystemFileHandle,
    };
    const second = {
      id: 'shared', name: 'second.st', path: 'src/second.st', parentPath: 'src', language: 'ST' as const, content: 'PROGRAM Second END_PROGRAM', isModified: true,
      handle: { createWritable: async () => ({ write: async () => {}, close: async () => {} }) } as unknown as FileSystemFileHandle,
    };
    const replacement = {
      ...second,
      name: 'replacement.st',
      handle: { createWritable: async () => { replacementWrites += 1; return { write: async () => {}, close: async () => {} }; } } as unknown as FileSystemFileHandle,
    };
    useIDEStore.getState().clearConsole();
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 305, loadedFiles: new Map([[first.id, first], [second.id, second]]) });

    const saving = useIDEStore.getState().saveAllFiles();
    await firstCloseStarted.promise;
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 306, loadedFiles: new Map([[replacement.id, replacement]]) });
    useIDEStore.getState().clearConsole();
    completeFirstClose.resolve();

    await expect(saving).resolves.toBeUndefined();
    expect(replacementWrites).toBe(0);
    expect(useIDEStore.getState().loadedFiles.get(replacement.id)).toBe(replacement);
    expect(useIDEStore.getState().consoleEntries).toEqual([]);
  });
});

describe('useIDEStore virtual saves', () => {
  it('keeps an edited virtual file dirty because no durable project write occurred', async () => {
    const file = {
      id: 'file-src-main-st', name: 'main.st', path: 'src/main.st', parentPath: 'src',
      language: 'ST' as const, content: 'PROGRAM Main END_PROGRAM', isModified: true,
    };
    useIDEStore.setState({
      isProjectOpen: true,
      isVirtualProject: true,
      projectName: 'Virtual project',
      projectConfig: { name: 'Virtual project', version: '1.0.0', schemaVersion: 2, tasks: [] },
      projectSession: 400,
      loadedFiles: new Map([[file.id, file]]),
      activeFileId: file.id,
      openTabs: [file.id],
    });
    const before = useIDEStore.getState().loadedFiles.get(file.id);

    await expect(useIDEStore.getState().saveFile(file.id)).resolves.toBe(false);

    const current = useIDEStore.getState();
    expect(current.loadedFiles.get(file.id)).toBe(before);
    expect(current.loadedFiles.get(file.id)).toMatchObject({ content: 'PROGRAM Main END_PROGRAM', isModified: true });
    expect(current.hasUnsavedChanges()).toBe(true);
    expect(current.closeProject()).toBe(false);
    expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: true, projectName: 'Virtual project', projectSession: 400 });
  });
});

describe('useIDEStore openFile intent ordering', () => {
  const fileNode = (id: string, content: ReturnType<typeof deferred<string>>): FileTreeNode => ({
    id, name: `${id}.st`, path: `src/${id}.st`, type: 'file', language: 'ST',
    handle: { getFile: async () => ({ text: () => content.promise }) } as unknown as FileSystemFileHandle,
  });

  const tree = (...children: FileTreeNode[]): FileTreeNode => ({ id: 'root', name: 'root', path: '', type: 'directory', children });

  it('keeps both concurrent loads while the last request wins active focus', async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    useIDEStore.setState({ projectSession: 401, fileTree: tree(fileNode('a', a), fileNode('b', b)), loadedFiles: new Map(), openTabs: [], activeFileId: null });

    const openingA = useIDEStore.getState().openFile('a');
    const openingB = useIDEStore.getState().openFile('b');
    b.resolve('PROGRAM B END_PROGRAM');
    await openingB;
    a.resolve('PROGRAM A END_PROGRAM');
    await openingA;

    const state = useIDEStore.getState();
    expect([...state.loadedFiles.keys()]).toEqual(['b', 'a']);
    expect(state.openTabs).toEqual(['b', 'a']);
    expect(state.activeFileId).toBe('b');
  });

  it('lets a loaded-file request win while an older load still warms its cache', async () => {
    const a = deferred<string>();
    const c = { id: 'c', name: 'c.st', path: 'src/c.st', parentPath: 'src', language: 'ST' as const, content: 'PROGRAM C END_PROGRAM', isModified: false };
    useIDEStore.setState({ projectSession: 402, fileTree: tree(fileNode('a', a), { id: 'c', name: 'c.st', path: 'src/c.st', type: 'file', language: 'ST' }), loadedFiles: new Map([['c', c]]), openTabs: [], activeFileId: null });

    const openingA = useIDEStore.getState().openFile('a');
    await useIDEStore.getState().openFile('c');
    a.resolve('PROGRAM A END_PROGRAM');
    await openingA;

    const state = useIDEStore.getState();
    expect(state.loadedFiles.has('a')).toBe(true);
    expect(state.openTabs).toEqual(['c', 'a']);
    expect(state.activeFileId).toBe('c');
  });

  it('does not publish an awaited file into a replacement project session', async () => {
    const a = deferred<string>();
    useIDEStore.setState({ projectSession: 403, fileTree: tree(fileNode('a', a)), loadedFiles: new Map(), openTabs: [], activeFileId: null });

    const openingA = useIDEStore.getState().openFile('a');
    useIDEStore.setState({ projectSession: 404, fileTree: tree(), loadedFiles: new Map(), openTabs: [], activeFileId: null });
    a.resolve('PROGRAM A END_PROGRAM');
    await openingA;

    expect(useIDEStore.getState()).toMatchObject({ projectSession: 404, activeFileId: null, openTabs: [] });
    expect(useIDEStore.getState().loadedFiles.size).toBe(0);
  });
});

describe('useIDEStore file deletion', () => {
  const fileNode = (id: string, name = `${id}.st`): FileTreeNode => ({
    id, name, path: `src/${name}`, type: 'file', language: 'ST',
  });
  const tree = (children: FileTreeNode[]): FileTreeNode => ({
    id: 'root', name: 'root', path: '', type: 'directory', children,
  });
  const loaded = (id: string, name = `${id}.st`) => ({
    id, name, path: `src/${name}`, parentPath: 'src', language: 'ST' as const, content: 'PROGRAM Main END_PROGRAM', isModified: false,
  });

  it('removes an unopened nested disk file through its canonical parent before pruning the tree', async () => {
    const calls: string[] = [];
    const source = fileNode('motor', 'motor.st');
    const root = tree([{
      id: 'src', name: 'src', path: 'src', type: 'directory',
      dirHandle: { removeEntry: async (name: string) => { calls.push(name); } } as unknown as FileSystemDirectoryHandle,
      children: [source],
    }]);
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 801, fileTree: root, loadedFiles: new Map(), openTabs: [], activeFileId: null });

    await expect(useIDEStore.getState().deleteFile(source.id)).resolves.toBe(true);

    expect(calls).toEqual(['motor.st']);
    expect(useIDEStore.getState().fileTree?.children?.[0].children).toEqual([]);
  });

  it('removes only the punctuation-distinct file selected from a physical tree', async () => {
    const calls: string[] = [];
    const first: FileTreeNode = { id: 'file:src/a-b.st', name: 'a-b.st', path: 'src/a-b.st', type: 'file', language: 'ST' };
    const second: FileTreeNode = { id: 'file:src/a.b.st', name: 'a.b.st', path: 'src/a.b.st', type: 'file', language: 'ST' };
    const root = tree([{
      id: 'dir:src', name: 'src', path: 'src', type: 'directory',
      dirHandle: { removeEntry: async (name: string) => { calls.push(name); } } as unknown as FileSystemDirectoryHandle,
      children: [first, second],
    }]);
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 810, fileTree: root, loadedFiles: new Map(), openTabs: [], activeFileId: null });

    await expect(useIDEStore.getState().deleteFile(second.id)).resolves.toBe(true);

    expect(calls).toEqual(['a.b.st']);
    expect(useIDEStore.getState().fileTree?.children?.[0].children).toEqual([first]);
  });

  it('leaves material state intact when a physical removal fails', async () => {
    const source = fileNode('motor', 'motor.st');
    const sourceFile = loaded('motor', 'motor.st');
    const root = tree([{
      id: 'src', name: 'src', path: 'src', type: 'directory',
      dirHandle: { removeEntry: async () => { throw new Error('denied'); } } as unknown as FileSystemDirectoryHandle,
      children: [source],
    }]);
    const breakpoints = new Map([['motor', new Set([3])]]);
    useIDEStore.setState({
      isProjectOpen: true, isVirtualProject: false, projectSession: 802, fileTree: root,
      loadedFiles: new Map([[source.id, sourceFile]]), openTabs: [source.id], activeFileId: source.id,
      compilerMessages: [{ type: 'error', message: 'old', timestamp: Date.now() }],
      compilerNavigationTarget: { file: source.path, line: 1, column: 1 },
      debug: { ...useIDEStore.getState().debug, breakpoints },
    });

    await expect(useIDEStore.getState().deleteFile(source.id)).resolves.toBe(false);

    const state = useIDEStore.getState();
    expect(state.fileTree).toBe(root);
    expect(state.loadedFiles.get(source.id)).toBe(sourceFile);
    expect(state.openTabs).toEqual([source.id]);
    expect(state.activeFileId).toBe(source.id);
    expect(state.compilerMessages).toHaveLength(1);
    expect(state.compilerNavigationTarget).not.toBeNull();
    expect(state.debug.breakpoints).toBe(breakpoints);
  });

  it('immutably prunes a virtual file and returns the active-tab fallback', async () => {
    const first = fileNode('first');
    const second = fileNode('second');
    const src = { id: 'src', name: 'src', path: 'src', type: 'directory' as const, children: [first, second] };
    const root = tree([src]);
    const breakpoints = new Map([[second.id, new Set([3])]]);
    useIDEStore.setState({
      isProjectOpen: true, isVirtualProject: true, projectSession: 803, fileTree: root,
      loadedFiles: new Map([[first.id, loaded(first.id)], [second.id, loaded(second.id)]]),
      openTabs: [first.id, second.id], activeFileId: second.id,
      compilerMessages: [{ type: 'error', message: 'old', timestamp: Date.now() }],
      compilerNavigationTarget: { file: second.path, line: 1, column: 1 },
      debug: { ...useIDEStore.getState().debug, breakpoints },
    });

    await expect(useIDEStore.getState().deleteFile(second.id)).resolves.toBe(true);

    const state = useIDEStore.getState();
    expect(state.fileTree).not.toBe(root);
    expect(root.children?.[0].children).toEqual([first, second]);
    expect(state.fileTree?.children?.[0].children).toEqual([first]);
    expect(state.loadedFiles.has(second.id)).toBe(false);
    expect(state.openTabs).toEqual([first.id]);
    expect(state.activeFileId).toBe(first.id);
    expect(state.compilerMessages).toEqual([]);
    expect(state.compilerNavigationTarget).toBeNull();
    expect(state.debug.breakpoints.has(second.id)).toBe(false);
  });

  it('does not publish a finished disk deletion into a replacement project session', async () => {
    const removal = deferred<void>();
    const source = fileNode('motor');
    const root = tree([{
      id: 'src', name: 'src', path: 'src', type: 'directory',
      dirHandle: { removeEntry: async () => removal.promise } as unknown as FileSystemDirectoryHandle,
      children: [source],
    }]);
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 804, fileTree: root, loadedFiles: new Map(), openTabs: [], activeFileId: null });

    const deleting = useIDEStore.getState().deleteFile(source.id);
    const replacement = tree([]);
    useIDEStore.setState({ isVirtualProject: true, projectSession: 805, fileTree: replacement, loadedFiles: new Map(), openTabs: [], activeFileId: null });
    removal.resolve();

    await expect(deleting).resolves.toBe(false);
    expect(useIDEStore.getState()).toMatchObject({ projectSession: 805, fileTree: replacement, openTabs: [], activeFileId: null });
  });

  it('rejects a stale delete request before it can remove a same-id file in a replacement session', async () => {
    const source = fileNode('motor');
    const initialTree = tree([{ id: 'src', name: 'src', path: 'src', type: 'directory', children: [source] }]);
    let removals = 0;
    const replacement = tree([{
      id: 'src', name: 'src', path: 'src', type: 'directory',
      dirHandle: { removeEntry: async () => { removals += 1; } } as unknown as FileSystemDirectoryHandle,
      children: [source],
    }]);
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 807, fileTree: initialTree, loadedFiles: new Map(), openTabs: [], activeFileId: null });
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 808, fileTree: replacement, loadedFiles: new Map(), openTabs: [], activeFileId: null });

    await expect(useIDEStore.getState().deleteFile(source.id, 807)).resolves.toBe(false);

    expect(removals).toBe(0);
    expect(useIDEStore.getState().fileTree).toBe(replacement);
    expect(useIDEStore.getState().fileTree?.children?.[0].children).toEqual([source]);
  });

  it('does not let an in-flight open resurrect a deleted file', async () => {
    const content = deferred<string>();
    const source: FileTreeNode = {
      ...fileNode('motor'),
      handle: { getFile: async () => ({ text: () => content.promise }) } as unknown as FileSystemFileHandle,
    };
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: true, projectSession: 806, fileTree: tree([source]), loadedFiles: new Map(), openTabs: [], activeFileId: null });

    const opening = useIDEStore.getState().openFile(source.id);
    await expect(useIDEStore.getState().deleteFile(source.id)).resolves.toBe(true);
    content.resolve('PROGRAM Main END_PROGRAM');
    await opening;

    const state = useIDEStore.getState();
    expect(state.loadedFiles.has(source.id)).toBe(false);
    expect(state.openTabs).not.toContain(source.id);
    expect(state.activeFileId).not.toBe(source.id);
  });

  it('does not let a stale refresh reintroduce a deleted file', async () => {
    const started = deferred<void>();
    const staleSnapshot = deferred<void>();
    let removals = 0;
    const handle = {
      name: 'root',
      values: async function* () {
        started.resolve();
        await staleSnapshot.promise;
        yield { kind: 'file', name: 'gone.st' } as FileSystemHandle;
      },
      getFileHandle: async () => ({ getFile: async () => ({ text: async () => 'PROGRAM Main END_PROGRAM' }) }),
      removeEntry: async () => { removals += 1; },
    } as unknown as FileSystemDirectoryHandle;
    const source: FileTreeNode = { id: 'file:gone.st', name: 'gone.st', path: 'gone.st', type: 'file', language: 'ST' };
    const root = { id: 'dir:/', name: 'root', path: '/', type: 'directory' as const, dirHandle: handle, children: [source] };
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: false, projectSession: 809, directoryHandle: handle, fileTree: root, loadedFiles: new Map(), openTabs: [], activeFileId: null });

    const refreshing = useIDEStore.getState().refreshFileTree();
    await started.promise;
    await expect(useIDEStore.getState().deleteFile(source.id)).resolves.toBe(true);
    staleSnapshot.resolve();
    await refreshing;

    expect(removals).toBe(1);
    expect(useIDEStore.getState().fileTree?.children).toEqual([]);
  });
});

describe('useIDEStore file creation admission', () => {
  function fileNode(name: string): FileTreeNode {
    return { id: `file:src/${name}.st`, name: `${name}.st`, type: 'file', path: `src/${name}.st`, language: 'ST' };
  }

  function tree(children: FileTreeNode[] = []): FileTreeNode {
    return { id: 'dir:/', name: 'project', type: 'directory', path: '/', children: [
      { id: 'dir:src', name: 'src', type: 'directory', path: 'src', children },
    ] };
  }

  function seedVirtual(root = tree()): void {
    useIDEStore.setState({ isProjectOpen: true, isVirtualProject: true, projectSession: 910, directoryHandle: null, fileTree: root, loadedFiles: new Map(), openTabs: [], activeFileId: null });
  }

  it('rejects invalid, missing, and duplicate virtual files without mutating the project tree', async () => {
    useIDEStore.setState({ isProjectOpen: false, fileTree: null, loadedFiles: new Map() });
    await expect(useIDEStore.getState().createFile('motor', 'ST')).rejects.toThrow('Open a project');

    const original = fileNode('motor');
    const root = tree([original]);
    seedVirtual(root);
    await expect(useIDEStore.getState().createFile('../motor', 'ST')).rejects.toThrow('single file name');
    await expect(useIDEStore.getState().createFile('motor', 'ST')).rejects.toThrow('already exists');
    expect(useIDEStore.getState().fileTree).toBe(root);
    expect(root.children?.[0].children).toEqual([original]);
  });

  it('creates a virtual file immutably in an existing folder and opens one tab', async () => {
    const root = tree();
    seedVirtual(root);

    await expect(useIDEStore.getState().createFile(' motor ', 'ST')).resolves.toBe('file:src/motor.st');

    const state = useIDEStore.getState();
    expect(root.children?.[0].children).toEqual([]);
    expect(state.fileTree).not.toBe(root);
    expect(state.fileTree?.children?.[0].children?.map((node) => node.path)).toEqual(['src/motor.st']);
    expect(state.loadedFiles.get('file:src/motor.st')?.isModified).toBe(true);
    expect(state.openTabs.filter((id) => id === 'file:src/motor.st')).toHaveLength(1);
  });

  it('preflights an existing physical file without creating or writing it', async () => {
    let creates = 0;
    let writables = 0;
    const existing = { createWritable: async () => { writables += 1; return {}; } } as unknown as FileSystemFileHandle;
    const source = tree();
    const src = { getFileHandle: async (_name: string, options?: FileSystemGetFileOptions) => { if (options?.create) creates += 1; return existing; } } as unknown as FileSystemDirectoryHandle;
    const root = { getDirectoryHandle: async () => src } as unknown as FileSystemDirectoryHandle;
    seedVirtual(source);
    useIDEStore.setState({ isVirtualProject: false, directoryHandle: root });

    await expect(useIDEStore.getState().createFile('motor', 'ST')).rejects.toThrow('already exists');
    expect({ creates, writables }).toEqual({ creates: 0, writables: 0 });
    expect(useIDEStore.getState().fileTree).toBe(source);
    expect(useIDEStore.getState().loadedFiles.has('file:src/motor.st')).toBe(false);
  });

  it('fails closed on physical folder permission errors without exposing their details', async () => {
    let creates = 0;
    const source = tree();
    const root = {
      getDirectoryHandle: async () => { throw new Error('/private/project/src permission denied'); },
      getFileHandle: async (_name: string, options?: FileSystemGetFileOptions) => { if (options?.create) creates += 1; return {} as FileSystemFileHandle; },
    } as unknown as FileSystemDirectoryHandle;
    seedVirtual(source);
    useIDEStore.setState({ isVirtualProject: false, directoryHandle: root });

    await expect(useIDEStore.getState().createFile('motor', 'ST')).rejects.toThrow('Check the name and folder access');
    expect(creates).toBe(0);
    expect(useIDEStore.getState().consoleEntries.at(-1)?.message).not.toContain('/private/project');
    expect(useIDEStore.getState().fileTree).toBe(source);
  });

  it('warns to refresh when a created physical entry fails while being written', async () => {
    let creates = 0;
    let writes = 0;
    let closes = 0;
    const source = tree();
    const handle = {
      createWritable: async () => ({
        write: async () => { writes += 1; },
        close: async () => { closes += 1; throw new Error('disk full'); },
      }),
    } as unknown as FileSystemFileHandle;
    const src = {
      getFileHandle: async (_name: string, options?: FileSystemGetFileOptions) => {
        if (options?.create) { creates += 1; return handle; }
        throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
      },
    } as unknown as FileSystemDirectoryHandle;
    seedVirtual(source);
    useIDEStore.setState({ isVirtualProject: false, directoryHandle: { getDirectoryHandle: async () => src } as unknown as FileSystemDirectoryHandle });
    useIDEStore.getState().clearConsole();

    await expect(useIDEStore.getState().createFile('motor', 'ST')).rejects.toThrow('The file may exist on disk. Refresh');
    expect({ creates, writes, closes }).toEqual({ creates: 1, writes: 1, closes: 1 });
    expect(useIDEStore.getState().fileTree).toBe(source);
    expect(useIDEStore.getState().loadedFiles.has('file:src/motor.st')).toBe(false);
    expect(useIDEStore.getState().consoleEntries.at(-1)?.message).toBe('The file may exist on disk. Refresh the project before trying again.');
    expect(useIDEStore.getState().consoleEntries.some((entry) => entry.message === 'Created: motor.st')).toBe(false);
  });

  it('rejects a missing logical parent before it touches the physical filesystem', async () => {
    let filesystemCalls = 0;
    const root = {
      getDirectoryHandle: async () => { filesystemCalls += 1; return {} as FileSystemDirectoryHandle; },
      getFileHandle: async () => { filesystemCalls += 1; return {} as FileSystemFileHandle; },
    } as unknown as FileSystemDirectoryHandle;
    seedVirtual(tree());
    useIDEStore.setState({ isVirtualProject: false, directoryHandle: root });

    await expect(useIDEStore.getState().createFile('motor', 'ST', 'missing')).rejects.toThrow('existing project folder');
    expect(filesystemCalls).toBe(0);
  });

  it('does not publish a physical creation into a replacement project', async () => {
    const traversal = deferred<FileSystemDirectoryHandle>();
    const source = tree();
    const root = { getDirectoryHandle: async () => traversal.promise } as unknown as FileSystemDirectoryHandle;
    seedVirtual(source);
    useIDEStore.setState({ isVirtualProject: false, directoryHandle: root, projectSession: 911 });
    useIDEStore.getState().clearConsole();

    const creating = useIDEStore.getState().createFile('motor', 'ST');
    replaceProject();
    traversal.resolve({ getFileHandle: async () => { throw Object.assign(new Error('missing'), { name: 'NotFoundError' }); } } as unknown as FileSystemDirectoryHandle);

    await expect(creating).rejects.toThrow('Project changed');
    expect(useIDEStore.getState().projectName).toBe('replacement');
    expect(useIDEStore.getState().consoleEntries.some((entry) => /Created: motor|Could not create/.test(entry.message))).toBe(false);
  });

  it('keeps latest buffers and tabs when a delayed physical creation succeeds', async () => {
    const traversal = deferred<FileSystemDirectoryHandle>();
    const source = tree();
    const root = { getDirectoryHandle: async () => traversal.promise } as unknown as FileSystemDirectoryHandle;
    seedVirtual(source);
    useIDEStore.setState({ isVirtualProject: false, directoryHandle: root, projectSession: 912 });

    const creating = useIDEStore.getState().createFile('motor', 'ST');
    const other = { id: 'file:src/other.st', name: 'other.st', path: 'src/other.st', parentPath: 'src', language: 'ST' as const, content: '', isModified: true };
    const refreshedTree = tree([{ id: other.id, name: other.name, type: 'file', path: other.path, language: other.language }]);
    useIDEStore.setState({ fileTree: refreshedTree, loadedFiles: new Map([[other.id, other]]), openTabs: [other.id], activeFileId: other.id });
    const newHandle = { createWritable: async () => ({ write: async () => {}, close: async () => {} }) } as unknown as FileSystemFileHandle;
    traversal.resolve({
      getFileHandle: async (_name: string, options?: FileSystemGetFileOptions) => {
        if (options?.create) return newHandle;
        throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
      },
    } as unknown as FileSystemDirectoryHandle);

    await expect(creating).resolves.toBe('file:src/motor.st');
    const state = useIDEStore.getState();
    expect(state.loadedFiles.has(other.id)).toBe(true);
    expect(state.openTabs).toEqual([other.id, 'file:src/motor.st']);
    expect(state.fileTree?.children?.[0].children?.map((node) => node.path)).toEqual(['src/other.st', 'src/motor.st']);
  });

  it('reserves a physical filename so concurrent creation only writes once', async () => {
    const absence = deferred<FileSystemFileHandle>();
    let creates = 0;
    let writes = 0;
    const source = tree();
    const fileHandle = { createWritable: async () => ({ write: async () => { writes += 1; }, close: async () => {} }) } as unknown as FileSystemFileHandle;
    const src = {
      getFileHandle: async (_name: string, options?: FileSystemGetFileOptions) => {
        if (options?.create) { creates += 1; return fileHandle; }
        return absence.promise;
      },
    } as unknown as FileSystemDirectoryHandle;
    seedVirtual(source);
    useIDEStore.setState({ isVirtualProject: false, directoryHandle: { getDirectoryHandle: async () => src } as unknown as FileSystemDirectoryHandle, projectSession: 913 });

    const first = useIDEStore.getState().createFile('motor', 'ST');
    await expect(useIDEStore.getState().createFile('motor', 'ST')).rejects.toThrow('already being created');
    absence.reject(Object.assign(new Error('missing'), { name: 'NotFoundError' }));
    await expect(first).resolves.toBe('file:src/motor.st');
    expect({ creates, writes }).toEqual({ creates: 1, writes: 1 });
  });
});
