import { describe, expect, it, mock } from 'bun:test';
import { isFocused, setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { Toolbar } = await import('./Toolbar');
const { RunControls } = await import('./ToolbarRunControls');
const { createRef } = await import('react');
type RunProps = Parameters<typeof RunControls>[0];

const debugController = {} as never;

describe('Command bar (IDE-001, UX-011, UX-015) in a DOM', () => {
  it('is a named toolbar with Save, Build, the mode choice and Settings as named controls', () => {
    dom.render(<Toolbar debugController={debugController} />);
    expect(dom.screen.getByRole('toolbar', { name: dom.t('toolbar.label') })).toBeTruthy();
    expect(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.build.label')) })).toBeTruthy();
    expect(dom.screen.getByRole('group', { name: dom.t('toolbar.mode.label') })).toBeTruthy();
    expect(dom.screen.getByRole('button', { name: dom.t('toolbar.settings') })).toBeTruthy();
  });

  it('Save is disabled without an active file', () => {
    dom.render(<Toolbar debugController={debugController} />);
    expect((dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.save.label')) }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('the mode choice shows exactly one mode pressed', () => {
    dom.render(<Toolbar debugController={debugController} />);
    const sim = dom.screen.getByRole('button', { name: dom.t('toolbar.simulation.label') });
    const hw = dom.screen.getByRole('button', { name: dom.t('toolbar.hardware.label') });
    expect([sim, hw].map((b) => b.getAttribute('aria-pressed'))).toContain('true');
    expect([sim, hw].filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('Build opens a menu whose first item takes the focus; Escape closes it', async () => {
    const { user } = dom.render(<Toolbar debugController={debugController} />);
    const trigger = dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.build.label')) });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(dom.screen.getByRole('menu', { name: dom.t('toolbar.build.label') })).toBeTruthy();
    expect(dom.screen.getAllByRole('menuitem').length).toBeGreaterThan(1);
    await user.keyboard('{Escape}');
    expect(dom.screen.queryByRole('menu', { name: dom.t('toolbar.build.label') })).toBeNull();
    expect(isFocused(trigger)).toBe(true);
  });

  it('Settings toggles the project settings view', async () => {
    const toggleSettings = mock(() => undefined);
    dom.patchStore(useIDEStore, { toggleSettings });
    const { user } = dom.render(<Toolbar debugController={debugController} />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('toolbar.settings') }));
    expect(toggleSettings).toHaveBeenCalledTimes(1);
  });
});

const controls = (over: Record<string, unknown> = {}) => {
  const handlers = {
    onExecutionModeChange: mock<(mode: string) => Promise<unknown>>(async () => undefined),
    onConnect: mock(async () => undefined),
    onUpload: mock(async () => undefined),
    onStart: mock<(keyboard: boolean) => Promise<unknown>>(async () => undefined),
    onPause: mock<(keyboard: boolean) => Promise<unknown>>(async () => undefined),
    onResume: mock<(keyboard: boolean) => Promise<unknown>>(async () => undefined),
    onStep: mock(async () => undefined),
    onStop: mock(async () => undefined),
    onReset: mock(async () => undefined),
    toggleMpeek: mock(() => undefined),
  };
  const props = {
    executionMode: 'simulate',
    isConnected: true,
    isConnecting: false,
    isUploading: false,
    controlsBusy: false,
    hasCurrentCompileResult: true,
    programLoadState: 'loaded',
    isRunning: false,
    isPaused: false,
    isIdle: true,
    mpeekEnabled: false,
    connectionButtonRef: createRef<HTMLButtonElement>(),
    executionButtonRef: createRef<HTMLButtonElement>(),
    ...handlers,
    ...over,
  };
  return { props: props as unknown as RunProps, handlers };
};

describe('Run controls (IDE-001) in a DOM', () => {
  it('Run starts a built program by click and by the keyboard, and says it was the keyboard', async () => {
    const { props, handlers } = controls();
    const { user } = dom.render(<RunControls {...props} />);
    const run = dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.run.label')) });
    await user.click(run);
    expect(handlers.onStart).toHaveBeenLastCalledWith(false);
    run.focus();
    await user.keyboard('{Enter}');
    expect(handlers.onStart).toHaveBeenLastCalledWith(true);
  });

  it('Run is disabled while there is nothing current to run', () => {
    const { props } = controls({ hasCurrentCompileResult: false });
    dom.render(<RunControls {...props} />);
    expect((dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.run.label')) }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('while running it offers Pause and Stop instead of Run, and Stop asks the handler', async () => {
    const { props, handlers } = controls({ isRunning: true, isIdle: false });
    const { user } = dom.render(<RunControls {...props} />);
    expect(dom.screen.queryByRole('button', { name: new RegExp(dom.t('toolbar.run.label')) })).toBeNull();
    await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.stop.label')) }));
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
    await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.pause.label')) }));
    expect(handlers.onPause).toHaveBeenCalledTimes(1);
  });

  it('the mode group has two buttons with one pressed, and choosing the other reports it', async () => {
    const { props, handlers } = controls();
    const { user } = dom.render(<RunControls {...props} />);
    const group = dom.screen.getByRole('group', { name: dom.t('toolbar.mode.label') });
    const pressed = dom
      .within(group)
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('aria-pressed'));
    expect(pressed.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    await user.click(dom.screen.getByRole('button', { name: dom.t('toolbar.hardware.label') }));
    expect(handlers.onExecutionModeChange).toHaveBeenCalledWith('hardware');
  });

  it('in hardware mode the connect button is named by the connection state and Deploy appears once connected', async () => {
    const { props, handlers } = controls({ executionMode: 'hardware' });
    const { user } = dom.render(<RunControls {...props} />);
    expect(dom.screen.getByRole('button', { name: dom.t('toolbar.disconnect') })).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.deploy.label')) }));
    expect(handlers.onUpload).toHaveBeenCalledTimes(1);
  });
});
