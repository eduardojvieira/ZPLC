import { describe, expect, it, mock } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { Toolbar } = await import('../components/Toolbar');
const { RunControls } = await import('../components/ToolbarRunControls');
const { BuildMenu } = await import('../components/ToolbarBuildMenu');
const { ActivityRail } = await import('../shell/ActivityRail');
const { COMMAND_LIST } = await import('./registry');
const { AI_COMMAND_PROPOSALS } = await import('../ai/proposals');
const { createRef } = await import('react');
const { ConsoleTabStrip } = await import('../components/ConsoleTabStrip');
const { OperationalStatusView } = await import('../components/OperationalStatusBar');
const { StatusDetails } = await import('../components/StatusDetails');
const { SURFACES } = await import('../shell/surfaces');
const { useIDEStore } = await import('../store/useIDEStore');
const { canvasMenuItems } = await import('../editors/contextMenus');
const { actionsOf } = await import('../editors/keymap');

const IDS: ReadonlySet<string> = new Set(COMMAND_LIST.map((command) => command.id));
const CONTROL = 'button, [role="menuitem"], [role="tab"]';

/**
 * FND-002 as a checker: a control that runs a handler carries `data-command="<registered id>"` or `data-command-exempt="<reason>"`
 * itself. The one exception is a control inside an element marked `data-command-group="<registered id>"`, for a component that
 * this check cannot reach (the export items of the Build menu).
 */
function uncommanded(root: ParentNode): string[] {
  const problems: string[] = [];
  for (const control of root.querySelectorAll<HTMLElement>(CONTROL)) {
    const name = control.getAttribute('aria-label') ?? control.textContent?.trim() ?? control.tagName;
    const own = control.hasAttribute('data-command') || control.hasAttribute('data-command-exempt');
    const owner = own ? control : control.closest<HTMLElement>('[data-command-group]');
    if (!owner) problems.push(`no command: ${name}`);
    else if (!own) {
      if (!IDS.has(owner.getAttribute('data-command-group') ?? '')) problems.push(`unknown group: ${name}`);
    } else if (owner.hasAttribute('data-command') && !IDS.has(owner.getAttribute('data-command') ?? ''))
      problems.push(`unknown command "${owner.getAttribute('data-command')}": ${name}`);
    else if (!owner.hasAttribute('data-command') && !(owner.getAttribute('data-command-exempt') ?? '').trim())
      problems.push(`empty exemption: ${name}`);
  }
  return problems;
}

const noop = () => undefined;
const runProps = (over: Record<string, unknown>) =>
  ({
    executionMode: 'simulate',
    isConnected: true,
    isConnecting: false,
    isUploading: false,
    controlsBusy: false,
    hasCurrentCompileResult: true,
    isRunning: false,
    isPaused: false,
    isStopped: true,
    connectionButtonRef: createRef<HTMLButtonElement>(),
    executionButtonRef: createRef<HTMLButtonElement>(),
    onConnect: noop,
    onUpload: noop,
    onStart: noop,
    onPause: noop,
    onResume: noop,
    onStep: noop,
    onStop: noop,
    onReset: noop,
    ...over,
  }) as unknown as Parameters<typeof RunControls>[0];

describe('FND-002 the command inventory in a DOM', () => {
  it('FND-002 every control of the command bar names a registered command or says why not', async () => {
    // in simulation: the whole bar, and the Build menu opened
    const { user, unmount } = dom.render(<Toolbar debugController={{} as never} />);
    const bar = dom.screen.getByRole('toolbar');
    expect(bar.querySelectorAll(CONTROL).length).toBeGreaterThan(4);
    expect(uncommanded(bar)).toEqual([]);
    await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.build.label')) }));
    expect(dom.screen.getAllByRole('menuitem').length).toBeGreaterThan(2);
    expect(uncommanded(bar)).toEqual([]);
    unmount();

    // with a board double: connect, deploy, then each execution state of the run controls
    for (const over of [
      { executionMode: 'hardware', isConnected: false },
      { executionMode: 'hardware', isConnected: true },
      { isRunning: true },
      { isPaused: true },
      { isStopped: true },
    ]) {
      const { container, unmount: leave } = dom.render(<RunControls {...runProps(over)} />);
      expect(container.querySelectorAll(CONTROL).length).toBeGreaterThan(0);
      expect(uncommanded(container)).toEqual([]);
      leave();
    }
  });

  it('FND-002 the items of the Save, target and More menus run registered commands', async () => {
    dom.patchStore(useIDEStore, { projectConfigDirty: true });
    const { user } = dom.render(<Toolbar debugController={{} as never} />);
    const expected: Array<[RegExp, string[]]> = [
      [new RegExp(dom.t('toolbar.save.label')), ['file.save', 'file.saveAll']],
      [new RegExp(dom.t('studio.flow.target.simulation')), ['online.simulation', 'online.hardware', 'project.target']],
      [new RegExp(dom.t('commandBar.more')), ['project.settings', 'view.themeLight', 'view.themeDark']],
    ];
    for (const [name, ids] of expected) {
      await user.click(dom.screen.getAllByRole('button', { name })[0] as HTMLElement);
      const menu = dom.screen.getByRole('menu');
      const bound = [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.getAttribute('data-command'));
      expect(bound).toEqual(expect.arrayContaining(ids));
      expect(uncommanded(menu)).toEqual([]);
      await user.keyboard('{Escape}');
    }
    // the triggers of those menus carry the attribute themselves
    expect(uncommanded(dom.screen.getByRole('toolbar'))).toEqual([]);
    expect(dom.screen.getByRole('toolbar').querySelectorAll('[data-command-group]').length).toBe(0);
  });

  it('FND-002 every tab of the results panel names the command of its surface', () => {
    // the tabs the panel has since U2 (SHL-003); Interlocks, Changes and Agent are surfaces of other regions (SHL-004)
    const ids = ['output', 'problems', 'tests', 'trace', 'watch', 'terminal'] as const;
    const { container } = dom.render(
      <ConsoleTabStrip tabs={ids.map((id) => ({ id, label: id, icon: null }))} activeConsoleTab="output" onSelect={noop} />,
    );
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.length).toBe(ids.length);
    for (const tab of tabs) {
      const surface = SURFACES.find((candidate) => `console-tab-${candidate.id.replace('results.', '')}` === tab.id);
      expect(surface).toBeDefined();
      expect(tab.getAttribute('data-command')).toBe(surface?.command ?? null);
    }
    expect(uncommanded(container)).toEqual([]);
  });

  it('FND-002 the button of the status line names the command it runs', () => {
    const view = (command: string) => (
      <OperationalStatusView
        indicator={{ state: 'simulation', label: 'Simulation', tone: 'info', icon: 'monitor' } as never}
        presentation={{ mode: 'Simulation', runtime: 'Native', status: { text: 'Stopped', tone: 'info' } } as never}
        action={{ label: 'Do it', run: noop, command } as never}
      />
    );
    const { container } = dom.render(view('build.compile'));
    const action = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Do it');
    expect(action?.getAttribute('data-command')).toBe('build.compile');
  });

  it('FND-002 the Details button of the status line names view.statusDetails', () => {
    const { container } = dom.render(<StatusDetails rows={[{ label: 'Runtime', value: 'Simulation' }]} />);
    expect([...container.querySelectorAll('button')].map((button) => button.getAttribute('data-command'))).toEqual(['view.statusDetails']);
  });

  it('FND-002 every activity of the rail names its command', () => {
    const { container } = dom.render(<ActivityRail active="project" density="regular" onSelect={noop} />);
    expect(container.querySelectorAll('[data-activity]').length).toBe(4);
    expect(uncommanded(container)).toEqual([]);
  });

  it('FND-002 CI fails on a control with a handler and no command', () => {
    const { container } = dom.render(
      <div>
        <div data-command-group="no.such.group">
          <button type="button" aria-label="Lost" />
        </div>
        <button type="button" aria-label="Orphan" onClick={mock(noop)} />
        <button type="button" aria-label="Wrong" data-command="no.such.command" />
        <button type="button" aria-label="Silent" data-command-exempt=" " />
        <button type="button" aria-label="Fine" data-command="file.save" />
        <button type="button" aria-label="Said why" data-command-exempt="opens a menu of commands" />
      </div>,
    );
    expect(uncommanded(container)).toEqual([
      'unknown group: Lost',
      'no command: Orphan',
      'unknown command "no.such.command": Wrong',
      'empty exemption: Silent',
    ]);
  });

  it('FND-002 the Build menu entries run registered commands', async () => {
    const menu = { open: true, menuRef: createRef(), triggerRef: createRef(), firstItemRef: createRef(), openMenu: noop, closeMenu: noop };
    const { container } = dom.render(
      <BuildMenu
        menu={menu as never}
        onCompile={noop}
        onGenerateSt={noop}
        onDownloadBytecode={noop}
        onViewAssembly={noop}
        hasCurrentCompileResult
      />,
    );
    const ids = [...container.querySelectorAll('[role="menuitem"][data-command]')].map((item) => item.getAttribute('data-command'));
    expect(ids).toEqual([
      'build.compile',
      'build.generateSt',
      'build.downloadProgram',
      'build.viewAssembly',
      'file.export',
      'file.exportProjectJson',
    ]);
    expect(container.querySelector('[data-command-group]')).toBeNull();
    expect(uncommanded(container)).toEqual([]);
  });

  it('FND-002 every item of a canvas menu of the FBD and SFC editors is an action of the editor key table', () => {
    for (const editor of ['fbd', 'sfc'] as const) {
      const actions = new Set(actionsOf(editor).map((action) => action.id));
      for (const target of ['canvas', 'node', 'edge'] as const) {
        const items = canvasMenuItems({
          editor,
          target,
          selectedNodes: 1,
          selectedEdges: 1,
          readOnly: false,
          canPaste: true,
          run: noop,
        });
        expect(items.length).toBeGreaterThan(1);
        expect(items.filter((item) => !actions.has(item.id)).map((item) => item.id)).toEqual([]);
      }
    }
  });

  it('FND-002 no physical command is a proposal type the AI may make', () => {
    const physical = new Set(COMMAND_LIST.filter((command) => command.physical).map((command) => command.id));
    expect(physical.size).toBeGreaterThan(0);
    const proposable = Object.values(AI_COMMAND_PROPOSALS) as string[];
    expect(proposable.length).toBeGreaterThan(0);
    for (const id of proposable) {
      expect(IDS.has(id)).toBe(true);
      expect(physical.has(id)).toBe(false);
    }
  });

  it('FND-002 Fit scene of the plant view is a registered view command that is not physical and that the AI cannot propose', () => {
    const fit = COMMAND_LIST.find((command) => command.id === 'view.fitPlantScene');
    expect([fit?.category, fit?.physical]).toEqual(['view', undefined]);
    expect(Object.values(AI_COMMAND_PROPOSALS) as string[]).not.toContain('view.fitPlantScene');
  });

  it('FND-002 the physical commands are the pinned list', () => {
    expect(
      COMMAND_LIST.filter((command) => command.physical)
        .map((command) => command.id)
        .sort(),
    ).toEqual([
      'debug.pause',
      'debug.rebuildAndRestart',
      'debug.reset',
      'debug.run',
      'debug.step',
      'debug.stop',
      'online.connect',
      'online.deploy',
      'online.disconnect',
      'online.feedBoardFromPlant',
      'online.restartSimulator',
      'plant.feedBoard',
    ]);
  });
});
