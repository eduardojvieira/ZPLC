/**
 * ZPLC IDE - Electron Main Process
 * 
 * Handles window management, WebSerial permissions, and native integration.
 * This is the entry point for the Electron desktop application.
 */

import { app, BrowserWindow, session, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep a global reference of the window object to prevent GC
let mainWindow: BrowserWindow | null = null;

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'ZPLC IDE',
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
    mainWindow = null;
  });

  // Log when the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] Window loaded successfully');
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
      console.log('[WebSerial] Device permission granted:', details.device);
      return true;
    }
    return false;
  });
}

/**
 * Setup serial port selection handler
 * This is called when navigator.serial.requestPort() is invoked
 */
function setupSerialPortSelection(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.session.on('select-serial-port', (event, portList, _webContents, callback) => {
      event.preventDefault();

      console.log('[WebSerial] Available ports:', portList.map(p => ({
        portId: p.portId,
        displayName: p.displayName,
        vendorId: p.vendorId ? p.vendorId.toString() : undefined,
        productId: p.productId ? p.productId.toString() : undefined,
      })));

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
          console.log('[WebSerial] Auto-selecting preferred port:', preferredPort.displayName);
          callback(preferredPort.portId);
        } else {
          // Fallback: Select the first available port
          console.log('[WebSerial] Auto-selecting first port:', portList[0].displayName);
          callback(portList[0].portId);
        }
      } else {
        console.log('[WebSerial] No serial ports available');
        callback(''); // No ports found
      }
    });

    // Handle serial port added/removed events
    contents.session.on('serial-port-added', (_event, port) => {
      console.log('[WebSerial] Port added:', port.displayName);
    });

    contents.session.on('serial-port-removed', (_event, port) => {
      console.log('[WebSerial] Port removed:', port.displayName);
    });
  });
}

/**
 * Setup IPC handlers for native features
 */
function setupIPC(): void {
  // Handle requests for app info
  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
  }));

  // Handle opening external URLs
  ipcMain.handle('open-external', async (_event, url: string) => {
    return shell.openExternal(url);
  });
}

// App lifecycle handlers
app.whenReady().then(() => {
  console.log('[Electron] App ready, setting up...');
  
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

// Security: Prevent new window creation
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});

console.log('[Electron] Main process initialized');
console.log('[Electron] Mode:', isDev ? 'Development' : 'Production');
