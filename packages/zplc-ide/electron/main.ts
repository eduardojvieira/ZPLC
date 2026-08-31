/**
 * ZPLC IDE - Electron Main Process
 * 
 * Handles window management, WebSerial permissions, and native integration.
 * This is the entry point for the Electron desktop application.
 */

import { app, BrowserWindow, dialog, session, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { createHash } from 'node:crypto';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { NativeSimulationRequest } from './nativeSimulationIpc.js';
import { NativeSimulationSupervisor } from './nativeSimulationSupervisor.js';
import { nativeSimulationEnvironment } from './nativeSimulationEnvironment.js';
import { createFirmwareBuildGateway } from './firmwareBuildGateway.js';
import { createWorkspaceTestGateway } from './workspaceTestGateway.js';
import {
  DEFAULT_DEVELOPMENT_RENDERER_PORT,
  createContentSecurityPolicy,
  isAllowedNativeSimulationRequest,
  isAllowedWorkspaceTestRequest,
  isAllowedWorkspaceTestRunRequest,
  isAllowedFirmwareBuildRequest,
  isAllowedCandidateChangeSetReviewRequest,
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
const toolApiUrl = pathToFileURL(path.join(__dirname, 'toolApi.js')).href;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeRelativePath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.includes('\0') || value.startsWith('/') || value.startsWith('\\') || /^[a-zA-Z]:/.test(value)) return undefined;
  return value.split(/[\\/]/).some((part) => part === '..') ? undefined : value;
}

function safeLocation(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 1_000_000 ? value : undefined;
}

function workspaceCompileFailure(value: unknown): { ok: false; evidence: { outcome: 'failed'; diagnostics: Array<{ code: string; path?: string; line?: number; column?: number }> } } {
  const evidence = record(record(value)?.evidence);
  const diagnostics = Array.isArray(evidence?.diagnostics) ? evidence.diagnostics.slice(0, 128).flatMap((value) => {
    const diagnostic = record(value);
    if (!diagnostic || typeof diagnostic.code !== 'string' || diagnostic.code.length === 0 || diagnostic.code.length > 96) return [];
    return [{
      code: diagnostic.code,
      ...(safeRelativePath(diagnostic.path) ? { path: safeRelativePath(diagnostic.path) } : {}),
      ...(safeLocation(diagnostic.line) ? { line: safeLocation(diagnostic.line) } : {}),
      ...(safeLocation(diagnostic.column) ? { column: safeLocation(diagnostic.column) } : {}),
    }];
  }) : [];
  return { ok: false, evidence: { outcome: 'failed', diagnostics } };
}

/** Turns private Tool API fields into the sole structured-clone payload accepted by Toolbar. */
function toWorkspaceCompileEnvelope(value: unknown): unknown {
  const result = record(value);
  if (!result || result.ok !== true) return workspaceCompileFailure(value);
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
  };
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

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: `ZPLC IDE ${appVersion}`,
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

  webContents.on('render-process-gone', () => revokeRendererOwner(ownerWebContentsId));
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
    mainWindow.loadURL(expectedRendererUrl());
    // Open DevTools in development
    if (!app.commandLine.hasSwitch('headless')) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

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
  session.defaultSession.setPermissionCheckHandler(() => false);

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

    sess.on('select-serial-port', (event, _portList, _requestingContents, callback) => {
      event.preventDefault();
      callback('');
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
      };
      if (scenarioId !== undefined) {
        if (typeof toolApi.scenarioRun !== 'function') throw new Error('Workspace operation failed');
        return toolApi.scenarioRun(root, scenarioId, options);
      }
      if (typeof toolApi.testsRun !== 'function') throw new Error('Workspace operation failed');
      return toolApi.testsRun(root, options);
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
      const result = await workspaceTestGateway.run(owner.ownerId, request, async (root) => {
        const toolApi = await import(toolApiUrl) as { compilerCompile?: (workspaceRoot: string) => Promise<unknown> };
        if (typeof toolApi.compilerCompile !== 'function') throw new Error('Workspace operation failed');
        return toWorkspaceCompileEnvelope(await toolApi.compilerCompile(root));
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
      const result = await workspaceTestGateway.run(owner.ownerId, request, async (root) => {
        const toolApi = await import(toolApiUrl) as { safetyCheck?: (workspaceRoot: string) => Promise<unknown> };
        if (typeof toolApi.safetyCheck !== 'function') throw new Error('Workspace operation failed');
        return toolApi.safetyCheck(root);
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
        };
        if (typeof toolApi.createCandidateChangeSet !== 'function') throw new Error('Workspace operation failed');
        return toolApi.createCandidateChangeSet(root, [{ path: request.edit.path, content: request.edit.content }], options);
      });
      safe = sanitizeCandidateChangeSetReview(result, request.edit.path);
      if (!safe) throw new Error('Workspace operation failed');
    } catch {
      throw new Error('Workspace operation failed');
    }
    if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
    return safe;
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
      const toolApi = await import(toolApiUrl) as { toolchainInspect?: (repositoryRoot: string) => Promise<unknown> };
      if (typeof toolApi.toolchainInspect !== 'function') throw new Error('Toolchain inspection failed');
      if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');
      const result = await firmwareBuildGateway.inspect(owner.ownerId, selection.filePaths[0], toolApi.toolchainInspect);
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
      };
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
      }, toolApi.firmwareBuild);
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
app.whenReady().then(() => {
  setupContentSecurityPolicy();
  setupWebSerial();
  setupSerialPortSelection();
  setupIPC();
  createWindow();

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
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
