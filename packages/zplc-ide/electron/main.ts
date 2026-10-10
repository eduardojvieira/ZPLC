/**
 * ZPLC IDE - Electron Main Process
 * 
 * Handles window management, WebSerial permissions, and native integration.
 * This is the entry point for the Electron desktop application.
 */

import { app, BrowserWindow, dialog, Menu, nativeTheme, session, ipcMain, safeStorage, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { createHash } from 'node:crypto';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { NativeSimulationRequest } from './nativeSimulationIpc.js';
import { NativeSimulationSupervisor } from './nativeSimulationSupervisor.js';
import { nativeSimulationEnvironment } from './nativeSimulationEnvironment.js';
import { createFirmwareBuildGateway } from './firmwareBuildGateway.js';
import { createWorkspaceTestGateway } from './workspaceTestGateway.js';
import { createToolExecutionAudit } from './toolExecutionAudit.js';
import { selectSerialPort } from './serialPortSelection.js';
import { createAiProvider } from './aiProvider.js';
import { createLearnProgressStore } from './learnProgressStore.js';
import { createRecentProjects } from './recentProjects.js';
import { createSessionStore } from './sessionStore.js';
import { createRecoveryStore } from './recoveryStore.js';
import { RECOVERY_CHANNEL } from './recoveryStoreProtocol.js';
import { checkForUpdate } from './updateCheck.js';
import { UPDATE_CHECK_CHANNEL } from './updateCheckProtocol.js';
import { buildApplicationMenu, describeApplicationMenu, isReloadShortcut } from './appMenu.js';
import { createCloseGuard } from './closeGuard.js';
import { createProjectFiles } from './projectFiles.js';
import { record, workspaceCompileFailure } from './workspaceCompileFailure.js';
import { PROJECT_FILES_CHANNEL, PROJECT_FILES_EVENT } from './projectFilesProtocol.js';
import { createProjectWatcher } from './projectWatcher.js';
import {
  DEFAULT_DEVELOPMENT_RENDERER_PORT,
  createContentSecurityPolicy,
  isAllowedNativeSimulationRequest,
  isAllowedWorkspaceTestRequest,
  isAllowedWorkspaceRootRequest,
  isAllowedSessionLoadRequest,
  isAllowedSessionSaveRequest,
  isAllowedRecoveryWriteRequest,
  isAllowedRecoveryListRequest,
  isAllowedRecoveryDiscardRequest,
  isAllowedWorkspaceTestRunRequest,
  isAllowedFirmwareBuildRequest,
  isAllowedCandidateChangeSetReviewRequest,
  isAllowedCloseGuardDirty,
  isAllowedAiProviderConfig,
  isAllowedAiProviderKey,
  isAllowedAiProviderRequest,
  sanitizeCandidateChangeSetReview,
  sanitizeWorkspaceSafetyCheck,
  isExpectedRendererDocument,
  isTrustedRenderer,
  parseTrustedDevelopmentRendererPort,
  trustedDevelopmentRendererUrl,
} from './security.js';

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
const LEARN_PROGRESS_CHANNEL = { READ: 'learn-progress:read', MERGE: 'learn-progress:merge' } as const;
const SESSION_CHANNEL = { LOAD: 'session:load', SAVE: 'session:save' } as const;
const CLOSE_GUARD_CHANNEL = { SET_DIRTY: 'close-guard:set-dirty', CLOSE_NOW: 'close-guard:close-now', CLOSE_REQUESTED: 'close-guard:close-requested' } as const;

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep a global reference of the window object to prevent GC
let mainWindow: BrowserWindow | null = null;
let nativeSimulationSupervisor: NativeSimulationSupervisor | null = null;
let nativeSimulationUnsubscribe: (() => void) | null = null;
interface RendererOwner { ownerId: number; epoch: number; }
let rendererDocumentEpoch = 0;
let activeRendererOwner: RendererOwner | null = null;
let nativeSimulationOwner: RendererOwner | null = null;
const workspaceTestGateway = createWorkspaceTestGateway();
const firmwareBuildGateway = createFirmwareBuildGateway();
const toolExecutionAudit = createToolExecutionAudit();
const closeGuard = createCloseGuard();
let recentProjects: ReturnType<typeof createRecentProjects> | null = null;
let sessionStore: ReturnType<typeof createSessionStore> | null = null;
let recoveryStore: ReturnType<typeof createRecoveryStore> | null = null;
// Changes made outside Studio reach only the window that owns the folder, as relative paths (IDE-004).
const projectWatcher = createProjectWatcher({
  send: (ownerId, change) => {
    const target = mainWindow?.webContents;
    if (target && !target.isDestroyed() && target.id === ownerId) target.send(PROJECT_FILES_EVENT.changed, change);
  },
});
const projectFiles = createProjectFiles(chooseProjectDirectory, () => recentProjects, projectWatcher, { dialog, getWindow: () => mainWindow, isPackaged: app.isPackaged, env: process.env });
const toolApiUrl = pathToFileURL(path.join(__dirname, 'toolApi.js')).href;
let aiProvider: ReturnType<typeof createAiProvider> | null = null;
let learnProgress: ReturnType<typeof createLearnProgressStore> | null = null;

/** Turns private Tool API fields into the sole structured-clone payload accepted by Toolbar. */
function toWorkspaceCompileEnvelope(value: unknown, execution?: unknown): unknown {
  const result = record(value);
  if (!result || result.ok !== true) return { ...workspaceCompileFailure(value), ...(execution ? { execution } : {}) };
  const summary = record(result.summary);
  const debugMap = record(result.debugMap);
  const taskCount = summary?.taskCount;
  const codeSize = summary?.codeSize;
  if (!summary || typeof summary.name !== 'string' || summary.name.length === 0 || summary.name.length > 256
    || typeof taskCount !== 'number' || !Number.isSafeInteger(taskCount) || taskCount < 1
    || typeof codeSize !== 'number' || !Number.isSafeInteger(codeSize) || codeSize < 0
    || !(result.zplcFile instanceof Uint8Array) || result.zplcFile.byteLength === 0
    || !(result.bytecode instanceof Uint8Array) || result.bytecode.byteLength === 0
    || typeof result.assembly !== 'string'
    || !debugMap || !record(debugMap.pou) || !record(debugMap.memoryLayout)) return workspaceCompileFailure(undefined);
  return {
    ok: true,
    summary: { name: summary.name, taskCount, codeSize },
    artifact: {
      zplcFile: result.zplcFile,
      bytecode: result.bytecode,
      assembly: result.assembly,
      debugMap,
    },
    zplcEvidence: {
      sha256: createHash('sha256').update(result.zplcFile).digest('hex'),
      byteLength: result.zplcFile.byteLength,
    },
    ...(execution ? { execution } : {}),
  };
}

type ExecutionToolApi = {
  startToolExecution(actor: 'human-studio' | 'agent', permission: string, operation: string): { jobId: string; startedAt: string };
  finishToolExecution(start: { jobId: string; actor: 'human-studio' | 'agent'; permission: string; operation: string; startedAt: string }, value: unknown): unknown;
  isToolExecutionEnvelope(value: unknown): boolean;
};

async function finishStudioExecution(
  toolApi: ExecutionToolApi,
  start: { jobId: string; startedAt: string },
  permission: string,
  operation: string,
  value: unknown,
): Promise<unknown> {
  const execution = toolApi.finishToolExecution({
    jobId: start.jobId,
    startedAt: start.startedAt,
    actor: 'human-studio',
    permission,
    operation,
  }, value);
  if (!toolApi.isToolExecutionEnvelope(execution)) throw new Error('Workspace operation failed');
  await toolExecutionAudit.add(execution);
  return execution;
}

async function finishAgentReviewExecution(
  toolApi: ExecutionToolApi,
  start: { jobId: string; startedAt: string },
  value: unknown,
): Promise<void> {
  const execution = toolApi.finishToolExecution({
    jobId: start.jobId,
    startedAt: start.startedAt,
    actor: 'agent',
    permission: 'tests:run',
    operation: 'change-set-review',
  }, value);
  if (!toolApi.isToolExecutionEnvelope(execution)) throw new Error('Workspace operation failed');
  await toolExecutionAudit.add(execution);
}

// Packaging is the trust boundary; inherited NODE_ENV must not enable dev behavior.
const isDev = !app.isPackaged;

function developmentRendererPort(): number {
  if (!isDev || !app.commandLine.hasSwitch('zplc-smoke-port')) return DEFAULT_DEVELOPMENT_RENDERER_PORT;
  if (!app.commandLine.hasSwitch('headless')) throw new Error('--zplc-smoke-port requires --headless');
  const port = parseTrustedDevelopmentRendererPort(app.commandLine.getSwitchValue('zplc-smoke-port'));
  if (port === null) throw new Error('Invalid --zplc-smoke-port');
  return port;
}

const rendererDevelopmentPort = developmentRendererPort();

const appVersion = app.getVersion();

function expectedRendererUrl(): string {
  return isDev
    ? trustedDevelopmentRendererUrl(rendererDevelopmentPort)
    : pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
}

function rendererOwnerIsCurrent(owner: RendererOwner): boolean {
  return activeRendererOwner?.ownerId === owner.ownerId
    && activeRendererOwner.epoch === owner.epoch
    && mainWindow?.webContents.id === owner.ownerId
    && !mainWindow.webContents.isDestroyed()
    && isExpectedRendererDocument(mainWindow.webContents.getURL(), expectedRendererUrl());
}

function serialRendererIsCurrent(webContents: WebContents): boolean {
  const owner = activeRendererOwner;
  return owner !== null
    && webContents === mainWindow?.webContents
    && webContents.id === owner.ownerId
    && rendererOwnerIsCurrent(owner);
}

function currentRendererOwner(event: IpcMainInvokeEvent): RendererOwner | null {
  const owner = activeRendererOwner;
  return owner
    && event.sender.id === owner.ownerId
    && isTrustedRenderer(event, mainWindow, expectedRendererUrl())
    && rendererOwnerIsCurrent(owner)
    ? owner
    : null;
}

function nativeSimulationBelongsTo(owner: RendererOwner): boolean {
  return nativeSimulationOwner?.ownerId === owner.ownerId
    && nativeSimulationOwner.epoch === owner.epoch
    && rendererOwnerIsCurrent(owner);
}

function revokeRendererOwner(ownerId: number): void {
  workspaceTestGateway.revokeOwner(ownerId);
  firmwareBuildGateway.revokeOwner(ownerId);
  projectFiles.revokeOwner(ownerId);
  aiProvider?.cancel();
  if (activeRendererOwner?.ownerId === ownerId) {
    activeRendererOwner = null;
    rendererDocumentEpoch += 1;
  }
  if (nativeSimulationOwner?.ownerId !== ownerId) return;

  nativeSimulationOwner = null;
  nativeSimulationUnsubscribe?.();
  nativeSimulationUnsubscribe = null;
  const supervisor = nativeSimulationSupervisor;
  nativeSimulationSupervisor = null;
  void supervisor?.stopSession().catch(() => undefined);
}

function activateRendererDocument(ownerId: number): void {
  revokeRendererOwner(ownerId);
  activeRendererOwner = { ownerId, epoch: ++rendererDocumentEpoch };
}

/** Asks the renderer to offer save, discard or cancel; it answers with CLOSE_NOW for save and discard. */
function askRendererBeforeLosingWork(action: 'close' | 'reload'): void {
  const webContents = mainWindow?.webContents;
  if (!webContents || webContents.isDestroyed() || !isExpectedRendererDocument(webContents.getURL(), expectedRendererUrl())) return;
  webContents.send(CLOSE_GUARD_CHANNEL.CLOSE_REQUESTED, action);
}

function requestReload(): void {
  if (!mainWindow) return;
  if (closeGuard.request('reload') === 'proceed') mainWindow.webContents.reload();
  else askRendererBeforeLosingWork('reload');
}

/**
 * The native folder dialog of the main window: the only way a project root is chosen (IDE-001).
 * A host that is not packaged may answer it from a test file (T7.5); a packaged build never does, and its archive
 * does not even hold the module that reads the file (VF-008), so the module is imported only when not packaged.
 */
async function chooseProjectDirectory(ownerId: number): Promise<string | null> {
  const win = mainWindow;
  if (!win || win.isDestroyed() || win.webContents.id !== ownerId) return null;
  if (!app.isPackaged) {
    const { readFolderDialogHook } = await import('./devFolderDialogHook.js');
    const answer = readFolderDialogHook(app.isPackaged, process.env);
    if (answer !== undefined) return answer;
  }
  const result = await dialog.showOpenDialog(win, { title: 'Choose project folder', properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0] ?? null;
}

const APP_WINDOW_TITLE = 'ZPLC Studio';
/** --color-surface-900 of the light and dark themes in src/index.css (src/theme/windowSurface.test.ts keeps them equal). */
const WINDOW_SURFACE = { light: '#e7ece8', dark: '#0f171b' } as const;
/** The canvas colour of the theme the renderer applied from its stored preference (light, dark, high contrast or system). */
const RENDERER_SURFACE_SCRIPT = 'getComputedStyle(document.documentElement).backgroundColor';

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: APP_WINDOW_TITLE,
    // Hidden until the page has painted; the colour below only shows if the renderer never reports one.
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? WINDOW_SURFACE.dark : WINDOW_SURFACE.light,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    // macOS specific
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
  });
  const ownerWebContentsId = mainWindow.webContents.id;
  const webContents = mainWindow.webContents;
  const win = mainWindow;

  // Show the window once the page has painted, in the canvas colour of the stored theme (UX-016).
  // ponytail: read once at show time; a theme switched later reaches the native colour on the next launch (upgrade: an IPC from the theme setter).
  const reveal = (): void => { if (!win.isDestroyed() && !win.isVisible()) win.show(); };
  win.once('ready-to-show', () => {
    void webContents.executeJavaScript(RENDERER_SURFACE_SCRIPT).then(
      (surface: unknown) => { if (typeof surface === 'string' && surface.startsWith('rgb(') && !win.isDestroyed()) win.setBackgroundColor(surface); },
      () => undefined,
    ).finally(() => {
      const visibleBeforeReveal = win.isVisible();
      reveal();
      console.info(`[zplc] window title="${win.getTitle()}" background=${win.getBackgroundColor()} visibleBeforeReveal=${visibleBeforeReveal}`);
    });
  });
  // A page that cannot load must not leave an invisible app.
  webContents.once('did-fail-load', reveal);
  webContents.once('render-process-gone', reveal);

  // Reload chords never reach the page or the menu: a packaged build cannot reload by keyboard, and a development host
  // reloads only through the unsaved-work guard (IDE-005).
  webContents.on('before-input-event', (event, input) => {
    if (!isReloadShortcut(input)) return;
    event.preventDefault();
    if (!app.isPackaged) requestReload();
  });

  webContents.on('render-process-gone', () => revokeRendererOwner(ownerWebContentsId));
  webContents.on('render-process-gone', () => closeGuard.release());
  mainWindow.on('unresponsive', () => closeGuard.release());
  mainWindow.on('responsive', () => closeGuard.resume());
  webContents.on('destroyed', () => revokeRendererOwner(ownerWebContentsId));
  webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      revokeRendererOwner(ownerWebContentsId);
    }
  });
  webContents.on('did-navigate', (_event, url) => {
    if (!webContents.isDestroyed() && isExpectedRendererDocument(url, expectedRendererUrl())) {
      activateRendererDocument(ownerWebContentsId);
    }
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    const rendererLoad = mainWindow.loadURL(expectedRendererUrl());
    // A failed load is also reported as did-fail-load; the rejection only has to be handled.
    rendererLoad.catch((error: unknown) => { console.error('Unable to load the renderer', error); });
    // Open DevTools in development
    if (!app.commandLine.hasSwitch('headless')) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // In production, load the built index.html
    const rendererFile = mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    rendererFile.catch((error: unknown) => { console.error('Unable to load the renderer', error); });
  }

  // Closing with modified files asks first: save, discard or cancel (cancel keeps the window).
  mainWindow.on('close', (event) => {
    if (closeGuard.request('close') === 'ask') {
      event.preventDefault();
      askRendererBeforeLosingWork('close');
    }
  });

  // Handle window close
  mainWindow.on('closed', () => {
    revokeRendererOwner(ownerWebContentsId);
    mainWindow = null;
  });

}

/**
 * Setup WebSerial permissions and port selection
 * 
 * Electron doesn't show the native browser serial port picker,
 * so we need to handle the 'select-serial-port' event manually.
 */
function setupWebSerial(): void {
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => (
    permission === 'serial' && webContents !== null && serialRendererIsCurrent(webContents)
  ));

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function setupContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [createContentSecurityPolicy(isDev, rendererDevelopmentPort)],
      },
    });
  });
}

/**
 * Setup serial port selection handler and security policies.
 * This is called when navigator.serial.requestPort() is invoked.
 * Both concerns are consolidated into a single 'web-contents-created'
 * listener to avoid stacking duplicate session handlers on HMR reloads.
 */
function setupSerialPortSelection(): void {
  app.on('web-contents-created', (_event, contents) => {
    // Security: Prevent new window creation
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!isExpectedRendererDocument(url, expectedRendererUrl())) {
        event.preventDefault();
      }
    });
    contents.on('will-redirect', (details) => {
      if (!isExpectedRendererDocument(details.url, expectedRendererUrl())) {
        details.preventDefault();
      }
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());

    // Guard: register serial session handlers only once per session.
    // In dev mode, Vite HMR can trigger multiple 'web-contents-created'
    // events on the same defaultSession, which would stack duplicate
    // 'select-serial-port' handlers and cause the one-time callback to
    // be called twice → "One-time callback was called more than once".
    const sess = contents.session;
    if ((sess as unknown as Record<string, boolean>)._serialHandlerRegistered) return;
    (sess as unknown as Record<string, boolean>)._serialHandlerRegistered = true;

    sess.on('select-serial-port', (event, portList, requestingContents, callback) => {
      event.preventDefault();
      if (!serialRendererIsCurrent(requestingContents)) {
        callback('');
        return;
      }
      const ownerWindow = mainWindow;
      if (!ownerWindow) {
        callback('');
        return;
      }
      const removedPortIds = new Set<string>();
      const onPortRemoved = (_event: Electron.Event, port: Electron.SerialPort, contents: WebContents): void => {
        if (contents === requestingContents) removedPortIds.add(port.portId);
      };
      sess.on('serial-port-removed', onPortRemoved);
      void selectSerialPort({
        ports: portList,
        dialog: { showMessageBox: (options) => dialog.showMessageBox(ownerWindow, options) },
        isCurrent: () => serialRendererIsCurrent(requestingContents),
        isPortStale: (portId) => removedPortIds.has(portId),
        callback,
      }).finally(() => sess.removeListener('serial-port-removed', onPortRemoved));
    });
  });
}

/**
 * Setup IPC handlers for native features
 */
function setupIPC(): void {
  // Handle requests for app info
  ipcMain.handle('get-app-info', (event) => {
    if (!currentRendererOwner(event)) {
      throw new Error('Request denied');
    }
    return {
      version: appVersion,
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged,
    };
  });

  ipcMain.handle(CLOSE_GUARD_CHANNEL.SET_DIRTY, (event, ...args: unknown[]) => {
    if (args.length !== 1 || !isAllowedCloseGuardDirty(args[0]) || !currentRendererOwner(event)) throw new Error('Request denied');
    closeGuard.setDirty(args[0]);
  });
  ipcMain.handle(CLOSE_GUARD_CHANNEL.CLOSE_NOW, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    if (args.length !== 0 || !owner) throw new Error('Request denied');
    const action = closeGuard.confirm();
    // The user answered save or discard: nothing is left to recover, so the next start offers nothing (IDE-006).
    const root = action ? projectFiles.currentRoot(owner.ownerId) : null;
    if (root !== null && recoveryStore) await recoveryStore.discard(root, null).catch(() => undefined);
    if (action === 'reload') mainWindow?.webContents.reload();
    // ponytail: on macOS a vetoed Cmd+Q is not resumed after Discard; a second Cmd+Q quits.
    else if (action === 'close') mainWindow?.destroy();
  });

  ipcMain.handle(TOOL_EXECUTION_AUDIT_CHANNEL.LIST, (event, ...args: unknown[]) => {
    if (args.length !== 0 || !currentRendererOwner(event)) throw new Error('Request denied');
    return toolExecutionAudit.list();
  });
  ipcMain.handle(LEARN_PROGRESS_CHANNEL.READ, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    if (args.length !== 0 || !owner || !learnProgress) throw new Error('Request denied');
    const mastered = await learnProgress.read();
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
    return [...mastered];
  });
  ipcMain.handle(LEARN_PROGRESS_CHANNEL.MERGE, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event); const ids = args[0];
    if (args.length !== 1 || !owner || !learnProgress || !Array.isArray(ids) || ids.length > 10 || !ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128)) throw new Error('Request denied');
    const mastered = await learnProgress.merge(ids);
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
    return [...mastered];
  });

  // Per-project session (IDE-008): the renderer names the window's folder by its opaque id; the main process finds the real
  // path, validates the document and keeps it under the user-data directory, never inside the project.
  ipcMain.handle(SESSION_CHANNEL.LOAD, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event); const request = args[0];
    if (args.length !== 1 || !owner || !sessionStore || !isAllowedSessionLoadRequest(request)) throw new Error('Request denied');
    const root = projectFiles.rootOf(owner.ownerId, request.rootId);
    if (root === null) throw new Error('Request denied');
    const state = await sessionStore.load(root);
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
    return state;
  });
  ipcMain.handle(SESSION_CHANNEL.SAVE, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event); const request = args[0];
    if (args.length !== 1 || !owner || !sessionStore || !isAllowedSessionSaveRequest(request)) throw new Error('Request denied');
    const root = projectFiles.rootOf(owner.ownerId, request.rootId);
    if (root === null) throw new Error('Request denied');
    await sessionStore.save(root, request.state);
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
    return null;
  });

  // Update check (IDE-010): one fixed address, no argument from the renderer; the answer is a version and a release link.
  ipcMain.handle(UPDATE_CHECK_CHANNEL.RUN, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    if (args.length !== 0 || !owner) throw new Error('Request denied');
    const result = await checkForUpdate({ currentVersion: appVersion, fetch: (url, init) => fetch(url, init) });
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
    return result;
  });

  // Recovery of modified files (IDE-006): the renderer sends the content of a modified file a moment after the last
  // keystroke; the main process keeps it under the user-data directory, named by the real path it holds for the window.
  ipcMain.handle(RECOVERY_CHANNEL.WRITE, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event); const request = args[0];
    if (args.length !== 1 || !owner || !recoveryStore || !isAllowedRecoveryWriteRequest(request)) throw new Error('Request denied');
    const root = projectFiles.rootOf(owner.ownerId, request.rootId);
    if (root === null) throw new Error('Request denied');
    await recoveryStore.write(root, request.path, request.content);
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
    return null;
  });
  ipcMain.handle(RECOVERY_CHANNEL.LIST, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event); const request = args[0];
    if (args.length !== 1 || !owner || !recoveryStore || !isAllowedRecoveryListRequest(request)) throw new Error('Request denied');
    const root = projectFiles.rootOf(owner.ownerId, request.rootId);
    if (root === null) throw new Error('Request denied');
    const entries = await recoveryStore.list(root);
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
    return entries;
  });
  ipcMain.handle(RECOVERY_CHANNEL.DISCARD, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event); const request = args[0];
    if (args.length !== 1 || !owner || !recoveryStore || !isAllowedRecoveryDiscardRequest(request)) throw new Error('Request denied');
    const root = projectFiles.rootOf(owner.ownerId, request.rootId);
    if (root === null) throw new Error('Request denied');
    await recoveryStore.discard(root, request.path);
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
    return null;
  });

  // Project files (IDE-001): the sender is checked here, the message and the path inside the shared handler.
  for (const channel of Object.values(PROJECT_FILES_CHANNEL)) {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      const owner = currentRendererOwner(event);
      if (!owner) throw new Error('Request denied');
      const result = await projectFiles.handle(owner.ownerId, channel, args);
      if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
      return result;
    });
  }

  ipcMain.handle(NATIVE_SIMULATION_CHANNEL.START_SESSION, async (event) => {
    const owner = currentRendererOwner(event);
    if (!owner) {
      throw new Error('Request denied');
    }
    if (!nativeSimulationSupervisor) {
      nativeSimulationSupervisor = new NativeSimulationSupervisor({
        clientName: 'zplc-ide',
        clientVersion: appVersion,
        environment: nativeSimulationEnvironment(process.env, isDev, process.resourcesPath),
      });
    }

    const supervisor = nativeSimulationSupervisor;
    nativeSimulationOwner = owner;
    nativeSimulationUnsubscribe?.();
    nativeSimulationUnsubscribe = supervisor.onEvent((nativeEvent) => {
      if (!nativeSimulationBelongsTo(owner)) return;
      if (!mainWindow || mainWindow.webContents.isDestroyed()
        || !isExpectedRendererDocument(mainWindow.webContents.getURL(), expectedRendererUrl())) return;
      mainWindow.webContents.send(NATIVE_SIMULATION_CHANNEL.EVENT, nativeEvent);
    });

    const hello = await supervisor.startSession();
    if (!nativeSimulationBelongsTo(owner) || nativeSimulationSupervisor !== supervisor) {
      throw new Error('Request denied');
    }
    return hello;
  });

  ipcMain.handle(NATIVE_SIMULATION_CHANNEL.STOP_SESSION, async (event) => {
    const owner = currentRendererOwner(event);
    if (!owner) {
      throw new Error('Request denied');
    }

    if (!nativeSimulationSupervisor) {
      return;
    }
    if (!nativeSimulationBelongsTo(owner)) throw new Error('Request denied');

    const supervisor = nativeSimulationSupervisor;
    nativeSimulationOwner = null;
    nativeSimulationUnsubscribe?.();
    nativeSimulationUnsubscribe = null;
    nativeSimulationSupervisor = null;
    await supervisor.stopSession();
  });

  ipcMain.handle(NATIVE_SIMULATION_CHANNEL.REQUEST, async (event, request: NativeSimulationRequest) => {
    const owner = currentRendererOwner(event);
    if (!owner
      || !isAllowedNativeSimulationRequest(request)) {
      throw new Error('Request denied');
    }
    if (!nativeSimulationSupervisor || !nativeSimulationBelongsTo(owner)) {
      throw new Error('Native simulation session is not active');
    }

    const supervisor = nativeSimulationSupervisor;
    const response = await supervisor.request(request);
    if (!nativeSimulationBelongsTo(owner) || nativeSimulationSupervisor !== supervisor) {
      throw new Error('Request denied');
    }
    return response;
  });

  ipcMain.handle(WORKSPACE_TESTS_CHANNEL.REGISTER_PROJECT_FILE, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    if (args.length !== 1 || typeof args[0] !== 'string' || !owner) {
      throw new Error('Request denied');
    }
    const manifestPath = args[0];
    try {
      const token = await workspaceTestGateway.registerProjectManifest(owner.ownerId, manifestPath);
      if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
      return token;
    } catch {
      throw new Error('Workspace operation failed');
    }
  });

  // The project folder the window chose is the workspace of Build, Tests and Simulate: the renderer sends the id of
  // that folder, never a path, and no zplc.json has to be chosen again (IDE-001).
  ipcMain.handle(WORKSPACE_TESTS_CHANNEL.REGISTER_PROJECT_ROOT, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    const request = args[0];
    if (args.length !== 1 || !owner || !isAllowedWorkspaceRootRequest(request)) throw new Error('Request denied');
    const root = projectFiles.rootOf(owner.ownerId, request.rootId);
    if (root === null) throw new Error('Workspace operation failed');
    try {
      const token = await workspaceTestGateway.registerProjectManifest(owner.ownerId, path.join(root, 'zplc.json'));
      if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
      return token;
    } catch {
      throw new Error('Workspace operation failed');
    }
  });

  ipcMain.handle(WORKSPACE_TESTS_CHANNEL.RUN, async (event, ...args: unknown[]) => {
    if (args.length !== 1) {
      throw new Error('Request denied');
    }
    const request = args[0];
    const owner = currentRendererOwner(event);
    if (!owner
      || !isAllowedWorkspaceTestRunRequest(request)) {
      throw new Error('Request denied');
    }
    const workspaceRequest = { workspaceId: request.workspaceId };
    const scenarioId = request.scenarioId;

    const result = await workspaceTestGateway.run(owner.ownerId, workspaceRequest, async (root, options) => {
      const toolApi = await import(toolApiUrl) as {
        testsRun?: (workspaceRoot: string, options: { signal: AbortSignal }) => Promise<unknown>;
        scenarioRun?: (workspaceRoot: string, scenarioId: string, options: { signal: AbortSignal }) => Promise<unknown>;
      } & ExecutionToolApi;
      if (scenarioId !== undefined) {
        if (typeof toolApi.scenarioRun !== 'function') throw new Error('Workspace operation failed');
        const value = await toolApi.scenarioRun(root, scenarioId, options);
        return { ...(value as object), execution: await finishStudioExecution(toolApi, options, 'tests:run', 'scenario-run', value) };
      }
      if (typeof toolApi.testsRun !== 'function') throw new Error('Workspace operation failed');
      const value = await toolApi.testsRun(root, options);
      return { ...(value as object), execution: await finishStudioExecution(toolApi, options, 'tests:run', 'test', value) };
    });
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
    return result;
  });

  ipcMain.handle(WORKSPACE_TESTS_CHANNEL.CANCEL, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    if (args.length !== 0 || !owner) throw new Error('Request denied');
    return workspaceTestGateway.cancel(owner.ownerId);
  });

  ipcMain.handle(WORKSPACE_TESTS_CHANNEL.COMPILE, async (event, ...args: unknown[]) => {
    if (args.length !== 1) throw new Error('Request denied');
    const request = args[0];
    const owner = currentRendererOwner(event);
    if (!owner
      || !isAllowedWorkspaceTestRequest(request)) throw new Error('Request denied');
    try {
      const result = await workspaceTestGateway.run(owner.ownerId, request, async (root, options) => {
        const toolApi = await import(toolApiUrl) as { compilerCompile?: (workspaceRoot: string) => Promise<unknown> } & ExecutionToolApi;
        if (typeof toolApi.compilerCompile !== 'function') throw new Error('Workspace operation failed');
        const value = await toolApi.compilerCompile(root);
        return toWorkspaceCompileEnvelope(value, await finishStudioExecution(toolApi, options, 'compiler:check', 'compile', value));
      });
      if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
      return result;
    } catch {
      throw new Error('Workspace operation failed');
    }
  });

  ipcMain.handle(WORKSPACE_TESTS_CHANNEL.SAFETY_CHECK, async (event, ...args: unknown[]) => {
    if (args.length !== 1) throw new Error('Request denied');
    const request = args[0];
    const owner = currentRendererOwner(event);
    if (!owner || !isAllowedWorkspaceTestRequest(request)) throw new Error('Request denied');
    try {
      const result = await workspaceTestGateway.run(owner.ownerId, request, async (root, options) => {
        const toolApi = await import(toolApiUrl) as { safetyCheck?: (workspaceRoot: string) => Promise<unknown> } & ExecutionToolApi;
        if (typeof toolApi.safetyCheck !== 'function') throw new Error('Workspace operation failed');
        const value = await toolApi.safetyCheck(root);
        return { ...(value as object), execution: await finishStudioExecution(toolApi, options, 'safety:check', 'safety-check', value) };
      });
      const safe = sanitizeWorkspaceSafetyCheck(result);
      if (!safe || !rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
      return safe;
    } catch {
      throw new Error('Workspace operation failed');
    }
  });

  ipcMain.handle(CANDIDATE_CHANGE_SET_CHANNEL.REVIEW, async (event, ...args: unknown[]) => {
    if (args.length !== 1) throw new Error('Request denied');
    const request = args[0];
    const owner = currentRendererOwner(event);
    if (!owner || !isAllowedCandidateChangeSetReviewRequest(request)) throw new Error('Request denied');
    let safe: unknown;
    try {
      const result = await workspaceTestGateway.run(owner.ownerId, { workspaceId: request.workspaceId }, async (root, options) => {
        const toolApi = await import(toolApiUrl) as {
          createCandidateChangeSet?: (workspaceRoot: string, edits: unknown, options: { signal: AbortSignal }) => Promise<unknown>;
        } & ExecutionToolApi;
        if (typeof toolApi.createCandidateChangeSet !== 'function') throw new Error('Workspace operation failed');
        let value: unknown;
        try {
          value = await toolApi.createCandidateChangeSet(root, [{ path: request.edit.path, content: request.edit.content }], options);
        } catch {
          await finishAgentReviewExecution(toolApi, options, { evidence: { outcome: 'failed' } });
          throw new Error('Workspace operation failed');
        }
        await finishAgentReviewExecution(toolApi, options, value);
        return value;
      });
      safe = sanitizeCandidateChangeSetReview(result, request.edit.path);
      if (!safe) throw new Error('Workspace operation failed');
    } catch {
      throw new Error('Workspace operation failed');
    }
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
    return safe;
  });

  ipcMain.handle(AI_PROVIDER_CHANNEL.GET_STATUS, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    if (args.length !== 0 || !owner || !aiProvider) throw new Error('Request denied');
    const result = await aiProvider.getStatus(); if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied'); return result;
  });
  ipcMain.handle(AI_PROVIDER_CHANNEL.GET_CONFIG, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    if (args.length !== 0 || !owner || !aiProvider) throw new Error('Request denied');
    const result = await aiProvider.getConfig(); if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied'); return result;
  });
  ipcMain.handle(AI_PROVIDER_CHANNEL.SAVE_CONFIG, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event); const request = args[0];
    if (args.length !== 1 || !owner || !aiProvider || !isAllowedAiProviderConfig(request)) throw new Error('Request denied');
    const result = await aiProvider.saveConfig(request); if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied'); return result;
  });
  ipcMain.handle(AI_PROVIDER_CHANNEL.STORE_KEY, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event); const request = args[0];
    if (args.length !== 1 || !owner || !aiProvider || !isAllowedAiProviderKey(request)) throw new Error('Request denied');
    const result = await aiProvider.storeKey(request); if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied'); return result;
  });
  ipcMain.handle(AI_PROVIDER_CHANNEL.CLEAR_KEY, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    if (args.length !== 0 || !owner || !aiProvider) throw new Error('Request denied');
    const result = await aiProvider.clearKey(); if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied'); return result;
  });
  ipcMain.handle(AI_PROVIDER_CHANNEL.REQUEST, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event); const request = args[0];
    if (args.length !== 1 || !owner || !aiProvider || !isAllowedAiProviderRequest(request)) throw new Error('Request denied');
    const result = await workspaceTestGateway.run(owner.ownerId, { workspaceId: request.workspaceId }, (root, options) => aiProvider!.request(root, request, options.signal));
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied'); return result;
  });
  ipcMain.handle(AI_PROVIDER_CHANNEL.CANCEL, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    if (args.length !== 0 || !owner || !aiProvider) throw new Error('Request denied');
    const provider = aiProvider.cancel(); const workspace = workspaceTestGateway.cancel(owner.ownerId);
    return { requested: provider.requested || workspace.requested };
  });

  ipcMain.handle(TOOLCHAIN_CHANNEL.INSPECT, async (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    if (args.length !== 0 || !owner) {
      throw new Error('Request denied');
    }
    const ownerWindow = mainWindow;
    if (!ownerWindow) throw new Error('Request denied');

    try {
      const selection = await dialog.showOpenDialog(ownerWindow, { properties: ['openDirectory'] });
      if (!rendererOwnerIsCurrent(owner)) {
        throw new Error('Request denied');
      }
      if (selection.canceled || selection.filePaths.length !== 1) {
        firmwareBuildGateway.revokeOwner(owner.ownerId);
        return null;
      }
      const toolApi = await import(toolApiUrl) as { toolchainInspect?: (repositoryRoot: string) => Promise<unknown> } & ExecutionToolApi;
      if (typeof toolApi.toolchainInspect !== 'function') throw new Error('Toolchain inspection failed');
      if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
      const start = toolApi.startToolExecution('human-studio', 'toolchain:inspect', 'toolchain-inspect');
      const value = await firmwareBuildGateway.inspect(owner.ownerId, selection.filePaths[0], toolApi.toolchainInspect);
      const result = { ...(value as object), execution: await finishStudioExecution(toolApi, start, 'toolchain:inspect', 'toolchain-inspect', value) };
      if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
      return result;
    } catch {
      throw new Error('Toolchain inspection failed');
    }
  });

  ipcMain.handle(FIRMWARE_BUILD_CHANNEL.START, async (event, ...args: unknown[]) => {
    const request = args[0];
    const owner = currentRendererOwner(event);
    if (args.length !== 1 || !owner
      || !isAllowedFirmwareBuildRequest(request)) throw new Error('Request denied');
    const ownerWindow = mainWindow;
    if (!ownerWindow) throw new Error('Request denied');
    try {
      const toolApi = await import(toolApiUrl) as {
        toolchainInspect?: (repositoryRoot: string) => Promise<unknown>;
        firmwareBuild?: (repositoryRoot: string, ideId: string, options: { signal: AbortSignal }) => Promise<unknown>;
      } & ExecutionToolApi;
      if (typeof toolApi.toolchainInspect !== 'function' || typeof toolApi.firmwareBuild !== 'function') throw new Error('Firmware build failed');
      if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
      const result = await firmwareBuildGateway.start(owner.ownerId, request, toolApi.toolchainInspect, async () => {
        const response = await dialog.showMessageBox(ownerWindow, {
          type: 'warning',
          title: 'Build runtime firmware locally',
          buttons: ['Cancel', 'Build locally'],
          defaultId: 0,
          cancelId: 0,
          message: `Build runtime firmware for ${request.ideId}?`,
          detail: 'This runs west/CMake/Kconfig/Python from the selected checkout on this computer. Only continue if you trust it. It creates and removes a temporary build directory. It does not flash, deploy, connect to hardware, or qualify hardware.',
        });
        if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
        return response.response === 1;
      }, async (root, ideId, options) => {
        const value = await toolApi.firmwareBuild!(root, ideId, options);
        return { ...(value as object), execution: await finishStudioExecution(toolApi, options, 'firmware:build', 'firmware-build', value) };
      });
      if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
      return result;
    } catch {
      throw new Error('Firmware build failed');
    }
  });

  ipcMain.handle(FIRMWARE_BUILD_CHANNEL.CANCEL, (event, ...args: unknown[]) => {
    const owner = currentRendererOwner(event);
    if (args.length !== 0 || !owner) {
      throw new Error('Request denied');
    }
    return firmwareBuildGateway.cancel(owner.ownerId);
  });
}

// App lifecycle handlers
app.whenReady().then(async () => {
  const toolApi = await import(toolApiUrl) as Pick<ExecutionToolApi, 'isToolExecutionEnvelope'>;
  await toolExecutionAudit.open(app.getPath('userData'), toolApi.isToolExecutionEnvelope);
  aiProvider = createAiProvider({ userDataPath: app.getPath('userData'), vault: safeStorage });
  learnProgress = createLearnProgressStore(app.getPath('userData'));
  recentProjects = createRecentProjects(app.getPath('userData'));
  sessionStore = createSessionStore(app.getPath('userData'));
  recoveryStore = createRecoveryStore(app.getPath('userData'));
  // Sessions of projects that dropped off the recent list would otherwise stay for ever.
  try { await sessionStore.prune(new Set((await recentProjects.list()).map((entry) => entry.id))); } catch { /* a leftover file is harmless */ }
  try { await recoveryStore.prune(new Set((await recentProjects.list()).map((entry) => entry.id))); } catch { /* a leftover file is harmless */ }
  setupContentSecurityPolicy();
  setupWebSerial();
  setupSerialPortSelection();
  setupIPC();
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildApplicationMenu({
    platform: process.platform, isPackaged: app.isPackaged, appName: app.getName(), requestReload,
  })));
  const registeredMenu = Menu.getApplicationMenu();
  if (registeredMenu) console.info(describeApplicationMenu(registeredMenu));
  createWindow();

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error: unknown) => {
  // Without the audit log, the stores and the IPC handlers there is nothing safe to show: leave instead of idling without a window.
  console.error('ZPLC IDE failed to start', error);
  app.exit(1);
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle second instance (single instance lock)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus the main window if user tries to open another instance
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
