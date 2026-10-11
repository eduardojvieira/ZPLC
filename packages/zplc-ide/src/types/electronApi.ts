/**
 * What the Electron preload exposes to the renderer as `window.electronAPI`. The declaration lives apart from the
 * language and project types: it is the renderer's picture of the host, and it changes with the host's bridges.
 */

import type { ProjectFilesBridge } from '../../electron/projectFilesProtocol';
import type { RecoveryBridge } from '../../electron/recoveryStoreProtocol';
import type { SerialPortBridge } from '../../electron/serialPortProtocol';
import type { SessionBridge } from '../../electron/sessionStoreProtocol';
import type { FirmwareImagesBridge } from '../../electron/firmwareImagesProtocol';
import type { UpdateCheckBridge } from '../../electron/updateCheckProtocol';

// =============================================================================
// Electron API (exposed via preload script)
// =============================================================================

declare global {
  interface Window {
    electronAPI?: {
      getAppInfo: () => Promise<{
        version: string;
        platform: string;
        arch: string;
        isPackaged: boolean;
      }>;
      nativeSimulation?: {
        startSession: () => Promise<{
          protocol_version: string;
          runtime_kind: string;
          runtime_version: string;
          capability_profile: {
            profile_id: string;
            features: Array<{
              name: string;
              status: 'supported' | 'degraded' | 'unavailable';
              reason?: string;
              recommended_action?: string;
            }>;
          };
        }>;
        stopSession: () => Promise<void>;
        request: <TResult = unknown>(request: {
          id: string;
          type: 'request';
          method: string;
          params: Record<string, unknown>;
        }) => Promise<TResult>;
        onEvent?: (callback: (event: {
          type: 'event';
          method: string;
          params: Record<string, unknown>;
        }) => void) => () => void;
      };
      workspaceTests: {
        registerProjectFile: (file: File) => Promise<{ workspaceId: string } | null>;
        registerProjectRoot: (request: { rootId: string }) => Promise<{ workspaceId: string } | null>;
        run: (request: { workspaceId: string; rootId: string; scenarioId?: string }) => Promise<unknown>;
        cancel: () => Promise<{ requested: boolean }>;
        compile: (request: { workspaceId: string; rootId: string }) => Promise<unknown>;
        safetyCheck: (request: { workspaceId: string; rootId: string }) => Promise<unknown>;
        /** Grades the shown project against the reference scenario of a lesson package (LRN-022); the answer is validated by the caller. */
        lessonCheck: (request: { workspaceId: string; rootId: string; lessonId: string }) => Promise<unknown>;
      };
      closeGuard?: {
        setDirty: (dirty: boolean) => Promise<void>;
        closeNow: () => Promise<void>;
        onCloseRequested: (callback: (action: 'close' | 'reload') => void) => () => void;
      };
      /** The Learn progress the main process keeps (LRN-031, LRN-032); every document it returns is validated by the caller. */
      learnProgress?: {
        read: () => Promise<string[]>;
        merge: (mastered: string[]) => Promise<string[]>;
        readProgress: () => Promise<unknown>;
        recordGrade: (record: unknown) => Promise<unknown>;
        noteLesson: (note: unknown) => Promise<unknown>;
        exportProgress: () => Promise<unknown>;
        importProgress: (text: string) => Promise<unknown>;
      };
      candidateChangeSet?: {
        review: (request: { workspaceId: string; edit: { path: string; content: string } }) => Promise<unknown>;
      };
      aiProvider?: {
        getStatus: () => Promise<unknown>;
        getConfig: () => Promise<unknown>;
        saveConfig: (config: { enabled: boolean; endpoint: string; model: string }) => Promise<unknown>;
        storeKey: (key: string) => Promise<unknown>;
        clearKey: () => Promise<unknown>;
        request: (request: {
          workspaceId: string;
          mode: 'ask' | 'plan' | 'edit' | 'debug';
          prompt: string;
          activeFile?: { fileId: string; path: string };
          diagnostics?: Array<{ code: string; path?: string; line?: number; column?: number }>;
          trace?: Array<{ atMs: number; signal: string; value: boolean | number }>;
        }) => Promise<unknown>;
        cancel: () => Promise<{ requested: boolean }>;
      };
      toolchain?: {
        inspect: () => Promise<unknown | null>;
      };
      firmwareBuild?: {
        start: (request: { ideId: string }) => Promise<unknown | null>;
        cancel: () => Promise<{ requested: boolean }>;
      };
      toolExecutionAudit?: {
        list: () => Promise<unknown>;
      };
      /** Native folder dialog and typed project operations, owned by the main process (IDE-001). */
      projectFiles?: ProjectFilesBridge;
      /** The per-project session (open tabs, cursors, panel sizes), kept by the main process (IDE-008). */
      session?: SessionBridge;
      /** The serial port the user chooses in the in-application dialog: the main process offers the ports, the window answers (IDE-018). */
      portChoice?: SerialPortBridge;
      /** What the main process keeps of modified files, so that a crash loses nothing the user typed (IDE-006). */
      recovery?: RecoveryBridge;
      /** Asks the main process whether a newer release exists, when the user turned the update check on or pressed Check now (IDE-010). */
      updateCheck?: UpdateCheckBridge;
      /** The firmware images of the release this installation belongs to, with checksums and flashing steps; Studio never flashes (REL-025). */
      firmwareImages?: FirmwareImagesBridge;
      isElectron: boolean;
      platform: string;
    };
  }
}
