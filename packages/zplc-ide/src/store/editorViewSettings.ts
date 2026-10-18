/**
 * How the code editor is shown, as the user chose it (UX-034): the minimap is off until the user turns it on, and the
 * choice is kept per user in the storage of the renderer, like the other preferences. A missing or unreadable entry reads
 * as off, never as an error.
 * ponytail: its own storage key because the validated preferences record lives outside this module; fold it into
 * `utils/appSettings.ts` as `editorMinimap` when that file is open to this work.
 */
import { create } from 'zustand';

export const MINIMAP_STORAGE_KEY = 'zplc-ide-editor-minimap';

type MinimapStorage = Pick<Storage, 'getItem' | 'setItem'> | undefined;

export function loadMinimap(storage: MinimapStorage): boolean {
  try {
    return storage?.getItem(MINIMAP_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveMinimap(storage: MinimapStorage, on: boolean): void {
  try {
    storage?.setItem(MINIMAP_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Not remembered this session.
  }
}

const browserStorage = (): MinimapStorage => (typeof localStorage === 'undefined' ? undefined : localStorage);

export const useEditorView = create<{ minimap: boolean; setMinimap: (on: boolean) => void }>((set) => ({
  minimap: loadMinimap(browserStorage()),
  setMinimap: (on) => {
    saveMinimap(browserStorage(), on);
    set({ minimap: on });
  },
}));
