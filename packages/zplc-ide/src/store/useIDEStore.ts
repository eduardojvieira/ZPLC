/**
 * ZPLC global state store
 *
 * Uses Zustand for state management.
 * Supports File System Access API for opening real folders.
 */

import { create, type StoreApi } from 'zustand';
import type { ZPLCProjectV2, FileTreeNode, ProjectFileWithHandle } from '../types';
import { isFileSystemAccessSupported } from '../types';
import {
  openDirectoryPicker,
  readDirectoryRecursive,
  readProjectConfig,
  writeProjectConfig,
  loadFileFromTree,
  createNewProject,
  copyProjectToFolder,
  findFileInTree,
  fileTreeFileId,
} from '../utils/fileSystem';
import { getAvailableProjects, loadProject, loadProjectAssets } from '../utils/projectLoader';
import { appendConsoleEntries, SHOW_OUTPUT } from './consoleEntries';
import { createDebugActions } from './debugActions';
import { folderErrorReason } from '../utils/errorMessages';
import {
  forgetRecentProject as forgetRecentOnBridge,
  listRecentProjects,
  markProjectOpened,
  openRecentFolder,
  projectRootId,
} from '../ipc/projectFilesHandles';
import { loadSession } from '../ipc/sessionBridge';
import { planRestore, type ViewState, type WorkspaceLayout } from '../utils/sessionState';
import { flushSession, resetViewStates } from './sessionPersistence';
import { DEFAULT_DEBUG_POLLING_INTERVAL_MS } from './debugDefaults';
import type { Theme, IDEState } from './ideStoreTypes';
import { firstTreeFile } from './fileTreeLookup';
import { createFileActions } from './fileActions';
import { t } from '../i18n';
import { isWebBuild } from '../platform/webCapabilities';
import { forgetBrowserProject, listBrowserProjects, newBrowserProjectFolder, openBrowserProject } from '../platform/browserProjectStore';
export type { Theme, CompilerNavigationTarget, CloseProjectOptions, DebugMode, LiveValue, DebugState, IDEState } from './ideStoreTypes';

let openProjectIntent = 0;

// =============================================================================
// Theme Utilities
// =============================================================================

const THEME_STORAGE_KEY = 'zplc-ide-theme';

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'high-contrast' || stored === 'system') {
    return stored;
  }
  return 'system';
}

export function applyThemeToDOM(theme: Theme): void {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  root.classList.remove('light', 'dark', 'high-contrast');

  if (theme !== 'system') {
    root.classList.add(theme);
  }
  root.setAttribute(
    'data-theme',
    theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme,
  );

  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

// =============================================================================
// Opening a folder that already is a project, and restoring its session (IDE-008)
// =============================================================================

const projectFilesBridge = () => (typeof window === 'undefined' ? undefined : window.electronAPI?.projectFiles);

interface RestoredSession {
  files: Map<string, ProjectFileWithHandle>;
  openTabs: string[];
  activeFileId: string | null;
  viewStates: Map<string, ViewState>;
  layout: WorkspaceLayout | null;
  consoleCollapsed: boolean | null;
}

/**
 * The session the main process saved for this folder, applied to the files that are still there: tabs of files that
 * were deleted are dropped, and so are those that cannot be read. Never throws and never reports: no session is a project
 * that opens with no tabs. Only what the files hold on disk comes back, never unsaved content.
 */
async function restoreSession(dirHandle: FileSystemDirectoryHandle, tree: FileTreeNode): Promise<RestoredSession | null> {
  const bridge = typeof window === 'undefined' ? undefined : window.electronAPI?.session;
  const rootId = projectRootId(dirHandle);
  if (!bridge || rootId === null) return null;
  const saved = await loadSession(bridge, rootId);
  if (!saved) return null;
  const fileAt = (path: string) => {
    const node = findFileInTree(tree, path);
    return node?.type === 'file' ? node : null;
  };
  const plan = planRestore(saved, (path) => fileAt(path) !== null);
  const files = new Map<string, ProjectFileWithHandle>();
  const paths: string[] = [];
  for (const path of plan.tabPaths) {
    try {
      const loaded = await loadFileFromTree(fileAt(path)!);
      if (loaded) {
        files.set(loaded.id, loaded);
        paths.push(path);
      }
    } catch {
      // An unreadable file is a tab that does not come back.
    }
  }
  const openTabs = paths.map(fileTreeFileId);
  const activeFileId =
    plan.activePath !== null && paths.includes(plan.activePath) ? fileTreeFileId(plan.activePath) : (openTabs.at(-1) ?? null);
  return {
    files,
    openTabs,
    activeFileId,
    layout: plan.layout,
    consoleCollapsed: plan.consoleCollapsed,
    viewStates: new Map([...plan.viewStates].filter(([path]) => paths.includes(path))),
  };
}

/**
 * Opens a folder that is already a project, from the dialog or from the recent list: reads zplc.json and the tree,
 * restores the session, shows the project, and has the main process remember the folder. `pick` answers the folder
 * (null when the user cancelled).
 */
async function openExistingProject(
  set: StoreApi<IDEState>['setState'],
  get: StoreApi<IDEState>['getState'],
  pick: () => Promise<FileSystemDirectoryHandle | null>,
  failure: string,
): Promise<boolean> {
  set({ projectOpenError: null });
  const blockUnsafeOpen = (): boolean => {
    const debug = get().debug;
    if (debug.forcedValues.size > 0 || debug.forcesUnconfirmed) {
      set({ activeConsoleTab: 'watch', isConsoleCollapsed: false });
      get().reportProjectOpenProblem('warning', t('store.releaseBeforeClose'));
      return true;
    }
    if (get().hasUnsavedChanges()) {
      get().reportProjectOpenProblem('warning', 'Save or discard changes before opening another folder.');
      return true;
    }
    return false;
  };

  if (blockUnsafeOpen()) return false;
  const expectedProjectSession = get().projectSession;
  const intent = ++openProjectIntent;
  const isCurrent = () => openProjectIntent === intent && get().projectSession === expectedProjectSession;

  if (!isFileSystemAccessSupported()) {
    if (!isCurrent()) return false;
    get().reportProjectOpenProblem('error', 'File System Access API not supported. Use a browser with folder access.');
    return false;
  }

  try {
    // The folder of the window is about to be replaced: the session of the project it holds goes out first.
    void flushSession();
    const dirHandle = await pick();
    if (!isCurrent()) return false;
    if (!dirHandle) return false;

    get().addConsoleEntry({ type: 'info', message: t('store.openingFolder', { name: dirHandle.name }), source: 'system' });

    const readResult = await readProjectConfig(dirHandle);
    if (!isCurrent()) return false;
    if (readResult.kind === 'invalid') {
      get().reportProjectOpenProblem('error', 'Invalid zplc.json. The existing configuration was not changed.');
      return false;
    }

    let config: ZPLCProjectV2;
    if (readResult.kind === 'valid') {
      config = readResult.config;
    } else {
      get().reportProjectOpenProblem(
        'warning',
        'No zplc.json found. This folder was not changed. Use New Project to create a project in an empty folder.',
      );
      return false;
    }

    const fileTree = await readDirectoryRecursive(dirHandle);
    if (!isCurrent()) return false;
    const restored = await restoreSession(dirHandle, fileTree);
    if (!isCurrent()) return false;
    if (blockUnsafeOpen()) return false;

    resetViewStates(restored?.viewStates);
    set({
      isProjectOpen: true,
      projectName: config.name,
      projectConfig: config,
      projectMigrationPreview:
        readResult.changes.length > 0
          ? { sourceSchemaVersion: readResult.sourceSchemaVersion, targetSchemaVersion: 2, changes: readResult.changes }
          : null,
      directoryHandle: dirHandle,
      fileTree,
      loadedFiles: restored?.files ?? new Map(),
      activeFileId: restored?.activeFileId ?? null,
      openTabs: restored?.openTabs ?? [],
      sessionLayout: restored?.layout ?? null,
      ...(restored?.consoleCollapsed != null ? { isConsoleCollapsed: restored.consoleCollapsed } : {}),
      projectSession: expectedProjectSession + 1,
      workspaceScenarioLink: null,
      canonicalWorkspaceBuildEvidence: null,
      projectConfigDirty: false,
      compilerMessages: [],
      compilerMessagesChecked: false,
      compilerNavigationTarget: null,
      compilerRunId: get().compilerRunId + 1,
    });

    if (openProjectIntent !== intent || get().projectSession !== expectedProjectSession + 1) return false;
    get().addConsoleEntry({ type: 'success', message: t('store.openedProject', { name: config.name }), source: 'system' });
    const bridge = projectFilesBridge();
    if (bridge) void markProjectOpened(bridge, dirHandle);
    return true;
  } catch (error) {
    if (!isCurrent()) return false;
    get().reportProjectOpenProblem('error', `${failure} ${folderErrorReason(error)}`);
    return false;
  }
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useIDEStore = create<IDEState>((set, get, api) => ({
  // Initial State - No project open
  theme: getStoredTheme(),
  isProjectOpen: false,
  projectName: null,
  projectConfig: null,
  projectSession: 0,
  workspaceScenarioLink: null,
  projectConfigDirty: false,
  projectMigrationPreview: null,
  directoryHandle: null,
  fileTree: null,
  loadedFiles: new Map(),
  activeFileId: null,
  openTabs: [],
  projectOpenError: null,
  recentProjects: [],
  sessionLayout: null,

  connection: {
    status: 'disconnected',
    device: null,
    plcState: 'unknown',
    lastError: null,
    cycleTime: null,
    uptime: null,
  },

  controllerInfo: null,
  controllerStatus: null,

  consoleEntries: [
    {
      id: '1',
      type: 'info',
      message: t('store.ready'),
      timestamp: new Date(),
      source: 'system',
    },
  ],
  activeConsoleTab: 'output',
  compilerMessages: [],
  compilerMessagesChecked: false,
  compilerRunId: 0,
  compilerNavigationTarget: null,
  stBufferDiagnostics: null,
  canonicalWorkspaceBuildEvidence: null,

  consoleHeight: 200,
  isConsoleCollapsed: false,
  showSettings: false,

  // Initial Debug State
  debug: {
    mode: 'none',
    debugMap: null,
    breakpoints: new Map(),
    breakpointsInactiveReason: null,
    currentLine: null,
    currentPOU: null,
    currentPC: null,
    watchVariables: [],
    liveValues: new Map(),
    forcedValues: new Map(),
    forcesUnconfirmed: false,
    nativeTrace: [],
    isPolling: false,
    pollingInterval: DEFAULT_DEBUG_POLLING_INTERVAL_MS,
    mpeekEnabled: false,
  },

  // ==========================================================================
  // Theme Actions
  // ==========================================================================

  setTheme: (theme) => {
    applyThemeToDOM(theme);
    set({ theme });
  },

  // ==========================================================================
  // Project Management Actions
  // ==========================================================================

  reportProjectOpenProblem: (type, message) => {
    get().addConsoleEntry({ type, message, source: 'system' });
    // The Welcome screen and the Learn panel show projectOpenError; elsewhere the workbench shows the console, so an error brings it into
    // view (IDE-003).
    if (type !== 'error') set({ projectOpenError: message });
    else
      set({
        projectOpenError: message,
        isConsoleCollapsed: false,
        ...(get().activeConsoleTab === 'learn' ? {} : { activeConsoleTab: 'output' as const }),
      });
  },

  openProjectFromFolder: () => openExistingProject(set, get, openDirectoryPicker, 'Failed to open folder.'),

  openRecentProject: (recentId) =>
    openExistingProject(
      set,
      get,
      async () => {
        const bridge = projectFilesBridge();
        if (!bridge && isWebBuild()) return openBrowserProject(recentId);
        if (!bridge) throw new Error('Recent projects are only available in the desktop app.');
        return openRecentFolder(bridge, recentId);
      },
      'Failed to open the recent project.',
    ),

  refreshRecentProjects: async () => {
    const bridge = projectFilesBridge();
    set({ recentProjects: bridge ? await listRecentProjects(bridge) : isWebBuild() ? await listBrowserProjects() : [] });
  },

  forgetRecentProject: async (recentId) => {
    const bridge = projectFilesBridge();
    if (bridge) await forgetRecentOnBridge(bridge, recentId);
    else if (isWebBuild()) await forgetBrowserProject(recentId);
    set({ recentProjects: get().recentProjects.filter((entry) => entry.recentId !== recentId) });
    await get().refreshRecentProjects();
  },

  setSessionLayout: (layout) => set({ sessionLayout: layout }),

  createNewProjectInFolder: async (options) => {
    set({ projectOpenError: null });
    if (!isFileSystemAccessSupported()) {
      get().reportProjectOpenProblem('error', 'File System Access API not supported. Use a browser with folder access.');
      return false;
    }

    try {
      void flushSession();
      const dirHandle = options?.handle ?? (await openDirectoryPicker());
      if (!dirHandle) {
        return false;
      }

      get().addConsoleEntry({ type: 'info', message: t('store.creatingProject', { name: dirHandle.name }), source: 'system' });

      const config = await createNewProject(dirHandle, options?.name ?? dirHandle.name, options);
      const fileTree = await readDirectoryRecursive(dirHandle);

      resetViewStates();
      set({
        isProjectOpen: true,
        projectName: config.name,
        projectConfig: config,
        projectMigrationPreview: null,
        directoryHandle: dirHandle,
        fileTree,
        loadedFiles: new Map(),
        activeFileId: null,
        openTabs: [],
        sessionLayout: null,
        projectSession: get().projectSession + 1,
        workspaceScenarioLink: null,
        canonicalWorkspaceBuildEvidence: null,
        projectConfigDirty: false,
        compilerMessages: [],
        compilerMessagesChecked: false,
        compilerNavigationTarget: null,
        compilerRunId: get().compilerRunId + 1,
      });

      get().addConsoleEntry({
        type: 'success',
        message: t('store.createdProject', { name: config.name }),
        source: 'system',
      });
      const bridge = projectFilesBridge();
      if (bridge) void markProjectOpened(bridge, dirHandle);

      return true;
    } catch (err) {
      get().reportProjectOpenProblem('error', `Failed to create project: ${folderErrorReason(err)}`);
      return false;
    }
  },

  copyExampleProjectToFolder: async (projectId: string, folder) => {
    set({ projectOpenError: null });
    const blockUnsafeOpen = (): boolean => {
      const debug = get().debug;
      if (debug.forcedValues.size > 0 || debug.forcesUnconfirmed) {
        set({ activeConsoleTab: 'watch', isConsoleCollapsed: false });
        get().reportProjectOpenProblem('warning', t('store.releaseBeforeClose'));
        return true;
      }
      if (get().hasUnsavedChanges()) {
        get().reportProjectOpenProblem('warning', 'Save or discard changes before opening another folder.');
        return true;
      }
      return false;
    };
    if (blockUnsafeOpen()) return false;
    const expectedProjectSession = get().projectSession;
    const intent = ++openProjectIntent;
    const isCurrent = () => openProjectIntent === intent && get().projectSession === expectedProjectSession;
    if (!isFileSystemAccessSupported()) {
      get().reportProjectOpenProblem('error', 'File System Access API not supported. Use a browser with folder access.');
      return false;
    }
    const loaded = loadProject(projectId);
    const assets = loadProjectAssets(projectId);
    if (!loaded || !assets) {
      get().reportProjectOpenProblem('error', `Failed to load example project: ${projectId}`);
      return false;
    }
    try {
      void flushSession();
      // The web build keeps an example in the store of the browser, with no dialog: it is a copy the person can edit and find again.
      const chosen = folder
        ? await folder()
        : isWebBuild()
          ? { handle: await newBrowserProjectFolder(loaded.zplcConfig.name), seed: true }
          : await openDirectoryPicker().then((handle) => handle && { handle, seed: true });
      if (!isCurrent() || !chosen) return false;
      const dirHandle = chosen.handle;
      get().addConsoleEntry({
        type: 'info',
        message: `${chosen.seed ? 'Copying example to' : 'Reopening'}: ${dirHandle.name}...`,
        source: 'system',
      });
      if (chosen.seed) await copyProjectToFolder(dirHandle, loaded.zplcConfig, assets);
      if (!isCurrent()) return false;
      const readResult = await readProjectConfig(dirHandle);
      if (!isCurrent() || readResult.kind !== 'valid') throw new Error('copied project could not be read back');
      const fileTree = await readDirectoryRecursive(dirHandle);
      if (!isCurrent() || blockUnsafeOpen()) return false;
      const firstFile = firstTreeFile(fileTree);
      const firstLoadedFile = firstFile ? await loadFileFromTree(firstFile) : null;
      if (!isCurrent()) return false;
      const loadedFiles = new Map<string, ProjectFileWithHandle>();
      if (firstLoadedFile) loadedFiles.set(firstLoadedFile.id, firstLoadedFile);
      resetViewStates();
      set({
        isProjectOpen: true,
        projectName: readResult.config.name,
        projectConfig: readResult.config,
        projectMigrationPreview: null,
        directoryHandle: dirHandle,
        fileTree,
        loadedFiles,
        activeFileId: firstLoadedFile?.id ?? null,
        openTabs: firstLoadedFile ? [firstLoadedFile.id] : [],
        sessionLayout: null,
        projectSession: expectedProjectSession + 1,
        workspaceScenarioLink: null,
        canonicalWorkspaceBuildEvidence: null,
        projectConfigDirty: false,
        compilerMessages: [],
        compilerMessagesChecked: false,
        compilerNavigationTarget: null,
        compilerRunId: get().compilerRunId + 1,
      });
      if (openProjectIntent !== intent || get().projectSession !== expectedProjectSession + 1) return false;
      get().addConsoleEntry({ type: 'success', message: t('store.copiedExample', { name: readResult.config.name }), source: 'system' });
      const bridge = projectFilesBridge();
      if (bridge) void markProjectOpened(bridge, dirHandle);
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      get().reportProjectOpenProblem('error', `Failed to copy example: ${folderErrorReason(error)}`);
      return false;
    }
  },

  startLearning: async (starterExampleId: string) => {
    const opened = await get().copyExampleProjectToFolder(starterExampleId);
    // A cancelled dialog or a failure (shown where it happened) leaves the console as it was.
    if (opened) set({ activeConsoleTab: 'learn', isConsoleCollapsed: false });
    return opened;
  },

  getExampleProjects: () => {
    return getAvailableProjects();
  },

  closeProject: (options = {}) => {
    const currentDebug = get().debug;
    if (currentDebug.forcedValues.size > 0 || currentDebug.forcesUnconfirmed) {
      set({ activeConsoleTab: 'watch', isConsoleCollapsed: false });
      get().addConsoleEntry({
        type: 'warning',
        message: t('store.releaseBeforeClose'),
        source: 'system',
      });
      return false;
    }

    if (get().hasUnsavedChanges() && !options.discardUnsaved) return false;

    // The session of the project goes out before its state is cleared.
    void flushSession();
    resetViewStates();
    set({
      sessionLayout: null,
      isProjectOpen: false,
      projectName: null,
      projectConfig: null,
      projectMigrationPreview: null,
      directoryHandle: null,
      fileTree: null,
      loadedFiles: new Map(),
      activeFileId: null,
      openTabs: [],
      projectSession: get().projectSession + 1,
      workspaceScenarioLink: null,
      canonicalWorkspaceBuildEvidence: null,
      projectConfigDirty: false,
      compilerMessages: [],
      compilerMessagesChecked: false,
      compilerNavigationTarget: null,
      compilerRunId: get().compilerRunId + 1,
      // Reset debug state when closing project
      debug: {
        mode: 'none',
        debugMap: null,
        breakpoints: new Map(),
        breakpointsInactiveReason: null,
        currentLine: null,
        currentPOU: null,
        currentPC: null,
        watchVariables: [],
        liveValues: new Map(),
        forcedValues: new Map(),
        forcesUnconfirmed: false,
        nativeTrace: [],
        isPolling: false,
        pollingInterval: DEFAULT_DEBUG_POLLING_INTERVAL_MS,
        mpeekEnabled: false,
      },
    });

    get().addConsoleEntry({
      type: 'info',
      message: t('store.projectClosed'),
      source: 'system',
    });
    return true;
  },

  updateProjectConfig: (updates) =>
    set((state) => ({
      projectConfig: state.projectConfig ? { ...state.projectConfig, ...updates } : null,
      projectConfigDirty: Boolean(state.projectConfig),
      compilerMessages: [],
      compilerMessagesChecked: false,
      compilerNavigationTarget: null,
      compilerRunId: state.compilerRunId + 1,
    })),

  linkWorkspaceScenarios: (workspaceId, expectedProjectSession) => {
    const state = get();
    if (!workspaceId || !state.isProjectOpen || state.projectSession !== expectedProjectSession) {
      return false;
    }
    set({ workspaceScenarioLink: { workspaceId, projectSession: expectedProjectSession }, canonicalWorkspaceBuildEvidence: null });
    return true;
  },

  recordCanonicalWorkspaceBuildEvidence: (evidence) => {
    let recorded = false;
    set((state) => {
      const link = state.workspaceScenarioLink;
      if (
        !state.isProjectOpen ||
        state.projectSession !== evidence.projectSession ||
        state.compilerRunId !== evidence.compilerRunId ||
        link?.projectSession !== evidence.projectSession ||
        link.workspaceId !== evidence.workspaceId ||
        evidence.zplc.kind !== 'zplc' ||
        !/^[a-f0-9]{64}$/.test(evidence.zplc.sha256) ||
        !Number.isSafeInteger(evidence.zplc.byteLength) ||
        evidence.zplc.byteLength <= 0
      )
        return {};
      recorded = true;
      return { canonicalWorkspaceBuildEvidence: evidence };
    });
    return recorded;
  },

  saveProjectConfig: async () => {
    const { directoryHandle, projectConfig } = get();
    const expectedProjectSession = get().projectSession;
    const isCurrentProjectSession = () => get().projectSession === expectedProjectSession;

    if (!projectConfig) {
      get().addConsoleEntry({
        type: 'warning',
        message: t('store.noConfigToSave'),
        source: 'system',
      });
      return;
    }

    if (!directoryHandle) {
      get().addConsoleEntry({
        type: 'error',
        message: t('store.noDirectoryHandle'),
        source: 'system',
      });
      return;
    }

    try {
      // Verify we still have write permission
      const permission = await directoryHandle.queryPermission({ mode: 'readwrite' });
      if (!isCurrentProjectSession()) return;

      if (permission !== 'granted') {
        // Try to request permission again
        const requestResult = await directoryHandle.requestPermission({ mode: 'readwrite' });
        if (!isCurrentProjectSession()) return;
        if (requestResult !== 'granted') {
          get().addConsoleEntry({
            type: 'error',
            message: t('store.writeDenied'),
            source: 'system',
          });
          return;
        }
      }

      const canonicalConfig = await writeProjectConfig(directoryHandle, projectConfig);
      const latest = get();
      if (latest.projectSession === expectedProjectSession && latest.projectConfig === projectConfig) {
        set({ projectConfig: canonicalConfig, projectConfigDirty: false, projectMigrationPreview: null });
        get().addConsoleEntry({
          type: 'success',
          message: t('store.savedConfig'),
          source: 'system',
        });
      }
    } catch (err) {
      if (!isCurrentProjectSession()) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      get().addConsoleEntry({
        type: 'error',
        message: t('store.saveConfigFailed', { message }),
        source: 'system',
      });
      set(SHOW_OUTPUT);
    }
  },

  ...createFileActions(set, get, api),

  // ==========================================================================
  // Connection Actions
  // ==========================================================================

  setConnectionStatus: (status) =>
    set((state) => ({
      connection: { ...state.connection, status },
    })),

  setPlcState: (plcState) =>
    set((state) => ({
      connection: { ...state.connection, plcState },
    })),

  // ==========================================================================
  // Controller Actions
  // ==========================================================================

  setControllerInfo: (info) => set({ controllerInfo: info }),

  setControllerStatus: (status) => set({ controllerStatus: status }),

  clearControllerState: () =>
    set({
      controllerInfo: null,
      controllerStatus: null,
    }),

  // ==========================================================================
  // Console Actions
  // ==========================================================================

  addConsoleEntry: (entry) =>
    set((state) => ({
      consoleEntries: appendConsoleEntries(state.consoleEntries, [entry]),
    })),

  addConsoleEntries: (entries) =>
    set((state) => ({
      consoleEntries: appendConsoleEntries(state.consoleEntries, entries),
    })),

  clearConsole: () => set({ consoleEntries: [] }),

  setActiveConsoleTab: (tab) => set({ activeConsoleTab: tab }),

  addCompilerMessage: (message) =>
    set((state) => ({
      compilerMessages: [...state.compilerMessages, { ...message, timestamp: new Date() }],
      compilerMessagesChecked: true,
    })),

  markCompilerMessagesChecked: () => set({ compilerMessagesChecked: true }),

  clearCompilerMessages: () =>
    set((state) => ({
      compilerMessages: [],
      compilerMessagesChecked: false,
      compilerNavigationTarget: null,
      compilerRunId: state.compilerRunId + 1,
    })),

  setSTBufferDiagnostics: (result, expectedContent) => {
    let accepted = false;
    set((state) => {
      const file = state.loadedFiles.get(result.fileId);
      if (
        !state.isProjectOpen ||
        state.projectSession !== result.projectSession ||
        state.compilerRunId !== result.compilerRunId ||
        state.activeFileId !== result.fileId ||
        !file ||
        file.language !== 'ST' ||
        file.path !== result.file ||
        file.content !== expectedContent
      )
        return {};
      accepted = true;
      return { stBufferDiagnostics: result };
    });
    return accepted;
  },

  clearSTBufferDiagnostics: (identity) =>
    set((state) => {
      const current = state.stBufferDiagnostics;
      if (!current || !identity) return { stBufferDiagnostics: null };
      return current.projectSession === identity.projectSession &&
        current.compilerRunId === identity.compilerRunId &&
        current.fileId === identity.fileId &&
        current.file === identity.file
        ? { stBufferDiagnostics: null }
        : {};
    }),

  navigateToCompilerDiagnostic: async (file, line, column) => {
    if (!file || line < 1) return false;
    const tree = get().fileTree;
    const compilerRunId = get().compilerRunId;
    const node = tree ? findFileInTree(tree, file) : null;
    if (!node || node.type !== 'file' || node.path !== file) return false;
    await get().openFile(node.id);
    const opened = get().loadedFiles.get(node.id);
    if (
      !opened ||
      opened.path !== file ||
      get().activeFileId !== node.id ||
      get().fileTree !== tree ||
      get().compilerRunId !== compilerRunId
    )
      return false;
    set({ showSettings: false, compilerNavigationTarget: { file, line, column: Math.max(1, column) } });
    return true;
  },

  consumeCompilerNavigationTarget: (target) =>
    set((state) => (state.compilerNavigationTarget === target ? { compilerNavigationTarget: null } : {})),

  // ==========================================================================
  // UI Actions
  // ==========================================================================

  setConsoleHeight: (height) => set({ consoleHeight: height }),
  toggleConsole: () => set((state) => ({ isConsoleCollapsed: !state.isConsoleCollapsed })),
  toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),

  ...createDebugActions(set, get, api),

  // ==========================================================================
  // Computed Helpers
  // ==========================================================================

  getActiveFile: () => {
    const { activeFileId, loadedFiles } = get();
    if (!activeFileId) return null;
    return loadedFiles.get(activeFileId) || null;
  },

  getFile: (fileId: string) => {
    return get().loadedFiles.get(fileId);
  },

  hasUnsavedChanges: () => {
    const { loadedFiles, projectConfigDirty } = get();
    if (projectConfigDirty) return true;
    for (const file of loadedFiles.values()) {
      if (file.isModified) return true;
    }
    return false;
  },
}));

// =============================================================================
// Theme Initialization
// =============================================================================

export function initializeTheme(): void {
  const theme = getStoredTheme();
  applyThemeToDOM(theme);
}
