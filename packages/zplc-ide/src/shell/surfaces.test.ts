import { afterEach, describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { setupDom } from '../test/dom';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import type { ConsoleTab } from '../types';
import type { Region } from './surfaces';

const dom = await setupDom();
await (await import('../test/dom')).stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { CONFIG_EDITOR_KINDS } = await import('../navigator/configEditors');
const { getCommandState, listedCommands, resetCommandsForTest, runCommand } = await import('../commands/bus');
const { COMMAND_LIST, commandById, isCommandEnabled, isCommandId } = await import('../commands/registry');
const { ACTIVITY_VIEWS } = await import('../store/useShellLayout');
const { SURFACES, surfacesIn } = await import('./surfaces');
const { useConfigEditors } = await import('../store/useConfigEditors');
const { useReviewDocument } = await import('../store/useReviewDocument');
const { useShellCommands } = await import('../commands/useCommandHost');

const REGIONS: readonly Region[] = ['commandBar', 'activity', 'editor', 'secondary', 'results', 'status', 'dialog'];

/** Every tab of the results panel; a new `ConsoleTab` that is not listed here fails the build (SHL-002). */
const RESULTS_TABS: Record<Exclude<ConsoleTab, 'explorer' | 'inspector' | 'learn' | 'lab'>, true> = {
  output: true,
  problems: true,
  tests: true,
  changes: true,
  agent: true,
  terminal: true,
  watch: true,
  trace: true,
  interlocks: true,
};

const Host = () => {
  useShellCommands();
  return null;
};

afterEach(() => resetCommandsForTest());

describe('surface registry (SHL-001, SHL-002, SHL-004)', () => {
  it('SHL-002 every surface has one region and a registered command', () => {
    expect(new Set(SURFACES.map((surface) => surface.id)).size).toBe(SURFACES.length);
    for (const surface of SURFACES) {
      expect(REGIONS).toContain(surface.region);
      expect(isCommandId(surface.command)).toBe(true);
      expect(typeof (en as Record<string, string>)[surface.titleKey]).toBe('string');
      expect(typeof (es as Record<string, string>)[surface.titleKey]).toBe('string');
    }
    expect(surfacesIn('activity').map((surface) => surface.id)).toEqual(ACTIVITY_VIEWS.map((view) => `activity.${view}`));
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

  it('SHL-004 the commands of Interlocks, Agent and Terminal show their tab, and open the panel when it is collapsed', () => {
    dom.render(createElement(Host));
    for (const tab of ['interlocks', 'agent', 'terminal'] as const) {
      useIDEStore.setState({ isConsoleCollapsed: true, activeConsoleTab: 'output' });
      expect(runCommand(`view.${tab}`)).toBe('ran');
      expect(useIDEStore.getState().activeConsoleTab).toBe(tab);
      expect(useIDEStore.getState().isConsoleCollapsed).toBe(false);
    }
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
