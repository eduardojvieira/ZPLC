import { describe, expect, it } from 'bun:test';

import { gradeRecordedScenarioLesson, learnLessonCatalog } from './learnLesson';
import { presentWorkspaceTestResult } from './workspaceTestPresentation';

const sha = 'a'.repeat(64);
const traceSha = 'b'.repeat(64);
const lesson = learnLessonCatalog.en.find((entry) => entry.rubric.requireSavedEvidence)!;
const failure = {
  kind: 'AT' as const,
  passed: false,
  atMs: 10,
  index: 0,
  checks: [{ signal: 'Motor.Forward', expected: false, observed: true }],
};

/** A failed `operation` result with one scenario whose assertions are `assertions`. */
const result = (operation: 'test' | 'scenario-run', scenario: { id: string; path: string }, assertions: unknown[]) => ({
  ok: false,
  evidence: {
    schemaVersion: 1,
    operation,
    outcome: 'failed',
    diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'ignored', path: scenario.path }],
    artifacts: [
      { kind: 'zplc', sha256: sha, byteLength: 12 },
      { kind: 'trace', sha256: traceSha, byteLength: 34 },
    ],
  },
  savedTestInputIdentity: { schemaVersion: 1, sha256: sha, fileCount: 3 },
  preview: {
    schemaVersion: 1,
    backend: 'native-posix',
    mode: 'logical-cyclic-task-set-scan',
    traceEvidenceSha256: traceSha,
    totalScenarioCount: 1,
    scenarios: [
      {
        ...scenario,
        passed: false,
        totalSamples: 2,
        totalSignals: 1,
        totalAssertions: assertions.length,
        truncated: false,
        assertions,
        samples: [
          { atMs: 0, outputs: { 'Motor.Forward': false } },
          { atMs: 10, outputs: { 'Motor.Forward': true } },
        ],
      },
    ],
  },
});
const motor = { id: 'motor', path: 'tests/motor.scenario.json' };

describe('failure detail in the presentation (TST-003)', () => {
  it('TST-003 the presentation accepts the new keys on a failed assertion and still rejects an unknown key', () => {
    const accepted = presentWorkspaceTestResult(result('test', motor, [failure, { kind: 'AT', passed: true, atMs: 20 }]));
    expect(accepted.kind).toBe('assertion-failed');
    expect(accepted.preview?.scenarios[0]?.assertions).toEqual([failure, { kind: 'AT', passed: true, atMs: 20 }]);

    for (const bad of [
      { ...failure, extra: 1 },
      { ...failure, checks: [{ signal: 'Motor.Forward', expected: false, observed: true, extra: 1 }] },
      { ...failure, checks: [{ signal: 'Motor.Forward', expected: 'no' }] },
      { ...failure, checks: Array.from({ length: 9 }, () => ({ signal: 'Motor.Forward', expected: false })) },
      { kind: 'AT', passed: true, atMs: 20, index: 0 },
    ])
      expect(presentWorkspaceTestResult(result('test', motor, [bad])).preview).toBeUndefined();
  });

  it('TST-003 the lesson check accepts the same shape', () => {
    const assertions = lesson.scenario.expectations.map((expectation, index) =>
      index === 0 ? { ...failure, kind: expectation.kind } : { kind: expectation.kind, passed: true, atMs: 20 },
    );
    const presentation = presentWorkspaceTestResult(
      result('scenario-run', { id: lesson.requiredScenario, path: lesson.scenarioPath }, assertions),
    );
    expect(presentation.preview?.scenarios[0]?.assertions[0]).toMatchObject({ index: 0, checks: failure.checks });
    expect(gradeRecordedScenarioLesson(lesson, presentation).kind).toBe('failed');
  });
});
