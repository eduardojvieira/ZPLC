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
const { canvasMenuItems } = await import('../editors/contextMenus');
const { actionsOf } = await import('../editors/keymap');

const IDS: ReadonlySet<string> = new Set(COMMAND_LIST.map((command) => command.id));
const CONTROL = 'button, [role="menuitem"], [role="tab"]';

/**
 * FND-002 as a checker: a control that runs a handler carries `data-command="<registered id>"` (itself or the element that
 * wraps it, for a kit component that cannot take the attribute) or `data-command-exempt="<reason>"`.
 */
function uncommanded(root: ParentNode): string[] {
  const problems: string[] = [];
  for (const control of root.querySelectorAll<HTMLElement>(CONTROL)) {
    const name = control.getAttribute('aria-label') ?? control.textContent?.trim() ?? control.tagName;
    const owner = control.closest<HTMLElement>('[data-command], [data-command-exempt]');
    if (!owner) problems.push(`no command: ${name}`);
    else if (owner.hasAttribute('data-command') && !IDS.has(owner.getAttribute('data-command') ?? ''))
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

  it('FND-002 every activity of the rail names its command', () => {
    const { container } = dom.render(<ActivityRail active="project" density="regular" onSelect={noop} />);
    expect(container.querySelectorAll('[data-activity]').length).toBe(4);
    expect(uncommanded(container)).toEqual([]);
  });

  it('FND-002 CI fails on a control with a handler and no command', () => {
    const { container } = dom.render(
      <div>
        <button type="button" aria-label="Orphan" onClick={mock(noop)} />
        <button type="button" aria-label="Wrong" data-command="no.such.command" />
        <button type="button" aria-label="Silent" data-command-exempt=" " />
        <button type="button" aria-label="Fine" data-command="file.save" />
        <button type="button" aria-label="Said why" data-command-exempt="opens a menu of commands" />
      </div>,
    );
    expect(uncommanded(container)).toEqual(['no command: Orphan', 'unknown command "no.such.command": Wrong', 'empty exemption: Silent']);
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
    expect(ids).toEqual(['build.compile', 'build.generateSt', 'build.downloadProgram', 'build.viewAssembly']);
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

  it('FND-002 the physical commands are the pinned list', () => {
    expect(
      COMMAND_LIST.filter((command) => command.physical)
        .map((command) => command.id)
        .sort(),
    ).toEqual([
      'debug.pause',
      'debug.reset',
      'debug.run',
      'debug.step',
      'debug.stop',
      'online.connect',
      'online.deploy',
      'online.disconnect',
      'online.feedBoardFromPlant',
    ]);
  });
});
