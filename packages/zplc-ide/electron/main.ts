/**
 * ZPLC IDE - Electron Main Process
 * 
 * Handles window management, WebSerial permissions, and native integration.
 * This is the entry point for the Electron desktop application.
 */

import { app, BrowserWindow, session, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import type { NativeSimulationRequest } from './nativeSimulationIpc.js';
import { NativeSimulationSupervisor } from './nativeSimulationSupervisor.js';

const NATIVE_SIMULATION_CHANNEL = {
  START_SESSION: 'native-simulation:start-session',
  STOP_SESSION: 'native-simulation:stop-session',
  REQUEST: 'native-simulation:request',
  EVENT: 'native-simulation:event',
} as const;

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep a global reference of the window object to prevent GC
let mainWindow: BrowserWindow | null = null;
let nativeSimulationSupervisor: NativeSimulationSupervisor | null = null;
let nativeSimulationUnsubscribe: (() => void) | null = null;

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function getRepoVersion(): string {
  try {
    const repoRoot = path.resolve(__dirname, '../../..');
    return execSync('git describe --tags --always --dirty', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return app.getVersion();
  }
}

const appVersion = getRepoVersion();

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
      preload: path.join(__dirname, 'preload.cjs'),
      // Enable WebSerial API
      experimentalFeatures: true,
    },
    // macOS specific
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle window close
  mainWindow.on('closed', () => {
    nativeSimulationUnsubscribe?.();
    nativeSimulationUnsubscribe = null;
    if (nativeSimulationSupervisor) {
      void nativeSimulationSupervisor.stopSession().catch(() => undefined);
      nativeSimulationSupervisor = null;
    }
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
  // Grant permission for serial port access
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, _requestingOrigin, _details) => {
      // Allow serial port access
      if (permission === 'serial') {
        return true;
      }
      // Allow other common permissions
      if (['clipboard-read', 'clipboard-sanitized-write'].includes(permission)) {
        return true;
      }
      return true; // Be permissive for IDE functionality
    }
  );

  // Handle device permission requests
  session.defaultSession.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'serial') {
      return true;
    }
    return false;
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

    // Guard: register serial session handlers only once per session.
    // In dev mode, Vite HMR can trigger multiple 'web-contents-created'
    // events on the same defaultSession, which would stack duplicate
    // 'select-serial-port' handlers and cause the one-time callback to
    // be called twice → "One-time callback was called more than once".
    const sess = contents.session;
    if ((sess as unknown as Record<string, boolean>)._serialHandlerRegistered) return;
    (sess as unknown as Record<string, boolean>)._serialHandlerRegistered = true;

    sess.on('select-serial-port', (event, portList, _webContents, callback) => {
      event.preventDefault();

      if (portList && portList.length > 0) {
        // Strategy 1: Look for known PLC/Arduino USB VID/PIDs
        const knownVendors = [
          '2341', // Arduino
          '2e8a', // Raspberry Pi (Pico)
          '1a86', // CH340 USB-Serial
          '0403', // FTDI
          '10c4', // Silicon Labs CP210x
          '067b', // Prolific PL2303
        ];

        const preferredPort = portList.find(p =>
          p.vendorId && knownVendors.includes(p.vendorId)
        );

        if (preferredPort) {
          callback(preferredPort.portId);
        } else {
          // Fallback: Select the first available port
          callback(portList[0].portId);
        }
      } else {
        callback(''); // No ports found
      }
    });

    sess.on('serial-port-added', () => undefined);
    sess.on('serial-port-removed', () => undefined);
  });
}

/**
 * Setup IPC handlers for native features
 */
function setupIPC(): void {
  // Handle requests for app info
  ipcMain.handle('get-app-info', () => ({
    version: appVersion,
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
  }));

  // Handle opening external URLs
  ipcMain.handle('open-external', async (_event, url: string) => {
    return shell.openExternal(url);
  });

  ipcMain.handle(NATIVE_SIMULATION_CHANNEL.START_SESSION, async () => {
    if (!nativeSimulationSupervisor) {
      nativeSimulationSupervisor = new NativeSimulationSupervisor({
        clientName: 'zplc-ide',
        clientVersion: appVersion,
      });
    }

    nativeSimulationUnsubscribe?.();
    nativeSimulationUnsubscribe = nativeSimulationSupervisor.onEvent((event) => {
      mainWindow?.webContents.send(NATIVE_SIMULATION_CHANNEL.EVENT, event);
    });

    return nativeSimulationSupervisor.startSession();
  });

  ipcMain.handle(NATIVE_SIMULATION_CHANNEL.STOP_SESSION, async () => {
    nativeSimulationUnsubscribe?.();
    nativeSimulationUnsubscribe = null;

    if (!nativeSimulationSupervisor) {
      return;
    }

    await nativeSimulationSupervisor.stopSession();
    nativeSimulationSupervisor = null;
  });

  ipcMain.handle(NATIVE_SIMULATION_CHANNEL.REQUEST, async (_event, request: NativeSimulationRequest) => {
    if (!nativeSimulationSupervisor) {
      throw new Error('Native simulation session is not active');
    }

    return nativeSimulationSupervisor.request(request);
  });
}

// App lifecycle handlers
app.whenReady().then(() => {
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
