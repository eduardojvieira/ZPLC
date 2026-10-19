/**
 * Lookups and edits of the project file tree, as pure functions (IDE-014: split out of useIDEStore.ts).
 */

import type { FileTreeNode } from '../types';

function findTreeFileById(tree: FileTreeNode, fileId: string): FileTreeNode | null {
  if (tree.id === fileId && tree.type === 'file') return tree;
  for (const child of tree.children ?? []) {
    const found = findTreeFileById(child, fileId);
    if (found) return found;
  }
  return null;
}

export function resolveTreeFile(tree: FileTreeNode, fileId: string): FileTreeNode | null {
  return findTreeFileById(tree, fileId);
}

export function firstTreeFile(tree: FileTreeNode): FileTreeNode | null {
  if (tree.type === 'file') return tree;
  for (const child of tree.children ?? []) {
    const found = firstTreeFile(child);
    if (found) return found;
  }
  return null;
}

export function findTreeFileWithParent(tree: FileTreeNode, fileId: string): { node: FileTreeNode; parent: FileTreeNode } | null {
  const node = resolveTreeFile(tree, fileId);
  if (!node) return null;

  const visit = (parent: FileTreeNode): { node: FileTreeNode; parent: FileTreeNode } | null => {
    for (const child of parent.children ?? []) {
      if (child === node) return { node: child, parent };
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };

  return visit(tree);
}

export function pruneTreeFile(tree: FileTreeNode, fileId: string): FileTreeNode | null {
  let changed = false;
  const children = (tree.children ?? []).flatMap((child) => {
    if (child.type === 'file' && child.id === fileId) {
      changed = true;
      return [];
    }
    const pruned = pruneTreeFile(child, fileId);
    if (pruned) {
      changed = true;
      return [pruned];
    }
    return [child];
  });

  if (!changed) return null;
  return { ...tree, children };
}

export function appendTreeFile(tree: FileTreeNode, parentPath: string, file: FileTreeNode): FileTreeNode | null {
  if (tree.type === 'directory' && tree.path === parentPath) {
    return { ...tree, children: [...(tree.children ?? []), file] };
  }

  let changed = false;
  const children = (tree.children ?? []).map((child) => {
    const updated = child.type === 'directory' ? appendTreeFile(child, parentPath, file) : null;
    if (!updated) return child;
    changed = true;
    return updated;
  });
  return changed ? { ...tree, children } : null;
}

export function isSafePathSegment(value: string): boolean {
  return value.length > 0 && value !== '.' && value !== '..' && !/[\\/\0]/.test(value);
}
