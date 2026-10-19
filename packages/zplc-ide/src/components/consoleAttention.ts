/**
 * @file consoleAttention.ts
 * @brief What the results panel does to be seen (IDE-020): the problems come errors first, and a view that received
 * messages while another was visible says how many it holds that were not seen.
 */

import { useState } from 'react';

const SEVERITY: Record<string, number> = { error: 0, warning: 1, info: 2 };

/** The problems with the errors first, then the warnings, then the information; the order inside a kind is kept. */
export function orderProblems<T extends { type: string }>(messages: readonly T[]): T[] {
  return messages.map((message, index) => ({ message, index }))
    .sort((a, b) => (SEVERITY[a.message.type] ?? 3) - (SEVERITY[b.message.type] ?? 3) || a.index - b.index)
    .map(({ message }) => message);
}

export type ViewTotals = Record<string, number>;

/** How many messages each view holds that arrived after it was last seen. A view cleared below what was seen holds none. */
export function unseenCounts(totals: ViewTotals, seen: ViewTotals): ViewTotals {
  return Object.fromEntries(Object.entries(totals).map(([view, total]) => [view, Math.max(0, total - (seen[view] ?? 0))]));
}

/** What has been seen once `visible` is on screen: that view up to its total, every other view up to the less of its total and what it was. */
export function seenAfter(seen: ViewTotals, totals: ViewTotals, visible: string): ViewTotals {
  return Object.fromEntries(Object.entries(totals).map(([view, total]) => [view, view === visible ? total : Math.min(total, seen[view] ?? 0)]));
}

/** The unseen count of each view, for the view that is not on screen. The seen counts are adjusted while rendering, as React advises. */
export function useUnseen(totals: ViewTotals, visible: string): ViewTotals {
  const [seen, setSeen] = useState<ViewTotals>(() => totals);
  const now = seenAfter(seen, totals, visible);
  if (JSON.stringify(now) !== JSON.stringify(seen)) setSeen(now);
  return unseenCounts(totals, now);
}
