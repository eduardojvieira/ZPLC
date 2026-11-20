import type { PaletteItem, PaletteProvider } from './contracts';
import type { PaletteSnapshot } from '../palette';
import type { FileTreeNode } from '../../types';

export const isSceneFile = (path: string): boolean => path === 'scene.json' || /^scenes\/[^/]+\.scene\.json$/.test(path);

export function fileNodes(tree: FileTreeNode | null): FileTreeNode[] {
  const found: FileTreeNode[] = [];
  const visit = (node: FileTreeNode): void => {
    if (node.type === 'file') found.push(node);
    node.children?.forEach(visit);
  };
  if (tree) visit(tree);
  return found;
}

export const filesProvider = (snapshot: PaletteSnapshot): PaletteProvider => ({
  group: 'files',
  titleKey: 'palette.group.files',
  items: (): PaletteItem[] =>
    fileNodes(snapshot.fileTree)
      .filter((node) => !isSceneFile(node.path))
      .map((node) => ({
        key: `file:${node.path}`,
        group: 'files',
        title: node.name,
        detail: node.path,
        run: () => snapshot.open.source(node.path, 1, 1),
      })),
});
