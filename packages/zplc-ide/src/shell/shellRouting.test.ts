import { describe, expect, it } from 'bun:test';
import type { ConsoleTab } from '../types';
import { SIDEBAR_CONSOLE_TABS, resultsTabFor, routeConsoleTab, startShellRouting } from './shellRouting';
import { COMPACT_MAX_WIDTH, shellDensity } from './shellDensity';

function fakeWorkbench(initial: ConsoleTab) {
  let state = { activeConsoleTab: initial, setActiveConsoleTab: (tab: ConsoleTab) => change(tab) };
  const listeners = new Set<(next: { activeConsoleTab: ConsoleTab }, previous: { activeConsoleTab: ConsoleTab }) => void>();
  function change(tab: ConsoleTab): void { const previous = state; state = { ...state, activeConsoleTab: tab }; for (const listener of listeners) listener(state, previous); }
  return { getState: () => state, subscribe: (listener: (typeof listeners extends Set<infer L> ? L : never)) => { listeners.add(listener); return () => listeners.delete(listener); } };
}

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
    const stop = startShellRouting(workbench, () => ({ showActivity: (view) => shown.push(view), setSecondaryVisible: (visible) => shown.push(`secondary:${visible}`) }));
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
