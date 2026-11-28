import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { build, preview, type PreviewServer } from 'vite';
import { freePort, HOST, openPage, stop, type Cdp, type OwnedProcess } from '../../../scripts/cdpHarness';
import { BrowserApp } from '../../test/browser';
import { releaseStaleDom } from '../../test/isolate';
import { teardown } from '../../test/teardown';
import { allOpenLessonRows, syntheticCourse } from './syntheticCourse';

// GDE-002: the plan's rule for the outline (Task G3) is "virtualised only if a render test over a 111-lesson fixture takes over
// 100 ms". Its worst case is the fully open tree the filter produces. Studio ships production React, so the harness page is built by
// Vite in production mode and served as built, in headless Chromium; the page reports the mode React was built in.
setDefaultTimeout(300_000);

const PACKAGE = join(import.meta.dir, '..', '..', '..');
const PAGE = 'src/components/learn/outlineHarness.html';
const LESSON_ROWS = `document.querySelectorAll('#outline-harness [role="treeitem"][aria-level="2"]').length`;
const median = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]!;

let owned: { scratch: string; server?: PreviewServer; browser?: OwnedProcess; cdp?: Cdp } | undefined;
afterAll(async () => {
  const current = owned;
  owned = undefined;
  if (!current) return;
  await teardown([
    ['ask the browser to close', () => current.cdp?.command('Browser.close').catch(() => undefined)],
    ['close the DevTools socket', () => current.cdp?.close()],
    ['stop the browser process', () => stop(current.browser)],
    ['close the preview server', () => current.server?.close(), { warn: true }],
    ['delete the build and the profile', () => rmSync(current.scratch, { recursive: true, force: true })],
  ]);
});

async function productionPage(): Promise<BrowserApp> {
  await releaseStaleDom();
  const root = process.env.TMPDIR ?? join(process.env.HOME ?? '.', '.cache', 'zplc-browser-tests');
  mkdirSync(root, { recursive: true });
  owned = { scratch: mkdtempSync(join(root, 'outline-production-')) };
  const outDir = join(owned.scratch, 'dist');
  // bun test sets NODE_ENV to "test", which Vite would build in; the build is made in production, then the value is put back.
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await build({
      root: PACKAGE,
      mode: 'production',
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, sourcemap: false, rollupOptions: { input: join(PACKAGE, PAGE) } },
    });
  } finally {
    process.env.NODE_ENV = nodeEnv;
  }
  const port = await freePort();
  owned.server = await preview({ root: PACKAGE, logLevel: 'silent', build: { outDir }, preview: { host: HOST, port, strictPort: true } });
  const url = `http://${HOST}:${port}/${PAGE}`;
  const { browser, cdp } = await openPage(url, join(owned.scratch, 'profile'));
  Object.assign(owned, { browser, cdp });
  const app = new BrowserApp(cdp, url);
  await app.until('the harness page', `window.outlineHarness !== undefined`);
  return app;
}

describe('the course outline in a browser (GDE-002)', () => {
  test('GDE-002 the fully open outline of a 111-lesson course renders within the budget with production React', async () => {
    const app = await productionPage();
    // The build defines process.env.NODE_ENV, which picks React's production bundle; a production fiber carries no debug owner.
    expect(await app.eval<string>(`window.outlineHarnessNodeEnv`)).toBe('production');
    await app.eval(`(window.outlineHarness.mountOutline(), true)`);
    await app.until('the outline', `document.querySelector('#outline-harness [role="tree"]') !== null`);
    expect(
      await app.eval<boolean>(
        `(() => { const tree = document.querySelector('#outline-harness [role="tree"]'); const key = Object.keys(tree).find((name) => ` +
          `name.startsWith('__reactFiber$')); return key !== undefined && !('_debugOwner' in tree[key]); })()`,
      ),
    ).toBe(true);
    const rows = allOpenLessonRows(syntheticCourse());
    await app.click('#outline-harness [data-learn-outline] input');
    // One warm-up, then five samples: "s" opens every path and module (every title holds it), Backspace closes them again.
    for (let sample = 0; sample < 6; sample++) {
      await app.type('s');
      await app.until('every row open', `${LESSON_ROWS} === ${rows}`);
      await app.press('Backspace');
      await app.until('the rows closed', `${LESSON_ROWS} === 0`);
    }
    // Each key leaves one sample, from its key down to the committed rows: the even ones are the "s" that opened every row.
    const renders = await app.eval<Array<{ ms: number; rows: number }>>(`[...window.outlineHarness.keyRenders]`);
    expect(renders).toHaveLength(12);
    expect(renders.every((sample, index) => sample.rows === (index % 2 === 0 ? rows : 0))).toBe(true);
    const opening = renders
      .filter((_, index) => index % 2 === 0)
      .slice(1)
      .map((sample) => sample.ms);
    expect(opening).toHaveLength(5);
    console.log(`outline: every row open in ${opening.map((ms) => ms.toFixed(1)).join(', ')} ms (median ${median(opening).toFixed(1)})`);
    expect(median(opening)).toBeLessThan(100);
  });
});
