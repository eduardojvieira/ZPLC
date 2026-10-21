/**
 * The file tree and file actions of the IDE store: open, edit, save, create, rename and close files (IDE-014: split out of useIDEStore.ts).
 */

import type { StateCreator } from 'zustand';
import { SHOW_OUTPUT } from './consoleEntries';
import type { PLCLanguage, ProjectFileWithHandle } from '../types';
import { createEmptyFileContent } from '../types';
import {
  readDirectoryRecursive,
  loadFileFromTree,
  writeFileContent,
  toggleDirectoryExpanded,
  findFileInTree,
  findSameSourceName,
  fileNameForNewFile,
  fileTreeFileId,
  FileNameTakenError,
} from '../utils/fileSystem';
import { createFolder, deleteFolder, duplicateEntry, moveEntry, renameEntry } from './projectTreeActions';
import { preserveExpansion } from '../project/treeOperations';
import type { IDEState } from './ideStoreTypes';
import { resolveTreeFile, findTreeFileWithParent, pruneTreeFile, appendTreeFile, isSafePathSegment } from './fileTreeLookup';
import { t } from '../i18n';

let openFileIntent = 0;
let fileTreeRefreshIntent = 0;

const fileCreationReservations = new Set<string>();

export const createFileActions: StateCreator<
  IDEState,
  [],
  [],
  Pick<
    IDEState,
    | 'toggleDirectory'
    | 'refreshFileTree'
    | 'openFile'
    | 'saveFile'
    | 'saveAllFiles'
    | 'createFile'
    | 'deleteFile'
    | 'createFolder'
    | 'renameEntry'
    | 'moveEntry'
    | 'duplicateEntry'
    | 'deleteFolder'
    | 'setActiveFile'
    | 'updateFileContent'
    | 'closeTab'
    | 'discardFile'
  >
> = (set, get) => ({
  // ==========================================================================
  // File Tree Actions
  // ==========================================================================

  toggleDirectory: (dirPath: string) => {
    const { fileTree } = get();
    if (!fileTree) return;

    const newTree = toggleDirectoryExpanded(fileTree, dirPath);
    set({ fileTree: newTree });
  },

  refreshFileTree: async () => {
    const { directoryHandle, projectSession } = get();
    if (!directoryHandle) return;
    const intent = ++fileTreeRefreshIntent;

    try {
      const read = await readDirectoryRecursive(directoryHandle);
      const current = get();
      if (fileTreeRefreshIntent !== intent || current.projectSession !== projectSession || current.directoryHandle !== directoryHandle)
        return;
      set({ fileTree: preserveExpansion(read, current.fileTree) });
    } catch (err) {
      console.error('Failed to refresh file tree:', err);
    }
  },

  // ==========================================================================
  // File Actions
  // ==========================================================================

  openFile: async (fileId: string) => {
    const intent = ++openFileIntent;
    const { fileTree, projectSession } = get();
    if (!fileTree) return;
    const node = resolveTreeFile(fileTree, fileId);
    if (!node) return;
    try {
      const loaded = get().loadedFiles.get(fileId) ?? (await loadFileFromTree(node));
      const current = get();
      if (!loaded || current.projectSession !== projectSession || !current.fileTree || !resolveTreeFile(current.fileTree, fileId)) return;
      const loadedFiles = new Map(current.loadedFiles);
      if (!loadedFiles.has(fileId)) loadedFiles.set(fileId, loaded);
      const openTabs = current.openTabs.includes(fileId) ? current.openTabs : [...current.openTabs, fileId];
      set({
        loadedFiles,
        openTabs,
        activeFileId: openFileIntent === intent ? fileId : current.activeFileId,
      });
    } catch (err) {
      console.error('Failed to load file:', err);
    }
  },

  saveFile: async (fileId: string, options = {}) => {
    const { loadedFiles } = get();
    const file = loadedFiles.get(fileId);
    const expectedProjectSession = get().projectSession;

    if (!file) {
      console.error(`File not found: ${fileId}`);
      return false;
    }

    if (!file.handle) {
      console.error('File has no handle, cannot save');
      return false;
    }

    try {
      await writeFileContent(file.handle, file.content);
      const latest = get();
      const latestFile = latest.loadedFiles.get(fileId);
      if (latest.projectSession !== expectedProjectSession || latestFile !== file) return false;

      const newLoadedFiles = new Map(latest.loadedFiles);
      newLoadedFiles.set(fileId, { ...latestFile, isModified: false, diskContent: file.content });
      set({ loadedFiles: newLoadedFiles });

      if (!options.quiet) {
        get().addConsoleEntry({
          type: 'success',
          message: t('store.savedFile', { name: file.name }),
          source: 'system',
        });
      }

      return true;
    } catch (err) {
      if (get().projectSession !== expectedProjectSession) return false;
      const message = err instanceof Error ? err.message : 'Unknown error';
      get().addConsoleEntry({
        type: 'error',
        message: t('store.saveFileFailed', { name: file.name, message }),
        source: 'system',
      });
      set(SHOW_OUTPUT);
      return false;
    }
  },

  saveAllFiles: async (options = {}) => {
    const { loadedFiles, projectSession } = get();

    for (const [fileId, file] of loadedFiles) {
      if (get().projectSession !== projectSession) return;
      if (file.isModified) {
        await get().saveFile(fileId, options);
      }
    }
  },

  createFile: async (name: string, language: PLCLanguage, parentPath: string = 'src') => {
    const initial = get();
    const { directoryHandle, fileTree, projectSession: expectedProjectSession } = initial;
    const trimmedName = name.trim();
    if (!initial.isProjectOpen || !fileTree) throw new Error('Open a project before creating a file.');
    if (!isSafePathSegment(trimmedName)) throw new Error('Enter a single file name without path separators.');
    if (!parentPath || parentPath.split('/').some((part) => !isSafePathSegment(part))) {
      throw new Error('Choose an existing project folder for the new file.');
    }
    if (!directoryHandle) {
      throw new Error('The current project cannot create files.');
    }

    const fileName = fileNameForNewFile(trimmedName, language);
    const filePath = `${parentPath}/${fileName}`;
    const fileId = fileTreeFileId(filePath);
    const content = createEmptyFileContent(language);

    const newFile: ProjectFileWithHandle = {
      id: fileId,
      name: fileName,
      language,
      content,
      isModified: true,
      path: filePath,
      parentPath,
    };

    const isCurrentProject = () => {
      const current = get();
      return (
        current.projectSession === expectedProjectSession &&
        current.isProjectOpen &&
        current.fileTree !== null &&
        current.directoryHandle === directoryHandle
      );
    };

    const currentTreeForCreation = () => {
      if (!isCurrentProject()) throw new Error('Project changed while creating the file.');
      const current = get();
      const parent = findFileInTree(current.fileTree!, parentPath);
      if (!parent || parent.type !== 'directory') throw new Error('Choose an existing project folder for the new file.');
      if (current.loadedFiles.has(fileId)) throw new FileNameTakenError(fileName, fileName);
      const taken = findSameSourceName(parent, fileName);
      if (taken) throw new FileNameTakenError(taken.name, fileName);
      return current.fileTree!;
    };

    currentTreeForCreation();
    const reservationKey = `${expectedProjectSession}:${filePath}`;
    if (fileCreationReservations.has(reservationKey)) throw new Error('A file with that name is already being created.');
    fileCreationReservations.add(reservationKey);

    let createdPhysicalEntry = false;
    try {
      if (directoryHandle) {
        const pathParts = parentPath.split('/');
        let currentDir = directoryHandle;
        for (const part of pathParts) {
          currentTreeForCreation();
          currentDir = await currentDir.getDirectoryHandle(part);
          currentTreeForCreation();
        }

        let exists = false;
        try {
          await currentDir.getFileHandle(fileName);
          exists = true;
        } catch (error) {
          if (!(typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotFoundError')) throw error;
        }
        if (exists) throw new FileNameTakenError(fileName, fileName);
        currentTreeForCreation();
        const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
        createdPhysicalEntry = true;
        currentTreeForCreation();
        await writeFileContent(fileHandle, content);
        currentTreeForCreation();
        newFile.handle = fileHandle;
        newFile.isModified = false;
        newFile.diskContent = content;
      }

      let committed = false;
      set((state) => {
        if (
          state.projectSession !== expectedProjectSession ||
          !state.isProjectOpen ||
          state.directoryHandle !== directoryHandle ||
          !state.fileTree
        )
          return {};
        const parent = findFileInTree(state.fileTree, parentPath);
        if (!parent || parent.type !== 'directory' || state.loadedFiles.has(fileId) || findFileInTree(state.fileTree, filePath)) return {};
        const newTree = appendTreeFile(state.fileTree, parentPath, {
          id: fileId,
          name: fileName,
          type: 'file',
          path: filePath,
          language,
          handle: newFile.handle,
        });
        if (!newTree) return {};
        committed = true;
        return {
          fileTree: newTree,
          loadedFiles: new Map(state.loadedFiles).set(fileId, newFile),
          activeFileId: fileId,
          openTabs: state.openTabs.includes(fileId) ? state.openTabs : [...state.openTabs, fileId],
          compilerMessages: [],
          compilerMessagesChecked: false,
          compilerNavigationTarget: null,
          compilerRunId: state.compilerRunId + 1,
        };
      });
      if (!committed) {
        if (!isCurrentProject()) throw new Error('Project changed while creating the file.');
        throw new Error(
          createdPhysicalEntry
            ? 'The file may exist on disk. Refresh the project before trying again.'
            : 'Could not create the file. Check the name and folder access, then try again.',
        );
      }

      get().addConsoleEntry({ type: 'success', message: t('store.createdFile', { name: fileName }), source: 'system' });
      return fileId;
    } catch (error) {
      if (!isCurrentProject()) throw new Error('Project changed while creating the file.');
      const taken = !createdPhysicalEntry && error instanceof FileNameTakenError ? error : null;
      const message = createdPhysicalEntry
        ? 'The file may exist on disk. Refresh the project before trying again.'
        : taken
          ? taken.message
          : error instanceof Error &&
              (error.message === 'A file with that name is already being created.' ||
                error.message === 'Choose an existing project folder for the new file.' ||
                error.message === 'The file may exist on disk. Refresh the project before trying again.')
            ? error.message
            : 'Could not create the file. Check the name and folder access, then try again.';
      get().addConsoleEntry({ type: 'error', message, source: 'system' });
      throw taken ?? new Error(message);
    } finally {
      fileCreationReservations.delete(reservationKey);
    }
  },

  deleteFile: async (fileId: string, expectedProjectSession = get().projectSession) => {
    const initial = get();
    if (initial.projectSession !== expectedProjectSession) return false;
    const located = initial.fileTree && findTreeFileWithParent(initial.fileTree, fileId);
    if (!located || located.node.type !== 'file') return false;

    if (!located.parent.dirHandle) {
      if (get().projectSession === expectedProjectSession) {
        get().addConsoleEntry({ type: 'error', message: t('store.deleteFailed', { name: located.node.name }), source: 'system' });
      }
      return false;
    }
    try {
      await located.parent.dirHandle.removeEntry(located.node.name);
    } catch {
      if (get().projectSession === expectedProjectSession) {
        get().addConsoleEntry({ type: 'error', message: t('store.deleteFailed', { name: located.node.name }), source: 'system' });
      }
      return false;
    }

    const current = get();
    if (current.projectSession !== expectedProjectSession) return false;

    fileTreeRefreshIntent += 1;

    const loadedFiles = new Map(current.loadedFiles);
    loadedFiles.delete(fileId);
    const openTabs = current.openTabs.filter((id) => id !== fileId);
    const breakpoints = new Map(current.debug.breakpoints);
    breakpoints.delete(fileId);
    set((state) => ({
      fileTree: current.fileTree ? (pruneTreeFile(current.fileTree, fileId) ?? current.fileTree) : null,
      loadedFiles,
      openTabs,
      activeFileId: current.activeFileId === fileId ? (openTabs.at(-1) ?? null) : current.activeFileId,
      compilerMessages: [],
      compilerMessagesChecked: false,
      compilerNavigationTarget: null,
      compilerRunId: state.compilerRunId + 1,
      debug: { ...current.debug, breakpoints },
    }));
    return true;
  },

  createFolder: (parentPath, name) => createFolder({ get, set }, parentPath, name),
  renameEntry: (path, name) => renameEntry({ get, set }, path, name),
  moveEntry: (path, targetFolder) => moveEntry({ get, set }, path, targetFolder),
  duplicateEntry: (path) => duplicateEntry({ get, set }, path),
  deleteFolder: (path) => deleteFolder({ get, set }, path),

  setActiveFile: (fileId: string | null) => {
    const { openTabs } = get();
    set({
      activeFileId: fileId,
      openTabs: fileId && !openTabs.includes(fileId) ? [...openTabs, fileId] : openTabs,
    });
  },

  updateFileContent: (fileId: string, content: string) => {
    const { loadedFiles } = get();
    const file = loadedFiles.get(fileId);

    if (!file) return;

    const newLoadedFiles = new Map(loadedFiles);
    newLoadedFiles.set(fileId, { ...file, content, isModified: true });
    set((state) => ({
      loadedFiles: newLoadedFiles,
      compilerMessages: [],
      compilerMessagesChecked: false,
      compilerNavigationTarget: null,
      stBufferDiagnostics: null,
      compilerRunId: state.compilerRunId + 1,
    }));
  },

  closeTab: (fileId: string) => {
    const { openTabs, activeFileId } = get();
    const newTabs = openTabs.filter((id) => id !== fileId);
    const newActiveId = activeFileId === fileId ? newTabs[newTabs.length - 1] || null : activeFileId;

    set({
      openTabs: newTabs,
      activeFileId: newActiveId,
    });
  },

  discardFile: (fileId: string) => {
    const { loadedFiles, openTabs, activeFileId } = get();
    const newTabs = openTabs.filter((id) => id !== fileId);
    const files = new Map(loadedFiles);
    files.delete(fileId);

    set({
      loadedFiles: files,
      openTabs: newTabs,
      activeFileId: activeFileId === fileId ? newTabs[newTabs.length - 1] || null : activeFileId,
    });
  },
});
