import { afterEach, describe, expect, it, mock } from 'bun:test';
import { isFocused, setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { Toolbar } = await import('./Toolbar');
const { RunControls } = await import('./ToolbarRunControls');
const { createRef } = await import('react');
const { ActionConfirmHost } = await import('./ActionConfirmHost');
const { useNotifications } = await import('../store/notifications');
const { useAppSettings } = await import('../store/useAppSettings');
const { AI_COMMAND_PROPOSALS } = await import('../ai/proposals');
const { COMMANDS } = await import('../commands/registry');
const { plantTransport } = await import('../runtime/transport');
const { registerPlantTransport } = await import('../store/useTransport');
type RunProps = Parameters<typeof RunControls>[0];

const debugController = {} as never;

describe('Command bar (IDE-001, UX-011, UX-015) in a DOM', () => {
  it('is a named toolbar with Save, Build, the target and Settings as named controls', () => {
    dom.render(<Toolbar debugController={debugController} />);
    expect(dom.screen.getByRole('toolbar', { name: dom.t('toolbar.label') })).toBeTruthy();
    expect(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.build.label')) })).toBeTruthy();
    expect(dom.screen.getByRole('button', { name: new RegExp(dom.t('studio.flow.target.simulation')) })).toBeTruthy();
    expect(dom.screen.getByRole('button', { name: dom.t('toolbar.settings') })).toBeTruthy();
  });

  it('Save is disabled without an active file', () => {
    // the store is one object for the whole run: another file may have left a file open
    dom.patchStore(useIDEStore, { activeFileId: null });
    dom.render(<Toolbar debugController={debugController} />);
    expect((dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.save.label')) }) as HTMLButtonElement).disabled).toBe(true);
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
    onConnect: mock(async () => undefined),
    onUpload: mock(async () => undefined),
    onStart: mock<(keyboard: boolean) => Promise<unknown>>(async () => undefined),
    onPause: mock<(keyboard: boolean) => Promise<unknown>>(async () => undefined),
    onResume: mock<(keyboard: boolean) => Promise<unknown>>(async () => undefined),
    onStep: mock(async () => undefined),
    onStop: mock(async () => undefined),
    onReset: mock(async () => undefined),
  };
  const props = {
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

  it('FLW-001 Run is not disabled for want of a build: pressing it builds first', () => {
    const { props } = controls({ hasCurrentCompileResult: false, isConnected: false });
    dom.render(<RunControls {...props} />);
    expect((dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.run.label')) }) as HTMLButtonElement).disabled).toBe(false);
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

  it('in hardware mode the connect button is named by the connection state and Deploy appears once connected', async () => {
    const { props, handlers } = controls({ executionMode: 'hardware' });
    const { user } = dom.render(<RunControls {...props} />);
    expect(dom.screen.queryByRole('group', { name: dom.t('toolbar.mode.label') })).toBeNull();
    expect(dom.screen.getByRole('button', { name: dom.t('toolbar.disconnect') })).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.deploy.label')) }));
    expect(handlers.onUpload).toHaveBeenCalledTimes(1);
  });
});

/** A debug controller that is connected and running, with every call recorded. */
const liveController = () => {
  const calls: string[] = [];
  const call = (name: string) => async () => {
    calls.push(name);
  };
  const controller = {
    adapter: { connected: true, type: 'wasm' },
    vmState: 'running',
    disconnect: call('disconnect'),
    start: call('start'),
    resume: call('resume'),
    pause: call('pause'),
    step: call('step'),
    stop: call('stop'),
    reset: call('reset'),
  };
  return { controller: controller as never, calls };
};

const withBoard = () =>
  dom.patchStore(useIDEStore, { projectConfig: { name: 'Blinky', target: { board: 'rpi_pico' } } as never, isProjectOpen: true });

const chooseBoard = async (user: ReturnType<typeof dom.render>['user']) => {
  await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('studio.flow.target.simulation')) }));
  await user.click(dom.screen.getByRole('menuitem', { name: 'rpi_pico' }));
};

const button = (key: 'toolbar.pause.label' | 'toolbar.stop.label' | 'toolbar.reset.label') =>
  dom.screen.getByRole('button', { name: new RegExp(dom.t(key)) });

describe('Command bar transport (PLS-003, decision D-26) in a DOM', () => {
  it(
    'PLS-003 Pause, Stop and Reset of the command bar call the active transport, which is the debug controller with no ' + 'plant',
    async () => {
      const { controller, calls } = liveController();
      const { user } = dom.render(<Toolbar debugController={controller} />);
      await user.click(button('toolbar.pause.label'));
      await user.click(button('toolbar.stop.label'));
      await user.click(button('toolbar.reset.label'));
      expect(calls).toEqual(['pause', 'stop', 'reset']);
    },
  );

  it('PLS-003 with a plant transport registered, the command bar drives the plant session and not the debug controller', async () => {
    const { controller, calls } = liveController();
    const plantCalls: string[] = [];
    const session = {
      state: 'running',
      slowdown: 1,
      onChange: () => () => undefined,
      start: async () => void plantCalls.push('start'),
      pause: () => void plantCalls.push('pause'),
      resume: () => void plantCalls.push('resume'),
      step: async () => void plantCalls.push('step'),
      stop: async () => void plantCalls.push('stop'),
      reset: async () => void plantCalls.push('reset'),
    };
    const unregister = registerPlantTransport(plantTransport(session as never));
    try {
      const { user } = dom.render(<Toolbar debugController={controller} />);
      await user.click(button('toolbar.pause.label'));
      await user.click(button('toolbar.stop.label'));
      await user.click(button('toolbar.reset.label'));
    } finally {
      unregister();
    }
    expect(plantCalls).toEqual(['pause', 'stop', 'reset']);
    expect(calls).toEqual([]);
  });

  it('Stop and Reset on a board ask for confirmation as before', async () => {
    withBoard();
    const { controller, calls } = liveController();
    const { user } = dom.render(
      <>
        <Toolbar debugController={controller} />
        <ActionConfirmHost />
      </>,
    );
    await chooseBoard(user);
    // a program is running: the change of target asks first (FLW-007)
    await user.click(await dom.screen.findByRole('button', { name: dom.t('studio.flow.target.change.action') }));
    await dom.waitFor(() => expect(calls).toContain('disconnect'));
    await user.click(button('toolbar.stop.label'));
    expect(await dom.screen.findByRole('alertdialog')).toBeTruthy();
    expect(calls).not.toContain('stop');
    await user.click(await dom.screen.findByRole('button', { name: dom.t('confirm.stop.action') }));
    await dom.waitFor(() => expect(calls).toContain('stop'));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Task W6: Run in one action, the target, the implicit simulator session (spec 013 FLW-001 to FLW-010)
// ---------------------------------------------------------------------------------------------------------------------

const BUILD_OK = {
  ok: true,
  summary: { name: 'Blinky', taskCount: 1, codeSize: 4 },
  artifact: { zplcFile: new Uint8Array([1]), bytecode: new Uint8Array([2]), assembly: '; asm', debugMap: { pou: {}, memoryLayout: {} } },
  zplcEvidence: { sha256: 'a'.repeat(64), byteLength: 1 },
};

/** A desktop host whose compile answers `response`, and a project that is open, linked and has one file. */
function openProject(response: unknown, options: { modified?: boolean; board?: string } = {}) {
  const compile = mock(async () => response);
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    isElectron: true,
    workspaceTests: { compile, cancel: async () => undefined },
  };
  const session = useIDEStore.getState().projectSession;
  const file = { id: 'main', name: 'main.st', path: 'src/main.st', content: 'x', language: 'ST', isModified: options.modified === true };
  const saved: string[] = [];
  dom.patchStore(useIDEStore, {
    isProjectOpen: true,
    activeFileId: 'main',
    loadedFiles: new Map([['main', file]]) as never,
    workspaceScenarioLink: { workspaceId: 'w1', projectSession: session },
    projectConfig: { name: 'Blinky', target: options.board ? { board: options.board } : undefined } as never,
    projectConfigDirty: false,
    saveAllFiles: (async () => {
      saved.push('files');
      useIDEStore.setState({ loadedFiles: new Map([['main', { ...file, isModified: false }]]) as never });
    }) as never,
    saveProjectConfig: (async () => {
      saved.push('config');
      useIDEStore.setState({ projectConfigDirty: false });
    }) as never,
    debug: { ...useIDEStore.getState().debug, mpeekEnabled: false },
  });
  return { compile, saved };
}

/** A debug controller with no session yet: starting the simulator opens one, and every call is recorded. */
function simulatorController(initial: { state: string; session: boolean } = { state: 'disconnected', session: false }) {
  const calls: string[] = [];
  const c: Record<string, unknown> = {
    adapter: initial.session ? { connected: true, type: 'native' } : null,
    vmState: initial.state,
  };
  const record = (name: string, effect?: () => void) => async () => {
    calls.push(name);
    effect?.();
  };
  Object.assign(c, {
    startSimulation: record('startSimulation', () => {
      c.adapter = { connected: true, type: 'native' };
      c.vmState = 'idle';
    }),
    connectHardware: record('connectHardware', () => {
      c.adapter = { connected: true, type: 'serial' };
      c.vmState = 'idle';
    }),
    disconnect: record('disconnect', () => {
      c.adapter = null;
      c.vmState = 'disconnected';
    }),
    loadProgram: record('loadProgram'),
    start: record('start', () => (c.vmState = 'running')),
    resume: record('resume', () => (c.vmState = 'running')),
    pause: record('pause', () => (c.vmState = 'paused')),
    step: record('step'),
    stop: record('stop', () => (c.vmState = 'idle')),
    reset: record('reset'),
    getHardwareSystemInfo: () => null,
  });
  return { controller: c as never, calls };
}

const runButton = () => dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.run.label')) });
const notices = () => useNotifications.getState().items;

afterEach(() => {
  useNotifications.getState().clear();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('Run in one action (FLW-001, FLW-006) in a DOM', () => {
  it('FLW-001 one press of Run from a modified program ends with the program running in simulation', async () => {
    const { compile, saved } = openProject(BUILD_OK, { modified: true });
    const { controller, calls } = simulatorController();
    const { user } = dom.render(<Toolbar debugController={controller} />);
    await user.click(runButton());
    await dom.waitFor(() => expect(calls).toEqual(['startSimulation', 'loadProgram', 'start']));
    expect(saved).toContain('files');
    expect(compile).toHaveBeenCalledTimes(1);
    expect(
      notices()
        .filter((n) => n.status === 'success')
        .map((n) => n.title),
    ).toEqual([dom.t('studio.flow.done.run')]);
  });

  it('FLW-001 Run by the keyboard leaves the focus on Pause once the sequence ends, not on a disabled button', async () => {
    openProject(BUILD_OK, { modified: true });
    const { controller } = simulatorController();
    // The program is running, and the bar repaints, while the last step of Run is still in flight: Pause shows but is disabled.
    const started = (controller as unknown as { start: () => Promise<void> }).start;
    (controller as unknown as { start: () => Promise<void> }).start = async () => {
      await started();
      useIDEStore.setState({ projectConfig: { name: 'Blinky', target: { board: 'repaint' } } as never });
      await new Promise((resolve) => setTimeout(resolve, 100));
    };
    const focusedWhileDisabled: string[] = [];
    const focus = HTMLButtonElement.prototype.focus;
    HTMLButtonElement.prototype.focus = function (this: HTMLButtonElement, ...args) {
      if (this.disabled) focusedWhileDisabled.push(this.getAttribute('aria-label') ?? '');
      return focus.apply(this, args);
    };
    const { user } = dom.render(<Toolbar debugController={controller} />);
    runButton().focus();
    try {
      await user.keyboard('{Enter}');
    } finally {
      await dom.settle();
    }
    const pause = await dom.screen.findByRole('button', { name: new RegExp(dom.t('toolbar.pause.label')) });
    await dom.waitFor(() => expect((pause as HTMLButtonElement).disabled).toBe(false));
    await dom.settle();
    // A browser ignores focus() on a disabled button: every focus that reached Pause must have found it enabled.
    HTMLButtonElement.prototype.focus = focus;
    expect(focusedWhileDisabled).toEqual([]);
    expect(document.activeElement).toBe(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.pause.label')) }));
  });

  it('FLW-001 a build error stops Run: no simulator is started and the notice says which step stopped', async () => {
    openProject({ ok: false });
    const { controller, calls } = simulatorController();
    const { user } = dom.render(<Toolbar debugController={controller} />);
    await user.click(runButton());
    await dom.waitFor(() => expect(notices().some((n) => n.status === 'error')).toBe(true));
    expect(calls).toEqual([]);
    expect(notices().find((n) => n.status === 'error')?.title).toBe(
      dom.t('studio.flow.stopped', { step: dom.t('studio.flow.step.build') }),
    );
  });

  it('FLW-001 while the sequence is in flight Run waits, and the program is started once', async () => {
    openProject(BUILD_OK);
    const { controller, calls } = simulatorController();
    let release: () => void = () => undefined;
    const open = (controller as unknown as { startSimulation: () => Promise<void> }).startSimulation;
    (controller as unknown as { startSimulation: () => Promise<void> }).startSimulation = () =>
      new Promise<void>((resolve) => {
        release = () => void open().then(resolve);
      });
    const { user } = dom.render(<Toolbar debugController={controller} />);
    await user.click(runButton());
    await dom.waitFor(() => expect((runButton() as HTMLButtonElement).disabled).toBe(true));
    release();
    await dom.waitFor(() => expect(calls).toContain('start'));
    expect(calls.filter((call) => call === 'start')).toHaveLength(1);
  });

  it('FLW-004 no refusal is written to Output alone', async () => {
    withBoard();
    const { controller, calls } = simulatorController();
    const { user } = dom.render(<Toolbar debugController={controller} />);
    await chooseBoard(user);
    await user.click(runButton());
    expect(notices().some((n) => n.status === 'warning')).toBe(true);
    const output = useIDEStore.getState().consoleEntries.map((entry) => entry.message);
    expect(output).not.toContain(dom.t('toolbarMsg.connectFirst'));
    expect(calls).toEqual([]);
  });

  it('FLW-003 on a board, Run with nothing connected calls no device action and offers Connect', async () => {
    withBoard();
    const { controller, calls } = simulatorController();
    const { user } = dom.render(<Toolbar debugController={controller} />);
    await chooseBoard(user);
    await user.click(runButton());
    expect(calls).toEqual([]);
    const offer = notices().find((n) => n.status === 'warning');
    expect(offer?.title).toBe(dom.t('studio.flow.offer.connect'));
    expect(offer?.recover?.label).toBe(dom.t('studio.flow.offer.connect.action'));
  });

  it('FLW-003 on a board, Run never deploys: a current build that is not on the board offers Deploy', async () => {
    openProject(BUILD_OK, { board: 'rpi_pico' });
    const { controller, calls } = simulatorController({ state: 'idle', session: true });
    const { user } = dom.render(<Toolbar debugController={controller} />);
    await chooseBoard(user);
    await user.click(dom.screen.getByRole('button', { name: dom.t('toolbar.connect') }));
    await dom.waitFor(() => expect(calls).toContain('connectHardware'));
    await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.build.label')) }));
    await user.click(dom.screen.getByRole('menuitem', { name: new RegExp(dom.t('toolbar.compile.label')) }));
    await dom.waitFor(() => expect(notices().some((n) => n.title === dom.t('toolbarMsg.buildSucceeded'))).toBe(true));
    await user.click(runButton());
    expect(calls).not.toContain('start');
    expect(calls).not.toContain('loadProgram');
    expect(notices().find((n) => n.status === 'warning')?.recover?.label).toBe(dom.t('studio.flow.offer.deploy.action'));
  });

  it('FLW-006 Build with the preference on Always saves first and does not refuse', async () => {
    const { compile, saved } = openProject(BUILD_OK, { modified: true });
    const { user } = dom.render(<Toolbar debugController={simulatorController().controller} />);
    await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.build.label')) }));
    await user.click(dom.screen.getByRole('menuitem', { name: new RegExp(dom.t('toolbar.compile.label')) }));
    await dom.waitFor(() => expect(compile).toHaveBeenCalledTimes(1));
    expect(saved).toContain('files');
  });

  it('FLW-006 Build with the preference on Ask asks, and Cancel saves and builds nothing', async () => {
    const before = useAppSettings.getState().settings.saveBeforeRun;
    useAppSettings.getState().update({ saveBeforeRun: 'ask' });
    try {
      const { compile, saved } = openProject(BUILD_OK, { modified: true });
      const { user } = dom.render(
        <>
          <Toolbar debugController={simulatorController().controller} />
          <ActionConfirmHost />
        </>,
      );
      await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.build.label')) }));
      await user.click(dom.screen.getByRole('menuitem', { name: new RegExp(dom.t('toolbar.compile.label')) }));
      await user.click(await dom.screen.findByRole('button', { name: dom.t('common.cancel') }));
      await dom.settle();
      expect(saved).toEqual([]);
      expect(compile).not.toHaveBeenCalled();
    } finally {
      useAppSettings.getState().update({ saveBeforeRun: before });
    }
  });
});

describe('Run with a plant document open (PLS-003, FLW-014) in a DOM', () => {
  const fakeSession = (calls: string[], name: string) => ({
    state: 'stopped',
    slowdown: 1,
    onChange: () => () => undefined,
    start: async () => void calls.push(`${name}:start`),
    resume: () => undefined,
    pause: () => undefined,
    step: async () => undefined,
    stop: async () => undefined,
    reset: async () => undefined,
  });

  it('PLS-003 Run starts the simulator first and waits for the panel to bind, and re-bind, its plant transport', async () => {
    const { usePlantDocument } = await import('../store/usePlantDocument');
    openProject(BUILD_OK);
    const { controller, calls } = simulatorController();
    const plantCalls: string[] = [];
    const unregisters: Array<() => void> = [];
    // the panel binds when the program is loaded, and binds again when the I/O map of the new program arrives
    const load = (controller as unknown as { loadProgram: () => Promise<void> }).loadProgram;
    (controller as unknown as { loadProgram: () => Promise<void> }).loadProgram = async () => {
      await load();
      setTimeout(() => unregisters.push(registerPlantTransport(plantTransport(fakeSession(plantCalls, 'first') as never))), 20);
      setTimeout(() => unregisters.push(registerPlantTransport(plantTransport(fakeSession(plantCalls, 'second') as never))), 80);
    };
    usePlantDocument.getState().show();
    try {
      const { user } = dom.render(<Toolbar debugController={controller} />);
      await user.click(runButton());
      await dom.waitFor(() => expect(plantCalls).toEqual(['second:start']));
      expect(calls).toEqual(['startSimulation', 'loadProgram']);
    } finally {
      usePlantDocument.getState().close();
      unregisters.forEach((off) => off());
    }
  });
});

describe('The command bar follows the active transport (PLS-003, PLS-013, FLW-001) in a DOM', () => {
  /** A plant session whose state follows its calls, as a lock-step session does while the debug controller stays paused. */
  const lockStepSession = (state: string) => {
    const listeners = new Set<(event: unknown) => void>();
    const session = {
      state,
      slowdown: 1,
      onChange: (listener: (event: unknown) => void) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      move: (next: string) => {
        session.state = next;
        listeners.forEach((listener) => listener({ kind: 'state', state: next }));
      },
      start: async () => session.move('running'),
      resume: () => session.move('running'),
      pause: () => session.move('paused'),
      step: async () => undefined,
      stop: async () => session.move('stopped'),
      reset: async () => undefined,
    };
    return session;
  };
  const named = (key: 'toolbar.pause.label' | 'toolbar.resume.label' | 'toolbar.stop.label') =>
    dom.screen.queryByRole('button', { name: new RegExp(dom.t(key)) });
  // the build of these tests is not current, so the rail words a running session as "Running an older build"
  const rail = () => dom.screen.queryByText(/^Running/);

  it('PLS-003 running plant with the debug controller left paused: the bar shows Pause and Stop, not Resume, and the rail agrees', () => {
    const { controller } = liveController();
    (controller as unknown as { vmState: string }).vmState = 'paused';
    openProject(BUILD_OK);
    const session = lockStepSession('running');
    const unregister = registerPlantTransport(plantTransport(session as never));
    try {
      dom.render(<Toolbar debugController={controller} />);
      expect(named('toolbar.pause.label')).toBeTruthy();
      expect(named('toolbar.resume.label')).toBeNull();
      expect(named('toolbar.stop.label')).toBeTruthy();
      expect(rail()).toBeTruthy();
    } finally {
      unregister();
    }
  });

  it('PLS-003 Pause on the bar pauses the plant transport, and the bar then shows Resume, which resumes it (FLW-001)', async () => {
    const { controller, calls } = liveController();
    (controller as unknown as { vmState: string }).vmState = 'paused';
    const session = lockStepSession('running');
    const unregister = registerPlantTransport(plantTransport(session as never));
    try {
      const { user } = dom.render(<Toolbar debugController={controller} />);
      await user.click(button('toolbar.pause.label'));
      await dom.waitFor(() => expect(named('toolbar.resume.label')).toBeTruthy());
      expect(named('toolbar.pause.label')).toBeNull();
      expect(session.state).toBe('paused');
      await user.click(named('toolbar.resume.label')!);
      await dom.waitFor(() => expect(named('toolbar.pause.label')).toBeTruthy());
      expect(session.state).toBe('running');
      expect(calls).toEqual([]);
    } finally {
      unregister();
    }
  });

  it('PLS-003 a held plant shows Resume, and a plant that binds or unbinds after the first paint repaints the bar', () => {
    const { controller } = liveController();
    (controller as unknown as { vmState: string }).vmState = 'running';
    dom.render(<Toolbar debugController={controller} />);
    expect(named('toolbar.pause.label')).toBeTruthy();
    const session = lockStepSession('held');
    let unregister = () => {};
    dom.act(() => {
      unregister = registerPlantTransport(plantTransport(session as never));
    });
    expect(named('toolbar.resume.label')).toBeTruthy();
    expect(named('toolbar.pause.label')).toBeNull();
    dom.act(() => unregister());
    expect(named('toolbar.pause.label')).toBeTruthy();
  });
});

describe('An offer acts on the current state (FLW-003, LNK-009) in a DOM', () => {
  const chooseSimulation = async (user: ReturnType<typeof dom.render>['user']) => {
    await user.click(dom.screen.getByRole('button', { name: /rpi_pico/ }));
    await user.click(dom.screen.getByRole('menuitem', { name: new RegExp(dom.t('studio.flow.target.simulation')) }));
  };
  const offerHandler = () => notices().find((n) => n.status === 'warning')!.recover!.run;

  it(
    'FLW-003 a stale Connect offer, used after the target went back to Simulation, connects nothing and Run never reaches a ' + 'board',
    async () => {
      openProject(BUILD_OK, { board: 'rpi_pico' });
      const { controller, calls } = simulatorController();
      const { user } = dom.render(<Toolbar debugController={controller} />);
      await chooseBoard(user);
      await user.click(runButton());
      const stale = offerHandler();
      await chooseSimulation(user);
      stale();
      await dom.settle();
      expect(calls).not.toContain('connectHardware');
      expect(notices().filter((n) => n.status === 'warning')).toEqual([]);
      await user.click(runButton());
      await dom.waitFor(() => expect(calls).toContain('start'));
      expect(calls).not.toContain('connectHardware');
    },
  );

  it('FLW-003 a stale Deploy offer, used after the target went back to Simulation, does nothing', async () => {
    openProject(BUILD_OK, { board: 'rpi_pico' });
    const { controller, calls } = simulatorController({ state: 'idle', session: true });
    (controller as unknown as { disconnect: () => Promise<void> }).disconnect = async () => undefined;
    const { user } = dom.render(<Toolbar debugController={controller} />);
    await chooseBoard(user);
    await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.build.label')) }));
    await user.click(dom.screen.getByRole('menuitem', { name: new RegExp(dom.t('toolbar.compile.label')) }));
    await dom.waitFor(() => expect(notices().some((n) => n.title === dom.t('toolbarMsg.buildSucceeded'))).toBe(true));
    await user.click(runButton());
    const stale = offerHandler();
    await chooseSimulation(user);
    stale();
    await dom.settle();
    expect(calls).toEqual([]);
  });

  it('LNK-009 Run on the Simulation target refuses when the session it finds is a board, and loads and starts nothing', async () => {
    openProject(BUILD_OK);
    const { controller, calls } = simulatorController({ state: 'idle', session: true });
    (controller as unknown as { adapter: unknown }).adapter = { connected: true, type: 'serial' };
    const { user } = dom.render(<Toolbar debugController={controller} />);
    await user.click(runButton());
    await dom.waitFor(() => expect(notices().some((n) => n.status === 'error')).toBe(true));
    expect(calls).toEqual([]);
  });

  it('FLW-001 a sequence started before the project closed does not act on what comes next', async () => {
    openProject(BUILD_OK);
    const { controller, calls } = simulatorController();
    let release: () => void = () => undefined;
    const open = (controller as unknown as { startSimulation: () => Promise<void> }).startSimulation;
    (controller as unknown as { startSimulation: () => Promise<void> }).startSimulation = () =>
      new Promise<void>((resolve) => {
        release = () => void open().then(resolve);
      });
    const { user } = dom.render(<Toolbar debugController={controller} />);
    await user.click(runButton());
    await dom.waitFor(() => expect((runButton() as HTMLButtonElement).disabled).toBe(true));
    useIDEStore.setState({ projectSession: useIDEStore.getState().projectSession + 1 });
    release();
    await dom.waitFor(() => expect(notices().some((n) => n.status === 'error')).toBe(true));
    expect(calls).not.toContain('loadProgram');
    expect(calls).not.toContain('start');
  });
});

describe('Save all (FLW-005) in a DOM', () => {
  it('FLW-005 Save all is offered when any document is modified, and saves the configuration too', async () => {
    const { saved } = openProject(BUILD_OK);
    const second = { id: 'other', name: 'other.st', path: 'src/other.st', content: 'y', language: 'ST', isModified: true };
    useIDEStore.setState({
      loadedFiles: new Map([...useIDEStore.getState().loadedFiles, ['other', second]]) as never,
      projectConfigDirty: true,
    });
    const { user } = dom.render(<Toolbar debugController={simulatorController().controller} />);
    await user.click(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.save.label')) }));
    await user.click(dom.screen.getByRole('menuitem', { name: dom.t('studio.flow.saveAll.label') }));
    await dom.waitFor(() => expect(saved).toEqual(['files', 'config']));
  });

  it('FLW-005 with only the active file modified, Save stays one plain button', () => {
    openProject(BUILD_OK, { modified: true });
    dom.render(<Toolbar debugController={simulatorController().controller} />);
    const save = dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.save.label')) });
    expect(save.getAttribute('aria-haspopup')).toBeNull();
  });
});

describe('The target and the simulator session (FLW-007, FLW-008, FLW-010) in a DOM', () => {
  it('FLW-007 the target is shown once in the bar, and choosing the board while a program runs asks first', async () => {
    withBoard();
    const { controller, calls } = liveController();
    const { user } = dom.render(
      <>
        <Toolbar debugController={controller} />
        <ActionConfirmHost />
      </>,
    );
    const bar = dom.screen.getByRole('toolbar', { name: dom.t('toolbar.label') });
    const shown = [...bar.querySelectorAll('button')].filter((b) => (b.textContent ?? '').includes(dom.t('studio.flow.target.simulation')));
    expect(shown).toHaveLength(1);
    await chooseBoard(user);
    expect(await dom.screen.findByRole('alertdialog')).toBeTruthy();
    expect(calls).not.toContain('disconnect');
    await user.click(await dom.screen.findByRole('button', { name: dom.t('common.cancel') }));
    await dom.settle();
    expect(calls).not.toContain('disconnect');
  });

  it('FLW-008 with a simulation target the bar never says connect or disconnected', async () => {
    openProject(BUILD_OK);
    for (const state of ['disconnected', 'idle', 'running', 'paused']) {
      const { controller } = simulatorController({ state, session: state !== 'disconnected' });
      const view = dom.render(<Toolbar debugController={controller} />);
      const bar = dom.screen.getByRole('toolbar', { name: dom.t('toolbar.label') });
      const words = [...bar.querySelectorAll('button')]
        .map((b) => `${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`)
        .join(' | ');
      expect(words).not.toMatch(/connect|conectar|desconectar/i);
      view.unmount();
    }
  });

  it('FLW-010 live values are on when a simulation starts and off when a board connects', async () => {
    openProject(BUILD_OK, { board: 'rpi_pico' });
    const sim = simulatorController();
    const first = dom.render(<Toolbar debugController={sim.controller} />);
    await first.user.click(runButton());
    await dom.waitFor(() => expect(sim.calls).toContain('start'));
    expect(useIDEStore.getState().debug.mpeekEnabled).toBe(true);
    first.unmount();

    const board = simulatorController();
    const second = dom.render(<Toolbar debugController={board.controller} />);
    await chooseBoard(second.user);
    await second.user.click(dom.screen.getByRole('button', { name: dom.t('toolbar.connect') }));
    await dom.waitFor(() => expect(board.calls).toContain('connectHardware'));
    expect(useIDEStore.getState().debug.mpeekEnabled).toBe(false);
  });
});

describe('The budget of the bar (FLW-009) in a DOM', () => {
  /** The controls left and right of the project name, as the interface-budget script counts them (a `hidden` control is not shown). */
  const counts = () => {
    const bar = dom.screen.getByRole('toolbar', { name: dom.t('toolbar.label') });
    const name = bar.querySelector('[data-project-name]')!;
    const shown = [...bar.querySelectorAll('button')].filter((b) => !b.className.split(/\s+/).includes('hidden'));
    const left = shown.filter((b) => name.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING).length;
    return { left, right: shown.length - left };
  };

  it('FLW-009 the bar holds at most seven controls left of the project name in simulation when stopped, running and paused', () => {
    openProject(BUILD_OK, { modified: true });
    for (const state of ['disconnected', 'idle', 'running', 'paused']) {
      const view = dom.render(<Toolbar debugController={simulatorController({ state, session: state !== 'disconnected' }).controller} />);
      expect(counts().left).toBeLessThanOrEqual(7);
      expect(counts().right).toBeLessThanOrEqual(3);
      view.unmount();
    }
  });

  it('FLW-009 with a board the bar holds at most nine on the left and three on the right, in every state', async () => {
    openProject(BUILD_OK, { modified: true, board: 'rpi_pico' });
    for (const state of ['idle', 'running', 'paused']) {
      const { controller } = simulatorController({ state, session: true });
      // the board session outlives the change of target here, so that the board's own controls are counted
      (controller as unknown as { disconnect: () => Promise<void> }).disconnect = async () => undefined;
      const view = dom.render(
        <>
          <Toolbar debugController={controller} />
          <ActionConfirmHost />
        </>,
      );
      await chooseBoard(view.user);
      const confirm = dom.screen.queryByRole('button', { name: dom.t('studio.flow.target.change.action') });
      if (confirm) await view.user.click(confirm);
      await dom.settle();
      expect(dom.screen.getByRole('button', { name: dom.t('toolbar.disconnect') })).toBeTruthy();
      expect(dom.screen.getByRole('button', { name: new RegExp(dom.t('toolbar.deploy.label')) })).toBeTruthy();
      expect(counts().left).toBeLessThanOrEqual(9);
      expect(counts().right).toBeLessThanOrEqual(3);
      view.unmount();
    }
  });

  it('FLW-009 the theme, Generate ST and Live values are not in the bar', () => {
    openProject(BUILD_OK);
    dom.render(<Toolbar debugController={simulatorController({ state: 'running', session: true }).controller} />);
    const bar = dom.screen.getByRole('toolbar', { name: dom.t('toolbar.label') });
    const names = [...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? '');
    for (const key of ['toolbar.theme.label', 'toolbar.toSt.label', 'toolbar.live.enable'] as const) {
      expect(names).not.toContain(dom.t(key));
    }
  });
});

describe('What AI and MCP can start (LNK-009, constitution rule 9)', () => {
  it('LNK-009 the commands an AI proposal can run are none of Run, Step, Connect, Deploy or the simulator session', () => {
    const reachable = Object.values(AI_COMMAND_PROPOSALS) as string[];
    expect(reachable.sort()).toEqual(['build.compile', 'build.generateSt', 'online.simulation']);
    const physical = COMMANDS.filter((command) => 'physical' in command && command.physical).map((command) => command.id as string);
    for (const id of reachable) expect(physical).not.toContain(id);
    for (const id of ['debug.run', 'debug.step', 'online.connect', 'online.deploy', 'online.restartSimulator', 'debug.rebuildAndRestart'])
      expect(reachable).not.toContain(id);
  });
});
