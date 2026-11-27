/**
 * The reading frame and the lesson layout (GDE-006, GDE-007). `reading` is true while a reading page covers the workbench: the
 * command bar's run controls, the status rail and the results panel are out of the tab order then, so a try-it lab's own controls
 * (LRN-041) are the only run controls on screen. `applyLessonLayout` is what Practice and "Lesson layout" do.
 */
import { create } from 'zustand';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { useLearnUi } from '../learn/learnUi';
import { findFileInTree, fileTreeFileId } from '../utils/fileSystem';
import { useIDEStore } from './useIDEStore';
import { usePlantDocument } from './usePlantDocument';
import { useShellLayout } from './useShellLayout';

interface LearnLayoutState {
  reading: boolean;
  setReading: (reading: boolean) => void;
}

export const useLearnLayout = create<LearnLayoutState>((set) => ({
  reading: false,
  setReading: (reading) => set({ reading }),
}));

/** The lesson's first file, the plant beside it when the lesson names a plant or a scene, and the Guide. */
export function applyLessonLayout(lessonId?: string): void {
  const id = lessonId ?? useLearnUi.getState().workspace?.lessonId;
  const entry = LESSON_INDEX.lessons.find((lesson) => lesson.id === id);
  if (!entry) return;
  const { fileTree, openFile } = useIDEStore.getState();
  if (fileTree && findFileInTree(fileTree, entry.starter.program)) void openFile(fileTreeFileId(entry.starter.program));
  if (entry.plant !== null || entry.scene !== undefined) usePlantDocument.getState().show();
  useShellLayout.getState().setSecondaryVisible(true);
}
