// The sibling equivalence rule in the course (M7-K5): a prerequisite is met by it or by its alternative; passed is never shared.
import { describe, expect, it } from 'bun:test';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { emptyProgress, withPassedIds } from '../../shared/learnProgressModel';
import { buildCourseView, courseOrder, lessonStateOf } from './course';
import type { LessonIndex } from './lessonPackage';

const ST = 'first-blink-simulation';
const LADDER = `${ST}-ladder`;
const NEXT = 'scan-cycle-one-scan-memory'; // requires ST
const passed = (...ids: string[]) => withPassedIds(emptyProgress(), ids);
/** The 2.0 index plus a Ladder twin of the first lesson. */
const withTwin = (): LessonIndex => {
  const base = LESSON_INDEX.lessons.find((lesson) => lesson.id === ST)!;
  return { ...LESSON_INDEX, lessons: [...LESSON_INDEX.lessons, { ...base, id: LADDER, order: base.order + 0.5 }] };
};
const opts = { locale: 'en', unlockAll: false } as const;

describe('lessonStateOf with an alternative sibling', () => {
  const index = withTwin();

  it('opens what follows when only the sibling is passed, and the sibling not taken is available, never passed', () => {
    expect(lessonStateOf(index, NEXT, passed(LADDER), false)).toEqual({ state: 'available', missing: [] });
    expect(lessonStateOf(index, ST, passed(LADDER), false)).toEqual({ state: 'available', missing: [] });
    expect(lessonStateOf(index, NEXT, emptyProgress(), false)).toEqual({ state: 'locked', missing: [ST] });
  });

  it('writes nothing in the progress', () => {
    const progress = passed(LADDER);
    const before = JSON.stringify(progress);
    lessonStateOf(index, NEXT, progress, false);
    buildCourseView(index, progress, opts);
    expect(JSON.stringify(progress)).toBe(before);
  });

  it('keeps the 2.0 states of a 2.0-only index (no pair, nothing shared)', () => {
    expect(lessonStateOf(LESSON_INDEX, NEXT, passed('tank-level-fault-reset-ladder'), false)).toEqual({ state: 'locked', missing: [ST] });
    expect(lessonStateOf(LESSON_INDEX, NEXT, passed(ST), false).state).toBe('available');
  });
});

describe('courseOrder with siblings', () => {
  it('puts the two alternatives next to each other', () => {
    const ids = courseOrder(withTwin()).map((lesson) => lesson.id);
    expect(ids.indexOf(LADDER)).toBe(ids.indexOf(ST) + 1);
  });

  it('keeps the order of the 2.0 lessons when a pair is added', () => {
    const ids = courseOrder(LESSON_INDEX).map((lesson) => lesson.id);
    expect(
      courseOrder(withTwin())
        .map((lesson) => lesson.id)
        .filter((id) => id !== LADDER),
    ).toEqual(ids);
    expect(ids).toHaveLength(68);
  });
});
