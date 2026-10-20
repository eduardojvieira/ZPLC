// The hardware check of a lesson (LRN-024, LRN-026): the reference scenario evaluated on a trace recorded from a board, with the
// lesson's tolerances, aligned on the input events the learner produced by hand. Every trace here is SYNTHETIC: it is built by
// the helper below to look like what a board would report, and no board was involved in these tests.
import { describe, expect, it } from 'bun:test';

import { parseGradeRecord } from '../../electron/learnProgressModel';
import { alignEvents, evaluateHardwareTrace, hardwareGradeRecordOf, traceSha256Of, type HardwareSample } from './hardwareCheck';
import type { ScenarioFile } from './lessonPackage';

const TOLERANCES = { timeMs: 200, analogPercent: 5 };
const HASH = 'a'.repeat(64);

/** A motor start/stop lesson: Start pressed at 500 ms and released at 700 ms, Stop pressed at 2000 ms. */
const SCENARIO: ScenarioFile = {
  schemaVersion: 1, id: 'motor-hw', tickMs: 100, durationMs: 3000,
  events: [
    { atMs: 0, set: { Start: false, Stop: false } },
    { atMs: 500, set: { Start: true } },
    { atMs: 700, set: { Start: false } },
    { atMs: 2000, set: { Stop: true } },
  ],
  expectations: [
    { kind: 'AT', atMs: 0, condition: { Motor: false } },
    { kind: 'WITHIN', fromMs: 500, withinMs: 100, condition: { Motor: true } },
    { kind: 'FOR', fromMs: 800, forMs: 1000, condition: { Motor: true } },
    { kind: 'RISING', fromMs: 500, withinMs: 100, condition: { Motor: true } },
    { kind: 'WITHIN', fromMs: 2000, withinMs: 100, condition: { Motor: false } },
  ],
};

interface Script { pressAt: number; releaseAt: number; stopAt: number | null; motorDelay: number; endAt: number; glitchAt?: number }

/** A SYNTHETIC trace polled every 50 ms: the learner's buttons, and a motor that follows them after `motorDelay`. */
function syntheticTrace({ pressAt, releaseAt, stopAt, motorDelay, endAt, glitchAt }: Script): HardwareSample[] {
  const samples: HardwareSample[] = [];
  for (let atMs = 0; atMs <= endAt; atMs += 50) {
    const running = atMs >= pressAt + motorDelay && (stopAt === null || atMs < stopAt + motorDelay) && atMs !== glitchAt;
    samples.push({ atMs, values: { Start: atMs >= pressAt && atMs < releaseAt, Stop: stopAt !== null && atMs >= stopAt, Motor: running } });
  }
  return samples;
}

const LATE_LEARNER: Script = { pressAt: 3200, releaseAt: 3500, stopAt: 6000, motorDelay: 50, endAt: 7000 };

describe('the hardware check aligns the scenario on the input events the learner made (LRN-024)', () => {
  it('LRN-024 finds each scenario input event at the first sample, after the previous one, that holds what the event sets', () => {
    expect(alignEvents(SCENARIO, syntheticTrace(LATE_LEARNER))).toEqual([0, 3200, 3500, 6000]);
    // An event the learner never made is not observed, and neither is any event after it.
    expect(alignEvents(SCENARIO, syntheticTrace({ ...LATE_LEARNER, stopAt: null }))).toEqual([0, 3200, 3500, null]);
  });

  it('LRN-024 passes a program whose outputs follow the learner\'s presses within the lesson tolerance, however late the presses were', () => {
    const result = evaluateHardwareTrace(SCENARIO, syntheticTrace(LATE_LEARNER), TOLERANCES, HASH);
    expect(result).toEqual({ track: 'hardware', passed: true, assertions: { total: 5, passed: 5 }, failures: [] });
  });

  it('LRN-024 holds a reaction exactly at the tolerance and refuses one a sample beyond it', () => {
    // WITHIN 500..600 ms on the scenario is 3200..3300 ms in this trace; the tolerance stretches it to 3500 ms.
    expect(evaluateHardwareTrace(SCENARIO, syntheticTrace({ ...LATE_LEARNER, motorDelay: 300 }), TOLERANCES, HASH).failures.map((failure) => failure.index)).not.toContain(1);
    expect(evaluateHardwareTrace(SCENARIO, syntheticTrace({ ...LATE_LEARNER, motorDelay: 350 }), TOLERANCES, HASH).failures.map((failure) => failure.index)).toContain(1);
  });

  it('LRN-024 is deterministic: the same trace and tolerances give the same result', () => {
    const trace = syntheticTrace({ ...LATE_LEARNER, motorDelay: 400 });
    expect(evaluateHardwareTrace(SCENARIO, trace, TOLERANCES, HASH)).toEqual(evaluateHardwareTrace(SCENARIO, trace, TOLERANCES, HASH));
  });
});

describe('a failed hardware check says which assertion, when, what was expected and what was observed (LRN-026)', () => {
  it('LRN-026 reports a late reaction with the time in the trace, the expected and observed values and the sample it read', () => {
    const trace = syntheticTrace({ ...LATE_LEARNER, motorDelay: 400 });
    const result = evaluateHardwareTrace(SCENARIO, trace, TOLERANCES, HASH);
    expect(result.passed).toBe(false);
    const late = result.failures.find((failure) => failure.index === 1)!;
    // The window closes at 3500 ms (3300 + 200): the last sample in it is the one reported.
    const cursor = trace.findIndex((sample) => sample.atMs === 3500);
    expect(late).toEqual({
      index: 1, kind: 'WITHIN', atMs: 3500, expected: { Motor: true }, observed: { Motor: false },
      trace: { scenarioId: 'motor-hw', traceSha256: HASH, cursor, atMs: 3500, uri: `zplc://runtime/snapshot/motor-hw/${cursor}/${HASH}` },
    });
  });

  it('LRN-026 reports the sample at which a FOR assertion stopped holding', () => {
    // FOR 800..1800 ms on the scenario is 3600..4600 ms in this trace; a sample may sit 200 ms either way, so it must hold over 3800..4400 ms.
    const result = evaluateHardwareTrace(SCENARIO, syntheticTrace({ ...LATE_LEARNER, glitchAt: 4000 }), TOLERANCES, HASH);
    expect(result.failures.map(({ index, kind, atMs, observed }) => ({ index, kind, atMs, observed }))).toEqual([{ index: 2, kind: 'FOR', atMs: 4000, observed: { Motor: false } }]);
    expect(evaluateHardwareTrace(SCENARIO, syntheticTrace({ ...LATE_LEARNER, glitchAt: 4500 }), TOLERANCES, HASH).passed).toBe(true);
  });

  it('LRN-026 fails, with nothing observed, every assertion that depends on an input event the learner never made', () => {
    const result = evaluateHardwareTrace(SCENARIO, syntheticTrace({ ...LATE_LEARNER, stopAt: null }), TOLERANCES, HASH);
    expect(result.assertions).toEqual({ total: 5, passed: 4 });
    expect(result.failures).toEqual([{ index: 4, kind: 'WITHIN', atMs: null, expected: { Motor: false }, observed: { Motor: null }, trace: null }]);
  });

  it('LRN-026 fails a check on an empty trace instead of passing it', () => {
    const result = evaluateHardwareTrace(SCENARIO, [], TOLERANCES, HASH);
    expect(result.passed).toBe(false);
    expect(result.assertions.passed).toBe(0);
  });
});

describe('the grade of a hardware check is labelled a hardware run (LRN-024)', () => {
  it('LRN-024 records the run with track "hardware", and the progress store accepts the record', async () => {
    const trace = syntheticTrace(LATE_LEARNER);
    const traceSha256 = await traceSha256Of(trace);
    expect(traceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await traceSha256Of(syntheticTrace(LATE_LEARNER))).toBe(traceSha256);
    const record = hardwareGradeRecordOf({
      lessonId: 'motor-start-stop-safe', lessonVersion: 2, scenario: SCENARIO, scenarioSha256: 'b'.repeat(64), programSha256: 'c'.repeat(64),
      runtimeVersion: '2.0.0', time: new Date('2026-10-20T10:00:00.000Z'), trace, traceSha256, tolerances: TOLERANCES,
    });
    expect(record).toMatchObject({ track: 'hardware', result: 'passed', scenarioId: 'motor-hw', assertions: { total: 5, passed: 5 }, failedAssertions: [] });
    expect(parseGradeRecord(record)).toEqual(record);
    const failed = hardwareGradeRecordOf({
      lessonId: 'motor-start-stop-safe', lessonVersion: 2, scenario: SCENARIO, scenarioSha256: 'b'.repeat(64), programSha256: 'c'.repeat(64),
      runtimeVersion: '2.0.0', time: new Date('2026-10-20T10:00:00.000Z'), trace: syntheticTrace({ ...LATE_LEARNER, stopAt: null }), traceSha256, tolerances: TOLERANCES,
    });
    expect(failed).toMatchObject({ track: 'hardware', result: 'failed', assertions: { total: 5, passed: 4 } });
    expect(parseGradeRecord(failed)).toEqual(failed);
  });
});
