import { describe, expect, it } from 'bun:test';

import { isLessonCheckRequest, lessonCheckAnswer, parseLessonCheckAnswer } from './lessonCheckProtocol';
import type { GradeRecord } from '../shared/learnProgressModel';

const HASH = 'a'.repeat(64);
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const record: GradeRecord = {
  schemaVersion: 1, lessonId: 'motor-start-stop-safe', lessonVersion: 1, track: 'simulation', scenarioId: 'MotorStartStop', scenarioSha256: HASH, programSha256: HASH,
  runtimeVersion: '1.0.0', time: '2026-10-10T12:00:00.000Z', result: 'passed', assertions: { total: 3, passed: 3 }, failedAssertions: [],
};

describe('the lesson check request and answer (LRN-022, LRN-026)', () => {
  it('accepts only a workspace token, a folder id and a lesson id', () => {
    expect(isLessonCheckRequest({ workspaceId: WORKSPACE_ID, rootId: 'folder-1', lessonId: 'motor-start-stop-safe' })).toBe(true);
    for (const bad of [
      null, 'x', {}, { workspaceId: WORKSPACE_ID, rootId: 'folder-1' },
      { workspaceId: WORKSPACE_ID, rootId: 'folder-1', lessonId: 'motor-start-stop-safe', scenario: '{}' },
      { workspaceId: WORKSPACE_ID, rootId: 'folder-1', lessonId: '../../etc/passwd' },
      { workspaceId: WORKSPACE_ID, rootId: 'folder-1', lessonId: 'Motor Start' },
      { workspaceId: 'not-a-token', rootId: 'folder-1', lessonId: 'motor-start-stop-safe' },
      { workspaceId: WORKSPACE_ID, rootId: '', lessonId: 'motor-start-stop-safe' },
    ]) expect(isLessonCheckRequest(bad)).toBe(false);
  });

  it('releases a grade record only when it is exactly one, and a refusal only as a fixed reason with codes', () => {
    expect(lessonCheckAnswer({ ok: true, record, evidence: { diagnostics: [] } })).toEqual({ ok: true, record });
    expect(lessonCheckAnswer({ ok: true, record: { ...record, result: 'failed' } })).toBeNull();
    expect(lessonCheckAnswer({ ok: true, record: { ...record, programSha256: 'nope' } })).toBeNull();
    const refused = lessonCheckAnswer({ ok: false, reason: 'not-graded', evidence: { diagnostics: [
      { code: 'UNKNOWN_IDENTIFIER', message: 'bad /home/secret/x.st', path: 'src/A.st' }, { code: 'lowercase' }, { code: 'UNKNOWN_IDENTIFIER' }, { code: 'SIMULATOR_UNAVAILABLE' },
    ] } }, { jobId: 'j' });
    expect(refused).toEqual({ ok: false, reason: 'not-graded', codes: ['UNKNOWN_IDENTIFIER', 'SIMULATOR_UNAVAILABLE'], execution: { jobId: 'j' } });
    expect(JSON.stringify(refused)).not.toContain('/home/secret');
    expect(lessonCheckAnswer({ ok: false, reason: 'because I said so' })).toBeNull();
    expect(lessonCheckAnswer('x')).toBeNull();
  });

  it('is validated again by the renderer, which trusts nothing that crossed the bridge', () => {
    expect(parseLessonCheckAnswer({ ok: true, record, execution: { jobId: 'j' } })).toEqual({ ok: true, record, execution: { jobId: 'j' } });
    expect(parseLessonCheckAnswer({ ok: false, reason: 'unknown-lesson', codes: [] })).toEqual({ ok: false, reason: 'unknown-lesson', codes: [] });
    for (const bad of [
      null, [], { ok: true }, { ok: true, record: { ...record, result: 'failed' } }, { ok: true, record, extra: 1 },
      { ok: false, reason: 'unknown-lesson' }, { ok: false, reason: 'x', codes: [] }, { ok: false, reason: 'not-graded', codes: ['lower'] },
      { ok: false, reason: 'not-graded', codes: [], extra: true },
    ]) expect(parseLessonCheckAnswer(bad)).toBeUndefined();
  });
});
