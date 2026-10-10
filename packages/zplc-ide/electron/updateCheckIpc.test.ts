import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { UPDATE_CHECK_CHANNEL } from './updateCheckProtocol';

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(electronDir, name), 'utf8');
const mainSource = read('main.ts');
const preloadSource = read('preload.ts');

describe('update check IPC boundary (IDE-010)', () => {
  it('registers the channel that the protocol defines and repeats it once in the preload', () => {
    expect(UPDATE_CHECK_CHANNEL).toEqual({ RUN: 'update-check:run' });
    expect(mainSource).toContain("from './updateCheckProtocol.js'");
    expect(mainSource).not.toContain("'update-check:run'");
    expect(preloadSource).toContain("const UPDATE_CHECK_CHANNEL = { RUN: 'update-check:run' } as const;");
  });

  it('exposes one call without arguments: the renderer cannot name an address', () => {
    const block = /updateCheck: \{([\s\S]*?)\n {2}\},/.exec(preloadSource)?.[1] ?? '';
    expect(block).toContain('run: () => ipcRenderer.invoke(UPDATE_CHECK_CHANNEL.RUN)');
    expect([...block.matchAll(/^ {4}(\w+): /gm)].map(([, name]) => name)).toEqual(['run']);
  });

  it('checks the sender and refuses any argument before it asks the network, and again before it answers', () => {
    const start = mainSource.indexOf('ipcMain.handle(UPDATE_CHECK_CHANNEL.RUN,');
    expect(start).toBeGreaterThan(-1);
    const body = mainSource.slice(start, mainSource.indexOf('\n  });', start) + 6);
    expect(body).toContain('const owner = currentRendererOwner(event);');
    expect(body).toContain('args.length !== 0 || !owner');
    expect(body.indexOf("throw new Error('Request denied')")).toBeLessThan(body.indexOf('checkForUpdate('));
    expect(body).toContain("if (!rendererOwnerIsCurrent(owner)) throw new Error('Request denied');");
    expect(body).not.toMatch(/args\[0\]/);
  });

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
