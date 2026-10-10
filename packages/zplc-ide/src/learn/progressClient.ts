/**
 * The renderer's side of the Learn progress bridge (LRN-031, LRN-032). Every document the main process answers with is
 * validated again here by the parser of `learnProgressModel.ts`, so a value is never trusted for having crossed the bridge;
 * an answer that is not exactly the document is `undefined`, and so is a call the bridge refuses.
 */
import {
  parseGradeRecord,
  parseImport,
  parseLessonNote,
  parseProgressValue,
  type GradeRecord,
  type LearnProgress,
  type LessonNote,
} from '../../electron/learnProgressModel';

export type ProgressBridge = NonNullable<NonNullable<Window['electronAPI']>['learnProgress']>;

const attempt = async <T,>(call: () => Promise<T>): Promise<T | undefined> => {
  try { return await call(); } catch { return undefined; }
};

/** The whole stored document: passed lessons with their grades, lessons in progress, the last lesson, hints and solutions. */
export async function readProgress(bridge: ProgressBridge): Promise<LearnProgress | undefined> {
  return parseProgressValue(await attempt(() => bridge.readProgress()));
}

/** Records one grade of the lesson check; answers the document after it. A record that is not exactly one is not sent. */
export async function recordGrade(bridge: ProgressBridge, record: GradeRecord): Promise<LearnProgress | undefined> {
  if (!parseGradeRecord(record)) return undefined;
  return parseProgressValue(await attempt(() => bridge.recordGrade(record)));
}

/** Records that a lesson was opened, a hint level shown or the solution shown; answers the document after it. */
export async function noteLesson(bridge: ProgressBridge, note: LessonNote): Promise<LearnProgress | undefined> {
  if (!parseLessonNote(note)) return undefined;
  return parseProgressValue(await attempt(() => bridge.noteLesson(note)));
}

/** The text of the export file, or undefined when the main process did not answer a document. */
export async function exportProgress(bridge: ProgressBridge): Promise<string | undefined> {
  const text = await attempt(() => bridge.exportProgress());
  return typeof text === 'string' && parseImport(text).ok ? text : undefined;
}

/** Merges a file the learner chose. A file that is not a progress export, or the first release's progress file, is not sent. */
export async function importProgress(bridge: ProgressBridge, text: string): Promise<{ progress: LearnProgress; lessons: number } | undefined> {
  if (!parseImport(text).ok) return undefined;
  const answer = await attempt(() => bridge.importProgress(text));
  if (typeof answer !== 'object' || answer === null) return undefined;
  const { progress, lessons } = answer as { progress?: unknown; lessons?: unknown };
  const parsed = parseProgressValue(progress);
  return parsed && typeof lessons === 'number' && Number.isInteger(lessons) && lessons >= 0 ? { progress: parsed, lessons } : undefined;
}
