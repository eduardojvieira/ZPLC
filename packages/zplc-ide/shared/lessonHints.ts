/**
 * The one rule of which hints a learner or an agent sees (CRS-017): the last hint is the full answer, so with solutions hidden
 * it is left out. The Guide, the assistant context and `zplc://lesson/current` all read it here.
 */
export function visibleHints<T>(hints: readonly T[], solutionsHidden: boolean): readonly T[] {
  return solutionsHidden ? hints.slice(0, -1) : hints;
}
