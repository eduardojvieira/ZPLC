import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RECOVERY_CHANNEL } from './recoveryStoreProtocol';

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(electronDir, name), 'utf8');
const mainSource = read('main.ts');
const preloadSource = read('preload.ts');

/** The source of one `ipcMain.handle(...)` registration, up to its closing line. */
function handler(channel: string): string {
  const start = mainSource.indexOf(`ipcMain.handle(${channel},`);
  expect(start).toBeGreaterThan(-1);
  return mainSource.slice(start, mainSource.indexOf('\n  });', start) + 6);
}

describe('recovery IPC boundary (IDE-006)', () => {
  it('registers in the main process the channels that the protocol defines, and repeats them once in the preload', () => {
    expect(RECOVERY_CHANNEL).toEqual({ WRITE: 'recovery:write', LIST: 'recovery:list', DISCARD: 'recovery:discard' });
    expect(mainSource).toContain("from './recoveryStoreProtocol.js'");
    expect(mainSource).not.toContain("'recovery:write'");
    expect(preloadSource).toContain("const RECOVERY_CHANNEL = { WRITE: 'recovery:write', LIST: 'recovery:list', DISCARD: 'recovery:discard' } as const;");
  });

  it('exposes one narrow recovery object: write, list and discard, one invoke each, nothing generic', () => {
    const block = /recovery: \{([\s\S]*?)\n {2}\},/.exec(preloadSource)?.[1] ?? '';
    expect(block).not.toBe('');
    expect([...block.matchAll(/^ {4}(\w+): /gm)].map(([, name]) => name)).toEqual(['write', 'list', 'discard']);
    for (const [name, channel] of [['write', 'WRITE'], ['list', 'LIST'], ['discard', 'DISCARD']] as const) {
      expect(block).toContain(`${name}: (request: unknown) => ipcRenderer.invoke(RECOVERY_CHANNEL.${channel}, request)`);
    }
    expect(block).not.toMatch(/require\(|readFile|writeFile|webUtils|\bfs\b|process\.|ipcRenderer\.send/);
  });

  it('checks the sender, the message and the folder id of every handler before the store is touched', () => {
    for (const [channel, validator, call] of [
      ['RECOVERY_CHANNEL.WRITE', 'isAllowedRecoveryWriteRequest', 'recoveryStore.write('],
      ['RECOVERY_CHANNEL.LIST', 'isAllowedRecoveryListRequest', 'recoveryStore.list('],
      ['RECOVERY_CHANNEL.DISCARD', 'isAllowedRecoveryDiscardRequest', 'recoveryStore.discard('],
    ] as const) {
      const body = handler(channel);
      expect(body).toContain('const owner = currentRendererOwner(event);');
      expect(body).toContain(`!${validator}(request)`);
      expect(body).toContain('projectFiles.rootOf(owner.ownerId, request.rootId)');
      expect(body.indexOf("throw new Error('Request denied')")).toBeLessThan(body.indexOf(call));
      expect(body).toContain("if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');");
    }
  });

  it('keys the store by the real path that the main process holds for the window, never by anything the renderer sends', () => {
    for (const channel of ['RECOVERY_CHANNEL.WRITE', 'RECOVERY_CHANNEL.LIST', 'RECOVERY_CHANNEL.DISCARD']) {
      expect(handler(channel)).toMatch(/recoveryStore\.(write|list|discard)\(root[,)]/);
      expect(handler(channel)).not.toMatch(/request\.(root\b|realPath)/);
    }
  });

  it('keeps the recovery files under the user-data directory and prunes forgotten projects when the app starts', () => {
    expect(mainSource).toContain("recoveryStore = createRecoveryStore(app.getPath('userData'));");
    expect(mainSource).toContain('recoveryStore.prune(new Set((await recentProjects.list()).map((entry) => entry.id)))');
    const store = read('recoveryStore.ts');
    expect(store).not.toMatch(/process\.env|homedir|tmpdir|ipcMain|webContents/);
    expect(store).toContain('path.join(userDataPath, RECOVERY_DIRECTORY)');
  });

  it('drops the recovery files of the window folder when the user confirms a close or a reload that they answered', () => {
    const body = handler('CLOSE_GUARD_CHANNEL.CLOSE_NOW');
    expect(body).toContain('recoveryStore.discard(');
    expect(body.indexOf('closeGuard.confirm()')).toBeLessThan(body.indexOf('recoveryStore.discard('));
    expect(body.indexOf('recoveryStore.discard(')).toBeLessThan(body.indexOf('mainWindow?.destroy()'));
  });

  it('names its relative imports with the .js suffix, which the compiled ES modules need to load', () => {
    for (const name of ['recoveryStore.ts', 'recoveryStoreProtocol.ts']) {
      const specifiers = [...read(name).matchAll(/^(?:import|export)[^;]*? from '(\.[^']+)'/gms)].map(([, specifier]) => specifier);
      expect(specifiers.length).toBeGreaterThan(0);
      expect(specifiers.filter((specifier) => !specifier!.endsWith('.js'))).toEqual([]);
    }
  });

  it('brings no npm runtime dependency into the main process', () => {
    for (const source of [read('recoveryStore.ts'), read('recoveryStoreProtocol.ts')]) {
      const specifiers = [...source.matchAll(/^(?:import|export)[^;]*? from '([^']+)'/gms)].map(([, specifier]) => specifier);
      expect(specifiers.filter((specifier) => !/^(\.|node:)/.test(specifier))).toEqual([]);
    }
    expect(read('recoveryStoreProtocol.ts')).not.toMatch(/node:|electron/);
  });
});
