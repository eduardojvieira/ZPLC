import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(electronDir, name), 'utf8');
// The channel, the argument-less preload call and the sender check are proven by behaviour in ipcRegistry.test.ts and
// preload.test.ts. What stays is the single fixed address and the module hygiene of the update check.
const mainSource = read('main.ts');

describe('update check IPC boundary (IDE-010)', () => {
  it('is the only place in the main process that opens a network connection of its own, to one fixed address', () => {
    expect(mainSource).not.toMatch(/\bfetch\(\s*(?!url)/);
    expect(read('updateCheck.ts')).toContain("export const UPDATE_CHECK_URL = 'https://api.github.com/repos/eduardojvieira/ZPLC/releases/latest';");
  });

  it('names its relative imports with the .js suffix and brings no npm runtime dependency', () => {
    for (const name of ['updateCheck.ts', 'updateCheckProtocol.ts']) {
      const specifiers = [...read(name).matchAll(/^(?:import|export)[^;]*? from '([^']+)'/gms)].map(([, specifier]) => specifier!);
      expect(specifiers.filter((specifier) => specifier.startsWith('.') && !specifier.endsWith('.js'))).toEqual([]);
      expect(specifiers.filter((specifier) => !specifier.startsWith('.') && !specifier.startsWith('node:'))).toEqual([]);
    }
    expect(read('updateCheckProtocol.ts')).not.toMatch(/node:|electron/);
  });
});
