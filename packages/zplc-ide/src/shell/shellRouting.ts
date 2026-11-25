/**
 * What the shell does when something asks for a tab of the old lower panel (UX-011). The Explorer, the Inspector and the
 * lessons used to be tabs of that panel; they are views of the sidebars now, but the store, the lesson flow and the scripts
 * still name them as console tabs, so such a request is routed to the sidebar that holds the view.
 */
import type { ConsoleTab } from '../types';
import type { ActivityView } from '../store/useShellLayout';
import { runCommand } from '../commands/bus';
import type { CommandId } from '../commands/registry';

export const SIDEBAR_CONSOLE_TABS = ['explorer', 'inspector', 'learn'] as const;
export type SidebarConsoleTab = (typeof SIDEBAR_CONSOLE_TABS)[number];

export const isSidebarConsoleTab = (tab: ConsoleTab): tab is SidebarConsoleTab => (SIDEBAR_CONSOLE_TABS as readonly string[]).includes(tab);

/**
 * The tabs of 2.0 that left the results panel in U2 (SHL-004), with the command that shows each in its new place: Interlocks in the
 * Tests activity, Changes in the review document, Agent in the Assistant view (or Preferences while no provider is configured).
 */
const MOVED_TABS: Partial<Record<ConsoleTab, CommandId>> = { interlocks: 'view.interlocks', changes: 'view.changes', agent: 'view.agent' };

/**
 * The tab the results panel shows for a stored tab: the stored one, or Output when the request belongs to a sidebar, to the plant
 * document or to a place that left the panel.
 */
export const resultsTabFor = (tab: ConsoleTab): ConsoleTab =>
  isSidebarConsoleTab(tab) || tab === 'lab' || MOVED_TABS[tab] !== undefined ? 'output' : tab;

/**
 * Where the lesson of the open lesson workspace is shown: the Guide of the secondary sidebar on every activity, Learn included
 * (GDE-001); the Learn rail keeps the course outline in the primary sidebar.
 */
export const lessonSurface = (_view: ActivityView, lessonOpen: boolean): 'secondary' | 'none' => (lessonOpen ? 'secondary' : 'none');

/**
 * `lab` is the tab 2.0 stored for the plant: it is a document of the editor area now (PLS-002), and the value stays so that a stored
 * session parses; so do `interlocks`, `changes` and `agent`, whose places are opened by their commands.
 */
export type ShellRoute = { primary: ActivityView } | { secondary: 'inspector' } | { plant: true } | { command: CommandId };

export function routeConsoleTab(tab: ConsoleTab): ShellRoute | null {
  if (tab === 'explorer') return { primary: 'project' };
  if (tab === 'learn') return { primary: 'learn' };
  if (tab === 'inspector') return { secondary: 'inspector' };
  if (tab === 'lab') return { plant: true };
  const command = MOVED_TABS[tab];
  return command ? { command } : null;
}

interface WorkbenchStore {
  getState(): { activeConsoleTab: ConsoleTab; setActiveConsoleTab(tab: ConsoleTab): void };
  subscribe(listener: (state: { activeConsoleTab: ConsoleTab }, previous: { activeConsoleTab: ConsoleTab }) => void): () => void;
}

interface ShellActions {
  showActivity(view: ActivityView): void;
  setSecondaryVisible(visible: boolean): void;
  showPlant(): void;
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
    else if ('plant' in route) shell().showPlant();
    else if ('command' in route) runCommand(route.command);
    else shell().setSecondaryVisible(true);
    workbench.getState().setActiveConsoleTab(resultsTab);
  };
  follow(workbench.getState().activeConsoleTab);
  return workbench.subscribe((state, previous) => {
    if (state.activeConsoleTab !== previous.activeConsoleTab) follow(state.activeConsoleTab);
  });
}
