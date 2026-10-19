/**
 * Opens the app-owned workspace of a lesson as the project (LRN-003): the main process builds and adopts the folder
 * (`openLearnWorkspaceFolder`), and the store opens it like any copied example, copying the starter in only when the folder is new.
 */
import { openLearnWorkspaceFolder } from '../ipc/projectFilesHandles';
import { useIDEStore } from '../store/useIDEStore';

export async function openLessonWorkspaceFolder(lessonId: string, starterProject: string): Promise<'created' | 'reopened' | false> {
  const files = typeof window === 'undefined' ? undefined : window.electronAPI?.projectFiles;
  const learn = typeof window === 'undefined' ? undefined : window.electronAPI?.learnWorkspace;
  if (!files || !learn) return false;
  let fresh = false;
  const opened = await useIDEStore.getState().copyExampleProjectToFolder(starterProject, async () => {
    const workspace = await openLearnWorkspaceFolder(files, learn, lessonId);
    fresh = workspace.fresh;
    return { handle: workspace.handle, seed: workspace.fresh };
  });
  return opened ? (fresh ? 'created' : 'reopened') : false;
}
