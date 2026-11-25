import type { PaletteProvider } from './contracts';
import type { PaletteSnapshot } from '../palette';
import { fileNodes, isSceneFile } from './files';

/** Scenes are listed by path from the tree; this module never imports the plant chunk (it is about 4 MB and loads on demand). */
export const scenesProvider = (snapshot: PaletteSnapshot): PaletteProvider => ({
  group: 'scenes',
  titleKey: 'palette.group.scenes',
  items: () =>
    [
      ...new Set([
        ...fileNodes(snapshot.fileTree)
          .map((node) => node.path)
          .filter(isSceneFile),
        ...(snapshot.scenePaths ?? []),
      ]),
    ].map((path) => ({
      key: `scene:${path}`,
      group: 'scenes',
      title: path.split('/').pop() ?? path,
      detail: path,
      run: snapshot.open.scenes,
    })),
});
