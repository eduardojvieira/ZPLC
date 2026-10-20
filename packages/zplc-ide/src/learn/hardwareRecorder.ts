/**
 * The recorder of the hardware check (LRN-024): it reads the lesson's inputs and outputs from the board at a fixed interval,
 * through the watch path of the debug adapter (`readWatchVariables`, what the Watch table polls), and returns the trace that
 * `hardwareCheck.ts` evaluates.
 *
 * LRN-015: the session is one the learner connected, deployed and started with the usual controls. The recorder only reads.
 * It refuses a session that is not connected or not running, it stops when the session stops, and it never connects,
 * deploys, starts, stops, forces or writes: its session type does not even name those operations.
 */
import type { IDebugAdapter, WatchVariable } from '../runtime/debugAdapter';
import type { HardwareSample } from './hardwareCheck';

/** All the recorder may use of a session: whether it is connected, its state, and the watch read. */
export type RecorderSession = Pick<IDebugAdapter, 'connected' | 'state' | 'readWatchVariables'>;

export interface RecordOptions {
  /** The longest recording, in ms; the learner normally ends it sooner through `signal`. */
  durationMs: number;
  intervalMs: number;
  now(): number;
  wait(ms: number): Promise<void>;
  /** Aborted when the learner says the run is done. */
  signal?: AbortSignal;
}

export type Recording =
  | { ok: true; trace: HardwareSample[] }
  | { ok: false; reason: 'not-connected' | 'not-running' | 'session-ended' | 'read-failed'; trace: HardwareSample[] };

/** As many samples as a scenario trace may hold. */
const MAX_SAMPLES = 10_000;

function valuesOf(read: readonly WatchVariable[]): HardwareSample['values'] {
  const values: HardwareSample['values'] = {};
  for (const variable of read) {
    if (variable.type === 'BOOL' && (typeof variable.value === 'boolean' || typeof variable.value === 'number')) values[variable.name] = variable.value === true || (typeof variable.value === 'number' && variable.value !== 0);
    else if (typeof variable.value === 'number') values[variable.name] = variable.value;
  }
  return values;
}

export async function recordHardwareTrace(session: RecorderSession, variables: readonly WatchVariable[], options: RecordOptions): Promise<Recording> {
  const trace: HardwareSample[] = [];
  const start = options.now();
  for (;;) {
    if (!session.connected || session.state !== 'running') {
      if (trace.length > 0) return { ok: false, reason: 'session-ended', trace };
      return { ok: false, reason: session.connected ? 'not-running' : 'not-connected', trace };
    }
    let read: WatchVariable[];
    try { read = await session.readWatchVariables(variables.map((variable) => ({ ...variable }))); } catch { return { ok: false, reason: 'read-failed', trace }; }
    const elapsed = options.now() - start;
    trace.push({ atMs: Math.round(elapsed), values: valuesOf(read) });
    if (options.signal?.aborted || trace.length >= MAX_SAMPLES || elapsed + options.intervalMs > options.durationMs) return { ok: true, trace };
    await options.wait(options.intervalMs);
    if (options.signal?.aborted) return { ok: true, trace };
  }
}
