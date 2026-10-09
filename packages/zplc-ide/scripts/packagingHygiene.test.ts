/**
 * VF-008: the folder dialog test hook exists only in builds made for the suite, and a released installer
 * contains no trace of it. Three layers hold that line: the hook lives in its own module that the main
 * process loads only when it is not packaged, electron-builder leaves the compiled module out of the
 * archive, and the packaged smoke scans the real app.asar of every release lane.
 */
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEV_ONLY_VARIABLE,
  assertAsarHasNoDevOnlyCode,
  listAsarFiles,
  packagedAsarPath,
} from './run-packaged-desktop-smoke';

const read = (relative: string) => readFileSync(join(import.meta.dir, relative), 'utf8');

type AsarEntry = { files?: Record<string, AsarEntry>; size?: number; offset?: string };

/** An archive laid out like asar's: four 32-bit words, the JSON header, then the file bytes (offsets are not read here). */
function makeAsar(tree: Record<string, AsarEntry>, body = ''): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify({ files: tree }));
  const bytes = new Uint8Array(16 + json.length + body.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 4, true);
  view.setUint32(4, json.length + 8, true);
  view.setUint32(8, json.length + 4, true);
  view.setUint32(12, json.length, true);
  bytes.set(json, 16);
  bytes.set(new TextEncoder().encode(body), 16 + json.length);
  return bytes;
}

const file: AsarEntry = { size: 1, offset: '0' };
const clean = makeAsar({ 'package.json': file, 'electron-dist': { files: { 'main.js': file, 'projectFiles.js': file } }, dist: { files: { assets: { files: { 'index.js': file } } } } }, 'const ok = 1;');

describe('app.asar scan of the packaged smoke', () => {
  it('lists the files of the archive header, directories flattened to paths', () => {
    expect(listAsarFiles(clean).sort()).toEqual(['dist/assets/index.js', 'electron-dist/main.js', 'electron-dist/projectFiles.js', 'package.json']);
  });

  it('passes an archive with neither the hook module nor its variable name', () => {
    expect(() => assertAsarHasNoDevOnlyCode(clean)).not.toThrow();
  });

  it('fails when the variable name occurs anywhere in the archive bytes', () => {
    const leaked = makeAsar({ 'electron-dist': { files: { 'main.js': file } } }, `const f = env.${DEV_ONLY_VARIABLE};`);
    expect(() => assertAsarHasNoDevOnlyCode(leaked)).toThrow(DEV_ONLY_VARIABLE);
  });

  it('fails when the hook module or its source map is listed, whatever its content', () => {
    for (const name of ['devFolderDialogHook.js', 'devFolderDialogHook.js.map']) {
      const listed = makeAsar({ 'electron-dist': { files: { 'main.js': file, [name]: file } } });
      expect(() => assertAsarHasNoDevOnlyCode(listed)).toThrow(name);
    }
  });

  it('finds app.asar in the resources of each platform layout', () => {
    expect(packagedAsarPath(join('/p', 'linux-unpacked', 'zplc-ide'), 'linux')).toBe(join('/p', 'linux-unpacked', 'resources', 'app.asar'));
    expect(packagedAsarPath(join('/p', 'win-unpacked', 'zplc-ide.exe'), 'win32')).toBe(join('/p', 'win-unpacked', 'resources', 'app.asar'));
    expect(packagedAsarPath(join('/p', 'mac', 'ZPLC IDE.app', 'Contents', 'MacOS', 'zplc-ide'), 'darwin')).toBe(join('/p', 'mac', 'ZPLC IDE.app', 'Contents', 'Resources', 'app.asar'));
  });

  it('runs inside the packaged smoke, next to the preload surface it already checks, and asks for the project root bridge', () => {
    const smoke = read('run-packaged-desktop-smoke.ts');
    expect(smoke).toContain('assertAsarHasNoDevOnlyCode(readFileSync(packagedAsarPath(executable)))');
    expect(smoke).toContain('workspaceTests');
    expect(smoke).toContain("'registerProjectRoot'");
  });
});

/** electron-builder keeps a file when the last pattern that decides it includes it: a later include undoes an earlier exclusion. */
function packaged(patterns: string[], file: string): boolean {
  let included = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');
    if (new Bun.Glob(negated ? pattern.slice(1) : pattern).match(file)) included = !negated;
  }
  return included;
}

describe('electron-builder.yml packaging of the dev-only module', () => {
  const patterns = (Bun.YAML.parse(read('../electron-builder.yml')) as { files: string[] }).files;

  it('still packages the compiled main process', () => {
    for (const compiled of ['electron-dist/main.js', 'electron-dist/preload.cjs', 'electron-dist/projectFiles.js', 'dist/index.html']) {
      expect(packaged(patterns, compiled)).toBe(true);
    }
  });

  it('leaves the compiled hook module and its source map out of the archive, with no later pattern bringing them back', () => {
    for (const compiled of ['electron-dist/devFolderDialogHook.js', 'electron-dist/devFolderDialogHook.js.map']) {
      expect(packaged(patterns, compiled)).toBe(false);
    }
  });
});

describe('the main process and the hook module', () => {
  it('keep the variable name out of every module that a packaged app loads', () => {
    for (const name of ['../electron/main.ts', '../electron/preload.ts', '../electron/projectFiles.ts', '../electron/projectFilesProtocol.ts']) {
      expect(read(name).includes(DEV_ONLY_VARIABLE)).toBe(false);
    }
    expect(read('../electron/devFolderDialogHook.ts').includes(DEV_ONLY_VARIABLE)).toBe(true);
  });

  it('load the hook module only behind a not-packaged check, by dynamic import, never statically', () => {
    const main = read('../electron/main.ts');
    expect(main).not.toMatch(/^import .*devFolderDialogHook/m);
    expect(main.match(/devFolderDialogHook/g)).toHaveLength(1);
    expect(main).toMatch(/if \(!app\.isPackaged\) \{\n\s+const \{ readFolderDialogHook \} = await import\('\.\/devFolderDialogHook\.js'\);/);
  });
});
