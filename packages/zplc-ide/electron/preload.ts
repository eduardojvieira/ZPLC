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
const LEARN_PROGRESS_CHANNEL = { READ: 'learn-progress:read', MERGE: 'learn-progress:merge' } as const;

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
    run: (request: { workspaceId: string; scenarioId?: string }) =>
      ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.RUN, request) as Promise<unknown>,
    cancel: () => ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.CANCEL) as Promise<{ requested: boolean }>,
    compile: (request: { workspaceId: string }) =>
      ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.COMPILE, request) as Promise<unknown>,
    safetyCheck: (request: { workspaceId: string }) =>
      ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.SAFETY_CHECK, request) as Promise<unknown>,
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
        run: (request: { workspaceId: string; scenarioId?: string }) => Promise<unknown>;
        cancel: () => Promise<{ requested: boolean }>;
        compile: (request: { workspaceId: string }) => Promise<unknown>;
        safetyCheck: (request: { workspaceId: string }) => Promise<unknown>;
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
