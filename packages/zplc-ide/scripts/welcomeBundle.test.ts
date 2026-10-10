/**
 * IDE-015: the Welcome screen loads without the code editor, the visual editors or the settings, and only the Monaco
 * features Studio uses are bundled. The test builds Studio with the repository's own Vite configuration into a
 * temporary folder and reads the build output: the manifest says which chunks the entry page loads (its static
 * imports, followed transitively), and the source map of each chunk says which modules it holds.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';

import { builderFilePatterns, packagedByPatterns } from './electronBuilderFiles';

interface ManifestChunk { file: string; imports?: string[]; dynamicImports?: string[]; isEntry?: boolean }

const packageRoot = join(import.meta.dir, '..');
let outDir = '';
let manifest: Record<string, ManifestChunk> = {};

const sourcesOf = (file: string): string[] =>
  (JSON.parse(readFileSync(join(outDir, `${file}.map`), 'utf8')) as { sources: string[] }).sources.map((source) => source.replace(/^(\.\.\/)+/, ''));

/** The chunks the entry page loads at start: the entry and everything it imports statically. */
function startChunks(): string[] {
  const seen = new Set<string>();
  const visit = (key: string): void => {
    const chunk = manifest[key];
    if (!chunk || seen.has(chunk.file)) return;
    if (chunk.file.endsWith('.js')) seen.add(chunk.file);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  visit('index.html');
  return [...seen];
}

const allChunks = (): string[] => [...new Set(Object.values(manifest).map((chunk) => chunk.file))].filter((file) => file.endsWith('.js'));

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'zplc-welcome-bundle-'));
  await build({
    root: packageRoot,
    configFile: join(packageRoot, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true, manifest: true, sourcemap: true, reportCompressedSize: false },
  });
  manifest = JSON.parse(readFileSync(join(outDir, '.vite', 'manifest.json'), 'utf8')) as Record<string, ManifestChunk>;
}, 240_000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

describe('the chunks the Welcome screen loads at start (IDE-015)', () => {
  it('hold the Welcome screen and none of the editors, Monaco or the settings', () => {
    const modules = startChunks().flatMap(sourcesOf);
    expect(modules.some((source) => source.endsWith('src/components/WelcomeScreen.tsx'))).toBe(true);
    const forbidden = modules.filter((source) =>
      /node_modules\/(monaco-editor|@monaco-editor|@xyflow)\//.test(source)
      || /src\/components\/CodeEditor\.tsx$/.test(source)
      || /src\/editors\/(fbd|ld|sfc)\/[A-Za-z]+Editor\.tsx$/.test(source)
      || /src\/components\/settings\/(?!AppPreferences\.tsx$)/.test(source));
    expect(forbidden).toEqual([]);
  });

  it('are small next to the whole application: the editors are chunks that load on use', () => {
    const start = new Set(startChunks());
    const kilobytes = (files: Iterable<string>) => [...files].reduce((sum, file) => sum + readFileSync(join(outDir, file)).length, 0) / 1024;
    const lazy = allChunks().filter((file) => !start.has(file));
    // The code editor with Monaco, the settings and the visual editors each have a chunk of their own that is not loaded at start.
    const lazyModules = lazy.flatMap(sourcesOf);
    expect(lazyModules.some((source) => source.endsWith('src/components/CodeEditor.tsx'))).toBe(true);
    expect(lazyModules.some((source) => source.endsWith('src/components/settings/ProjectSettings.tsx'))).toBe(true);
    expect(lazyModules.some((source) => /src\/editors\/ld\/LDEditor\.tsx$/.test(source))).toBe(true);
    expect(kilobytes(start)).toBeLessThan(kilobytes(lazy));
  });
});

describe('the installer payload (IDE-015)', () => {
  /** Every file of the build, named as it is in the app folder that electron-builder packages. */
  const built = (directory = ''): string[] => readdirSync(join(outDir, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
    return entry.isDirectory() ? built(path) : [path];
  });

  it('holds no source map and still holds the page and its scripts', () => {
    const patterns = builderFilePatterns();
    const files = built().filter((file) => !file.startsWith('.vite/')).map((file) => `dist/${file}`);
    expect(files.some((file) => file.endsWith('.js.map'))).toBe(true);
    expect(files.filter((file) => packagedByPatterns(patterns, file) && file.endsWith('.map'))).toEqual([]);
    expect(packagedByPatterns(patterns, 'dist/index.html')).toBe(true);
    expect(files.filter((file) => file.endsWith('.js') && !packagedByPatterns(patterns, file))).toEqual([]);
  });

  it('holds no source map of the compiled main process, preload or tool bundle', () => {
    const patterns = builderFilePatterns();
    for (const map of ['electron-dist/main.js.map', 'electron-dist/projectFiles.js.map', 'electron-dist/preload.cjs.map', 'electron-dist/toolApi.js.map']) {
      expect(packagedByPatterns(patterns, map)).toBe(false);
    }
    expect(packagedByPatterns(patterns, 'electron-dist/main.js')).toBe(true);
  });
});

describe('the Monaco that is bundled (IDE-015)', () => {
  it('holds the editor core, the Structured Text language, and no other language of Monaco', () => {
    const modules = allChunks().flatMap(sourcesOf);
    expect(modules.some((source) => /monaco-editor\/esm\/vs\/editor\/browser\/widget\/codeEditor/.test(source))).toBe(true);
    expect(modules.some((source) => /monaco-editor\/esm\/vs\/basic-languages\/st\/st\.js$/.test(source))).toBe(true);
    const languages = modules.filter((source) => /monaco-editor\/esm\/vs\/(language|basic-languages)\//.test(source));
    expect(languages.filter((source) => !/\/basic-languages\/(_\.contribution|st\/st\.contribution|st\/st)\.js$/.test(source))).toEqual([]);
  });

  it('ships the editor worker and no language worker', () => {
    const workers = readdirSync(join(outDir, 'assets')).filter((name) => /\.worker-[^.]+\.js$/.test(name));
    expect(workers.map((name) => name.replace(/-[^.-]+\.js$/, ''))).toEqual(['editor.worker']);
  });
});
