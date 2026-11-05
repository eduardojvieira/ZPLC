/**
 * The timing chart of a try-it lab run (LRN-041): the edges of the signals so far, and the chart they make. Pure, with no
 * React and no store.
 */
import type { TimingData } from '../readingTypes';

/** The edges of each signal so far, in milliseconds from the start of the run. A signal starts FALSE. */
export interface Trace {
  at: number;
  last: Record<string, boolean>;
  edges: Record<string, number[]>;
}

const MIN_SPAN_MS = 5000;
const MAX_SPAN_MS = 60_000;
const MAX_EDGES = 200;

/** The trace after a poll at `at` ms; a signal that was not read adds nothing. Past the longest chart nothing is added. */
export function stepTrace(trace: Trace, at: number, values: Readonly<Record<string, boolean | undefined>>): Trace {
  const last = { ...trace.last };
  const edges = { ...trace.edges };
  if (at <= MAX_SPAN_MS)
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined || value === (last[name] ?? false)) continue;
      last[name] = value;
      edges[name] = [...(edges[name] ?? []), at].slice(-MAX_EDGES);
    }
  return { at, last, edges };
}

/** The chart of a trace: it grows by whole seconds from 5 s to 60 s (ponytail: the first minute of a run, then it stops growing). */
export function traceTiming(trace: Trace, names: readonly string[]): TimingData {
  const span = Math.min(MAX_SPAN_MS, Math.max(MIN_SPAN_MS, Math.ceil(trace.at / 1000) * 1000));
  return { span, signals: names.map((name) => ({ name, edges: trace.edges[name] ?? [] })) };
}
