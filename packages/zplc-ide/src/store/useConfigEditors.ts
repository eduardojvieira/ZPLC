/**
 * Which configuration editors are open as tabs of the editor area, and which one shows (UX-013). Not saved: a session starts without them.
 */
import { create } from 'zustand';
import type { ConfigEditorKind } from '../navigator/configEditors';

interface ConfigEditorsState {
  open: readonly ConfigEditorKind[];
  active: ConfigEditorKind | null;
  /** Opens the editor as a tab, or shows it when its tab is already there. */
  show: (kind: ConfigEditorKind) => void;
  /** Shows a file or the settings again: no configuration tab is selected. */
  deselect: () => void;
  close: (kind: ConfigEditorKind) => void;
  reset: () => void;
}

export const useConfigEditors = create<ConfigEditorsState>((set) => ({
  open: [],
  active: null,
  show: (kind) => set((state) => ({ open: state.open.includes(kind) ? state.open : [...state.open, kind], active: kind })),
  deselect: () => set((state) => (state.active === null ? state : { active: null })),
  close: (kind) =>
    set((state) => {
      const open = state.open.filter((entry) => entry !== kind);
      return { open, active: state.active === kind ? (open.at(-1) ?? null) : state.active };
    }),
  reset: () => set({ open: [], active: null }),
}));
