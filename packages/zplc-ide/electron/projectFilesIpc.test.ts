import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROJECT_FILES_CHANNEL, PROJECT_FILES_OPS } from './projectFilesProtocol';

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(electronDir, name), 'utf8');
const mainSource = read('main.ts');
const preloadSource = read('preload.ts');

const CHANNEL_BLOCK = /const PROJECT_FILES_CHANNEL = \{([^}]*)\} as const;/;
const BRIDGE_BLOCK = /projectFiles: \{([\s\S]*?)\n {2}\},/;

describe('project files IPC boundary', () => {
  it('repeats in the preload exactly the channels the main process registers', () => {
    const block = CHANNEL_BLOCK.exec(preloadSource)?.[1] ?? '';
    const declared = [...block.matchAll(/(\w+): '([^']+)'/g)].map(([, name, channel]) => [name, channel]);
    expect(declared).toEqual(Object.entries(PROJECT_FILES_CHANNEL));
  });

  it('keeps the shared module out of the sandboxed preload, which cannot require it and would make tsc re-emit it as CommonJS', () => {
    expect(preloadSource).not.toContain("from './projectFilesProtocol");
    expect(preloadSource).not.toContain("from './projectFiles");
  });

  it('exposes one narrow projectFiles object: one invoke per operation and nothing generic', () => {
    const bridge = BRIDGE_BLOCK.exec(preloadSource)?.[1] ?? '';
    expect(bridge).not.toBe('');
    const methods = [...bridge.matchAll(/^ {4}(\w+): /gm)].map(([, name]) => name);
    expect(methods).toEqual(['chooseFolder', ...PROJECT_FILES_OPS]);
    for (const name of methods) expect(bridge).toContain(`ipcRenderer.invoke(PROJECT_FILES_CHANNEL.${name}`);
    expect(bridge).not.toMatch(/require\(|readFile|writeFile|webUtils|\bfs\b|process\./);
    expect(bridge).not.toContain('ipcRenderer.send');
    expect(preloadSource).not.toContain('ipcRenderer.send');
    expect(preloadSource).not.toContain('ipcRenderer.on(PROJECT_FILES_CHANNEL');
    // chooseFolder takes no argument: the renderer cannot suggest where the dialog opens or what it returns.
    expect(bridge).toContain('chooseFolder: () => ipcRenderer.invoke(PROJECT_FILES_CHANNEL.chooseFolder)');
  });

  it('registers every channel behind the sender check, then lets the shared handler validate the message', () => {
    expect(mainSource).toContain("import { createProjectFiles, readFolderDialogHook } from './projectFiles.js';");
    expect(mainSource).toContain("import { PROJECT_FILES_CHANNEL } from './projectFilesProtocol.js';");
    expect(mainSource).toContain('for (const channel of Object.values(PROJECT_FILES_CHANNEL)) {');
    expect(mainSource).toContain('ipcMain.handle(channel, async (event, ...args: unknown[]) => {');
    const registration = mainSource.slice(mainSource.indexOf('for (const channel of Object.values(PROJECT_FILES_CHANNEL)) {'));
    const body = registration.slice(0, registration.indexOf('\n  }\n') + 5);
    expect(body.indexOf('currentRendererOwner(event)')).toBeGreaterThan(-1);
    expect(body.indexOf("throw new Error('Request denied')")).toBeLessThan(body.indexOf('projectFiles.handle(owner.ownerId, channel, args)'));
    expect(body).toContain('if (!rendererOwnerIsCurrent(owner)) throw new Error(\'Request denied\');');
  });

  it('forgets a window folder when its document is revoked', () => {
    const revoke = mainSource.slice(mainSource.indexOf('function revokeRendererOwner(ownerId: number): void {'));
    expect(revoke.slice(0, revoke.indexOf('\n}\n'))).toContain('projectFiles.revokeOwner(ownerId);');
  });

  it('asks the native dialog from the main process, and only a host that is not packaged may answer it from a test file', () => {
    expect(mainSource).toContain('const projectFiles = createProjectFiles(chooseProjectDirectory);');
    expect(mainSource).toContain("dialog.showOpenDialog(win, { title: 'Choose project folder', properties: ['openDirectory', 'createDirectory'] })");
    expect(mainSource).toContain('readFolderDialogHook(app.isPackaged, process.env)');
    expect(mainSource).not.toContain('ZPLC_SMOKE_FOLDER_ANSWER_FILE');
  });

  it('brings no npm runtime dependency into the main process (the packaged archive lists no node_modules)', () => {
    for (const source of [read('projectFiles.ts'), read('projectFilesProtocol.ts')]) {
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
