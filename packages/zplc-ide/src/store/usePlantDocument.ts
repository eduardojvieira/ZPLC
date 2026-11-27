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
  /** Counts the asks to show the replay of the last recorded run (TST-007). */
  replayRequests: number;
  /** Counts the changes made outside Studio to `scene.json` or `plant-map.json`: the document reads its scene again on each (AIX-012). */
  sceneRevision: number;
  notifyExternalPlantChange: () => void;
  /** Opens the document and makes it the active view. */
  show: () => void;
  /** Makes another view active: the document stays open. */
  /** Opens the document and asks for its replay view. */
  showReplay: () => void;
  deselect: () => void;
  select: () => void;
  close: () => void;
}

export const usePlantDocument = create<PlantDocumentState>((set) => ({
  open: false,
  active: false,
  requests: 0,
  replayRequests: 0,
  sceneRevision: 0,
  notifyExternalPlantChange: () => set((state) => ({ sceneRevision: state.sceneRevision + 1 })),
  show: () => set((state) => ({ open: true, active: true, requests: state.requests + 1 })),
  showReplay: () => set((state) => ({ open: true, active: true, requests: state.requests + 1, replayRequests: state.replayRequests + 1 })),
  deselect: () => set((state) => (state.active ? { active: false } : state)),
  select: () => set((state) => (state.open && !state.active ? { active: true } : state)),
  close: () => set((state) => (state.open ? { open: false, active: false } : state)),
}));
