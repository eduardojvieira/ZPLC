/**
 * The IPC contract of Studio (IDE-017): the one definition of every channel name that crosses between the renderer, the
 * preload and the main process. Pure TypeScript with no Electron or Node import, so that all three can import it.
 *
 *   - the main process registers a handler for each invoke channel here, and for none that is not here
 *     (`ipcRegistry.ts` refuses a table that differs from `IPC_INVOKE_CHANNELS`);
 *   - the preload imports the names from this module (it is bundled into one script by `electron:compile`, so a
 *     sandboxed preload needs no copy of them) and exposes one typed method per channel;
 *   - the protocol modules of the renderer (`projectFilesProtocol.ts`, `recoveryStoreProtocol.ts`, ...) re-export the
 *     group they describe from here.
 *
 * Adding a channel means adding it here, a handler in `ipcHandlers.ts` and a method in `preload.ts`; the registry
 * test and the preload test fail until all three agree.
 */

/** The application information query (version, platform, whether the build is packaged). */
export const APP_INFO_CHANNEL = { GET: 'get-app-info' } as const;

export const NATIVE_SIMULATION_CHANNEL = {
  START_SESSION: 'native-simulation:start-session',
  STOP_SESSION: 'native-simulation:stop-session',
  REQUEST: 'native-simulation:request',
  /** Pushed by the main process: runtime events of the owning window. */
  EVENT: 'native-simulation:event',
} as const;

export const WORKSPACE_TESTS_CHANNEL = {
  REGISTER_PROJECT_FILE: 'workspace-tests:register-project-file',
  REGISTER_PROJECT_ROOT: 'workspace-tests:register-project-root',
  RUN: 'workspace-tests:run',
  CANCEL: 'workspace-tests:cancel',
  COMPILE: 'workspace-tests:compile',
  SAFETY_CHECK: 'workspace-tests:safety-check',
} as const;

export const CANDIDATE_CHANGE_SET_CHANNEL = { REVIEW: 'candidate-change-set:review' } as const;

export const TOOLCHAIN_CHANNEL = { INSPECT: 'toolchain:inspect' } as const;

export const FIRMWARE_BUILD_CHANNEL = { START: 'firmware-build:start', CANCEL: 'firmware-build:cancel' } as const;

export const TOOL_EXECUTION_AUDIT_CHANNEL = { LIST: 'tool-execution-audit:list' } as const;

export const AI_PROVIDER_CHANNEL = {
  GET_STATUS: 'ai-provider:get-status',
  GET_CONFIG: 'ai-provider:get-config',
  SAVE_CONFIG: 'ai-provider:save-config',
  STORE_KEY: 'ai-provider:store-key',
  CLEAR_KEY: 'ai-provider:clear-key',
  REQUEST: 'ai-provider:request',
  CANCEL: 'ai-provider:cancel',
} as const;

export const LEARN_PROGRESS_CHANNEL = { READ: 'learn-progress:read', MERGE: 'learn-progress:merge' } as const;

export const SESSION_CHANNEL = { LOAD: 'session:load', SAVE: 'session:save' } as const;

export const CLOSE_GUARD_CHANNEL = {
  SET_DIRTY: 'close-guard:set-dirty',
  CLOSE_NOW: 'close-guard:close-now',
  /** Pushed by the main process: the window asks the renderer to offer save, discard or cancel. */
  CLOSE_REQUESTED: 'close-guard:close-requested',
} as const;

/** The recovery store (IDE-006). */
export const RECOVERY_CHANNEL = { WRITE: 'recovery:write', LIST: 'recovery:list', DISCARD: 'recovery:discard' } as const;

/** The update check (IDE-010). */
export const UPDATE_CHECK_CHANNEL = { RUN: 'update-check:run' } as const;

/** Project files (IDE-001) and recent projects (IDE-008). */
export const PROJECT_FILES_CHANNEL = {
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

/** What the main process pushes to the window when files under its folder changed (IDE-004). */
export const PROJECT_FILES_EVENT = { changed: 'project-files:changed' } as const;

const values = (group: Record<string, string>): string[] => Object.values(group);

/** Every channel the renderer may invoke: the main process answers each of them, behind the sender and message checks. */
export const IPC_INVOKE_CHANNELS: readonly string[] = [
  ...values(APP_INFO_CHANNEL),
  NATIVE_SIMULATION_CHANNEL.START_SESSION, NATIVE_SIMULATION_CHANNEL.STOP_SESSION, NATIVE_SIMULATION_CHANNEL.REQUEST,
  ...values(WORKSPACE_TESTS_CHANNEL),
  ...values(CANDIDATE_CHANGE_SET_CHANNEL),
  ...values(TOOLCHAIN_CHANNEL),
  ...values(FIRMWARE_BUILD_CHANNEL),
  ...values(TOOL_EXECUTION_AUDIT_CHANNEL),
  ...values(AI_PROVIDER_CHANNEL),
  ...values(LEARN_PROGRESS_CHANNEL),
  ...values(SESSION_CHANNEL),
  CLOSE_GUARD_CHANNEL.SET_DIRTY, CLOSE_GUARD_CHANNEL.CLOSE_NOW,
  ...values(RECOVERY_CHANNEL),
  ...values(UPDATE_CHECK_CHANNEL),
  ...values(PROJECT_FILES_CHANNEL),
];

/** Every channel the main process pushes to the renderer; the renderer never sends on them and no handler answers them. */
export const IPC_EVENT_CHANNELS: readonly string[] = [
  NATIVE_SIMULATION_CHANNEL.EVENT,
  CLOSE_GUARD_CHANNEL.CLOSE_REQUESTED,
  PROJECT_FILES_EVENT.changed,
];
