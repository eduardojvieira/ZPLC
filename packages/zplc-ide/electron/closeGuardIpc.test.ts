import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The channels, the narrow preload namespace and the sender and message checks of the close guard are proven by
// behaviour in ipcRegistry.test.ts and preload.test.ts, and the veto of the window close and the reload chords by
// behaviour in windowGuards.test.ts. What stays here is the one seam that Electron has no stand-in for: that main.ts
// installs those guards on the window, and that nothing else in it reloads or relaxes the permission handler. The real
// key press and the real window close are journeys 10 and 53.
const electronDir = path.dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(path.join(electronDir, 'main.ts'), 'utf8');

describe('close guard window wiring', () => {
  it('installs the close veto and the reload chord guard on the window, and reloads only through the guard', () => {
    expect(mainSource).toContain('guardWindowClose(mainWindow, closeGuard, askRendererBeforeLosingWork);');
    expect(mainSource).toContain('guardReloadChord(webContents, { isPackaged: app.isPackaged, requestReload });');
    expect(mainSource).not.toContain("webContents.on('before-input-event'");
    // the only places that reload the window: the guarded request and the answer of the user
    expect(mainSource.match(/webContents\.reload\(\)/g)).toHaveLength(2);
  });

  it('never relaxes the permission handler and builds the application menu from the template', () => {
    expect(mainSource).toContain('Menu.setApplicationMenu(Menu.buildFromTemplate(template));');
    expect(mainSource).toContain('setPermissionRequestHandler((_webContents, _permission, callback) => {\n    callback(false);');
  });
});
