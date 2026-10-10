import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(electronDir, name), 'utf8');
// The channels, the narrow preload object, the sender, message and folder-id checks and the discard on a confirmed close
// are proven by behaviour in ipcRegistry.test.ts and preload.test.ts. What stays is the storage location and the module
// hygiene of the store, which have no behavioural seam.
const mainSource = read('main.ts');

describe('recovery IPC boundary (IDE-006)', () => {
  it('keeps the recovery files under the user-data directory and prunes forgotten projects when the app starts', () => {
    expect(mainSource).toContain("recoveryStore = createRecoveryStore(app.getPath('userData'));");
    expect(mainSource).toContain('recoveryStore.prune(new Set((await recentProjects.list()).map((entry) => entry.id)))');
    const store = read('recoveryStore.ts');
    expect(store).not.toMatch(/process\.env|homedir|tmpdir|ipcMain|webContents/);
    expect(store).toContain('path.join(userDataPath, RECOVERY_DIRECTORY)');
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
