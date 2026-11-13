// Alternative sibling lessons (M7-K5): `X` and `X-ladder` that share the scenario and do not require each other.
import { describe, expect, it } from 'bun:test';
import { LESSON_INDEX } from '../generated/lessonIndex';
import twoZeroIds from '../../../../tools/ci/two-zero-lesson-ids.json';
import type { LessonIndex, LessonIndexEntry } from './lessonPackage';
import { alternativeOf, alternativePairs } from './lessonSiblings';

/** The 2.0 lessons of the generated index (tools/ci/two-zero-lesson-ids.json): the owner fixed 2.0 at 68 lessons and no pair. */
const TWO_ZERO = new Set<string>(twoZeroIds);
const INDEX_2_0: LessonIndex = { ...LESSON_INDEX, lessons: LESSON_INDEX.lessons.filter((lesson) => TWO_ZERO.has(lesson.id)) };

const BASE = INDEX_2_0.lessons.find((lesson) => lesson.id === 'first-blink-simulation')!;

/** The index of 2.0 plus a Ladder twin of `first-blink-simulation`, changed by `over`. */
function withTwin(over: Partial<LessonIndexEntry> = {}, baseOver: Partial<LessonIndexEntry> = {}): LessonIndex {
  const twin = { ...BASE, id: `${BASE.id}-ladder`, order: BASE.order + 0.5, ...over };
  const lessons = INDEX_2_0.lessons.map((lesson) => (lesson.id === BASE.id ? { ...lesson, ...baseOver } : lesson));
  return { ...INDEX_2_0, lessons: [...lessons, twin] };
}

describe('the alternative pairs', () => {
  it('2.0 has none: its -ladder lessons either require their ST twin or have none (the 2.0 total stays 68)', () => {
    expect(alternativePairs(INDEX_2_0)).toEqual([]);
    expect(INDEX_2_0.lessons).toHaveLength(68);
    // On the whole course too: no alternative pair holds a lesson of 2.0.
    expect(alternativePairs(LESSON_INDEX).filter((pair) => pair.some((id) => TWO_ZERO.has(id)))).toEqual([]);
    expect(alternativeOf(INDEX_2_0, 'tank-level-fault-reset-ladder')).toBeUndefined();
  });

  it('a -ladder lesson with the same scenario hash and no prerequisite link is an alternative of its twin, both ways', () => {
    const index = withTwin();
    expect(alternativePairs(index)).toEqual([[BASE.id, `${BASE.id}-ladder`]]);
    expect(alternativeOf(index, BASE.id)).toBe(`${BASE.id}-ladder`);
    expect(alternativeOf(index, `${BASE.id}-ladder`)).toBe(BASE.id);
  });

  it('is not a pair when the scenario hash differs or when either names the other as a prerequisite', () => {
    const other = { ...BASE.scenario, sha256: 'f'.repeat(64) };
    expect(alternativePairs(withTwin({ scenario: other }))).toEqual([]);
    expect(alternativePairs(withTwin({ prerequisites: [BASE.id] }))).toEqual([]);
    expect(alternativePairs(withTwin({}, { prerequisites: [`${BASE.id}-ladder`] }))).toEqual([]);
  });
});
