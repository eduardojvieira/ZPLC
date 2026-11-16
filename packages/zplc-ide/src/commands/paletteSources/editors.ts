import type { PaletteProvider } from './contracts';
import type { PaletteSnapshot } from '../palette';
import { CONFIG_EDITOR_KINDS, CONFIG_EDITOR_TITLE_KEYS } from '../../navigator/configEditors';

export const editorsProvider = (snapshot: PaletteSnapshot): PaletteProvider => ({
  group: 'editors',
  titleKey: 'palette.group.editors',
  items: () =>
    CONFIG_EDITOR_KINDS.map((kind) => ({
      key: `editor:${kind}`,
      group: 'editors' as const,
      title: snapshot.t(CONFIG_EDITOR_TITLE_KEYS[kind]),
      run: () => snapshot.open.editor(kind),
    })),
});
