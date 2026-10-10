import { describe, expect, it } from 'bun:test';

import { describeExpectation, describeFailure, failedAssertionsOf, gradeRecordOf, snapshotUri } from './gradeRecord';
import { parseGradeRecord } from '../../electron/learnProgressModel';
import type { ScenarioFile } from './lessonPackage';

const TRACE = 'e'.repeat(64);
const scenario: ScenarioFile = {
  schemaVersion: 1, id: 'Motor', tickMs: 10, durationMs: 60, events: [],
  expectations: [
    { kind: 'AT', atMs: 20, condition: { 'Motor.Forward': true } },
    { kind: 'FOR', fromMs: 30, forMs: 20, condition: { 'Motor.Forward': true, 'Motor.Reverse': false } },
    { kind: 'NEVER', condition: { 'Motor.Reverse': true } },
  ],
};
const trace = Array.from({ length: 7 }, (_, index) => ({ atMs: index * 10, outputs: { 'Motor.Forward': index >= 3 && index < 5, 'Motor.Reverse': false } }));

describe('failed assertions of a lesson check (LRN-026)', () => {
  it('reports which assertion failed, when, what was expected, what was observed and where in the trace', () => {
    const failures = failedAssertionsOf(scenario, [{ kind: 'AT', passed: false, atMs: 20 }, { kind: 'FOR', passed: false, atMs: 50 }, { kind: 'NEVER', passed: true }], trace, TRACE);
    expect(failures).toEqual([
      { index: 0, kind: 'AT', atMs: 20, expected: { 'Motor.Forward': true }, observed: { 'Motor.Forward': false },
        trace: { scenarioId: 'Motor', traceSha256: TRACE, cursor: 2, atMs: 20, uri: `zplc://runtime/snapshot/Motor/2/${TRACE}` } },
      { index: 1, kind: 'FOR', atMs: 50, expected: { 'Motor.Forward': true, 'Motor.Reverse': false }, observed: { 'Motor.Forward': false, 'Motor.Reverse': false },
        trace: { scenarioId: 'Motor', traceSha256: TRACE, cursor: 5, atMs: 50, uri: `zplc://runtime/snapshot/Motor/5/${TRACE}` } },
    ]);
  });

  it('says nothing is observed where the samples it was given do not hold the instant, and still addresses it by its index in the trace', () => {
    const [failure] = failedAssertionsOf(scenario, [{ kind: 'AT', passed: false, atMs: 20 }, { kind: 'FOR', passed: true }, { kind: 'NEVER', passed: true }], trace.slice(0, 2), TRACE);
    expect(failure).toMatchObject({ index: 0, atMs: 20, observed: { 'Motor.Forward': null }, trace: { cursor: 2, atMs: 20 } });
    // An instant that is not a tick of the scenario is on no trace.
    expect(failedAssertionsOf(scenario, [{ kind: 'AT', passed: false, atMs: 25 }, { kind: 'FOR', passed: true }, { kind: 'NEVER', passed: true }], trace, TRACE)[0]).toMatchObject({ atMs: 25, trace: null });
  });

  it('describes an expectation the way a learner reads it', () => {
    expect(describeExpectation(scenario.expectations[0]!)).toBe('AT 20 ms: Motor.Forward = true');
    expect(describeExpectation(scenario.expectations[1]!)).toBe('FOR 30 to 50 ms: Motor.Forward = true, Motor.Reverse = false');
    expect(describeExpectation(scenario.expectations[2]!)).toBe('NEVER: Motor.Reverse = true');
    expect(snapshotUri('Motor', 2, TRACE)).toBe(`zplc://runtime/snapshot/Motor/2/${TRACE}`);
  });

  it('writes a failure as one sentence in either language', () => {
    const [failure] = failedAssertionsOf(scenario, [{ kind: 'AT', passed: false, atMs: 20 }, { kind: 'FOR', passed: true }, { kind: 'NEVER', passed: true }], trace, TRACE);
    expect(describeFailure(failure!, scenario.expectations[0], 'en')).toBe('AT 20 ms: Motor.Forward = true · at 20 ms expected Motor.Forward = true; observed Motor.Forward = false');
    expect(describeFailure(failure!, scenario.expectations[0], 'es')).toBe('AT 20 ms: Motor.Forward = true · a 20 ms se esperaba Motor.Forward = true; se observó Motor.Forward = false');
    expect(describeFailure({ ...failure!, observed: { 'Motor.Forward': null }, atMs: null }, undefined, 'en')).toBe('AT · expected Motor.Forward = true; observed Motor.Forward = unknown');
  });
});

describe('grade record (LRN-023)', () => {
  const base = { lessonId: 'motor-start-stop-safe', lessonVersion: 3, scenarioSha256: 'a'.repeat(64), programSha256: 'b'.repeat(64), runtimeVersion: '1.2.3', time: new Date('2026-10-10T12:00:00.000Z') };

  it('records the lesson id and version, scenario hash, program hash, runtime version and time of a pass', () => {
    const record = gradeRecordOf({ ...base, scenario, assertions: scenario.expectations.map((expectation) => ({ kind: expectation.kind, passed: true })), trace, traceSha256: TRACE });
    expect(record).toEqual({
      schemaVersion: 1, lessonId: 'motor-start-stop-safe', lessonVersion: 3, scenarioId: 'Motor', scenarioSha256: 'a'.repeat(64), programSha256: 'b'.repeat(64),
      runtimeVersion: '1.2.3', time: '2026-10-10T12:00:00.000Z', result: 'passed', assertions: { total: 3, passed: 3 }, failedAssertions: [],
    });
    expect(parseGradeRecord(record)).toEqual(record);
  });

  it('is a function of the program and the scenario: two grades differ only by their time', () => {
    const input = { ...base, scenario, assertions: [{ kind: 'AT', passed: false, atMs: 20 }, { kind: 'FOR', passed: true }, { kind: 'NEVER', passed: true }], trace, traceSha256: TRACE };
    const first = gradeRecordOf(input);
    const second = gradeRecordOf({ ...input, time: new Date('2026-10-11T08:30:00.000Z') });
    expect(first.result).toBe('failed');
    expect(first.assertions).toEqual({ total: 3, passed: 2 });
    expect({ ...second, time: first.time }).toEqual(first);
    expect(second.time).not.toBe(first.time);
    expect(parseGradeRecord(first)).toEqual(first);
  });
});
