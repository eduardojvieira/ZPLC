/**
 * IDE-015: the Welcome screen loads without the code editor, the visual editors or the settings, and only the Monaco
 * features Studio uses are bundled. The test builds Studio with the repository's own Vite configuration into a
 * temporary folder and reads the build output: the manifest says which chunks the entry page loads (its static
 * imports, followed transitively), and the source map of each chunk says which modules it holds.
 *
 * LRN-030: the same production build, the content security policy of the installed application and the main process
 * fetch nothing from another host at start, in Learn or in the simulation; the update check runs only when turned on.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';

import { createContentSecurityPolicy } from '../electron/security';
import { startUpdateCheck } from '../src/ipc/updateCheckBridge';
import { DEFAULT_SETTINGS } from '../src/utils/appSettings';
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
    for (const map of ['electron-dist/electron/main.js.map', 'electron-dist/electron/projectFiles.js.map', 'electron-dist/shared/spawnAllowList.js.map', 'electron-dist/preload.cjs.map', 'electron-dist/toolApi.js.map']) {
      expect(packagedByPatterns(patterns, map)).toBe(false);
    }
    expect(packagedByPatterns(patterns, 'electron-dist/electron/main.js')).toBe(true);
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

/**
 * Hosts the production renderer may name without loading anything from them, each with the reason. A font, a CDN script
 * or an analytics service is a new host here, and fails the check below until someone writes why it loads nothing.
 */
const INERT_HOSTS: Record<string, string> = {
  'www.w3.org': 'XML and SVG namespace names',
  'json-schema.org': 'JSON Schema identifiers',
  'github.com': 'links a person opens in the browser: release notes and issues',
  'react.dev': 'links in React error messages',
  'reactjs.org': 'a link in a React warning message',
  'code.visualstudio.com': 'strings inside Monaco',
  'microsoft.com': 'strings inside Monaco',
  'reactflow.dev': 'the attribution link of React Flow',
  'cdn.jsdelivr.net': 'the default path of @monaco-editor/loader, unused: Studio gives the loader its bundled Monaco (src/components/monacoRuntime.ts), and the policy refuses the CDN',
};
/** Every host an absolute or protocol-relative URL in the text names. */
const hostsIn = (text: string): string[] => [...new Set([...text.matchAll(/(?:https?:|wss?:|[("'`=\s])\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)].map((match) => match[1]!.toLowerCase()))];
/** A remote stylesheet import or font, or a remote script or stylesheet of the page. */
const REMOTE_LOAD = /@import\s+(?:url\()?["']?(?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\/|<(?:script|link)\b[^>]*\b(?:src|href)=["']?(?:https?:)?\/\//i;

describe('LRN-030 the simulation track needs no network: the installed application fetches nothing from another host', () => {
  const shipped = (): Array<{ file: string; text: string }> => [
    { file: 'index.html', text: readFileSync(join(outDir, 'index.html'), 'utf8') },
    ...readdirSync(join(outDir, 'assets')).filter((name) => /\.(js|css)$/.test(name)).map((name) => ({ file: `assets/${name}`, text: readFileSync(join(outDir, 'assets', name), 'utf8') })),
  ];

  it('LRN-030 the production renderer loads no remote font, stylesheet or script, and names no host it could load from', () => {
    const files = shipped();
    expect(files.length).toBeGreaterThan(2);
    expect(files.filter(({ text }) => REMOTE_LOAD.test(text)).map(({ file }) => file)).toEqual([]);
    // A host that is not listed is reported with the place that names it, so its reason can be written or the load removed.
    const unlisted = files.flatMap(({ file, text }) => hostsIn(text).filter((host) => !(host in INERT_HOSTS)).map((host) => `${host} in ${file}: ${/.{0,60}$/.exec(text.slice(0, text.indexOf(host)))?.[0] ?? ''}${host}`));
    expect(unlisted).toEqual([]);
    // The checks see what they look for: a web font, a CDN script and an analytics beacon are each caught.
    expect(REMOTE_LOAD.test('@import url("https://fonts.googleapis.com/css2?family=Inter");')).toBe(true);
    expect(REMOTE_LOAD.test('<script src="https://cdn.example.net/lib.js"></script>')).toBe(true);
    expect(hostsIn('navigator.sendBeacon("https://www.google-analytics.com/g/collect")')).toEqual(['www.google-analytics.com']);
  });

  it('LRN-030 the policy of the installed window lets it load nothing from another host', () => {
    const policy = createContentSecurityPolicy(false);
    const sources = policy.split(';').flatMap((directive) => directive.trim().split(/\s+/).slice(1));
    expect(sources.filter((source) => !["'self'", "'none'", "'unsafe-inline'", "'wasm-unsafe-eval'", 'data:', 'blob:'].includes(source))).toEqual([]);
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("font-src 'self' data:");
  });

  it('LRN-030 the main process reaches the network only in the update check, off until the user turns it on, and the opt-in assistant', () => {
    // A pinned source check: the main process has no renderer to observe, so its network calls are found in its source.
    const electron = join(packageRoot, 'electron');
    const network = /\bfetch(?:er)?\(|net\.request|https?\.(?:get|request)\(|new WebSocket\(|createConnection\(|net\.connect\(|autoUpdater/;
    const callers = readdirSync(electron).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && network.test(readFileSync(join(electron, name), 'utf8'))).sort();
    // updateCheck.ts fetches the release list; main.ts hands it `fetch` behind the update IPC handler; aiProvider.ts is the assistant, which needs a person to configure it.
    expect(callers).toEqual(['aiProvider.ts', 'main.ts', 'updateCheck.ts']);
    expect(DEFAULT_SETTINGS.checkForUpdates).toBe(false);
    let asked = 0;
    const bridge = { run: async () => { asked += 1; return { status: 'unavailable', current: '0.0.0' }; } };
    startUpdateCheck(DEFAULT_SETTINGS.checkForUpdates, bridge, '0.0.0', () => undefined)();
    expect(asked).toBe(0);
    startUpdateCheck(true, bridge, '0.0.0', () => undefined)();
    expect(asked).toBe(1);
  });
});
