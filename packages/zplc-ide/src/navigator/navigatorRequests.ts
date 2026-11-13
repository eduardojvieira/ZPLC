/**
 * What the commands of the navigator ask (SHL-013): the request store that `NavigatorDialogs` answers, the item the menu named,
 * the create context over the live project, and the close-project command. Apart from drawing it, so a component file
 * exports only components.
 */
import { create } from 'zustand';
import { useIDEStore } from '../store/useIDEStore';
import { useProjectSources } from '../store/projectSources';
import { projectGlobalVariables } from '../project/globalVariables';
import type { CreateContext, ObjectKind } from '../project/newObject';
import type { FileTreeNode, PLCLanguage } from '../types';
import { fileTreeFileId, findFileInTree, listTaskPrograms } from '../utils/fileSystem';
import type { ItemSubject, NavigatorGroupId } from './navigatorGroups';
import { openConfigEditorFromNavigator } from './openConfigEditor';

export type ItemOperation = 'rename' | 'move' | 'delete';

interface NavigatorRequests {
  creating: { kind: ObjectKind; language: PLCLanguage } | null;
  operation: { operation: ItemOperation; subject: ItemSubject } | null;
  /** The item its menu was opened on; the commands act on it, or on the active file when there is none. */
  subject: ItemSubject | null;
  closing: boolean;
}

export const useNavigatorRequests = create<NavigatorRequests>(() => ({ creating: null, operation: null, subject: null, closing: false }));

export const askNew = (kind: ObjectKind, language: PLCLanguage = 'ST'): void =>
  useNavigatorRequests.setState({ creating: { kind, language } });
export const askItem = (operation: ItemOperation, subject: ItemSubject): void =>
  useNavigatorRequests.setState({ operation: { operation, subject } });
export const selectItem = (subject: ItemSubject | null): void => useNavigatorRequests.setState({ subject });

/** The item a command acts on: the one its menu named, else the file that is open. */
export function commandSubject(): ItemSubject | null {
  const { subject } = useNavigatorRequests.getState();
  if (subject) return subject;
  const active = useIDEStore.getState().activeFileId;
  const node = active ? nodeOf(active) : null;
  return node ? { kind: 'path', path: node.path } : null;
}

export function nodeOf(idOrPath: string): FileTreeNode | null {
  const tree = useIDEStore.getState().fileTree;
  if (!tree) return null;
  return findFileInTree(tree, idOrPath.startsWith('file:') ? idOrPath.slice(5) : idOrPath);
}

/** The kind each group creates; the groups of the project file (I/O, communication, device) create nothing. */
export const GROUP_NEW_KIND: Partial<Record<NavigatorGroupId, ObjectKind>> = {
  programs: 'program',
  functionBlocks: 'functionBlock',
  functions: 'function',
  dataTypes: 'dataType',
  globals: 'globals',
  tasks: 'task',
};

const stem = (name: string): string => name.toLowerCase().replace(/\.(st|il|ld\.json|fbd\.json|sfc\.json|ld|fbd|sfc)$/, '');

/** The create context over the live project: the names in use, and the store's own file and configuration operations. */
export function liveCreateContext(): CreateContext {
  const store = useIDEStore.getState();
  const sources = useProjectSources.getState();
  const names = new Set<string>();
  for (const group of sources.declarations) for (const declaration of group.declarations) names.add(declaration.name.toLowerCase());
  for (const variable of projectGlobalVariables(sources.sources)) names.add(variable.name.toLowerCase());
  const visit = (node: FileTreeNode): void => {
    if (node.type === 'file') names.add(stem(node.name));
    node.children?.forEach(visit);
  };
  if (store.fileTree) visit(store.fileTree);
  return {
    takenNames: names,
    programFiles: listTaskPrograms(store.fileTree),
    tasks: () => useIDEStore.getState().projectConfig?.tasks ?? [],
    createFile: async (fileName, language) => {
      const id = await useIDEStore.getState().createFile(fileName, language);
      return useIDEStore.getState().loadedFiles.get(id)?.path ?? id.replace(/^file:/, '');
    },
    writeFile: async (path, content) => {
      const id = fileTreeFileId(path);
      useIDEStore.getState().updateFileContent(id, content);
      await useIDEStore.getState().saveFile(id, { quiet: true });
    },
    setTasks: async (tasks) => {
      useIDEStore.getState().updateProjectConfig({ tasks });
      await useIDEStore.getState().saveProjectConfig();
    },
    open: async (path, line) => {
      if (path === 'zplc.json') openConfigEditorFromNavigator('tasks');
      else await useIDEStore.getState().navigateToCompilerDiagnostic(path, line, 1);
    },
  };
}

/** Closes the project, asking first when something is unsaved (IDE-005); the forced values keep their own refusal. */
export function closeProjectCommand(): void {
  const state = useIDEStore.getState();
  const { forcedValues, forcesUnconfirmed } = state.debug;
  if (forcedValues.size > 0 || forcesUnconfirmed) {
    state.closeProject();
    requestAnimationFrame(() => document.getElementById('console-tab-watch')?.focus());
  } else if (state.hasUnsavedChanges()) useNavigatorRequests.setState({ closing: true });
  else state.closeProject();
}
