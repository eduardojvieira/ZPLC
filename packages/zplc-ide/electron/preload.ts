/**
 * ZPLC IDE - Electron Preload Script
 *
 * This script runs in a special context with access to both Node.js and DOM APIs.
 * It exposes safe APIs to the renderer process via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

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

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Get application information
   */
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  /**
   * Open an external URL in the default browser
   */
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

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
      openExternal: (url: string) => Promise<void>;
      nativeSimulation: {
        startSession: () => Promise<NativeSimulationHelloResult>;
        stopSession: () => Promise<void>;
        request: <TResult = unknown>(request: NativeSimulationRequest) => Promise<TResult>;
        onEvent: (callback: (event: NativeSimulationEvent) => void) => () => void;
      };
      isElectron: boolean;
      platform: string;
    };
  }
}
