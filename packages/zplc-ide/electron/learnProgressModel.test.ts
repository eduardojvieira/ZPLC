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

describe('a hardware run is kept apart from a simulation pass (LRN-024)', () => {
  const ID = 'motor-start-stop-safe';
  const hardware = (overrides: Partial<GradeRecord> = {}) => grade({ track: 'hardware', time: '2026-10-11T12:00:00.000Z', ...overrides });

  it('LRN-024 keeps a passing hardware grade without passing the lesson, and a simulation pass without a hardware pass', () => {
    const onBoard = withGrade(emptyProgress(), hardware());
    expect(onBoard.lessons[ID]).toEqual({ state: 'in-progress', grade: null, passedAt: null, startedAt: '2026-10-11T12:00:00.000Z', hintsShown: [], solutionShown: false, hardware: hardware() });
    expect(passedLessonIds(onBoard)).toEqual([]);
    const both = withGrade(onBoard, grade());
    expect(both.lessons[ID]).toMatchObject({ state: 'passed', grade: grade(), passedAt: grade().time, hardware: hardware() });
    expect(withGrade(emptyProgress(), grade()).lessons[ID]!.hardware).toBeNull();
    // A failed run on the board records nothing but that the lesson was started.
    const failedOnBoard = withGrade(emptyProgress(), { ...failed(), track: 'hardware' });
    expect(failedOnBoard.lessons[ID]).toMatchObject({ state: 'in-progress', hardware: null, startedAt: failed().time });
    expect(parseProgress(serializeProgress(both))).toEqual(both);
    expect(JSON.parse(serializeProgress(both))).toMatchObject({ schemaVersion: 4 });
  });

  it('LRN-024 keeps the newest hardware grade on a merge, in either order', () => {
    const older = withGrade(emptyProgress(), hardware({ time: '2026-10-11T08:00:00.000Z' }));
    const newer = withGrade(emptyProgress(), hardware({ time: '2026-10-12T08:00:00.000Z', programSha256: HASH_A }));
    expect(mergeProgress(older, newer).lessons[ID]!.hardware).toEqual(newer.lessons[ID]!.hardware);
    expect(mergeProgress(newer, older)).toEqual(mergeProgress(older, newer));
  });

  it('LRN-024 refuses a document that keeps a grade in the wrong place', () => {
    const document = JSON.parse(serializeProgress(withGrade(withGrade(emptyProgress(), grade()), hardware()))) as { lessons: Record<string, Record<string, unknown>> };
    const lesson = document.lessons[ID]!;
    for (const broken of [
      { ...lesson, hardware: grade() },
      { ...lesson, grade: hardware(), passedAt: hardware().time },
      { ...lesson, hardware: { ...failed(), track: 'hardware' } },
      { ...lesson, hardware: hardware({ lessonId: 'edge-counter-pulses' }) },
    ]) expect(parseProgress(JSON.stringify({ ...document, lessons: { [ID]: broken } }))).toBeUndefined();
    const { hardware: _dropped, ...withoutHardware } = lesson;
    expect(parseProgress(JSON.stringify({ ...document, lessons: { [ID]: withoutHardware } }))).toBeUndefined();
  });

  it('LRN-031 migrates a stored version 3 document: no hardware grade, and a hardware record a version 3 file held moves out of the pass (fixture)', () => {
    const v3 = (stored: GradeRecord) => JSON.stringify({
      schemaVersion: 3, last: null,
      lessons: { [ID]: { state: 'passed', grade: stored, passedAt: stored.time, startedAt: null, hintsShown: [1], solutionShown: false } },
    });
    expect(parseProgress(v3(grade()))!.lessons[ID]).toEqual({ state: 'passed', grade: grade(), passedAt: grade().time, startedAt: null, hintsShown: [1], solutionShown: false, hardware: null });
    expect(parseProgress(v3(hardware()))!.lessons[ID]).toEqual({ state: 'in-progress', grade: null, passedAt: null, startedAt: null, hintsShown: [1], solutionShown: false, hardware: hardware() });
    expect(JSON.parse(serializeProgress(parseProgress(v3(grade()))!))).toMatchObject({ schemaVersion: 4 });
    const imported = parseImport(JSON.stringify({ ...JSON.parse(v3(grade())), kind: 'zplc-learn-progress' }));
    expect(imported.ok && imported.progress.lessons[ID]!.hardware).toBeNull();
  });
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
      { ...document, schemaVersion: 9 },
      { ...document, last: { lessonId: 'Not An Id', at: '2026-10-10T11:00:00.000Z' } },
      { ...document, lessons: { 'motor-start-stop-safe': { state: 'passed', grade: null, passedAt: null, startedAt: null, hintsShown: [3], solutionShown: false, hardware: null } } },
      // An own key named __proto__ (an object literal would set the prototype instead).
      { ...document, lessons: Object.fromEntries([['__proto__', { state: 'passed', grade: null, passedAt: null, startedAt: null, hintsShown: [], solutionShown: false, hardware: null }]]) },
      { ...document, lessons: { 'edge-counter-pulses': { state: 'in-progress', grade: grade({ lessonId: 'edge-counter-pulses' }), passedAt: null, startedAt: null, hintsShown: [], solutionShown: false, hardware: null } } },
    ]) expect(parseProgress(JSON.stringify(broken))).toBeUndefined();
    expect(parseProgress('{')).toBeUndefined();
    expect(parseProgress('x'.repeat(300 * 1024))).toBeUndefined();
  });

  it('records every hint level shown, not only the highest, and merges them as a union (LRN-010)', () => {
    let progress = withNote(emptyProgress(), { lessonId: 'edge-counter-pulses', hint: 2 }, '2026-10-10T11:00:00.000Z');
    expect(progress.lessons['edge-counter-pulses']!.hintsShown).toEqual([2]);
    progress = withNote(progress, { lessonId: 'edge-counter-pulses', hint: 1 }, '2026-10-10T11:05:00.000Z');
    progress = withNote(progress, { lessonId: 'edge-counter-pulses', hint: 1 }, '2026-10-10T11:06:00.000Z');
    expect(progress.lessons['edge-counter-pulses']!.hintsShown).toEqual([1, 2]);
    const other = withNote(emptyProgress(), { lessonId: 'edge-counter-pulses', hint: 1 }, '2026-10-10T09:00:00.000Z');
    expect(mergeProgress(other, withNote(emptyProgress(), { lessonId: 'edge-counter-pulses', hint: 2 }, '2026-10-10T10:00:00.000Z')).lessons['edge-counter-pulses']!.hintsShown).toEqual([1, 2]);
    expect(parseProgress(JSON.stringify({ ...JSON.parse(serializeProgress(progress)), lessons: { 'edge-counter-pulses': { ...progress.lessons['edge-counter-pulses'], hintsShown: [2, 1] } } }))).toBeUndefined();
  });

  it('migrates a stored version 2 document, which kept only the highest hint level, and an export of it (fixture)', () => {
    const v2 = (hintsUsed: number) => JSON.stringify({
      schemaVersion: 2, last: { lessonId: 'edge-counter-pulses', at: '2026-10-10T11:00:00.000Z' },
      lessons: { 'edge-counter-pulses': { state: 'in-progress', grade: null, passedAt: null, startedAt: '2026-10-10T10:00:00.000Z', hintsUsed, solutionShown: false } },
    });
    expect(parseProgress(v2(2))!.lessons['edge-counter-pulses']).toMatchObject({ hintsShown: [1, 2] });
    expect(parseProgress(v2(1))!.lessons['edge-counter-pulses']).toMatchObject({ hintsShown: [1] });
    expect(parseProgress(v2(0))!.lessons['edge-counter-pulses']).toMatchObject({ hintsShown: [] });
    expect(parseProgress(v2(3))).toBeUndefined();
    expect(JSON.parse(serializeProgress(parseProgress(v2(2))!))).toMatchObject({ schemaVersion: 4 });
    const exported = JSON.stringify({ ...JSON.parse(v2(1)), kind: 'zplc-learn-progress' });
    const imported = parseImport(exported);
    expect(imported.ok && imported.progress.lessons['edge-counter-pulses']!.hintsShown).toEqual([1]);
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
    expect(migrated.lessons['motor-start-stop-safe']).toEqual({ state: 'passed', grade: null, passedAt: null, startedAt: null, hintsShown: [], solutionShown: false, hardware: null });
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
    expect(left.lessons['motor-start-stop-safe']).toMatchObject({ state: 'passed', hintsShown: [1], passedAt: '2026-10-10T12:00:00.000Z' });
    expect(left.lessons['motor-start-stop-safe']!.grade!.programSha256).toBe(HASH_B);
    expect(left.last!.lessonId).toBe('motor-start-stop-safe');
  });

  it('keeps a pass when a later attempt fails, and counts hints and solutions', () => {
    let progress = withGrade(emptyProgress(), grade());
    progress = withGrade(progress, { ...failed(), time: '2026-10-10T13:00:00.000Z' });
    progress = withNote(progress, { lessonId: 'motor-start-stop-safe', hint: 1 }, '2026-10-10T13:05:00.000Z');
    progress = withNote(progress, { lessonId: 'motor-start-stop-safe', solution: true }, '2026-10-10T13:06:00.000Z');
    expect(progress.lessons['motor-start-stop-safe']).toMatchObject({ state: 'passed', hintsShown: [1], solutionShown: true });
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
