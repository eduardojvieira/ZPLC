/**
 * What the Learn surfaces share besides the progress (LRN-001, LRN-004): whether the Learn home is showing, and the lesson the
 * lesson surface of the sidebar shows. Both are about the window, not about the learner, so they are not saved: a restart
 * opens the shell as it was, and the progress says which lesson to continue.
 */
import { create } from 'zustand';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { useIDEStore } from '../store/useIDEStore';
import { useShellLayout } from '../store/useShellLayout';
import { writeProjectConfig } from '../utils/fileSystem';
import { parseAndMigrateProject } from '../project/projectModel';
import { loadProject, loadProjectAssets } from '../utils/projectLoader';
import { openLessonWorkspaceFolder } from './managedWorkspace';
import { createWorkspaceMemory, openLessonWorkspace, type WorkspaceDeps } from './lessonWorkspace';
import { restoreStarterFiles } from './restoreStarter';
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
  /**
   * Starts a lesson: its workspace opens, the lesson is noted as started, the home closes and the sidebar shows it. False when it did not
   * open.
   */
  startLesson(id: string): Promise<boolean>;
  /** The lesson whose workspace the window has open, and the project session it was opened in; a new session means it is no longer open. */
  workspace: { lessonId: string; session: number } | null;
  /** Puts the starter files of the open workspace back and reloads the project. False when it could not. */
  restoreLesson(id: string): Promise<boolean>;
}

const memory = createWorkspaceMemory(
  typeof window === 'undefined'
    ? undefined
    : (() => {
        try {
          return window.localStorage;
        } catch {
          return undefined;
        }
      })(),
);

/** True where the main process owns the lesson workspaces: the desktop app, whose preload offers the one typed operation. */
const managedWorkspaces = (): boolean =>
  typeof window !== 'undefined' && window.electronAPI?.learnWorkspace !== undefined && window.electronAPI?.projectFiles !== undefined;

/** The steps of opening a lesson workspace, over the store of the window and its recent folders. */
const workspaceDeps = (): WorkspaceDeps => ({
  memory,
  recents: async () => {
    await useIDEStore.getState().refreshRecentProjects();
    return useIDEStore.getState().recentProjects;
  },
  openRecent: (recentId) => useIDEStore.getState().openRecentProject(recentId),
  createWorkspace: (project) => useIDEStore.getState().copyExampleProjectToFolder(project),
  ...(managedWorkspaces() ? { openManaged: (lessonId: string, project: string) => openLessonWorkspaceFolder(lessonId, project) } : {}),
  now: () => Date.now(),
  wait: (ms) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    }),
});

export const useLearnUi = create<LearnUiState>()((set, get) => ({
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
      const outcome = await openLessonWorkspace(workspaceDeps(), id, entry.starter.project);
      if (outcome === 'cancelled') return false;
      void useLearnProgress.getState().note({ lessonId: id, started: true, last: true });
      set({ selected: id, homeOpen: false, workspace: { lessonId: id, session: useIDEStore.getState().projectSession } });
      useShellLayout.getState().showActivity('learn');
      return true;
    } finally {
      set({ starting: false });
    }
  },
  workspace: null,
  async restoreLesson(id) {
    const entry = LESSON_INDEX.lessons.find((lesson) => lesson.id === id);
    const { workspace } = get();
    const store = useIDEStore.getState();
    const managed = managedWorkspaces();
    const recentId = memory.get(id);
    const loaded = entry ? loadProject(entry.starter.project) : null;
    const assets = entry ? loadProjectAssets(entry.starter.project) : null;
    // The starter's project file without its `$schema`, as the copy of a new workspace writes it.
    const portable: Record<string, unknown> | null = loaded ? { ...loaded.zplcConfig } : null;
    if (portable) delete portable.$schema;
    const parsed = portable ? parseAndMigrateProject(portable) : null;
    if (
      !entry ||
      !workspace ||
      workspace.lessonId !== id ||
      workspace.session !== store.projectSession ||
      (!managed && !recentId) ||
      !store.directoryHandle ||
      !assets ||
      !parsed?.ok
    )
      return false;
    try {
      await restoreStarterFiles(store.directoryHandle, assets);
      await writeProjectConfig(store.directoryHandle, parsed.project);
    } catch {
      return false;
    }
    // The editor reads the folder again: closing discards the buffers of the files that were just rewritten, which is what was confirmed.
    if (!store.closeProject({ discardUnsaved: true })) return false;
    const reopened = managed
      ? (await openLessonWorkspaceFolder(id, entry.starter.project)) !== false
      : await useIDEStore.getState().openRecentProject(recentId!);
    if (reopened) set({ workspace: { lessonId: id, session: useIDEStore.getState().projectSession } });
    return reopened;
  },
}));

/** The one way in from the Welcome screen, the rail and the Help menu: the home over the editor, the lessons in the sidebar. */
export function openLearnHome(): void {
  useLearnUi.getState().showHome();
  useShellLayout.getState().showActivity('learn');
}
