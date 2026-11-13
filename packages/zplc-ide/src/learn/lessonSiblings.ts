/**
 * Alternative sibling lessons (M7-K5): `X` and `X-ladder` that both exist, share the scenario hash, and neither names the other as a
 * prerequisite. A learner takes one of them; passing either meets a requirement of the other. Derived from the index when it is read;
 * nothing is stored. In 2.0 `tank-level-fault-reset-ladder` shares a hash with its twin but requires it, so 2.0 has no pair.
 */
import type { LessonIndex } from './lessonPackage';

const SUFFIX = '-ladder';

/** The pairs `[X, X-ladder]`, in index order. */
export function alternativePairs(index: LessonIndex): ReadonlyArray<readonly [string, string]> {
  const byId = new Map(index.lessons.map((lesson) => [lesson.id, lesson]));
  return index.lessons.flatMap((ladder) => {
    if (!ladder.id.endsWith(SUFFIX)) return [];
    const base = byId.get(ladder.id.slice(0, -SUFFIX.length));
    const linked = base && (base.prerequisites.includes(ladder.id) || ladder.prerequisites.includes(base.id));
    return base && !linked && base.scenario.sha256 === ladder.scenario.sha256 ? [[base.id, ladder.id] as const] : [];
  });
}

/** The alternative of a lesson, or undefined when it has none. */
export function alternativeOf(index: LessonIndex, id: string): string | undefined {
  const pair = alternativePairs(index).find((ids) => ids.includes(id));
  return pair?.find((other) => other !== id);
}
