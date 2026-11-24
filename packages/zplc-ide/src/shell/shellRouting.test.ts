import { afterEach, describe, expect, it } from 'bun:test';
import type { ConsoleTab } from '../types';
import { bindCommands, resetCommandsForTest } from '../commands/bus';
import { SIDEBAR_CONSOLE_TABS, lessonSurface, resultsTabFor, routeConsoleTab, startShellRouting } from './shellRouting';
import { COMPACT_MAX_WIDTH, shellDensity } from './shellDensity';

function fakeWorkbench(initial: ConsoleTab) {
  let state = { activeConsoleTab: initial, setActiveConsoleTab: (tab: ConsoleTab) => change(tab) };
  const listeners = new Set<(next: { activeConsoleTab: ConsoleTab }, previous: { activeConsoleTab: ConsoleTab }) => void>();
  function change(tab: ConsoleTab): void {
    const previous = state;
    state = { ...state, activeConsoleTab: tab };
    for (const listener of listeners) listener(state, previous);
  }
  return {
    getState: () => state,
    subscribe: (listener: typeof listeners extends Set<infer L> ? L : never) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

describe('where the open lesson is shown (LRN-004)', () => {
  it(
    'LRN-004 keeps an open lesson beside the editor whatever the rail selects: in the primary sidebar on Learn, in the secondary one ' +
      'elsewhere',
    () => {
      expect(lessonSurface('learn', true)).toBe('primary');
      for (const view of ['project', 'search', 'tests'] as const) expect(lessonSurface(view, true)).toBe('secondary');
      for (const view of ['project', 'search', 'tests', 'learn'] as const) expect(lessonSurface(view, false)).toBe('none');
    },
  );
});

describe('requests for the views that left the lower panel (UX-011)', () => {
  it('UX-011 sends the Explorer, the lessons and the Inspector to their sidebars, and leaves the results tabs alone', () => {
    expect(SIDEBAR_CONSOLE_TABS).toEqual(['explorer', 'inspector', 'learn']);
    expect(routeConsoleTab('explorer')).toEqual({ primary: 'project' });
    expect(routeConsoleTab('learn')).toEqual({ primary: 'learn' });
    expect(routeConsoleTab('inspector')).toEqual({ secondary: 'inspector' });
    for (const tab of ['output', 'problems', 'tests', 'trace', 'watch', 'terminal'] as const) expect(routeConsoleTab(tab)).toBeNull();
    expect(resultsTabFor('learn')).toBe('output');
    expect(resultsTabFor('problems')).toBe('problems');
  });

  it('UX-011 shows the lesson view each time a lesson asks for it, and gives the results panel back its own tab', () => {
    const workbench = fakeWorkbench('problems');
    const shown: string[] = [];
    const stop = startShellRouting(workbench, () => ({
      showActivity: (view) => shown.push(view),
      setSecondaryVisible: (visible) => shown.push(`secondary:${visible}`),
      showPlant: () => shown.push('plant'),
    }));
    workbench.getState().setActiveConsoleTab('learn');
    expect(workbench.getState().activeConsoleTab).toBe('problems');
    workbench.getState().setActiveConsoleTab('learn');
    workbench.getState().setActiveConsoleTab('inspector');
    expect(shown).toEqual(['learn', 'learn', 'secondary:true']);
    stop();
    workbench.getState().setActiveConsoleTab('learn');
    expect(shown).toHaveLength(3);
  });
});

describe('the shell density (UX-023)', () => {
  it('UX-023 is compact at the 1024 pixel minimum and up to the limit, and regular at 1366', () => {
    expect(shellDensity(1024)).toBe('compact');
    expect(shellDensity(COMPACT_MAX_WIDTH)).toBe('compact');
    expect(shellDensity(COMPACT_MAX_WIDTH + 1)).toBe('regular');
    expect(shellDensity(1366)).toBe('regular');
  });
});

describe('the Lab tab of a stored session (SHL-004, PLS-002)', () => {
  it('SHL-004 a stored session whose tab is lab opens the plant document and leaves the results panel on its last tab', () => {
    expect(routeConsoleTab('lab')).toEqual({ plant: true });
    expect(resultsTabFor('lab')).toBe('output');
    const shown: string[] = [];
    const actions = () => ({
      showActivity: (view: string) => shown.push(view),
      setSecondaryVisible: (visible: boolean) => shown.push(`secondary:${visible}`),
      showPlant: () => shown.push('plant'),
    });
    // a session saved by 2.0 with the Lab tab active: the plant opens at once and the results panel does not keep Lab
    const stored = fakeWorkbench('lab');
    const stop = startShellRouting(stored, actions);
    expect(shown).toEqual(['plant']);
    expect(stored.getState().activeConsoleTab).toBe('output');
    stop();
    // asked again while the panel is on Problems: the document opens, the panel stays on Problems
    shown.length = 0;
    const live = fakeWorkbench('problems');
    startShellRouting(live, actions);
    live.getState().setActiveConsoleTab('lab');
    expect(shown).toEqual(['plant']);
    expect(live.getState().activeConsoleTab).toBe('problems');
  });
});

describe('the tabs of 2.0 that left the results panel (SHL-004)', () => {
  afterEach(() => resetCommandsForTest());
  const actions = (shown: string[]) => () => ({
    showActivity: (view: string) => shown.push(view),
    setSecondaryVisible: (visible: boolean) => shown.push(`secondary:${visible}`),
    showPlant: () => shown.push('plant'),
  });

  it('SHL-004 a stored interlocks, changes or agent tab opens its new place', () => {
    const ran: string[] = [];
    bindCommands({
      'view.interlocks': () => void ran.push('view.interlocks'),
      'view.changes': () => void ran.push('view.changes'),
      'view.agent': () => void ran.push('view.agent'),
    });
    for (const tab of ['interlocks', 'changes', 'agent'] as const) {
      expect(routeConsoleTab(tab)).toEqual({ command: `view.${tab}` });
      expect(resultsTabFor(tab)).toBe('output');
      // a session of 2.0 with that tab active: its new place opens at once, and the results panel shows a tab it has
      ran.length = 0;
      const shown: string[] = [];
      const stored = fakeWorkbench(tab);
      const stop = startShellRouting(stored, actions(shown));
      expect(ran).toEqual([`view.${tab}`]);
      expect(stored.getState().activeConsoleTab).toBe('output');
      stop();
      // asked for while the panel is on Problems: the new place opens, the panel stays on Problems
      ran.length = 0;
      const live = fakeWorkbench('problems');
      const stopLive = startShellRouting(live, actions(shown));
      live.getState().setActiveConsoleTab(tab);
      expect(ran).toEqual([`view.${tab}`]);
      expect(live.getState().activeConsoleTab).toBe('problems');
      stopLive();
      expect(shown).toEqual([]);
    }
  });
});
