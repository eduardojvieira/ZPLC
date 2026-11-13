import { describe, expect, it } from 'bun:test';

import { createLatencyStats, pulseWarningOf } from './latency';

describe('latency statistics', () => {
  it('reports last, p50, p95 and max of the round trips and the worst gap over a scripted trace', () => {
    const stats = createLatencyStats(200);
    for (let i = 1; i <= 100; i++) stats.record(i, i === 1 ? undefined : i * 2);
    const snap = stats.snapshot();
    expect(snap.rttMs).toEqual({ last: 100, p50: 50, p95: 95, max: 100 });
    expect(snap.gapMs).toEqual({ last: 200, worst: 200 });
  });

  it('keeps a rolling window: old extremes leave it', () => {
    const stats = createLatencyStats(200);
    stats.record(900, 900);
    for (let i = 0; i < 200; i++) stats.record(10, 20);
    const snap = stats.snapshot();
    expect(snap.rttMs.max).toBe(10);
    expect(snap.gapMs.worst).toBe(20);
  });

  it('is zero before the first exchange', () => {
    expect(createLatencyStats().snapshot()).toEqual({ rttMs: { last: 0, p50: 0, p95: 0, max: 0 }, gapMs: { last: 0, worst: 0 } });
  });

  it('warns only when the pulse is shorter than the worst gap plus one scan (R-M6-8)', () => {
    expect(pulseWarningOf(100, 40, 10)).toBeUndefined();
    expect(pulseWarningOf(50, 40, 10)).toBeUndefined();
    expect(pulseWarningOf(49, 40, 10)).toEqual({ sceneMs: 49, worstGapMs: 40, scanMs: 10 });
    expect(pulseWarningOf(undefined, 400, 10)).toBeUndefined();
  });
});
