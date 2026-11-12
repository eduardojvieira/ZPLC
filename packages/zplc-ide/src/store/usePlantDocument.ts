/**
 * Whether the plant document (spec 013 PLS-001) is open in the editor area, and whether it is the active view. The area
 * lists the plant among its views while `open`; `requests` counts the asks to show it, so that the area can place the
 * document beside the program once per ask (SHL-006) and not on every render.
 */
import { create } from 'zustand';

interface PlantDocumentState {
  open: boolean;
  active: boolean;
  requests: number;
  /** Opens the document and makes it the active view. */
  show: () => void;
  /** Makes another view active: the document stays open. */
  deselect: () => void;
  select: () => void;
  close: () => void;
}

export const usePlantDocument = create<PlantDocumentState>((set) => ({
  open: false,
  active: false,
  requests: 0,
  show: () => set((state) => ({ open: true, active: true, requests: state.requests + 1 })),
  deselect: () => set((state) => (state.active ? { active: false } : state)),
  select: () => set((state) => (state.open && !state.active ? { active: true } : state)),
  close: () => set((state) => (state.open ? { open: false, active: false } : state)),
}));
