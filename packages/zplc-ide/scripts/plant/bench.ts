/**
 * The plant bench (Task Q2): frame rate, capacity, editor latency, the no-GPU run, a forced context loss, the camera by keyboard,
 * the display modes and the security check of the 3D plant, driven on the packaged application (the production content security
 * policy applies only there) over the DevTools protocol. One record per machine, named by platform, architecture, CPU and GPU, never
 * by a host or user name.
 *
 *   bun scripts/plant/bench.ts [--out <dir>] [--sequences <list>] [--windowed] [--smoke]
 *
 * Sequences that need a real window with the GPU on (`frames`, `latency`) are the ones a person runs on each reference machine, with
 * `--windowed` (without it they are skipped); the others run headless (the GPU off, or software GL) and give no timing evidence about
 * graphics. `--smoke` runs every sequence in
 * headless software GL for a few seconds and writes no record: it only proves that the script drives the application.
 * Exit 0 when every sequence that ran passed. A miss of a threshold is a finding in the record, never tuned away.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, hostname, tmpdir, totalmem, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { translate } from '../../src/i18n/translate';
import { css } from '../journeyApp';
import {
  holdPushButton,
  launchPackaged,
  openPlantDocument,
  openRecentProject,
  plantFacts,
  runInSimulation,
  setSettingAndReload,
  SHIPPED,
  shippedSceneProject,
  stressScene,
  stressSceneProject,
  writeSceneProject,
  type DriveApp,
  type SceneProject,
} from '../journeys/plantSupport';
import { discoverPackagedExecutable } from '../run-packaged-desktop-smoke';
import {
  buildRecord,
  editorLatencyVerdict,
  frameStats,
  frameVerdict,
  hostRecord,
  identityLeaks,
  recordFileName,
  stepVerdict,
  summarise,
  type Json,
  type RawHost,
  type Verdict,
} from './benchRecord';

const packageRoot = join(import.meta.dir, '..', '..');
const repositoryRoot = join(packageRoot, '..', '..');
const EVIDENCE = join(repositoryRoot, 'specs', '012-zplc-2-1-plant-simulation', 'evidence');

const SEQUENCES = ['capacity', 'frames', 'latency', 'noGpu', 'contextLoss', 'keyboard', 'displayModes', 'security'] as const;
type Sequence = (typeof SEQUENCES)[number];
/** What needs a real visible window with the GPU on. */
const WINDOWED: readonly Sequence[] = ['frames', 'latency'];
type Quality = 'low' | 'medium' | 'high';
const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const smoke = process.argv.includes('--smoke');
/** The windowed sequences open a real window; they run only when a person asks for them. */
const windowedAllowed = process.argv.includes('--windowed');
const requested = (flag('sequences') ?? SEQUENCES.join(',')).split(',').map((name) => name.trim());
for (const name of requested)
  if (!(SEQUENCES as readonly string[]).includes(name)) throw new Error(`Unknown sequence ${name}; use ${SEQUENCES.join(', ')}.`);
const sequences = SEQUENCES.filter((name) => requested.includes(name));
const out = resolve(flag('out') ?? EVIDENCE);
/** Seconds of one frame-rate run and typed characters of one latency run: the plan's 60 s and 500 keys, shortened only by `--smoke`. */
const FRAME_SECONDS = smoke ? 4 : 60;
const KEYS = smoke ? 40 : 500;

const executable = discoverPackagedExecutable(process.env.ZPLC_PACKAGED_DIST ?? join(packageRoot, 'dist-electron'));
const NO_GPU = ['--headless', '--disable-gpu'];
// Software GL, headless: a graphics context exists, so the 3D path runs; its speed says nothing about any real GPU.
// (`--use-gl=angle --use-angle=swiftshader` alone stalls the compositor: no animation frame ever runs; `swiftshader-webgl` does not.)
const SOFTWARE_GL = ['--headless', '--use-angle=swiftshader-webgl', '--use-gl=angle', '--enable-unsafe-swiftshader'];
const WINDOW = ['--window-size=1920,1080'];
const windowedFlags = smoke ? SOFTWARE_GL : WINDOW;

const en = (key: Parameters<typeof translate>[1]) => translate('en', key);
const verdict = (pass: boolean): Verdict => (pass ? 'pass' : 'fail');

// ---------------------------------------------------------------------------------------------------------------------
// Running a page-side function that outlasts one DevTools command (a command times out after 30 s)
// ---------------------------------------------------------------------------------------------------------------------

/** Starts `expression` (a promise) in the page without waiting; the returned function polls for its value. */
async function startInPage<T>(app: DriveApp, slot: string, expression: string, boundMs = 300_000): Promise<() => Promise<T>> {
  await app.eval(
    `(() => { const w = window; w.__bench = w.__bench || {}; w.__bench[${JSON.stringify(slot)}] = undefined; ` +
      `Promise.resolve().then(() => ${expression}).then((v) => { w.__bench[${JSON.stringify(slot)}] = { ok: v }; }, ` +
      `(e) => { w.__bench[${JSON.stringify(slot)}] = { err: String((e && e.stack) || e) }; }); return true; })()`,
  );
  return async () => {
    const result = await app.until(
      `page task ${slot}`,
      () => app.eval<{ ok?: T; err?: string } | undefined>(`window.__bench[${JSON.stringify(slot)}]`),
      boundMs / 3,
    );
    if (result.err) throw new Error(`${slot}: ${result.err}`);
    return result.ok as T;
  };
}

/** The packaged application with a scene project, plant document open, on private profile and project folders. */
async function withScene<T>(
  flags: string[],
  scene: SceneProject,
  body: (app: DriveApp) => Promise<T>,
  options: {
    quality?: Quality;
    theme?: 'light' | 'dark' | 'high-contrast';
    window?: boolean;
    openPlant?: boolean;
    before?: (app: DriveApp) => Promise<void>;
  } = {},
): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'zplc-plant-bench-'));
  const project = writeSceneProject(join(root, 'project'), scene);
  const launched = await launchPackaged(executable, root, [project], { flags });
  try {
    const { app } = launched;
    if (options.window) await resizeWindow(app, 1920, 1080);
    if (options.quality) await setSettingAndReload(app, 'plantQuality', options.quality, options.theme);
    else if (options.theme) await setSettingAndReload(app, 'unlockAllLessons', false, options.theme);
    await options.before?.(app);
    await openRecentProject(app);
    if (options.openPlant !== false) await openPlantDocument(app, scene);
    return await body(app);
  } finally {
    await launched.stop();
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * The size the spec's budget names (1920 by 1080). A real window is asked for it; where the application's window does not take it (it
 * sets its own size, or the screen is smaller), the page is laid out at that size by the protocol and the record says so.
 */
async function resizeWindow(app: DriveApp, width: number, height: number): Promise<void> {
  if (smoke) return;
  try {
    const { windowId } = (await app.cdp.command('Browser.getWindowForTarget')) as { windowId: number };
    await app.cdp.command('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal', width, height } });
    await Bun.sleep(500);
  } catch {
    /* the window keeps its size: the check below decides */
  }
  const size = await app.eval<{ width: number; height: number }>(`({ width: innerWidth, height: innerHeight })`);
  if (size.width !== width || size.height !== height) {
    await app.cdp.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    windowSizing = 'the page is laid out at 1920 by 1080 by the protocol; the window itself did not take that size';
  } else windowSizing = 'the window is 1920 by 1080';
}
let windowSizing = 'not a windowed run';

// ---------------------------------------------------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------------------------------------------------

const knownGpu = { value: null as string | null, screen: null as RawHost['screen'] };

/** The graphics the page really got (the unmasked renderer string), or null when WebGL 2 is not available. */
const probeGpu = (app: DriveApp) =>
  app.eval<{ webgl2: boolean; renderer: string | null }>(
    `(() => { const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) return { webgl2: false, renderer: null }; ` +
      `const info = gl.getExtension('WEBGL_debug_renderer_info'); return { webgl2: true, renderer: info ? ` +
      `gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }; })()`,
  );

/** On Linux the adapter named by the PCI listing, for a machine whose windowed run has not been made yet. */
function linuxGpu(): string | null {
  if (process.platform !== 'linux') return null;
  try {
    const line = execSync('lspci -mm', { encoding: 'utf8' })
      .split('\n')
      .find((entry) => /VGA|3D|Display/i.test(entry));
    return line
      ? (line
          .match(/"([^"]*)"/g)
          ?.slice(2, 3)[0]
          ?.replace(/"/g, '') ?? null)
      : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Page-side and headless loops (one function, two homes: this process and the renderer)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Runs the plant core for `scans` scans of 10 ms (two steps of 5 ms) with every BOOL command held on and each emitter pulsed, and
 * returns the cost of one 5 ms step for every scan, in ms. The body uses nothing from this module: it is sent to the renderer as text.
 */
async function stepCosts(
  createPlantCore: (scene: unknown) => Promise<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  scene: unknown,
  scans: number,
  now: () => number,
): Promise<{ costsMs: number[]; wallMs: number; items: number }> {
  const core = await createPlantCore(scene);
  const commands: string[] = core.signals
    .filter((s: { direction: string; type: string }) => s.direction === 'command' && s.type === 'BOOL')
    .map((s: { name: string }) => s.name);
  const costs: number[] = [];
  const started = now();
  for (let scan = 0; scan < scans; scan += 1) {
    const frame: Record<string, boolean> = {};
    for (const name of commands) frame[name] = name.endsWith('.emit') ? scan % 100 < 5 : true;
    core.apply(frame);
    const t0 = now();
    core.advance(10);
    costs.push((now() - t0) / 2);
  }
  const wallMs = now() - started;
  const items = core.snapshot().items.length;
  core.dispose();
  return { costsMs: costs, wallMs, items };
}

/** A fixed script on the plant core of a scene, and the hash of its trace: the same script gives the same hash in any process. */
async function traceOf(
  createPlantCore: (scene: unknown) => Promise<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  scene: unknown,
): Promise<string> {
  const core = await createPlantCore(scene);
  for (let scan = 0; scan < 1000; scan += 1) {
    if (scan === 10) core.operate('StartButton.pressed', true);
    if (scan === 50) core.operate('StartButton.pressed', false);
    core.apply({ 'Belt1.run': scan >= 12 && scan < 700, 'Emitter1.emit': scan >= 10 && scan < 15 });
    core.advance(10);
  }
  const hash: string = await core.traceHash();
  core.dispose();
  return hash;
}

/** The chunk of the built application that holds the plant core, as a URL the page can import. */
function plantCoreChunk(): string {
  const assets = join(packageRoot, 'dist', 'assets');
  const file = readdirSync(assets).find((name) => /^plantCore-.*\.js$/.test(name));
  if (!file) throw new Error('The built application has no plantCore chunk: run `bun run build` first.');
  return `assets/${file}`;
}
const importCore = (chunk: string) => `import(new URL(${JSON.stringify(chunk)}, document.baseURI).href).then((m) => m.createPlantCore)`;

// ---------------------------------------------------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------------------------------------------------

/** PLT-014: the cost of a plant step, p50, p95, max, on the largest shipped scene and on the stress scene, headless and in the renderer. */
async function capacitySequence(): Promise<Json> {
  const scans = smoke ? 300 : 3000;
  const scenes: Array<[string, unknown]> = [
    [SHIPPED.largest, JSON.parse(shippedSceneProject(SHIPPED.largest).scene)],
    ['stress', stressScene()],
  ];
  const { createPlantCore } = await import('../../src/plant/core/plantCore');
  const result: Json = {};
  const chunk = plantCoreChunk();
  const renderer = await withScene(
    NO_GPU,
    shippedSceneProject(SHIPPED.smallest),
    async (app) => {
      const found: Json = {};
      for (const [name, scene] of scenes) {
        const wait = await startInPage<{ costsMs: number[]; wallMs: number; items: number }>(
          app,
          `capacity-${name}`,
          `${importCore(chunk)}.then((create) => (${stepCosts.toString()})(create, ${JSON.stringify(
            scene,
          )}, ${scans}, () => performance.now()))`,
        );
        const run = await wait();
        found[name] = shape(run, scans);
      }
      return found;
    },
    { openPlant: false },
  );
  for (const [name, scene] of scenes) {
    const run = await stepCosts(createPlantCore as never, scene, scans, () => performance.now());
    result[name] = { headless: shape(run, scans), renderer: renderer[name] };
  }
  const all = Object.values(result).flatMap((entry) => [(entry as { headless: Json }).headless, (entry as { renderer: Json }).renderer]);
  // The gate is the stress scene, headless and in the renderer: the largest shipped scene is recorded beside it.
  const gate = [(result.stress as { headless: Json }).headless, (result.stress as { renderer: Json }).renderer];
  return {
    scans,
    scansPerScene: scans,
    ...result,
    verdict: verdict(gate.every((entry) => entry.verdict === 'pass')),
    recorded: all.length,
  };
}

function shape(run: { costsMs: number[]; wallMs: number; items: number }, scans: number): Json & { verdict: Verdict } {
  const stepMs = summarise(run.costsMs);
  const realTimeFactor = (scans * 10) / run.wallMs;
  return { stepMs, realTimeFactor, items: run.items, verdict: stepVerdict({ p95Ms: stepMs.p95, realTimeFactor }) };
}

/** In the page, before the plant runs: counts the frames the 3D view really draws (a rAF tick in which a draw call happened). */
const FRAME_RECORDER =
  `(() => {
  const w = window; if (w.__frames) return true;
  w.__draws = 0; w.__frames = []; w.__recording = false; let seen = 0;
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const original = WebGL2RenderingContext.prototype[name];
    WebGL2RenderingContext.prototype[name] = function (...args) { w.__draws += 1; return original.apply(this, args); };
  }
  const tick = (time) => { if (w.__recording && w.__draws !== seen) { w.__frames.push(time); seen = w.__draws; } ` +
  `requestAnimationFrame(tick); };
  requestAnimationFrame(tick); return true; })()`;

/**
 * VIS-004, VIS-005: frame rate per quality level, 60 s each, on the largest shipped scene and on the stress scene. A window, the GPU on.
 */
async function framesSequence(): Promise<Json> {
  const runs: Json = {};
  let machine: Json = {};
  const scenes: Array<[string, SceneProject]> = [
    [SHIPPED.largest, shippedSceneProject(SHIPPED.largest)],
    ['stress', stressSceneProject()],
  ];
  for (const [name, scene] of scenes) {
    const perQuality: Json = {};
    for (const quality of QUALITIES) {
      perQuality[quality] = await withScene(
        windowedFlags,
        scene,
        async (app) => {
          const gpu = await probeGpu(app);
          const size = await app.eval<{ width: number; height: number; dpr: number }>(
            `({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })`,
          );
          if (!smoke) await recordMachine(app, gpu.renderer);
          if (!gpu.webgl2) return { verdict: 'fail', error: 'WebGL 2 is not available on this machine with the GPU on' };
          await app.eval(FRAME_RECORDER);
          await runInSimulation(app);
          // warm-up: the scene settles and the renderer compiles its shaders
          await app.eval(`new Promise((resolve) => setTimeout(resolve, 5000))`);
          await app.eval(`(() => { window.__frames.length = 0; window.__recording = true; return true; })()`);
          await Bun.sleep(FRAME_SECONDS * 1000);
          const frames = await app.eval<number[]>(`(() => { window.__recording = false; return window.__frames.slice(); })()`);
          const stats = frameStats(frames);
          const qualitySetting = await app.eval<string | null>(
            `(() => { const stored = JSON.parse(localStorage.getItem('zplc-ide-settings') || '{}'); return (stored.settings ?? ` +
              `stored).plantQuality ?? null; })()`,
          );
          return {
            quality: qualitySetting,
            renderer: gpu.renderer,
            window: size,
            windowSizing,
            seconds: FRAME_SECONDS,
            ...stats,
            verdict: frameVerdict(stats),
          };
        },
        { quality, window: true },
      );
    }
    runs[name] = perQuality;
    machine = {
      ...machine,
      [name]: Object.fromEntries(Object.entries(perQuality).map(([quality, value]) => [quality, (value as Json).verdict])),
    };
  }
  // VIS-005: the machine meets VIS-004 when its lowest level does, on the largest shipped scene and on the stress scene.
  const passes = scenes.every(([name]) => ((runs[name] as Json).low as Json).verdict === 'pass');
  return { ...runs, verdict: verdict(passes), judgedBy: 'the low quality level, on both scenes (VIS-005)' };
}

/** Types `count` characters, one every `periodMs`, through the protocol; returns the sample of each key press as the plan defines it. */
async function typeAndSample(app: DriveApp, count: number, periodMs: number): Promise<number[]> {
  await app.eval(
    `(() => { const w = window; w.__keys = []; w.__events = []; addEventListener('keydown', (e) => w.__keys.push(e.timeStamp), true); ` +
      `new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__events.push({ name: e.name, startTime: e.startTime, ` +
      `duration: e.duration }); })` +
      `.observe({ type: 'event', durationThreshold: 16 }); return true; })()`,
  );
  const begun = performance.now();
  for (let i = 0; i < count; i++) {
    const wait = begun + i * periodMs - performance.now();
    if (wait > 0) await Bun.sleep(wait);
    const char = String.fromCharCode(97 + (i % 26));
    const key = {
      key: char,
      code: `Key${char.toUpperCase()}`,
      text: char,
      unmodifiedText: char,
      windowsVirtualKeyCode: char.toUpperCase().charCodeAt(0),
    };
    await app.cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
    await app.cdp.command('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: key.key,
      code: key.code,
      windowsVirtualKeyCode: key.windowsVirtualKeyCode,
    });
  }
  await Bun.sleep(500);
  const { keys, events } = await app.eval<{ keys: number[]; events: Array<{ name: string; startTime: number; duration: number }> }>(
    `({ keys: window.__keys, events: window.__events })`,
  );
  const names = new Set(['keydown', 'keypress', 'beforeinput', 'input']);
  return keys.map((from, i) => {
    const until = keys[i + 1] ?? Infinity;
    const inside = events.filter((e) => names.has(e.name) && e.startTime >= from && e.startTime < until).map((e) => e.duration);
    // A key press with no entry counts as 16 ms, the floor of the interface.
    return inside.length > 0 ? Math.max(...inside) : 16;
  });
}

/** Puts the focus in the code editor of `src/main.st`, the way a person would: the Project activity, the Files view, the file. */
async function focusCodeEditor(app: DriveApp): Promise<void> {
  const tree = (id: string) => css(`[role="treeitem"][data-tree-node-id="${id}"]`);
  await app.click(css('[data-activity="project"]'), 'the Project activity of the rail');
  await app.click(css(`[aria-label=${JSON.stringify(en('navigator.mode.label'))}] button:nth-of-type(2)`), 'the Files view');
  await app.until('the src folder', async () => (await app.visible(tree('dir:src'))) || undefined);
  if (await app.eval(`document.querySelector('[role="treeitem"][data-tree-node-id="dir:src"]').getAttribute('aria-expanded') === 'false'`))
    await app.click(tree('dir:src'), 'the src folder');
  await app.click(tree('file:src/main.st'), 'main.st');
  await app.until('main.st in the editor', async () => (await app.visible(css('.monaco-editor .view-lines'))) || undefined);
  // the first line: the lines element is taller than the editor, so its centre can fall on another panel
  await app.click(css('.monaco-editor .view-lines .view-line'), 'the code editor');
  await app.press('Ctrl+End');
  await app.eval(`document.querySelector('.monaco-editor textarea')?.focus(); document.activeElement?.tagName === 'TEXTAREA'`);
}

/**
 * PLT-015: key press to paint at the 95th percentile, in the code editor, with no plant (baseline), and with the plant running beside it.
 */
async function latencySequence(): Promise<Json> {
  const conditions: Array<[string, SceneProject, boolean, Quality]> = [
    ['baseline', shippedSceneProject(SHIPPED.largest), false, 'low'],
    [`plant-${SHIPPED.largest}-split`, shippedSceneProject(SHIPPED.largest), true, 'low'],
    ['plant-stress-split', stressSceneProject(), true, 'low'],
  ];
  const results: Json = {};
  for (const [name, scene, plant, quality] of conditions) {
    console.log(`  latency condition ${name} ...`);
    results[name] = await withScene(
      windowedFlags,
      scene,
      async (app) => {
        if (!smoke) await recordMachine(app, (await probeGpu(app)).renderer);
        if (plant) {
          // The plant opens in the second group, beside the code: the layout a learner uses (SHL-006).
          await runInSimulation(app);
          await Bun.sleep(6_000);
        }
        await focusCodeEditor(app);
        const samples = await typeAndSample(app, KEYS, 100);
        const summary = summarise(samples);
        return {
          plant,
          quality,
          split: plant,
          keys: samples.length,
          p50Ms: summary.p50,
          p95Ms: summary.p95,
          maxMs: summary.max,
          verdict: editorLatencyVerdict({ keys: samples.length, expectedKeys: KEYS, p95Ms: summary.p95 }),
        };
      },
      { quality, window: true, openPlant: plant },
    );
  }
  const judged = Object.entries(results).filter(([name]) => name !== 'baseline');
  return {
    ...results,
    judgedBy: 'every condition with a running plant (PLT-015); the baseline is recorded',
    verdict: verdict(judged.every(([, value]) => (value as Json).verdict === 'pass')),
  };
}

async function recordMachine(app: DriveApp, renderer: string | null): Promise<void> {
  knownGpu.value = renderer ?? knownGpu.value;
  knownGpu.screen ??= await app.eval(
    `new Promise((resolve) => { const stamps = []; const tick = (t) => { stamps.push(t); if (stamps.length < 61) ` +
      `requestAnimationFrame(tick); else ` +
      `resolve({ width: screen.width, height: screen.height, refreshHz: Math.round(60000 / (stamps[60] - stamps[0])) }); }; ` +
      `requestAnimationFrame(tick); })`,
  );
}

/**
 * VIS-006, PLT-005: no WebGL 2 (the GPU off): the program, the plant core and the lock-step session run, the panel offers the schematic,
 * the trace is the same.
 */
async function noGpuSequence(): Promise<Json> {
  const chunk = plantCoreChunk();
  const belt = shippedSceneProject(SHIPPED.smallest);
  const { createPlantCore } = await import('../../src/plant/core/plantCore');
  const headlessHash = await traceOf(createPlantCore as never, JSON.parse(belt.scene));
  return withScene(NO_GPU, belt, async (app) => {
    const gpu = await probeGpu(app);
    const failure = await app.until(
      'the failure of the 3D view',
      async () =>
        (await app.eval<string | null>(`document.querySelector('[data-plant-failure]')?.getAttribute('data-plant-failure') ?? null`)) ||
        undefined,
      30_000,
    );
    const message = await app.eval<string>(`document.querySelector('[data-plant-failure]')?.innerText ?? ''`);
    await app.click(css('[data-plant-show-schematic]'), 'Show the schematic');
    const schematic = await app.until('the schematic', async () => (await app.visible(css('[data-plant-schematic]'))) || undefined);
    await runInSimulation(app);
    await holdPushButton(app, 'StartButton', 'pointer');
    const facts = await app.until(
      'the plant to run and the sensor to see the item',
      async () => {
        const text = await plantFacts(app);
        return /Emitted: 1/.test(text) && /EyeFar: 1 pulses/.test(text) ? text : undefined;
      },
      30_000,
    );
    const rendererHash = await (
      await startInPage<string>(app, 'trace', `${importCore(chunk)}.then((create) => (${traceOf.toString()})(create, ${belt.scene}))`)
    )();
    return {
      webgl2: gpu.webgl2,
      failure,
      messageSaysUnavailable: message.includes('WebGL 2 is not available') && message.includes('keep running'),
      schematicOffered: schematic,
      plantRanInLockStep: true,
      facts,
      traceHash: { headless: headlessHash, renderer: rendererHash, equal: headlessHash === rendererHash },
      verdict: verdict(
        !gpu.webgl2 &&
          failure === 'unavailable' &&
          message.includes('WebGL 2 is not available') &&
          schematic &&
          headlessHash === rendererHash,
      ),
    };
  });
}

const failureOf = (app: DriveApp) =>
  app.eval<string | null>(`document.querySelector('[data-plant-failure]')?.getAttribute('data-plant-failure') ?? null`);

/**
 * VIS-006: a forced context loss that is not restored in 3 s says so and offers the schematic; one that is restored in time says nothing;
 * the plant keeps running.
 */
async function contextLossSequence(): Promise<Json> {
  return withScene(SOFTWARE_GL, shippedSceneProject(SHIPPED.smallest), async (app) => {
    const gpu = await probeGpu(app);
    if (!gpu.webgl2) return { verdict: 'fail', error: 'software GL gave no WebGL 2 context: the sequence cannot run on this machine' };
    await app.until('the 3D canvas', async () => (await app.visible(css('[data-plant-canvas]'))) || undefined, 30_000);
    await runInSimulation(app);
    // A lost context hands out no extensions, so the one that loses and restores it is taken while the context is alive.
    await app.eval(
      `(() => { const gl = document.querySelector('[data-plant-canvas]').getContext('webgl2'); window.__lose = gl && ` +
        `gl.getExtension('WEBGL_lose_context'); return Boolean(window.__lose); })()`,
    );
    const lose = (action: 'loseContext' | 'restoreContext') =>
      app.eval<boolean>(`(() => { if (!window.__lose) return false; window.__lose.${action}(); return true; })()`);
    // 1. lost and restored within 3 s: no message
    const brief = await lose('loseContext');
    await Bun.sleep(800);
    const restored = await lose('restoreContext');
    await Bun.sleep(5_000);
    const failureAfterRestore = await failureOf(app);
    // 2. lost and not restored: the message and the schematic
    const lost = await lose('loseContext');
    const failure = await app.until('the lost-context message', async () => (await failureOf(app)) || undefined, 15_000);
    const message = await app.eval<string>(`document.querySelector('[data-plant-failure]')?.innerText ?? ''`);
    await app.click(css('[data-plant-show-schematic]'), 'Show the schematic');
    const schematic = await app.until('the schematic', async () => (await app.visible(css('[data-plant-schematic]'))) || undefined);
    await holdPushButton(app, 'StartButton', 'pointer');
    const facts = await app.until(
      'the plant to keep running after the loss',
      async () => {
        const text = await plantFacts(app);
        return /Emitted: 1/.test(text) ? text : undefined;
      },
      30_000,
    );
    return {
      renderer: gpu.renderer,
      restoredInTimeSaysNothing: brief && restored && failureAfterRestore === null,
      failure,
      messageText: message,
      schematicOffered: schematic,
      plantKeptRunning: facts.includes('Emitted: 1'),
      verdict: verdict(
        brief && restored && lost && failureAfterRestore === null && failure === 'lost' && schematic && facts.includes('Emitted: 1'),
      ),
    };
  });
}

/**
 * A screenshot of a region of the page, decoded in the page: its mean luminance, how many pixels are almost white, and a hash of the
 * pixels.
 */
interface Shot {
  meanLuminance: number;
  /** The mean luminance of the top-left 16 by 16 pixels: the floor and the background, with no part in front of them. */
  corner: number;
  /** The luminance that 99 % of the pixels do not exceed: the brightest things on screen (items, outlines). */
  p99: number;
  pixels: number;
  hash: number;
}
async function screenshotStats(app: DriveApp, selector: string): Promise<Shot> {
  const box = await app.eval<{ x: number; y: number; width: number; height: number }>(
    `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.x, y: b.y, width: ` +
      `b.width, height: b.height }; })()`,
  );
  const shot = (await app.cdp.command('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } })) as { data: string };
  return app.eval(
    `(async () => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(shot.data)}), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0, hash = 0, corner = 0; const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) { const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; sum += y; ` +
      `histogram[Math.min(255, Math.round(y))] += 1; const px = (i / 4) % canvas.width, py = Math.floor(i / 4 / canvas.width); if (px < ` +
      `16 && py < 16) corner += y / 256; hash = (Math.imul(hash, 31) + data[i] + 3 * data[i + 1] + 7 * data[i + 2]) | 0; }
    let seen = 0, p99 = 255; for (let level = 0; level < 256; level += 1) { seen += histogram[level]; if (seen >= 0.99 * (data.length / ` +
      `4)) { p99 = level; break; } }
    return { meanLuminance: sum / (data.length / 4), corner, p99, pixels: data.length / 4, hash };
  })()`,
  );
}

/** The camera preset list of the panel: the select that offers the scene's named cameras. */
const CAMERA_SELECT =
  `[...document.querySelectorAll('[data-plant-panel] select')].find((s) => [...s.options].some((o) => o.textContent ` + `=== 'Overview'))`;

/** VIS-002: the camera orbits, zooms and pans from the keyboard, and the presets are named and reachable from a list. */
async function keyboardSequence(): Promise<Json> {
  return withScene(SOFTWARE_GL, stressSceneProject(), async (app) => {
    const gpu = await probeGpu(app);
    if (!gpu.webgl2) return { verdict: 'fail', error: 'software GL gave no WebGL 2 context: the sequence cannot run on this machine' };
    await app.until('the 3D canvas', async () => (await app.visible(css('[data-plant-canvas]'))) || undefined, 30_000);
    await Bun.sleep(1_500);
    const key = async (name: string, code: string, keyCode: number, text?: string, modifiers = 0) => {
      await app.cdp.command('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: name,
        code,
        text,
        unmodifiedText: text,
        windowsVirtualKeyCode: keyCode,
        modifiers,
      });
      await app.cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode, modifiers });
      await Bun.sleep(500);
    };
    await app.eval(`document.querySelector('[data-plant-canvas]').focus()`);
    const canvas = '[data-plant-canvas]';
    const results: Json = {};
    let before = await screenshotStats(app, canvas);
    for (const [label, name, code, keyCode, text] of [
      ['orbit left', 'ArrowLeft', 'ArrowLeft', 37, undefined],
      ['orbit up', 'ArrowUp', 'ArrowUp', 38, undefined],
      ['zoom in', '+', 'Equal', 187, '+'],
      ['pan forward', 'w', 'KeyW', 87, 'w'],
    ] as const) {
      await key(name, code, keyCode, text);
      const after = await screenshotStats(app, canvas);
      results[label] = { changedTheView: after.hash !== before.hash };
      before = after;
    }
    // the presets: named, and chosen from a list by keyboard
    const presets = await app.eval<string[]>(
      `(() => { const select = ${CAMERA_SELECT}; return select ? [...select.options].map((o) => o.textContent) : []; })()`,
    );
    const start = await screenshotStats(app, canvas);
    await app.eval(`${CAMERA_SELECT}.focus()`);
    await key('ArrowDown', 'ArrowDown', 40);
    const moved = (await screenshotStats(app, canvas)).hash !== start.hash;
    const orbitResults = Object.values(results) as Array<{ changedTheView: boolean }>;
    return {
      renderer: gpu.renderer,
      keys: results,
      presetNames: presets,
      presetChangesTheView: moved,
      verdict: verdict(orbitResults.every((r) => r.changedTheView) && presets.length >= 2 && moved),
    };
  });
}

/** Selects the next camera preset by keyboard and returns the pixels at once and after the easing would have ended. */
async function cameraSettle(app: DriveApp): Promise<{ early: number; late: number; start: number }> {
  const start = (await screenshotStats(app, '[data-plant-canvas]')).hash;
  await app.eval(`${CAMERA_SELECT}.focus()`);
  await app.cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await app.cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  const early = (await screenshotStats(app, '[data-plant-canvas]')).hash;
  await Bun.sleep(2_500);
  return { start, early, late: (await screenshotStats(app, '[data-plant-canvas]')).hash };
}

const reduceMotion = async (app: DriveApp) => {
  await app.cdp.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await app.cdp.command('Page.reload');
  await app.until('the Welcome screen', async () => (await app.visible(css('[data-recent-project]'))) || undefined);
};

/** VIS-009: each display mode gives the 3D panel its own palette, and reduced motion turns the camera easing off. */
async function displayModesSequence(): Promise<Json> {
  const stats: Record<string, Shot> = {};
  const gpuInfo: Json = {};
  for (const mode of ['light', 'dark', 'high-contrast'] as const) {
    stats[mode] = await withScene(
      SOFTWARE_GL,
      stressSceneProject(),
      async (app) => {
        const gpu = await probeGpu(app);
        gpuInfo[mode] = gpu.renderer;
        if (!gpu.webgl2) throw new Error('software GL gave no WebGL 2 context');
        await app.until('the 3D canvas', async () => (await app.visible(css('[data-plant-canvas]'))) || undefined, 30_000);
        await Bun.sleep(2_500);
        return screenshotStats(app, '[data-plant-canvas]');
      },
      { theme: mode },
    );
  }
  const { light, dark, 'high-contrast': contrast } = stats;
  // The floor is bright in light, dark blue-grey in dark and black in high contrast; the items are white in high contrast.
  const floors = light!.corner > 180 && dark!.corner < 60 && contrast!.corner < dark!.corner;
  const items = contrast!.p99 > dark!.p99;
  // The preference of the system reaches the panel: with it the camera is at its end state at once; without it the camera eases.
  const settle = async (reduced: boolean) =>
    withScene(
      SOFTWARE_GL,
      stressSceneProject(),
      async (app) => {
        await app.until('the 3D canvas', async () => (await app.visible(css('[data-plant-canvas]'))) || undefined, 30_000);
        await Bun.sleep(1_500);
        return { matches: await app.eval<boolean>(`matchMedia('(prefers-reduced-motion: reduce)').matches`), ...(await cameraSettle(app)) };
      },
      { before: reduced ? reduceMotion : async () => undefined },
    );
  const reduced = await settle(true);
  const eased = await settle(false);
  const noEasing = reduced.matches && reduced.early === reduced.late && reduced.late !== reduced.start;
  const easingSeen = !eased.matches && eased.early !== eased.late;
  // VIS-009 also asks high contrast to outline sensors, actuators and items. The palette has an `outline` colour: this reads whether any
  // renderer code draws it.
  const outlineDrawn = /\.outline\b/.test(readFileSync(join(packageRoot, 'src', 'plant', 'view', 'renderer.ts'), 'utf8'));
  return {
    renderer: gpuInfo,
    stats,
    floorsFollowTheMode: floors,
    itemsBrighterInHighContrast: items,
    reducedMotion: { reduced, motionOn: eased, noEasingWithTheMode: noEasing, easingSeenWithoutIt: easingSeen },
    highContrastOutline: { drawn: outlineDrawn, evidence: 'static: no code of src/plant/view/renderer.ts reads palette.outline' },
    verdict: verdict(floors && items && noEasing && easingSeen && outlineDrawn),
  };
}

function runChecked(args: string[]): { exitCode: number; summary: string } {
  const run = Bun.spawnSync(args, { cwd: packageRoot, stdout: 'pipe', stderr: 'pipe' });
  const text = `${run.stdout.toString()}\n${run.stderr.toString()}`;
  const counts = [...text.matchAll(/^\s*(\d+) (pass|fail)$/gm)].map((m) => `${m[1]} ${m[2]}`).join(', ');
  return { exitCode: run.exitCode, summary: counts || text.trim().split('\n').slice(-3).join(' | ') };
}

/** VIS-012, VIS-013: the 3D plant runs in the sandboxed renderer under the production policy, with no violation and no remote asset. */
async function securitySequence(): Promise<Json> {
  const requests = new Map<string, string>();
  const failed: string[] = [];
  const scene = shippedSceneProject(SHIPPED.largest);
  const live = await withScene(
    SOFTWARE_GL,
    scene,
    async (app) => {
      const gpu = await probeGpu(app);
      const posture = await app.eval<{ require: string; process: string; isolated: boolean }>(
        `({ require: typeof require, process: typeof process, isolated: typeof window.electronAPI === 'object' })`,
      );
      await app.until('the 3D canvas', async () => (await app.visible(css('[data-plant-canvas]'))) || undefined, 30_000);
      await runInSimulation(app);
      await holdPushButton(app, 'StartButton', 'pointer');
      await Bun.sleep(3_000);
      const sharedMemory = await app.eval<boolean>(`typeof SharedArrayBuffer !== 'undefined' || crossOriginIsolated === true`);
      const cspBaseline = await app.eval<string[]>(`window.__cspBaseline ?? []`);
      const cspViolations = (await app.eval<string[]>(`window.__csp ?? []`)).filter((violation) => !cspBaseline.includes(violation));
      const policyErrors = [...new Set([...app.errors, ...app.cdp.errors])].filter((message) =>
        message.includes('Content Security Policy'),
      );
      return {
        webgl2: gpu.webgl2,
        posture,
        sharedMemory,
        cspViolationsBeforeAnyPlant: cspBaseline,
        cspViolations,
        policyErrors,
        consoleErrors: [...new Set(app.errors)],
      };
    },
    {
      before: async (app) => {
        // Observed from the first byte of the page: every request, every failed one, every policy violation.
        await app.cdp.command('Network.enable');
        app.cdp.on('Network.requestWillBeSent', (params) => {
          const { requestId, request } = params as { requestId: string; request: { url: string } };
          requests.set(requestId, request.url.split(/[?#]/)[0]!);
        });
        app.cdp.on('Network.loadingFailed', (params) => {
          const { requestId, errorText } = params as { requestId: string; errorText: string };
          failed.push(`${requests.get(requestId)?.replace(/^.*\/dist\//, 'dist/') ?? requestId}: ${errorText}`);
        });
        await app.cdp.command('Page.addScriptToEvaluateOnNewDocument', {
          source:
            `window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective ` +
            `+ ' ' + e.blockedURI + ' at ' + String(e.sourceFile).replace(/^.*\\/dist\\//, 'dist/') + ':' + e.lineNumber + ' ' + ` +
            `String(e.sample).slice(0, 80)));`,
        });
        await app.cdp.command('Page.reload');
        await app.until('the Welcome screen', async () => (await app.visible(css('[data-recent-project]'))) || undefined);
        // What the application does by itself before any plant exists: zod's `new Function('')` probe, refused and caught, is one.
        await app.eval(`window.__cspBaseline = window.__csp.slice()`);
      },
    },
  );
  const remote = [...new Set(requests.values())].filter((url) => !/^(file|data|blob|devtools):/.test(url));
  const cspTest = runChecked(['bun', 'test', 'electron/security.test.ts']);
  // The policy and its test are the ones of 2.0: since the tag only lines were added (the two methods the plant asks the native session
  // for).
  const sinceV2 = (() => {
    try {
      const counts = (file: string) => {
        const diff = execSync(`git diff v2.0.0 -- electron/${file}`, { cwd: packageRoot, encoding: 'utf8' }).split('\n');
        return { added: diff.filter((line) => /^\+(?!\+)/.test(line)).length, removed: diff.filter((line) => /^-(?!-)/.test(line)).length };
      };
      return { base: 'v2.0.0', 'security.ts': counts('security.ts'), 'security.test.ts': counts('security.test.ts') };
    } catch {
      return null;
    }
  })();
  const bundleTest = runChecked(['bun', 'test', 'scripts/welcomeBundle.test.ts']);
  const ok =
    live.webgl2 &&
    live.posture.require === 'undefined' &&
    live.posture.process === 'undefined' &&
    !live.sharedMemory &&
    live.cspViolations.length === 0 &&
    live.policyErrors.length === 0 &&
    remote.length === 0 &&
    cspTest.exitCode === 0 &&
    sinceV2 !== null &&
    sinceV2['security.ts'].removed === 0 &&
    sinceV2['security.test.ts'].removed === 0 &&
    bundleTest.exitCode === 0;
  return {
    ...live,
    requestsSeen: requests.size,
    failedRequests: failed,
    remoteRequests: remote,
    cspTest,
    securityChangesSinceV2: sinceV2,
    bundleTest,
    verdict: verdict(ok),
  };
}

const runners: Record<Sequence, () => Promise<Json>> = {
  capacity: capacitySequence,
  frames: framesSequence,
  latency: latencySequence,
  noGpu: noGpuSequence,
  contextLoss: contextLossSequence,
  keyboard: keyboardSequence,
  displayModes: displayModesSequence,
  security: securitySequence,
};

const git = (command: string) => execSync(`git ${command}`, { cwd: packageRoot, encoding: 'utf8' }).trim();
const started = new Date().toISOString();
const commit = git('rev-parse HEAD');
// The record being written is not a change of the code it measures.
const dirtyTree = git("status --porcelain -- ':/' ':(top,exclude)specs/012-zplc-2-1-plant-simulation/evidence'").length > 0;

const results: Record<string, Json> = {};
for (const name of sequences) {
  if (!smoke && !windowedAllowed && WINDOWED.includes(name)) {
    console.log(`sequence ${name}: skipped (it needs a real window with the GPU on: add --windowed and run it yourself)`);
    continue;
  }
  console.log(`sequence ${name} ...`);
  try {
    results[name] = { commit, ...(await runners[name]()) };
  } catch (error) {
    results[name] = { commit, verdict: 'error', error: error instanceof Error ? error.message : String(error) };
  }
  console.log(`sequence ${name}: ${String(results[name]!.verdict)}`);
}

const host = hostRecord({
  platform: process.platform,
  arch: process.arch,
  cpuModel: cpus()[0]?.model,
  gpu: knownGpu.value ?? linuxGpu(),
  memoryBytes: totalmem(),
  screen: knownGpu.screen,
});
if (smoke) {
  console.log(JSON.stringify({ smoke: true, sequences: results }, null, 2));
  process.exit(Object.values(results).every((result) => ['pass', 'fail'].includes(String(result.verdict))) ? 0 : 1);
}

mkdirSync(out, { recursive: true });
const file = join(out, recordFileName(host));
// A subset run keeps the sequences it did not run from an earlier record of this machine (each keeps its own commit).
const previous = existsSync(file)
  ? (JSON.parse(readFileSync(file, 'utf8')) as { sequences?: Record<string, Json>; host?: Record<string, unknown> })
  : {};
const merged: Record<string, Json> = { ...previous.sequences, ...results };
const record = buildRecord({
  commit,
  dirtyTree,
  started,
  finished: new Date().toISOString(),
  host: {
    ...host,
    gpu: knownGpu.value ?? (previous.host?.gpu as string | undefined) ?? host.gpu,
    screen: host.screen ?? (previous.host?.screen as typeof host.screen) ?? null,
  },
  sequences: merged,
});
const leaks = identityLeaks(record, [hostname(), userInfo().username, process.env.HOME ?? '']);
if (leaks.length > 0)
  throw new Error(`The record would name this machine's owner or host (${leaks.length} identity strings); it was not written.`);
writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
console.log(`wrote ${file}`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([name, value]) => [name, value.verdict])), null, 2));
process.exit(Object.values(results).every((result) => result.verdict === 'pass') ? 0 : 1);
