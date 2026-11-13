/**
 * @file latency.ts
 * @brief Round trip and exchange gap statistics of the plant link (LNK-014, R-M6-8), over a rolling window.
 */

export interface LatencySnapshot {
  rttMs: { last: number; p50: number; p95: number; max: number };
  gapMs: { last: number; worst: number };
}

export interface PulseWarning {
  sceneMs: number;
  worstGapMs: number;
  scanMs: number;
}

const percentile = (sorted: readonly number[], p: number): number =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;

export function createLatencyStats(window = 200) {
  const rtt: number[] = [];
  const gaps: number[] = [];
  const push = (list: number[], value: number) => {
    list.push(value);
    if (list.length > window) list.shift();
  };
  return {
    /** `gapMs` is absent for the first exchange of a run. */
    record(rttMs: number, gapMs?: number): void {
      push(rtt, rttMs);
      if (gapMs !== undefined) push(gaps, gapMs);
    },
    snapshot(): LatencySnapshot {
      const sorted = [...rtt].sort((a, b) => a - b);
      return {
        rttMs: { last: rtt.at(-1) ?? 0, p50: percentile(sorted, 50), p95: percentile(sorted, 95), max: sorted.at(-1) ?? 0 },
        gapMs: { last: gaps.at(-1) ?? 0, worst: Math.max(0, ...gaps) },
      };
    },
  };
}

/** R-M6-8: a scene is safe on a transport when `shortestPulseMs >= worstGapMs + scanMs`. */
export function pulseWarningOf(sceneMs: number | undefined, worstGapMs: number, scanMs: number): PulseWarning | undefined {
  return sceneMs !== undefined && sceneMs < worstGapMs + scanMs ? { sceneMs, worstGapMs, scanMs } : undefined;
}
