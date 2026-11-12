/**
 * Host pacing of the lock-step session (R3, PLT-016, PLT-017). Pacing only decides how long the host waits between scans; it
 * never touches the plant or the runtime, so it cannot change the trace.
 */
export const SLOWDOWN_WINDOW = 20;
export const MIN_SLOWDOWN = 0.1;
const SLOW_ABOVE = 0.9;

export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface Pacer {
  /** Records the wall ms a completed scan cost (exchange, plant step, scan). Returns the new slowdown factor when it changed. */
  record(costMs: number): number | undefined;
  readonly slowdown: number;
  /** Wall ms to wait after a scan that cost `costMs`: the scan period at the current slowdown, minus what the scan took. */
  waitMs(costMs: number): number;
  reset(): void;
}

/**
 * When the mean cost of the last 20 scans is above 0.9 of the scan interval, both sides are slowed together to
 * `scanMs / mean` (at least 0.1) in steps of 0.05; when it falls below, back to 1. No scan is ever skipped.
 */
export function createPacer(scanMs: number): Pacer {
  let costs: number[] = [];
  let slowdown = 1;
  return {
    get slowdown() {
      return slowdown;
    },
    record(costMs) {
      costs.push(costMs);
      if (costs.length > SLOWDOWN_WINDOW) costs.shift();
      if (costs.length < SLOWDOWN_WINDOW) return undefined;
      const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
      const next = mean > SLOW_ABOVE * scanMs ? Math.min(1, Math.max(MIN_SLOWDOWN, Math.round((scanMs / mean) * 20) / 20)) : 1;
      if (next === slowdown) return undefined;
      slowdown = next;
      return next;
    },
    waitMs: (costMs) => Math.max(0, scanMs / slowdown - costMs),
    reset() {
      costs = [];
      slowdown = 1;
    },
  };
}
