/**
 * The lock-step session (R3, C6): the plant core and the PLC runtime on the runtime's virtual clock, one scan at a time.
 *
 * Order of one scan (the same as the graded run, `exchangeScan` of the scenario seam): the plant takes the commands of the
 * scan before, steps one scan interval, its sensors are written in one `memory.write`; then the runtime runs the scan
 * (`scenario.step`). The plant follows the runtime's *completed* scans, never a timestamp: a scan a breakpoint holds stays in
 * flight, the plant does not step again, and the continuation repeats the held `at_ms`.
 */
import { t } from '../../i18n';
import type { IoMap } from '../../runtime/ioMap';
import type { PlantMapV2 } from '../../plants/plantMap';
import type { PlantCore, PlantRuntimePort, PlantSession, PlantSessionEvent, PlantSessionState } from '../contracts';
import { exchangeOnce, planExchange } from './exchange';
import { createPacer, wait } from './pacing';

/**
 * What the session cannot do over the WASM adapter that it does over the native runtime (LNK-005). Empty: the same exchange, the
 * same virtual clock and the same trace (checked by `plantSessionNative.test.ts` when the module builds).
 */
export const PLANT_WASM_GAPS: readonly string[] = [];

export interface PlantSessionPorts {
  core: PlantCore;
  runtime: PlantRuntimePort & {
    /** Returns the runtime to idle (a native session leaves `scenario.step` paused); the session needs it to hand the clock back. */
    reset?(): Promise<void>;
  };
  map: PlantMapV2;
  /** The loaded program's I/O map: where each mapped signal lives in the images (an addition to contract C6, Task R3). */
  ioMap: IoMap;
  paceMs?: (ms: number) => Promise<void>;
  /** Wall clock in ms, for the slowdown measure; `performance.now` by default. */
  now?: () => number;
}

/** The contract's session plus the read-only counters the panel and the tests use. */
export interface PlantSessionHandle extends PlantSession {
  /** Scans the runtime completed in this run. */
  readonly scans: number;
  /** Scenario steps that came back with the scan held by a breakpoint. */
  readonly heldSteps: number;
  readonly scanMs: number;
  /** Resolves when no scan is in flight (after `pause`, `stop` or a fault). */
  settled(): Promise<void>;
}

export function createPlantSession(ports: PlantSessionPorts): PlantSessionHandle {
  const { core, runtime, map, ioMap } = ports;
  const pace = ports.paceMs ?? wait;
  const now = ports.now ?? (() => performance.now());
  const listeners = new Set<(event: PlantSessionEvent) => void>();
  let state: PlantSessionState = 'idle';
  let scanMs = 0;
  let scans = 0;
  let heldSteps = 0;
  let lastCycles = 0;
  /** The plant has stepped for the scan at `scans * scanMs` and the runtime has not completed it (a hold). */
  let exchanged = false;
  let loop: Promise<void> = Promise.resolve();
  let layout: ReturnType<typeof planExchange> | undefined;
  let pacer = createPacer(5);
  let clockVirtual = false;

  const emit = (event: PlantSessionEvent) => {
    for (const listener of [...listeners]) listener(event);
  };
  const setState = (next: PlantSessionState, reason?: string) => {
    if (state === next) return;
    state = next;
    emit(reason === undefined ? { kind: 'state', state } : { kind: 'state', state, reason });
  };
  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

  /** Binds the map, takes the virtual clock and reads the scan interval. Throws a located Error and leaves the session idle. */
  async function open(): Promise<void> {
    layout = planExchange(map, ioMap);
    const { scanIntervalMs } = await runtime.setClockMode('virtual');
    clockVirtual = true;
    if (!Number.isInteger(scanIntervalMs) || scanIntervalMs <= 0 || scanIntervalMs % core.stepMs !== 0) {
      await runtime.setClockMode('free').catch(() => undefined);
      clockVirtual = false;
      const step = core.stepMs;
      throw new Error(
        `plant: the scan interval of ${scanIntervalMs} ms is not a multiple of the plant step of ${step} ms; ` +
          `set the task interval to a multiple of ${step} ms`,
      );
    }
    scanMs = scanIntervalMs;
    pacer = createPacer(scanMs);
    scans = 0;
    heldSteps = 0;
    exchanged = false;
    lastCycles = (await runtime.getInfo()).cycles;
  }

  /** One scan: exchange (once), the runtime's step, then complete or hold. Returns false when a breakpoint held it. */
  async function scan(): Promise<boolean> {
    const atMs = scans * scanMs;
    const started = now();
    if (!exchanged) {
      await exchangeOnce(core, runtime, map, layout!, atMs, scanMs);
      exchanged = true;
    }
    await runtime.scenarioStep(atMs);
    const { cycles } = await runtime.getInfo();
    if (cycles === lastCycles) {
      // ponytail: unchanged cycles read as held; a multi-task step with no task due would read the same (breakpoints are refused there)
      heldSteps += 1;
      return false;
    }
    lastCycles = cycles;
    exchanged = false;
    scans += 1;
    const factor = pacer.record(now() - started);
    if (listeners.size > 0) emit({ kind: 'scan', scans, snapshot: core.snapshot() });
    if (factor !== undefined)
      emit({
        kind: 'slowdown',
        factor,
        message: factor < 1 ? t('plant.session.slowdown', { percent: Math.round(factor * 100) }) : t('plant.session.realtime'),
      });
    return true;
  }

  /** The plant takes no further step: it stays where the last scan left it, and the reason is the runtime's own message. */
  const fault = (error: unknown) => setState('faulted', message(error));

  let epoch = 0;
  function run(): void {
    const mine = ++epoch;
    const previous = loop;
    loop = (async () => {
      // a pause followed at once by a resume must not leave two loops: the new one waits for the old one to leave
      await previous;
      try {
        while (state === 'running' && mine === epoch) {
          const started = now();
          if (!(await scan())) {
            setState('held', 'the program is held at a breakpoint');
            return;
          }
          if (state === 'running' && mine === epoch) await pace(pacer.waitMs(now() - started));
        }
      } catch (error) {
        fault(error);
      }
    })();
  }

  async function close(): Promise<void> {
    await loop;
    exchanged = false;
    if (!clockVirtual) return;
    clockVirtual = false;
    await runtime.reset?.();
    await runtime.setClockMode('free');
  }

  const session: PlantSessionHandle = {
    get state() {
      return state;
    },
    get slowdown() {
      return pacer.slowdown;
    },
    get scans() {
      return scans;
    },
    get heldSteps() {
      return heldSteps;
    },
    get scanMs() {
      return scanMs;
    },
    settled: () => loop,
    async start() {
      if (state !== 'idle') throw new Error(`plant: cannot start a session that is ${state}; reset it first`);
      await open();
      setState('running');
      run();
    },
    pause() {
      if (state === 'running') setState('paused');
    },
    resume() {
      if (state !== 'paused' && state !== 'held') return;
      setState('running');
      run();
    },
    async step() {
      if (state === 'running') throw new Error('plant: pause the session before stepping');
      if (state === 'idle') {
        await open();
        state = 'paused';
        emit({ kind: 'state', state });
      }
      if (state !== 'paused' && state !== 'held') throw new Error(`plant: cannot step a session that is ${state}`);
      await loop;
      try {
        setState(((await scan()) ? 'paused' : 'held') as PlantSessionState, 'single step');
      } catch (error) {
        fault(error);
      }
    },
    async stop() {
      if (state === 'idle' || state === 'stopped') return;
      setState('stopped');
      await close();
    },
    async reset() {
      if (state !== 'idle') {
        if (state !== 'stopped') setState('stopped');
        await close();
      }
      core.reset();
      pacer.reset();
      scans = 0;
      heldSteps = 0;
      setState('idle');
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return session;
}
