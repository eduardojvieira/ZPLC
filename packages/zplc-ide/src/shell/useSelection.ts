/**
 * The current selection of the workbench (SHL-009, plan-u2.md C-S): the diagram element a visual editor selected and the
 * test the Tests activity selected. The Inspector, the reference commands and the test commands read it from here; the
 * editors and the activity publish into it.
 */
import { create } from 'zustand';
import type { SourceElementId } from '../models/sourceElements';

export interface SelectedElement {
  file: string;
  element: SourceElementId;
  names: readonly string[];
}

interface SelectionState {
  element: SelectedElement | null;
  test: string | null;
  setElement: (element: SelectedElement | null) => void;
  setTest: (test: string | null) => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  element: null,
  test: null,
  setElement: (element) => set({ element }),
  setTest: (test) => set({ test }),
  clear: () => set({ element: null, test: null }),
}));
