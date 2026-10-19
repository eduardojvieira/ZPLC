/**
 * The pure rules of the project tree operations (IDE-004): new folder, rename, move, duplicate and delete. What a name
 * may be, what a copy is called, which names the build reads as one, and what a renamed file does to the tasks that run
 * it. The store and the Explorer do the I/O and the state; nothing here touches a file.
 */
import type { FileTreeNode, ProjectFileWithHandle } from '../types';
import { fileTreeFileId, isProgramSourceFile, sourceNameKey } from '../utils/fileSystem';
import { t } from '../i18n';

/** Why `name` cannot be the name of one file or folder, in words for the user; null when it can. */
export function entryNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return t('tree.name.enter');
  if (trimmed === '.' || trimmed === '..') return t('tree.name.notAllowed');
  if (/[\\/:\0]/.test(trimmed)) return t('tree.name.separators');
  if (/[. ]$/.test(trimmed)) return t('tree.name.trailing');
  if (trimmed.length > 255) return t('tree.name.tooLong');
  return null;
}

export const joinPath = (parent: string, name: string): string => (parent === '' ? name : `${parent}/${name}`);
export const parentPath = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/** `path` as it is after the entry at `from` moves to `to`; null when `path` is neither that entry nor under it. */
export function remapPath(path: string, from: string, to: string): string | null {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : null;
}

const DOUBLE_EXTENSION = /\.(ld|fbd|sfc)\.json$/i;

/** The name of a copy: `_copy` before the extension, then `_copy2`, `_copy3`... until `isFree` accepts it. */
export function copyName(name: string, isFree: (candidate: string) => boolean): string {
  const double = DOUBLE_EXTENSION.exec(name);
  const dot = name.lastIndexOf('.');
  const split = double ? double.index : dot > 0 ? dot : name.length;
  const stem = name.slice(0, split);
  const extension = name.slice(split);
  for (let attempt = 1; attempt < 1000; attempt++) {
    const candidate = `${stem}_copy${attempt === 1 ? '' : attempt}${extension}`;
    if (isFree(candidate)) return candidate;
  }
  return `${stem}_copy_${Date.now()}${extension}`;
}

/** The program file the build would read as the same file as `fileName`, anywhere in the project; null when none. */
export function nameClash(tree: FileTreeNode, fileName: string, exceptPath: string | null): FileTreeNode | null {
  if (!isProgramSourceFile(fileName)) return null;
  const key = sourceNameKey(fileName);
  const search = (node: FileTreeNode): FileTreeNode | null => {
    if (exceptPath !== null && remapPath(node.path, exceptPath, '') !== null) return null;
    if (node.type === 'file' && isProgramSourceFile(node.name) && sourceNameKey(node.name) === key) return node;
    for (const child of node.children ?? []) {
      const found = search(child);
      if (found) return found;
    }
    return null;
  };
  return search(tree);
}

/** The name a task uses for a program file: main.ld.json is "main.ld", the others keep their name. */
export const taskProgramName = (fileName: string): string => fileName.replace(/(\.(?:ld|fbd|sfc))\.json$/i, '$1');

/** The tasks with every reference to `oldFileName` pointing at `newFileName`, and how many tasks changed. */
export function renameTaskPrograms<T extends { programs: string[] }>(tasks: readonly T[], oldFileName: string, newFileName: string): { tasks: T[]; changed: number } {
  const oldKey = sourceNameKey(taskProgramName(oldFileName));
  const replacement = taskProgramName(newFileName);
  let changed = 0;
  const renamed = tasks.map((task) => {
    if (!task.programs.some((program) => sourceNameKey(program) === oldKey)) return task;
    changed += 1;
    return { ...task, programs: task.programs.map((program) => (sourceNameKey(program) === oldKey ? replacement : program)) };
  });
  return { tasks: renamed, changed };
}

/** The part of the store that holds open files, which a path change must keep consistent. */
export interface OpenFilesState {
  loadedFiles: Map<string, ProjectFileWithHandle>;
  openTabs: string[];
  activeFileId: string | null;
  breakpoints: Map<string, Set<number>>;
}

/**
 * The open files after the entry at `from` (a file, or a folder and everything in it) moved to `to`: each affected
 * file keeps its content, its modified flag, its tab position and its breakpoints under its new path and identity.
 * `nodeAt` gives the node of the new tree at a path (the file's new handle); a file with none is dropped.
 */
export function remapOpenFiles(state: OpenFilesState, from: string, to: string, nodeAt: (path: string) => FileTreeNode | null): OpenFilesState {
  const idMap = new Map<string, string | null>();
  const loadedFiles = new Map<string, ProjectFileWithHandle>();
  for (const [id, file] of state.loadedFiles) {
    const newPath = remapPath(file.path, from, to);
    if (newPath === null) { loadedFiles.set(id, file); continue; }
    const node = nodeAt(newPath);
    if (!node || node.type !== 'file') { idMap.set(id, null); continue; }
    const newId = fileTreeFileId(newPath);
    idMap.set(id, newId);
    loadedFiles.set(newId, { ...file, id: newId, name: node.name, path: newPath, parentPath: parentPath(newPath), handle: node.handle });
  }
  const mapped = (id: string) => (idMap.has(id) ? idMap.get(id)! : id);
  const openTabs = state.openTabs.map(mapped).filter((id): id is string => id !== null);
  const breakpoints = new Map<string, Set<number>>();
  for (const [id, lines] of state.breakpoints) { const next = mapped(id); if (next !== null) breakpoints.set(next, lines); }
  const active = state.activeFileId === null ? null : mapped(state.activeFileId);
  return { loadedFiles, openTabs, activeFileId: active !== null && openTabs.includes(active) ? active : openTabs.at(-1) ?? null, breakpoints };
}

/** The open files after the entry at `path` (a file, or a folder and everything in it) was deleted. */
export function removeOpenFiles(state: OpenFilesState, path: string): OpenFilesState {
  const gone = new Set<string>();
  for (const [id, file] of state.loadedFiles) if (remapPath(file.path, path, '') !== null) gone.add(id);
  const openTabs = state.openTabs.filter((id) => !gone.has(id));
  const loadedFiles = new Map([...state.loadedFiles].filter(([id]) => !gone.has(id)));
  const breakpoints = new Map([...state.breakpoints].filter(([id]) => !gone.has(id)));
  const active = state.activeFileId !== null && !gone.has(state.activeFileId) ? state.activeFileId : openTabs.at(-1) ?? null;
  return { loadedFiles, openTabs, activeFileId: active, breakpoints };
}

/** The tree with every directory open that was open in `previous` (by path), so a refresh does not close the Explorer. */
export function preserveExpansion(tree: FileTreeNode, previous: FileTreeNode | null): FileTreeNode {
  if (!previous) return tree;
  const open = new Set<string>();
  const collect = (node: FileTreeNode) => {
    if (node.type === 'directory') { if (node.isExpanded) open.add(node.path); node.children?.forEach(collect); }
  };
  collect(previous);
  const apply = (node: FileTreeNode): FileTreeNode => node.type === 'directory'
    ? { ...node, isExpanded: open.has(node.path) || node.isExpanded === true && node.path === '/', children: node.children?.map(apply) }
    : node;
  return apply(tree);
}

/** The tree with the directory at `path` and every folder above it open, so that what was just made is visible. */
export function expandPath(tree: FileTreeNode, path: string): FileTreeNode {
  const open = (node: FileTreeNode): FileTreeNode => {
    if (node.type !== 'directory') return node;
    const onPath = node.path === '/' || node.path === path || path.startsWith(`${node.path}/`);
    return { ...node, isExpanded: node.isExpanded || onPath, children: node.children?.map(open) };
  };
  return open(tree);
}

/** The project folder (path "") and every folder under it, to pick a destination from; `except` and what is in it are left out. */
export function collectFolders(tree: FileTreeNode, except: string | null = null): Array<{ path: string; label: string }> {
  const folders: Array<{ path: string; label: string }> = [{ path: '', label: t('tree.projectFolder') }];
  const visit = (node: FileTreeNode) => {
    for (const child of node.children ?? []) {
      if (child.type !== 'directory' || (except !== null && remapPath(child.path, except, '') !== null)) continue;
      folders.push({ path: child.path, label: child.path });
      visit(child);
    }
  };
  visit(tree);
  return folders;
}
