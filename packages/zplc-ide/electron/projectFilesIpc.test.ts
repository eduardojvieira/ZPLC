import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The channels, the exposed methods and the sender and message checks of the project files are proven by behaviour in
// ipcRegistry.test.ts and preload.test.ts. What stays here is the wiring that has no stand-in: the revocation of the
// window folder, the dialog hook and the permission handlers, pinned as text of main.ts until the main process has a
// renderer-less seam (the VF-008 journeys and the IDE-016 behaviour probes cover them in the real application).
const electronDir = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(electronDir, name), 'utf8');
const mainSource = read('main.ts');

describe('project files IPC boundary', () => {
  it('forgets a window folder when its document is revoked', () => {
    const revoke = mainSource.slice(mainSource.indexOf('function revokeRendererOwner(ownerId: number): void {'));
    expect(revoke.slice(0, revoke.indexOf('\n}\n'))).toContain('projectFiles.revokeOwner(ownerId);');
  });

  it('asks the native dialog from the main process, and only a host that is not packaged may answer it from a test file', () => {
    expect(mainSource).toContain('const projectFiles = createProjectFiles(chooseProjectDirectory, () => recentProjects, projectWatcher);');
    expect(mainSource).toContain("dialog.showOpenDialog(win, { title: 'Choose project folder', properties: ['openDirectory', 'createDirectory'] })");
    expect(mainSource).toContain('readFolderDialogHook(app.isPackaged, process.env)');
    expect(mainSource).not.toContain('ZPLC_SMOKE_FOLDER_ANSWER_FILE');
    // The hook module is imported inside the not-packaged branch, ahead of the real dialog (scripts/packagingHygiene.test.ts holds the rest of VF-008).
    expect(mainSource.indexOf("await import('./devFolderDialogHook.js')")).toBeGreaterThan(mainSource.indexOf('if (!app.isPackaged) {'));
    expect(mainSource.indexOf("await import('./devFolderDialogHook.js')")).toBeLessThan(mainSource.indexOf('dialog.showOpenDialog(win'));
  });

  it('keeps the remembered folders in the private user-data directory of the main process, and nowhere the renderer can name', () => {
    expect(mainSource).toContain("recentProjects = createRecentProjects(app.getPath('userData'));");
    const recent = read('recentProjects.ts');
    expect(recent).not.toMatch(/process\.env|homedir|tmpdir|ipcMain|webContents/);
    expect(read('projectFilesProtocol.ts')).not.toMatch(/recentProjects|realpath|\bpath: string; (display|last)/);
  });

  it('brings no npm runtime dependency into the main process (the packaged archive lists no node_modules)', () => {
    for (const source of [read('projectFiles.ts'), read('projectFilesProtocol.ts'), read('recentProjects.ts')]) {
      const specifiers = [...source.matchAll(/^(?:import|export)[^;]*? from '([^']+)'/gms)].map(([, specifier]) => specifier);
      expect(specifiers.filter((specifier) => !/^(\.|node:)/.test(specifier))).toEqual([]);
    }
    expect(mainSource).not.toMatch(/from 'zod/);
  });

  it('keeps the permission handlers deny-by-default: serial only, and no file system permission anywhere', () => {
    expect(mainSource).toContain("permission === 'serial' && webContents !== null && serialRendererIsCurrent(webContents)");
    expect(mainSource).toContain('setPermissionRequestHandler((_webContents, _permission, callback) => {\n    callback(false);\n  });');
    for (const name of ['main.ts', 'preload.ts', 'projectFiles.ts', 'projectFilesProtocol.ts']) {
      expect(read(name)).not.toMatch(/fileSystem|file-system|showDirectoryPicker/);
    }
  });
});
