import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import { compilerCompile } from '../cli/toolApi';
import { createProjectFiles } from '../../electron/projectFiles';
import { PROJECT_FILES_CHANNEL, PROJECT_FILES_OPS, PROJECT_RECENT_OPS, type ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import { createRecentProjects } from '../../electron/recentProjects';
import { isAllowedSessionLoadRequest, isAllowedSessionSaveRequest } from '../../electron/security';
import { createSessionStore } from '../../electron/sessionStore';
import type { SessionBridge, SessionState } from '../../electron/sessionStoreProtocol';
import { currentViewStates, flushSession, recordViewState, resetViewStates, startSessionPersistence, takePendingViewState } from './sessionPersistence';

import { DEFAULT_DEBUG_POLLING_INTERVAL_MS } from './debugDefaults';
import { WATCH_FORCE_STATE, type WatchForceEntry } from '../runtime/debugAdapter';
import type { NativeTraceSample } from '../runtime/nativeTrace';
import { DEFAULT_ZPLC_CONFIG, type FileTreeNode, type ProjectFileWithHandle, type ZPLCProjectV2 } from '../types';

/** A saved project is a v2 document; the store field is typed with the narrower config, so a typed value avoids the excess-property check. */
const v2Project = (name: string): ZPLCProjectV2 => ({ name, version: '1.0.0', schemaVersion: 2, tasks: [] });

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
await mock.module('../utils/projectLoader', () => ({
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
      isProjectOpen: true, projectSession: 77, compilerRunId: 9,
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
    isProjectOpen: true, projectName: name, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name },
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
    opi: [0, 0, 0, 0, 0, 0, 0, 0], ipi: [0, 0, 0, 0, 0, 0, 0, 0], programGeneration: 1, forceCount: 0, compilerRunId: 0, receivedAtMs: 0,
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
  it('clears the migration preview when a project closes or another folder replaces it', () => {
    useIDEStore.setState({ projectMigrationPreview: migrationPreview });

    useIDEStore.getState().closeProject();
    expect(useIDEStore.getState().projectMigrationPreview).toBeNull();

    useIDEStore.setState({ projectMigrationPreview: migrationPreview });
    replaceProject();
    expect(useIDEStore.getState().projectMigrationPreview).toBeNull();
  });

  it('exposes folder-backed example copying only', () => {
    expect(typeof useIDEStore.getState().copyExampleProjectToFolder).toBe('function');
    expect(typeof useIDEStore.getState().openProjectFromFolder).toBe('function');
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
      isProjectOpen: true, projectName: 'old-project', projectConfig: config, projectConfigDirty: false,
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
    } as unknown as FileSystemFileHandle;
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
    expect(current).toMatchObject({ directoryHandle: destination.handle, projectMigrationPreview: null, activeFileId: 'file:src/main.st', openTabs: ['file:src/main.st'] });
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

  describe('starting the Learn course from the Welcome screen', () => {
    function welcome() {
      useIDEStore.getState().clearForcedValues();
      useIDEStore.setState({
        isProjectOpen: false, projectName: null, projectConfigDirty: false, loadedFiles: new Map(), openTabs: [], projectOpenError: null,
        activeConsoleTab: 'output', isConsoleCollapsed: true,
      });
    }

    it('copies the starter through one picker, opens it and shows the Learn tab', async () => {
      seedExample();
      welcome();
      const destination = exampleDestination();
      let pickerCalls = 0;
      await withDirectoryPicker(async () => { pickerCalls += 1; return destination.handle; }, async () => {
        await expect(useIDEStore.getState().startLearning('motor_start_stop_starter')).resolves.toBe(true);
      });
      expect(pickerCalls).toBe(1);
      expect(destination.files.get('src/main.st')).toBe('PROGRAM Main END_PROGRAM');
      expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: true, projectName: 'Copied example', activeConsoleTab: 'learn', isConsoleCollapsed: false, projectOpenError: null });
    });

    it('changes nothing when the dialog is cancelled', async () => {
      seedExample();
      welcome();
      await withDirectoryPicker(null, async () => {
        await expect(useIDEStore.getState().startLearning('motor_start_stop_starter')).resolves.toBe(false);
      });
      expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: false, activeConsoleTab: 'output', isConsoleCollapsed: true, projectOpenError: null });
    });

    it('shows the failure in place and leaves the console alone when the starter cannot be loaded', async () => {
      loadedExample = null;
      welcome();
      let pickerCalls = 0;
      await withDirectoryPicker(async () => { pickerCalls += 1; return exampleDestination().handle; }, async () => {
        await expect(useIDEStore.getState().startLearning('motor_start_stop_starter')).resolves.toBe(false);
      });
      expect(pickerCalls).toBe(0);
      expect(useIDEStore.getState().projectOpenError).toBe('Failed to load example project: motor_start_stop_starter');
      expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: false });
      expect(useIDEStore.getState().activeConsoleTab).not.toBe('learn');
    });

    it('keeps the Learn tab hidden when the folder cannot be written', async () => {
      seedExample();
      welcome();
      const denied = Object.assign(new Error('The request is not allowed by the user agent'), { name: 'NotAllowedError' });
      await withDirectoryPicker(async () => { throw denied; }, async () => {
        await expect(useIDEStore.getState().startLearning('motor_start_stop_starter')).resolves.toBe(false);
      });
      expect(useIDEStore.getState().projectOpenError).toContain('Failed to copy example');
      expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: false, activeConsoleTab: 'output', isConsoleCollapsed: false });
    });
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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 100, workspaceScenarioLink: null });
    const state = useIDEStore.getState();

    expect(state.linkWorkspaceScenarios('workspace-token', 99)).toBe(false);
    expect(useIDEStore.getState().workspaceScenarioLink).toBeNull();
    expect(state.linkWorkspaceScenarios('workspace-token', 100)).toBe(true);
    expect(useIDEStore.getState().workspaceScenarioLink).toEqual({ workspaceId: 'workspace-token', projectSession: 100 });

    replaceProject();
    expect(useIDEStore.getState().workspaceScenarioLink).toBeNull();
    expect(useIDEStore.getState().projectSession).toBe(101);
    expect(useIDEStore.getState().linkWorkspaceScenarios('workspace-token', 101)).toBe(true);
  });

  it('does not clear a link or advance the session when close is blocked by force evidence', () => {
    const state = useIDEStore.getState();
    state.clearForcedValues();
    state.setForcedValue({ path: 'Motor.Enable', address: 16, size: 1, type: 'BOOL', bytesHex: '01', state: WATCH_FORCE_STATE.FORCED });
    useIDEStore.setState({ isProjectOpen: true, projectSession: 200, workspaceScenarioLink: { workspaceId: 'workspace-token', projectSession: 200 } });

    state.closeProject();
    expect(useIDEStore.getState()).toMatchObject({ projectSession: 200, workspaceScenarioLink: { workspaceId: 'workspace-token', projectSession: 200 } });
    state.clearForcedValues();
  });

  it('treats unsaved configuration as unsaved work and clears it only on replacement or successful save', () => {
    useIDEStore.setState({ projectConfig: v2Project('local'), projectConfigDirty: false, loadedFiles: new Map() });
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
      projectName: 'Unsaved project',
      projectConfig: v2Project('Unsaved project'),
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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 300, loadedFiles: new Map([[file.id, file]]) });

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
      isProjectOpen: true, projectSession: 300, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'legacy' },
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
      isProjectOpen: true, projectSession: 300, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'legacy' },
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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 301, projectConfig: config, projectConfigDirty: true, directoryHandle });

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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 302, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'before' }, projectConfigDirty: true, projectMigrationPreview: migrationPreview, directoryHandle });

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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 303, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'permission-query' }, projectConfigDirty: true, directoryHandle });

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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 304, projectConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'permission-request' }, projectConfigDirty: true, directoryHandle });

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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 305, loadedFiles: new Map([[first.id, first], [second.id, second]]) });

    const saving = useIDEStore.getState().saveAllFiles();
    await firstCloseStarted.promise;
    useIDEStore.setState({ isProjectOpen: true, projectSession: 306, loadedFiles: new Map([[replacement.id, replacement]]) });
    useIDEStore.getState().clearConsole();
    completeFirstClose.resolve();

    await expect(saving).resolves.toBeUndefined();
    expect(replacementWrites).toBe(0);
    expect(useIDEStore.getState().loadedFiles.get(replacement.id)).toBe(replacement);
    expect(useIDEStore.getState().consoleEntries).toEqual([]);
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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 801, fileTree: root, loadedFiles: new Map(), openTabs: [], activeFileId: null });

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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 810, fileTree: root, loadedFiles: new Map(), openTabs: [], activeFileId: null });

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
      isProjectOpen: true, projectSession: 802, fileTree: root,
      loadedFiles: new Map([[source.id, sourceFile]]), openTabs: [source.id], activeFileId: source.id,
      compilerMessages: [{ type: 'error', message: 'old', timestamp: new Date() }],
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

  it('prunes a deleted folder-backed file and returns the active-tab fallback', async () => {
    const first = fileNode('first');
    const second = fileNode('second');
    const src = { id: 'src', name: 'src', path: 'src', type: 'directory' as const, dirHandle: { removeEntry: async () => {} } as unknown as FileSystemDirectoryHandle, children: [first, second] };
    const root = tree([src]);
    const breakpoints = new Map([[second.id, new Set([3])]]);
    useIDEStore.setState({
      isProjectOpen: true, projectSession: 803, fileTree: root,
      loadedFiles: new Map([[first.id, loaded(first.id)], [second.id, loaded(second.id)]]),
      openTabs: [first.id, second.id], activeFileId: second.id,
      compilerMessages: [{ type: 'error', message: 'old', timestamp: new Date() }],
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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 804, fileTree: root, loadedFiles: new Map(), openTabs: [], activeFileId: null });

    const deleting = useIDEStore.getState().deleteFile(source.id);
    const replacement = tree([]);
    useIDEStore.setState({ projectSession: 805, fileTree: replacement, loadedFiles: new Map(), openTabs: [], activeFileId: null });
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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 807, fileTree: initialTree, loadedFiles: new Map(), openTabs: [], activeFileId: null });
    useIDEStore.setState({ isProjectOpen: true, projectSession: 808, fileTree: replacement, loadedFiles: new Map(), openTabs: [], activeFileId: null });

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
    const root = tree([{ id: 'src', name: 'src', path: 'src', type: 'directory', dirHandle: { removeEntry: async () => {} } as unknown as FileSystemDirectoryHandle, children: [source] }]);
    useIDEStore.setState({ isProjectOpen: true, projectSession: 806, fileTree: root, loadedFiles: new Map(), openTabs: [], activeFileId: null });

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
    useIDEStore.setState({ isProjectOpen: true, projectSession: 809, directoryHandle: handle, fileTree: root, loadedFiles: new Map(), openTabs: [], activeFileId: null });

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

  function seedFolder(root = tree(), directoryHandle: FileSystemDirectoryHandle | null = null): void {
    useIDEStore.setState({ isProjectOpen: true, projectSession: 910, directoryHandle, fileTree: root, loadedFiles: new Map(), openTabs: [], activeFileId: null });
  }

  it('requires a folder-backed project before creating files', async () => {
    useIDEStore.setState({ isProjectOpen: false, fileTree: null, loadedFiles: new Map() });
    await expect(useIDEStore.getState().createFile('motor', 'ST')).rejects.toThrow('Open a project');

    const original = fileNode('motor');
    const root = tree([original]);
    seedFolder(root);
    await expect(useIDEStore.getState().createFile('../motor', 'ST')).rejects.toThrow('single file name');
    await expect(useIDEStore.getState().createFile('motor', 'ST')).rejects.toThrow('cannot create files');
    expect(useIDEStore.getState().fileTree).toBe(root);
    expect(root.children?.[0].children).toEqual([original]);
  });

  it('creates a folder-backed file and opens one tab', async () => {
    const root = tree();
    const fileHandle = { createWritable: async () => ({ write: async () => {}, close: async () => {} }) } as unknown as FileSystemFileHandle;
    const src = { getFileHandle: async (_name: string, options?: FileSystemGetFileOptions) => {
      if (options?.create) return fileHandle;
      throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
    } } as unknown as FileSystemDirectoryHandle;
    seedFolder(root, { getDirectoryHandle: async () => src } as unknown as FileSystemDirectoryHandle);

    await expect(useIDEStore.getState().createFile(' motor ', 'ST')).resolves.toBe('file:src/motor.st');

    const state = useIDEStore.getState();
    expect(root.children?.[0].children).toEqual([]);
    expect(state.fileTree).not.toBe(root);
    expect(state.fileTree?.children?.[0].children?.map((node) => node.path)).toEqual(['src/motor.st']);
    expect(state.loadedFiles.get('file:src/motor.st')?.isModified).toBe(false);
    expect(state.openTabs.filter((id) => id === 'file:src/motor.st')).toHaveLength(1);
  });

  it('preflights an existing physical file without creating or writing it', async () => {
    let creates = 0;
    let writables = 0;
    const existing = { createWritable: async () => { writables += 1; return {}; } } as unknown as FileSystemFileHandle;
    const source = tree();
    const src = { getFileHandle: async (_name: string, options?: FileSystemGetFileOptions) => { if (options?.create) creates += 1; return existing; } } as unknown as FileSystemDirectoryHandle;
    const root = { getDirectoryHandle: async () => src } as unknown as FileSystemDirectoryHandle;
    seedFolder(source, root);

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
    seedFolder(source, root);

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
    seedFolder(source, { getDirectoryHandle: async () => src } as unknown as FileSystemDirectoryHandle);
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
    seedFolder(tree(), root);

    await expect(useIDEStore.getState().createFile('motor', 'ST', 'missing')).rejects.toThrow('existing project folder');
    expect(filesystemCalls).toBe(0);
  });

  it('does not publish a physical creation into a replacement project', async () => {
    const traversal = deferred<FileSystemDirectoryHandle>();
    const source = tree();
    const root = { getDirectoryHandle: async () => traversal.promise } as unknown as FileSystemDirectoryHandle;
    seedFolder(source, root);
    useIDEStore.setState({ projectSession: 911 });
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
    seedFolder(source, root);
    useIDEStore.setState({ projectSession: 912 });

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
    seedFolder(source, { getDirectoryHandle: async () => src } as unknown as FileSystemDirectoryHandle);
    useIDEStore.setState({ projectSession: 913 });

    const first = useIDEStore.getState().createFile('motor', 'ST');
    await expect(useIDEStore.getState().createFile('motor', 'ST')).rejects.toThrow('already being created');
    absence.reject(Object.assign(new Error('missing'), { name: 'NotFoundError' }));
    await expect(first).resolves.toBe('file:src/motor.st');
    expect({ creates, writes }).toEqual({ creates: 1, writes: 1 });
  });
});

describe('useIDEStore discarding a modified file', () => {
  const file = (id: string, name: string, isModified: boolean) => ({
    id, name, path: `src/${name}`, parentPath: 'src', language: 'ST' as const, content: `edited ${name}`, isModified,
  });

  it('drops the unsaved content, closes the tab and falls back to the previous tab', () => {
    useIDEStore.setState({
      loadedFiles: new Map([['a', file('a', 'A.st', false)], ['b', file('b', 'B.st', true)]]),
      openTabs: ['a', 'b'], activeFileId: 'b', projectConfigDirty: false,
    });

    useIDEStore.getState().discardFile('b');

    const state = useIDEStore.getState();
    expect([...state.loadedFiles.keys()]).toEqual(['a']);
    expect(state.openTabs).toEqual(['a']);
    expect(state.activeFileId).toBe('a');
    expect(state.hasUnsavedChanges()).toBe(false);
  });

  it('keeps the active tab when another tab is discarded', () => {
    useIDEStore.setState({
      loadedFiles: new Map([['a', file('a', 'A.st', true)], ['b', file('b', 'B.st', false)]]),
      openTabs: ['a', 'b'], activeFileId: 'b', projectConfigDirty: false,
    });

    useIDEStore.getState().discardFile('a');

    expect(useIDEStore.getState().openTabs).toEqual(['b']);
    expect(useIDEStore.getState().activeFileId).toBe('b');
  });
});

describe('useIDEStore folder open failures on the start screen', () => {
  async function withPicker(pick: () => Promise<FileSystemDirectoryHandle | null>, test: () => Promise<void>): Promise<void> {
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    if (!globalThis.window) Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis.window, 'showDirectoryPicker', { configurable: true, value: pick });
    try {
      await test();
    } finally {
      delete (globalThis.window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
      else delete (globalThis as { window?: unknown }).window;
    }
  }

  const denied = async () => { throw Object.assign(new Error('The request is not allowed by the user agent'), { name: 'NotAllowedError' }); };
  const cancelled = async () => { throw Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }); };

  function startScreen() {
    useIDEStore.setState({
      isProjectOpen: false, projectConfigDirty: false, loadedFiles: new Map(), projectOpenError: null,
    });
    useIDEStore.getState().clearForcedValues();
  }

  it('shows why a folder could not be opened, not only in the console', async () => {
    startScreen();
    await withPicker(denied, async () => {
      await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
    });
    expect(useIDEStore.getState().projectOpenError).toBe('Failed to open folder. Access to the folder was denied. Allow access to the folder and try again.');
    expect(useIDEStore.getState().consoleEntries.at(-1)).toMatchObject({ type: 'error', message: useIDEStore.getState().projectOpenError });
  });

  it('shows the failure of creating a project', async () => {
    startScreen();
    await withPicker(denied, async () => {
      await expect(useIDEStore.getState().createNewProjectInFolder()).resolves.toBe(false);
    });
    expect(useIDEStore.getState().projectOpenError).toBe('Failed to create project: Access to the folder was denied. Allow access to the folder and try again.');
  });

  it('treats a cancelled picker as a cancel and clears an earlier failure', async () => {
    startScreen();
    await withPicker(denied, async () => { await useIDEStore.getState().openProjectFromFolder(); });
    expect(useIDEStore.getState().projectOpenError).not.toBeNull();
    await withPicker(cancelled, async () => {
      await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
    });
    expect(useIDEStore.getState().projectOpenError).toBeNull();
  });

  it('shows the warning for a folder without zplc.json', async () => {
    startScreen();
    const missing = () => { throw Object.assign(new Error('Not found'), { name: 'NotFoundError' }); };
    const folder = { name: 'ordinary-folder', getFileHandle: async () => missing(), values: async function* () { yield* [] as FileSystemHandle[]; } } as unknown as FileSystemDirectoryHandle;
    await withPicker(async () => folder, async () => {
      await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
    });
    expect(useIDEStore.getState().projectOpenError).toContain('No zplc.json found');
  });

  it('can be dismissed', () => {
    useIDEStore.setState({ projectOpenError: 'Failed to open folder. Something.' });
    useIDEStore.getState().reportProjectOpenProblem('warning', 'second problem');
    expect(useIDEStore.getState().projectOpenError).toBe('second problem');
    useIDEStore.setState({ projectOpenError: null });
    expect(useIDEStore.getState().projectOpenError).toBeNull();
  });
});

describe('useIDEStore project folders over the project-files bridge', () => {
  let sandbox: string;
  let folder: string;
  let answer: string | null;
  let pickerCalls: number;

  beforeEach(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'zplc-store-bridge-')));
    folder = join(sandbox, 'plant');
    mkdirSync(folder);
    answer = folder;
    pickerCalls = 0;
    const files = createProjectFiles(async () => answer);
    const send = (channel: string, args: unknown[]) => files.handle(1, channel, args);
    const calls = PROJECT_FILES_OPS.map((op) => [op, (request: object) => send(PROJECT_FILES_CHANNEL[op], [request])] as const);
    const bridge = { chooseFolder: () => send(PROJECT_FILES_CHANNEL.chooseFolder, []), ...Object.fromEntries(calls) } as ProjectFilesBridge;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { electronAPI: { isElectron: true, projectFiles: bridge }, showDirectoryPicker: async () => { pickerCalls += 1; throw new Error('browser picker'); } },
    });
    useIDEStore.setState({ isProjectOpen: false, projectConfigDirty: false, loadedFiles: new Map(), fileTree: null, directoryHandle: null, projectOpenError: null, isConsoleCollapsed: false, activeConsoleTab: 'output' });
    useIDEStore.getState().clearForcedValues();
    useIDEStore.getState().clearConsole();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    rmSync(sandbox, { recursive: true, force: true });
  });

  const seedFolder = () => {
    writeFileSync(join(folder, 'zplc.json'), JSON.stringify({ ...DEFAULT_ZPLC_CONFIG, name: 'plant' }));
    mkdirSync(join(folder, 'src'));
    writeFileSync(join(folder, 'src', 'main.st'), 'PROGRAM Main\nEND_PROGRAM\n');
  };

  it('opens a folder, saves an edit to disk and reads it back after closing and opening again', async () => {
    seedFolder();
    await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(true);
    expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: true, projectName: 'plant', projectOpenError: null });
    await useIDEStore.getState().openFile('file:src/main.st');
    useIDEStore.getState().updateFileContent('file:src/main.st', 'PROGRAM Main\n  (* edited *)\nEND_PROGRAM\n');
    await expect(useIDEStore.getState().saveFile('file:src/main.st')).resolves.toBe(true);
    expect(readFileSync(join(folder, 'src', 'main.st'), 'utf8')).toContain('(* edited *)');

    expect(useIDEStore.getState().closeProject()).toBe(true);
    await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(true);
    await useIDEStore.getState().openFile('file:src/main.st');
    expect(useIDEStore.getState().loadedFiles.get('file:src/main.st')?.content).toContain('(* edited *)');
    expect(pickerCalls).toBe(0);
  });

  it('saves quietly for autosave: the file is written and no "Saved" line is added, while a manual save still reports', async () => {
    seedFolder();
    await useIDEStore.getState().openProjectFromFolder();
    await useIDEStore.getState().openFile('file:src/main.st');
    useIDEStore.getState().updateFileContent('file:src/main.st', 'PROGRAM Main\n  (* auto *)\nEND_PROGRAM\n');
    useIDEStore.getState().clearConsole();
    await useIDEStore.getState().saveAllFiles({ quiet: true });
    expect(readFileSync(join(folder, 'src', 'main.st'), 'utf8')).toContain('(* auto *)');
    expect(useIDEStore.getState().loadedFiles.get('file:src/main.st')?.isModified).toBe(false);
    expect(useIDEStore.getState().consoleEntries.some((entry) => entry.message.startsWith('Saved:'))).toBe(false);
    useIDEStore.getState().updateFileContent('file:src/main.st', 'PROGRAM Main\n  (* manual *)\nEND_PROGRAM\n');
    await useIDEStore.getState().saveFile('file:src/main.st');
    expect(useIDEStore.getState().consoleEntries.some((entry) => entry.message === 'Saved: main.st')).toBe(true);
  });

  describe('project tree operations (IDE-004)', () => {
    const open = async () => {
      seedFolder();
      writeFileSync(join(folder, 'src', 'Pump.st'), 'PROGRAM Pump\nEND_PROGRAM\n');
      await useIDEStore.getState().openProjectFromFolder();
      await useIDEStore.getState().openFile('file:src/main.st');
    };
    const consoleMessages = () => useIDEStore.getState().consoleEntries.map((entry) => entry.message);

    it('creates a folder, lists it while it is empty, and refuses a name that is taken or not a name', async () => {
      await open();
      await useIDEStore.getState().createFolder('src', 'drivers');
      expect(existsSync(join(folder, 'src', 'drivers'))).toBe(true);
      const src = useIDEStore.getState().fileTree!.children!.find((child) => child.name === 'src')!;
      expect(src.children!.map((child) => child.name)).toContain('drivers');
      await expect(useIDEStore.getState().createFolder('src', 'DRIVERS')).rejects.toThrow('already exists');
      await expect(useIDEStore.getState().createFolder('src', 'a/b')).rejects.toThrow('cannot contain');
      await expect(useIDEStore.getState().createFolder('src', '')).rejects.toThrow('Enter a name');
    });

    it('renames an open modified file on disk and keeps its buffer, its tab and the task that runs it', async () => {
      await open();
      useIDEStore.getState().updateFileContent('file:src/main.st', 'PROGRAM Main\n  (* unsaved *)\nEND_PROGRAM\n');
      await useIDEStore.getState().renameEntry('src/main.st', 'Drive.st');
      expect(existsSync(join(folder, 'src', 'main.st'))).toBe(false);
      expect(readFileSync(join(folder, 'src', 'Drive.st'), 'utf8')).toBe('PROGRAM Main\nEND_PROGRAM\n');
      const state = useIDEStore.getState();
      expect(state.loadedFiles.has('file:src/main.st')).toBe(false);
      expect(state.loadedFiles.get('file:src/Drive.st')).toMatchObject({ content: 'PROGRAM Main\n  (* unsaved *)\nEND_PROGRAM\n', isModified: true, name: 'Drive.st' });
      expect(state.openTabs).toEqual(['file:src/Drive.st']);
      expect(state.activeFileId).toBe('file:src/Drive.st');
      expect(state.projectConfig?.tasks[0]?.programs).toEqual(['Drive.st']);
      expect(JSON.parse(readFileSync(join(folder, 'zplc.json'), 'utf8')).tasks[0].programs).toEqual(['Drive.st']);
      // Saving the buffer goes to the new name, not back to the old one.
      await expect(state.saveFile('file:src/Drive.st')).resolves.toBe(true);
      expect(readFileSync(join(folder, 'src', 'Drive.st'), 'utf8')).toContain('(* unsaved *)');
      expect(existsSync(join(folder, 'src', 'main.st'))).toBe(false);
    });

    it('refuses a rename onto a name that exists, or that the build reads as the same, and leaves everything as it was', async () => {
      await open();
      await expect(useIDEStore.getState().renameEntry('src/main.st', 'pump.ST')).rejects.toThrow('already exists');
      await expect(useIDEStore.getState().renameEntry('src/main.st', 'a/b.st')).rejects.toThrow('cannot contain');
      expect(existsSync(join(folder, 'src', 'main.st'))).toBe(true);
      expect(useIDEStore.getState().loadedFiles.has('file:src/main.st')).toBe(true);
    });

    it('moves a file into a folder and a folder into another, keeping what is open, and refuses a folder into itself', async () => {
      await open();
      await useIDEStore.getState().createFolder('src', 'drivers');
      await useIDEStore.getState().moveEntry('src/main.st', 'src/drivers');
      expect(readFileSync(join(folder, 'src', 'drivers', 'main.st'), 'utf8')).toContain('PROGRAM Main');
      expect(useIDEStore.getState().loadedFiles.has('file:src/drivers/main.st')).toBe(true);
      expect(useIDEStore.getState().openTabs).toEqual(['file:src/drivers/main.st']);
      await useIDEStore.getState().createFolder('', 'archive');
      await useIDEStore.getState().moveEntry('src/drivers', 'archive');
      expect(existsSync(join(folder, 'archive', 'drivers', 'main.st'))).toBe(true);
      expect(useIDEStore.getState().openTabs).toEqual(['file:archive/drivers/main.st']);
      await expect(useIDEStore.getState().moveEntry('archive', 'archive/drivers')).rejects.toThrow('into itself');
      await expect(useIDEStore.getState().moveEntry('src/Pump.st', 'src')).rejects.toThrow('already there');
    });

    it('duplicates the content the user sees under a free name, and leaves the original as it was', async () => {
      await open();
      useIDEStore.getState().updateFileContent('file:src/main.st', 'PROGRAM Main\n  (* copy me *)\nEND_PROGRAM\n');
      const copy = await useIDEStore.getState().duplicateEntry('src/main.st');
      expect(copy).toBe('src/main_copy.st');
      expect(readFileSync(join(folder, 'src', 'main_copy.st'), 'utf8')).toContain('(* copy me *)');
      expect(readFileSync(join(folder, 'src', 'main.st'), 'utf8')).toBe('PROGRAM Main\nEND_PROGRAM\n');
      expect(useIDEStore.getState().loadedFiles.get('file:src/main.st')?.isModified).toBe(true);
      expect(await useIDEStore.getState().duplicateEntry('src/main.st')).toBe('src/main_copy2.st');
    });

    it('deletes a folder with what is in it, and closes the files that were open in it', async () => {
      await open();
      await useIDEStore.getState().createFolder('src', 'drivers');
      await useIDEStore.getState().moveEntry('src/Pump.st', 'src/drivers');
      await useIDEStore.getState().openFile('file:src/drivers/Pump.st');
      await useIDEStore.getState().deleteFolder('src/drivers');
      expect(existsSync(join(folder, 'src', 'drivers'))).toBe(false);
      expect(useIDEStore.getState().loadedFiles.has('file:src/drivers/Pump.st')).toBe(false);
      expect(useIDEStore.getState().openTabs).toEqual(['file:src/main.st']);
      expect(consoleMessages().some((message) => message.includes('Deleted folder'))).toBe(true);
    });
  });

  it('creates a project in an empty folder', async () => {
    await expect(useIDEStore.getState().createNewProjectInFolder()).resolves.toBe(true);
    expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: true, projectName: 'plant' });
    expect(existsSync(join(folder, 'zplc.json')) && existsSync(join(folder, 'src', 'main.st'))).toBe(true);
    expect(pickerCalls).toBe(0);
  });

  it('copies an example, and the Learn exercise, into a chosen folder and opens its first file', async () => {
    loadedExample = { zplcConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'Copied example' }, migrationPreview: null };
    loadedExampleAssets = [{ path: 'src/main.st', content: 'PROGRAM Main END_PROGRAM' }, { path: 'tests/main.scenario.json', content: '{"schemaVersion":1}' }];
    await expect(useIDEStore.getState().copyExampleProjectToFolder('example')).resolves.toBe(true);
    expect(readFileSync(join(folder, 'tests', 'main.scenario.json'), 'utf8')).toBe('{"schemaVersion":1}');
    expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: true, activeFileId: 'file:src/main.st', projectOpenError: null });
    expect(useIDEStore.getState().loadedFiles.get('file:src/main.st')?.content).toBe('PROGRAM Main END_PROGRAM');
    expect(pickerCalls).toBe(0);
  });

  it('shows nothing and changes nothing when the dialog is cancelled', async () => {
    loadedExample = { zplcConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'Copied example' }, migrationPreview: null };
    loadedExampleAssets = [{ path: 'src/main.st', content: 'PROGRAM Main END_PROGRAM' }];
    answer = null;
    const before = useIDEStore.getState().consoleEntries.length;
    await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
    await expect(useIDEStore.getState().createNewProjectInFolder()).resolves.toBe(false);
    await expect(useIDEStore.getState().copyExampleProjectToFolder('example')).resolves.toBe(false);
    expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: false, projectOpenError: null });
    expect(useIDEStore.getState().consoleEntries.length).toBe(before);
  });

  it('shows a short message without a path where the action started, on the start screen', async () => {
    answer = join(sandbox, 'missing');
    await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
    expect(useIDEStore.getState().projectOpenError).toBe('Failed to open folder. The folder, or a file in it, was not found.');
    await expect(useIDEStore.getState().createNewProjectInFolder()).resolves.toBe(false);
    expect(useIDEStore.getState().projectOpenError).toBe('Failed to create project: The folder, or a file in it, was not found.');
    expect(useIDEStore.getState().consoleEntries.map((entry) => entry.message).join('\n')).not.toContain(sandbox);
  });

  it('brings a failed open to the visible console of a workbench that already has a project', async () => {
    seedFolder();
    await useIDEStore.getState().openProjectFromFolder();
    useIDEStore.setState({ isConsoleCollapsed: true, activeConsoleTab: 'watch' });
    answer = join(sandbox, 'missing');
    await expect(useIDEStore.getState().openProjectFromFolder()).resolves.toBe(false);
    expect(useIDEStore.getState()).toMatchObject({ isProjectOpen: true, isConsoleCollapsed: false, activeConsoleTab: 'output' });
    expect(useIDEStore.getState().consoleEntries.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('Failed to open folder') });
  });

  it('keeps the Learn tab in view when copying its exercise fails: the panel shows the reason itself', async () => {
    loadedExample = { zplcConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'Copied example' }, migrationPreview: null };
    loadedExampleAssets = [{ path: 'src/main.st', content: 'PROGRAM Main END_PROGRAM' }];
    useIDEStore.setState({ isConsoleCollapsed: true, activeConsoleTab: 'learn' });
    answer = join(sandbox, 'missing');
    await expect(useIDEStore.getState().copyExampleProjectToFolder('example')).resolves.toBe(false);
    expect(useIDEStore.getState()).toMatchObject({ isConsoleCollapsed: false, activeConsoleTab: 'learn' });
    expect(useIDEStore.getState().projectOpenError).toBe('Failed to copy example: The folder, or a file in it, was not found.');
  });

  it('shows why a save failed in the visible console, with no path, and keeps the edit', async () => {
    seedFolder();
    await useIDEStore.getState().openProjectFromFolder();
    await useIDEStore.getState().openFile('file:src/main.st');
    useIDEStore.getState().updateFileContent('file:src/main.st', 'x'.repeat(16 * 1024 * 1024 + 1));
    useIDEStore.setState({ isConsoleCollapsed: true, activeConsoleTab: 'watch' });
    await expect(useIDEStore.getState().saveFile('file:src/main.st')).resolves.toBe(false);
    const state = useIDEStore.getState();
    expect(state).toMatchObject({ isConsoleCollapsed: false, activeConsoleTab: 'output' });
    expect(state.consoleEntries.at(-1)).toMatchObject({ type: 'error', message: 'Failed to save main.st: The file is larger than 16 MiB.' });
    expect(state.loadedFiles.get('file:src/main.st')?.isModified).toBe(true);
    expect(readFileSync(join(folder, 'src', 'main.st'), 'utf8')).toBe('PROGRAM Main\nEND_PROGRAM\n');
  });

  it('shows a failed project-configuration save in the visible console too', async () => {
    seedFolder();
    await useIDEStore.getState().openProjectFromFolder();
    rmSync(join(folder, 'zplc.json'));
    mkdirSync(join(folder, 'zplc.json'));
    useIDEStore.setState({ isConsoleCollapsed: true, activeConsoleTab: 'watch' });
    await useIDEStore.getState().saveProjectConfig();
    expect(useIDEStore.getState()).toMatchObject({ isConsoleCollapsed: false, activeConsoleTab: 'output' });
    expect(useIDEStore.getState().consoleEntries.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('Failed to save config') });
  });
});

describe('useIDEStore breakpoint binding', () => {
  const motorStartStop = fileURLToPath(new URL('../../projects/motor_start_stop', import.meta.url));
  // Lines of src/Motor.st (the header comment pushes everything down): `SealIn := FALSE;`, `Forward := SealIn;`, the
  // VAR_INPUT declaration and the END_IF. The two executable lines bind to PCs 56 and 104, which a comment-only edit keeps.
  const MOTOR_SEAL_IN_OFF_LINE = 38;
  const MOTOR_FORWARD_LINE = 46;
  const MOTOR_DECLARATION_LINE = 19;
  const MOTOR_END_IF_LINE = 44;
  const fileId = 'file:src/Motor.st';
  // The file exactly as an opened folder holds it: bare name, project-relative path.
  const motorFile: ProjectFileWithHandle = { id: fileId, name: 'Motor.st', path: 'src/Motor.st', parentPath: 'src', language: 'ST', content: '', isModified: false };

  afterEach(() => {
    useIDEStore.setState((state) => ({ loadedFiles: new Map(), debug: { ...state.debug, breakpoints: new Map(), debugMap: null } }));
  });

  // Fails without getAllBreakpointPCs keying the lookup by breakpointFileKey (the project path): the compiler records
  // sourceRef "src/Motor.st", so a bare "Motor.st" binds nothing and Run loads "0 breakpoints".
  it('turns the lines clicked in a folder-held file into the PCs the compiler assigned', async () => {
    const built = await compilerCompile(motorStartStop);
    if (!built.ok || !built.debugMap) throw new Error('motor_start_stop did not compile');
    useIDEStore.setState({ loadedFiles: new Map([[fileId, motorFile]]) });
    useIDEStore.getState().setBreakpoints(fileId, [MOTOR_SEAL_IN_OFF_LINE, MOTOR_FORWARD_LINE]);
    useIDEStore.getState().setDebugMap(built.debugMap);

    expect(useIDEStore.getState().getAllBreakpointPCs().sort((a, b) => a - b)).toEqual([56, 104]);
  });

  // Guards the fix against over-binding: only executable lines of the file the debug map names may bind.
  it('binds nothing for a declaration, an END_IF or a file the debug map does not know', async () => {
    const built = await compilerCompile(motorStartStop);
    if (!built.ok || !built.debugMap) throw new Error('motor_start_stop did not compile');
    const other: ProjectFileWithHandle = { ...motorFile, id: 'file:src/Other.st', name: 'Other.st', path: 'src/Other.st' };
    useIDEStore.setState({ loadedFiles: new Map([[fileId, motorFile], [other.id, other]]) });
    useIDEStore.getState().setBreakpoints(fileId, [MOTOR_DECLARATION_LINE, MOTOR_END_IF_LINE]);
    useIDEStore.getState().setBreakpoints(other.id, [MOTOR_SEAL_IN_OFF_LINE]);
    useIDEStore.getState().setDebugMap(built.debugMap);

    expect(useIDEStore.getState().getAllBreakpointPCs()).toEqual([]);
  });

  // Guards the fix: fails if the key becomes a path without the base-name fallback for maps that have no sourceRef.
  it('still binds a legacy debug map without sourceRef by POU name', async () => {
    const built = await compilerCompile(motorStartStop);
    if (!built.ok || !built.debugMap) throw new Error('motor_start_stop did not compile');
    const legacyPou = { ...built.debugMap.pou.Motor!, sourceRef: undefined };
    useIDEStore.setState({ loadedFiles: new Map([[fileId, motorFile]]) });
    useIDEStore.getState().setBreakpoints(fileId, [MOTOR_SEAL_IN_OFF_LINE, MOTOR_FORWARD_LINE]);
    useIDEStore.getState().setDebugMap({ ...built.debugMap, pou: { Motor: legacyPou } });

    expect(useIDEStore.getState().getAllBreakpointPCs().sort((a, b) => a - b)).toEqual([56, 104]);
  });
});

describe('useIDEStore breakpoint activity', () => {
  afterEach(() => {
    useIDEStore.getState().setBreakpointsInactiveReason(null);
  });

  // Fails without debug.breakpointsInactiveReason: the editor has nowhere to learn that its dots are not armed.
  it('starts with the dots active and keeps the reason the runtime refused them', () => {
    expect(useIDEStore.getState().debug.breakpointsInactiveReason).toBeNull();

    useIDEStore.getState().setBreakpointsInactiveReason('the runtime accepts breakpoints only in a program with one task');
    expect(useIDEStore.getState().debug.breakpointsInactiveReason).toContain('one task');

    useIDEStore.getState().setBreakpointsInactiveReason(null);
    expect(useIDEStore.getState().debug.breakpointsInactiveReason).toBeNull();
  });

  it('forgets the reason when the project closes', () => {
    useIDEStore.setState({ isProjectOpen: true, projectConfigDirty: false, loadedFiles: new Map() });
    useIDEStore.getState().setBreakpointsInactiveReason('the runtime refused them');

    expect(useIDEStore.getState().closeProject({ discardUnsaved: true })).toBe(true);

    expect(useIDEStore.getState().debug.breakpointsInactiveReason).toBeNull();
  });
});

describe('useIDEStore recent projects and session restore (IDE-008)', () => {
  let sandbox: string;
  let folder: string;
  let answer: string | null;
  let dialogCalls: number;
  let sessions: ReturnType<typeof createSessionStore>;
  let sessionFailure: boolean;
  let stopPersistence: (() => void) | null;

  beforeEach(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'zplc-store-recent-')));
    folder = join(sandbox, 'plant');
    mkdirSync(join(folder, 'src'), { recursive: true });
    writeFileSync(join(folder, 'zplc.json'), JSON.stringify({ ...DEFAULT_ZPLC_CONFIG, name: 'plant' }));
    for (const name of ['a', 'b', 'c']) writeFileSync(join(folder, 'src', `${name}.st`), `PROGRAM ${name}\nEND_PROGRAM\n`);
    answer = folder;
    dialogCalls = 0;
    sessionFailure = false;
    stopPersistence = null;
    const userData = join(sandbox, 'user-data');
    const recent = createRecentProjects(userData);
    sessions = createSessionStore(userData);
    const files = createProjectFiles(async () => { dialogCalls += 1; return answer; }, () => recent);
    const send = (channel: string, args: unknown[]) => files.handle(1, channel, args);
    const calls = [...PROJECT_FILES_OPS, ...PROJECT_RECENT_OPS.filter((op) => op !== 'listRecent')].map((op) => [op, (request: object) => send(PROJECT_FILES_CHANNEL[op], [request])] as const);
    const bridge = { chooseFolder: () => send(PROJECT_FILES_CHANNEL.chooseFolder, []), listRecent: () => send(PROJECT_FILES_CHANNEL.listRecent, []), ...Object.fromEntries(calls) } as ProjectFilesBridge;
    // What main.ts does for the two session channels: the sender and the message are checked, the folder is the window's own.
    const session: SessionBridge = {
      load: async (request) => {
        const root = isAllowedSessionLoadRequest(request) ? files.rootOf(1, request.rootId) : null;
        if (sessionFailure || root === null) throw new Error('Request denied');
        return sessions.load(root);
      },
      save: async (request) => {
        const root = isAllowedSessionSaveRequest(request) ? files.rootOf(1, request.rootId) : null;
        if (sessionFailure || root === null) throw new Error('Request denied');
        await sessions.save(root, request.state);
        return null;
      },
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { electronAPI: { isElectron: true, projectFiles: bridge, session }, addEventListener: () => undefined, removeEventListener: () => undefined },
    });
    useIDEStore.setState({
      isProjectOpen: false, projectConfigDirty: false, loadedFiles: new Map(), fileTree: null, directoryHandle: null, openTabs: [], activeFileId: null,
      projectOpenError: null, isConsoleCollapsed: false, activeConsoleTab: 'output', sessionLayout: null, recentProjects: [],
    });
    useIDEStore.getState().clearForcedValues();
    useIDEStore.getState().clearConsole();
    resetViewStates();
  });

  afterEach(() => {
    stopPersistence?.();
    resetViewStates();
    delete (globalThis as { window?: unknown }).window;
    rmSync(sandbox, { recursive: true, force: true });
  });

  const state = () => useIDEStore.getState();
  const until = async (check: () => Promise<boolean> | boolean) => { for (let attempt = 0; attempt < 100; attempt++) { if (await check()) return; await Bun.sleep(10); } throw new Error('condition not reached'); };
  const savedSession = () => sessions.load(folder);
  /** Opens the folder through the dialog, opens three files, and leaves b active with a cursor in each, saved. */
  async function workInTheProject(): Promise<void> {
    stopPersistence = startSessionPersistence(useIDEStore);
    await state().openProjectFromFolder();
    for (const name of ['a', 'b', 'c']) await state().openFile(`file:src/${name}.st`);
    state().setActiveFile('file:src/b.st');
    recordViewState('src/a.st', { line: 2, column: 3, scrollTop: 10 });
    recordViewState('src/b.st', { line: 1, column: 7, scrollTop: 0 });
    state().setSessionLayout({ editor: 55, console: 45 });
    flushSession();
    await until(async () => (await savedSession())?.panels?.editor === 55);
  }

  it('remembers a folder once it opened as a project, and not one without a zplc.json', async () => {
    rmSync(join(folder, 'zplc.json'));
    await state().openProjectFromFolder();
    await state().refreshRecentProjects();
    expect(state().recentProjects).toEqual([]);

    writeFileSync(join(folder, 'zplc.json'), JSON.stringify({ ...DEFAULT_ZPLC_CONFIG, name: 'plant' }));
    await expect(state().openProjectFromFolder()).resolves.toBe(true);
    await until(async () => { await state().refreshRecentProjects(); return state().recentProjects.length === 1; });
    expect(state().recentProjects[0]).toMatchObject({ displayName: 'plant', available: true });
  });

  it('remembers a created project and a copied example too', async () => {
    answer = join(sandbox, 'created');
    mkdirSync(answer);
    await expect(state().createNewProjectInFolder()).resolves.toBe(true);
    await until(async () => { await state().refreshRecentProjects(); return state().recentProjects.length === 1; });
    expect(state().recentProjects[0]!.displayName).toBe('created');

    expect(state().closeProject()).toBe(true);
    loadedExample = { zplcConfig: { ...DEFAULT_ZPLC_CONFIG, name: 'Copied example' }, migrationPreview: null };
    loadedExampleAssets = [{ path: 'src/main.st', content: 'PROGRAM Main END_PROGRAM' }];
    answer = join(sandbox, 'copied');
    mkdirSync(answer);
    await expect(state().copyExampleProjectToFolder('example')).resolves.toBe(true);
    await until(async () => { await state().refreshRecentProjects(); return state().recentProjects.length === 2; });
    expect(state().recentProjects.map((entry) => entry.displayName)).toEqual(['copied', 'created']);
  });

  it('reopens a remembered project without the dialog, as the same open project the dialog gives', async () => {
    await state().openProjectFromFolder();
    await until(async () => { await state().refreshRecentProjects(); return state().recentProjects.length === 1; });
    expect(state().closeProject()).toBe(true);
    const dialogCallsBefore = dialogCalls;

    await expect(state().openRecentProject(state().recentProjects[0]!.recentId)).resolves.toBe(true);
    expect(dialogCalls).toBe(dialogCallsBefore);
    expect(state()).toMatchObject({ isProjectOpen: true, projectName: 'plant', projectOpenError: null });
    expect(state().consoleEntries.map((entry) => entry.message).join('\n')).not.toContain(sandbox);
  });

  it('restores the tabs, the active tab, the cursors and the panels the user left', async () => {
    await workInTheProject();
    expect(state().closeProject()).toBe(true);
    resetViewStates(); // as after a restart: nothing of the previous run survives in memory
    useIDEStore.setState({ sessionLayout: null, isConsoleCollapsed: false });
    await state().refreshRecentProjects();

    await expect(state().openRecentProject(state().recentProjects[0]!.recentId)).resolves.toBe(true);
    expect(state().openTabs).toEqual(['file:src/a.st', 'file:src/b.st', 'file:src/c.st']);
    expect(state().activeFileId).toBe('file:src/b.st');
    expect([...state().loadedFiles.keys()].sort()).toEqual(['file:src/a.st', 'file:src/b.st', 'file:src/c.st']);
    expect(state().loadedFiles.get('file:src/a.st')?.content).toBe('PROGRAM a\nEND_PROGRAM\n');
    expect(state().sessionLayout).toEqual({ editor: 55, console: 45 });
    expect(takePendingViewState('src/a.st')).toEqual({ line: 2, column: 3, scrollTop: 10 });
    expect(takePendingViewState('src/b.st')).toEqual({ line: 1, column: 7, scrollTop: 0 });
  });

  it('restores the same session when the folder is opened through the dialog', async () => {
    await workInTheProject();
    expect(state().closeProject()).toBe(true);
    await expect(state().openProjectFromFolder()).resolves.toBe(true);
    expect(state().openTabs).toEqual(['file:src/a.st', 'file:src/b.st', 'file:src/c.st']);
    expect(state().activeFileId).toBe('file:src/b.st');
  });

  it('restores what the files hold on disk, never an edit that was not saved', async () => {
    await workInTheProject();
    state().updateFileContent('file:src/a.st', 'PROGRAM unsaved\nEND_PROGRAM\n');
    expect(state().closeProject({ discardUnsaved: true })).toBe(true);
    await state().openProjectFromFolder();
    expect(state().loadedFiles.get('file:src/a.st')?.content).toBe('PROGRAM a\nEND_PROGRAM\n');
    expect(state().loadedFiles.get('file:src/a.st')?.isModified).toBe(false);
  });

  it('silently drops a tab whose file is gone and falls back to a tab that is still there', async () => {
    await workInTheProject();
    expect(state().closeProject()).toBe(true);
    rmSync(join(folder, 'src', 'b.st'));
    const before = state().consoleEntries.length;
    await expect(state().openProjectFromFolder()).resolves.toBe(true);
    expect(state().openTabs).toEqual(['file:src/a.st', 'file:src/c.st']);
    expect(state().activeFileId).toBe('file:src/c.st');
    expect(state().projectOpenError).toBeNull();
    expect(state().consoleEntries.slice(before).map((entry) => entry.type)).not.toContain('error');
    expect(takePendingViewState('src/b.st')).toBeUndefined();
  });

  it('opens with no tabs, and no complaint, when there is no session, when the session cannot be read, or when the bridge fails', async () => {
    await expect(state().openProjectFromFolder()).resolves.toBe(true);
    expect(state().openTabs).toEqual([]);
    expect(state().closeProject()).toBe(true);
    await sessions.save(folder, { schemaVersion: 1, tabs: [{ path: 'src/a.st', line: 1, column: 1, scrollTop: 0 }], activePath: 'src/a.st', panels: null });
    sessionFailure = true;
    await expect(state().openProjectFromFolder()).resolves.toBe(true);
    expect(state()).toMatchObject({ openTabs: [], projectOpenError: null });
  });

  it('does not restore a session saved for another folder', async () => {
    await workInTheProject();
    expect(state().closeProject()).toBe(true);
    const other = join(sandbox, 'line');
    mkdirSync(join(other, 'src'), { recursive: true });
    writeFileSync(join(other, 'zplc.json'), JSON.stringify({ ...DEFAULT_ZPLC_CONFIG, name: 'line' }));
    answer = other;
    await expect(state().openProjectFromFolder()).resolves.toBe(true);
    expect(state().openTabs).toEqual([]);
  });

  it('shows an in-place problem, and keeps the Welcome screen, when a remembered folder is gone, and marks it unavailable', async () => {
    await state().openProjectFromFolder();
    await until(async () => { await state().refreshRecentProjects(); return state().recentProjects.length === 1; });
    const { recentId } = state().recentProjects[0]!;
    expect(state().closeProject()).toBe(true);
    rmSync(folder, { recursive: true });

    await expect(state().openRecentProject(recentId)).resolves.toBe(false);
    expect(state().isProjectOpen).toBe(false);
    expect(state().projectOpenError).toBe('Failed to open the recent project. The folder, or a file in it, was not found.');
    expect(state().consoleEntries.at(-1)).toMatchObject({ type: 'error' });
    await state().refreshRecentProjects();
    expect(state().recentProjects).toEqual([expect.objectContaining({ recentId, available: false })]);
  });

  it('forgets a remembered project and lists the rest', async () => {
    await state().openProjectFromFolder();
    await until(async () => { await state().refreshRecentProjects(); return state().recentProjects.length === 1; });
    await state().forgetRecentProject(state().recentProjects[0]!.recentId);
    expect(state().recentProjects).toEqual([]);
    await state().refreshRecentProjects();
    expect(state().recentProjects).toEqual([]);
  });

  it('lists nothing outside the desktop app, where there is no bridge', async () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    await state().refreshRecentProjects();
    expect(state().recentProjects).toEqual([]);
  });

  it('keeps the view states of one project from leaking into the next', async () => {
    await workInTheProject();
    expect(currentViewStates().size).toBe(2);
    expect(state().closeProject()).toBe(true);
    expect(currentViewStates().size).toBe(0);
    expect(await savedSession()).toMatchObject({ activePath: 'src/b.st' } satisfies Partial<SessionState>);
  });
});
