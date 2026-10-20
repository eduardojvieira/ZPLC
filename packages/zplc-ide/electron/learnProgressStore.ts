import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';

import {
  LEARN_PROGRESS_FILENAME,
  LEARN_PROGRESS_LEGACY_FILENAME,
  LEARN_PROGRESS_MAX_BYTES,
  LEARN_PROGRESS_MAX_LESSONS,
  emptyProgress,
  exportProgress,
  isLessonId,
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
  type LearnProgress,
  type LessonNote,
} from '../shared/learnProgressModel.js';

export { LEARN_PROGRESS_FILENAME, LEARN_PROGRESS_LEGACY_FILENAME };

const LEGACY_MAX_BYTES = 4096;
const INVALID = 'Invalid Learn progress';

/**
 * Main-process owner of the per-user Learn progress (LRN-031): one versioned file in the user-data directory, never inside a
 * project. A change is validated, merged with what is stored, and written atomically (temporary file, then rename), one at
 * a time. A file that is linked, oversized or malformed is refused and is never overwritten.
 *
 * The first release kept `zplc-learn-mastery.v1.json`. When the new file does not exist yet, that one is read and its
 * lessons become passed lessons without a grade record; it is left where it is.
 */
export function createLearnProgressStore(userDataPath: string, now: () => Date = () => new Date()) {
  const file = join(userDataPath, LEARN_PROGRESS_FILENAME);
  const legacyFile = join(userDataPath, LEARN_PROGRESS_LEGACY_FILENAME);
  let pending: Promise<unknown> = Promise.resolve();
  const serial = <T,>(task: () => Promise<T>): Promise<T> => {
    const result = pending.then(task, task);
    pending = result.catch(() => undefined);
    return result;
  };
  const validDirectory = async (): Promise<boolean> => {
    try { const status = await lstat(userDataPath); return status.isDirectory() && !status.isSymbolicLink(); } catch { return false; }
  };
  const missing = (error: unknown): boolean => typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

  /** The text of a regular, bounded, unlinked file; undefined when it does not exist; throws for anything else. */
  const readBounded = async (path: string, limit: number): Promise<string | undefined> => {
    let status;
    try { status = await lstat(path); } catch (error) { if (missing(error)) return undefined; throw error; }
    if (status.isSymbolicLink() || !status.isFile() || status.size > limit) throw new Error(INVALID);
    const raw = await readFile(path, 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > limit) throw new Error(INVALID);
    return raw;
  };

  const load = async (): Promise<LearnProgress> => {
    if (!await validDirectory()) {
      // A directory that does not exist yet has no progress; one that is not a real directory is refused.
      try { await lstat(userDataPath); } catch (error) { if (missing(error)) return emptyProgress(); }
      throw new Error('Invalid Learn progress directory');
    }
    const current = await readBounded(file, LEARN_PROGRESS_MAX_BYTES);
    if (current !== undefined) {
      const parsed = parseProgress(current);
      if (!parsed) throw new Error(INVALID);
      return parsed;
    }
    const legacy = await readBounded(legacyFile, LEGACY_MAX_BYTES);
    if (legacy === undefined) return emptyProgress();
    const migrated = migrateLegacyMastery(legacy);
    if (!migrated) throw new Error(INVALID);
    return migrated;
  };

  const write = async (progress: LearnProgress): Promise<void> => {
    const data = serializeProgress(progress);
    if (Buffer.byteLength(data, 'utf8') > LEARN_PROGRESS_MAX_BYTES || Object.keys(progress.lessons).length > LEARN_PROGRESS_MAX_LESSONS) throw new Error('Learn progress is full');
    await mkdir(userDataPath, { recursive: true, mode: 0o700 });
    if (!await validDirectory()) throw new Error('Invalid Learn progress directory');
    const temporary = join(userDataPath, `.${basename(file)}.${randomUUID()}`);
    try {
      await writeFile(temporary, data, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, file);
    } finally { await unlink(temporary).catch(() => undefined); }
  };

  /** Applies `change` to what is stored and keeps the result; nothing is written when it throws. */
  const update = (change: (current: LearnProgress) => LearnProgress): Promise<LearnProgress> => serial(async () => {
    const next = change(await load());
    await write(next);
    return next;
  });

  return {
    /** The whole document. */
    readProgress: (): Promise<LearnProgress> => serial(load),

    /** The ids of the passed lessons (the first release's operation, kept for the existing bridge). */
    async read(): Promise<ReadonlySet<string>> { return new Set(passedLessonIds(await serial(load))); },

    /** Marks lessons passed by id, without a grade record (the first release's operation). */
    async merge(ids: readonly string[]): Promise<ReadonlySet<string>> {
      if (!Array.isArray(ids) || ids.length > LEARN_PROGRESS_MAX_LESSONS || !ids.every(isLessonId)) throw new Error(INVALID);
      return new Set(passedLessonIds(await update((current) => withPassedIds(current, ids))));
    },

    /** Records one grade (LRN-023). The record is validated exactly; a failing grade does not undo a pass. */
    recordGrade(record: unknown): Promise<LearnProgress> {
      const parsed = parseGradeRecord(record) as GradeRecord | undefined;
      if (!parsed) return Promise.reject(new Error(INVALID));
      return update((current) => withGrade(current, parsed));
    },

    /** Records that a lesson was opened, a hint level shown, or its solution shown, and makes it the last lesson. */
    noteLesson(note: LessonNote): Promise<LearnProgress> {
      const valid = typeof note === 'object' && note !== null && isLessonId(note.lessonId)
        && (note.hint === undefined || note.hint === 1 || note.hint === 2)
        && (note.started === undefined || note.started === true) && (note.solution === undefined || note.solution === true) && (note.last === undefined || note.last === true);
      if (!valid) return Promise.reject(new Error(INVALID));
      const at = now().toISOString();
      return update((current) => withNote(current, note, at));
    },

    /** The text of an export file (LRN-032). */
    async exportProgress(): Promise<string> { return exportProgress(await serial(load)); },

    /** Validates a chosen file and merges it into the stored progress; unknown lessons are kept. */
    async importProgress(text: string): Promise<{ progress: LearnProgress; lessons: number }> {
      const parsed = parseImport(text);
      if (!parsed.ok) throw new Error('Invalid Learn progress file');
      const progress = await update((current) => mergeProgress(current, parsed.progress));
      return { progress, lessons: Object.keys(parsed.progress.lessons).length };
    },
  };
}
