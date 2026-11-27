/**
 * Which regions already had their first-time empty state acted on (GDE-012). Persisted per region, in a key of its own (the layout
 * store keeps its own version), so the empty state names its next action once and then stays quiet.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type EmptyRegion = 'problems' | 'tests' | 'output' | 'trace' | 'watch' | 'navigator';
export const EMPTY_STATE_KEY = 'zplc-empty-state-seen.v1';

interface Seen {
  taken: Partial<Record<EmptyRegion, true>>;
}
export const useEmptyStateSeen = create<Seen>()(persist<Seen>(() => ({ taken: {} }), { name: EMPTY_STATE_KEY }));

export const markEmptyStateSeen = (region: EmptyRegion) =>
  useEmptyStateSeen.setState((seen) => ({ taken: { ...seen.taken, [region]: true } }));
