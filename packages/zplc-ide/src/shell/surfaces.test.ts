import { afterEach, describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { setupDom, stubMonaco } from '../test/dom';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import type { ConsoleTab } from '../types';
import type { Region } from './surfaces';

const dom = await setupDom();
await (await import('../test/dom')).stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../store/useIDEStore');
const { CONFIG_EDITOR_KINDS } = await import('../navigator/configEditors');
const { getCommandState, listedCommands, resetCommandsForTest, runCommand } = await import('../commands/bus');
const { COMMAND_LIST, commandById, isCommandEnabled, isCommandId } = await import('../commands/registry');
const { ACTIVITY_VIEWS, useShellLayout } = await import('../store/useShellLayout');
const { SURFACES, surfacesIn } = await import('./surfaces');
const { useConfigEditors } = await import('../store/useConfigEditors');
const { useReviewDocument } = await import('../store/useReviewDocument');
const { usePreferencesDocument } = await import('../store/usePreferencesDocument');
const { useShellCommands } = await import('../commands/useCommandHost');
const { useProjectTests } = await import('../projectTests/useProjectTests');
const { useLearnUi } = await import('../learn/learnUi');
const { useAssistantProvider, useSecondaryView } = await import('./useSelection');
const { PRIMARY_VIEWS, SECONDARY_VIEWS } = await import('./views');
const { SecondarySidebar } = await import('./Sidebars');

const REGIONS: readonly Region[] = ['commandBar', 'activity', 'editor', 'secondary', 'results', 'status', 'dialog'];

/** The ids of 2.0 that name a surface which left the results panel: they stay in `ConsoleTab` so that a stored value parses (SHL-004). */
type MovedTab = 'explorer' | 'inspector' | 'learn' | 'lab' | 'interlocks' | 'changes' | 'agent';
/** Every tab of the results panel; a new `ConsoleTab` that is not listed here fails the build (SHL-002). */
const RESULTS_TABS: Record<Exclude<ConsoleTab, MovedTab>, true> = {
  output: true,
  problems: true,
  tests: true,
  terminal: true,
  watch: true,
  trace: true,
};

const Host = () => {
  useShellCommands();
  return null;
};

// SHL-004 shows the interlocks view of the Tests activity; the next file of the shard starts on the tests
afterEach(() => {
  resetCommandsForTest();
  useProjectTests.getState().setView('tests');
});

describe('surface registry (SHL-001, SHL-002, SHL-004)', () => {
  it('SHL-002 every surface has one region and a registered command', () => {
    expect(new Set(SURFACES.map((surface) => surface.id)).size).toBe(SURFACES.length);
    for (const surface of SURFACES) {
      expect(REGIONS).toContain(surface.region);
      expect(isCommandId(surface.command)).toBe(true);
      expect(typeof (en as Record<string, string>)[surface.titleKey]).toBe('string');
      expect(typeof (es as Record<string, string>)[surface.titleKey]).toBe('string');
    }
    // the rail's activities; a view inside one of them (the interlocks of Tests) is `activity.<activity>.<view>`
    const activities = surfacesIn('activity').filter((surface) => surface.id.split('.').length === 2);
    expect(activities.map((surface) => surface.id)).toEqual(ACTIVITY_VIEWS.map((view) => `activity.${view}`));
  });

  it('SHL-002 every activity of the rail and every tab of the results panel is a surface', () => {
    const ids = new Set(SURFACES.map((surface) => surface.id));
    for (const view of ACTIVITY_VIEWS) expect(ids).toContain(`activity.${view}`);
    for (const tab of Object.keys(RESULTS_TABS)) {
      expect(ids).toContain(`results.${tab}`);
      expect(surfacesIn('results').map((surface) => surface.id)).toContain(`results.${tab}`);
    }
    expect(surfacesIn('results')).toHaveLength(Object.keys(RESULTS_TABS).length);
    for (const kind of CONFIG_EDITOR_KINDS) expect(ids).toContain(`editor.config.${kind}`);
    for (const id of ['secondary.inspector', 'editor.settings', 'editor.learn', 'editor.plant', 'dialog.palette', 'dialog.shortcuts']) {
      expect(ids).toContain(id);
    }
  });

  it('SHL-002 every surface of the table has a command and the command opens it', () => {
    const entries = [...Object.values(PRIMARY_VIEWS), ...Object.values(SECONDARY_VIEWS)];
    expect(entries.length).toBe(ACTIVITY_VIEWS.length + 3);
    for (const entry of entries) {
      const surface = SURFACES.find((candidate) => candidate.id === entry.surface);
      expect([entry.surface, surface?.command, surface?.titleKey]).toEqual([entry.surface, entry.command, entry.titleKey]);
      expect(isCommandId(entry.command)).toBe(true);
    }
    // the commands that are not pending open their view; view.guide is declared and gets its handler with the Guide (G1)
    dom.render(createElement(Host));
    for (const view of ACTIVITY_VIEWS) {
      useShellLayout.setState({ activityView: view === 'project' ? 'search' : 'project' });
      expect(runCommand(PRIMARY_VIEWS[view].command)).toBe('ran');
      expect(useShellLayout.getState().activityView).toBe(view);
    }
    expect(ACTIVITY_VIEWS).toContain('plant');
    expect(PRIMARY_VIEWS.plant.command).toBe('view.showPlant');
    expect(commandById('view.showPlant').pending).toBeUndefined();
    expect(commandById('view.guide').pending).toBe(true);
  });

  it('GDE-001 with a lesson project open the lesson is the Guide of the secondary sidebar on every activity, Learn included', () => {
    useLearnUi.setState({ workspace: { lessonId: 'x', session: useIDEStore.getState().projectSession } } as never);
    for (const view of ACTIVITY_VIEWS) {
      useShellLayout.setState({ activityView: view });
      const { unmount } = dom.render(createElement(SecondarySidebar));
      const title = dom.screen.getByRole('complementary', { name: dom.t('shell.secondary.label') }).querySelector('h2');
      expect([view, title?.textContent]).toEqual([view, dom.t('shell.secondary.lesson')]);
      unmount();
    }
    useLearnUi.setState({ workspace: null });
    useShellLayout.setState({ activityView: 'project' });
  });

  it('SHL-008 the secondary sidebar shows one view at a time', () => {
    useAssistantProvider.setState({ available: true, refresh: async () => {} });
    useSecondaryView.getState().show('assistant');
    dom.render(createElement(SecondarySidebar));
    const frame = dom.screen.getByRole('complementary', { name: dom.t('shell.secondary.label') });
    expect(frame.querySelector(':scope > h2')?.textContent).toBe(dom.t('shell.secondary.assistant'));
    const inspector = dom.screen.queryByRole('complementary', { name: dom.t('workbench.inspector.region') });
    useSecondaryView.setState({ choice: null, inPrimary: false });
    useAssistantProvider.setState({ available: false });
    expect(inspector).toBeNull();
  });

  it('SHL-003 the results panel registry lists Problems, Output, Test results, Watch, Trace and the conditional Terminal', () => {
    const results = surfacesIn('results');
    expect(results.map((surface) => surface.id).sort()).toEqual(
      ['results.output', 'results.problems', 'results.tests', 'results.trace', 'results.watch', 'results.terminal'].sort(),
    );
    // the tab named Test results is shown by the command of the same name; Show tests opens the Tests activity
    expect(results.find((surface) => surface.id === 'results.tests')).toMatchObject({ command: 'view.testResults' });
    expect(en[results.find((surface) => surface.id === 'results.tests')!.titleKey as keyof typeof en]).toBe('Test results');
    expect(es[results.find((surface) => surface.id === 'results.tests')!.titleKey as keyof typeof es]).toBe('Resultados de las pruebas');
  });

  it('SHL-004 every surface that left the panel has a command, the palette and the View menu', () => {
    useIDEStore.setState({ isProjectOpen: true });
    dom.render(createElement(Host));
    const moved = { interlocks: 'activity.tests.interlocks', changes: 'editor.changes', agent: 'secondary.assistant' } as const;
    const listed = listedCommands(COMMAND_LIST).map((command) => command.id);
    for (const [tab, id] of Object.entries(moved)) {
      expect(SURFACES.find((surface) => surface.id === `results.${tab}`)).toBeUndefined();
      const surface = SURFACES.find((candidate) => candidate.id === id);
      expect([tab, surface?.command]).toEqual([tab, `view.${tab}`]);
      expect(commandById(surface!.command).category).toBe('view');
      expect(listed).toContain(surface!.command);
    }
    // Interlocks is a view of the Tests activity now: its command shows it there and leaves the results panel as it is
    useProjectTests.getState().setView('tests');
    useIDEStore.setState({ isConsoleCollapsed: true, activeConsoleTab: 'output' });
    expect(runCommand('view.interlocks')).toBe('ran');
    expect(useShellLayout.getState()).toMatchObject({ activityView: 'tests', primaryVisible: true });
    expect(useProjectTests.getState().view).toBe('interlocks');
    expect(useIDEStore.getState()).toMatchObject({ activeConsoleTab: 'output', isConsoleCollapsed: true });
  });

  it('SHL-004 the command of Terminal shows its tab, and opens the panel when it is collapsed', () => {
    dom.render(createElement(Host));
    useIDEStore.setState({ isConsoleCollapsed: true, activeConsoleTab: 'output' });
    expect(runCommand('view.terminal')).toBe('ran');
    expect(useIDEStore.getState().activeConsoleTab).toBe('terminal');
    expect(useIDEStore.getState().isConsoleCollapsed).toBe(false);
  });

  it('SHL-011 view.agent with no provider opens Preferences at the Assistant section', () => {
    dom.render(createElement(Host));
    usePreferencesDocument.setState({ open: false, active: false, anchor: null });
    expect(runCommand('view.agent')).toBe('ran');
    expect(usePreferencesDocument.getState()).toMatchObject({ open: true, active: true, anchor: 'assistant' });
    usePreferencesDocument.setState({ open: false, active: false, anchor: null });
  });

  it('SHL-004 view.changes opens the review document of the editor area and leaves the results panel as it is', () => {
    dom.render(createElement(Host));
    useReviewDocument.setState({ open: false, active: false });
    useIDEStore.setState({ isConsoleCollapsed: true, activeConsoleTab: 'output' });
    expect(SURFACES.find((surface) => surface.id === 'editor.changes')).toMatchObject({ region: 'editor', command: 'view.changes' });
    expect(runCommand('view.changes')).toBe('ran');
    expect(useReviewDocument.getState()).toMatchObject({ open: true, active: true });
    expect(useIDEStore.getState().activeConsoleTab).toBe('output');
    expect(useIDEStore.getState().isConsoleCollapsed).toBe(true);
    useReviewDocument.getState().close();
  });

  it('SHL-004 each configuration editor opens from its command', () => {
    dom.render(createElement(Host));
    for (const kind of CONFIG_EDITOR_KINDS) {
      expect(runCommand(`project.${kind}`)).toBe('ran');
      expect(useConfigEditors.getState().active).toBe(kind);
      expect(useConfigEditors.getState().open).toContain(kind);
    }
  });

  it('FND-002 with a project open the palette lists the nine commands', () => {
    useIDEStore.setState({ isProjectOpen: true });
    dom.render(createElement(Host));
    const nine = ['view.interlocks', 'view.changes', 'view.agent', 'view.terminal', ...CONFIG_EDITOR_KINDS.map((k) => `project.${k}`)];
    const offered = listedCommands(COMMAND_LIST)
      .filter((command) => isCommandEnabled(commandById(command.id as never), getCommandState()))
      .map((command) => command.id);
    for (const id of nine) expect(offered).toContain(id);
  });
});
