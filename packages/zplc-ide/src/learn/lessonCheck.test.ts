import { afterAll, beforeAll, describe, expect } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseGradeRecord } from '../../electron/learnProgressModel';
import { gradeRecordedScenarioLesson, learnLessonCatalog } from '../components/learnLesson';
import { presentWorkspaceTestResult } from '../components/workspaceTestPresentation';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { lessonCheck, scenarioRun } from '../cli/toolApi';
import { LESSON_INDEX } from '../generated/lessonIndex';

/**
 * Grading a lesson (LRN-022, LRN-023, LRN-026), end to end on the native POSIX runtime: the program of a workspace is run
 * against the scenario of the lesson package, never against one the learner can edit.
 */
const PROJECTS = join(import.meta.dir, '..', '..', 'projects');
const lesson = LESSON_INDEX.lessons.find((entry) => entry.id === 'motor-start-stop-safe')!;

let workRoot = '';
let previousBinary: string | undefined;
let counter = 0;
function workspace(): string {
  const root = join(workRoot, `ws-${counter++}`);
  cpSync(join(PROJECTS, lesson.starter.project), root, { recursive: true });
  return root;
}
function solve(root: string): void {
  writeFileSync(join(root, lesson.starter.program), readFileSync(join(PROJECTS, lesson.solution.project, lesson.solution.program), 'utf8'));
}
const clock = (iso: string) => () => new Date(iso);

beforeAll(() => {
  workRoot = mkdtempSync(join(tmpdir(), 'zplc-lesson-check-'));
  previousBinary = process.env.ZPLC_NATIVE_SIM_BIN;
  process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
});
afterAll(() => {
  if (previousBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
  else process.env.ZPLC_NATIVE_SIM_BIN = previousBinary;
  rmSync(workRoot, { recursive: true, force: true });
});

describe('lesson check (LRN-022, LRN-023, LRN-026)', () => {
  itNative('the panel grades the real recorded run of the starter as failed and lists its failed assertions', async () => {
    const run = await scenarioRun(workspace(), lesson.scenario.id);
    expect(run.ok).toBe(false);
    // The run is what the main process returns and the renderer presents; a failed run has no summary and so no scenario count.
    const presented = presentWorkspaceTestResult({ ...run, traceFile: undefined });
    const grade = gradeRecordedScenarioLesson(learnLessonCatalog.en.find(({ id }) => id === lesson.id)!, presented);
    expect(grade.kind).toBe('failed');
    if (grade.kind !== 'failed') return;
    expect(grade.assertions).toBe(lesson.scenario.assertions);
    expect(grade.failures.length).toBeGreaterThan(0);
    for (const failure of grade.failures) expect(failure.trace?.uri).toContain('zplc://runtime/snapshot/MotorStartStop/');
  }, 60_000);

  itNative('fails the starter and shows which assertion failed, when, expected against observed, and where in the trace', async () => {
    const result = await lessonCheck(workspace(), lesson.id, { clock: clock('2026-10-10T12:00:00.000Z') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { record } = result;
    expect(record).toMatchObject({ lessonId: lesson.id, lessonVersion: lesson.version, scenarioId: 'MotorStartStop', scenarioSha256: lesson.scenario.sha256, result: 'failed', time: '2026-10-10T12:00:00.000Z' });
    expect(record.assertions.total).toBe(lesson.scenario.assertions);
    expect(record.assertions.passed).toBeLessThan(record.assertions.total);
    expect(record.failedAssertions.length).toBe(record.assertions.total - record.assertions.passed);
    for (const failure of record.failedAssertions) {
      expect(Object.keys(failure.expected).length).toBeGreaterThan(0);
      expect(Object.keys(failure.observed)).toEqual(Object.keys(failure.expected));
      expect(failure.atMs).not.toBeNull();
      expect(failure.trace?.uri).toBe(`zplc://runtime/snapshot/MotorStartStop/${failure.trace?.cursor}/${failure.trace?.traceSha256}`);
      // What was observed is not what was expected, for at least one signal of a failed AT assertion.
      if (failure.kind === 'AT') expect(Object.entries(failure.expected).some(([signal, value]) => failure.observed[signal] !== value)).toBe(true);
    }
    expect(parseGradeRecord(record)).toEqual(record);
  }, 60_000);

  itNative('passes the reference solution and records the hashes, the runtime version and the time', async () => {
    const root = workspace();
    solve(root);
    const result = await lessonCheck(root, lesson.id, { clock: clock('2026-10-10T12:00:00.000Z') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record).toMatchObject({ lessonId: lesson.id, lessonVersion: lesson.version, scenarioSha256: lesson.scenario.sha256, result: 'passed', failedAssertions: [], assertions: { total: lesson.scenario.assertions, passed: lesson.scenario.assertions } });
    expect(result.record.programSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.record.runtimeVersion.length).toBeGreaterThan(0);
    expect(parseGradeRecord(result.record)).toEqual(result.record);
  }, 60_000);

  itNative('is deterministic: the same program and scenario give the same record, apart from its time', async () => {
    const root = workspace();
    const first = await lessonCheck(root, lesson.id, { clock: clock('2026-10-10T12:00:00.000Z') });
    const second = await lessonCheck(root, lesson.id, { clock: clock('2026-10-12T07:45:10.500Z') });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.record.time).not.toBe(first.record.time);
    expect({ ...second.record, time: first.record.time }).toEqual(first.record);
  }, 60_000);

  itNative('is not fooled by a scenario edited in the workspace: the edited one passes the workspace run, the lesson still fails', async () => {
    const root = workspace();
    const path = join(root, lesson.scenario.path);
    // The learner replaces the graded scenario with one the starter satisfies.
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, id: lesson.scenario.id, tickMs: 10, durationMs: 20, events: [], expectations: [{ kind: 'NEVER', condition: { 'Motor.Forward': true, 'Motor.Reverse': true } }] }));
    const workspaceRun = await scenarioRun(root, lesson.scenario.id);
    expect(workspaceRun.ok).toBe(true);
    const check = await lessonCheck(root, lesson.id, { clock: clock('2026-10-10T12:00:00.000Z') });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.record.result).toBe('failed');
    expect(check.record.scenarioSha256).toBe(lesson.scenario.sha256);
    expect(check.record.assertions.total).toBe(lesson.scenario.assertions);
  }, 60_000);

  itNative('is not fooled by a missing tests folder either: the scenario comes from the package', async () => {
    const root = workspace();
    solve(root);
    rmSync(join(root, 'tests'), { recursive: true, force: true });
    const check = await lessonCheck(root, lesson.id, { clock: clock('2026-10-10T12:00:00.000Z') });
    expect(check.ok && check.record.result).toBe('passed');
  }, 60_000);

  itNative('gives no grade for a program that does not build, and none for an unknown lesson', async () => {
    const root = workspace();
    writeFileSync(join(root, lesson.starter.program), 'PROGRAM Motor\nthis is not Structured Text\nEND_PROGRAM\n');
    const broken = await lessonCheck(root, lesson.id);
    expect(broken).toMatchObject({ ok: false, reason: 'not-graded' });
    expect(await lessonCheck(root, 'no-such-lesson')).toEqual({ ok: false, reason: 'unknown-lesson' });
  }, 60_000);
});
