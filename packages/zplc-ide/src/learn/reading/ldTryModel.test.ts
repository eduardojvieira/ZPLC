import { describe, expect, test } from 'bun:test';
import { stepTrace, traceTiming, type Trace } from './ldTryModel';

describe('timing trace of a run (LRN-041)', () => {
  const empty: Trace = { at: 0, last: {}, edges: {} };

  test('a signal starts FALSE and records an edge when it changes; an unread signal records nothing', () => {
    let trace = stepTrace(empty, 0, { Button: false, Lamp: undefined });
    trace = stepTrace(trace, 100, { Button: true, Lamp: undefined });
    trace = stepTrace(trace, 200, { Button: true, Lamp: true });
    trace = stepTrace(trace, 900, { Button: false, Lamp: true });
    expect(trace.edges).toEqual({ Button: [100, 900], Lamp: [200] });
    expect(trace.at).toBe(900);
  });

  test('a signal that is TRUE at the first sample has an edge at that time', () => {
    expect(stepTrace(empty, 0, { Button: true }).edges).toEqual({ Button: [0] });
  });

  test('is shown as timing data with a span that grows by whole seconds, at least 5 seconds, at most 60', () => {
    const trace = stepTrace(empty, 7300, { Button: true });
    expect(traceTiming(trace, ['Button', 'Lamp']).span).toBe(8000);
    expect(traceTiming(empty, ['Button']).span).toBe(5000);
    expect(traceTiming(stepTrace(empty, 90_000, {}), ['Button']).span).toBe(60_000);
    expect(traceTiming(trace, ['Button', 'Lamp']).signals).toEqual([
      { name: 'Button', edges: [7300] },
      { name: 'Lamp', edges: [] },
    ]);
  });
});
