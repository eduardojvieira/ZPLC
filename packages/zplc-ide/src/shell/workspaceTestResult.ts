/**
 * The latest presentation of the host scenario run, shared so that the lessons in the sidebar can show whether the lesson's check passed.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import type { WorkspaceTestPresentation } from '../components/workspaceTestPresentation';

export const useWorkspaceTestResult = create<{
  presentation: WorkspaceTestPresentation | undefined;
  publish: (presentation: WorkspaceTestPresentation | undefined) => void;
}>((set) => ({
  presentation: undefined,
  publish: (presentation) => set((state) => (state.presentation === presentation ? state : { presentation })),
}));

/** Shares the presentation of the run this component holds; what it shares is removed when it unmounts. */
export function usePublishWorkspaceTestResult(presentation: WorkspaceTestPresentation | undefined): void {
  useEffect(() => {
    useWorkspaceTestResult.getState().publish(presentation);
    return () => useWorkspaceTestResult.getState().publish(undefined);
  }, [presentation]);
}
