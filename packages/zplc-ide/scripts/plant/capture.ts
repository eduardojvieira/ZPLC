/**
 * Captures of the 3D plant from the product's own renderer (spec 012 VIS-014, VIS-015, VIS-016), for a person to judge the look:
 *
 *   bun scripts/plant/capture.ts [--out <dir>] [--scenes a,b] [--sizes 480x640,1280x720] [--modes light,dark] [--levels low,high]
 *                                [--no-states] [--no-looks]
 *   bun scripts/plant/capture.ts --catalogue [--out <dir>] [--modes light,dark] [--levels low,high]
 *   bun scripts/plant/capture.ts --fps [--uncapped] [--scenes a,b] [--seconds 30]
 *   bun scripts/plant/capture.ts --concepts <dir of the concept images> [--out <dir>]
 *
 * For each scene: one frame per size, display mode and quality level of the scene at work (belts running, an item on the way), a
 * contact sheet that labels each frame (`<scene>-looks.png`), and for belt-to-sensor the state pairs of VIS-016 in each display mode
 * (`belt-to-sensor-states.png`). `--concepts` instead draws the subjects of the concept images and sets each beside its concept
 * (`concepts.png`). It starts the development server and a window of the application with software GL (SwiftShader,
 * headless): those frames are what the renderer draws, but their timing says nothing about a GPU.
 *
 * `--catalogue` instead draws every part kind that has a model in each of its states, and each item look, one small frame each at a
 * camera that frames the part's bounds (scripts/plant/catalogueStates.ts), and sets them on one contact sheet per display mode and
 * quality level (`catalogue-<mode>-<level>.png`), each cell labelled with the kind and the state.
 *
 * `--fps` instead opens a real window with the GPU on (it needs a display and port 3000 free, which the application's development
 * window uses) and measures the frame rate of each scene per quality level on a 1920 x 1080 canvas, with the 1-minute load average
 * before each run. Evidence level: the renderer and the plant core in a page of the development build, not the packaged application.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join, resolve } from 'node:path';
import { trustedDevelopmentRendererUrl } from '../../electron/security';
import type { BodyPose, PlantSnapshot } from '../../src/plant/contracts';
import { snapshotBounds } from '../../src/plant/view/geometry';
import { CATALOGUE, catalogueCamera, catalogueKindCells, ITEMS } from './catalogueStates';
import { assert, Cdp, drain, freePort, HOST, packageRoot, stop, waitFor, type OwnedProcess } from '../run-desktop-smoke';

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const fps = process.argv.includes('--fps');
const catalogueMode = process.argv.includes('--catalogue');
/** Frame rate with no display cap: frames do not wait for vsync or for the compositor, which also holds back a window it does not show. */
const uncapped = process.argv.includes('--uncapped');
const out = resolve(flag('out') ?? join(packageRoot, '..', '..', '.cache', 'claude-ux-review', 'plant-pilot'));
const scenes = (flag('scenes') ?? (fps ? 'belt-to-sensor,merge-lines' : 'belt-to-sensor')).split(',');
const sizes = (flag('sizes') ?? '480x640,1280x720,1920x1080').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const seconds = Number(flag('seconds') ?? 30);
const MODES = (flag('modes') ?? 'light,dark,high-contrast').split(',') as Array<'light' | 'dark' | 'high-contrast'>;
const LEVELS = (flag('levels') ?? 'low,medium,high').split(',') as Array<'low' | 'medium' | 'high'>;
/** The state pairs of VIS-016 on belt-to-sensor, drawn at 1280 x 720 at the medium level. */
const PAIRS = [
  ['diffuse sensor', 'eye-far', 'clear', 'detecting'],
  ['push button', 'start', 'released', 'pressed'],
  ['belt', 'belt', 'stopped', 'running'],
] as const;

/** The part's box grown by half its size on each side, at least 160 by 120 pixels, inside the frame. */
function around(rect: { x: number; y: number; w: number; h: number }, width: number, height: number) {
  const w = Math.min(width, Math.max(160, rect.w * 2));
  const h = Math.min(height, Math.max(120, rect.h * 2));
  const x = Math.min(Math.max(0, rect.x + rect.w / 2 - w / 2), width - w);
  const y = Math.min(Math.max(0, rect.y + rect.h / 2 - h / 2), height - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

async function withWindow<T>(gpu: boolean, body: (page: Cdp) => Promise<T>): Promise<T> {
  const root = join(process.env.TMPDIR ?? '/tmp', `zplc-plant-capture-${process.pid}`);
  mkdirSync(root, { recursive: true });
  // The application's development window: a smoke port only with --headless; a real window loads the fixed development port.
  const port = gpu ? 3000 : await freePort();
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
    const flags = gpu
      ? // A window covered by another one must keep drawing: Chromium otherwise stops its animation frames.
        [
          '--window-size=1920,1080',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          ...(uncapped ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []),
        ]
      : ['--headless', '--use-angle=swiftshader-webgl', '--use-gl=angle', '--enable-unsafe-swiftshader', `--zplc-smoke-port=${port}`];
    electron = Bun.spawn(
      [
        join(packageRoot, 'node_modules', 'electron', 'dist', 'electron'),
        ...flags,
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
    for (const method of ['Runtime.enable', 'Page.enable', 'Page.bringToFront']) await page.command(method);
    for (const deadline = Date.now() + 300_000; Date.now() < deadline; await Bun.sleep(250))
      if ((await page.evaluate(`document.querySelector('h1')?.textContent`).catch(() => undefined)) === 'ZPLC') break;
    // The measured canvas is laid out at 1920 x 1080 whatever the window's size; the window is asked for that size when it can be.
    if (gpu)
      await page
        .command('Browser.getWindowForTarget')
        .then((w) =>
          page!.command('Browser.setWindowBounds', {
            windowId: (w as { windowId: number }).windowId,
            bounds: { windowState: 'normal', width: 1920, height: 1080 },
          }),
        )
        .catch(() => undefined);
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

const call = (page: Cdp, expression: string) => page.evaluate(`import('/scripts/plant/shots.ts').then((m) => ${expression})`);
const save = (name: string, png: string) => {
  writeFileSync(join(out, name), Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
  return join(out, name);
};

async function captures(page: Cdp): Promise<void> {
  for (const scene of process.argv.includes('--no-looks') ? [] : scenes) {
    const cells: Array<{ png: string; label: string }> = [];
    for (const [w, h] of sizes)
      for (const mode of MODES)
        for (const quality of LEVELS) {
          const spec = { scene, quality, mode, width: w, height: h, state: 'working' };
          const { png } = (await call(page, `m.shot(${JSON.stringify(spec)})`)) as { png: string };
          const name = `${scene}-${w}x${h}-${mode}-${quality}.png`;
          save(name, png);
          cells.push({ png, label: `${w}x${h} · ${mode} · ${quality}` });
          console.log(`  ${name}`);
        }
    const looks = (await call(
      page,
      `m.sheet(${JSON.stringify(`${scene}: sizes x display modes x quality levels (software GL, renderer in the page)`)}, ` +
        `${JSON.stringify(cells)}, 3, { w: 420, h: 300 })`,
    )) as string;
    console.log(`  sheet ${save(`${scene}-looks.png`, looks)}`);
  }
  if (!scenes.includes('belt-to-sensor') || process.argv.includes('--no-states')) return;
  const cells: Array<{ png: string; label: string }> = [];
  const closeUps: Array<{ png: string; label: string; crop: ReturnType<typeof around> }> = [];
  for (const [part, id, a, b] of PAIRS)
    for (const mode of MODES)
      for (const state of [a, b]) {
        const spec = { scene: 'belt-to-sensor', quality: 'medium', mode, width: 1280, height: 720, state, focus: id };
        const shot = (await call(page, `m.shot(${JSON.stringify(spec)})`)) as { png: string; rect?: Parameters<typeof around>[0] };
        save(`belt-to-sensor-state-${part.replace(' ', '-')}-${state}-${mode}.png`, shot.png);
        cells.push({ png: shot.png, label: `${part}: ${state} · ${mode}` });
        if (shot.rect) closeUps.push({ png: shot.png, label: `${part}: ${state} · ${mode}`, crop: around(shot.rect, 1280, 720) });
      }
  for (const state of ['stopped', 'running']) {
    const spec = { scene: 'belt-to-sensor', quality: 'medium', mode: 'light', width: 1280, height: 720, state, reducedMotion: true };
    const { png } = (await call(page, `m.shot(${JSON.stringify(spec)})`)) as { png: string };
    save(`belt-to-sensor-state-belt-${state}-reduced-motion.png`, png);
    cells.push({ png, label: `belt: ${state} · light · reduced motion` });
  }
  const states = (await call(
    page,
    `m.sheet('belt-to-sensor: each state pair (VIS-016) in each display mode, medium, 1280x720', ${JSON.stringify(cells)}, 6, ` +
      `{ w: 300, h: 170 })`,
  )) as string;
  console.log(`  sheet ${save('belt-to-sensor-states-full.png', states)}`);
  const close = (await call(
    page,
    `m.sheet('belt-to-sensor: each state pair (VIS-016), close-up on the part, medium, from 1280x720 frames', ` +
      `${JSON.stringify(closeUps)}, 6, { w: 300, h: 225 })`,
  )) as string;
  console.log(`  sheet ${save('belt-to-sensor-states.png', close)}`);
}

/**
 * The subjects of the concept images (specs/012-zplc-2-1-plant-simulation/concepts), each drawn from belt-to-sensor at 1280 x 720 at
 * the high level in light mode: the first view, and three close-ups from a camera of the capture's own.
 */
const SUBJECTS = [
  { name: 'overview', image: 'concept-station.jpg', concept: 'station', state: 'working' },
  {
    name: 'belt-end',
    image: 'concept-conveyor-detail.jpg',
    concept: 'belt end',
    state: 'working',
    camera: { position: [1.85, 0.32, 0.95], target: [1.05, 0.38, 0.05] },
  },
  {
    name: 'sensor-detecting',
    image: 'concept-sensor.jpg',
    concept: 'photoelectric sensor',
    state: 'detecting',
    camera: { position: [0.28, 0.78, -0.92], target: [0.74, 0.56, -0.38] },
  },
  {
    name: 'push-button',
    image: 'concept-controls.jpg',
    concept: 'control station',
    state: 'released',
    camera: { position: [-1.62, 0.78, -1.32], target: [-0.82, 0.38, -0.42] },
  },
] as const;

async function conceptSheet(page: Cdp, dir: string): Promise<void> {
  const cells: Array<{ png: string; label: string }> = [];
  for (const s of SUBJECTS) {
    const camera = 'camera' in s ? s.camera : undefined;
    const spec = { scene: 'belt-to-sensor', quality: 'high', mode: 'light', width: 1280, height: 720, state: s.state, camera };
    const { png } = (await call(page, `m.shot(${JSON.stringify(spec)})`)) as { png: string };
    console.log(`  ${save(`concept-${s.name}.png`, png)}`);
    const jpeg = `data:image/jpeg;base64,${readFileSync(join(dir, s.image)).toString('base64')}`;
    cells.push({ png: jpeg, label: `concept: ${s.concept}` }, { png, label: `pilot: ${s.name.replace('-', ' ')} (high)` });
  }
  const sheet = (await call(
    page,
    `m.sheet('belt-to-sensor beside the concept images (software GL, renderer in the page, 1280x720, high, light)', ` +
      `${JSON.stringify(cells)}, 2, { w: 800, h: 450 })`,
  )) as string;
  console.log(`  sheet ${save('concepts.png', sheet)}`);
}

/** One small frame of the catalogue: its camera frames the bounds of what is drawn, from the same direction for every cell. */
const CELL = { width: 400, height: 300 } as const;
const CELL_ASPECT = CELL.width / CELL.height;
const emptySnapshot = (parts: PlantSnapshot['parts'], items: PlantSnapshot['items']): PlantSnapshot => ({
  timeMs: 0,
  scans: 0,
  parts,
  items,
  facts: {},
});

/**
 * The catalogue (plan-vis C8). A stage of belt-to-sensor stays open per display mode and quality level and is handed one snapshot per
 * cell: the part views of a kind in a state, alone on the floor (a machine whole), or one item. Every state cell of one kind uses
 * the same camera fitted to the union of all its states (S3-11).
 */
async function catalogue(page: Cdp): Promise<void> {
  const cells = [
    ...(await Promise.all(CATALOGUE.map((kind) => catalogueKindCells(kind, CELL_ASPECT)))).flat(),
    ...ITEMS.map((item) => {
      const [, h] = item.pose.size;
      const pose: BodyPose = { id: item.id, part: 'box', q: [0, 0, 0, 1], p: [0, h / 2, 0], ...item.pose };
      const snapshot = emptySnapshot([], [pose]);
      return { label: `item: ${item.label}`, snapshot, camera: catalogueCamera(snapshotBounds(snapshot)!, CELL_ASPECT) };
    }),
  ];
  for (const mode of MODES)
    for (const quality of LEVELS) {
      const frames: Array<{ png: string; label: string }> = [];
      for (const cell of cells) {
        const spec = { mode, quality, ...CELL, snapshot: cell.snapshot, camera: cell.camera };
        const png = (await page.evaluate(
          `import('/scripts/plant/stage.ts').then(async (s) => {
            const spec = ${JSON.stringify(spec)};
            const key = spec.mode + '/' + spec.quality;
            if (window.__cat?.key !== key) {
              window.__cat?.stage.dispose();
              window.__cat = { key, stage: await s.openStage('belt-to-sensor', spec) };
            }
            const { stage } = window.__cat;
            stage.scene.cameras.splice(1);
            stage.scene.cameras.push({ name: 'catalogue', ...spec.camera });
            stage.renderer.setCameraAnimation?.(false);
            stage.renderer.setSnapshot(spec.snapshot);
            stage.renderer.setCameraPreset('catalogue');
            await stage.renderer.ready?.();
            stage.renderer.setSnapshot(spec.snapshot);
            await s.frames(3);
            return stage.canvas.toDataURL('image/png');
          })`,
        )) as string;
        frames.push({ png, label: cell.label });
      }
      const sheet = (await call(
        page,
        `m.sheet(${JSON.stringify(`catalogue: every part in every state, ${mode}, ${quality} (software GL, renderer in the page)`)}, ` +
          `${JSON.stringify(frames)}, 8, { w: 300, h: 225 })`,
      )) as string;
      console.log(`  sheet ${save(`catalogue-${mode}-${quality}.png`, sheet)} (${frames.length} cells)`);
    }
  await page.evaluate(`(window.__cat?.stage.dispose(), true)`);
}

async function frameRates(page: Cdp): Promise<void> {
  const rows: Array<Record<string, unknown>> = [];
  for (const scene of scenes)
    for (const quality of LEVELS) {
      const load = loadavg()[0]!;
      // A page task polled here: a run is longer than one protocol command may take.
      await page.evaluate(
        `(() => { window.__fps = undefined; import('/scripts/plant/shots.ts').then((m) => m.frameRate(${JSON.stringify(scene)}, ` +
          `${JSON.stringify(quality)}, ${seconds}, 1920, 1080)).then((ok) => { window.__fps = { ok }; }, (e) => { window.__fps = ` +
          `{ err: String((e && e.stack) || e) }; }); return true; })()`,
      );
      let result: { ok?: { gpu: string; frames: number; mean: number; p5: number; current: number }; err?: string } | undefined;
      for (const deadline = Date.now() + (seconds + 120) * 1000; !result && Date.now() < deadline; await Bun.sleep(500))
        result = (await page.evaluate('window.__fps')) as typeof result;
      if (!result?.ok) {
        const progress = await page.evaluate(`({ frames: window.__fpsFrames, visibility: document.visibilityState })`);
        throw new Error(`${scene} ${quality}: ${result?.err ?? `the run did not finish (${JSON.stringify(progress)})`}`);
      }
      const r = result.ok;
      const window = (await page.evaluate('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })')) as Record<string, number>;
      const row = { scene, quality, ...r, window, cap: uncapped ? 'off' : 'display', load1: Number(load.toFixed(2)), underLoad: load > 4 };
      rows.push(row);
      console.log(
        `  ${scene} ${quality}: ${r.mean.toFixed(1)} fps mean, ${r.p5.toFixed(1)} fps at the slowest 5 %, ${r.frames} frames, ` +
          `load ${load.toFixed(2)}${load > 4 ? ' (measured under load)' : ''}, ${r.gpu}`,
      );
    }
  const file = join(out, 'frame-rates.json');
  writeFileSync(file, JSON.stringify({ seconds, size: '1920x1080', rows }, null, 2));
  console.log(`  ${file}`);
}

mkdirSync(out, { recursive: true });
if (fps) {
  const free = await fetch(`http://${HOST}:3000/`).then(
    () => false,
    () => true,
  );
  assert(free, 'Port 3000 is in use: the development window of the application needs it for --fps.');
  await withWindow(true, frameRates);
} else if (catalogueMode) await withWindow(false, catalogue);
else if (flag('concepts')) await withWindow(false, (page) => conceptSheet(page, resolve(flag('concepts')!)));
else await withWindow(false, captures);
