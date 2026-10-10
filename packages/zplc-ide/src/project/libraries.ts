/**
 * Library folders (IDE-023): folders of the project whose Structured Text files declare function blocks, functions and
 * data types that every editor offers (the palettes of FBD and LD, the completion and hover of ST).
 *
 * A folder is a library when `zplc.json` names it under `libraries`, as a path relative to the project root, with "/"
 * separators. That field is the interface the compiler work package of CMP-046 reads to build the folder into the
 * program; until it does, the editors know the library and the build reads only the files directly in `src`.
 */
import type { FileTreeNode } from '../types';

declare module '../types' {
  interface ZPLCProjectConfig {
    /** Project-relative folders whose Structured Text files are libraries of the project. */
    libraries?: string[];
  }
}

const normalize = (path: string): string => path.trim().replace(/^(\.\/)+/, '').replace(/\/+$/, '');

/** A folder path that stays inside the project: relative, no `..`, no backslash, not empty. */
const isProjectFolderPath = (path: string): boolean =>
  path !== '' && !path.startsWith('/') && !path.includes('\\') && !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');

const inside = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

/** The library folders a configuration names, normalised and without repeats; anything that is not a project folder path is ignored. */
export function configuredLibraries(config: object | null | undefined): string[] {
  const raw = (config as { libraries?: unknown } | null | undefined)?.libraries;
  if (!Array.isArray(raw)) return [];
  const found: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const path = normalize(value);
    if (isProjectFolderPath(path) && !found.includes(path)) found.push(path);
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
  const folder = normalize(path);
  if (folder === '') return 'The project root cannot be a library: choose a folder inside it.';
  if (!tree) return 'No project is open.';
  const node = findNode(tree, folder);
  if (!node) return 'That is not a folder of this project.';
  if (node.type !== 'directory') return 'That is not a folder.';
  if (current.includes(folder)) return 'That folder is already a library.';
  const holder = current.find((library) => inside(folder, library));
  return holder ? `That folder is inside the library ${holder}, which already includes it.` : null;
}

/** The libraries with `path` added once; a library that holds folders already named replaces them. */
export function addLibrary(current: readonly string[], path: string): string[] {
  const folder = normalize(path);
  return [...current.filter((library) => !inside(library, folder)), folder];
}

export function removeLibrary(current: readonly string[], path: string): string[] {
  const folder = normalize(path);
  return current.filter((library) => library !== folder);
}

/**
 * The Structured Text files that make up the project's sources for the editors: the ones the build reads (directly in
 * `src`) and every one under a library folder, at any depth, each once, in tree order.
 */
export function projectSourceFiles(tree: FileTreeNode | null, libraries: readonly string[]): FileTreeNode[] {
  const found: FileTreeNode[] = [];
  const visit = (node: FileTreeNode): void => {
    if (node.type === 'file') {
      const direct = node.path.startsWith('src/') && !node.path.slice('src/'.length).includes('/');
      if (node.language === 'ST' && (direct || libraries.some((library) => inside(node.path, library)))) found.push(node);
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  if (tree) visit(tree);
  return found;
}
