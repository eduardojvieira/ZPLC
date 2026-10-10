/**
 * ZPLC IDE - Electron Preload Script
 *
 * This script runs in a special context with access to both Node.js and DOM APIs.
 * It exposes safe APIs to the renderer process via contextBridge.
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type {
  NativeSimulationEvent,
  NativeSimulationHelloResult,
  NativeSimulationRequest,
} from './nativeSimulationIpc.js';

const NATIVE_SIMULATION_CHANNEL = {
  START_SESSION: 'native-simulation:start-session',
  STOP_SESSION: 'native-simulation:stop-session',
  REQUEST: 'native-simulation:request',
  EVENT: 'native-simulation:event',
} as const;

const WORKSPACE_TESTS_CHANNEL = {
  REGISTER_PROJECT_FILE: 'workspace-tests:register-project-file',
  REGISTER_PROJECT_ROOT: 'workspace-tests:register-project-root',
  RUN: 'workspace-tests:run',
  CANCEL: 'workspace-tests:cancel',
  COMPILE: 'workspace-tests:compile',
  SAFETY_CHECK: 'workspace-tests:safety-check',
} as const;

const CANDIDATE_CHANGE_SET_CHANNEL = {
  REVIEW: 'candidate-change-set:review',
} as const;

const TOOLCHAIN_CHANNEL = {
  INSPECT: 'toolchain:inspect',
} as const;

const FIRMWARE_BUILD_CHANNEL = {
  START: 'firmware-build:start',
  CANCEL: 'firmware-build:cancel',
} as const;

const TOOL_EXECUTION_AUDIT_CHANNEL = {
  LIST: 'tool-execution-audit:list',
} as const;

const AI_PROVIDER_CHANNEL = {
  GET_STATUS: 'ai-provider:get-status', GET_CONFIG: 'ai-provider:get-config', SAVE_CONFIG: 'ai-provider:save-config',
  STORE_KEY: 'ai-provider:store-key', CLEAR_KEY: 'ai-provider:clear-key', REQUEST: 'ai-provider:request', CANCEL: 'ai-provider:cancel',
} as const;
// Repeats projectFilesProtocol.ts: a sandboxed preload cannot require it, and even a type import would make
// the preload compile re-emit that module as CommonJS over the ES module the main process loads.
// projectFilesIpc.test.ts keeps this copy equal to the shared one.
const PROJECT_FILES_CHANNEL = {
  chooseFolder: 'project-files:choose-folder',
  list: 'project-files:list',
  stat: 'project-files:stat',
  read: 'project-files:read',
  write: 'project-files:write',
  mkdir: 'project-files:mkdir',
  remove: 'project-files:remove',
  rename: 'project-files:rename',
  listRecent: 'project-files:list-recent',
  openRecent: 'project-files:open-recent',
  forgetRecent: 'project-files:forget-recent',
  markOpened: 'project-files:mark-opened',
  watch: 'project-files:watch',
} as const;
// The one event the main process pushes for project files; projectFilesIpc.test.ts keeps it equal to PROJECT_FILES_EVENT.
const PROJECT_FILES_EVENT = { changed: 'project-files:changed' } as const;
const LEARN_PROGRESS_CHANNEL = { READ: 'learn-progress:read', MERGE: 'learn-progress:merge' } as const;
const SESSION_CHANNEL = { LOAD: 'session:load', SAVE: 'session:save' } as const;
// Repeats RECOVERY_CHANNEL of recoveryStoreProtocol.ts, for the same reason as the project files above.
// recoveryStoreIpc.test.ts keeps this copy equal to the shared one.
const RECOVERY_CHANNEL = { WRITE: 'recovery:write', LIST: 'recovery:list', DISCARD: 'recovery:discard' } as const;
// Repeats UPDATE_CHECK_CHANNEL of updateCheckProtocol.ts; updateCheckIpc.test.ts keeps this copy equal to the shared one.
const UPDATE_CHECK_CHANNEL = { RUN: 'update-check:run' } as const;
const CLOSE_GUARD_CHANNEL = { SET_DIRTY: 'close-guard:set-dirty', CLOSE_NOW: 'close-guard:close-now', CLOSE_REQUESTED: 'close-guard:close-requested' } as const;
type GuardedAction = 'close' | 'reload';

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Get application information
   */
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  /**
   * Native simulation bridge
   */
  nativeSimulation: {
    startSession: () =>
      ipcRenderer.invoke(NATIVE_SIMULATION_CHANNEL.START_SESSION) as Promise<NativeSimulationHelloResult>,
    stopSession: () => ipcRenderer.invoke(NATIVE_SIMULATION_CHANNEL.STOP_SESSION) as Promise<void>,
    request: <TResult = unknown>(request: NativeSimulationRequest) =>
      ipcRenderer.invoke(NATIVE_SIMULATION_CHANNEL.REQUEST, request) as Promise<TResult>,
    onEvent: (callback: (event: NativeSimulationEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: NativeSimulationEvent) => {
        callback(payload);
      };

      ipcRenderer.on(NATIVE_SIMULATION_CHANNEL.EVENT, listener);
      return () => {
        ipcRenderer.removeListener(NATIVE_SIMULATION_CHANNEL.EVENT, listener);
      };
    },
  },

  workspaceTests: {
    registerProjectFile: (file: File) => {
      if (!(file instanceof File) || file.name !== 'zplc.json' || file.size === 0) {
        return Promise.reject(new Error('Workspace operation failed'));
      }
      const manifestPath = webUtils.getPathForFile(file);
      if (!manifestPath) return Promise.reject(new Error('Workspace operation failed'));
      return ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.REGISTER_PROJECT_FILE, manifestPath) as Promise<{ workspaceId: string } | null>;
    },
    // The project folder is the one the main process owns (projectFiles); only its opaque id crosses, never a path.
    registerProjectRoot: (request: { rootId: string }) =>
      ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.REGISTER_PROJECT_ROOT, request) as Promise<{ workspaceId: string } | null>,
    run: (request: { workspaceId: string; scenarioId?: string }) =>
      ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.RUN, request) as Promise<unknown>,
    cancel: () => ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.CANCEL) as Promise<{ requested: boolean }>,
    compile: (request: { workspaceId: string }) =>
      ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.COMPILE, request) as Promise<unknown>,
    safetyCheck: (request: { workspaceId: string }) =>
      ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.SAFETY_CHECK, request) as Promise<unknown>,
  },
  closeGuard: {
    setDirty: (dirty: boolean) => ipcRenderer.invoke(CLOSE_GUARD_CHANNEL.SET_DIRTY, dirty) as Promise<void>,
    closeNow: () => ipcRenderer.invoke(CLOSE_GUARD_CHANNEL.CLOSE_NOW) as Promise<void>,
    onCloseRequested: (callback: (action: GuardedAction) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, action: unknown) => {
        callback(action === 'reload' ? 'reload' : 'close');
      };
      ipcRenderer.on(CLOSE_GUARD_CHANNEL.CLOSE_REQUESTED, listener);
      return () => {
        ipcRenderer.removeListener(CLOSE_GUARD_CHANNEL.CLOSE_REQUESTED, listener);
      };
    },
  },
  // The folder is chosen by a native dialog in the main process; the renderer sends typed requests, never a root path.
  // The request and result types are ProjectFilesBridge in projectFilesProtocol.ts, applied by the renderer.
  projectFiles: {
    chooseFolder: () => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.chooseFolder) as Promise<unknown>,
    list: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.list, request) as Promise<unknown>,
    stat: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.stat, request) as Promise<unknown>,
    read: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.read, request) as Promise<unknown>,
    write: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.write, request) as Promise<unknown>,
    mkdir: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.mkdir, request) as Promise<unknown>,
    remove: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.remove, request) as Promise<unknown>,
    rename: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.rename, request) as Promise<unknown>,
    // Recent projects (IDE-008): ids and base names only; reopening takes the id of an entry the main process remembers.
    listRecent: () => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.listRecent) as Promise<unknown>,
    openRecent: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.openRecent, request) as Promise<unknown>,
    forgetRecent: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.forgetRecent, request) as Promise<unknown>,
    markOpened: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.markOpened, request) as Promise<unknown>,
    // Changes made outside Studio (IDE-004): watch the window's folder, and hear batches of relative paths.
    watch: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.watch, request) as Promise<unknown>,
    onChanged: (callback: (change: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, change: unknown) => { callback(change); };
      ipcRenderer.on(PROJECT_FILES_EVENT.changed, listener);
      return () => { ipcRenderer.removeListener(PROJECT_FILES_EVENT.changed, listener); };
    },
  },
  // Per-project session (IDE-008): the folder is named by the opaque id that projectFiles gave out; the document holds
  // relative paths and numbers. The main process validates it and stores it under the user-data directory.
  session: {
    load: (request: unknown) => ipcRenderer.invoke(SESSION_CHANNEL.LOAD, request) as Promise<unknown>,
    save: (request: unknown) => ipcRenderer.invoke(SESSION_CHANNEL.SAVE, request) as Promise<unknown>,
  },
  // Recovery of modified files (IDE-006): the folder is named by the opaque id that projectFiles gave out; what crosses
  // is a relative path and the text of one file. The main process validates it and keeps it under the user-data directory.
  recovery: {
    write: (request: unknown) => ipcRenderer.invoke(RECOVERY_CHANNEL.WRITE, request) as Promise<unknown>,
    list: (request: unknown) => ipcRenderer.invoke(RECOVERY_CHANNEL.LIST, request) as Promise<unknown>,
    discard: (request: unknown) => ipcRenderer.invoke(RECOVERY_CHANNEL.DISCARD, request) as Promise<unknown>,
  },
  // Update check (IDE-010): one call with no argument; the main process asks one fixed address and answers a version and a link.
  updateCheck: {
    run: () => ipcRenderer.invoke(UPDATE_CHECK_CHANNEL.RUN) as Promise<unknown>,
  },
  learnProgress: {
    read: () => ipcRenderer.invoke(LEARN_PROGRESS_CHANNEL.READ) as Promise<string[]>,
    merge: (mastered: string[]) => ipcRenderer.invoke(LEARN_PROGRESS_CHANNEL.MERGE, mastered) as Promise<string[]>,
  },

  candidateChangeSet: {
    review: (request: { workspaceId: string; edit: { path: string; content: string } }) =>
      ipcRenderer.invoke(CANDIDATE_CHANGE_SET_CHANNEL.REVIEW, request) as Promise<unknown>,
  },

  toolchain: {
    inspect: () => ipcRenderer.invoke(TOOLCHAIN_CHANNEL.INSPECT) as Promise<unknown | null>,
  },

  firmwareBuild: {
    start: (request: { ideId: string }) => ipcRenderer.invoke(FIRMWARE_BUILD_CHANNEL.START, request) as Promise<unknown | null>,
    cancel: () => ipcRenderer.invoke(FIRMWARE_BUILD_CHANNEL.CANCEL) as Promise<{ requested: boolean }>,
  },

  toolExecutionAudit: {
    list: () => ipcRenderer.invoke(TOOL_EXECUTION_AUDIT_CHANNEL.LIST) as Promise<unknown>,
  },

  aiProvider: {
    getStatus: () => ipcRenderer.invoke(AI_PROVIDER_CHANNEL.GET_STATUS) as Promise<unknown>,
    getConfig: () => ipcRenderer.invoke(AI_PROVIDER_CHANNEL.GET_CONFIG) as Promise<unknown>,
    saveConfig: (config: { enabled: boolean; endpoint: string; model: string }) => ipcRenderer.invoke(AI_PROVIDER_CHANNEL.SAVE_CONFIG, config) as Promise<unknown>,
    storeKey: (key: string) => ipcRenderer.invoke(AI_PROVIDER_CHANNEL.STORE_KEY, key) as Promise<unknown>,
    clearKey: () => ipcRenderer.invoke(AI_PROVIDER_CHANNEL.CLEAR_KEY) as Promise<unknown>,
    request: (request: { workspaceId: string; mode: 'ask' | 'plan' | 'edit' | 'debug'; prompt: string; activeFile?: { fileId: string; path: string }; diagnostics?: Array<{ code: string; path?: string; line?: number; column?: number }>; trace?: Array<{ atMs: number; signal: string; value: boolean | number }> }) => ipcRenderer.invoke(AI_PROVIDER_CHANNEL.REQUEST, request) as Promise<unknown>,
    cancel: () => ipcRenderer.invoke(AI_PROVIDER_CHANNEL.CANCEL) as Promise<{ requested: boolean }>,
  },

  /**
   * Check if we're running in Electron
   */
  isElectron: true,

  /**
   * Get the platform (darwin, win32, linux)
   */
  platform: process.platform,
});

// Extend the Window interface for TypeScript
declare global {
  interface Window {
    electronAPI?: {
      getAppInfo: () => Promise<{
        version: string;
        platform: string;
        arch: string;
        isPackaged: boolean;
      }>;
      nativeSimulation: {
        startSession: () => Promise<NativeSimulationHelloResult>;
        stopSession: () => Promise<void>;
        request: <TResult = unknown>(request: NativeSimulationRequest) => Promise<TResult>;
        onEvent: (callback: (event: NativeSimulationEvent) => void) => () => void;
      };
      workspaceTests: {
        registerProjectFile: (file: File) => Promise<{ workspaceId: string } | null>;
        registerProjectRoot: (request: { rootId: string }) => Promise<{ workspaceId: string } | null>;
        run: (request: { workspaceId: string; scenarioId?: string }) => Promise<unknown>;
        cancel: () => Promise<{ requested: boolean }>;
        compile: (request: { workspaceId: string }) => Promise<unknown>;
        safetyCheck: (request: { workspaceId: string }) => Promise<unknown>;
      };
      closeGuard: {
        setDirty: (dirty: boolean) => Promise<void>;
        closeNow: () => Promise<void>;
        onCloseRequested: (callback: (action: GuardedAction) => void) => () => void;
      };
      candidateChangeSet: {
        review: (request: { workspaceId: string; edit: { path: string; content: string } }) => Promise<unknown>;
      };
      toolchain: {
        inspect: () => Promise<unknown | null>;
      };
      firmwareBuild: {
        start: (request: { ideId: string }) => Promise<unknown | null>;
        cancel: () => Promise<{ requested: boolean }>;
      };
      toolExecutionAudit: {
        list: () => Promise<unknown>;
      };
      aiProvider: {
        getStatus: () => Promise<unknown>;
        getConfig: () => Promise<unknown>;
        saveConfig: (config: { enabled: boolean; endpoint: string; model: string }) => Promise<unknown>;
        storeKey: (key: string) => Promise<unknown>;
        clearKey: () => Promise<unknown>;
        request: (request: { workspaceId: string; mode: 'ask' | 'plan' | 'edit' | 'debug'; prompt: string; activeFile?: { fileId: string; path: string }; diagnostics?: Array<{ code: string; path?: string; line?: number; column?: number }>; trace?: Array<{ atMs: number; signal: string; value: boolean | number }> }) => Promise<unknown>;
        cancel: () => Promise<{ requested: boolean }>;
      };
      isElectron: boolean;
      platform: string;
    };
  }
}
