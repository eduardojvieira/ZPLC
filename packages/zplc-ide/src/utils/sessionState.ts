/**
 * The session of a project (IDE-008) as the renderer sees it: what to record from the open workbench, and what to put
 * back when the project opens again. Pure functions over the shared document (`electron/sessionStoreProtocol.ts`);
 * the main process stores it, the editor reports the cursor, the store applies the plan.
 */
import { SESSION_LIMITS, isSessionPath, type SessionPanels, type SessionState, type SessionTab } from '../../electron/sessionStoreProtocol';

/** Where the cursor and the scroll of one editor were, as Monaco reports them. */
export interface ViewState { line: number; column: number; scrollTop: number }
/** The split of the workbench in percent; the same as the panel defaults in App.tsx. */
export type WorkspaceLayout = { editor: number; console: number };
export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = { editor: 72, console: 28 };

/** What the panels allow (App.tsx: editor from 30 %, lower panel from 5 % to 65 %). */
const isUsableLayout = (panels: Pick<SessionPanels, 'editor' | 'console'>): boolean =>
  panels.editor >= 30 && panels.console >= 5 && panels.console <= 65 && Math.abs(panels.editor + panels.console - 100) <= 1;

/** The split to remember from the sizes the panel library reports, or null when the lower panel is collapsed or the group is not the workbench. */
export function workspaceLayoutFrom(sizes: Record<string, number>): WorkspaceLayout | null {
  const { editor, console: lower } = sizes;
  if (typeof editor !== 'number' || typeof lower !== 'number' || !Number.isFinite(editor) || !Number.isFinite(lower)) return null;
  return isUsableLayout({ editor, console: lower }) ? { editor, console: lower } : null;
}

/** The project file behind a Monaco model: `uri.path` is `/<project session>/<file id>` (`editorModelPath`) and a file id is `file:<path>`. */
export function projectPathFromModelPath(modelPath: string): string | null {
  const match = /^\/\d+\/file:(.+)$/.exec(modelPath);
  return match ? match[1]! : null;
}

const whole = (value: number, min: number, max: number): number => (Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min);

export interface SessionInput {
  /** File ids of the open tabs, in order. */
  openTabs: readonly string[];
  activeFileId: string | null;
  /** The loaded files by id; a tab whose file is not here cannot be recorded. */
  files: ReadonlyMap<string, { path: string }>;
  viewStates: ReadonlyMap<string, ViewState>;
  /** The split the user chose in this project, or null when they never resized. */
  layout: WorkspaceLayout | null;
  consoleCollapsed: boolean;
}

/** The document to store for the open workbench. Unsaved content is not part of it: only paths and positions. */
export function captureSession(input: SessionInput): SessionState {
  const tabs: SessionTab[] = [];
  let activePath: string | null = null;
  for (const id of input.openTabs) {
    const path = input.files.get(id)?.path;
    if (path === undefined || !isSessionPath(path) || tabs.length >= SESSION_LIMITS.maxTabs || tabs.some((tab) => tab.path === path)) continue;
    const view = input.viewStates.get(path);
    tabs.push({
      path,
      line: whole(view?.line ?? 1, 1, SESSION_LIMITS.maxLine),
      column: whole(view?.column ?? 1, 1, SESSION_LIMITS.maxColumn),
      scrollTop: whole(view?.scrollTop ?? 0, 0, SESSION_LIMITS.maxScrollTop),
    });
    if (id === input.activeFileId) activePath = path;
  }
  const layout = input.layout ?? (input.consoleCollapsed ? DEFAULT_WORKSPACE_LAYOUT : null);
  return { schemaVersion: 1, tabs, activePath, panels: layout ? { ...layout, consoleCollapsed: input.consoleCollapsed } : null };
}

export interface RestorePlan {
  /** Tabs to open again, in order: only files that still exist. */
  tabPaths: string[];
  activePath: string | null;
  viewStates: Map<string, ViewState>;
  /** The saved split, or null when none was saved or it is not one the panels allow. */
  layout: WorkspaceLayout | null;
  /** Whether the lower panel was collapsed; null when the session says nothing about the panels. */
  consoleCollapsed: boolean | null;
}

/** What to restore from a saved session. `exists` says whether a project file is still there; a tab whose file is gone is dropped silently. */
export function planRestore(state: SessionState, exists: (path: string) => boolean): RestorePlan {
  const kept = state.tabs.filter((tab) => exists(tab.path));
  const tabPaths = kept.map((tab) => tab.path);
  const activePath = state.activePath !== null && tabPaths.includes(state.activePath) ? state.activePath : tabPaths.at(-1) ?? null;
  return {
    tabPaths,
    activePath,
    viewStates: new Map(kept.map((tab) => [tab.path, { line: tab.line, column: tab.column, scrollTop: tab.scrollTop }])),
    layout: state.panels && isUsableLayout(state.panels) ? { editor: state.panels.editor, console: state.panels.console } : null,
    consoleCollapsed: state.panels ? state.panels.consoleCollapsed : null,
  };
}
