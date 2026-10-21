/**
 * What each region of the window subscribes to (IDE-013).
 *
 * A component that subscribes to the whole store is rendered again on every change of the store: with 200 watched
 * values read ten times a second, and a person typing in a long file, that is every region of the window, many times a
 * second. A region subscribes to the fields it shows; the lists are here so that a test can count how often a
 * region's selection changes under that load (`regionSubscriptions.test.ts`), and so that a component names
 * what it reads instead of taking everything.
 *
 *   const { activeFileId, openTabs } = useEditorAreaState();
 */

import { useShallow } from 'zustand/react/shallow';
import { useIDEStore, type IDEState } from './useIDEStore';

/** A selector of the named fields of the store; used with `useShallow`, a component renders again when one of them changes. */
export function pickState<K extends keyof IDEState>(...keys: readonly K[]): (state: IDEState) => Pick<IDEState, K> {
  return (state) => {
    const picked = {} as Pick<IDEState, K>;
    for (const key of keys) picked[key] = state[key];
    return picked;
  };
}

/** The tab bar and the editor of the active file. The files of the open tabs are selected apart: see `selectOpenFiles`. */
export const selectEditorAreaState = pickState(
  'activeFileId',
  'openTabs',
  'setActiveFile',
  'closeTab',
  'discardFile',
  'saveFile',
  'updateFileContent',
  'showSettings',
  'toggleSettings',
  'getActiveFile',
  'getFile',
  'projectSession',
);

/** The files of the open tabs: the tab bar and the visual editors render again when one of them changes. */
export const selectOpenFiles = (state: IDEState) => state.openTabs.map((id) => state.loadedFiles.get(id));

/** The name, language and path of the active file: what a region that does not show its content needs. */
export const selectActiveFileInfo = (state: IDEState) => {
  const file = state.activeFileId ? state.loadedFiles.get(state.activeFileId) : undefined;
  return file ? { id: file.id, name: file.name, language: file.language, path: file.path } : null;
};

export const selectToolbarState = pickState(
  'addConsoleEntry',
  'addCompilerMessage',
  'clearCompilerMessages',
  'markCompilerMessagesChecked',
  'toggleSettings',
  'saveFile',
  'getActiveFile',
  'activeFileId',
  'projectSession',
  'workspaceScenarioLink',
  'hasUnsavedChanges',
);

export const selectConsoleState = pickState(
  'consoleEntries',
  'activeConsoleTab',
  'compilerMessages',
  'compilerMessagesChecked',
  'stBufferDiagnostics',
  'activeFileId',
  'loadedFiles',
  'isConsoleCollapsed',
  'toggleConsole',
  'setActiveConsoleTab',
  'clearConsole',
  'clearCompilerMessages',
  'clearNativeTrace',
  'fileTree',
  'navigateToCompilerDiagnostic',
  'isProjectOpen',
  'projectSession',
  'compilerRunId',
  'workspaceScenarioLink',
  'canonicalWorkspaceBuildEvidence',
  'linkWorkspaceScenarios',
  'hasUnsavedChanges',
  'saveAllFiles',
  'saveProjectConfig',
  'saveFile',
  'updateFileContent',
);

export const selectSidebarState = pickState(
  'projectName',
  'projectMigrationPreview',
  'fileTree',
  'activeFileId',
  'toggleDirectory',
  'openFile',
  'deleteFile',
  'refreshFileTree',
);

export const selectWelcomeState = pickState(
  'openProjectFromFolder',
  'createNewProjectInFolder',
  'copyExampleProjectToFolder',
  'startLearning',
  'getExampleProjects',
  'projectOpenError',
  'recentProjects',
  'refreshRecentProjects',
  'openRecentProject',
  'forgetRecentProject',
);

export const selectThemeState = pickState('theme', 'setTheme');

export const selectProjectSettingsState = pickState('projectConfig', 'saveProjectConfig', 'updateProjectConfig');

export const selectFileTreeState = pickState('fileTree');

// The hooks of the regions: a component renders again when one of the fields it names changes, and not otherwise.
export const useEditorAreaState = () => useIDEStore(useShallow(selectEditorAreaState));
/** The files of the open tabs: the region that shows them renders again when one is typed in. */
export const useOpenFiles = () => useIDEStore(useShallow(selectOpenFiles));
export const useActiveFileInfo = () => useIDEStore(useShallow(selectActiveFileInfo));
export const useToolbarState = () => useIDEStore(useShallow(selectToolbarState));
export const useConsoleState = () => useIDEStore(useShallow(selectConsoleState));
export const useSidebarState = () => useIDEStore(useShallow(selectSidebarState));
export const useWelcomeState = () => useIDEStore(useShallow(selectWelcomeState));
export const useThemeState = () => useIDEStore(useShallow(selectThemeState));
export const useProjectSettingsState = () => useIDEStore(useShallow(selectProjectSettingsState));
export const useFileTreeState = () => useIDEStore(useShallow(selectFileTreeState));

/** Every region and what it selects, for the test that counts how often each one would render. */
export const REGION_SELECTORS = {
  editorArea: selectEditorAreaState,
  openFiles: selectOpenFiles,
  activeFileInfo: selectActiveFileInfo,
  toolbar: selectToolbarState,
  console: selectConsoleState,
  sidebar: selectSidebarState,
  welcome: selectWelcomeState,
  theme: selectThemeState,
  projectSettings: selectProjectSettingsState,
  fileTree: selectFileTreeState,
} as const;
