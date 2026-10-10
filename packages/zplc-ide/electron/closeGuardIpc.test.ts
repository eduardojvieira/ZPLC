import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(path.join(electronDir, 'main.ts'), 'utf8');
const preloadSource = readFileSync(path.join(electronDir, 'preload.ts'), 'utf8');
const CHANNELS = ['close-guard:set-dirty', 'close-guard:close-now', 'close-guard:close-requested'];

describe('close guard IPC boundary', () => {
  it('keeps the three channels aligned between the main process and the preload', () => {
    for (const channel of CHANNELS) {
      expect(mainSource).toContain(channel);
      expect(preloadSource).toContain(channel);
    }
  });

  it('exposes one narrow closeGuard namespace and nothing generic', () => {
    expect(preloadSource).toContain('closeGuard: {');
    expect(preloadSource).toContain('setDirty: (dirty: boolean) =>');
    expect(preloadSource).toContain('closeNow: () =>');
    expect(preloadSource).toContain('onCloseRequested: (callback: (action: GuardedAction) => void) =>');
    expect(preloadSource).not.toContain('ipcRenderer.send');
  });

  it('validates the sender and the message of every handler', () => {
    expect(mainSource).toContain('ipcMain.handle(CLOSE_GUARD_CHANNEL.SET_DIRTY, (event, ...args: unknown[]) => {');
    expect(mainSource).toContain('args.length !== 1 || !isAllowedCloseGuardDirty(args[0]) || !currentRendererOwner(event)');
    expect(mainSource).toContain('ipcMain.handle(CLOSE_GUARD_CHANNEL.CLOSE_NOW, async (event, ...args: unknown[]) => {');
    expect(mainSource).toContain('const owner = currentRendererOwner(event);\n    if (args.length !== 0 || !owner) throw new Error(\'Request denied\');');
  });

  it('catches the reload chords before the page and the menu, and reloads a development host only through the guard', () => {
    const start = mainSource.indexOf("webContents.on('before-input-event'");
    expect(start).toBeGreaterThan(-1);
    const body = mainSource.slice(start, mainSource.indexOf('\n  });', start) + 6);
    expect(body).toContain('isReloadShortcut(input)');
    expect(body.indexOf('event.preventDefault();')).toBeLessThan(body.indexOf('requestReload()'));
    expect(body).toContain('if (!app.isPackaged) requestReload();');
    expect(body).not.toContain('.reload(');
  });

  it('vetoes the window close while files are modified and never relaxes the permission handler', () => {
    expect(mainSource).toContain("mainWindow.on('close', (event) => {");
    expect(mainSource).toContain("closeGuard.request('close') === 'ask'");
    expect(mainSource).toContain('event.preventDefault();');
    expect(mainSource).toContain('Menu.setApplicationMenu(Menu.buildFromTemplate(buildApplicationMenu(');
    expect(mainSource).toContain('setPermissionRequestHandler((_webContents, _permission, callback) => {\n    callback(false);');
  });
});
