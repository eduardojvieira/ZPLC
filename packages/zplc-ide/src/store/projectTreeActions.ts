/**
 * The project tree operations of the Explorer (IDE-004): new folder, rename, move, duplicate and delete a folder. Each
 * one changes the disk through a typed project operation, reads the tree again, and keeps what is open (buffers,
 * modified flags, tabs, breakpoints) under the new path, so that no unsaved text is lost or saved back to the old name.
 * A refusal is an Error with a message for the user; nothing has changed when one is raised.
 */
import type { IDEState } from './useIDEStore';
import { createProjectFolder, readProjectFile, removeProjectEntry, renameProjectEntry, writeProjectFile } from '../ipc/projectOps';
import {
  copyName, entryNameProblem, expandPath, joinPath, nameClash, parentPath, remapOpenFiles, remapPath, removeOpenFiles,
  renameTaskPrograms,
} from '../project/treeOperations';
import { fileTreeFileId, findFileInTree, isProgramSourceFile } from '../utils/fileSystem';
import type { FileTreeNode } from '../types';

export interface TreeActionsHost {
  get(): IDEState;
  set(partial: Partial<IDEState>): void;
}

const refuse = (message: string): never => { throw new Error(message); };

function open(host: TreeActionsHost): { tree: FileTreeNode; handle: FileSystemDirectoryHandle; session: number } {
  const state = host.get();
  if (!state.isProjectOpen || !state.fileTree || !state.directoryHandle) return refuse('Open a project first.');
  return { tree: state.fileTree, handle: state.directoryHandle, session: state.projectSession };
}

/** The node at a project-relative path; the empty path is the project folder itself. */
const nodeAt = (tree: FileTreeNode, path: string): FileTreeNode | null => (path === '' || path === '/' ? tree : findFileInTree(tree, path));

const sameName = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

function entryAt(tree: FileTreeNode, path: string): FileTreeNode {
  const node = path === '' || path === '/' ? null : findFileInTree(tree, path);
  return node ?? refuse('That item is no longer in the project.');
}

/** Reads the tree again with the folders as they were open, plus `reveal`, and keeps the open files under their new paths. */
async function settle(host: TreeActionsHost, session: number, change: { from: string; to: string } | { removed: string } | null, reveal: string | null): Promise<void> {
  await host.get().refreshFileTree();
  const state = host.get();
  if (state.projectSession !== session || !state.fileTree) return;
  const tree = reveal !== null ? expandPath(state.fileTree, reveal) : state.fileTree;
  const open = { loadedFiles: state.loadedFiles, openTabs: state.openTabs, activeFileId: state.activeFileId, breakpoints: state.debug.breakpoints };
  const next = change === null ? open
    : 'removed' in change ? removeOpenFiles(open, change.removed)
      : remapOpenFiles(open, change.from, change.to, (path) => findFileInTree(tree, path));
  host.set({
    fileTree: tree,
    loadedFiles: next.loadedFiles,
    openTabs: next.openTabs,
    activeFileId: next.activeFileId,
    debug: { ...state.debug, breakpoints: next.breakpoints },
    ...(change === null ? {} : { compilerMessages: [], compilerMessagesChecked: false, compilerNavigationTarget: null, compilerRunId: state.compilerRunId + 1 }),
  });
}

const report = (host: TreeActionsHost, type: 'success' | 'warning', message: string) => host.get().addConsoleEntry({ type, message, source: 'system' });

export async function createFolder(host: TreeActionsHost, parent: string, rawName: string): Promise<void> {
  const name = rawName.trim();
  const problem = entryNameProblem(name);
  if (problem) refuse(problem);
  const { tree, handle, session } = open(host);
  const parentNode = nodeAt(tree, parent);
  if (!parentNode || parentNode.type !== 'directory') refuse('Choose an existing folder.');
  if (parentNode!.children?.some((child) => sameName(child.name, name))) refuse(`${name} already exists.`);
  const path = joinPath(parent === '/' ? '' : parent, name);
  await createProjectFolder(handle, path);
  await settle(host, session, null, path);
  report(host, 'success', `Created folder: ${name}`);
}

export async function renameEntry(host: TreeActionsHost, path: string, rawName: string): Promise<void> {
  const name = rawName.trim();
  const problem = entryNameProblem(name);
  if (problem) refuse(problem);
  const { tree, handle, session } = open(host);
  const node = entryAt(tree, path);
  if (name === node.name) return;
  const parent = parentPath(path);
  const siblings = nodeAt(tree, parent)?.children ?? [];
  if (siblings.some((sibling) => sibling.path !== path && sameName(sibling.name, name))) refuse(`${name} already exists.`);
  const clash = node.type === 'file' ? nameClash(tree, name, path) : null;
  if (clash) refuse(`${clash.name} already exists in ${parentPath(clash.path) || 'the project'}, and the build reads it as the same name as ${name}.`);
  const to = joinPath(parent, name);
  await renameProjectEntry(handle, path, to);
  await settle(host, session, { from: path, to }, parent);
  report(host, 'success', `Renamed ${node.name} to ${name}`);
  if (node.type === 'file') await followTasks(host, session, node.name, name);
}

/** Tasks name their programs by file name, so a renamed program must be renamed there too, or the build loses it. */
async function followTasks(host: TreeActionsHost, session: number, oldName: string, newName: string): Promise<void> {
  const state = host.get();
  if (state.projectSession !== session || !state.projectConfig) return;
  const { tasks, changed } = renameTaskPrograms(state.projectConfig.tasks, oldName, newName);
  if (changed === 0) return;
  const wasDirty = state.projectConfigDirty;
  state.updateProjectConfig({ tasks });
  if (wasDirty) {
    report(host, 'warning', `${changed === 1 ? 'A task' : `${changed} tasks`} now run${changed === 1 ? 's' : ''} ${newName}. Save the project settings to keep it.`);
    return;
  }
  await host.get().saveProjectConfig();
}

export async function moveEntry(host: TreeActionsHost, path: string, targetFolder: string): Promise<void> {
  const { tree, handle, session } = open(host);
  const node = entryAt(tree, path);
  const folder = targetFolder === '/' ? '' : targetFolder;
  const targetNode = nodeAt(tree, folder);
  if (!targetNode || targetNode.type !== 'directory') refuse('Choose an existing folder.');
  if (node.type === 'directory' && remapPath(folder, path, '') !== null) refuse(`${node.name} cannot be moved into itself.`);
  if (folder === parentPath(path)) refuse(`${node.name} is already there.`);
  if (targetNode!.children?.some((child) => sameName(child.name, node.name))) refuse(`${node.name} already exists in that folder.`);
  const to = joinPath(folder, node.name);
  await renameProjectEntry(handle, path, to);
  await settle(host, session, { from: path, to }, folder);
  report(host, 'success', `Moved ${node.name} to ${folder || 'the project folder'}`);
  if (isProgramSourceFile(node.name) && folder !== 'src') report(host, 'warning', `${node.name} is outside src: the build reads only the files directly in src.`);
}

/** Copies the file under a free name next to it, from what the editor shows when it is open. Returns the path of the copy. */
export async function duplicateEntry(host: TreeActionsHost, path: string): Promise<string> {
  const { tree, handle, session } = open(host);
  const node = entryAt(tree, path);
  if (node.type !== 'file') refuse('Only files can be duplicated.');
  const parent = parentPath(path);
  const siblings = nodeAt(tree, parent)?.children ?? [];
  const name = copyName(node.name, (candidate) => !siblings.some((sibling) => sameName(sibling.name, candidate)) && !nameClash(tree, candidate, null));
  const loaded = host.get().loadedFiles.get(fileTreeFileId(path));
  const bytes = loaded ? new TextEncoder().encode(loaded.content) : await readProjectFile(handle, path);
  const to = joinPath(parent, name);
  await writeProjectFile(handle, to, bytes);
  await settle(host, session, null, parent);
  report(host, 'success', `Created: ${name} (a copy of ${node.name})`);
  return to;
}

export async function deleteFolder(host: TreeActionsHost, path: string): Promise<void> {
  const { tree, handle, session } = open(host);
  const node = entryAt(tree, path);
  if (node.type !== 'directory') refuse('Only folders can be deleted here.');
  await removeProjectEntry(handle, path, true);
  await settle(host, session, { removed: path }, null);
  report(host, 'success', `Deleted folder: ${node.name}`);
}
