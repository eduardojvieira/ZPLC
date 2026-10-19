/**
 * The shape of the IDE store: its state, its actions and the types they use (IDEState). IDE-014: split out of useIDEStore.ts, which re-exports them.
 */

import type { ConnectionState, ConsoleEntry, ConsoleTab, PLCLanguage, CompilerMessage, STBufferDiagnostics, ZPLCProjectConfig, FileTreeNode, ProjectFileWithHandle } from '../types';
import type { ProjectInfo } from '../utils/projectLoader';
import type { SystemInfo, StatusInfo } from '../runtime/serialAdapter';
import type { DebugMap } from '../compiler';
import { type WatchForceEntry } from '../runtime/debugAdapter';
import type { ProjectMigrationChange } from '../project/projectModel';
import { type NewConsoleEntry } from './consoleEntries';
import type { RecentProject } from '../../electron/projectFilesProtocol';
import { type WorkspaceLayout } from '../utils/sessionState';
import type { NewProjectRequest } from '../project/newProject';
import { type NativeTraceSample } from '../runtime/nativeTrace';
import type { CanonicalWorkspaceBuildEvidence } from './buildEvidence';

// =============================================================================
// Theme Types
// =============================================================================

export type Theme = 'light' | 'dark' | 'high-contrast' | 'system';
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
  
  /**
   * Why the runtime does not hold the breakpoints the editor shows (null = they are armed or there
   * is no session). Set from the breakpoint sync, so a dot never claims a stop the runtime refused.
   */
  breakpointsInactiveReason: string | null;

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

export interface IDEState {
  // Theme State
  theme: Theme;

  // Project State - File System Based
  isProjectOpen: boolean;
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
  /** Why the last attempt to open, create or copy a project failed; shown on the screen that started it. */
  projectOpenError: string | null;
  reportProjectOpenProblem: (type: 'error' | 'warning', message: string) => void;
  openProjectFromFolder: () => Promise<boolean>;
  /** Folders opened before, most recent first, as the main process lists them (desktop app only; IDE-008). */
  recentProjects: RecentProject[];
  refreshRecentProjects: () => Promise<void>;
  /** Reopens a remembered folder without the dialog, with the session it was left in. */
  openRecentProject: (recentId: string) => Promise<boolean>;
  forgetRecentProject: (recentId: string) => Promise<void>;
  /** The split of the workbench the user chose in this project; saved with the session and restored with it. */
  sessionLayout: WorkspaceLayout | null;
  setSessionLayout: (layout: WorkspaceLayout | null) => void;
  createNewProjectInFolder: (options?: NewProjectRequest) => Promise<boolean>;
  copyExampleProjectToFolder: (projectId: string, folder?: () => Promise<{ handle: FileSystemDirectoryHandle; seed: boolean } | null>) => Promise<boolean>;
  /** The Welcome screen's Learn entry: copy the first lesson's starter like any example, then show the Learn tab. */
  startLearning: (starterExampleId: string) => Promise<boolean>;
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
  /** `quiet` (autosave) writes the file without the "Saved" line in Output; a failure is always reported. */
  saveFile: (fileId: string, options?: { quiet?: boolean }) => Promise<boolean>;
  saveAllFiles: (options?: { quiet?: boolean }) => Promise<void>;
  createFile: (name: string, language: PLCLanguage, parentPath?: string) => Promise<string>;
  deleteFile: (fileId: string, expectedProjectSession?: number) => Promise<boolean>;
  /** The project tree operations of the Explorer (IDE-004). Each raises an Error with a message for the user when it refuses. */
  createFolder: (parentPath: string, name: string) => Promise<void>;
  renameEntry: (path: string, name: string) => Promise<void>;
  moveEntry: (path: string, targetFolder: string) => Promise<void>;
  duplicateEntry: (path: string) => Promise<string>;
  deleteFolder: (path: string) => Promise<void>;
  setActiveFile: (fileId: string | null) => void;
  updateFileContent: (fileId: string, content: string) => void;
  closeTab: (fileId: string) => void;
  /** Drops a file's unsaved content and closes its tab; the next open reads the file from disk again. */
  discardFile: (fileId: string) => void;

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
  setBreakpointsInactiveReason: (reason: string | null) => void;
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
