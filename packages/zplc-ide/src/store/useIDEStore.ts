/**
 * ZPLC IDE Global State Store
 * 
 * Uses Zustand for state management.
 * Supports File System Access API for opening real folders,
 * with fallback to virtual projects for unsupported browsers.
 */

import { create } from 'zustand';
import type {
  ConnectionState,
  ConsoleEntry,
  ConsoleTab,
  PLCLanguage,
  CompilerMessage,
  ZPLCProjectConfig,
  FileTreeNode,
  ProjectFileWithHandle,
} from '../types';
import {
  DEFAULT_ZPLC_CONFIG,
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
  createVirtualProject,
  toggleDirectoryExpanded,
  findFileInTree,
} from '../utils/fileSystem';
import {
  getAvailableProjects,
  loadProject,
} from '../utils/projectLoader';
import type { ProjectInfo } from '../utils/projectLoader';
import type { SystemInfo, StatusInfo } from '../runtime/serialAdapter';
import type { DebugMap } from '../compiler';

// =============================================================================
// Theme Types
// =============================================================================

export type Theme = 'light' | 'dark' | 'system';

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
  
  /** Whether the debugger is currently polling for live values */
  isPolling: boolean;
  
  /** Polling interval in milliseconds (default: 100ms) */
  pollingInterval: number;
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

  // UI State
  sidebarWidth: number;
  consoleHeight: number;
  isSidebarCollapsed: boolean;
  isConsoleCollapsed: boolean;
  showSettings: boolean;

  // Debug State
  debug: DebugState;

  // Actions - Theme
  setTheme: (theme: Theme) => void;

  // Actions - Project Management (File System)
  openProjectFromFolder: () => Promise<boolean>;
  createNewProjectInFolder: () => Promise<boolean>;
  createVirtualProject: (name: string) => void;
  openExampleProject: (projectId: string) => void;
  getExampleProjects: () => ProjectInfo[];
  closeProject: () => void;
  saveProjectConfig: () => Promise<void>;

  // Actions - File Tree
  toggleDirectory: (dirPath: string) => void;
  refreshFileTree: () => Promise<void>;

  // Actions - Files
  openFile: (fileId: string) => Promise<void>;
  saveFile: (fileId: string) => Promise<boolean>;
  saveAllFiles: () => Promise<void>;
  createFile: (name: string, language: PLCLanguage, parentPath?: string) => Promise<string>;
  deleteFile: (fileId: string) => Promise<void>;
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
  clearConsole: () => void;
  setActiveConsoleTab: (tab: ConsoleTab) => void;
  addCompilerMessage: (message: Omit<CompilerMessage, 'timestamp'>) => void;
  clearCompilerMessages: () => void;

  // Actions - UI
  setSidebarWidth: (width: number) => void;
  setConsoleHeight: (height: number) => void;
  toggleSidebar: () => void;
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
  setPolling: (isPolling: boolean) => void;
  setPollingInterval: (interval: number) => void;
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

  sidebarWidth: 260,
  consoleHeight: 200,
  isSidebarCollapsed: false,
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
    isPolling: false,
    pollingInterval: 100,
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
    if (!isFileSystemAccessSupported()) {
      get().addConsoleEntry({
        type: 'error',
        message: 'File System Access API not supported. Use Chrome or Edge, or create a Virtual Project.',
        source: 'system',
      });
      return false;
    }

    try {
      const dirHandle = await openDirectoryPicker();
      if (!dirHandle) {
        // User cancelled
        return false;
      }

      get().addConsoleEntry({
        type: 'info',
        message: `Opening folder: ${dirHandle.name}...`,
        source: 'system',
      });

      // Read project config
      let config = await readProjectConfig(dirHandle);
      if (!config) {
        // No zplc.json found - ask if we should create one
        get().addConsoleEntry({
          type: 'warning',
          message: 'No zplc.json found. Creating default configuration...',
          source: 'system',
        });
        config = { ...DEFAULT_ZPLC_CONFIG, name: dirHandle.name };
        await writeProjectConfig(dirHandle, config);
      }

      // Read file tree
      const fileTree = await readDirectoryRecursive(dirHandle);

      set({
        isProjectOpen: true,
        isVirtualProject: false,
        projectName: config.name,
        projectConfig: config,
        directoryHandle: dirHandle,
        fileTree,
        loadedFiles: new Map(),
        activeFileId: null,
        openTabs: [],
      });

      get().addConsoleEntry({
        type: 'success',
        message: `Opened project: ${config.name}`,
        source: 'system',
      });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      get().addConsoleEntry({
        type: 'error',
        message: `Failed to open folder: ${message}`,
        source: 'system',
      });
      return false;
    }
  },

  createNewProjectInFolder: async () => {
    if (!isFileSystemAccessSupported()) {
      get().addConsoleEntry({
        type: 'error',
        message: 'File System Access API not supported. Use a Virtual Project instead.',
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
        directoryHandle: dirHandle,
        fileTree,
        loadedFiles: new Map(),
        activeFileId: null,
        openTabs: [],
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

  createVirtualProject: (name: string) => {
    const { config, files, fileTree } = createVirtualProject(name);
    
    const loadedFiles = new Map<string, ProjectFileWithHandle>();
    files.forEach(f => loadedFiles.set(f.id, f));

    set({
      isProjectOpen: true,
      isVirtualProject: true,
      projectName: name,
      projectConfig: config,
      directoryHandle: null,
      fileTree,
      loadedFiles,
      activeFileId: files[0]?.id || null,
      openTabs: files.length > 0 ? [files[0].id] : [],
    });

    get().addConsoleEntry({
      type: 'success',
      message: `Created virtual project: ${name}`,
      source: 'system',
    });
  },

  openExampleProject: (projectId: string) => {
    const loaded = loadProject(projectId);
    if (!loaded) {
      get().addConsoleEntry({
        type: 'error',
        message: `Failed to load example project: ${projectId}`,
        source: 'system',
      });
      return;
    }

    // Convert ProjectFile[] to Map<string, ProjectFileWithHandle>
    const loadedFiles = new Map<string, ProjectFileWithHandle>();
    for (const file of loaded.files) {
      const fileWithHandle: ProjectFileWithHandle = {
        ...file,
        parentPath: file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '',
      };
      loadedFiles.set(file.id, fileWithHandle);
    }

    // Build a file tree from the loaded files
    const fileTree: FileTreeNode = {
      id: 'root',
      name: loaded.zplcConfig.name || projectId,
      type: 'directory',
      path: '',
      isExpanded: true,
      children: [
        {
          id: 'src',
          name: 'src',
          type: 'directory',
          path: 'src',
          isExpanded: true,
          children: loaded.files.map(f => ({
            id: f.id,
            name: f.name,
            type: 'file' as const,
            path: f.path,
            language: f.language,
          })),
        },
      ],
    };

    set({
      isProjectOpen: true,
      isVirtualProject: true,  // Example projects are read-only (no disk handle)
      projectName: loaded.zplcConfig.name || projectId,
      projectConfig: loaded.zplcConfig,
      directoryHandle: null,
      fileTree,
      loadedFiles,
      activeFileId: loaded.files[0]?.id || null,
      openTabs: loaded.files.length > 0 ? [loaded.files[0].id] : [],
    });

    get().addConsoleEntry({
      type: 'success',
      message: `Loaded example project: ${loaded.zplcConfig.name || projectId}`,
      source: 'system',
    });
  },

  getExampleProjects: () => {
    return getAvailableProjects();
  },

  closeProject: () => {
    const hasUnsaved = get().hasUnsavedChanges();
    if (hasUnsaved) {
      // In a real app, we'd show a confirmation dialog
      console.warn('Closing project with unsaved changes');
    }

    set({
      isProjectOpen: false,
      isVirtualProject: false,
      projectName: null,
      projectConfig: null,
      directoryHandle: null,
      fileTree: null,
      loadedFiles: new Map(),
      activeFileId: null,
      openTabs: [],
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
        isPolling: false,
        pollingInterval: 100,
      },
    });

    get().addConsoleEntry({
      type: 'info',
      message: 'Project closed',
      source: 'system',
    });
  },

  saveProjectConfig: async () => {
    const { directoryHandle, projectConfig, isVirtualProject } = get();
    
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
      
      if (permission !== 'granted') {
        // Try to request permission again
        const requestResult = await directoryHandle.requestPermission({ mode: 'readwrite' });
        if (requestResult !== 'granted') {
          get().addConsoleEntry({
            type: 'error',
            message: 'Write permission denied. Please grant access to save.',
            source: 'system',
          });
          return;
        }
      }
      
      await writeProjectConfig(directoryHandle, projectConfig);
      
      get().addConsoleEntry({
        type: 'success',
        message: 'Saved zplc.json',
        source: 'system',
      });
    } catch (err) {
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
    const { directoryHandle } = get();
    if (!directoryHandle) return;

    try {
      const fileTree = await readDirectoryRecursive(directoryHandle);
      set({ fileTree });
    } catch (err) {
      console.error('Failed to refresh file tree:', err);
    }
  },

  // ==========================================================================
  // File Actions
  // ==========================================================================

  openFile: async (fileId: string) => {
    const { loadedFiles, fileTree, openTabs } = get();

    // Check if already loaded
    if (loadedFiles.has(fileId)) {
      set({
        activeFileId: fileId,
        openTabs: openTabs.includes(fileId) ? openTabs : [...openTabs, fileId],
      });
      return;
    }

    // Find the file in the tree
    if (!fileTree) return;
    
    const node = findFileInTree(fileTree, fileId.replace('file-', '').replace(/-/g, '/'));
    if (!node || node.type !== 'file') {
      // Try finding by ID directly
      const findById = (tree: FileTreeNode): FileTreeNode | null => {
        if (tree.id === fileId) return tree;
        if (tree.children) {
          for (const child of tree.children) {
            const found = findById(child);
            if (found) return found;
          }
        }
        return null;
      };
      
      const foundNode = findById(fileTree);
      if (!foundNode || foundNode.type !== 'file') {
        console.error(`File not found: ${fileId}`);
        return;
      }

      try {
        const file = await loadFileFromTree(foundNode);
        if (file) {
          const newLoadedFiles = new Map(loadedFiles);
          newLoadedFiles.set(fileId, file);
          set({
            loadedFiles: newLoadedFiles,
            activeFileId: fileId,
            openTabs: [...openTabs, fileId],
          });
        }
      } catch (err) {
        console.error('Failed to load file:', err);
      }
      return;
    }

    try {
      const file = await loadFileFromTree(node);
      if (file) {
        const newLoadedFiles = new Map(loadedFiles);
        newLoadedFiles.set(fileId, file);
        set({
          loadedFiles: newLoadedFiles,
          activeFileId: fileId,
          openTabs: [...openTabs, fileId],
        });
      }
    } catch (err) {
      console.error('Failed to load file:', err);
    }
  },

  saveFile: async (fileId: string) => {
    const { loadedFiles, isVirtualProject } = get();
    const file = loadedFiles.get(fileId);
    
    if (!file) {
      console.error(`File not found: ${fileId}`);
      return false;
    }

    if (isVirtualProject) {
      // Virtual projects can't save to disk, just mark as saved
      const newLoadedFiles = new Map(loadedFiles);
      newLoadedFiles.set(fileId, { ...file, isModified: false });
      set({ loadedFiles: newLoadedFiles });
      return true;
    }

    if (!file.handle) {
      console.error('File has no handle, cannot save');
      return false;
    }

    try {
      await writeFileContent(file.handle, file.content);
      
      const newLoadedFiles = new Map(loadedFiles);
      newLoadedFiles.set(fileId, { ...file, isModified: false });
      set({ loadedFiles: newLoadedFiles });

      get().addConsoleEntry({
        type: 'success',
        message: `Saved: ${file.name}`,
        source: 'system',
      });

      return true;
    } catch (err) {
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
    const { loadedFiles } = get();
    
    for (const [fileId, file] of loadedFiles) {
      if (file.isModified) {
        await get().saveFile(fileId);
      }
    }
  },

  createFile: async (name: string, language: PLCLanguage, parentPath: string = 'src') => {
    const { directoryHandle, loadedFiles, openTabs, isVirtualProject, fileTree } = get();
    
    const ext = getExtensionForLanguage(language);
    const fileName = name.endsWith(ext) ? name : `${name}${ext}`;
    const filePath = `${parentPath}/${fileName}`;
    const fileId = `file-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`;
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

    if (!isVirtualProject && directoryHandle) {
      try {
        // Navigate to parent directory
        const pathParts = parentPath.split('/').filter(p => p);
        let currentDir = directoryHandle;
        for (const part of pathParts) {
          currentDir = await currentDir.getDirectoryHandle(part, { create: true });
        }

        // Create the file
        const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
        await writeFileContent(fileHandle, content);
        newFile.handle = fileHandle;
        newFile.isModified = false;

        // Refresh file tree
        await get().refreshFileTree();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        get().addConsoleEntry({
          type: 'error',
          message: `Failed to create file: ${message}`,
          source: 'system',
        });
        throw err;
      }
    } else if (isVirtualProject && fileTree) {
      // Update virtual file tree
      const newTree = { ...fileTree };
      // Find or create parent directory in tree
      const srcDir = newTree.children?.find(c => c.name === 'src');
      if (srcDir && srcDir.children) {
        srcDir.children.push({
          id: fileId,
          name: fileName,
          type: 'file',
          path: filePath,
          language,
        });
      }
      set({ fileTree: newTree });
    }

    const newLoadedFiles = new Map(loadedFiles);
    newLoadedFiles.set(fileId, newFile);

    set({
      loadedFiles: newLoadedFiles,
      activeFileId: fileId,
      openTabs: [...openTabs, fileId],
    });

    get().addConsoleEntry({
      type: 'success',
      message: `Created: ${fileName}`,
      source: 'system',
    });

    return fileId;
  },

  deleteFile: async (fileId: string) => {
    const { loadedFiles, openTabs, activeFileId, isVirtualProject } = get();
    const file = loadedFiles.get(fileId);

    if (!isVirtualProject && file?.handle) {
      // Note: File System Access API doesn't have a direct delete method
      // on FileSystemFileHandle. You'd need to use the parent directory's
      // removeEntry method. For now, we just remove from our state.
      console.warn('Disk file deletion not implemented - file removed from project only');
    }

    const newLoadedFiles = new Map(loadedFiles);
    newLoadedFiles.delete(fileId);

    const newTabs = openTabs.filter(id => id !== fileId);
    const newActiveId = activeFileId === fileId 
      ? newTabs[newTabs.length - 1] || null 
      : activeFileId;

    set({
      loadedFiles: newLoadedFiles,
      openTabs: newTabs,
      activeFileId: newActiveId,
    });

    // Refresh file tree
    if (!isVirtualProject) {
      await get().refreshFileTree();
    }
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
    set({ loadedFiles: newLoadedFiles });
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
      consoleEntries: [
        ...state.consoleEntries,
        {
          ...entry,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        },
      ],
    })),

  clearConsole: () => set({ consoleEntries: [] }),

  setActiveConsoleTab: (tab) => set({ activeConsoleTab: tab }),

  addCompilerMessage: (message) =>
    set((state) => ({
      compilerMessages: [
        ...state.compilerMessages,
        { ...message, timestamp: new Date() },
      ],
    })),

  clearCompilerMessages: () => set({ compilerMessages: [] }),

  // ==========================================================================
  // UI Actions
  // ==========================================================================

  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setConsoleHeight: (height) => set({ consoleHeight: height }),
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
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

  setPolling: (isPolling) =>
    set((state) => ({
      debug: { ...state.debug, isPolling },
    })),

  setPollingInterval: (pollingInterval) =>
    set((state) => ({
      debug: { ...state.debug, pollingInterval },
    })),

  getBreakpointsForFile: (fileId) => {
    const { debug } = get();
    return debug.breakpoints.get(fileId) || new Set();
  },

  getAllBreakpointPCs: () => {
    const { debug } = get();
    const pcs: number[] = [];
    
    if (!debug.debugMap) return pcs;
    
    // For each file's breakpoints, look up the PC from the debug map
    for (const [_fileId, lineNumbers] of debug.breakpoints) {
      for (const line of lineNumbers) {
        // Search all POUs for this line
        for (const [_pouName, pouInfo] of Object.entries(debug.debugMap.pou)) {
          const mapping = pouInfo.sourceMap.find(m => m.line === line);
          if (mapping) {
            pcs.push(mapping.pc);
          }
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
    const { loadedFiles } = get();
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
