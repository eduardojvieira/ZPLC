/**
 * What the Learn surfaces share besides the progress (LRN-001, LRN-004): whether the Learn home is showing, and the lesson the
 * lesson surface of the sidebar shows. Both are about the window, not about the learner, so they are not saved: a restart
 * opens the shell as it was, and the progress says which lesson to continue.
 */
import { create } from 'zustand';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { useIDEStore } from '../store/useIDEStore';
import { useShellLayout } from '../store/useShellLayout';
import { useLearnProgress } from './progressState';

export interface LearnUiState {
  homeOpen: boolean;
  /** The lesson the sidebar shows; null until the learner or the home picks one, then the last lesson of the progress is used. */
  selected: string | null;
  showHome(): void;
  hideHome(): void;
  select(id: string | null): void;
  /** A lesson is being started: the workspace is being made or reopened. */
  starting: boolean;
  /** Starts a lesson: its workspace opens, the lesson is noted as started, the home closes and the sidebar shows it. False when it did not open. */
  startLesson(id: string): Promise<boolean>;
}

export const useLearnUi = create<LearnUiState>()((set) => ({
  homeOpen: false,
  selected: null,
  showHome: () => set({ homeOpen: true }),
  hideHome: () => set({ homeOpen: false }),
  select: (selected) => set({ selected }),
  starting: false,
  async startLesson(id) {
    const entry = LESSON_INDEX.lessons.find((lesson) => lesson.id === id);
    if (!entry) return false;
    set({ starting: true });
    try {
      const opened = await useIDEStore.getState().startLearning(entry.starter.project);
      if (!opened) return false;
      void useLearnProgress.getState().note({ lessonId: id, started: true, last: true });
      set({ selected: id, homeOpen: false });
      useShellLayout.getState().showActivity('learn');
      return true;
    } finally {
      set({ starting: false });
    }
  },
}));

/** The one way in from the Welcome screen, the rail and the Help menu: the home over the editor, the lessons in the sidebar. */
export function openLearnHome(): void {
  useLearnUi.getState().showHome();
  useShellLayout.getState().showActivity('learn');
}
