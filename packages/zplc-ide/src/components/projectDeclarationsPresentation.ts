/** What the declarations section of the Explorer shows (IDE-023), apart from drawing it. */
import type { DeclarationKind } from '../project/projectDeclarations';
import { projectSourceFiles } from '../project/libraries';
import { collectFolders } from '../project/treeOperations';
import type { FileTreeNode } from '../types';

export interface LibraryRow {
  path: string;
  /** The folder is no longer in the project (renamed, moved or deleted since it was named). */
  missing: boolean;
  /** Its Structured Text files, at any depth. */
  files: number;
}

const KIND_LABEL: Record<DeclarationKind, string> = {
  PROGRAM: 'Program',
  FUNCTION_BLOCK: 'Function block',
  FUNCTION: 'Function',
  INTERFACE: 'Interface',
  STRUCT: 'Structure',
  ENUM: 'Enumeration',
  TYPE: 'Type',
};

export const declarationKindLabel = (kind: DeclarationKind): string => KIND_LABEL[kind];

function hasFolder(tree: FileTreeNode, path: string): boolean {
  return tree.path === path || (tree.children ?? []).some((child) => child.type === 'directory' && hasFolder(child, path));
}

export function libraryRows(libraries: readonly string[], tree: FileTreeNode | null): LibraryRow[] {
  return libraries.map((path) => {
    const missing = tree === null || !hasFolder(tree, path);
    return { path, missing, files: missing ? 0 : projectSourceFiles(tree, [path]).filter((node) => node.path.startsWith(`${path}/`)).length };
  });
}

/** The folders that can be added as a library: not the root, not a library, not inside one. */
export function libraryChoices(tree: FileTreeNode | null, libraries: readonly string[]): Array<{ path: string; label: string }> {
  if (!tree) return [];
  return collectFolders(tree).filter((choice) => choice.path !== '' && !libraries.some((library) => choice.path === library || choice.path.startsWith(`${library}/`)));
}
