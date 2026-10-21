/**
 * What the shell remembers between sessions about its regions (UX-011, UX-012, UX-017): which activity is selected, whether
 * the sidebars are shown, and the mode of the project navigator. The sizes of the panels are the panel library's own
 * (`utils/layoutStorage.ts`). The saved document carries a version, and a document of another version, or one that does not
 * read, is not used: the defaults apply, field by field for a field that is wrong.
 */
import { create } from 'zustand';

export const SHELL_STATE_VERSION = 1;
export const SHELL_STATE_KEY = 'zplc-ide.shell';

export const ACTIVITY_VIEWS = ['project', 'search', 'tests', 'learn'] as const;
export type ActivityView = (typeof ACTIVITY_VIEWS)[number];
export const NAVIGATOR_MODES = ['objects', 'files'] as const;
export type NavigatorMode = (typeof NAVIGATOR_MODES)[number];

export interface ShellState {
  activityView: ActivityView;
  navigatorMode: NavigatorMode;
  primaryVisible: boolean;
  secondaryVisible: boolean;
}

// The secondary sidebar starts hidden: the editor keeps the width a diagram or a long line needs, and the command bar has the button for
// it.
export const DEFAULT_SHELL_STATE: ShellState = {
  activityView: 'project',
  navigatorMode: 'objects',
  primaryVisible: true,
  secondaryVisible: false,
};

const oneOf = <T extends string>(choices: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (choices as readonly string[]).includes(value) ? (value as T) : fallback;

/** The state in a saved document; the defaults for anything that is not a document of this version. */
export function parseShellState(raw: string | null | undefined): ShellState {
  if (!raw) return DEFAULT_SHELL_STATE;
  try {
    const document: unknown = JSON.parse(raw);
    if (typeof document !== 'object' || document === null) return DEFAULT_SHELL_STATE;
    const saved = document as Record<string, unknown>;
    if (saved.version !== SHELL_STATE_VERSION) return DEFAULT_SHELL_STATE;
    return {
      activityView: oneOf(ACTIVITY_VIEWS, saved.activityView, DEFAULT_SHELL_STATE.activityView),
      navigatorMode: oneOf(NAVIGATOR_MODES, saved.navigatorMode, DEFAULT_SHELL_STATE.navigatorMode),
      primaryVisible: typeof saved.primaryVisible === 'boolean' ? saved.primaryVisible : DEFAULT_SHELL_STATE.primaryVisible,
      secondaryVisible: typeof saved.secondaryVisible === 'boolean' ? saved.secondaryVisible : DEFAULT_SHELL_STATE.secondaryVisible,
    };
  } catch {
    return DEFAULT_SHELL_STATE;
  }
}

export const serializeShellState = (state: ShellState): string =>
  JSON.stringify({
    version: SHELL_STATE_VERSION,
    activityView: state.activityView,
    navigatorMode: state.navigatorMode,
    primaryVisible: state.primaryVisible,
    secondaryVisible: state.secondaryVisible,
  });

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const storage = (): StorageLike | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

function read(): ShellState {
  try {
    return parseShellState(storage()?.getItem(SHELL_STATE_KEY));
  } catch {
    return DEFAULT_SHELL_STATE;
  }
}

interface ShellActions {
  /** Shows an activity in the primary sidebar and shows the sidebar. */
  showActivity: (view: ActivityView) => void;
  setNavigatorMode: (mode: NavigatorMode) => void;
  setPrimaryVisible: (visible: boolean) => void;
  setSecondaryVisible: (visible: boolean) => void;
  togglePrimary: () => void;
  toggleSecondary: () => void;
}

export const useShellLayout = create<ShellState & ShellActions>((set) => ({
  ...read(),
  showActivity: (activityView) => set({ activityView, primaryVisible: true }),
  setNavigatorMode: (navigatorMode) => set({ navigatorMode }),
  setPrimaryVisible: (primaryVisible) => set({ primaryVisible }),
  setSecondaryVisible: (secondaryVisible) => set({ secondaryVisible }),
  togglePrimary: () => set((state) => ({ primaryVisible: !state.primaryVisible })),
  toggleSecondary: () => set((state) => ({ secondaryVisible: !state.secondaryVisible })),
}));

// Saved as it changes; a window that cannot store (a private window, a full quota) keeps the choice for the session.
useShellLayout.subscribe((state) => {
  try {
    storage()?.setItem(SHELL_STATE_KEY, serializeShellState(state));
  } catch {
    /* not remembered */
  }
});
