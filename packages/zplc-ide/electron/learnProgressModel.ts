/**
 * The Learn progress document (LRN-023, LRN-031, LRN-032): what a learner has passed, with the grade record that
 * proved it, which lessons are in progress, the last lesson, and the hints and solutions used.
 *
 * Pure and dependency-free, so the main-process store, the renderer and the MCP course resource share one parser. It
 * lives in `electron/` because the main process may import only from that directory; the renderer and the CLI import it
 * from there. It names no lesson: an id only has to look like one, so progress for a lesson this build does not know
 * (an imported file, a downgrade) is kept inert and is never an error. The generated lesson index says which ids exist.
 *
 * The document is exact: unknown keys, wrong types, duplicate or malformed records are all rejected, never repaired.
 *
 * Bridge. The renderer reaches the store only through typed operations of the preload; `LearnProgressOperations`
 * is the set the main process offers. `read` and `merge` are the two that exist today.
 */

export const LEARN_PROGRESS_SCHEMA_VERSION = 2 as const;
export const LEARN_PROGRESS_FILENAME = 'zplc-learn-progress.v2.json';
/** The file of the first release of Learn: `{ schemaVersion: 1, mastered: [lesson ids] }`. Read for migration, never written. */
export const LEARN_PROGRESS_LEGACY_FILENAME = 'zplc-learn-mastery.v1.json';
export const LEARN_PROGRESS_EXPORT_KIND = 'zplc-learn-progress' as const;
export const LEARN_PROGRESS_MAX_BYTES = 256 * 1024;
export const LEARN_PROGRESS_MAX_LESSONS = 512;
const LEGACY_MAX_BYTES = 4096;

const LESSON_ID = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SCENARIO_KINDS = ['AT', 'WITHIN', 'FOR', 'EVENTUALLY', 'ALWAYS', 'NEVER', 'UNTIL', 'RISING', 'FALLING'] as const;
const SNAPSHOT_URI = 'zplc://runtime/snapshot/';

/** A point of a recorded trace: the scenario, the sample, and the identity of the trace that holds it (LRN-026). */
export interface TraceLink {
  scenarioId: string;
  traceSha256: string;
  /** Index of the sample in the scenario's trace. */
  cursor: number;
  atMs: number;
  /** `zplc://runtime/snapshot/{scenarioId}/{cursor}/{traceSha256}`, the address of that sample in the replay resource. */
  uri: string;
}

export interface FailedAssertion {
  /** Position of the assertion in the reference scenario. */
  index: number;
  kind: string;
  /** The instant at which the engine found the assertion failing; null when it reports none. */
  atMs: number | null;
  expected: Record<string, boolean>;
  /** The value of each expected signal at that instant; null where the trace does not hold it. */
  observed: Record<string, boolean | null>;
  trace: TraceLink | null;
}

/** One grade of a lesson in simulation (LRN-023). Everything but `time` is a function of the program and the scenario. */
export interface GradeRecord {
  schemaVersion: 1;
  lessonId: string;
  lessonVersion: number;
  scenarioId: string;
  /** Content hash of the reference scenario the program was run against. */
  scenarioSha256: string;
  /** Hash of the compiled program (the `.zplc` artifact) that was graded. */
  programSha256: string;
  runtimeVersion: string;
  /** ISO 8601, UTC. */
  time: string;
  result: 'passed' | 'failed';
  assertions: { total: number; passed: number };
  failedAssertions: FailedAssertion[];
}

export interface LessonProgress {
  state: 'in-progress' | 'passed';
  /** The newest passing grade; null for a lesson passed before grades were recorded (migrated, or merged by id). */
  grade: GradeRecord | null;
  passedAt: string | null;
  startedAt: string | null;
  /** The highest hint level shown. */
  hintsUsed: 0 | 1 | 2;
  solutionShown: boolean;
}

export interface LearnProgress {
  schemaVersion: typeof LEARN_PROGRESS_SCHEMA_VERSION;
  last: { lessonId: string; at: string } | null;
  lessons: Record<string, LessonProgress>;
}

/** What the main process offers the renderer. The first two exist; the others are the typed operations to add. */
export interface LearnProgressOperations {
  read(): Promise<string[]>;
  merge(ids: string[]): Promise<string[]>;
  readProgress(): Promise<LearnProgress>;
  recordGrade(record: GradeRecord): Promise<LearnProgress>;
  noteLesson(note: LessonNote): Promise<LearnProgress>;
  exportProgress(): Promise<string>;
  importProgress(text: string): Promise<{ progress: LearnProgress; lessons: number }>;
}

export interface LessonNote { lessonId: string; started?: true; hint?: 1 | 2; solution?: true; last?: true }

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const hasExactKeys = (value: Json, keys: readonly string[]): boolean => {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
};
const isInt = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const isTime = (value: unknown): value is string => typeof value === 'string' && ISO_UTC.test(value) && Number.isFinite(Date.parse(value));
const isSha = (value: unknown): value is string => typeof value === 'string' && SHA256.test(value);

export function isLessonId(value: unknown): value is string {
  return typeof value === 'string' && LESSON_ID.test(value);
}

function parseTrace(value: unknown): TraceLink | null | undefined {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ['scenarioId', 'traceSha256', 'cursor', 'atMs', 'uri'])) return undefined;
  const { scenarioId, traceSha256, cursor, atMs, uri } = value;
  if (typeof scenarioId !== 'string' || scenarioId.length === 0 || scenarioId.length > 128 || !isSha(traceSha256) || !isInt(cursor, 0, 100_000) || !isInt(atMs, 0, 3_600_000)) return undefined;
  if (uri !== `${SNAPSHOT_URI}${scenarioId}/${cursor}/${traceSha256}`) return undefined;
  return { scenarioId, traceSha256, cursor, atMs, uri };
}

function parseSignalMap<T extends boolean | null>(value: unknown, allowNull: boolean): Record<string, T> | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > 64) return undefined;
  const result: Record<string, T> = {};
  for (const [signal, item] of entries) {
    if (signal.length === 0 || signal.length > 128 || !(typeof item === 'boolean' || (allowNull && item === null))) return undefined;
    result[signal] = item as T;
  }
  return result;
}

function parseFailed(value: unknown): FailedAssertion | undefined {
  if (!isObject(value) || !hasExactKeys(value, ['index', 'kind', 'atMs', 'expected', 'observed', 'trace'])) return undefined;
  const expected = parseSignalMap<boolean>(value.expected, false);
  const observed = parseSignalMap<boolean | null>(value.observed, true);
  const trace = parseTrace(value.trace);
  if (!isInt(value.index, 0, 255) || typeof value.kind !== 'string' || !(SCENARIO_KINDS as readonly string[]).includes(value.kind)) return undefined;
  if (!(value.atMs === null || isInt(value.atMs, 0, 3_600_000)) || !expected || !observed || trace === undefined) return undefined;
  return { index: value.index, kind: value.kind, atMs: value.atMs as number | null, expected, observed, trace };
}

/** A grade record, or undefined for anything that is not exactly one. */
export function parseGradeRecord(value: unknown): GradeRecord | undefined {
  if (!isObject(value) || !hasExactKeys(value, ['schemaVersion', 'lessonId', 'lessonVersion', 'scenarioId', 'scenarioSha256', 'programSha256', 'runtimeVersion', 'time', 'result', 'assertions', 'failedAssertions'])) return undefined;
  if (value.schemaVersion !== 1 || !isLessonId(value.lessonId) || !isInt(value.lessonVersion, 1, 1_000_000)) return undefined;
  if (typeof value.scenarioId !== 'string' || value.scenarioId.length === 0 || value.scenarioId.length > 128) return undefined;
  if (!isSha(value.scenarioSha256) || !isSha(value.programSha256) || typeof value.runtimeVersion !== 'string' || value.runtimeVersion.length === 0 || value.runtimeVersion.length > 64) return undefined;
  if (!isTime(value.time) || (value.result !== 'passed' && value.result !== 'failed')) return undefined;
  const assertions = value.assertions;
  if (!isObject(assertions) || !hasExactKeys(assertions, ['total', 'passed']) || !isInt(assertions.total, 1, 256) || !isInt(assertions.passed, 0, assertions.total)) return undefined;
  if (!Array.isArray(value.failedAssertions) || value.failedAssertions.length > 64) return undefined;
  const failedAssertions: FailedAssertion[] = [];
  for (const item of value.failedAssertions) {
    const failed = parseFailed(item);
    if (!failed) return undefined;
    failedAssertions.push(failed);
  }
  // A record that says passed has no failure, and one that says failed has at least one: a mismatch is a forged record.
  if (value.result === 'passed' && (failedAssertions.length > 0 || assertions.passed !== assertions.total)) return undefined;
  if (value.result === 'failed' && assertions.passed === assertions.total) return undefined;
  return {
    schemaVersion: 1, lessonId: value.lessonId, lessonVersion: value.lessonVersion, scenarioId: value.scenarioId,
    scenarioSha256: value.scenarioSha256, programSha256: value.programSha256, runtimeVersion: value.runtimeVersion, time: value.time,
    result: value.result, assertions: { total: assertions.total, passed: assertions.passed }, failedAssertions,
  };
}

function parseLesson(id: string, value: unknown): LessonProgress | undefined {
  if (!isObject(value) || !hasExactKeys(value, ['state', 'grade', 'passedAt', 'startedAt', 'hintsUsed', 'solutionShown'])) return undefined;
  if (value.state !== 'in-progress' && value.state !== 'passed') return undefined;
  if (!(value.hintsUsed === 0 || value.hintsUsed === 1 || value.hintsUsed === 2) || typeof value.solutionShown !== 'boolean') return undefined;
  if (!(value.passedAt === null || isTime(value.passedAt)) || !(value.startedAt === null || isTime(value.startedAt))) return undefined;
  const grade = value.grade === null ? null : parseGradeRecord(value.grade);
  if (grade === undefined) return undefined;
  if (grade !== null && (grade.lessonId !== id || grade.result !== 'passed' || value.state !== 'passed' || value.passedAt !== grade.time)) return undefined;
  if (value.state === 'in-progress' && (grade !== null || value.passedAt !== null)) return undefined;
  if (value.state === 'passed' && value.passedAt === null && grade !== null) return undefined;
  return { state: value.state, grade, passedAt: value.passedAt as string | null, startedAt: value.startedAt as string | null, hintsUsed: value.hintsUsed, solutionShown: value.solutionShown };
}

function parseDocument(value: unknown, withKind: boolean): LearnProgress | undefined {
  if (!isObject(value)) return undefined;
  const keys = ['schemaVersion', 'last', 'lessons', ...(withKind ? ['kind'] : [])];
  if (!hasExactKeys(value, keys) || value.schemaVersion !== LEARN_PROGRESS_SCHEMA_VERSION) return undefined;
  if (withKind && value.kind !== LEARN_PROGRESS_EXPORT_KIND) return undefined;
  let last: LearnProgress['last'] = null;
  if (value.last !== null) {
    const item = value.last;
    if (!isObject(item) || !hasExactKeys(item, ['lessonId', 'at']) || !isLessonId(item.lessonId) || !isTime(item.at)) return undefined;
    last = { lessonId: item.lessonId, at: item.at };
  }
  if (!isObject(value.lessons)) return undefined;
  const ids = Object.keys(value.lessons);
  if (ids.length > LEARN_PROGRESS_MAX_LESSONS) return undefined;
  const lessons: Record<string, LessonProgress> = {};
  for (const id of ids.sort()) {
    if (!isLessonId(id)) return undefined;
    const lesson = parseLesson(id, value.lessons[id]);
    if (!lesson) return undefined;
    lessons[id] = lesson;
  }
  return { schemaVersion: LEARN_PROGRESS_SCHEMA_VERSION, last, lessons };
}

const byteLength = (text: string): number => new TextEncoder().encode(text).byteLength;

/** The stored document, or undefined when `raw` is not exactly one. */
export function parseProgress(raw: string): LearnProgress | undefined {
  if (typeof raw !== 'string' || byteLength(raw) > LEARN_PROGRESS_MAX_BYTES) return undefined;
  try { return parseDocument(JSON.parse(raw) as unknown, false); } catch { return undefined; }
}

/** The canonical text of a document: lessons in id order, so equal progress is equal bytes. */
export function serializeProgress(progress: LearnProgress): string {
  const lessons: Record<string, LessonProgress> = {};
  for (const id of Object.keys(progress.lessons).sort()) lessons[id] = progress.lessons[id]!;
  return JSON.stringify({ schemaVersion: LEARN_PROGRESS_SCHEMA_VERSION, last: progress.last, lessons });
}

export function emptyProgress(): LearnProgress {
  return { schemaVersion: LEARN_PROGRESS_SCHEMA_VERSION, last: null, lessons: {} };
}

const PASSED_WITHOUT_GRADE: LessonProgress = { state: 'passed', grade: null, passedAt: null, startedAt: null, hintsUsed: 0, solutionShown: false };

/**
 * Reads the progress file of the first release: `{ schemaVersion: 1, mastered: [ids] }`. Every id becomes a lesson passed
 * without a grade record. Ids this build does not know are kept. Anything else is refused.
 */
export function migrateLegacyMastery(raw: string): LearnProgress | undefined {
  if (typeof raw !== 'string' || byteLength(raw) > LEGACY_MAX_BYTES) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || !hasExactKeys(value, ['schemaVersion', 'mastered']) || value.schemaVersion !== 1 || !Array.isArray(value.mastered)) return undefined;
    const lessons: Record<string, LessonProgress> = {};
    for (const id of value.mastered) {
      if (!isLessonId(id) || Object.hasOwn(lessons, id)) return undefined;
      lessons[id] = { ...PASSED_WITHOUT_GRADE };
    }
    if (Object.keys(lessons).length > LEARN_PROGRESS_MAX_LESSONS) return undefined;
    return { schemaVersion: LEARN_PROGRESS_SCHEMA_VERSION, last: null, lessons };
  } catch { return undefined; }
}

/** The text a learner saves to move progress to another machine. */
export function exportProgress(progress: LearnProgress): string {
  const { schemaVersion, last, lessons } = JSON.parse(serializeProgress(progress)) as LearnProgress;
  return JSON.stringify({ kind: LEARN_PROGRESS_EXPORT_KIND, schemaVersion, last, lessons });
}

export type ImportResult = { ok: true; progress: LearnProgress; format: 'export' | 'legacy' } | { ok: false; reason: 'too-large' | 'not-json' | 'invalid' };

/** Validates a file the learner chose: an export of this release, or the progress file of the first release. */
export function parseImport(raw: string): ImportResult {
  if (typeof raw !== 'string' || byteLength(raw) > LEARN_PROGRESS_MAX_BYTES) return { ok: false, reason: 'too-large' };
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return { ok: false, reason: 'not-json' }; }
  if (isObject(value) && value.kind === LEARN_PROGRESS_EXPORT_KIND) {
    const progress = parseDocument(value, true);
    return progress ? { ok: true, progress, format: 'export' } : { ok: false, reason: 'invalid' };
  }
  const legacy = migrateLegacyMastery(raw);
  return legacy ? { ok: true, progress: legacy, format: 'legacy' } : { ok: false, reason: 'invalid' };
}

const later = (left: string | null, right: string | null): string | null => (left === null ? right : right === null ? left : left >= right ? left : right);
const earlier = (left: string | null, right: string | null): string | null => (left === null ? right : right === null ? left : left <= right ? left : right);

/** The newest of two passing records: by time, then by program hash so the choice never depends on the order. */
function newerGrade(left: GradeRecord | null, right: GradeRecord | null): GradeRecord | null {
  if (left === null || right === null) return left ?? right;
  if (left.time !== right.time) return left.time > right.time ? left : right;
  return left.programSha256 >= right.programSha256 ? left : right;
}

function mergeLesson(left: LessonProgress, right: LessonProgress): LessonProgress {
  const grade = newerGrade(left.grade, right.grade);
  const passed = left.state === 'passed' || right.state === 'passed';
  return {
    state: passed ? 'passed' : 'in-progress',
    grade,
    passedAt: passed ? (grade ? grade.time : earlier(left.passedAt, right.passedAt)) : null,
    startedAt: earlier(left.startedAt, right.startedAt),
    hintsUsed: Math.max(left.hintsUsed, right.hintsUsed) as 0 | 1 | 2,
    solutionShown: left.solutionShown || right.solutionShown,
  };
}

/**
 * The union of two documents (LRN-032). A lesson passed on either side is passed, its grade record is the newest passing
 * one, hints and solutions used are the larger, and the last lesson is the more recent. Commutative and idempotent.
 */
export function mergeProgress(left: LearnProgress, right: LearnProgress): LearnProgress {
  const lessons: Record<string, LessonProgress> = {};
  for (const id of new Set([...Object.keys(left.lessons), ...Object.keys(right.lessons)])) {
    const a = left.lessons[id];
    const b = right.lessons[id];
    lessons[id] = a && b ? mergeLesson(a, b) : (a ?? b)!;
  }
  const last = left.last && right.last ? (left.last.at >= right.last.at ? left.last : right.last) : (left.last ?? right.last);
  return { schemaVersion: LEARN_PROGRESS_SCHEMA_VERSION, last, lessons };
}

const blank = (): LessonProgress => ({ state: 'in-progress', grade: null, passedAt: null, startedAt: null, hintsUsed: 0, solutionShown: false });

/** Records one grade. A passing grade passes the lesson; a failing one only marks it started and sets the last lesson. */
export function withGrade(progress: LearnProgress, record: GradeRecord): LearnProgress {
  const current = progress.lessons[record.lessonId] ?? blank();
  const next: LessonProgress = record.result === 'passed'
    ? mergeLesson(current, { ...blank(), state: 'passed', grade: record, passedAt: record.time, startedAt: current.startedAt ?? record.time })
    : { ...current, startedAt: current.startedAt ?? record.time };
  return { ...progress, last: { lessonId: record.lessonId, at: later(progress.last?.at ?? null, record.time)! }, lessons: { ...progress.lessons, [record.lessonId]: next } };
}

/** Records that a lesson was opened, a hint level shown, or the solution shown; `at` is when. */
export function withNote(progress: LearnProgress, note: LessonNote, at: string): LearnProgress {
  const current = progress.lessons[note.lessonId] ?? blank();
  const next: LessonProgress = {
    ...current,
    startedAt: current.startedAt ?? at,
    hintsUsed: note.hint ? (Math.max(current.hintsUsed, note.hint) as 0 | 1 | 2) : current.hintsUsed,
    solutionShown: current.solutionShown || note.solution === true,
  };
  return { ...progress, last: { lessonId: note.lessonId, at }, lessons: { ...progress.lessons, [note.lessonId]: next } };
}

/** Marks lessons passed by id, without a grade record, keeping any grade already recorded. */
export function withPassedIds(progress: LearnProgress, ids: readonly string[]): LearnProgress {
  const lessons = { ...progress.lessons };
  for (const id of ids) lessons[id] = lessons[id] ? mergeLesson(lessons[id]!, PASSED_WITHOUT_GRADE) : { ...PASSED_WITHOUT_GRADE };
  return { ...progress, lessons };
}

/** The ids of the passed lessons, in id order. */
export function passedLessonIds(progress: LearnProgress): string[] {
  return Object.keys(progress.lessons).sort().filter((id) => progress.lessons[id]!.state === 'passed');
}
