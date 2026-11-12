import { NativeAdapter } from '../runtime/nativeAdapter';
import { compileGateProgram, IO, SCAN_MS } from './gateProgram';
import { loadJolt } from './jolt';
import { runLockStep, type GateAdapter } from './lockStep';
import { beltBox, driveStress, stress } from './scenes';
import { createView, type Quality } from './view';
import { createWorld, type GateWorld } from './world';

export interface StressResult { frames: number; medianFrameMs: number; worstSecondFps: number; stepMsP50: number; stepMsP95: number; stepMsMax: number; maxBacklogMs: number; realTimeFactor: number }
export interface LiveResult { hash: string; completedScans: number; exchangeMsP50: number; exchangeMsP95: number; exchangeMsMax: number; realTimeFactor: number; pausedHeld: boolean }
export interface PlantGate {
  probe(): Promise<{ jolt: boolean; webgl2: boolean; gpu: string; cspViolations: string[] }>;
  runStress(options: { seconds: number; quality: Quality; view: boolean }): Promise<StressResult>;
  runLive(options: { steps: number; realTime: boolean }): Promise<LiveResult>;
}

const WARM_UP_MS = 5000;
const cspViolations: string[] = [];
document.addEventListener('securitypolicyviolation', (event) => cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`));

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const now = () => performance.now();
function percentile(sorted: number[], p: number): number {
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
const sortedCopy = (values: number[]) => [...values].sort((a, b) => a - b);

async function probe() {
  let webgl2 = false;
  let gpu = 'unavailable';
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (gl !== null) {
    webgl2 = true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(gl.getParameter(info !== null ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  let jolt = false;
  try {
    await loadJolt();
    jolt = true;
  } catch {
    jolt = false;
  }
  return { jolt, webgl2, gpu, cspViolations: [...cspViolations] };
}

async function runStress(options: { seconds: number; quality: Quality; view: boolean }): Promise<StressResult> {
  const scene = stress();
  const world = createWorld(await loadJolt(), scene);
  let canvas: HTMLCanvasElement | null = null;
  let view: ReturnType<typeof createView> | null = null;
  if (options.view) {
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;right:0;width:50vw;height:100vh;pointer-events:none;z-index:2147483647';
    document.body.appendChild(canvas);
    view = createView(canvas, world, scene, options.quality);
  }
  const stepMs: number[] = [];
  const frameTimes: number[] = [];
  let maxBacklogMs = 0;
  let running = true;
  const t0 = now();
  const frame = (t: number) => {
    if (!running) return;
    view?.render();
    if (t0 + WARM_UP_MS <= t) frameTimes.push(t);
    requestAnimationFrame(frame);
  };
  if (view !== null) requestAnimationFrame(frame);

  let simMs = 0;
  let scan = 0;
  let measuredFrom = -1;
  let measuredSimFrom = 0;
  const end = options.seconds * 1000 + WARM_UP_MS;
  while (now() - t0 < end) {
    const wall = now() - t0;
    // ponytail: at most 5 steps per tick so rendering is not starved; a host slower than that shows as backlog
    for (let n = 0; n < 5 && simMs + SCAN_MS <= wall; n += 1) {
      driveStress(world, scan);
      const s = now();
      world.step(SCAN_MS);
      const cost = now() - s;
      simMs += SCAN_MS;
      scan += 1;
      if (wall >= WARM_UP_MS) {
        if (measuredFrom < 0) { measuredFrom = wall; measuredSimFrom = simMs - SCAN_MS; }
        stepMs.push(cost);
      }
    }
    if (wall >= WARM_UP_MS) maxBacklogMs = Math.max(maxBacklogMs, wall - simMs);
    await nextTick();
  }
  running = false;
  const wallMeasured = now() - t0 - (measuredFrom < 0 ? WARM_UP_MS : measuredFrom);
  const realTimeFactor = wallMeasured > 0 ? (simMs - measuredSimFrom) / wallMeasured : 0;
  view?.dispose();
  canvas?.remove();
  world.dispose();

  const deltas = frameTimes.slice(1).map((t, i) => t - frameTimes[i]);
  const perSecond = new Map<number, number>();
  for (const t of frameTimes) {
    const second = Math.floor((t - t0 - WARM_UP_MS) / 1000);
    perSecond.set(second, (perSecond.get(second) ?? 0) + 1);
  }
  const wholeSeconds = Math.floor(options.seconds);
  const counts: number[] = [];
  for (let s = 0; s < wholeSeconds; s += 1) counts.push(perSecond.get(s) ?? 0);
  const sortedSteps = sortedCopy(stepMs);
  return {
    frames: frameTimes.length,
    medianFrameMs: percentile(sortedCopy(deltas), 0.5),
    worstSecondFps: counts.length === 0 ? 0 : Math.min(...counts),
    stepMsP50: percentile(sortedSteps, 0.5),
    stepMsP95: percentile(sortedSteps, 0.95),
    stepMsMax: sortedSteps[sortedSteps.length - 1] ?? 0,
    maxBacklogMs,
    realTimeFactor,
  };
}

async function runLive(options: { steps: number; realTime: boolean }): Promise<LiveResult> {
  const adapter = new NativeAdapter();
  const world: GateWorld = createWorld(await loadJolt(), beltBox());
  const exchange: number[] = [];
  let exchangeStart = 0;
  let pausedHeld = false;
  let pausedMs = 0;
  let wallStart = 0;
  try {
    await adapter.connect();
    await adapter.loadProgram(compileGateProgram().zplcFile);
    // The exchange time is the wall time of steps 2 to 5: from the end of `gate` to the end of the output read.
    const timed: GateAdapter = {
      pokeN: (...args) => adapter.pokeN(...args),
      scenarioStep: (...args) => adapter.scenarioStep(...args),
      getInfo: () => adapter.getInfo(),
      peek: async (...args) => {
        const bytes = await adapter.peek(...args);
        if (args[0] === IO.belt.address) exchange.push(now() - exchangeStart);
        return bytes;
      },
    };
    wallStart = now();
    const result = await runLockStep({
      adapter: timed,
      world,
      steps: options.steps,
      startPulse: { from: 10, to: 15 },
      gate: async (step) => {
        if (step === 200) {
          const cyclesBefore = (await adapter.getInfo()).cycles;
          const timeBefore = world.timeMs;
          const p = now();
          await wait(500);
          pausedMs += now() - p;
          pausedHeld = (await adapter.getInfo()).cycles === cyclesBefore && world.timeMs === timeBefore;
        }
        exchangeStart = now();
      },
      pace: options.realTime
        ? async (step) => {
            const due = wallStart + pausedMs + (step + 1) * SCAN_MS;
            const delay = due - now();
            if (delay > 0) await wait(delay);
          }
        : undefined,
    });
    const wall = now() - wallStart - pausedMs;
      const sorted = sortedCopy(exchange);
      return {
        hash: result.hash,
        completedScans: result.completedScans,
        exchangeMsP50: percentile(sorted, 0.5),
        exchangeMsP95: percentile(sorted, 0.95),
        exchangeMsMax: sorted[sorted.length - 1] ?? 0,
        realTimeFactor: wall > 0 ? (result.completedScans * SCAN_MS) / wall : 0,
        pausedHeld,
      };
  } finally {
    world.dispose();
    await adapter.disconnect().catch(() => undefined);
  }
}

export const plantGate: PlantGate = { probe, runStress, runLive };
