/**
 * ZPLC IDE - Electron Preload Script
 * 
 * This script runs in a special context with access to both Node.js and DOM APIs.
 * It exposes safe APIs to the renderer process via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

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
      isElectron: boolean;
      platform: string;
    };
  }
}

console.log('[Preload] ZPLC IDE preload script loaded');
console.log('[Preload] Platform:', process.platform);
