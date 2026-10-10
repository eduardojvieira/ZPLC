/**
 * What crosses the IPC boundary for the lesson check (LRN-022, LRN-026): the request the renderer may send, the answer the
 * main process releases, and the renderer's own validation of that answer. Pure TypeScript with no Electron or Node import,
 * so the handler table, the tool worker and the panel share it.
 *
 * The renderer sends a lesson id and the id of the shown folder, never a scenario: the scenario is the lesson package's,
 * taken by the worker from the generated index. The answer is a grade record (validated exactly) or a short, fixed reason
 * with the codes of the diagnostics; no message, path or evidence of the run is released.
 */
import { isLessonId, parseGradeRecord, type GradeRecord } from './learnProgressModel.js';

export interface LessonCheckRequest { workspaceId: string; rootId: string; lessonId: string }

export const LESSON_CHECK_REASONS = ['unknown-lesson', 'index-tampered', 'not-graded'] as const;
export type LessonCheckReason = typeof LESSON_CHECK_REASONS[number];

export type LessonCheckAnswer =
  | { ok: true; record: GradeRecord; execution?: unknown }
  | { ok: false; reason: LessonCheckReason; codes: string[]; execution?: unknown };

const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The exact request of the channel: the workspace token, the folder id of the window and a lesson id. */
export function isLessonCheckRequest(value: unknown): value is LessonCheckRequest {
  return isPlain(value)
    && Object.keys(value).length === 3
    && typeof value.workspaceId === 'string' && WORKSPACE_ID.test(value.workspaceId)
    && typeof value.rootId === 'string' && value.rootId.length >= 1 && value.rootId.length <= 64
    && isLessonId(value.lessonId);
}

/** The codes of the diagnostics of a run, as strings of a fixed shape; anything else is dropped. */
function codesOf(value: unknown): string[] {
  const evidence = isPlain(value) ? value.evidence : undefined;
  const diagnostics = isPlain(evidence) && Array.isArray(evidence.diagnostics) ? evidence.diagnostics : [];
  const codes: string[] = [];
  for (const diagnostic of diagnostics) {
    const code = isPlain(diagnostic) ? diagnostic.code : undefined;
    if (typeof code === 'string' && CODE.test(code) && !codes.includes(code) && codes.length < 8) codes.push(code);
  }
  return codes;
}

/**
 * The answer of the main process for what the worker returned, or null when the value is not a result of the lesson
 * check at all. A grade is released only when its record is exactly one.
 */
export function lessonCheckAnswer(value: unknown, execution?: unknown): LessonCheckAnswer | null {
  if (!isPlain(value)) return null;
  const withExecution = execution === undefined ? {} : { execution };
  if (value.ok === true) {
    const record = parseGradeRecord(value.record);
    return record ? { ok: true, record, ...withExecution } : null;
  }
  const reason = LESSON_CHECK_REASONS.find((candidate) => candidate === value.reason);
  return value.ok === false && reason ? { ok: false, reason, codes: codesOf(value), ...withExecution } : null;
}

/** The renderer's validation of an answer: the same exactness, so a record is never trusted for having crossed the bridge. */
export function parseLessonCheckAnswer(value: unknown): LessonCheckAnswer | undefined {
  if (!isPlain(value)) return undefined;
  const { execution, ...rest } = value;
  const keys = Object.keys(rest).sort().join();
  if (rest.ok === true) {
    const record = keys === 'ok,record' ? parseGradeRecord(rest.record) : undefined;
    return record ? { ok: true, record, ...(execution === undefined ? {} : { execution }) } : undefined;
  }
  const reason = LESSON_CHECK_REASONS.find((candidate) => candidate === rest.reason);
  const codes = Array.isArray(rest.codes) && rest.codes.length <= 8 && rest.codes.every((code) => typeof code === 'string' && CODE.test(code)) ? rest.codes as string[] : undefined;
  return rest.ok === false && keys === 'codes,ok,reason' && reason && codes ? { ok: false, reason, codes, ...(execution === undefined ? {} : { execution }) } : undefined;
}
