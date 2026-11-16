/**
 * The current selection of the workbench (SHL-009, plan-u2.md C-S): the diagram element a visual editor selected and the
 * test the Tests activity selected. The Inspector, the reference commands and the test commands read it from here; the
 * editors and the activity publish into it.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import type { SourceElementId } from '../models/sourceElements';
import { presentAiProviderStatus } from '../components/aiProviderPresentation';
import { useLearnUi } from '../learn/learnUi';
import { useIDEStore } from '../store/useIDEStore';

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

/**
 * What a visual editor calls with its selected element (null for none): the element of the active file is published into the store
 * and removed again when the selection changes or the editor unmounts. `names` is the list the element reads or writes (a variable).
 */
export function usePublishSelectedElement(element: SourceElementId | null, names: readonly string[]): void {
  const file = useIDEStore((state) => state.getActiveFile()?.path ?? null);
  const key = names.join('\u0000');
  useEffect(() => {
    if (file === null || element === null) return;
    useSelection.getState().setElement({ file, element, names: key === '' ? [] : key.split('\u0000') });
    return () => useSelection.getState().setElement(null);
  }, [file, element, key]);
}

/** The views of the secondary sidebar (SHL-008): one is shown at a time. */
export type SecondaryView = 'inspector' | 'lesson' | 'assistant';

interface SecondaryViewState {
  /** The person's choice, valid for the lesson it was made for (a new lesson starts on the lesson); null when nobody chose. */
  choice: { view: SecondaryView; lesson: unknown } | null;
  /** The compact shell has no room for the secondary sidebar: its current view is offered in place of the primary one. */
  inPrimary: boolean;
  show: (view: SecondaryView) => void;
  setInPrimary: (inPrimary: boolean) => void;
}

export const useSecondaryView = create<SecondaryViewState>((set) => ({
  choice: null,
  inPrimary: false,
  show: (view) => set({ choice: { view, lesson: useLearnUi.getState().workspace } }),
  setInPrimary: (inPrimary) => set({ inPrimary }),
}));

/** The Assistant exists only while an AI provider is configured and enabled (spec 013 section 4.3). */
export const useAssistantProvider = create<{ available: boolean; refresh: () => Promise<void> }>((set) => ({
  available: false,
  refresh: async () => {
    const provider = window.electronAPI?.aiProvider;
    if (!provider) return set({ available: false });
    try {
      const status = presentAiProviderStatus(await provider.getStatus());
      set({ available: status.kind === 'ready' && status.configured && status.enabled });
    } catch {
      set({ available: false });
    }
  },
}));
