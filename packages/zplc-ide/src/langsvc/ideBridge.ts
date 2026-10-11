/**
 * What the language service may do to the application: read and change project files through the editor's store, and
 * show a place of a file. The files it changes become modified files of the editor, as an edit of the author would,
 * and are saved only by the author (a rename across files is reviewed in the tabs it opens).
 */

import { useAppSettings } from '../store/useAppSettings';
import { useIDEStore } from '../store/useIDEStore';
import { findFileInTree } from '../utils/fileSystem';
import type { ProjectBridge } from './monacoProviders';

const escape = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const ideBridge: ProjectBridge = {
  indentSize: () => useAppSettings.getState().settings.editorTabSize,

  async readFile(path) {
    const state = useIDEStore.getState();
    const loaded = [...state.loadedFiles.values()].find((file) => file.path === path);
    if (loaded) return loaded.content;
    const node = state.fileTree ? findFileInTree(state.fileTree, path) : null;
    if (!node || node.type !== 'file') return undefined;
    const active = state.activeFileId;
    await state.openFile(node.id);
    const opened = useIDEStore.getState().loadedFiles.get(node.id);
    if (active) useIDEStore.getState().setActiveFile(active);
    return opened?.content;
  },

  async writeFile(path, content) {
    let state = useIDEStore.getState();
    let file = [...state.loadedFiles.values()].find((candidate) => candidate.path === path);
    if (!file) {
      const node = state.fileTree ? findFileInTree(state.fileTree, path) : null;
      if (!node || node.type !== 'file') return false;
      const active = state.activeFileId;
      await state.openFile(node.id);
      if (active) useIDEStore.getState().setActiveFile(active);
      state = useIDEStore.getState();
      file = state.loadedFiles.get(node.id);
    }
    if (!file) return false;
    state.updateFileContent(file.id, content);
    return true;
  },

  open: (path, line, column) => useIDEStore.getState().navigateToCompilerDiagnostic(path, line, column),

  otherFilesMentioning(name) {
    const word = new RegExp(`(^|[^A-Za-z0-9_])${escape(name)}($|[^A-Za-z0-9_])`, 'i');
    return [...useIDEStore.getState().loadedFiles.values()]
      .filter((file) => file.language !== 'ST' && word.test(file.content))
      .map((file) => file.path);
  },
};
