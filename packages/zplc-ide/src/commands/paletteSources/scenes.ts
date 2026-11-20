import type { PaletteProvider } from './contracts';
import type { PaletteSnapshot } from '../palette';
import { fileNodes, isSceneFile } from './files';

/** Scenes are listed by path from the tree; this module never imports the plant chunk (it is about 4 MB and loads on demand). */
export const scenesProvider = (snapshot: PaletteSnapshot): PaletteProvider => ({
  group: 'scenes',
  titleKey: 'palette.group.scenes',
  items: () =>
    fileNodes(snapshot.fileTree)
      .filter((node) => isSceneFile(node.path))
      .map((node) => ({ key: `scene:${node.path}`, group: 'scenes', title: node.name, detail: node.path, run: snapshot.open.scenes })),
});
