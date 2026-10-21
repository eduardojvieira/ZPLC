/**
 * The course as the Learn home and the lesson list read it (LRN-002, LRN-005, LRN-011): the generated index (lessons and
 * course structure) seen through a progress document. Pure. A lesson is locked until the lessons it requires are passed,
 * unless everything is unlocked by the setting; a lesson already started or passed is never locked, so a learner is never
 * shut out of work they have in a workspace. Progress that has not loaded is the empty document, never an error.
 */
import { emptyProgress, type LearnProgress } from '../../shared/learnProgressModel';
import type { LessonIndex, LessonIndexEntry, LessonLevel, LessonLocale } from './lessonPackage';

export type LessonState = 'locked' | 'available' | 'in-progress' | 'passed';

export interface CourseLessonView {
  id: string;
  title: string;
  module: number;
  state: LessonState;
  /** Ids of the prerequisites not passed yet; empty unless the lesson is locked. */
  missing: readonly string[];
  tracks: readonly string[];
  languages: readonly string[];
  plant: string | null;
  estimatedMinutes: number;
}
export interface CourseModuleView {
  id: number;
  title: string;
  /** Why the module sits where it does in the course (LRN-006). */
  why: string;
  level: LessonLevel;
  requires: number | null;
  tracks: readonly string[];
  /** The sum of the lessons placed in the module; 0 for a module that has none yet. */
  estimatedMinutes: number;
  /** The objectives of the lessons placed in the module, in lesson order. */
  objectives: readonly string[];
  lessons: readonly CourseLessonView[];
}
export interface CourseView {
  /** Why the course is in this order (LRN-006). */
  rationale: string;
  tracks: ReadonlyArray<{ id: string; title: string; summary: string }>;
  modules: readonly CourseModuleView[];
  /** Titles of every lesson by id, so a locked lesson can name what it waits for. */
  titles: Readonly<Record<string, string>>;
  passed: number;
  total: number;
}

const entryOf = (index: LessonIndex, id: string): LessonIndexEntry | undefined => index.lessons.find((lesson) => lesson.id === id);

/**
 * Whether a lesson is passed in the course: by its simulation grade, or, for a lesson that has only the hardware track
 * (verify my board), by a passing hardware check (LRN-024). A hardware run never passes a lesson that can be graded in simulation.
 */
export function passedIn(index: LessonIndex, id: string, document: LearnProgress): boolean {
  const recorded = document.lessons[id];
  if (recorded?.state === 'passed') return true;
  const entry = entryOf(index, id);
  return entry !== undefined && !entry.tracks.includes('simulation') && recorded?.hardware != null;
}

export function lessonStateOf(
  index: LessonIndex,
  id: string,
  progress: LearnProgress | null,
  unlockAll: boolean,
): { state: LessonState; missing: readonly string[] } {
  const document = progress ?? emptyProgress();
  const recorded = document.lessons[id];
  if (passedIn(index, id, document)) return { state: 'passed', missing: [] };
  if (recorded?.state === 'in-progress') return { state: 'in-progress', missing: [] };
  const missing = unlockAll
    ? []
    : (entryOf(index, id)?.prerequisites ?? []).filter((prerequisite) => !passedIn(index, prerequisite, document));
  return missing.length > 0 ? { state: 'locked', missing } : { state: 'available', missing: [] };
}

/**
 * The lessons in the order a learner takes them: by module and position, never before a prerequisite. Kahn's algorithm,
 * choosing the lowest (module, order) among the lessons whose prerequisites are done; a cycle is left to the generator to refuse.
 */
export function courseOrder(index: LessonIndex): readonly LessonIndexEntry[] {
  const remaining = [...index.lessons];
  const done = new Set<string>();
  const result: LessonIndexEntry[] = [];
  while (remaining.length > 0) {
    const ready = remaining.filter((lesson) => lesson.prerequisites.every((prerequisite) => done.has(prerequisite)));
    const pool = ready.length > 0 ? ready : remaining;
    const next = pool.reduce((best, lesson) =>
      lesson.module < best.module || (lesson.module === best.module && lesson.order < best.order) ? lesson : best,
    );
    remaining.splice(remaining.indexOf(next), 1);
    done.add(next.id);
    result.push(next);
  }
  return result;
}

export function buildCourseView(
  index: LessonIndex,
  progress: LearnProgress | null,
  options: { locale: LessonLocale; unlockAll: boolean },
): CourseView {
  const { locale, unlockAll } = options;
  const ordered = courseOrder(index);
  const lessons = ordered.map((entry): CourseLessonView => ({
    id: entry.id,
    title: entry.text[locale].title,
    module: entry.module,
    ...lessonStateOf(index, entry.id, progress, unlockAll),
    tracks: entry.tracks,
    languages: entry.languages,
    plant: entry.plant,
    estimatedMinutes: entry.estimatedMinutes,
  }));
  const modules = index.course.modules.map((module): CourseModuleView => {
    const placed = lessons.filter((lesson) => lesson.module === module.id);
    return {
      id: module.id,
      title: module.title[locale],
      why: module.why[locale],
      level: module.level,
      requires: module.requires,
      tracks: module.tracks,
      estimatedMinutes: placed.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0),
      objectives: ordered.filter((entry) => entry.module === module.id).flatMap((entry) => entry.text[locale].objectives),
      lessons: placed,
    };
  });
  return {
    rationale: index.course.rationale[locale],
    tracks: index.course.tracks.map((track) => ({ id: track.id, title: track.title[locale], summary: track.summary[locale] })),
    modules,
    titles: Object.fromEntries(lessons.map((lesson) => [lesson.id, lesson.title])),
    passed: lessons.filter((lesson) => lesson.state === 'passed').length,
    total: lessons.length,
  };
}

/** The lesson Continue resumes: the last one worked on while it is open, else the first open lesson in course order, else none. */
export function continueTarget(view: CourseView, progress: LearnProgress | null): string | null {
  const all = view.modules.flatMap((module) => module.lessons);
  const last = progress?.last?.lessonId;
  const resumable = (lesson: CourseLessonView) => lesson.state === 'available' || lesson.state === 'in-progress';
  const lastLesson = last ? all.find((lesson) => lesson.id === last) : undefined;
  if (lastLesson && resumable(lastLesson)) return lastLesson.id;
  // A lesson without a simulation grade (verify my board) is opened on purpose, never offered by Continue (LRN-011).
  return all.find((lesson) => resumable(lesson) && lesson.tracks.includes('simulation'))?.id ?? null;
}

export type TrackSupport = { supported: true } | { supported: false; reason: string; instead: string };

/** Whether a lesson supports a track, and when it does not, why and what to do instead (LRN-011). */
export function trackSupport(index: LessonIndex, lessonId: string, trackId: string, locale: LessonLocale): TrackSupport {
  if (entryOf(index, lessonId)?.tracks.includes(trackId)) return { supported: true };
  // The lesson's own words first; the generic words of the track only for a lesson that gave none.
  const own = entryOf(index, lessonId)?.unsupported[trackId];
  const track = index.course.tracks.find((candidate) => candidate.id === trackId);
  return {
    supported: false,
    reason: own?.reason[locale] ?? track?.unsupported.reason[locale] ?? '',
    instead: own?.instead[locale] ?? track?.unsupported.instead[locale] ?? '',
  };
}
