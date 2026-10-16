import { navigationTarget, type Orientation } from './keyboard';

export interface TabKeyResult {
  /** The tab that takes focus, or null. */
  focus: number | null;
  /** The tab that becomes selected, or null. */
  select: number | null;
}

/**
 * What a key does in a tab list (WAI-ARIA tabs pattern): arrows, Home and End move focus and, with automatic
 * activation, select; with manual activation Enter or Space selects the focused tab.
 */
export function tabKeyResult(key: string, index: number, tabs: ReadonlyArray<{ disabled?: boolean }>, orientation: Orientation, activation: 'automatic' | 'manual'): TabKeyResult {
  const target = navigationTarget(key, index, tabs.length, { orientation, isDisabled: (item) => tabs[item]?.disabled === true });
  if (target !== null) return { focus: target, select: activation === 'automatic' ? target : null };
  if ((key === 'Enter' || key === ' ') && activation === 'manual' && tabs[index]?.disabled !== true) return { focus: null, select: index };
  return { focus: null, select: null };
}
