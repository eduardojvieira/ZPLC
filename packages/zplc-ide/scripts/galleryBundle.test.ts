/**
 * UX-004: the component gallery is a development-build page. The test builds Studio twice with the repository's own Vite
 * configuration into temporary folders, once as the installer is built (production) and once in development mode, and
 * reads the output: the gallery, its text and its stylesheet are in the development build and in no file of the
 * production one, which is what the installer packages.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';

const packageRoot = join(import.meta.dir, '..');
const MARKER = 'ZPLC component gallery';
const folders: string[] = [];
let production = '';
let development = '';

/** `vite build` sets NODE_ENV itself; the test runner leaves it at "test", under which DEV would be true in both builds. */
async function buildTo(mode: 'production' | 'development'): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), `zplc-gallery-${mode}-`));
  folders.push(outDir);
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = mode;
  try {
    await build({
      root: packageRoot,
      configFile: join(packageRoot, 'vite.config.ts'),
      mode,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, sourcemap: true, reportCompressedSize: false },
    });
  } finally {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  }
  return outDir;
}

const filesOf = (directory: string, base = ''): string[] =>
  readdirSync(join(directory, base), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesOf(directory, join(base, entry.name)) : [join(base, entry.name)],
  );

/**
 * The files of a build that hold the gallery: a chunk or stylesheet named for it, a script or stylesheet whose text has its
 * heading, its scoped themes or a reference to its chunk, and a source map that lists one of its modules among its sources.
 */
function galleryTraces(directory: string): string[] {
  return filesOf(directory).filter((file) => {
    if (/GalleryPage/.test(file)) return true;
    const text = readFileSync(join(directory, file), 'utf8');
    if (file.endsWith('.map'))
      return (JSON.parse(text) as { sources: string[] }).sources.some((source) => /src\/ui\/gallery\//.test(source));
    if (!/\.(js|css|html)$/.test(file)) return false;
    return text.includes(MARKER) || text.includes('data-ui-theme') || text.includes('GalleryPage');
  });
}

beforeAll(async () => {
  production = await buildTo('production');
  development = await buildTo('development');
}, 480_000);

afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

describe('the component gallery is a development-build page (UX-004)', () => {
  it('is in no file of the production build: no chunk, no text, no stylesheet, no source map entry', () => {
    expect(galleryTraces(production)).toEqual([]);
  });

  it('is a chunk of its own in the development build, with its scoped theme stylesheet', () => {
    const traces = galleryTraces(development);
    expect(traces.some((file) => file.endsWith('.js'))).toBe(true);
    expect(traces.some((file) => file.endsWith('.css'))).toBe(true);
  });
});
