/**
 * The split of the editor area (SHL-006): which views are in the second group and which group has the focus. The views
 * themselves, and which one is active, stay in the IDE store; this only says where each view is shown. Saved with the
 * session (IDE-008) by `sessionPersistence.ts`, not here: the session file is one document with one writer.
 */
import { create } from 'zustand';
import { ONE_GROUP, clampRatio, closeView, moveToOther, reconcile, type EditorGroups } from '../layout/editorGroups';
import type { ViewId } from '../layout/documentKinds';
import { projectRootId } from '../ipc/projectFilesHandles';
import { loadSession } from '../ipc/sessionBridge';
import { planRestore } from '../utils/sessionState';
import type { SessionState } from '../../electron/sessionStoreProtocol';

interface EditorGroupsState {
  groups: EditorGroups;
  /** The view the first group showed last; what it shows again while the second group has the focus. */
  activeFirst: ViewId | null;
  /** The project session whose saved split is being read: the session is not written meanwhile, or it would replace the split. */
  pendingFor: number;
}

interface EditorGroupsActions {
  /** Moves a view to the other group; `open` is every open view. */
  move: (view: ViewId, open: readonly ViewId[]) => void;
  /** The set of open views and the active one changed: drops views that closed and follows the active view's group. */
  sync: (open: readonly ViewId[], active: ViewId | null) => void;
  close: (view: ViewId) => void;
  setRatio: (ratio: number) => void;
  begin: (projectSession: number) => void;
  /** The split of a restored session, applied once the project's tabs are open. */
  restore: (projectSession: number, split: { second: readonly ViewId[]; activeSecond: ViewId | null; ratio: number } | null) => void;
  reset: () => void;
}

export const useEditorGroups = create<EditorGroupsState & EditorGroupsActions>((set) => ({
  groups: ONE_GROUP,
  activeFirst: null,
  pendingFor: -1,
  move: (view, open) => set((state) => ({ groups: moveToOther(state.groups, view, open) })),
  sync: (open, active) =>
    set((state) => {
      const groups = reconcile(state.groups, open);
      const inSecond = active !== null && groups.second.includes(active);
      const focused = groups.second.length === 0 ? 'first' : active === null ? groups.focused : inSecond ? 'second' : 'first';
      const next =
        groups.second.length === 0 || (focused === groups.focused && (!inSecond || active === groups.activeSecond))
          ? groups
          : { ...groups, focused, activeSecond: inSecond ? active : groups.activeSecond };
      const activeFirst = active !== null && !inSecond ? active : state.activeFirst;
      return next === state.groups && activeFirst === state.activeFirst ? state : { groups: next, activeFirst };
    }),
  close: (view) => set((state) => ({ groups: closeView(state.groups, view) })),
  setRatio: (ratio) =>
    set((state) => {
      const next = clampRatio(ratio);
      return Math.abs(next - state.groups.ratio) < 0.001 ? state : { groups: { ...state.groups, ratio: next } };
    }),
  begin: (projectSession) => set({ pendingFor: projectSession }),
  restore: (_projectSession, split) =>
    set({
      pendingFor: -1,
      activeFirst: null,
      groups: split
        ? {
            second: split.second,
            activeSecond: split.activeSecond ?? split.second.at(-1) ?? null,
            focused: 'first',
            ratio: clampRatio(split.ratio),
          }
        : ONE_GROUP,
    }),
  reset: () => set({ groups: ONE_GROUP, activeFirst: null }),
}));

/**
 * Applies the split the saved session holds for the project that just opened. The IDE store restores the tabs; this reads the
 * same document again for the split (a session of 2.0 has none, and then there is one group). Never throws: a session that
 * cannot be read is one group.
 */
export async function restoreEditorGroups(args: {
  projectSession: number;
  directoryHandle: unknown;
  openTabs: readonly string[];
  files: ReadonlyMap<string, { path: string }>;
  /** Reads the saved session; the project's session bridge when omitted. */
  read?: () => Promise<SessionState | null>;
}): Promise<void> {
  const { restore, begin } = useEditorGroups.getState();
  begin(args.projectSession);
  try {
    const bridge = typeof window === 'undefined' ? undefined : window.electronAPI?.session;
    const rootId = projectRootId(args.directoryHandle);
    const saved = args.read ? await args.read() : bridge && rootId !== null ? await loadSession(bridge, rootId) : null;
    // Another project opened while the session was being read: that project's own restore decides.
    if (useEditorGroups.getState().pendingFor !== args.projectSession) return;
    const open = new Map(args.openTabs.flatMap((id) => (args.files.has(id) ? [[args.files.get(id)!.path, id] as const] : [])));
    const plan = saved ? planRestore(saved, (path) => open.has(path)) : null;
    const split = plan?.split;
    restore(
      args.projectSession,
      split
        ? {
            second: split.secondPaths.map((path) => open.get(path)!),
            activeSecond: split.activeSecondPath === null ? null : (open.get(split.activeSecondPath) ?? null),
            ratio: split.ratio,
          }
        : null,
    );
  } catch {
    restore(args.projectSession, null);
  }
}
