/**
 * ZPLC IDE - Electron Main Process
 * 
 * Handles window management, WebSerial permissions, and native integration.
 * This is the entry point for the Electron desktop application.
 */

import { app, BrowserWindow, dialog, Menu, nativeTheme, session, ipcMain, safeStorage, utilityProcess, type IpcMainInvokeEvent, type WebContents } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
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
import { checkForUpdate } from './updateCheck.js';
import { buildApplicationMenu, describeApplicationMenu, isReloadShortcut } from './appMenu.js';
import { createCloseGuard } from './closeGuard.js';
import { createProjectFiles } from './projectFiles.js';
import { createIpcHandlers, type RendererOwner, type ToolApiModule } from './ipcHandlers.js';
import { spawnVector } from './spawnAllowList.js';
import { createToolWorkerHost, type ToolWorkerProcess } from './toolWorkerHost.js';
import { registerIpcHandlers } from './ipcRegistry.js';
import {
  CLOSE_GUARD_CHANNEL,
  NATIVE_SIMULATION_CHANNEL,
  PROJECT_FILES_EVENT,
} from './ipcContract.js';
import { createProjectWatcher } from './projectWatcher.js';
import {
  DEFAULT_DEVELOPMENT_RENDERER_PORT,
  createContentSecurityPolicy,
  isExpectedRendererDocument,
  isTrustedRenderer,
  parseTrustedDevelopmentRendererPort,
  trustedDevelopmentRendererUrl,
} from './security.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep a global reference of the window object to prevent GC
let mainWindow: BrowserWindow | null = null;
let nativeSimulationSupervisor: NativeSimulationSupervisor | null = null;
let nativeSimulationUnsubscribe: (() => void) | null = null;
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
const projectFiles = createProjectFiles(chooseProjectDirectory, () => recentProjects, projectWatcher);
const toolApiUrl = pathToFileURL(path.join(__dirname, 'toolApi.js')).href;

/**
 * Compile, safety check, tests and candidate review run in a utility process of their own, one per request (IDE-012), from
 * the fixed vector of the allow-list: the bundled `toolWorker.js` and no argument. The environment is the one of the native
 * simulation, so that the worker finds the runtime it starts for scenarios.
 */
function spawnToolWorker(): ToolWorkerProcess {
  const { command, args } = spawnVector({ kind: 'tool-worker', script: path.join(__dirname, 'toolWorker.js') });
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(nativeSimulationEnvironment(process.env, isDev, process.resourcesPath))) {
    if (typeof value === 'string') environment[name] = value;
  }
  const child = utilityProcess.fork(command, args, { serviceName: 'zplc-tool-worker', env: environment, stdio: 'ignore' });
  return {
    get pid() { return child.pid; },
    postMessage: (message) => child.postMessage(message),
    onMessage: (listener) => { child.on('message', listener); },
    onExit: (listener) => { child.on('exit', (code) => listener(code)); },
    kill: () => { child.kill(); },
  };
}
const toolWorkerHost = createToolWorkerHost({ spawn: spawnToolWorker });
let aiProvider: ReturnType<typeof createAiProvider> | null = null;
let learnProgress: ReturnType<typeof createLearnProgressStore> | null = null;

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
 * Setup IPC handlers for native features: the table of `ipcHandlers.ts`, registered through `ipcRegistry.ts`, which
 * checks the sender and the message of every call before a handler runs (IDE-017).
 */
function setupIPC(): void {
  const handlers = createIpcHandlers({
    appInfo: () => ({ version: appVersion, platform: process.platform, arch: process.arch, isPackaged: app.isPackaged }),
    isCurrent: rendererOwnerIsCurrent,
    closeGuard,
    completeGuardedAction: (action) => {
      if (action === 'reload') mainWindow?.webContents.reload();
      // ponytail: on macOS a vetoed Cmd+Q is not resumed after Discard; a second Cmd+Q quits.
      else mainWindow?.destroy();
    },
    projectFiles,
    recoveryStore: () => recoveryStore,
    sessionStore: () => sessionStore,
    learnProgress: () => learnProgress,
    aiProvider: () => aiProvider,
    toolExecutionAudit,
    workspaceGateway: workspaceTestGateway,
    firmwareGateway: firmwareBuildGateway,
    loadToolApi: () => import(toolApiUrl) as Promise<ToolApiModule>,
    toolWorker: toolWorkerHost,
    nativeSimulation: {
      async start(owner) {
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
        if (!nativeSimulationBelongsTo(owner) || nativeSimulationSupervisor !== supervisor) throw new Error('Request denied');
        return hello;
      },
      async stop(owner) {
        if (!nativeSimulationSupervisor) return;
        if (!nativeSimulationBelongsTo(owner)) throw new Error('Request denied');
        const supervisor = nativeSimulationSupervisor;
        nativeSimulationOwner = null;
        nativeSimulationUnsubscribe?.();
        nativeSimulationUnsubscribe = null;
        nativeSimulationSupervisor = null;
        await supervisor.stopSession();
      },
      async request(owner, request) {
        if (!nativeSimulationSupervisor || !nativeSimulationBelongsTo(owner)) throw new Error('Native simulation session is not active');
        const supervisor = nativeSimulationSupervisor;
        const response = await supervisor.request(request);
        if (!nativeSimulationBelongsTo(owner) || nativeSimulationSupervisor !== supervisor) throw new Error('Request denied');
        return response;
      },
    },
    pickToolchainRepository: async () => {
      const ownerWindow = mainWindow;
      if (!ownerWindow) throw new Error('Request denied');
      const selection = await dialog.showOpenDialog(ownerWindow, { properties: ['openDirectory'] });
      return selection.canceled || selection.filePaths.length !== 1 ? null : selection.filePaths[0] ?? null;
    },
    confirmFirmwareBuild: async (ideId) => {
      const ownerWindow = mainWindow;
      if (!ownerWindow) throw new Error('Request denied');
      const response = await dialog.showMessageBox(ownerWindow, {
        type: 'warning',
        title: 'Build runtime firmware locally',
        buttons: ['Cancel', 'Build locally'],
        defaultId: 0,
        cancelId: 0,
        message: `Build runtime firmware for ${ideId}?`,
        detail: 'This runs west/CMake/Kconfig/Python from the selected checkout on this computer. Only continue if you trust it. It creates and removes a temporary build directory. It does not flash, deploy, connect to hardware, or qualify hardware.',
      });
      return response.response === 1;
    },
    checkForUpdate: () => checkForUpdate({ currentVersion: appVersion, fetch: (url, init) => fetch(url, init) }),
  });
  registerIpcHandlers(ipcMain, handlers, {
    authorize: (event) => currentRendererOwner(event as IpcMainInvokeEvent),
    isCurrent: rendererOwnerIsCurrent,
  });
}

// App lifecycle handlers
app.whenReady().then(async () => {
  const toolApi = await import(toolApiUrl) as Pick<ToolApiModule, 'isToolExecutionEnvelope'>;
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

// A worker that is still running when the application quits is killed with it.
app.on('before-quit', () => toolWorkerHost.dispose());

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
