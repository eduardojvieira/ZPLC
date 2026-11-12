/**
 * Plant gate bench (spike, never merged): drives the packaged, unpacked Studio over the DevTools protocol and writes one JSON
 * record per machine. Sequences: probe (check 6), live (check 4), stress (check 3), latency (check 7), noGpu (P14).
 *
 *   bun scripts/plant-gate/bench.ts --out <dir> [--sequences probe,live,stress,latency,noGpu]
 *
 * Sequences 1 to 4 open a real 1920x1080 window with the GPU on; sequence 5 is headless. Exit 0 when every sequence that ran passed.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { translate } from '../../src/i18n/translate';
import { GRADED_HASH } from '../../src/plant-gate/gateProgram';
import { css, launchPackagedApp, type App } from '../journeyApp';
import { discoverPackagedExecutable } from '../run-packaged-desktop-smoke';

const packageRoot = join(import.meta.dir, '..', '..');
const ALL = ['probe', 'live', 'stress', 'latency', 'noGpu'] as const;
type Sequence = (typeof ALL)[number];
type Quality = 'low' | 'medium';
type Json = Record<string, unknown>;

// What window.__zplcPlantGate() resolves to (Task 6); the bench only reads these fields.
interface Probe {
  jolt: boolean;
  webgl2: boolean;
  gpu: string;
  cspViolations: string[];
}
interface Stress {
  frames: number;
  medianFrameMs: number;
  worstSecondFps: number;
  stepMsP50: number;
  stepMsP95: number;
  stepMsMax: number;
  maxBacklogMs: number;
  realTimeFactor: number;
}
interface Live {
  hash: string;
  completedScans: number;
  exchangeMsP50: number;
  exchangeMsP95: number;
  exchangeMsMax: number;
  realTimeFactor: number;
  pausedHeld: boolean;
}

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}
const out = arg('out');
if (!out) throw new Error('Usage: bun scripts/plant-gate/bench.ts --out <dir> [--sequences <comma list>]');
const requested = (arg('sequences') ?? ALL.join(',')).split(',').map((name) => name.trim());
for (const name of requested)
  if (!(ALL as readonly string[]).includes(name)) throw new Error(`Unknown sequence ${name}; use ${ALL.join(', ')}.`);
const sequences = ALL.filter((name) => requested.includes(name));

const executable = discoverPackagedExecutable(process.env.ZPLC_PACKAGED_DIST ?? join(packageRoot, 'dist-electron'));
const GPU_FLAGS = ['--window-size=1920,1080'];
const NO_GPU_FLAGS = ['--headless', '--disable-gpu'];

/** Nearest-rank percentile. */
const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;
};

/**
 * Starts a gate call in the page and polls for its result: one DevTools command times out after 30 s, a stress run lasts longer.
 * `call` is a method call on the gate, such as `probe()`.
 */
async function start(app: App, slot: string, call: string): Promise<() => Promise<unknown>> {
  await app.eval(
    `(() => { const w = window; w.__bench = w.__bench || {}; w.__bench[${JSON.stringify(slot)}] = undefined; ` +
      `w.__zplcPlantGate().then((g) => g.${call}).then((v) => { w.__bench[${JSON.stringify(slot)}] = { ok: v }; }, ` +
      `(e) => { w.__bench[${JSON.stringify(slot)}] = { err: String(e && e.stack || e) }; }); return true; })()`,
  );
  return async () => {
    const result = await app.until(
      `gate call ${call}`,
      () => app.eval<{ ok?: unknown; err?: string } | undefined>(`window.__bench[${JSON.stringify(slot)}]`),
      180_000,
    );
    if (result.err) throw new Error(`${call}: ${result.err}`);
    return result.ok;
  };
}
const call = async <T>(app: App, slot: string, expression: string): Promise<T> =>
  (await start(app, slot, expression).then((wait) => wait())) as T;

/** A packaged application on a private profile, the gate switched on. `project` seeds the recent projects. */
async function withApp<T>(flags: string[], project: string[], body: (app: App) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'zplc-plant-gate-'));
  const launched = await launchPackagedApp(executable, root, project, flags, { ZPLC_PLANT_GATE: '1' });
  try {
    // A real window keeps its real size; the headless one is laid out as the journeys do.
    if (flags.includes('--window-size=1920,1080')) await launched.app.cdp.command('Emulation.clearDeviceMetricsOverride');
    return await body(launched.app);
  } finally {
    await launched.stop();
    rmSync(root, { recursive: true, force: true });
  }
}

const host: Json = {
  platform: process.platform,
  arch: process.arch,
  cpu: cpus()[0]?.model.trim() ?? 'unknown',
  memoryGb: Math.round(totalmem() / 2 ** 30),
  gpu: null,
  screen: null,
};

async function recordHost(app: App, probe: Probe, gpuOn: boolean): Promise<void> {
  if (host.gpu === null || (gpuOn && host.gpuEnabled !== true)) {
    host.gpu = probe.gpu;
    host.gpuEnabled = gpuOn;
  }
  if (host.screen !== null || !gpuOn) return;
  host.screen = await app.eval(
    `new Promise((resolve) => { const stamps = []; const tick = (t) => { stamps.push(t); if (stamps.length < 61) requestAnimationFrame(tick); else ` +
      `resolve({ width: screen.width, height: screen.height, refreshHz: Math.round(60000 / (stamps[60] - stamps[0])) }); }; requestAnimationFrame(tick); })`,
  );
}

const verdict = (pass: boolean): 'pass' | 'fail' => (pass ? 'pass' : 'fail');

async function probeSequence(): Promise<Json> {
  return withApp(GPU_FLAGS, [], async (app) => {
    const probe = await call<Probe>(app, 'probe', 'probe()');
    await Bun.sleep(1_000);
    const consoleErrors = [...new Set([...app.errors, ...app.cdp.errors])];
    const policyErrors = consoleErrors.filter((message) => message.includes('Content Security Policy'));
    await recordHost(app, probe, true);
    return {
      ...probe,
      consoleErrors,
      verdict: verdict(probe.jolt && probe.webgl2 && probe.cspViolations.length === 0 && policyErrors.length === 0),
    };
  });
}

async function liveSequence(): Promise<Json> {
  return withApp(GPU_FLAGS, [], async (app) => {
    const short = await call<Live>(app, 'live1', 'runLive({ steps: 800, realTime: true })');
    const long = await call<Live>(app, 'live2', 'runLive({ steps: 6000, realTime: true })');
    const pass =
      short.hash === GRADED_HASH && short.pausedHeld && long.pausedHeld && short.realTimeFactor >= 0.99 && long.realTimeFactor >= 0.99;
    return { gradedHash: GRADED_HASH, hashMatchesGraded: short.hash === GRADED_HASH, short, long, verdict: verdict(pass) };
  });
}

async function stressSequence(): Promise<Json> {
  return withApp(GPU_FLAGS, [], async (app) => {
    const result: Json = {};
    const passes: Record<Quality, boolean> = { low: false, medium: false };
    for (const quality of ['medium', 'low'] as const) {
      const run = await call<Stress>(
        app,
        `stress-${quality}`,
        `runStress({ seconds: 65, quality: ${JSON.stringify(quality)}, view: true })`,
      );
      passes[quality] = run.medianFrameMs <= 17.5 && run.worstSecondFps >= 30 && run.realTimeFactor >= 0.995 && run.maxBacklogMs <= 50;
      result[quality] = { ...run, verdict: verdict(passes[quality]) };
    }
    // The machine passes when `low` passes (VIS-005); `medium` is recorded.
    return { ...result, verdict: verdict(passes.low) };
  });
}

/** Opens the example project and a Structured Text file the way the packaged journeys do, and puts the focus in the code editor. */
async function openEditor(app: App): Promise<void> {
  await app.click(css('[data-recent-project] > button'), 'the recent project');
  await app.until('the project workbench', async () => (await app.visible(css('[role="toolbar"]'))) || undefined);
  await app.click(css('[data-activity="project"]'), 'the Project activity of the rail');
  await app.click(css(`[aria-label=${JSON.stringify(translate('en', 'navigator.mode.label'))}] button:nth-of-type(2)`), 'the Files mode');
  await app.until('src folder', async () => (await app.visible(css('[role="treeitem"][data-tree-node-id="dir:src"]'))) || undefined);
  if (await app.eval(`document.querySelector('[role="treeitem"][data-tree-node-id="dir:src"]').getAttribute('aria-expanded') === 'false'`))
    await app.click(css('[role="treeitem"][data-tree-node-id="dir:src"]'), 'the src folder');
  await app.click(css('[role="treeitem"][data-tree-node-id="file:src/main.st"]'), 'main.st');
  await app.until('main.st in the editor', async () => (await app.visible(css('.monaco-editor .view-lines'))) || undefined);
  await app.click(css('.monaco-editor .view-lines'), 'the code editor');
  await app.press('Ctrl+End');
  await app.eval(`document.querySelector('.monaco-editor textarea')?.focus(); document.activeElement?.tagName === 'TEXTAREA'`);
}

/** Types `count` characters, one every `periodMs`, through the protocol; returns the sample of each key press as the plan defines it. */
async function typeAndSample(app: App, count: number, periodMs: number): Promise<number[]> {
  await app.eval(
    `(() => { const w = window; w.__keys = []; w.__events = []; addEventListener('keydown', (e) => w.__keys.push(e.timeStamp), true); ` +
      `new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__events.push({ name: e.name, startTime: e.startTime, duration: e.duration }); })` +
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

async function latencySequence(): Promise<Json> {
  const project = mkdtempSync(join(tmpdir(), 'zplc-plant-gate-project-'));
  cpSync(join(packageRoot, 'projects', 'blinky_st'), project, { recursive: true });
  try {
    const measure = (plant: boolean) =>
      withApp(GPU_FLAGS, [project], async (app) => {
        await openEditor(app);
        let finish: (() => Promise<unknown>) | undefined;
        if (plant) {
          finish = await start(app, 'plant', 'runStress({ seconds: 70, quality: "low", view: true })');
          await Bun.sleep(6_000); // past the 5 s warm-up of the stress run
        }
        const samples = await typeAndSample(app, 500, 100);
        await finish?.();
        return { keys: samples.length, p50Ms: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95), maxMs: Math.max(...samples) };
      });
    const baseline = await measure(false);
    const withPlant = await measure(true);
    return { baseline, withPlant, verdict: verdict(withPlant.keys === 500 && withPlant.p95Ms <= 100) };
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

async function noGpuSequence(): Promise<Json> {
  return withApp(NO_GPU_FLAGS, [], async (app) => {
    const probe = await call<Probe>(app, 'probe', 'probe()');
    await recordHost(app, probe, false);
    const live = await call<Live>(app, 'live', 'runLive({ steps: 800, realTime: false })');
    // The hash must equal the graded one whatever webgl2 says (P14).
    return {
      probe,
      live,
      gradedHash: GRADED_HASH,
      hashMatchesGraded: live.hash === GRADED_HASH,
      verdict: verdict(live.hash === GRADED_HASH),
    };
  });
}

const runners: Record<Sequence, () => Promise<Json>> = {
  probe: probeSequence,
  live: liveSequence,
  stress: stressSequence,
  latency: latencySequence,
  noGpu: noGpuSequence,
};

const git = (command: string) => execSync(`git ${command}`, { cwd: packageRoot, encoding: 'utf8' }).trim();
const started = new Date().toISOString();
const commit = git('rev-parse HEAD');
const dirtyTree = git('status --porcelain').length > 0;
mkdirSync(resolve(out), { recursive: true });
const file = join(resolve(out), `bench-${process.platform}-${process.arch}.json`);

// A subset run keeps the sequences it did not run from an earlier record of this machine (each keeps its own commit).
const previous: Json = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Json) : {};
const results: Json = {};
for (const name of sequences) {
  console.log(`sequence ${name} ...`);
  try {
    results[name] = { commit, ...(await runners[name]()) };
  } catch (error) {
    results[name] = { commit, verdict: 'error', error: error instanceof Error ? error.message : String(error) };
  }
  console.log(`sequence ${name}: ${(results[name] as Json).verdict}`);
}

const record: Json = {
  schema: 'zplc.plant-gate-bench/1',
  commit,
  dirtyTree,
  started,
  finished: new Date().toISOString(),
  host,
  sequencesRun: sequences,
  ...Object.fromEntries(ALL.filter((name) => previous[name] !== undefined).map((name) => [name, previous[name]])),
  ...results,
};
writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
console.log(`wrote ${file}`);
console.log(JSON.stringify(results, null, 2));
process.exit(sequences.every((name) => (results[name] as Json).verdict === 'pass') ? 0 : 1);
