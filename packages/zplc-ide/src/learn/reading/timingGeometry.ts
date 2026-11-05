/** The geometry and the table rows of a timing diagram (LRN-041): pure, so the drawing and its tests share them. */
import type { TimingData } from '../readingTypes';

export const LABEL_W = 96;
export const PLOT_W = 560;
export const ROW_H = 36;
export const WAVE_H = 18;
export const TOP = 26;
export const PAD = 8;

/** The y of a level in the row `row`: high is the upper line. */
export const level = (row: number, high: boolean): number => TOP + row * ROW_H + (high ? 0 : WAVE_H) + 4;

/** The points of the waveform of one signal, as a step path from 0 to `span`. */
export function wavePath(edges: readonly number[], span: number, row: number): string {
  const x = (time: number): number => LABEL_W + (Math.min(Math.max(time, 0), span) / span) * PLOT_W;
  let high = false;
  let path = `M ${x(0)} ${level(row, false)}`;
  for (const edge of edges) {
    if (edge > span) break;
    path += ` H ${x(edge)} V ${level(row, !high)}`;
    high = !high;
  }
  return `${path} H ${x(span)}`;
}

/** The rows of the table equivalent: every signal's start at 0 ms, then each of its changes. */
export function timingRows(data: TimingData): Array<{ signal: string; time: number; value: boolean }> {
  return data.signals.flatMap((signal) => [
    { signal: signal.name, time: 0, value: false },
    ...signal.edges.map((time, index) => ({ signal: signal.name, time, value: index % 2 === 0 })),
  ]);
}
