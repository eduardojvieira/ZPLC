import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

describe('session IPC boundary (IDE-008)', () => {
  it('repeats in the preload the two channels that the main process registers', () => {
    for (const source of [mainSource, preloadSource]) {
      expect(source).toContain("const SESSION_CHANNEL = { LOAD: 'session:load', SAVE: 'session:save' } as const;");
    }
  });

  it('exposes one narrow session object: load and save, one invoke each, nothing generic', () => {
    const block = /session: \{([\s\S]*?)\n {2}\},/.exec(preloadSource)?.[1] ?? '';
    expect(block).not.toBe('');
    expect([...block.matchAll(/^ {4}(\w+): /gm)].map(([, name]) => name)).toEqual(['load', 'save']);
    expect(block).toContain('load: (request: unknown) => ipcRenderer.invoke(SESSION_CHANNEL.LOAD, request)');
    expect(block).toContain('save: (request: unknown) => ipcRenderer.invoke(SESSION_CHANNEL.SAVE, request)');
    expect(block).not.toMatch(/require\(|readFile|writeFile|webUtils|\bfs\b|process\.|ipcRenderer\.send/);
  });

  it('checks the sender, the message and the folder id of both handlers before the store is touched', () => {
    for (const [channel, validator, call] of [
      ['SESSION_CHANNEL.LOAD', 'isAllowedSessionLoadRequest', 'sessionStore.load('],
      ['SESSION_CHANNEL.SAVE', 'isAllowedSessionSaveRequest', 'sessionStore.save('],
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
    for (const channel of ['SESSION_CHANNEL.LOAD', 'SESSION_CHANNEL.SAVE']) {
      const body = handler(channel);
      expect(body).toMatch(/sessionStore\.(load|save)\(root[,)]/);
      expect(body).not.toMatch(/request\.(path|root)\b/);
    }
  });

  it('stores sessions under the user-data directory and prunes those of forgotten projects when the app starts', () => {
    expect(mainSource).toContain("sessionStore = createSessionStore(app.getPath('userData'));");
    expect(mainSource).toContain('sessionStore.prune(new Set((await recentProjects.list()).map((entry) => entry.id)))');
    const store = read('sessionStore.ts');
    expect(store).not.toMatch(/process\.env|homedir|tmpdir|ipcMain|webContents/);
    expect(store).toContain("path.join(userDataPath, SESSION_DIRECTORY)");
  });

  it('brings no npm runtime dependency into the main process', () => {
    for (const source of [read('sessionStore.ts'), read('sessionStoreProtocol.ts')]) {
      const specifiers = [...source.matchAll(/^(?:import|export)[^;]*? from '([^']+)'/gms)].map(([, specifier]) => specifier);
      expect(specifiers.filter((specifier) => !/^(\.|node:)/.test(specifier))).toEqual([]);
    }
    expect(read('sessionStoreProtocol.ts')).not.toMatch(/node:|electron/);
  });
});
