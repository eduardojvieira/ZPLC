/**
 * The result of "Find all references" (FND-004) and what the Search view shows for it: the target, the occurrences, and the
 * choice or notice that stands in for them when the cursor or the selection named no single thing. The index is built on demand,
 * by a command or a button, never per keystroke.
 */
import { create } from 'zustand';
import { canonicalAddress } from './addresses';
import type { Place, RefTarget, References } from './contracts';
import type { ReferenceIndex } from './referenceIndex';
import { loadReferenceIndex } from './sources';

export type ReferencesStatus = 'idle' | 'loading' | 'ready' | 'failed';
export type ReferenceAction = 'definition' | 'references';

interface ReferencesState {
  /** `references` shows this store in the Search view; `search` shows the project search. */
  mode: 'search' | 'references';
  target: RefTarget | null;
  result: References | null;
  status: ReferencesStatus;
  /** Several names were possible (a block with many variables): the person picks one. */
  choice: { action: ReferenceAction; targets: readonly RefTarget[] } | null;
  /** A located message in place of a result (MSG-004): nothing was selected. */
  notice: string | null;
  find: (target: RefTarget, load?: () => Promise<ReferenceIndex>) => Promise<void>;
  choose: (action: ReferenceAction, targets: readonly RefTarget[]) => void;
  say: (notice: string) => void;
  setMode: (mode: 'search' | 'references') => void;
  clear: () => void;
}

const EMPTY = { mode: 'search', target: null, result: null, status: 'idle', choice: null, notice: null } as const;

export const useReferences = create<ReferencesState>((set) => ({
  ...EMPTY,
  find: async (target, load = loadReferenceIndex) => {
    set({ ...EMPTY, mode: 'references', target, status: 'loading' });
    try {
      const result = (await load()).referencesOf(target);
      set((state) => (state.target === target ? { result, status: 'ready' } : state));
    } catch {
      set((state) => (state.target === target ? { status: 'failed' } : state));
    }
  },
  choose: (action, targets) => set({ ...EMPTY, mode: 'references', choice: { action, targets } }),
  say: (notice) => set({ ...EMPTY, mode: 'references', notice }),
  setMode: (mode) => set({ mode }),
  clear: () => set({ ...EMPTY }),
}));

export const targetName = (target: RefTarget): string => (target.kind === 'symbol' ? target.name : canonicalAddress(target.address));

/** The group a place belongs to in the list: its file, the configuration file, or the Watch table. */
export const placeFile = (place: Place): string => (place.kind === 'config' ? 'zplc.json' : place.kind === 'watch' ? '' : place.file);

export function summarize(result: References): { uses: number; files: number } {
  return { uses: result.uses.length, files: new Set(result.uses.map((use) => placeFile(use.place))).size };
}
