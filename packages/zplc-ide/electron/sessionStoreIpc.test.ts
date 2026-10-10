import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(electronDir, name), 'utf8');
// The channels, the narrow preload object and the sender, message and folder-id checks are proven by behaviour in
// ipcRegistry.test.ts and preload.test.ts. What stays is the storage location and the module hygiene of the store.
const mainSource = read('main.ts');

describe('session IPC boundary (IDE-008)', () => {
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
