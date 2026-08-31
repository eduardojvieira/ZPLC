import type { FileTreeNode } from '../types';

export interface VisibleTreeNode {
  id: string;
  node: FileTreeNode;
  depth: number;
  parentId: string | null;
}

export function flattenVisibleTree(nodes: FileTreeNode[], depth = 1, parentId: string | null = null): VisibleTreeNode[] {
  return nodes.flatMap((node) => [
    { id: node.id, node, depth, parentId },
    ...(node.type === 'directory' && node.isExpanded && node.children
      ? flattenVisibleTree(node.children, depth + 1, node.id)
      : []),
  ]);
}

export function treeNavigation(visible: VisibleTreeNode[], id: string) {
  const index = visible.findIndex((entry) => entry.id === id);
  const entry = visible[index];
  return {
    previous: index > 0 ? visible[index - 1]!.id : null,
    next: index >= 0 && index < visible.length - 1 ? visible[index + 1]!.id : null,
    first: visible[0]?.id ?? null,
    last: visible.at(-1)?.id ?? null,
    parent: entry?.parentId ?? null,
    firstChild: entry ? visible.find((candidate) => candidate.parentId === entry.id)?.id ?? null : null,
  };
}

export function resolveTreeFocus(
  visible: VisibleTreeNode[],
  focusedId: string | null,
  ancestorIds: string[],
  activeFileId: string | null,
): string | null {
  if (focusedId && visible.some((entry) => entry.id === focusedId)) return focusedId;
  for (const ancestorId of ancestorIds) {
    if (visible.some((entry) => entry.id === ancestorId)) return ancestorId;
  }
  if (activeFileId && visible.some((entry) => entry.id === activeFileId)) return activeFileId;
  return visible[0]?.id ?? null;
}
