/**
 * ZPLC IDE - Electron Preload Script
 *
 * This script runs in a special context with access to both Node.js and DOM APIs.
 * It exposes safe APIs to the renderer process via contextBridge. Every channel name comes from `ipcContract.ts`, the
 * one definition shared with the main process and the renderer (IDE-017); `electron:compile` bundles this file with that
 * module into the single script a sandboxed preload may load.
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type {
  NativeSimulationEvent,
  NativeSimulationHelloResult,
  NativeSimulationRequest,
} from './nativeSimulationIpc.js';

import {
  AI_PROVIDER_CHANNEL,
  APP_INFO_CHANNEL,
  CANDIDATE_CHANGE_SET_CHANNEL,
  CLOSE_GUARD_CHANNEL,
  FIRMWARE_BUILD_CHANNEL,
  LEARN_PROGRESS_CHANNEL,
  MENU_CHANNEL,
  NATIVE_SIMULATION_CHANNEL,
  PROJECT_FILES_CHANNEL,
  PROJECT_FILES_EVENT,
  RECOVERY_CHANNEL,
  PORT_CHOICE_CHANNEL,
  SESSION_CHANNEL,
  WINDOW_PREFERENCES_CHANNEL,
  TOOLCHAIN_CHANNEL,
  TOOL_EXECUTION_AUDIT_CHANNEL,
  UPDATE_CHECK_CHANNEL,
  FIRMWARE_IMAGES_CHANNEL,
  WORKSPACE_TESTS_CHANNEL,
} from './ipcContract.js';


type GuardedAction = 'close' | 'reload';

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Get application information
   */
  getAppInfo: () => ipcRenderer.invoke(APP_INFO_CHANNEL.GET),

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
    run: (request: { workspaceId: string; rootId: string; scenarioId?: string }) =>
      ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.RUN, request) as Promise<unknown>,
    cancel: () => ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.CANCEL) as Promise<{ requested: boolean }>,
    compile: (request: { workspaceId: string; rootId: string }) =>
      ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.COMPILE, request) as Promise<unknown>,
    safetyCheck: (request: { workspaceId: string; rootId: string }) =>
      ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.SAFETY_CHECK, request) as Promise<unknown>,
    // Grades the shown project against the scenario of a lesson package: a lesson id crosses, never a scenario (LRN-022).
    lessonCheck: (request: { workspaceId: string; rootId: string; lessonId: string }) =>
      ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.LESSON_CHECK, request) as Promise<unknown>,
  },
  // The application menu (UX-014): the id of the command a menu item chose. The window runs it through its command
  // registry, behind the same gates as the button of the toolbar; the preload carries an id and nothing else.
  menu: {
    onCommand: (callback: (commandId: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, commandId: unknown) => { callback(commandId); };
      ipcRenderer.on(MENU_CHANNEL.COMMAND, listener);
      return () => { ipcRenderer.removeListener(MENU_CHANNEL.COMMAND, listener); };
    },
  },
  // The language and theme of the window, for the language of the menu and the colour of the next window (UX-014, UX-016).
  windowPreferences: {
    report: (preferences: { language: string; theme: string }) => ipcRenderer.invoke(WINDOW_PREFERENCES_CHANNEL.REPORT, preferences) as Promise<null>,
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
    // Project archives (IDE-022): the dialogs are native and in the main process; the renderer sends the id of the open
    // folder, or the id of an archive the main process has read, and never a path.
    exportArchive: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.exportArchive, request) as Promise<unknown>,
    inspectArchive: () => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.inspectArchive) as Promise<unknown>,
    extractArchive: (request: unknown) => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.extractArchive, request) as Promise<unknown>,
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
  // The serial port (IDE-018): the main process offers the ports the system lists, the window answers with one of them or
  // a cancel. What crosses is an opaque port id and numbers and text to show, never a path.
  portChoice: {
    choose: (choice: { requestId: string; portId: string | null }) => ipcRenderer.invoke(PORT_CHOICE_CHANNEL.CHOOSE, choice) as Promise<unknown>,
    list: (request: { requestId: string }) => ipcRenderer.invoke(PORT_CHOICE_CHANNEL.LIST, request) as Promise<unknown>,
    onRequested: (callback: (offer: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, offer: unknown) => { callback(offer); };
      ipcRenderer.on(PORT_CHOICE_CHANNEL.REQUESTED, listener);
      return () => { ipcRenderer.removeListener(PORT_CHOICE_CHANNEL.REQUESTED, listener); };
    },
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
  // Firmware images (REL-025): one call with no argument; the main process lists the manifest of this installation and
  // the files beside it. Nothing here flashes: the answer is data that Studio shows.
  firmwareImages: {
    list: () => ipcRenderer.invoke(FIRMWARE_IMAGES_CHANNEL.LIST) as Promise<unknown>,
  },
  // Learn progress (LRN-031, LRN-032): ids, one grade record, one lesson note, or the text of a file the learner chose. The
  // main process keeps the document under the user-data directory; results are documents the renderer validates again.
  learnProgress: {
    read: () => ipcRenderer.invoke(LEARN_PROGRESS_CHANNEL.READ) as Promise<string[]>,
    merge: (mastered: string[]) => ipcRenderer.invoke(LEARN_PROGRESS_CHANNEL.MERGE, mastered) as Promise<string[]>,
    readProgress: () => ipcRenderer.invoke(LEARN_PROGRESS_CHANNEL.READ_PROGRESS) as Promise<unknown>,
    recordGrade: (record: unknown) => ipcRenderer.invoke(LEARN_PROGRESS_CHANNEL.RECORD_GRADE, record) as Promise<unknown>,
    noteLesson: (note: unknown) => ipcRenderer.invoke(LEARN_PROGRESS_CHANNEL.NOTE_LESSON, note) as Promise<unknown>,
    exportProgress: () => ipcRenderer.invoke(LEARN_PROGRESS_CHANNEL.EXPORT) as Promise<unknown>,
    importProgress: (text: string) => ipcRenderer.invoke(LEARN_PROGRESS_CHANNEL.IMPORT, text) as Promise<unknown>,
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
        run: (request: { workspaceId: string; rootId: string; scenarioId?: string }) => Promise<unknown>;
        cancel: () => Promise<{ requested: boolean }>;
        compile: (request: { workspaceId: string; rootId: string }) => Promise<unknown>;
        safetyCheck: (request: { workspaceId: string; rootId: string }) => Promise<unknown>;
        lessonCheck: (request: { workspaceId: string; rootId: string; lessonId: string }) => Promise<unknown>;
      };
      learnProgress: {
        read: () => Promise<string[]>;
        merge: (mastered: string[]) => Promise<string[]>;
        readProgress: () => Promise<unknown>;
        recordGrade: (record: unknown) => Promise<unknown>;
        noteLesson: (note: unknown) => Promise<unknown>;
        exportProgress: () => Promise<unknown>;
        importProgress: (text: string) => Promise<unknown>;
      };
      closeGuard: {
        setDirty: (dirty: boolean) => Promise<void>;
        closeNow: () => Promise<void>;
        onCloseRequested: (callback: (action: GuardedAction) => void) => () => void;
      };
      portChoice: {
        choose: (choice: { requestId: string; portId: string | null }) => Promise<unknown>;
        list: (request: { requestId: string }) => Promise<unknown>;
        onRequested: (callback: (offer: unknown) => void) => () => void;
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
