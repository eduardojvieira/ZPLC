/** The contract of the palette providers (plan-u2.md, C-P): types only. Task P2 implements the providers. */
import type { MessageKey } from '../../i18n/en';

export type PaletteGroup = 'commands' | 'files' | 'objects' | 'io' | 'editors' | 'lessons' | 'preferences' | 'scenes';
export interface PaletteItem {
  key: string;
  group: PaletteGroup;
  title: string;
  detail?: string;
  run: () => void;
}
/** Pure over a snapshot: no store import in a provider's own module. */
export interface PaletteProvider {
  group: PaletteGroup;
  titleKey: MessageKey;
  items: () => readonly PaletteItem[];
}
