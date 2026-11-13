// The sibling equivalence rule in the course (M7-K5): a prerequisite is met by it or by its alternative; passed is never shared.
import { describe, expect, it } from 'bun:test';
import { LESSON_INDEX } from '../generated/lessonIndex';
import twoZeroIds from '../../../../tools/ci/two-zero-lesson-ids.json';
import { emptyProgress, withPassedIds } from '../../shared/learnProgressModel';
import { buildCourseView, courseOrder, lessonStateOf } from './course';
import type { LessonIndex } from './lessonPackage';

/** The 2.0 lessons of the generated index (tools/ci/two-zero-lesson-ids.json): the owner fixed 2.0 at 68 lessons and no pair. */
const TWO_ZERO = new Set<string>(twoZeroIds);
const INDEX_2_0: LessonIndex = { ...LESSON_INDEX, lessons: LESSON_INDEX.lessons.filter((lesson) => TWO_ZERO.has(lesson.id)) };

const ST = 'first-blink-simulation';
const LADDER = `${ST}-ladder`;
const NEXT = 'scan-cycle-one-scan-memory'; // requires ST
const passed = (...ids: string[]) => withPassedIds(emptyProgress(), ids);
/** The 2.0 index plus a Ladder twin of the first lesson. */
const withTwin = (): LessonIndex => {
  const base = INDEX_2_0.lessons.find((lesson) => lesson.id === ST)!;
  return { ...INDEX_2_0, lessons: [...INDEX_2_0.lessons, { ...base, id: LADDER, order: base.order + 0.5 }] };
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
    expect(lessonStateOf(INDEX_2_0, NEXT, passed('tank-level-fault-reset-ladder'), false)).toEqual({ state: 'locked', missing: [ST] });
    expect(lessonStateOf(INDEX_2_0, NEXT, passed(ST), false).state).toBe('available');
  });
});

describe('courseOrder with siblings', () => {
  it('puts the two alternatives next to each other', () => {
    const ids = courseOrder(withTwin()).map((lesson) => lesson.id);
    expect(ids.indexOf(LADDER)).toBe(ids.indexOf(ST) + 1);
  });

  it('keeps the order of the 2.0 lessons when a pair is added', () => {
    const ids = courseOrder(INDEX_2_0).map((lesson) => lesson.id);
    expect(
      courseOrder(withTwin())
        .map((lesson) => lesson.id)
        .filter((id) => id !== LADDER),
    ).toEqual(ids);
    expect(ids).toHaveLength(68);
  });
});

describe('the course counter with alternative siblings', () => {
  const index = withTwin();
  const count = (ids: string[], source = index) => {
    const { passed: done, total } = buildCourseView(source, passed(...ids), opts);
    return [done, total];
  };

  it('counts the pair once in the total, and once in passed whichever sibling (or both) was passed', () => {
    expect(count([])).toEqual([0, 68]);
    expect(count([ST])).toEqual([1, 68]);
    expect(count([LADDER])).toEqual([1, 68]);
    expect(count([ST, LADDER])).toEqual([1, 68]);
    expect(count([ST, LADDER, NEXT])).toEqual([2, 68]);
  });

  it('keeps the 2.0 counter of a 2.0-only index', () => {
    expect(count([], INDEX_2_0)).toEqual([0, 68]);
    expect(count([ST, NEXT, 'tank-level-fault-reset-ladder'], INDEX_2_0)).toEqual([3, 68]);
  });

  it('does not change a path counter: a path holds one sibling', () => {
    const paths = buildCourseView(index, passed(LADDER), opts).paths;
    const plain = buildCourseView(INDEX_2_0, passed(ST), opts).paths;
    expect(paths.map((path) => [path.passed, path.total])).toEqual(plain.map((path) => [path.passed, path.total]));
  });
});
