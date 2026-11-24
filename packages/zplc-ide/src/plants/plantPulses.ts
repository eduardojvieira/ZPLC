/**
 * @file plantPulses.ts
 * @brief The shortest sensor pulse of the four 2.0 plants (SCN-007), for the board latency rule (LNK-014, R-M6-8).
 *
 * A scene declares its pulse; the 2.0 plants have none, so it is measured: plantPulses.test.ts runs the graded scenario of
 * every lesson on these plants with its reference solution and takes the shortest whole pulse of any plant sensor. No
 * scenario, hash or grade changes (P4, PLT-013).
 */
import type { PlantKind } from './plantEngine';

/** In ms; plantPulses.test.ts fails when a graded trace gives another value. */
export const PLANT_PULSES: Readonly<Record<PlantKind, number>> = {
  'motor-v1': 20,
  'conveyor-v1': 10,
  'tank-v1': 20,
  'pedestrian-v1': 60,
};

/**
 * The shortest run of `true` of any `…Input` signal of a graded trace's plant samples, in ms, counting only runs with a
 * `false` sample before and after them (a run cut by the start or the end of the trace has an unknown length).
 */
export function shortestPulseMs(samples: readonly Readonly<Record<string, unknown>>[], tickMs: number): number | undefined {
  let shortest: number | undefined;
  const sensors = Object.keys(samples[0] ?? {}).filter((key) => key.endsWith('Input'));
  for (const sensor of sensors) {
    let run = 0;
    let rose = false;
    samples.forEach((sample, index) => {
      if (sample[sensor] === true) {
        if (run === 0) rose = index > 0;
        run++;
      } else {
        if (run > 0 && rose) shortest = Math.min(shortest ?? Infinity, run * tickMs);
        run = 0;
      }
    });
  }
  return shortest;
}
