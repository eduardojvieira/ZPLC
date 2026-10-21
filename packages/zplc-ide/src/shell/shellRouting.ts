/**
 * What the shell does when something asks for a tab of the old lower panel (UX-011). The Explorer, the Inspector and the
 * lessons used to be tabs of that panel; they are views of the sidebars now, but the store, the lesson flow and the scripts
 * still name them as console tabs, so such a request is routed to the sidebar that holds the view.
 */
import type { ConsoleTab } from '../types';
import type { ActivityView } from '../store/useShellLayout';

export const SIDEBAR_CONSOLE_TABS = ['explorer', 'inspector', 'learn'] as const;
export type SidebarConsoleTab = (typeof SIDEBAR_CONSOLE_TABS)[number];

export const isSidebarConsoleTab = (tab: ConsoleTab): tab is SidebarConsoleTab => (SIDEBAR_CONSOLE_TABS as readonly string[]).includes(tab);

/** The tab the results panel shows for a stored tab: the stored one, or Output when the request belongs to a sidebar. */
export const resultsTabFor = (tab: ConsoleTab): ConsoleTab => (isSidebarConsoleTab(tab) ? 'output' : tab);

/**
 * Where the lesson of the open lesson workspace is shown (LRN-004). On the Learn rail it fills the primary sidebar; on any other
 * rail the primary sidebar is the Explorer, Search or Tests, so the lesson moves to the secondary sidebar instead of hiding.
 */
export const lessonSurface = (view: ActivityView, lessonOpen: boolean): 'primary' | 'secondary' | 'none' =>
  !lessonOpen ? 'none' : view === 'learn' ? 'primary' : 'secondary';

export type ShellRoute = { primary: ActivityView } | { secondary: 'inspector' };

export function routeConsoleTab(tab: ConsoleTab): ShellRoute | null {
  if (tab === 'explorer') return { primary: 'project' };
  if (tab === 'learn') return { primary: 'learn' };
  if (tab === 'inspector') return { secondary: 'inspector' };
  return null;
}

interface WorkbenchStore {
  getState(): { activeConsoleTab: ConsoleTab; setActiveConsoleTab(tab: ConsoleTab): void };
  subscribe(listener: (state: { activeConsoleTab: ConsoleTab }, previous: { activeConsoleTab: ConsoleTab }) => void): () => void;
}

interface ShellActions {
  showActivity(view: ActivityView): void;
  setSecondaryVisible(visible: boolean): void;
}

/**
 * Follows the store: a request for a sidebar tab shows that sidebar view and puts the stored tab back to the last tab of the
 * results panel, so that asking for the same view again is a change again. Returns the function that stops it.
 */
export function startShellRouting(workbench: WorkbenchStore, shell: () => ShellActions): () => void {
  let resultsTab: ConsoleTab = resultsTabFor(workbench.getState().activeConsoleTab);
  const follow = (tab: ConsoleTab): void => {
    const route = routeConsoleTab(tab);
    if (!route) {
      resultsTab = tab;
      return;
    }
    if ('primary' in route) shell().showActivity(route.primary);
    else shell().setSecondaryVisible(true);
    workbench.getState().setActiveConsoleTab(resultsTab);
  };
  follow(workbench.getState().activeConsoleTab);
  return workbench.subscribe((state, previous) => {
    if (state.activeConsoleTab !== previous.activeConsoleTab) follow(state.activeConsoleTab);
  });
}
