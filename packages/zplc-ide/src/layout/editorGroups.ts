/**
 * The editor groups (spec 013, SHL-006): the editor area shows at most two groups side by side. A pure model: the first group
 * holds every open view that is not in `second`, so a tree with no split is exactly the single tab bar of 2.0.
 */
import type { ViewId } from './documentKinds';

export interface EditorGroups {
  /** The views shown in the second group; every other open view is in the first. */
  readonly second: readonly ViewId[];
  readonly activeSecond: ViewId | null;
  readonly focused: 'first' | 'second';
  /** Width of the first group as a share of the area, 0.2 to 0.8. */
  readonly ratio: number;
}

export const MIN_RATIO = 0.2;
export const MAX_RATIO = 0.8;
const DEFAULT_RATIO = 0.5;

export const ONE_GROUP: EditorGroups = { second: [], activeSecond: null, focused: 'first', ratio: DEFAULT_RATIO };

export const clampRatio = (ratio: number): number =>
  Number.isFinite(ratio) ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)) : DEFAULT_RATIO;

/** The split with the views of `second` that are still valid; no view left in either group closes it. */
function normalised(
  groups: EditorGroups,
  second: readonly ViewId[],
  activeSecond: ViewId | null,
  focused: EditorGroups['focused'],
): EditorGroups {
  if (second.length === 0) return ONE_GROUP;
  return {
    ...groups,
    second,
    activeSecond: activeSecond !== null && second.includes(activeSecond) ? activeSecond : second.at(-1)!,
    focused,
  };
}

/**
 * Moves a view to the other group. `open` is every open view: when the move would empty the first group the split closes.
 * The group that receives the view is the one that has the focus afterwards.
 */
export function moveToOther(groups: EditorGroups, view: ViewId, open?: readonly ViewId[]): EditorGroups {
  if (groups.second.includes(view)) {
    return normalised(
      groups,
      groups.second.filter((id) => id !== view),
      groups.activeSecond,
      'first',
    );
  }
  if (open && open.every((id) => id === view || groups.second.includes(id))) return ONE_GROUP;
  return normalised(groups, [...groups.second, view], view, 'second');
}

/** A view closed: the second group closes with its last view. */
export function closeView(groups: EditorGroups, view: ViewId): EditorGroups {
  if (!groups.second.includes(view)) return groups;
  return normalised(
    groups,
    groups.second.filter((id) => id !== view),
    groups.activeSecond,
    groups.focused,
  );
}

/** The groups after the set of open views changed: views that are gone leave the second group. */
export function reconcile(groups: EditorGroups, open: readonly ViewId[]): EditorGroups {
  if (groups.second.length === 0) return groups;
  const second = groups.second.filter((id) => open.includes(id));
  const firstEmpty = open.every((id) => second.includes(id));
  if (firstEmpty) return ONE_GROUP;
  return second.length === groups.second.length ? groups : normalised(groups, second, groups.activeSecond, groups.focused);
}

/** One group below the compact width (UX-023): the second group's views become tabs of the first, and come back when the window widens. */
export const shownGroups = (groups: EditorGroups, compact: boolean): 1 | 2 => (groups.second.length > 0 && !compact ? 2 : 1);
