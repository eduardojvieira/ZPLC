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

// =============================================================================
// Theme Types
// =============================================================================

export type Theme = 'light' | 'dark' | 'system';

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

  // Actions - Theme
  setTheme: (theme: Theme) => void;

  // Actions - Project Management (File System)
  openProjectFromFolder: () => Promise<boolean>;
  createNewProjectInFolder: () => Promise<boolean>;
  createVirtualProject: (name: string) => void;
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
    });

    get().addConsoleEntry({
      type: 'info',
      message: 'Project closed',
      source: 'system',
    });
  },

  saveProjectConfig: async () => {
    const { directoryHandle, projectConfig, isVirtualProject } = get();
    
    if (isVirtualProject || !directoryHandle || !projectConfig) {
      return;
    }

    try {
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
