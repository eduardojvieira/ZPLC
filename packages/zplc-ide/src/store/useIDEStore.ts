/**
 * ZPLC IDE Global State Store
 * 
 * Uses Zustand for state management.
 * Supports File System Access API for opening real folders.
 */

import { create } from 'zustand';
import type {
  ConnectionState,
  ConsoleEntry,
  ConsoleTab,
  PLCLanguage,
  CompilerMessage,
  STBufferDiagnostics,
  ZPLCProjectConfig,
  ZPLCProjectV2,
  FileTreeNode,
  ProjectFileWithHandle,
} from '../types';
import {
  getExtensionForLanguage,
  createEmptyFileContent,
  isFileSystemAccessSupported,
} from '../types';
import {
  openDirectoryPicker,
  readDirectoryRecursive,
  readProjectConfig,
  writeProjectConfig,
  loadFileFromTree,
  writeFileContent,
  createNewProject,
  copyProjectToFolder,
  toggleDirectoryExpanded,
  findFileInTree,
  fileTreeFileId,
} from '../utils/fileSystem';
import {
  getAvailableProjects,
  loadProject,
  loadProjectAssets,
} from '../utils/projectLoader';
import type { ProjectInfo } from '../utils/projectLoader';
import type { SystemInfo, StatusInfo } from '../runtime/serialAdapter';
import type { DebugMap } from '../compiler';
import { WATCH_FORCE_STATE, type WatchForceEntry } from '../runtime/debugAdapter';
import type { ProjectMigrationChange } from '../project/projectModel';
import { getBreakpointPCForLine } from '../components/codeEditorBreakpoints';
import { appendConsoleEntries, type NewConsoleEntry } from './consoleEntries';
import { DEFAULT_DEBUG_POLLING_INTERVAL_MS } from './debugDefaults';
import { NATIVE_TRACE_LIMIT, type NativeTraceSample } from '../runtime/nativeTrace';
import type { CanonicalWorkspaceBuildEvidence } from '../components/workspaceTestPresentation';

let openFileIntent = 0;
let fileTreeRefreshIntent = 0;
let openProjectIntent = 0;
const fileCreationReservations = new Set<string>();

function findTreeFileById(tree: FileTreeNode, fileId: string): FileTreeNode | null {
  if (tree.id === fileId && tree.type === 'file') return tree;
  for (const child of tree.children ?? []) {
    const found = findTreeFileById(child, fileId);
    if (found) return found;
  }
  return null;
}

function resolveTreeFile(tree: FileTreeNode, fileId: string): FileTreeNode | null {
  return findTreeFileById(tree, fileId);
}

function firstTreeFile(tree: FileTreeNode): FileTreeNode | null {
  if (tree.type === 'file') return tree;
  for (const child of tree.children ?? []) {
    const found = firstTreeFile(child);
    if (found) return found;
  }
  return null;
}

function findTreeFileWithParent(tree: FileTreeNode, fileId: string): { node: FileTreeNode; parent: FileTreeNode } | null {
  const node = resolveTreeFile(tree, fileId);
  if (!node) return null;

  const visit = (parent: FileTreeNode): { node: FileTreeNode; parent: FileTreeNode } | null => {
    for (const child of parent.children ?? []) {
      if (child === node) return { node: child, parent };
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };

  return visit(tree);
}

function pruneTreeFile(tree: FileTreeNode, fileId: string): FileTreeNode | null {
  let changed = false;
  const children = (tree.children ?? []).flatMap((child) => {
    if (child.type === 'file' && child.id === fileId) {
      changed = true;
      return [];
    }
    const pruned = pruneTreeFile(child, fileId);
    if (pruned) {
      changed = true;
      return [pruned];
    }
    return [child];
  });

  if (!changed) return null;
  return { ...tree, children };
}

function appendTreeFile(tree: FileTreeNode, parentPath: string, file: FileTreeNode): FileTreeNode | null {
  if (tree.type === 'directory' && tree.path === parentPath) {
    return { ...tree, children: [...(tree.children ?? []), file] };
  }

  let changed = false;
  const children = (tree.children ?? []).map((child) => {
    const updated = child.type === 'directory' ? appendTreeFile(child, parentPath, file) : null;
    if (!updated) return child;
    changed = true;
    return updated;
  });
  return changed ? { ...tree, children } : null;
}

function isSafePathSegment(value: string): boolean {
  return value.length > 0 && value !== '.' && value !== '..' && !/[\\/\0]/.test(value);
}

// =============================================================================
// Theme Types
// =============================================================================

export type Theme = 'light' | 'dark' | 'system';
export interface CompilerNavigationTarget { file: string; line: number; column: number; }
export interface CloseProjectOptions { discardUnsaved?: boolean; }

// =============================================================================
// Debug State Types
// =============================================================================

/**
 * Debug mode - how the IDE is connected for debugging
 */
export type DebugMode = 'none' | 'simulation' | 'hardware';

/**
 * Live value that can be displayed in the IDE
 */
export type LiveValue = number | boolean | string;

/**
 * Debug state for the IDE
 * 
 * This tracks all debugging-related state including:
 * - Debug map from compilation (variable locations, source mappings)
 * - Active breakpoints (by file and line)
 * - Current execution state when paused
 * - Watch variables and their live values
 */
export interface DebugState {
  /** Current debug mode (none, simulation, or hardware) */
  mode: DebugMode;
  
  /** Debug map from last compilation */
  debugMap: DebugMap | null;
  
  /** 
   * Active breakpoints indexed by file ID.
   * Value is a Set of line numbers with breakpoints.
   */
  breakpoints: Map<string, Set<number>>;
  
  /** Current execution line when paused (null if running or not debugging) */
  currentLine: number | null;
  
  /** Current POU name when paused */
  currentPOU: string | null;
  
  /** Current PC (program counter) when paused */
  currentPC: number | null;
  
  /** Watch variable paths (e.g., "MyTimer.ET", "Counter") */
  watchVariables: string[];
  
  /** 
   * Live values cache for watched variables.
   * Key is the variable path, value is the current value.
   */
  liveValues: Map<string, LiveValue>;

  /** Active forced watch entries indexed by variable path. */
  forcedValues: Map<string, WatchForceEntry>;

  /** True when a hardware disconnect prevented force-state reconciliation. */
  forcesUnconfirmed: boolean;

  /** Bounded, host-only samples from the active native POSIX session. */
  nativeTrace: NativeTraceSample[];
  
  /** Whether the debugger is currently polling for live values */
  isPolling: boolean;
  
  /** Polling interval in milliseconds (default: 500ms) */
  pollingInterval: number;

  /**
   * Whether the mpeek fast-poll path is enabled.
   * Only meaningful in hardware mode. Requires the new firmware with
   * `zplc dbg mpeek` support to be flashed. Off by default.
   */
  mpeekEnabled: boolean;
}

// =============================================================================
// Store Interface
// =============================================================================

interface IDEState {
  // Theme State
  theme: Theme;

  // Project State - File System Based
  isProjectOpen: boolean;
  isVirtualProject: boolean;             // True if in-memory only (Firefox fallback)
  projectName: string | null;
  projectConfig: ZPLCProjectConfig | null;
  /** Monotonic identity for the currently open project session. */
  projectSession: number;
  /** Ephemeral desktop-test capability for one physical project session. */
  workspaceScenarioLink: { workspaceId: string; projectSession: number } | null;
  /** Evidence for the exact saved-workspace build; invalidated by session/run/link fences. */
  canonicalWorkspaceBuildEvidence: CanonicalWorkspaceBuildEvidence | null;
  /** Configuration differs from the last successful disk save. */
  projectConfigDirty: boolean;
  projectMigrationPreview: { sourceSchemaVersion: 1 | 2; targetSchemaVersion: 2; changes: ProjectMigrationChange[] } | null;
  directoryHandle: FileSystemDirectoryHandle | null;
  fileTree: FileTreeNode | null;
  
  // Files (loaded on demand)
  loadedFiles: Map<string, ProjectFileWithHandle>;
  activeFileId: string | null;
  openTabs: string[];                    // File IDs of open tabs

  // Connection State
  connection: ConnectionState;

  // Controller State (from device JSON APIs)
  controllerInfo: SystemInfo | null;
  controllerStatus: StatusInfo | null;

  // Console State
  consoleEntries: ConsoleEntry[];
  activeConsoleTab: ConsoleTab;
  compilerMessages: CompilerMessage[];
  /** True after the current compiler result has reported diagnostics or completed cleanly. */
  compilerMessagesChecked: boolean;
  compilerRunId: number;
  compilerNavigationTarget: CompilerNavigationTarget | null;
  /** Current editor-only ST syntax result. It is not compiler/build evidence. */
  stBufferDiagnostics: STBufferDiagnostics | null;

  // UI State
  consoleHeight: number;
  isConsoleCollapsed: boolean;
  showSettings: boolean;

  // Debug State
  debug: DebugState;

  // Actions - Theme
  setTheme: (theme: Theme) => void;

  // Actions - Project Management (File System)
  openProjectFromFolder: () => Promise<boolean>;
  createNewProjectInFolder: () => Promise<boolean>;
  copyExampleProjectToFolder: (projectId: string) => Promise<boolean>;
  getExampleProjects: () => ProjectInfo[];
  closeProject: (options?: CloseProjectOptions) => boolean;
  updateProjectConfig: (updates: Partial<ZPLCProjectConfig>) => void;
  saveProjectConfig: () => Promise<void>;
  linkWorkspaceScenarios: (workspaceId: string, expectedProjectSession: number) => boolean;
  recordCanonicalWorkspaceBuildEvidence: (evidence: CanonicalWorkspaceBuildEvidence) => boolean;

  // Actions - File Tree
  toggleDirectory: (dirPath: string) => void;
  refreshFileTree: () => Promise<void>;

  // Actions - Files
  openFile: (fileId: string) => Promise<void>;
  saveFile: (fileId: string) => Promise<boolean>;
  saveAllFiles: () => Promise<void>;
  createFile: (name: string, language: PLCLanguage, parentPath?: string) => Promise<string>;
  deleteFile: (fileId: string, expectedProjectSession?: number) => Promise<boolean>;
  setActiveFile: (fileId: string | null) => void;
  updateFileContent: (fileId: string, content: string) => void;
  closeTab: (fileId: string) => void;

  // Actions - Connection
  setConnectionStatus: (status: ConnectionState['status']) => void;
  setPlcState: (state: ConnectionState['plcState']) => void;

  // Actions - Controller
  setControllerInfo: (info: SystemInfo | null) => void;
  setControllerStatus: (status: StatusInfo | null) => void;
  clearControllerState: () => void;

  // Actions - Console
  addConsoleEntry: (entry: Omit<ConsoleEntry, 'id' | 'timestamp'>) => void;
  addConsoleEntries: (entries: NewConsoleEntry[]) => void;
  clearConsole: () => void;
  setActiveConsoleTab: (tab: ConsoleTab) => void;
  addCompilerMessage: (message: Omit<CompilerMessage, 'timestamp'>) => void;
  markCompilerMessagesChecked: () => void;
  clearCompilerMessages: () => void;
  setSTBufferDiagnostics: (result: STBufferDiagnostics, expectedContent: string) => boolean;
  clearSTBufferDiagnostics: (identity?: Pick<STBufferDiagnostics, 'projectSession' | 'compilerRunId' | 'fileId' | 'file'>) => void;
  navigateToCompilerDiagnostic: (file: string, line: number, column: number) => Promise<boolean>;
  consumeCompilerNavigationTarget: (target: CompilerNavigationTarget) => void;

  // Actions - UI
  setConsoleHeight: (height: number) => void;
  toggleConsole: () => void;
  toggleSettings: () => void;

  // Actions - Debug
  setDebugMode: (mode: DebugMode) => void;
  setDebugMap: (map: DebugMap | null) => void;
  toggleBreakpoint: (fileId: string, line: number) => void;
  setBreakpoints: (fileId: string, lines: number[]) => void;
  clearBreakpoints: (fileId?: string) => void;
  setCurrentExecution: (pou: string | null, line: number | null, pc: number | null) => void;
  addWatchVariable: (varPath: string) => void;
  removeWatchVariable: (varPath: string) => void;
  clearWatchVariables: () => void;
  updateLiveValue: (varPath: string, value: LiveValue) => void;
  updateLiveValues: (values: Map<string, LiveValue>) => void;
  clearLiveValues: () => void;
  setForcedValue: (entry: WatchForceEntry) => void;
  clearForcedValue: (varPath: string) => void;
  markForcedValuesUnconfirmed: () => void;
  clearForcedValues: () => void;
  appendNativeTrace: (sample: NativeTraceSample) => void;
  clearNativeTrace: () => void;
  setPolling: (isPolling: boolean) => void;
  setPollingInterval: (interval: number) => void;
  toggleMpeek: () => void;
  getBreakpointsForFile: (fileId: string) => Set<number>;
  getAllBreakpointPCs: () => number[];

  // Computed helpers
  getActiveFile: () => ProjectFileWithHandle | null;
  getFile: (fileId: string) => ProjectFileWithHandle | undefined;
  hasUnsavedChanges: () => boolean;
}

// =============================================================================
// Theme Utilities
// =============================================================================

const THEME_STORAGE_KEY = 'zplc-ide-theme';

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

function applyThemeToDOM(theme: Theme): void {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  root.classList.remove('light', 'dark');

  if (theme !== 'system') {
    root.classList.add(theme);
  }

  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useIDEStore = create<IDEState>((set, get) => ({
  // Initial State - No project open
  theme: getStoredTheme(),
  isProjectOpen: false,
  isVirtualProject: false,
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
      message: 'ZPLC IDE ready',
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

  openProjectFromFolder: async () => {
    const blockUnsafeOpen = (): boolean => {
      const debug = get().debug;
      if (debug.forcedValues.size > 0 || debug.forcesUnconfirmed) {
        set({ activeConsoleTab: 'watch', isConsoleCollapsed: false });
        get().addConsoleEntry({ type: 'warning', message: 'Release or verify all forces before closing the project.', source: 'system' });
        return true;
      }
      if (get().hasUnsavedChanges()) {
        get().addConsoleEntry({ type: 'warning', message: 'Save or discard changes before opening another folder.', source: 'system' });
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
      get().addConsoleEntry({
        type: 'error',
        message: 'File System Access API not supported. Use a browser with folder access.',
        source: 'system',
      });
      return false;
    }

    try {
      const dirHandle = await openDirectoryPicker();
      if (!isCurrent()) return false;
      if (!dirHandle) return false;

      get().addConsoleEntry({ type: 'info', message: `Opening folder: ${dirHandle.name}...`, source: 'system' });

      const readResult = await readProjectConfig(dirHandle);
      if (!isCurrent()) return false;
      if (readResult.kind === 'invalid') {
        get().addConsoleEntry({ type: 'error', message: 'Invalid zplc.json. The existing configuration was not changed.', source: 'system' });
        return false;
      }

      let config: ZPLCProjectV2;
      if (readResult.kind === 'valid') {
        config = readResult.config;
      } else {
        get().addConsoleEntry({
          type: 'warning',
          message: 'No zplc.json found. This folder was not changed. Use New Project to create a project in an empty folder.',
          source: 'system',
        });
        return false;
      }

      const fileTree = await readDirectoryRecursive(dirHandle);
      if (!isCurrent()) return false;
      if (blockUnsafeOpen()) return false;

      set({
        isProjectOpen: true,
        isVirtualProject: false,
        projectName: config.name,
        projectConfig: config,
        projectMigrationPreview: readResult.changes.length > 0
          ? { sourceSchemaVersion: readResult.sourceSchemaVersion, targetSchemaVersion: 2, changes: readResult.changes }
          : null,
        directoryHandle: dirHandle,
        fileTree,
        loadedFiles: new Map(),
        activeFileId: null,
        openTabs: [],
        projectSession: expectedProjectSession + 1,
        workspaceScenarioLink: null,
        canonicalWorkspaceBuildEvidence: null,
        projectConfigDirty: false,
        compilerMessages: [], compilerMessagesChecked: false, compilerNavigationTarget: null, compilerRunId: get().compilerRunId + 1,
      });

      if (openProjectIntent !== intent || get().projectSession !== expectedProjectSession + 1) return false;
      get().addConsoleEntry({ type: 'success', message: `Opened project: ${config.name}`, source: 'system' });
      return true;
    } catch {
      if (!isCurrent()) return false;
      get().addConsoleEntry({
        type: 'error',
        message: 'Failed to open folder. Check access and project files, then try again.',
        source: 'system',
      });
      return false;
    }
  },

  createNewProjectInFolder: async () => {
    if (!isFileSystemAccessSupported()) {
      get().addConsoleEntry({
        type: 'error',
        message: 'File System Access API not supported. Use a browser with folder access.',
        source: 'system',
      });
      return false;
    }

    try {
      const dirHandle = await openDirectoryPicker();
      if (!dirHandle) {
        return false;
      }

      get().addConsoleEntry({
        type: 'info',
        message: `Creating new project in: ${dirHandle.name}...`,
        source: 'system',
      });

      const config = await createNewProject(dirHandle, dirHandle.name);
      const fileTree = await readDirectoryRecursive(dirHandle);

      set({
        isProjectOpen: true,
        isVirtualProject: false,
        projectName: config.name,
        projectConfig: config,
        projectMigrationPreview: null,
        directoryHandle: dirHandle,
        fileTree,
        loadedFiles: new Map(),
        activeFileId: null,
        openTabs: [],
        projectSession: get().projectSession + 1,
        workspaceScenarioLink: null,
        canonicalWorkspaceBuildEvidence: null,
        projectConfigDirty: false,
        compilerMessages: [], compilerMessagesChecked: false, compilerNavigationTarget: null, compilerRunId: get().compilerRunId + 1,
      });

      get().addConsoleEntry({
        type: 'success',
        message: `Created new project: ${config.name}`,
        source: 'system',
      });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      get().addConsoleEntry({
        type: 'error',
        message: `Failed to create project: ${message}`,
        source: 'system',
      });
      return false;
    }
  },

  copyExampleProjectToFolder: async (projectId: string) => {
    const blockUnsafeOpen = (): boolean => {
      const debug = get().debug;
      if (debug.forcedValues.size > 0 || debug.forcesUnconfirmed) {
        set({ activeConsoleTab: 'watch', isConsoleCollapsed: false });
        get().addConsoleEntry({ type: 'warning', message: 'Release or verify all forces before closing the project.', source: 'system' });
        return true;
      }
      if (get().hasUnsavedChanges()) {
        get().addConsoleEntry({ type: 'warning', message: 'Save or discard changes before opening another folder.', source: 'system' });
        return true;
      }
      return false;
    };
    if (blockUnsafeOpen()) return false;
    const expectedProjectSession = get().projectSession;
    const intent = ++openProjectIntent;
    const isCurrent = () => openProjectIntent === intent && get().projectSession === expectedProjectSession;
    if (!isFileSystemAccessSupported()) {
      get().addConsoleEntry({ type: 'error', message: 'File System Access API not supported. Use a browser with folder access.', source: 'system' });
      return false;
    }
    const loaded = loadProject(projectId);
    const assets = loadProjectAssets(projectId);
    if (!loaded || !assets) {
      get().addConsoleEntry({
        type: 'error',
        message: `Failed to load example project: ${projectId}`,
        source: 'system',
      });
      return false;
    }
    try {
      const dirHandle = await openDirectoryPicker();
      if (!isCurrent() || !dirHandle) return false;
      get().addConsoleEntry({ type: 'info', message: `Copying example to: ${dirHandle.name}...`, source: 'system' });
      await copyProjectToFolder(dirHandle, loaded.zplcConfig, assets);
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
      set({
        isProjectOpen: true,
        isVirtualProject: false,
        projectName: readResult.config.name,
        projectConfig: readResult.config,
        projectMigrationPreview: null,
        directoryHandle: dirHandle,
        fileTree,
        loadedFiles,
        activeFileId: firstLoadedFile?.id ?? null,
        openTabs: firstLoadedFile ? [firstLoadedFile.id] : [],
        projectSession: expectedProjectSession + 1,
        workspaceScenarioLink: null,
        canonicalWorkspaceBuildEvidence: null,
        projectConfigDirty: false,
        compilerMessages: [], compilerMessagesChecked: false, compilerNavigationTarget: null, compilerRunId: get().compilerRunId + 1,
      });
      if (openProjectIntent !== intent || get().projectSession !== expectedProjectSession + 1) return false;
      get().addConsoleEntry({ type: 'success', message: `Copied example project: ${readResult.config.name}`, source: 'system' });
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      get().addConsoleEntry({ type: 'error', message: `Failed to copy example: ${message}`, source: 'system' });
      return false;
    }
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
        message: 'Release or verify all forces before closing the project.',
        source: 'system',
      });
      return false;
    }

    if (get().hasUnsavedChanges() && !options.discardUnsaved) return false;

    set({
      isProjectOpen: false,
      isVirtualProject: false,
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
      message: 'Project closed',
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
    if (!workspaceId || !state.isProjectOpen || state.isVirtualProject || state.projectSession !== expectedProjectSession) {
      return false;
    }
    set({ workspaceScenarioLink: { workspaceId, projectSession: expectedProjectSession }, canonicalWorkspaceBuildEvidence: null });
    return true;
  },

  recordCanonicalWorkspaceBuildEvidence: (evidence) => {
    let recorded = false;
    set((state) => {
      const link = state.workspaceScenarioLink;
      if (!state.isProjectOpen || state.isVirtualProject
        || state.projectSession !== evidence.projectSession || state.compilerRunId !== evidence.compilerRunId
        || link?.projectSession !== evidence.projectSession || link.workspaceId !== evidence.workspaceId
        || evidence.zplc.kind !== 'zplc' || !/^[a-f0-9]{64}$/.test(evidence.zplc.sha256)
        || !Number.isSafeInteger(evidence.zplc.byteLength) || evidence.zplc.byteLength <= 0) return {};
      recorded = true;
      return { canonicalWorkspaceBuildEvidence: evidence };
    });
    return recorded;
  },

  saveProjectConfig: async () => {
    const { directoryHandle, projectConfig, isVirtualProject } = get();
    const expectedProjectSession = get().projectSession;
    const isCurrentProjectSession = () => get().projectSession === expectedProjectSession;
    
    if (!projectConfig) {
      get().addConsoleEntry({
        type: 'warning',
        message: 'No project configuration to save',
        source: 'system',
      });
      return;
    }

    if (isVirtualProject) {
      // Virtual/example projects can't save to disk
      // But we can still update the in-memory state (already done via updateConfig)
      get().addConsoleEntry({
        type: 'warning',
        message: 'Virtual project - settings updated in memory only. Use "Open Folder" to save to disk.',
        source: 'system',
      });
      return;
    }

    if (!directoryHandle) {
      get().addConsoleEntry({
        type: 'error',
        message: 'No directory handle - cannot save configuration',
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
            message: 'Write permission denied. Please grant access to save.',
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
          message: 'Saved zplc.json',
          source: 'system',
        });
      }
    } catch (err) {
      if (!isCurrentProjectSession()) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      get().addConsoleEntry({
        type: 'error',
        message: `Failed to save config: ${message}`,
        source: 'system',
      });
    }
  },

  // ==========================================================================
  // File Tree Actions
  // ==========================================================================

  toggleDirectory: (dirPath: string) => {
    const { fileTree } = get();
    if (!fileTree) return;

    const newTree = toggleDirectoryExpanded(fileTree, dirPath);
    set({ fileTree: newTree });
  },

  refreshFileTree: async () => {
    const { directoryHandle, projectSession } = get();
    if (!directoryHandle) return;
    const intent = ++fileTreeRefreshIntent;

    try {
      const fileTree = await readDirectoryRecursive(directoryHandle);
      const current = get();
      if (fileTreeRefreshIntent !== intent || current.projectSession !== projectSession || current.directoryHandle !== directoryHandle) return;
      set({ fileTree });
    } catch (err) {
      console.error('Failed to refresh file tree:', err);
    }
  },

  // ==========================================================================
  // File Actions
  // ==========================================================================

  openFile: async (fileId: string) => {
    const intent = ++openFileIntent;
    const { fileTree, projectSession } = get();
    if (!fileTree) return;
    const node = resolveTreeFile(fileTree, fileId);
    if (!node) return;
    try {
      const loaded = get().loadedFiles.get(fileId) ?? await loadFileFromTree(node);
      const current = get();
      if (!loaded || current.projectSession !== projectSession || !current.fileTree || !resolveTreeFile(current.fileTree, fileId)) return;
      const loadedFiles = new Map(current.loadedFiles);
      if (!loadedFiles.has(fileId)) loadedFiles.set(fileId, loaded);
      const openTabs = current.openTabs.includes(fileId) ? current.openTabs : [...current.openTabs, fileId];
      set({
        loadedFiles,
        openTabs,
        activeFileId: openFileIntent === intent ? fileId : current.activeFileId,
      });
    } catch (err) {
      console.error('Failed to load file:', err);
    }
  },

  saveFile: async (fileId: string) => {
    const { loadedFiles, isVirtualProject } = get();
    const file = loadedFiles.get(fileId);
    const expectedProjectSession = get().projectSession;
    
    if (!file) {
      console.error(`File not found: ${fileId}`);
      return false;
    }

    if (isVirtualProject) {
      // A file download is not a durable project save; let the caller offer it.
      return false;
    }

    if (!file.handle) {
      console.error('File has no handle, cannot save');
      return false;
    }

    try {
      await writeFileContent(file.handle, file.content);
      const latest = get();
      const latestFile = latest.loadedFiles.get(fileId);
      if (latest.projectSession !== expectedProjectSession || latestFile !== file) return false;

      const newLoadedFiles = new Map(latest.loadedFiles);
      newLoadedFiles.set(fileId, { ...latestFile, isModified: false });
      set({ loadedFiles: newLoadedFiles });

      get().addConsoleEntry({
        type: 'success',
        message: `Saved: ${file.name}`,
        source: 'system',
      });

      return true;
    } catch (err) {
      if (get().projectSession !== expectedProjectSession) return false;
      const message = err instanceof Error ? err.message : 'Unknown error';
      get().addConsoleEntry({
        type: 'error',
        message: `Failed to save ${file.name}: ${message}`,
        source: 'system',
      });
      return false;
    }
  },

  saveAllFiles: async () => {
    const { loadedFiles, projectSession } = get();
    
    for (const [fileId, file] of loadedFiles) {
      if (get().projectSession !== projectSession) return;
      if (file.isModified) {
        await get().saveFile(fileId);
      }
    }
  },

  createFile: async (name: string, language: PLCLanguage, parentPath: string = 'src') => {
    const initial = get();
    const { directoryHandle, isVirtualProject, fileTree, projectSession: expectedProjectSession } = initial;
    const trimmedName = name.trim();
    if (!initial.isProjectOpen || !fileTree) throw new Error('Open a project before creating a file.');
    if (!isSafePathSegment(trimmedName)) throw new Error('Enter a single file name without path separators.');
    if (!parentPath || parentPath.split('/').some((part) => !isSafePathSegment(part))) {
      throw new Error('Choose an existing project folder for the new file.');
    }
    if (isVirtualProject ? directoryHandle : !directoryHandle) {
      throw new Error('The current project cannot create files.');
    }

    const ext = getExtensionForLanguage(language);
    const fileName = trimmedName.endsWith(ext) ? trimmedName : `${trimmedName}${ext}`;
    const filePath = `${parentPath}/${fileName}`;
    const fileId = fileTreeFileId(filePath);
    const content = createEmptyFileContent(language);

    const newFile: ProjectFileWithHandle = {
      id: fileId,
      name: fileName,
      language,
      content,
      isModified: true,
      path: filePath,
      parentPath,
    };

    const isCurrentProject = () => {
      const current = get();
      return current.projectSession === expectedProjectSession
        && current.isProjectOpen
        && current.isVirtualProject === isVirtualProject
        && current.fileTree !== null
        && current.directoryHandle === directoryHandle;
    };

    const currentTreeForCreation = () => {
      if (!isCurrentProject()) throw new Error('Project changed while creating the file.');
      const current = get();
      const parent = findFileInTree(current.fileTree!, parentPath);
      if (!parent || parent.type !== 'directory') throw new Error('Choose an existing project folder for the new file.');
      if (current.loadedFiles.has(fileId) || findFileInTree(current.fileTree!, filePath)) {
        throw new Error('A file with that name already exists.');
      }
      return current.fileTree!;
    };

    currentTreeForCreation();
    const reservationKey = `${expectedProjectSession}:${filePath}`;
    if (fileCreationReservations.has(reservationKey)) throw new Error('A file with that name is already being created.');
    fileCreationReservations.add(reservationKey);

    let createdPhysicalEntry = false;
    try {
      if (!isVirtualProject && directoryHandle) {
        const pathParts = parentPath.split('/');
        let currentDir = directoryHandle;
        for (const part of pathParts) {
          currentTreeForCreation();
          currentDir = await currentDir.getDirectoryHandle(part);
          currentTreeForCreation();
        }

        let exists = false;
        try {
          await currentDir.getFileHandle(fileName);
          exists = true;
        } catch (error) {
          if (!(typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotFoundError')) throw error;
        }
        if (exists) throw new Error('A file with that name already exists.');
        currentTreeForCreation();
        const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
        createdPhysicalEntry = true;
        currentTreeForCreation();
        await writeFileContent(fileHandle, content);
        currentTreeForCreation();
        newFile.handle = fileHandle;
        newFile.isModified = false;
      }

      let committed = false;
      set((state) => {
        if (state.projectSession !== expectedProjectSession || !state.isProjectOpen || state.isVirtualProject !== isVirtualProject || state.directoryHandle !== directoryHandle || !state.fileTree) return {};
        const parent = findFileInTree(state.fileTree, parentPath);
        if (!parent || parent.type !== 'directory' || state.loadedFiles.has(fileId) || findFileInTree(state.fileTree, filePath)) return {};
        const newTree = appendTreeFile(state.fileTree, parentPath, { id: fileId, name: fileName, type: 'file', path: filePath, language, handle: newFile.handle });
        if (!newTree) return {};
        committed = true;
        return {
          fileTree: newTree,
          loadedFiles: new Map(state.loadedFiles).set(fileId, newFile),
          activeFileId: fileId,
          openTabs: state.openTabs.includes(fileId) ? state.openTabs : [...state.openTabs, fileId],
          compilerMessages: [],
          compilerMessagesChecked: false,
          compilerNavigationTarget: null,
          compilerRunId: state.compilerRunId + 1,
        };
      });
      if (!committed) {
        if (!isCurrentProject()) throw new Error('Project changed while creating the file.');
        throw new Error(createdPhysicalEntry
          ? 'The file may exist on disk. Refresh the project before trying again.'
          : 'Could not create the file. Check the name and folder access, then try again.');
      }

      get().addConsoleEntry({ type: 'success', message: `Created: ${fileName}`, source: 'system' });
      return fileId;
    } catch (error) {
      if (!isCurrentProject()) throw new Error('Project changed while creating the file.');
      const message = createdPhysicalEntry
        ? 'The file may exist on disk. Refresh the project before trying again.'
        : error instanceof Error && (error.message === 'A file with that name already exists.'
        || error.message === 'A file with that name is already being created.'
        || error.message === 'Choose an existing project folder for the new file.'
        || error.message === 'The file may exist on disk. Refresh the project before trying again.')
        ? error.message
        : 'Could not create the file. Check the name and folder access, then try again.';
      get().addConsoleEntry({ type: 'error', message, source: 'system' });
      throw new Error(message);
    } finally {
      fileCreationReservations.delete(reservationKey);
    }
  },

  deleteFile: async (fileId: string, expectedProjectSession = get().projectSession) => {
    const initial = get();
    if (initial.projectSession !== expectedProjectSession) return false;
    const located = initial.fileTree && findTreeFileWithParent(initial.fileTree, fileId);
    if (!located || located.node.type !== 'file') return false;

    if (!initial.isVirtualProject) {
      if (!located.parent.dirHandle) {
        if (get().projectSession === expectedProjectSession) {
          get().addConsoleEntry({ type: 'error', message: `Could not delete ${located.node.name}. The file was not removed.`, source: 'system' });
        }
        return false;
      }
      try {
        await located.parent.dirHandle.removeEntry(located.node.name);
      } catch {
        if (get().projectSession === expectedProjectSession) {
          get().addConsoleEntry({ type: 'error', message: `Could not delete ${located.node.name}. The file was not removed.`, source: 'system' });
        }
        return false;
      }
    }

    const current = get();
    if (current.projectSession !== expectedProjectSession) return false;

    fileTreeRefreshIntent += 1;

    const loadedFiles = new Map(current.loadedFiles);
    loadedFiles.delete(fileId);
    const openTabs = current.openTabs.filter(id => id !== fileId);
    const breakpoints = new Map(current.debug.breakpoints);
    breakpoints.delete(fileId);
    set((state) => ({
      fileTree: current.fileTree ? pruneTreeFile(current.fileTree, fileId) ?? current.fileTree : null,
      loadedFiles,
      openTabs,
      activeFileId: current.activeFileId === fileId ? openTabs.at(-1) ?? null : current.activeFileId,
      compilerMessages: [],
      compilerMessagesChecked: false,
      compilerNavigationTarget: null,
      compilerRunId: state.compilerRunId + 1,
      debug: { ...current.debug, breakpoints },
    }));
    return true;
  },

  setActiveFile: (fileId: string | null) => {
    const { openTabs } = get();
    set({
      activeFileId: fileId,
      openTabs: fileId && !openTabs.includes(fileId) 
        ? [...openTabs, fileId] 
        : openTabs,
    });
  },

  updateFileContent: (fileId: string, content: string) => {
    const { loadedFiles } = get();
    const file = loadedFiles.get(fileId);
    
    if (!file) return;

    const newLoadedFiles = new Map(loadedFiles);
    newLoadedFiles.set(fileId, { ...file, content, isModified: true });
    set((state) => ({ loadedFiles: newLoadedFiles, compilerMessages: [], compilerMessagesChecked: false, compilerNavigationTarget: null, stBufferDiagnostics: null, compilerRunId: state.compilerRunId + 1 }));
  },

  closeTab: (fileId: string) => {
    const { openTabs, activeFileId } = get();
    const newTabs = openTabs.filter(id => id !== fileId);
    const newActiveId = activeFileId === fileId
      ? newTabs[newTabs.length - 1] || null
      : activeFileId;

    set({
      openTabs: newTabs,
      activeFileId: newActiveId,
    });
  },

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

  clearControllerState: () => set({ 
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
      compilerMessages: [
        ...state.compilerMessages,
        { ...message, timestamp: new Date() },
      ],
      compilerMessagesChecked: true,
    })),

  markCompilerMessagesChecked: () => set({ compilerMessagesChecked: true }),

  clearCompilerMessages: () => set((state) => ({ compilerMessages: [], compilerMessagesChecked: false, compilerNavigationTarget: null, compilerRunId: state.compilerRunId + 1 })),

  setSTBufferDiagnostics: (result, expectedContent) => {
    let accepted = false;
    set((state) => {
      const file = state.loadedFiles.get(result.fileId);
      if (!state.isProjectOpen || state.projectSession !== result.projectSession || state.compilerRunId !== result.compilerRunId
        || state.activeFileId !== result.fileId || !file || file.language !== 'ST' || file.path !== result.file || file.content !== expectedContent) return {};
      accepted = true;
      return { stBufferDiagnostics: result };
    });
    return accepted;
  },

  clearSTBufferDiagnostics: (identity) => set((state) => {
    const current = state.stBufferDiagnostics;
    if (!current || !identity) return { stBufferDiagnostics: null };
    return current.projectSession === identity.projectSession && current.compilerRunId === identity.compilerRunId
      && current.fileId === identity.fileId && current.file === identity.file
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
    if (!opened || opened.path !== file || get().activeFileId !== node.id || get().fileTree !== tree || get().compilerRunId !== compilerRunId) return false;
    set({ showSettings: false, compilerNavigationTarget: { file, line, column: Math.max(1, column) } });
    return true;
  },

  consumeCompilerNavigationTarget: (target) => set((state) => state.compilerNavigationTarget === target ? { compilerNavigationTarget: null } : {}),

  // ==========================================================================
  // UI Actions
  // ==========================================================================

  setConsoleHeight: (height) => set({ consoleHeight: height }),
  toggleConsole: () => set((state) => ({ isConsoleCollapsed: !state.isConsoleCollapsed })),
  toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),

  // ==========================================================================
  // Debug Actions
  // ==========================================================================

  setDebugMode: (mode) =>
    set((state) => ({
      debug: { ...state.debug, mode },
    })),

  setDebugMap: (debugMap) =>
    set((state) => ({
      debug: { ...state.debug, debugMap },
    })),

  toggleBreakpoint: (fileId, line) =>
    set((state) => {
      const newBreakpoints = new Map(state.debug.breakpoints);
      const fileBreakpoints = new Set(newBreakpoints.get(fileId) || []);
      
      if (fileBreakpoints.has(line)) {
        fileBreakpoints.delete(line);
      } else {
        fileBreakpoints.add(line);
      }
      
      if (fileBreakpoints.size === 0) {
        newBreakpoints.delete(fileId);
      } else {
        newBreakpoints.set(fileId, fileBreakpoints);
      }
      
      return {
        debug: { ...state.debug, breakpoints: newBreakpoints },
      };
    }),

  setBreakpoints: (fileId, lines) =>
    set((state) => {
      const newBreakpoints = new Map(state.debug.breakpoints);
      if (lines.length === 0) {
        newBreakpoints.delete(fileId);
      } else {
        newBreakpoints.set(fileId, new Set(lines));
      }
      return {
        debug: { ...state.debug, breakpoints: newBreakpoints },
      };
    }),

  clearBreakpoints: (fileId) =>
    set((state) => {
      if (fileId) {
        const newBreakpoints = new Map(state.debug.breakpoints);
        newBreakpoints.delete(fileId);
        return {
          debug: { ...state.debug, breakpoints: newBreakpoints },
        };
      }
      // Clear all breakpoints
      return {
        debug: { ...state.debug, breakpoints: new Map() },
      };
    }),

  setCurrentExecution: (pou, line, pc) =>
    set((state) => ({
      debug: {
        ...state.debug,
        currentPOU: pou,
        currentLine: line,
        currentPC: pc,
      },
    })),

  addWatchVariable: (varPath) =>
    set((state) => {
      if (state.debug.watchVariables.includes(varPath)) {
        return state; // Already watching
      }
      return {
        debug: {
          ...state.debug,
          watchVariables: [...state.debug.watchVariables, varPath],
        },
      };
    }),

  removeWatchVariable: (varPath) =>
    set((state) => {
      const newLiveValues = new Map(state.debug.liveValues);
      newLiveValues.delete(varPath);
      return {
        debug: {
          ...state.debug,
          watchVariables: state.debug.watchVariables.filter(v => v !== varPath),
          liveValues: newLiveValues,
        },
      };
    }),

  clearWatchVariables: () =>
    set((state) => ({
        debug: {
          ...state.debug,
          watchVariables: [],
          liveValues: new Map(),
        },
      })),

  updateLiveValue: (varPath, value) =>
    set((state) => {
      const newLiveValues = new Map(state.debug.liveValues);
      newLiveValues.set(varPath, value);
      return {
        debug: { ...state.debug, liveValues: newLiveValues },
      };
    }),

  updateLiveValues: (values) =>
    set((state) => {
      const newLiveValues = new Map(state.debug.liveValues);
      for (const [key, value] of values) {
        newLiveValues.set(key, value);
      }
      return {
        debug: { ...state.debug, liveValues: newLiveValues },
      };
    }),

  clearLiveValues: () =>
    set((state) => ({
      debug: { ...state.debug, liveValues: new Map() },
    })),

  setForcedValue: (entry) =>
    set((state) => {
      const forcedValues = new Map(state.debug.forcedValues);
      forcedValues.set(entry.path, entry);
      return {
        debug: { ...state.debug, forcedValues },
      };
    }),

  clearForcedValue: (varPath) =>
    set((state) => {
      const forcedValues = new Map(state.debug.forcedValues);
      forcedValues.delete(varPath);
      return {
        debug: { ...state.debug, forcedValues },
      };
    }),

  markForcedValuesUnconfirmed: () =>
    set((state) => {
      const forcedValues = new Map(
        Array.from(state.debug.forcedValues, ([path, entry]) => [
          path,
          { ...entry, state: WATCH_FORCE_STATE.UNCONFIRMED },
        ]),
      );
      return {
        debug: { ...state.debug, forcedValues, forcesUnconfirmed: true },
      };
    }),

  clearForcedValues: () =>
    set((state) => ({
      debug: { ...state.debug, forcedValues: new Map(), forcesUnconfirmed: false },
    })),

  appendNativeTrace: (sample) =>
    set((state) => ({
      debug: { ...state.debug, nativeTrace: [...state.debug.nativeTrace, sample].slice(-NATIVE_TRACE_LIMIT) },
    })),

  clearNativeTrace: () =>
    set((state) => ({
      debug: { ...state.debug, nativeTrace: [] },
    })),

  setPolling: (isPolling) =>
    set((state) => ({
      debug: { ...state.debug, isPolling },
    })),

  setPollingInterval: (pollingInterval) =>
    set((state) => ({
      debug: { ...state.debug, pollingInterval },
    })),

  toggleMpeek: () =>
    set((state) => ({
      debug: { ...state.debug, mpeekEnabled: !state.debug.mpeekEnabled },
    })),

  getBreakpointsForFile: (fileId) => {
    const { debug } = get();
    return debug.breakpoints.get(fileId) || new Set();
  },

  getAllBreakpointPCs: () => {
    const { debug, loadedFiles } = get();
    const pcs: number[] = [];

    if (!debug.debugMap) return pcs;

    // For each file's breakpoints, look up the PC from the debug map.
    // fileId is NOT a plain filename — it is a sanitized path key like
    // "file-src-main-st". We must resolve the actual filename via loadedFiles
    // and then strip the extension to get the POU name used in the debug map.
    for (const [fileId, lineNumbers] of debug.breakpoints) {
      // Resolve the human-readable filename (e.g. "main.st") from the store.
      // Fall back to the raw fileId only if the file is not loaded (shouldn't
      // happen in practice, but keeps us safe).
      const resolvedFile = loadedFiles.get(fileId);
      const rawName = resolvedFile?.name ?? fileId;

      for (const line of lineNumbers) {
        const pc = getBreakpointPCForLine(debug.debugMap, rawName, line);
        if (pc !== null) {
          pcs.push(pc);
        }
      }
    }

    return pcs;
  },

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
