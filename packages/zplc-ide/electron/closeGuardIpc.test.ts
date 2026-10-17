import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The channels, the narrow preload namespace and the sender and message checks of the close guard are proven by
// behaviour in ipcRegistry.test.ts and preload.test.ts. What stays here is the window wiring: Electron has no stand-in
// for the BrowserWindow, so the veto and the reload chords are pinned as text of main.ts until the VF-008 journey
// that closes a window with unsaved changes replaces them (journey 10).
const electronDir = path.dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(path.join(electronDir, 'main.ts'), 'utf8');

describe('close guard window wiring', () => {
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
    expect(mainSource).toContain('Menu.setApplicationMenu(Menu.buildFromTemplate(template));');
    expect(mainSource).toContain('setPermissionRequestHandler((_webContents, _permission, callback) => {\n    callback(false);');
  });
});
