import { describe, expect, it } from 'bun:test';

import {
  emptyProgress,
  exportProgress,
  mergeProgress,
  migrateLegacyMastery,
  parseGradeRecord,
  parseImport,
  parseProgress,
  passedLessonIds,
  serializeProgress,
  withGrade,
  withNote,
  withPassedIds,
  type GradeRecord,
} from './learnProgressModel';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

export function grade(overrides: Partial<GradeRecord> = {}): GradeRecord {
  return {
    schemaVersion: 1, lessonId: 'motor-start-stop-safe', lessonVersion: 1, track: 'simulation', scenarioId: 'MotorStartStop', scenarioSha256: HASH_A, programSha256: HASH_B,
    runtimeVersion: '1.0.0', time: '2026-10-10T12:00:00.000Z', result: 'passed', assertions: { total: 27, passed: 27 }, failedAssertions: [], ...overrides,
  };
}

const failed = (): GradeRecord => grade({
  result: 'failed', assertions: { total: 27, passed: 26 },
  failedAssertions: [{ index: 3, kind: 'AT', atMs: 20, expected: { 'Motor.Forward': true }, observed: { 'Motor.Forward': false }, trace: { scenarioId: 'MotorStartStop', traceSha256: HASH_A, cursor: 2, atMs: 20, uri: `zplc://runtime/snapshot/MotorStartStop/2/${HASH_A}` } }],
});

describe('the Learn progress document (LRN-031, LRN-032)', () => {
  it('round-trips through its canonical text and rejects every inexact shape', () => {
    const progress = withGrade(withNote(emptyProgress(), { lessonId: 'edge-counter-pulses', hint: 2 }, '2026-10-10T11:00:00.000Z'), grade());
    const text = serializeProgress(progress);
    expect(parseProgress(text)).toEqual(progress);
    expect(serializeProgress(parseProgress(text)!)).toBe(text);

    const document = JSON.parse(text) as Record<string, unknown>;
    for (const broken of [
      { ...document, extra: 1 },
      { ...document, schemaVersion: 1 },
      { ...document, last: { lessonId: 'Not An Id', at: '2026-10-10T11:00:00.000Z' } },
      { ...document, lessons: { 'motor-start-stop-safe': { state: 'passed', grade: null, passedAt: null, startedAt: null, hintsUsed: 3, solutionShown: false } } },
      // An own key named __proto__ (an object literal would set the prototype instead).
      { ...document, lessons: Object.fromEntries([['__proto__', { state: 'passed', grade: null, passedAt: null, startedAt: null, hintsUsed: 0, solutionShown: false }]]) },
      { ...document, lessons: { 'edge-counter-pulses': { state: 'in-progress', grade: grade({ lessonId: 'edge-counter-pulses' }), passedAt: null, startedAt: null, hintsUsed: 0, solutionShown: false } } },
    ]) expect(parseProgress(JSON.stringify(broken))).toBeUndefined();
    expect(parseProgress('{')).toBeUndefined();
    expect(parseProgress('x'.repeat(300 * 1024))).toBeUndefined();
  });

  it('accepts a grade record only when it is exactly one and says the same thing twice', () => {
    expect(parseGradeRecord(grade())).toEqual(grade());
    expect(parseGradeRecord(failed())).toEqual(failed());
    expect(parseGradeRecord({ ...grade(), extra: true })).toBeUndefined();
    expect(parseGradeRecord(grade({ time: '2026-10-10 12:00' }))).toBeUndefined();
    expect(parseGradeRecord(grade({ programSha256: 'xyz' }))).toBeUndefined();
    expect(parseGradeRecord(grade({ track: 'bench' as 'simulation' }))).toBeUndefined();
    // A pass that lists a failed assertion, a pass that did not pass them all, and a failure that failed nothing are forgeries.
    expect(parseGradeRecord(grade({ failedAssertions: failed().failedAssertions }))).toBeUndefined();
    expect(parseGradeRecord(grade({ assertions: { total: 27, passed: 26 } }))).toBeUndefined();
    expect(parseGradeRecord(grade({ result: 'failed' }))).toBeUndefined();
    // A trace link must be the address of the sample it names.
    const bad = failed();
    bad.failedAssertions[0]!.trace!.uri = `zplc://runtime/snapshot/MotorStartStop/9/${HASH_A}`;
    expect(parseGradeRecord(bad)).toBeUndefined();
  });

  it('migrates the file of the first release and keeps lessons it does not know', () => {
    const migrated = migrateLegacyMastery('{"schemaVersion":1,"mastered":["motor-start-stop-safe","a-lesson-of-a-newer-build"]}')!;
    expect(passedLessonIds(migrated)).toEqual(['a-lesson-of-a-newer-build', 'motor-start-stop-safe']);
    expect(migrated.lessons['motor-start-stop-safe']).toEqual({ state: 'passed', grade: null, passedAt: null, startedAt: null, hintsUsed: 0, solutionShown: false });
    for (const raw of ['{"schemaVersion":1,"mastered":["x"]}', '{"schemaVersion":1,"mastered":["motor-start-stop-safe","motor-start-stop-safe"]}', '{"schemaVersion":2,"mastered":[]}', '{"schemaVersion":1,"mastered":[],"x":1}', '[]']) {
      expect(migrateLegacyMastery(raw)).toBeUndefined();
    }
  });

  it('merges commutatively and idempotently, newest passing grade first', () => {
    const older = withGrade(emptyProgress(), grade({ time: '2026-10-09T09:00:00.000Z', programSha256: HASH_A }));
    const newer = withGrade(withNote(emptyProgress(), { lessonId: 'motor-start-stop-safe', hint: 1 }, '2026-10-10T08:00:00.000Z'), grade({ time: '2026-10-10T12:00:00.000Z', programSha256: HASH_B }));
    const other = withPassedIds(emptyProgress(), ['edge-counter-pulses']);
    const left = mergeProgress(mergeProgress(older, newer), other);
    const right = mergeProgress(other, mergeProgress(newer, older));
    expect(serializeProgress(left)).toBe(serializeProgress(right));
    expect(serializeProgress(mergeProgress(left, left))).toBe(serializeProgress(left));
    expect(left.lessons['motor-start-stop-safe']).toMatchObject({ state: 'passed', hintsUsed: 1, passedAt: '2026-10-10T12:00:00.000Z' });
    expect(left.lessons['motor-start-stop-safe']!.grade!.programSha256).toBe(HASH_B);
    expect(left.last!.lessonId).toBe('motor-start-stop-safe');
  });

  it('keeps a pass when a later attempt fails, and counts hints and solutions', () => {
    let progress = withGrade(emptyProgress(), grade());
    progress = withGrade(progress, { ...failed(), time: '2026-10-10T13:00:00.000Z' });
    progress = withNote(progress, { lessonId: 'motor-start-stop-safe', hint: 1 }, '2026-10-10T13:05:00.000Z');
    progress = withNote(progress, { lessonId: 'motor-start-stop-safe', solution: true }, '2026-10-10T13:06:00.000Z');
    expect(progress.lessons['motor-start-stop-safe']).toMatchObject({ state: 'passed', hintsUsed: 1, solutionShown: true });
    expect(progress.lessons['motor-start-stop-safe']!.grade!.time).toBe('2026-10-10T12:00:00.000Z');
  });

  it('exports a document that imports back, and imports the first release file', () => {
    const progress = withGrade(emptyProgress(), grade());
    const exported = exportProgress(progress);
    const back = parseImport(exported);
    expect(back).toMatchObject({ ok: true, format: 'export' });
    expect(back.ok && serializeProgress(back.progress)).toBe(serializeProgress(progress));
    expect(parseImport('{"schemaVersion":1,"mastered":["motor-start-stop-safe"]}')).toMatchObject({ ok: true, format: 'legacy' });
    expect(parseImport('{')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseImport(JSON.stringify({ ...JSON.parse(exported), lessons: { x: {} } }))).toEqual({ ok: false, reason: 'invalid' });
    expect(parseImport('x'.repeat(300 * 1024))).toEqual({ ok: false, reason: 'too-large' });
  });
});
