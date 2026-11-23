/**
 * Back and Forward through the places visited (FND-006). A place is a file, and where in it. The history follows the IDE store's
 * active file and compiler navigation target, so every way of arriving (tab, navigator, problem, search result, reference)
 * lands here without its caller knowing. Going back reopens a place through `openPlace` and records nothing.
 */
import { create } from 'zustand';
import { currentElementSelection } from '../editors/elementSelectionRequests';
import type { SourceElementId } from '../models/sourceElements';
import { openPlace } from '../refs/openPlace';
import { useIDEStore } from './useIDEStore';

export const HISTORY_LIMIT = 50;

export interface VisitedPlace {
  file: string;
  line?: number;
  element?: SourceElementId;
}

interface NavigationHistoryState {
  places: readonly VisitedPlace[];
  /** The place shown now; -1 when nothing was visited. */
  index: number;
}

interface NavigationHistoryActions {
  /** A place was reached: it replaces the one shown when it is the same file (more exact), else it follows it. */
  record: (place: VisitedPlace) => void;
  back: () => Promise<void>;
  forward: () => Promise<void>;
  reset: () => void;
}

/** True while a place reopened by back or forward is arriving, so that the arrival is not recorded again. */
let replaying = false;

const same = (a: VisitedPlace, b: VisitedPlace): boolean => a.file === b.file && a.line === b.line && a.element === b.element;

const reopen = async (place: VisitedPlace): Promise<void> => {
  replaying = true;
  try {
    await openPlace(
      place.element !== undefined
        ? { kind: 'element', file: place.file, element: place.element, field: '' }
        : { kind: 'text', file: place.file, line: place.line ?? 1, column: 1, length: 0 },
    );
  } finally {
    replaying = false;
  }
};

export const useNavigationHistory = create<NavigationHistoryState & NavigationHistoryActions>((set, get) => ({
  places: [],
  index: -1,
  record: (place) =>
    set(({ places, index }) => {
      const current = places[index];
      if (current && same(current, place)) return {};
      // arriving at the file already shown, now with a position, makes that place exact instead of a new one
      if (current && current.file === place.file && current.line === undefined && current.element === undefined) {
        return { places: [...places.slice(0, index), place] };
      }
      const kept = [...places.slice(0, index + 1), place].slice(-HISTORY_LIMIT);
      return { places: kept, index: kept.length - 1 };
    }),
  back: async () => {
    const { places, index } = get();
    if (index <= 0) return;
    set({ index: index - 1 });
    await reopen(places[index - 1]!);
  },
  forward: async () => {
    const { places, index } = get();
    if (index < 0 || index >= places.length - 1) return;
    set({ index: index + 1 });
    await reopen(places[index + 1]!);
  },
  reset: () => set({ places: [], index: -1 }),
}));

/** Follows the IDE store; returns the function that stops it. */
export function watchNavigation(): () => void {
  return useIDEStore.subscribe((state, previous) => {
    if (replaying) return;
    const pathOf = (id: string | null): string | undefined => (id ? state.loadedFiles.get(id)?.path : undefined);
    const target = state.compilerNavigationTarget;
    if (target && target !== previous.compilerNavigationTarget) {
      const asked = currentElementSelection();
      const element = asked?.file === target.file ? asked.element : undefined;
      useNavigationHistory.getState().record({ file: target.file, line: target.line, ...(element ? { element } : {}) });
    } else if (state.activeFileId !== previous.activeFileId) {
      const file = pathOf(state.activeFileId);
      if (file) useNavigationHistory.getState().record({ file });
    }
    if (state.projectSession !== previous.projectSession) useNavigationHistory.getState().reset();
  });
}

/** What a step of the place bar asks the object navigator to show: its group expanded and, if named, the item revealed. */
interface NavigatorRevealState {
  group: string | null;
  item: string | null;
  /** Changes with every request, so asking again for the same group still counts. */
  nonce: number;
  reveal: (group: string | null, item?: string | null) => void;
}

export const useNavigatorReveal = create<NavigatorRevealState>((set) => ({
  group: null,
  item: null,
  nonce: 0,
  reveal: (group, item = null) => set((state) => ({ group, item, nonce: state.nonce + 1 })),
}));
