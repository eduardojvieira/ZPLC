/**
 * The shape of the plant bench record and the rules that judge it (VIS-004, PLT-014, PLT-015), kept apart from the script that
 * drives the application so that they can be tested with no window. A record names the machine by platform, architecture, CPU and
 * GPU; it never carries a host name, a user name or a path.
 */
export const RECORD_SCHEMA = 'zplc.plant-bench/1';

/** The spec's numbers (60 typical and never below 30 at 1920x1080; editor 100 ms p95) and the plan's step bound. A miss is a finding. */
export const THRESHOLDS = {
  /** A frame at the 60 fps rate, with the margin of a 16.7 ms frame: the median interval of a run. */
  typicalFrameMs: 17.5,
  minFps: 30,
  editorP95Ms: 100,
  stepP95Ms: 8,
  realTimeFactor: 1,
} as const;

export type Verdict = 'pass' | 'fail';
export type Json = Record<string, unknown>;
const verdictOf = (pass: boolean): Verdict => (pass ? 'pass' : 'fail');

/** Nearest-rank percentile. An empty sample has no percentile: it is an error, never zero. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new RangeError('A percentile needs at least one sample.');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}

export interface Summary {
  samples: number;
  p50: number;
  p95: number;
  max: number;
}
export const summarise = (values: readonly number[]): Summary => ({
  samples: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: Math.max(...values),
});

export interface RawHost {
  platform: string;
  arch: string;
  cpuModel: string | undefined;
  gpu: string | null | undefined;
  memoryBytes: number;
  screen: { width: number; height: number; refreshHz: number } | null;
}
export interface HostRecord {
  platform: string;
  arch: string;
  cpu: string;
  gpu: string;
  memoryGb: number;
  screen: { width: number; height: number; refreshHz: number } | null;
}
export const hostRecord = (raw: RawHost): HostRecord => ({
  platform: raw.platform,
  arch: raw.arch,
  cpu: raw.cpuModel?.trim() || 'unknown',
  gpu: raw.gpu?.trim() || 'unavailable',
  memoryGb: Math.round(raw.memoryBytes / 2 ** 30),
  screen: raw.screen,
});
export const recordFileName = (host: Pick<HostRecord, 'platform' | 'arch'>): string => `bench-${host.platform}-${host.arch}.json`;

/** The identities (host name, user name) found in the text of a record: none may be there. */
export function identityLeaks(record: unknown, identities: readonly string[]): string[] {
  const text = JSON.stringify(record);
  return identities.filter((identity) => identity.length > 0 && text.includes(identity));
}

export interface FrameStats {
  frames: number;
  medianFrameMs: number;
  worstSecondFps: number;
  meanFps: number;
}
/** From the timestamps of the frames of one run, in ms. The worst second counts the frames of each whole second of the run. */
export function frameStats(timestamps: readonly number[]): FrameStats {
  if (timestamps.length < 2) throw new RangeError('A frame run needs at least two frames.');
  const first = timestamps[0]!;
  const span = timestamps[timestamps.length - 1]! - first;
  const intervals = timestamps.slice(1).map((time, i) => time - timestamps[i]!);
  const seconds = Math.floor(span / 1000);
  if (seconds < 1) throw new RangeError('A frame run needs at least one whole second.');
  const perSecond = new Array<number>(seconds).fill(0);
  for (const time of timestamps) {
    const bucket = Math.floor((time - first) / 1000);
    if (bucket < seconds) perSecond[bucket]! += 1;
  }
  return {
    frames: timestamps.length,
    medianFrameMs: percentile(intervals, 0.5),
    worstSecondFps: Math.min(...perSecond),
    meanFps: (timestamps.length - 1) / (span / 1000),
  };
}
export const frameVerdict = (stats: Pick<FrameStats, 'medianFrameMs' | 'worstSecondFps'>): Verdict =>
  verdictOf(stats.medianFrameMs <= THRESHOLDS.typicalFrameMs && stats.worstSecondFps >= THRESHOLDS.minFps);

/** Passes only when every key press was measured: a short sample cannot vouch for the 95th percentile. */
export const editorLatencyVerdict = (r: { keys: number; expectedKeys: number; p95Ms: number }): Verdict =>
  verdictOf(r.keys === r.expectedKeys && r.p95Ms <= THRESHOLDS.editorP95Ms);

export const stepVerdict = (r: { p95Ms: number; realTimeFactor: number }): Verdict =>
  verdictOf(r.p95Ms < THRESHOLDS.stepP95Ms && r.realTimeFactor > THRESHOLDS.realTimeFactor);

export function buildRecord(input: {
  commit: string;
  dirtyTree: boolean;
  started: string;
  finished: string;
  host: HostRecord;
  sequences: Record<string, Json>;
}) {
  return {
    schema: RECORD_SCHEMA,
    commit: input.commit,
    dirtyTree: input.dirtyTree,
    started: input.started,
    finished: input.finished,
    host: input.host,
    sequencesRun: Object.keys(input.sequences),
    sequences: input.sequences,
  };
}
