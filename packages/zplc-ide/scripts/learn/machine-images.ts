/**
 * The labelled image of each plant scene, for the machine page of a plant lesson (course review L8):
 *
 *   bun scripts/learn/machine-images.ts [--out <dir>] [--scenes a,b]
 *
 * For each scene of plant-scenes/ (all of them by default) it draws the first view of the scene with the plant renderer, at the medium
 * level, in light mode, 960 x 540, and sets a label around the frame for each part, with its name, its kind and its wired signals,
 * joined to the part by a leader line: `<out>/<scene>/machine.en.png` and `machine.es.png`, and `machine.layout.json` with where
 * each part and each label is. It exits 1 if a scene has missing text, a label overlaps another, leaves the image or covers
 * the frame, or text shrinks below 12 px at reading-column width. The default `<out>` is .cache/claude-ux-review/course/machine-pages.
 *
 * Like scripts/plant/capture.ts it starts the development server and an application window with software GL (SwiftShader,
 * headless), and the page draws with scripts/plant/stage.ts. Evidence level: the renderer and the plant core in a page of the
 * development build, software GL; not the packaged application, not a GPU.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { trustedDevelopmentRendererUrl } from '../../electron/security';
import {
  assert,
  Cdp,
  drain,
  electronExecutable,
  freePort,
  HOST,
  packageRoot,
  stop,
  waitFor,
  type OwnedProcess,
} from '../run-desktop-smoke';
import {
  COMPACT_COLUMN_WIDTH_PX,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  LEGEND_FONT_PX,
  LINE_FONT_PX,
  MIN_DISPLAY_TEXT_PX,
  crossings,
  effectiveLabelTextPx,
  layoutProblems,
  type LabelLayout,
} from './labelLayout';
import { LEGEND, LOCALES, machineRows, partLabels, readMachine, SCENES_DIR } from './machinePage';

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const out = resolve(flag('out') ?? fileURLToPath(new URL('../../../../.cache/claude-ux-review/course/machine-pages', import.meta.url)));
const scenes = flag('scenes')?.split(',') ?? readdirSync(SCENES_DIR).sort();

/** The headless application window of capture.ts, which does not export it: the development server, Electron, its page. */
async function withWindow<T>(body: (page: Cdp) => Promise<T>): Promise<T> {
  const root = join(process.env.TMPDIR ?? '/tmp', `zplc-machine-images-${process.pid}`);
  mkdirSync(root, { recursive: true });
  const port = await freePort();
  const output: string[] = [];
  const vite: OwnedProcess = Bun.spawn([process.execPath, 'run', 'vite', '--host', HOST, '--port', String(port), '--strictPort'], {
    cwd: packageRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  drain(vite, output, 'vite');
  let electron: OwnedProcess | undefined;
  let page: Cdp | undefined;
  try {
    await waitFor('the development server', async () =>
      (await fetch(`http://${HOST}:${port}/`).catch(() => null))?.ok ? true : undefined,
    );
    assert(vite.exitCode === null, `Vite could not take port ${port}.`);
    const cdpPort = await freePort();
    electron = Bun.spawn(
      [
        electronExecutable(),
        '--headless',
        '--use-angle=swiftshader-webgl',
        '--use-gl=angle',
        '--enable-unsafe-swiftshader',
        `--zplc-smoke-port=${port}`,
        '--lang=en-US',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${join(root, 'profile')}`,
        '.',
      ],
      {
        cwd: packageRoot,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NODE_ENV: 'development', ZPLC_PERSIST_ROOT: join(root, 'persist') },
      },
    );
    drain(electron, output, 'electron');
    const target = await waitFor('the application window', async () => {
      const targets = (await fetch(`http://${HOST}:${cdpPort}/json/list`)
        .then((r) => r.json())
        .catch(() => [])) as Array<{ type?: string; url?: string; webSocketDebuggerUrl?: string }>;
      return targets.find((t) => t.type === 'page' && t.url === trustedDevelopmentRendererUrl(port) && t.webSocketDebuggerUrl)
        ?.webSocketDebuggerUrl;
    });
    page = await Cdp.connect(target);
    for (const method of ['Runtime.enable', 'Page.enable']) await page.command(method);
    for (const deadline = Date.now() + 300_000; Date.now() < deadline; await Bun.sleep(250))
      if ((await page.evaluate(`document.querySelector('h1')?.textContent`).catch(() => undefined)) === 'ZPLC') break;
    return await body(page);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output.join('').slice(-3_000)}`);
  } finally {
    if (page) void page.command('Browser.close').catch(() => undefined);
    if (electron) await Promise.race([electron.exited, Bun.sleep(3_000)]);
    page?.close();
    if (electron) await stop(electron);
    await stop(vite);
  }
}

type Shot = Record<string, { png: string; layout: LabelLayout; anchors: Record<string, [number, number] | null> }>;

const problems: string[] = [];
let images = 0;
await withWindow(async (page) => {
  for (const id of scenes) {
    const machine = readMachine(id);
    const { rows, problems: missing } = machineRows(machine);
    problems.push(...missing);
    const names = JSON.parse(readFileSync(join(SCENES_DIR, id, 'text.json'), 'utf8')) as Record<string, { name: string }>;
    const pages = Object.fromEntries(
      LOCALES.map((locale) => [locale, { title: names[locale]!.name, legend: LEGEND[locale], labels: partLabels(rows, locale) }]),
    );
    const spec = { scene: id, width: FRAME_WIDTH, height: FRAME_HEIGHT, pages };
    const shot = (await page.evaluate(`import('/scripts/learn/labelShot.ts').then((m) => m.machineShot(${JSON.stringify(spec)}))`)) as Shot;
    mkdirSync(join(out, id), { recursive: true });
    const layouts: Record<string, unknown> = {};
    for (const locale of LOCALES) {
      const { png, layout, anchors } = shot[locale]!;
      writeFileSync(join(out, id, `machine.${locale}.png`), Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
      images++;
      for (const problem of layoutProblems(layout)) problems.push(`${id} ${locale}: ${problem}`);
      const renderedPx = effectiveLabelTextPx(layout.width, COMPACT_COLUMN_WIDTH_PX, Math.min(LINE_FONT_PX, LEGEND_FONT_PX));
      if (renderedPx < MIN_DISPLAY_TEXT_PX)
        problems.push(`${id} ${locale}: label text is ${renderedPx.toFixed(1)} px at ${COMPACT_COLUMN_WIDTH_PX} px width (< 12 px)`);
      for (const [part, at] of Object.entries(anchors)) if (!at) problems.push(`${id}: part ${part} has no position on the frame`);
      layouts[locale] = {
        width: layout.width,
        height: layout.height,
        crossings: crossings(layout),
        frame: layout.frame,
        labels: layout.labels,
      };
    }
    writeFileSync(join(out, id, 'machine.layout.json'), `${JSON.stringify({ anchors: shot.en!.anchors, ...layouts }, null, 2)}\n`);
    console.log(
      `  ${id}: ${rows.length} rows, ${pages.en!.labels.length} labels, ${shot.en!.layout.width}x${shot.en!.layout.height} label area, ` +
        `${crossings(shot.en!.layout)} crossing leaders (en), ${crossings(shot.es!.layout)} (es)`,
    );
  }
});
for (const problem of [...new Set(problems)]) console.error(`problem: ${problem}`);
console.log(`${images} images of ${scenes.length} scenes written to ${out}; ${new Set(problems).size} problems`);
process.exit(problems.length > 0 ? 1 : 0);
