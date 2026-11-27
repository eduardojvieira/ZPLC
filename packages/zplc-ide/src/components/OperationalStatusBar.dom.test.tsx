import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { OperationalStatusBar, OperationalStatusView } = await import('./OperationalStatusBar');
const { presentOperationalStatus } = await import('./operationalStatusPresentation');
const { presentConnection } = await import('./connectionPresentation');
const { registerPlantTransport } = await import('../store/useTransport');
const { BuildMenu } = await import('./ToolbarBuildMenu');
const { bindCommands, runCommand, resetCommandsForTest } = await import('../commands/bus');
const { bindIoModeLink, createFakeIoModeLink, startIoMode, stopIoMode, setIoModeMirroring } = await import('../store/ioModeStatus');
const { createPlantIoAdapter } = await import('../plant/ui/plantIoAdapter');
const { createFakeBoard } = await import('../plant/board/fakeBoard');

const idle = {
  mode: 'simulate' as const,
  adapterType: null,
  connected: false,
  status: { text: 'Ready', tone: 'neutral' as const },
  connecting: false,
  faulted: false,
};

describe('Operational status bar and force banner (IDE-029, UX-018) in a DOM', () => {
  it('shows nothing until a project is open', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: false });
    const { container } = dom.render(<OperationalStatusBar {...idle} />);
    expect(container.textContent).toBe('');
  });

  it('is a labelled region with the connection and the run status as live status regions', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    dom.render(<OperationalStatusBar {...idle} />);
    expect(dom.screen.getByRole('region', { name: dom.t('status.label') })).toBeTruthy();
    const statuses = dom.screen.getAllByRole('status');
    expect(statuses.length).toBe(2);
    for (const status of statuses) expect(status.getAttribute('aria-live')).toBe('polite');
    expect(statuses.map((status) => status.textContent).join(' ')).toContain('Ready');
  });

  it('tells a person using a screen reader that a connection is being made, by words', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    dom.render(<OperationalStatusBar {...idle} mode="hardware" adapterType="serial" connecting />);
    const indicator = document.querySelector('[data-connection]') as HTMLElement;
    expect(indicator.getAttribute('role')).toBe('status');
    expect(indicator.getAttribute('data-connection')).toBe('hardware-connecting');
    expect(indicator.textContent).toContain(dom.t('connection.hardware.connecting'));
  });

  it('announces unconfirmed forces as an alert, and active forces as a note without alert', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    dom.render(
      <OperationalStatusView
        indicator={{ state: 'simulation', label: 'Simulation', tone: 'info', icon: 'monitor' } as never}
        presentation={
          {
            mode: 'Simulation',
            runtime: 'Native',
            status: { text: 'Running', tone: 'success' },
            force: { kind: 'unconfirmed', text: 'Force state unconfirmed' },
          } as never
        }
      />,
    );
    expect(dom.screen.getByRole('alert').textContent).toBe('Force state unconfirmed');
  });

  it('an active force is shown without raising an alert', () => {
    dom.render(
      <OperationalStatusView
        indicator={{ state: 'simulation', label: 'Simulation', tone: 'info', icon: 'monitor' } as never}
        presentation={
          {
            mode: 'Simulation',
            runtime: 'Native',
            status: { text: 'Running', tone: 'success' },
            force: { kind: 'active', text: '2 active forces' },
          } as never
        }
      />,
    );
    expect(dom.screen.queryByRole('alert')).toBeNull();
    expect(dom.screen.getByText('2 active forces')).toBeTruthy();
  });

  it('shows the debug state and the limits note when given', () => {
    dom.render(
      <OperationalStatusView
        indicator={{ state: 'simulation', label: 'Simulation', tone: 'info', icon: 'monitor' } as never}
        debug="Paused at line 4"
        presentation={
          {
            mode: 'Simulation',
            runtime: 'Native',
            status: { text: 'Paused', tone: 'attention' },
            limits: 'Timing is not real time',
          } as never
        }
      />,
    );
    expect(dom.screen.getByText('Paused at line 4')).toBeTruthy();
    expect(dom.screen.getByRole('note').textContent).toBe('Timing is not real time');
  });
});

const view = (over: Partial<Parameters<typeof presentOperationalStatus>[0]>) =>
  presentOperationalStatus({
    mode: 'simulate',
    adapterType: 'native',
    connected: true,
    vmInfo: { cycles: 12 },
    status: { text: 'Running', tone: 'success' },
    projectTargetBoard: undefined,
    projectTasks: [{ interval_ms: 10 }],
    controllerInfo: null,
    controllerStatus: null,
    forcedValuesCount: 0,
    forcesUnconfirmed: false,
    nativeTrace: [{ source: 'native', overruns: 0 }],
    ...over,
  });
const sim = { state: 'simulation', label: 'Simulation', tone: 'info', icon: 'monitor' } as never;

describe('FLW-011 the status rail in one line', () => {
  it('FLW-011 while a simulation runs the line has at most four items, in this order', () => {
    dom.render(<OperationalStatusView indicator={sim} presentation={view({ forcedValuesCount: 2 })} />);
    const items = [...document.querySelectorAll('[data-status-item]')].map((item) => item.textContent ?? '');
    expect(items.length).toBeLessThanOrEqual(4);
    expect(items[0]).toContain('Simulation');
    expect(items[1]).toContain('Running');
    expect(items[2]).toContain('10 ms');
    expect(items[3]).toContain('2');
  });

  it('FLW-011 overruns appear only when they are not zero', () => {
    dom.render(<OperationalStatusView indicator={sim} presentation={view({})} />);
    expect(dom.screen.queryByText(dom.t('studio.status.overruns'))).toBeNull();
    dom.render(<OperationalStatusView indicator={sim} presentation={view({ nativeTrace: [{ source: 'native', overruns: 3 }] })} />);
    expect(dom.screen.getByText(dom.t('studio.status.overruns'))).toBeTruthy();
  });

  it('FLW-011 the details open by keyboard and list runtime, cycles, tasks, firmware and protocol', async () => {
    resetCommandsForTest();
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    dom.render(<OperationalStatusBar {...idle} adapterType="native" connected />);
    const trigger = dom.screen.getByRole('button', { name: dom.t('studio.status.details') });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    dom.act(() => {
      runCommand('view.statusDetails');
    });
    const panel = dom.screen.getByRole('dialog', { name: dom.t('studio.status.detailsLabel') });
    for (const key of ['runtime', 'cycles', 'tasks', 'firmware', 'protocol'] as const)
      expect(dom.within(panel).getByText(dom.t(`studio.status.detail.${key}`))).toBeTruthy();
  });

  it('FLW-011 a simulation with no session yet is not shown as not connected, and a board is', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    const first = dom.render(<OperationalStatusBar {...idle} />);
    expect(document.querySelector('[data-connection]')?.getAttribute('data-connection')).toBe('simulation-native');
    first.unmount();
    dom.render(<OperationalStatusBar {...idle} mode="hardware" adapterType="serial" />);
    expect(document.querySelector('[data-connection]')?.getAttribute('data-connection')).toBe('disconnected');
  });

  it('IDE-025 the degraded label is visible without opening the details', () => {
    dom.render(<OperationalStatusView indicator={sim} presentation={view({ adapterType: 'wasm' })} />);
    expect(dom.screen.getByRole('note').textContent).toContain('Software runtime');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('IDE-029 the force banner and the unconfirmed alert are unchanged', () => {
    dom.render(<OperationalStatusView indicator={sim} presentation={view({ forcedValuesCount: 2 })} />);
    expect(dom.screen.getByText('2 active forces')).toBeTruthy();
    expect(dom.screen.queryByRole('alert')).toBeNull();
    dom.render(<OperationalStatusView indicator={sim} presentation={view({ forcesUnconfirmed: true })} />);
    expect(dom.screen.getByRole('alert').textContent).toContain('Force state unconfirmed');
  });

  it('UX-018 the hardware indicator differs from simulation in text, icon and colour', () => {
    const base = { mode: 'simulate', adapterType: 'native', connected: true, connecting: false, faulted: false } as const;
    const simulation = presentConnection(base, dom.t);
    const hardware = presentConnection({ ...base, mode: 'hardware', adapterType: 'serial' }, dom.t);
    expect(hardware.label).not.toBe(simulation.label);
    expect(hardware.icon).not.toBe(simulation.icon);
    expect(hardware.tone).not.toBe(simulation.tone);
  });

  it(
    'FLW-012 with a stale running build the rail offers Rebuild and restart in simulation and Build on a board, and on a board it never ' +
      'deploys',
    () => {
      resetCommandsForTest();
      const ran: string[] = [];
      bindCommands({
        'debug.rebuildAndRestart': () => void ran.push('rebuild'),
        'build.compile': () => void ran.push('build'),
        'online.deploy': () => void ran.push('deploy'),
      });
      dom.patchStore(useIDEStore, { isProjectOpen: true });
      const stale = {
        target: 'simulation',
        connected: true,
        transport: 'running',
        buildExists: true,
        currentBuild: false,
        programLoaded: true,
      } as const;
      const first = dom.render(
        <OperationalStatusBar {...idle} adapterType="native" connected status={{ text: 'x', tone: 'neutral', input: stale }} />,
      );
      expect(dom.screen.getByText('Running an older build')).toBeTruthy();
      dom.fireEvent.click(dom.screen.getByRole('button', { name: dom.t('studio.status.action.rebuildAndRestart') }));
      first.unmount();
      dom.render(
        <OperationalStatusBar
          {...idle}
          mode="hardware"
          adapterType="serial"
          connected
          status={{ text: 'x', tone: 'neutral', input: { ...stale, target: 'board' } }}
        />,
      );
      dom.fireEvent.click(dom.screen.getByRole('button', { name: dom.t('studio.status.action.build') }));
      expect(ran).toEqual(['rebuild', 'build']);
    },
  );
});

describe('PLS-013 the plant session speaks through the one state of the rail', () => {
  const current = {
    target: 'simulation',
    connected: true,
    transport: 'stopped',
    buildExists: true,
    currentBuild: true,
    programLoaded: true,
  } as const;
  const plant = (state: 'running' | 'held', slowdown: number) => ({ kind: 'plant', state, slowdown, onChange: () => () => {} }) as never;

  it('PLS-013 a bound plant session slower than real time reads Running slower than real time in the line', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    const unregister = registerPlantTransport(plant('running', 0.5));
    dom.render(<OperationalStatusBar {...idle} adapterType="native" connected status={{ text: 'x', tone: 'neutral', input: current }} />);
    expect(dom.screen.getByText('Running slower than real time')).toBeTruthy();
    unregister();
  });

  it('PLS-013 a change of the plant slowdown repaints the rail by itself, and a plant bound after the first paint is heard', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    const listeners = new Set<() => void>();
    const live = {
      kind: 'plant',
      state: 'running',
      slowdown: 1,
      onChange: (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener)),
    };
    dom.render(<OperationalStatusBar {...idle} adapterType="native" connected status={{ text: 'x', tone: 'neutral', input: current }} />);
    expect(dom.screen.getByText('Stopped')).toBeTruthy();
    let unregister = () => {};
    dom.act(() => {
      unregister = registerPlantTransport(live as never);
    });
    expect(dom.screen.getByText('Running')).toBeTruthy();
    live.slowdown = 0.5;
    dom.act(() => listeners.forEach((listener) => listener()));
    expect(dom.screen.getByText('Running slower than real time')).toBeTruthy();
    dom.act(() => unregister());
    expect(dom.screen.getByText('Stopped')).toBeTruthy();
  });

  it('PLS-013 a held scan reads Paused, and the program alone reads as before once the plant is unbound', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    const unregister = registerPlantTransport(plant('held', 1));
    const first = dom.render(
      <OperationalStatusBar {...idle} adapterType="native" connected status={{ text: 'x', tone: 'neutral', input: current }} />,
    );
    expect(dom.screen.getByText('Paused')).toBeTruthy();
    unregister();
    first.unmount();
    dom.render(<OperationalStatusBar {...idle} adapterType="native" connected status={{ text: 'x', tone: 'neutral', input: current }} />);
    expect(dom.screen.getByText('Stopped')).toBeTruthy();
  });
});

describe('MSG-007 the Build control carries a mark while the last build is not of the current sources', () => {
  const menu = {
    open: false,
    menuRef: { current: null },
    triggerRef: { current: null },
    firstItemRef: { current: null },
    openMenu: () => {},
    closeMenu: () => {},
  };
  const build = (hasCurrentCompileResult: boolean) =>
    dom.render(
      <BuildMenu
        menu={menu as never}
        onCompile={() => {}}
        onGenerateSt={undefined}
        onDownloadBytecode={() => {}}
        onViewAssembly={() => {}}
        hasCurrentCompileResult={hasCurrentCompileResult}
      />,
    );

  it('MSG-007 the mark is there for a stale build and gone for a current one', () => {
    const stale = build(false);
    expect(document.querySelector('[data-build-stale]')).not.toBeNull();
    stale.unmount();
    build(true);
    expect(document.querySelector('[data-build-stale]')).toBeNull();
  });
});

describe('PLS-008 plant I/O mode is a third state of the status rail', () => {
  const board = { ...idle, mode: 'hardware' as const, adapterType: 'serial' as const, connected: true };
  const hardwareLine = board;
  let unbind: (() => void) | undefined;
  const open = () => dom.patchStore(useIDEStore, { isProjectOpen: true });
  const indicator = () => document.querySelector('[data-connection], [data-io-mode]') as HTMLElement;
  const looks = (element: HTMLElement) => ({
    text: element.textContent,
    icon: element.querySelector('svg')?.getAttribute('class'),
    tone: element.querySelector('[data-tone]')?.getAttribute('data-tone'),
  });
  const cleanup = () => dom.act(() => unbind?.());

  it('PLS-008 the third state differs from Simulation and from Board in text, icon and colour', async () => {
    open();
    const sim = dom.render(<OperationalStatusBar {...idle} adapterType="native" connected />);
    const simulation = looks(indicator());
    sim.unmount();
    const hw = dom.render(<OperationalStatusBar {...board} />);
    const hardware = looks(indicator());
    hw.unmount();
    unbind = bindIoModeLink(createFakeIoModeLink());
    await dom.act(() => startIoMode());
    dom.render(<OperationalStatusBar {...board} />);
    const mode = looks(indicator());
    expect(indicator().getAttribute('data-io-mode')).toBe('running');
    expect(mode.text).toContain(dom.t('status.ioMode.label'));
    for (const other of [simulation, hardware]) {
      expect(mode.text).not.toBe(other.text);
      expect(mode.icon).not.toBe(other.icon);
      expect(mode.tone).not.toBe(other.tone);
    }
    cleanup();
  });

  it('PLS-008 the existing states render exactly as before while the mode is off or its start failed', async () => {
    open();
    const plain = dom.render(<OperationalStatusBar {...board} />);
    const before = plain.container.innerHTML;
    plain.unmount();
    unbind = bindIoModeLink(createFakeIoModeLink({ failStart: 'no answer' }));
    await dom.act(() => startIoMode());
    const after = dom.render(<OperationalStatusBar {...board} />);
    expect(after.container.innerHTML).toBe(before);
    expect(document.querySelector('[data-connection]')?.getAttribute('data-connection')).toBe('hardware-connected');
    cleanup();
  });

  it('LNK-010 a mark shows while mirroring is on, and not before', async () => {
    open();
    unbind = bindIoModeLink(createFakeIoModeLink());
    await dom.act(() => startIoMode());
    dom.render(<OperationalStatusBar {...board} />);
    expect(dom.screen.queryByText(dom.t('status.ioMode.mirroring'))).toBeNull();
    await dom.act(() => setIoModeMirroring(true));
    expect(dom.screen.getByText(dom.t('status.ioMode.mirroring'))).toBeTruthy();
    cleanup();
  });

  it('LNK-014 the measured latency is in the details of the rail', async () => {
    resetCommandsForTest();
    open();
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    await dom.act(() => startIoMode());
    dom.act(() => link.measure({ last: 4, worst: 9 }));
    dom.render(<OperationalStatusBar {...board} />);
    dom.act(() => {
      runCommand('view.statusDetails');
    });
    const panel = dom.screen.getByRole('dialog', { name: dom.t('studio.status.detailsLabel') });
    expect(dom.within(panel).getByText(dom.t('status.ioMode.latency'))).toBeTruthy();
    expect(panel.textContent).toContain('4');
    expect(panel.textContent).toContain('9');
    cleanup();
  });

  it('PLS-008 the rail shows off, starting, running with mirroring and latency, then Board again when the link ends, from the real link', async () => {
    resetCommandsForTest();
    open();
    const board = createFakeBoard({ program: () => [true] });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const port = { ...board.port, enter: async (request: Parameters<typeof board.port.enter>[0]) => (await gate, board.port.enter(request)) };
    const layout = { ipiBase: 0, ipiSize: 128, opiBase: 0x1000, opiSize: 128, workBase: 0x2000, workSize: 1, retainBase: 0x3000, retainSize: 1, codeBase: 0x4000, codeSize: 1 };
    const { listIoMap } = await import('../runtime/ioMap');
    const ioMap = listIoMap({
      version: '1.0.0',
      programName: 'Cell',
      compilerVersion: 'test',
      generatedAt: '',
      memoryLayout: layout,
      pou: {
        Cell: {
          type: 'PROGRAM',
          sourceMap: [],
          breakpoints: [],
          vars: {
            Start: { addr: 8, type: 'BOOL', region: 'IPI', size: 1, bitOffset: 1 },
            Run: { addr: 0x1008, type: 'BOOL', region: 'OPI', size: 1, bitOffset: 3 },
          },
        },
      },
    });
    const map = {
      schemaVersion: 2 as const,
      target: { scene: 'tank' },
      signals: {
        'start.pressed': { direction: 'sensor' as const, type: 'BOOL' as const, point: 'Cell.Start' },
        'pump.run': { direction: 'command' as const, type: 'BOOL' as const, point: 'Cell.Run' },
      },
    };
    const core = { stepMs: 5, signals: [], apply: () => undefined, advance: () => undefined, sense: () => ({}) } as never;
    const adapter = createPlantIoAdapter(() => ({ link: port, core, map, ioMap, scanMs: 10, frameMs: 5, timeoutMs: 200 }));
    unbind = bindIoModeLink(adapter);
    dom.render(<OperationalStatusBar {...hardwareLine} />);
    expect(indicator().getAttribute('data-connection')).toBe('hardware-connected');
    let started: Promise<void> = Promise.resolve();
    await dom.act(async () => {
      started = startIoMode();
    });
    expect(indicator().getAttribute('data-io-mode')).toBe('starting');
    await dom.act(async () => {
      release();
      await started;
    });
    expect(indicator().getAttribute('data-io-mode')).toBe('running');
    await dom.act(async () => {
      await setIoModeMirroring(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
    });
    expect(dom.screen.getByText(dom.t('status.ioMode.mirroring'))).toBeTruthy();
    await dom.act(async () => board.raiseExit('LINK_LOST'));
    expect(indicator().getAttribute('data-connection')).toBe('hardware-connected');
    await dom.act(() => stopIoMode());
    await cleanup();
    await adapter.dispose();
  });
});
