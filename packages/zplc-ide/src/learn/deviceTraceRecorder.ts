/**
 * The device-trace recorder of the hardware check (LRN-024): when the board keeps a per-scan trace of its I/O images
 * (`src/runtime/deviceTrace.ts`), the check grades that trace instead of reading the board over serial every 100 ms, so each
 * sample is one scan of the program at the time the board latched it.
 *
 * Start alignment ("arm, then the learner presses Run"): with `awaitRun`, the trace is armed while the program is stopped and
 * the learner starts it from the toolbar; the first scan of the run (scan number 1) becomes scenario time 0, as in
 * simulation, and samples before it are dropped. A second start restarts the recording from the new run. Without
 * `awaitRun` (the program was already running) the first sample read is time 0, as the polling recorder does.
 *
 * LRN-015: like the polling recorder it only reads. The trace's arm, read and clear never write PLC memory, force, or start or
 * stop the program, and its session type names none of those operations. The learner presses Run; this module never does.
 */
import type { DeviceTrace, DeviceTraceSample } from '../runtime/deviceTrace';
import { DEVICE_TRACE_READ_MAX } from '../runtime/deviceTrace';
import { MEMORY_MAP, type WatchVariable } from '../runtime/debugAdapter';
import type { HardwareSample } from './hardwareCheck';
import type { RecordOptions, Recording, RecorderSession } from './hardwareRecorder';

/** Which bytes of the images a trace keeps for the lesson's signals, and how a sample becomes the signals' values. */
export interface TraceLayout { inBytes: number; outBytes: number; valuesOf(sample: DeviceTraceSample): HardwareSample['values'] }

/**
 * The layout for the variables, or null when one is not a BOOL of the input or output image or lies past what a sample
 * holds: the check reads BOOL signals only (`lessonWatchVariables`), and anything else is recorded by polling.
 */
export function traceLayoutOf(variables: readonly WatchVariable[], maxIoBytes: number): TraceLayout | null {
  const placed: Array<{ name: string; image: 'in' | 'out'; offset: number; mask: number }> = [];
  let inBytes = 0;
  let outBytes = 0;
  for (const variable of variables) {
    const { ipi, opi } = MEMORY_MAP;
    const image = variable.address >= ipi.baseAddress && variable.address < ipi.baseAddress + ipi.size ? 'in'
      : variable.address >= opi.baseAddress && variable.address < opi.baseAddress + opi.size ? 'out' : null;
    if (image === null || variable.type !== 'BOOL') return null;
    const offset = variable.address - (image === 'in' ? ipi.baseAddress : opi.baseAddress);
    if (image === 'in') inBytes = Math.max(inBytes, offset + 1); else outBytes = Math.max(outBytes, offset + 1);
    placed.push({ name: variable.name, image, offset, mask: 1 << (variable.bitOffset ?? 0) });
  }
  if (placed.length === 0 || inBytes > maxIoBytes || outBytes > maxIoBytes) return null;
  return {
    inBytes, outBytes,
    valuesOf: (sample) => Object.fromEntries(placed.map(({ name, image, offset, mask }) =>
      [name, ((image === 'in' ? sample.inputs : sample.outputs)[offset]! & mask) !== 0])),
  };
}

export interface DeviceRecordOptions extends RecordOptions {
  /** Wait for the learner to press Run: the first scan of the run is time 0. */
  awaitRun: boolean;
}

/** As many samples as a scenario trace may hold. */
const MAX_SAMPLES = 10_000;

/**
 * Records the lesson's signals from the device trace. Resolves null when the device keeps no trace or the signals do not fit
 * one, so the caller records by polling instead; otherwise the recording, `anchored` when time 0 is the start of the run.
 */
export async function recordDeviceTrace(session: Pick<RecorderSession, 'connected' | 'state'>, trace: DeviceTrace, variables: readonly WatchVariable[],
  options: DeviceRecordOptions): Promise<(Recording & { anchored: boolean }) | null> {
  let layout: TraceLayout | null = null;
  try {
    const status = await trace.status();
    layout = status.available ? traceLayoutOf(variables, status.maxIoBytes) : null;
    if (layout) await trace.arm(0, layout.inBytes, layout.outBytes);
  } catch {
    return null;
  }
  if (!layout) return null;
  const anchored = options.awaitRun;
  const samples: HardwareSample[] = [];
  let next = 0;
  let zeroUs: number | null = null;
  const start = options.now();
  const done = (result: Recording) => ({ ...result, anchored });
  try {
    for (;;) {
      if (!session.connected) return done({ ok: false, reason: samples.length > 0 ? 'session-ended' : 'not-connected', trace: samples });
      if (session.state !== 'running' && !(anchored && samples.length === 0)) {
        return done(samples.length > 0 ? { ok: false, reason: 'session-ended', trace: samples } : { ok: false, reason: 'not-running', trace: samples });
      }
      let chunk;
      try { chunk = await trace.read(next, DEVICE_TRACE_READ_MAX); } catch { return done({ ok: false, reason: 'read-failed', trace: samples }); }
      // The ring overwrote samples this reader had not read: the run has a hole and cannot be graded.
      if (chunk.from > next && (zeroUs !== null || !anchored)) return done({ ok: false, reason: 'read-failed', trace: samples });
      for (const sample of chunk.samples) {
        if (anchored && sample.batch === 1) { zeroUs = sample.tUs; samples.length = 0; }
        if (zeroUs === null) { if (anchored) continue; zeroUs = sample.tUs; }
        samples.push({ atMs: Math.round((sample.tUs - zeroUs) / 1000), values: layout.valuesOf(sample) });
      }
      next = chunk.next;
      if (chunk.samples.length > 0 && samples.length > 0) options.onSample?.(samples);
      const elapsed = options.now() - start;
      if (options.signal?.aborted || samples.length >= MAX_SAMPLES || elapsed > options.durationMs) return done({ ok: true, trace: samples });
      if (chunk.samples.length < DEVICE_TRACE_READ_MAX) await options.wait(options.intervalMs);
      if (options.signal?.aborted) return done({ ok: true, trace: samples });
    }
  } finally {
    await trace.clear().catch(() => undefined);
  }
}
