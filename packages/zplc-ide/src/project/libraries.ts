/**
 * Library folders (IDE-023): the folders `libraries` of zplc.json lists, whose Structured Text files declare function
 * blocks, functions and data types that the build reads with `src` (CMP-046) and that every editor offers (the palettes
 * of FBD and LD, the completion and hover of ST). The rules are the build's, from `buildOptions.ts` and the workspace
 * reader of the Tool API: a library is a plain relative path, not `src` and not under `tests`; it is listed once,
 * whatever its case; the files read are the ones directly in the folder, and a file anywhere else that no build reads is
 * an unlisted source (`unlistedSources.ts`), which the tree marks and the build reports as not compiled.
 */
import type { FileTreeNode } from '../types';
import { buildOptionsOf, libraryFolderProblem } from './buildOptions';
import { scanUnlistedSources, type ScanEntry } from './unlistedSources';

const sameFolder = (left: string, right: string): boolean => left.toLowerCase() === right.toLowerCase();

/** The library folders a configuration lists, in order, as the build reads them: valid, and once each. */
export function configuredLibraries(config: object | null | undefined): string[] {
  const found: string[] = [];
  for (const folder of buildOptionsOf(config).libraries) {
    if (libraryFolderProblem(folder) === undefined && !found.some((known) => sameFolder(known, folder))) found.push(folder);
  }
  return found;
}

function findNode(tree: FileTreeNode, path: string): FileTreeNode | null {
  if (tree.path === path) return tree;
  for (const child of tree.children ?? []) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return null;
}

/** Why `path` cannot be added as a library, in words for the user; null when it can. */
export function libraryProblem(path: string, tree: FileTreeNode | null, current: readonly string[]): string | null {
  if (path === '') return 'The project root cannot be a library: choose a folder inside it.';
  const rule = libraryFolderProblem(path);
  if (rule) return rule;
  if (current.some((library) => sameFolder(library, path))) return 'That folder is already a library.';
  if (!tree) return 'No project is open.';
  const node = findNode(tree, path);
  if (!node) return 'That is not a folder of this project.';
  return node.type === 'directory' ? null : 'That is not a folder.';
}

/** The libraries with `path` added after the others, once. */
export function addLibrary(current: readonly string[], path: string): string[] {
  return current.some((library) => sameFolder(library, path)) ? [...current] : [...current, path];
}

export function removeLibrary(current: readonly string[], path: string): string[] {
  return current.filter((library) => !sameFolder(library, path));
}

/**
 * The Structured Text files the build reads, which the editors know the project by: the ones directly in `src` and
 * directly in each library folder, in tree order. (A file in a folder inside a library is not read; it is unlisted.)
 */
export function projectSourceFiles(tree: FileTreeNode | null, libraries: readonly string[]): FileTreeNode[] {
  const folders = ['src', ...libraries].map((folder) => folder.toLowerCase());
  const found: FileTreeNode[] = [];
  const visit = (node: FileTreeNode): void => {
    if (node.type === 'file') {
      const folder = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
      if (node.language === 'ST' && folders.includes(folder.toLowerCase())) found.push(node);
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  if (tree) visit(tree);
  return found;
}

/** The Structured Text files of the project that no build reads, found with the walk of the Tool API over the tree. */
export async function unlistedSourceFiles(tree: FileTreeNode | null, libraries: readonly string[]): Promise<string[]> {
  if (!tree) return [];
  const list = async (logical: string): Promise<ScanEntry[] | null> => {
    const node = logical === '' ? tree : findNode(tree, logical);
    if (!node || node.type !== 'directory') return null;
    return (node.children ?? []).map((child) => ({ name: child.name, kind: child.type === 'directory' ? 'directory' as const : 'file' as const }));
  };
  return scanUnlistedSources(list, ['src', ...libraries]);
}
