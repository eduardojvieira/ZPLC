import { useDefaultLayout, type LayoutStorage } from 'react-resizable-panels';

export const WORKSPACE_LAYOUT_ID = 'zplc-ide-workspace';
/**
 * The widths of the sidebars and the editor (UX-017). The version is in the id: a layout of another shape is a new id, and the old one is
 * left unused.
 */
export const SHELL_LAYOUT_ID = 'zplc-ide-shell.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** The library stores a flat `{ panelId: percentage }` object per group; anything else would crash it while rendering. */
function isFlatLayout(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.values(parsed).every((size) => typeof size === 'number' && Number.isFinite(size))
    );
  } catch {
    return false;
  }
}

/**
 * Storage for react-resizable-panels that never throws: a private window, blocked site data or a full quota
 * leave the layout unremembered instead of breaking the shell, and a corrupt entry reads as "nothing saved".
 * The library itself parses the value without a guard, hence the shape check on read.
 */
export function createLayoutStorage(resolve: () => StorageLike | undefined = () => globalThis.localStorage): LayoutStorage {
  return {
    getItem(key) {
      try {
        const raw = resolve()?.getItem(key) ?? null;
        return raw !== null && isFlatLayout(raw) ? raw : null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        resolve()?.setItem(key, value);
      } catch {
        // Not remembered this session.
      }
    },
  };
}

const workspaceStorage = createLayoutStorage();

/** Keeps the editor / lower panel split between sessions; only a user's own resize (pointer or keyboard) is saved. */
export function useWorkspaceLayout() {
  return useDefaultLayout({ id: WORKSPACE_LAYOUT_ID, storage: workspaceStorage, onlySaveAfterUserInteractions: true });
}

/** Keeps the widths of the sidebars between sessions; only a user's own resize (pointer or keyboard) is saved. */
export function useShellLayoutSizes() {
  return useDefaultLayout({ id: SHELL_LAYOUT_ID, storage: workspaceStorage, onlySaveAfterUserInteractions: true });
}
