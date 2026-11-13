/**
 * @file boardPlantLink.ts
 * @brief The real-time loop that feeds a board from the plant over the device link (C-M6-3, LNK-003, LNK-007, LNK-014).
 *
 * Plant I/O mode is a physical operation (LNK-008, LNK-009): this controller never starts by itself, and only a person's
 * command may call `start`. The plant side of every exchange is `exchangeScan` of the scenario seam, so a scene behaves the
 * same as in simulation. The plant follows the wall clock: each exchange advances the core by the whole multiples of its
 * step that have elapsed, never skipping one (there is no virtual clock against a board).
 */
import type { IoMap } from '../../runtime/ioMap';
import type { PlantMapV2 } from '../../plants/plantMap';
import { exchangeScan } from '../../test-engine/scenePort';
import type { PlantCore } from '../contracts';
import { planExchange } from '../session/exchange';
import { descriptorsOf, packValues, unpackValues, valueBytes, type SlotValue } from './frameCodec';
import { createLatencyStats, pulseWarningOf, type PulseWarning } from './latency';
import type { PlantBoardPort, PlantExitReasonName } from './portTypes';
import type { FirmwareProtocol } from '../../runtime/link/firmwareProtocol';
import { plantIoSupport } from './support';

export type PlantIoPhase = 'unsupported' | 'idle' | 'entering' | 'active' | 'leaving' | 'left';

export interface PlantIoSnapshot {
  phase: PlantIoPhase;
  /** When phase is `left`. */
  reason?: PlantExitReasonName;
  /** When phase is `unsupported` (LNK-012, LRN-011). */
  unsupported?: { en: string; es: string };
  mirror: boolean;
  rttMs: { last: number; p50: number; p95: number; max: number };
  gapMs: { last: number; worst: number };
  /** Scans the board ran without a new frame (it grows whenever the scan rate is above the frame rate). */
  late: number;
  rejected: number;
  frames: number;
  pulseWarning?: PulseWarning;
}

export interface PlantIoController {
  readonly snapshot: () => PlantIoSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  /** Only a person's command calls this (rule G7). */
  start(): Promise<void>;
  setMirror(on: boolean): Promise<void>;
  stop(): Promise<void>;
}

export interface PlantIoPorts {
  link: PlantBoardPort;
  core: PlantCore;
  map: PlantMapV2;
  ioMap: IoMap;
  scanMs: number;
  /** One exchange every `frameMs`; a multiple of `core.stepMs`. */
  frameMs: number;
  timeoutMs: number;
  /** The scene's shortest sensor pulse (SCN-007), for the LNK-014 warning. */
  shortestPulseMs?: number;
  /** What the firmware said about itself, for the located reason when it cannot be fed; none reads as the text shell only. */
  firmware?: () => FirmwareProtocol | null;
  now?: () => number;
  pace?: (ms: number) => Promise<void>;
}

class ResponseTimeout extends Error {}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ResponseTimeout(`no response within ${ms} ms`)), ms);
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error)),
    );
  });
}

export function createPlantIoController(ports: PlantIoPorts): PlantIoController {
  const { link, core, map, ioMap } = ports;
  const now = ports.now ?? (() => performance.now());
  const pace = ports.pace ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const listeners = new Set<() => void>();
  const stats = createLatencyStats(200);
  const live = { phase: (link.supported() ? 'idle' : 'unsupported') as PlantIoPhase, reason: undefined as PlantExitReasonName | undefined };
  const counters = { mirror: false, late: 0, rejected: 0, frames: 0 };
  let session: { over: boolean; done: Promise<void> } | null = null;
  let unlisten: (() => void) | null = null;

  const unsupportedReason = (): { en: string; es: string } => {
    const support = plantIoSupport(ports.firmware?.() ?? null);
    return support.supported ? { en: '', es: '' } : support.reason;
  };

  const build = (): PlantIoSnapshot => {
    const latency = stats.snapshot();
    const warning = pulseWarningOf(ports.shortestPulseMs, latency.gapMs.worst, ports.scanMs);
    return {
      phase: live.phase,
      ...(live.reason === undefined ? {} : { reason: live.reason }),
      ...(live.phase === 'unsupported' ? { unsupported: unsupportedReason() } : {}),
      ...counters,
      ...latency,
      ...(warning ? { pulseWarning: warning } : {}),
    };
  };
  let current = build();
  const publish = () => {
    current = build();
    listeners.forEach((listener) => listener());
  };

  const leave = (reason: PlantExitReasonName) => {
    if (live.phase === 'left') return;
    if (session) session.over = true;
    unlisten?.();
    unlisten = null;
    counters.mirror = false;
    Object.assign(live, { phase: 'left', reason });
    publish();
  };

  async function loop(layout: ReturnType<typeof planExchange>, plantId: number, state: NonNullable<typeof session>) {
    const sensors: Record<string, SlotValue> = Object.fromEntries(layout.sensors.map((s) => [s.name, s.type === 'BOOL' ? false : 0]));
    const writeSensors = async (sensed: Record<string, SlotValue>) => void Object.assign(sensors, sensed);
    const step = core.stepMs;
    // The first exchange has no commands yet (as the first scan of a graded run): it only produces the first sensors.
    await exchangeScan(
      { core, map },
      async (point) => (layout.commands.find((c) => c.point === point)!.type === 'BOOL' ? false : 0),
      writeSensors,
      0,
      step,
    );
    const origin = now();
    let simulated = 0;
    let seq = 0;
    let lastAnswer: number | undefined;
    let nextAt = origin;
    while (!state.over) {
      seq = (seq + 1) >>> 0;
      const sentAt = now();
      try {
        const answer = await within(
          link.frame(
            plantId,
            seq,
            packValues(
              layout.sensors,
              layout.sensors.map((s) => sensors[s.name]!),
            ),
          ),
          ports.timeoutMs,
        );
        if (state.over) return;
        const at = now();
        stats.record(at - sentAt, lastAnswer === undefined ? undefined : at - lastAnswer);
        lastAnswer = at;
        counters.frames++;
        counters.late = answer.late;
        counters.rejected = answer.rejected;
        counters.mirror = (answer.flags & 1) !== 0;
        const values = unpackValues(layout.commands, answer.values);
        const byPoint = new Map(layout.commands.map((c, i) => [c.point, values[i]!]));
        const due = Math.floor((at - origin - simulated) / step) * step;
        if (due > 0) {
          await exchangeScan({ core, map }, async (point) => byPoint.get(point)!, writeSensors, simulated, due);
          simulated += due;
        }
        publish();
      } catch (error) {
        if (state.over) return;
        leave(error instanceof ResponseTimeout ? 'TIMEOUT' : 'PROTOCOL');
        void within(link.exit(), ports.timeoutMs).catch(() => {});
        return;
      }
      nextAt += ports.frameMs;
      const wait = nextAt - now();
      if (wait > 0) await pace(wait);
      else nextAt = now();
    }
  }

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      if (live.phase === 'entering' || live.phase === 'active' || live.phase === 'leaving') return;
      if (!link.supported()) {
        Object.assign(live, { phase: 'unsupported', reason: undefined });
        publish();
        return;
      }
      const layout = planExchange(map, ioMap);
      if (layout.sensors.length + layout.commands.length === 0) throw new Error('plant: no signal is mapped to the program');
      const { inputs, outputs } = descriptorsOf(layout);
      Object.assign(live, { phase: 'entering', reason: undefined });
      Object.assign(counters, { mirror: false, late: 0, rejected: 0, frames: 0 });
      publish();
      const state = { over: false, done: Promise.resolve() };
      session = state;
      unlisten = link.onExit((event) => leave(event.reason));
      try {
        const grant = await link.enter({ timeoutMs: ports.timeoutMs, inputs, outputs });
        if (grant.inBytes !== valueBytes(inputs) || grant.outBytes !== valueBytes(outputs)) {
          void link.exit().catch(() => {});
          throw new Error('plant: the board granted a frame size that does not match the entry');
        }
        if (state.over) return; // the device left while the entry was answered
        Object.assign(live, { phase: 'active' });
        publish();
        state.done = loop(layout, grant.plantId, state).catch(() => leave('FAULT'));
      } catch (error) {
        unlisten?.();
        unlisten = null;
        if ((live.phase as PlantIoPhase) === 'entering') Object.assign(live, { phase: 'idle' });
        publish();
        throw error;
      }
    },
    async setMirror(on) {
      if (live.phase !== 'active') throw new Error('plant: mirror needs an active plant I/O mode');
      counters.mirror = await link.mirror(on);
      publish();
    },
    async stop() {
      if (live.phase !== 'active' || !session) return;
      const state = session;
      state.over = true;
      live.phase = 'leaving';
      publish();
      await state.done;
      try {
        const result = await link.exit();
        Object.assign(counters, { late: result.late, rejected: result.rejected });
        leave(result.reason);
      } catch (error) {
        leave('FAULT');
        throw error;
      }
    },
  };
}
