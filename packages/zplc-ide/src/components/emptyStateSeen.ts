/**
 * Which regions already had their first-time empty state acted on (GDE-012). Persisted per region, in a key of its own (the layout
 * store keeps its own version), so the empty state names its next action once and then stays quiet.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type EmptyRegion = 'problems' | 'tests' | 'output' | 'trace' | 'watch' | 'navigator';
export const EMPTY_STATE_KEY = 'zplc-empty-state-seen.v1';

interface Seen {
  taken: Partial<Record<EmptyRegion, true>>;
}
// The window's localStorage is looked up at each call, not when the module loads: persist drops itself when its storage is missing at
// creation, which happens when the module is first imported without a window (a test file before the DOM is set up).
const storage = createJSONStorage<Seen>(() => ({
  getItem: (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: (key, value) => globalThis.localStorage?.setItem(key, value),
  removeItem: (key) => globalThis.localStorage?.removeItem(key),
}));
export const useEmptyStateSeen = create<Seen>()(persist<Seen>(() => ({ taken: {} }), { name: EMPTY_STATE_KEY, storage }));

export const markEmptyStateSeen = (region: EmptyRegion) =>
  useEmptyStateSeen.setState((seen) => ({ taken: { ...seen.taken, [region]: true } }));
