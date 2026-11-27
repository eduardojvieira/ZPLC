import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { PlantIoMode } = await import('./PlantIoMode');
const { bindIoModeLink, createFakeIoModeLink, getIoModeStatus, requestFeedBoard } = await import('../../store/ioModeStatus');
const { useBoardPlantIo } = await import('./plantIoAdapter');
const { createFakeBoard } = await import('../board/fakeBoard');
const { createPlantIoController } = await import('../board/boardPlantLink');

const { getCommandState, publishCommandState, resetCommandsForTest, runCommand, bindCommands } = await import('../../commands/bus');
const { usePlantEditCommands } = await import('../../commands/bind/plantEdit');
const { listIoMap } = await import('../../runtime/ioMap');
const { useIDEStore } = await import('../../store/useIDEStore');
const { menuCommands } = await import('../../commands/menuEntry');

let unbind: (() => void) | undefined;
// the command state is the bus's, shared by every test file of the run: leave it as it was found
afterEach(() => {
  unbind?.();
  resetCommandsForTest();
});
const feed = () => dom.t('command.plant.feedBoard');

describe('plant I/O mode in the plant document (PLS-008, LNK-008, LNK-010)', () => {
  it('PLS-008 the action is offered only while a board is connected', () => {
    unbind = bindIoModeLink(createFakeIoModeLink());
    const off = dom.render(<PlantIoMode boardConnected={false} />);
    expect(dom.screen.queryByRole('button', { name: feed() })).toBeNull();
    off.unmount();
    dom.render(<PlantIoMode boardConnected />);
    expect(dom.screen.getByRole('button', { name: feed() })).toBeTruthy();
  });

  it('PLS-008 the dialog confirms before the mode starts and Cancel changes nothing', async () => {
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    const { user } = dom.render(<PlantIoMode boardConnected />);
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    const dialog = dom.screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain(dom.t('plant.ioMode.dialog.description'));
    expect(link.calls).toEqual([]);
    expect(document.activeElement).toBe(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.cancel') }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.cancel') }));
    expect(link.calls).toEqual([]);
    expect(dom.screen.queryByRole('alertdialog')).toBeNull();
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.confirm') }));
    expect(link.calls).toEqual(['start']);
  });

  it('LNK-010 mirroring is off by default and a person turns it on', async () => {
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    const { user } = dom.render(<PlantIoMode boardConnected />);
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.confirm') }));
    const box = (await dom.screen.findByRole('checkbox', { name: dom.t('plant.ioMode.mirror') })) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await user.click(box);
    expect(link.calls).toEqual(['start', 'mirror:true']);
    expect(getIoModeStatus().mirroring).toBe(true);
  });

  it('PLS-008 a failed start is a located message', async () => {
    unbind = bindIoModeLink(createFakeIoModeLink({ failStart: 'the board did not answer the entry' }));
    const { user } = dom.render(<PlantIoMode boardConnected />);
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.confirm') }));
    const alert = await dom.screen.findByRole('alert');
    expect(alert.textContent).toContain('the board did not answer the entry');
    expect(alert.textContent).toContain(dom.t('plant.ioMode.failedStaysBoard'));
  });

  it('LNK-008 the command asks the same question and starts nothing by itself', async () => {
    const link = createFakeIoModeLink();
    unbind = bindIoModeLink(link);
    dom.render(<PlantIoMode boardConnected />);
    requestFeedBoard(true);
    await dom.screen.findByRole('alertdialog');
    expect(link.calls).toEqual([]);
  });
});

// The wiring to the real M6 link, with the fake board: nothing here opens a port (rule 8).
const layout = {
  ipiBase: 0,
  ipiSize: 128,
  opiBase: 0x1000,
  opiSize: 128,
  workBase: 0x2000,
  workSize: 1,
  retainBase: 0x3000,
  retainSize: 1,
  codeBase: 0x4000,
  codeSize: 1,
};
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
const plantMap = {
  schemaVersion: 2 as const,
  target: { scene: 'tank' },
  signals: {
    'start.pressed': { direction: 'sensor' as const, type: 'BOOL' as const, point: 'Cell.Start' },
    'pump.run': { direction: 'command' as const, type: 'BOOL' as const, point: 'Cell.Run' },
  },
};
const makeCore = () =>
  ({ stepMs: 5, signals: [], apply: () => undefined, advance: () => undefined, sense: () => ({ 'start.pressed': true }) }) as never;

function rig(options: { supported?: boolean; maxSlots?: number } = {}) {
  const board = createFakeBoard({ program: () => [true], ...options });
  const log = { controllers: 0, enters: 0 };
  const port = {
    ...board.port,
    enter: (request: Parameters<typeof board.port.enter>[0]) => (log.enters++, board.port.enter(request)),
  };
  const deps = {
    port: () => port,
    firmware: () => null,
    subscribe: () => () => undefined,
    create: ((ports: Parameters<typeof createPlantIoController>[0]) => (
      log.controllers++,
      createPlantIoController(ports)
    )) as typeof createPlantIoController,
  };
  return { board, log, deps };
}

function Harness({
  deps,
  core,
  idle = true,
  io = ioMap,
}: {
  deps: ReturnType<typeof rig>['deps'];
  core: never;
  idle?: boolean;
  io?: typeof ioMap;
}) {
  const { available, blocked } = useBoardPlantIo({ core, map: plantMap, ioMap: io, idle, visible: true }, deps);
  usePlantEditCommands();
  return <PlantIoMode boardConnected={available} {...(blocked ? { blocked } : {})} />;
}

const hardware = () => {
  resetCommandsForTest();
  publishCommandState({ mode: 'hardware', connected: true, projectOpen: true });
};

describe('plant I/O mode wired to the board link (PLS-008, LNK-007, LNK-008, LNK-009, LNK-010)', () => {
  it('PLS-008 the action is offered only in hardware mode, connected, supported, with a plant no session drives', () => {
    const core = makeCore();
    const cases: [string, () => void, ReturnType<typeof rig>, boolean?][] = [
      ['simulation', () => publishCommandState({ mode: 'simulate', connected: true, projectOpen: true }), rig()],
      ['not connected', () => publishCommandState({ mode: 'hardware', connected: false, projectOpen: true }), rig()],
      ['a plant session runs', hardware, rig(), false],
    ];
    for (const [name, arrange, r, idle] of cases) {
      resetCommandsForTest();
      arrange();
      const view = dom.render(<Harness deps={r.deps} core={core} idle={idle ?? true} />);
      expect([name, dom.screen.queryByRole('button', { name: feed() }), getCommandState().plantFeedable]).toEqual([name, null, false]);
      view.unmount();
    }
    hardware();
    const r = rig();
    dom.render(<Harness deps={r.deps} core={core} />);
    expect(dom.screen.getByRole('button', { name: feed() })).toBeTruthy();
    expect(getCommandState().plantFeedable).toBe(true);
    expect(r.log).toEqual({ controllers: 0, enters: 0 });
  });

  it('LNK-008 Cancel builds no controller and the board is never entered', async () => {
    hardware();
    const r = rig();
    const { user } = dom.render(<Harness deps={r.deps} core={makeCore()} />);
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.cancel') }));
    expect(r.log).toEqual({ controllers: 0, enters: 0 });
    expect(r.board.state.active).toBe(false);
  });

  it('LNK-008 no physical action happens without the dialog: the commands and the Escape key only ask', async () => {
    hardware();
    const r = rig();
    const { user } = dom.render(<Harness deps={r.deps} core={makeCore()} />);
    expect(runCommand('plant.feedBoard')).toBe('ran');
    await dom.screen.findByRole('alertdialog');
    expect(r.log).toEqual({ controllers: 0, enters: 0 });
    await user.keyboard('{Escape}');
    expect(dom.screen.queryByRole('alertdialog')).toBeNull();
    requestFeedBoard(true);
    await dom.screen.findByRole('alertdialog');
    expect(r.log).toEqual({ controllers: 0, enters: 0 });
    expect(r.board.state.active).toBe(false);
    requestFeedBoard(false);
  });

  it('LNK-007 confirm, enter, frames, mirror on and off, stop: the board ends as it was', async () => {
    hardware();
    const r = rig();
    const { user } = dom.render(<Harness deps={r.deps} core={makeCore()} />);
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.confirm') }));
    const box = (await dom.screen.findByRole('checkbox', { name: dom.t('plant.ioMode.mirror') })) as HTMLInputElement;
    expect(r.log).toEqual({ controllers: 1, enters: 1 });
    expect(r.board.state.active).toBe(true);
    expect(getIoModeStatus().state).toBe('running');
    await user.click(box);
    expect(r.board.state.mirror).toBe(true);
    await user.click(box);
    expect(r.board.state.mirror).toBe(false);
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.stop') }));
    await dom.screen.findByRole('button', { name: feed() });
    expect(r.board.state.active).toBe(false);
    expect(getIoModeStatus().state).toBe('off');
  });

  it('LNK-018 a refused entry is a located message and the board stays as it was', async () => {
    hardware();
    const r = rig({ maxSlots: 0 });
    const { user } = dom.render(<Harness deps={r.deps} core={makeCore()} />);
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.confirm') }));
    const alert = await dom.screen.findByRole('alert');
    expect(alert.textContent).toContain(dom.t('plant.ioMode.refused', { code: 'BAD_REQUEST' }));
    expect(alert.textContent).toContain(dom.t('plant.ioMode.failedStaysBoard'));
    expect(r.board.state.active).toBe(false);
  });

  it('LNK-009 the mode stops when the board disconnects, when the plant changes and when the panel closes (app close)', async () => {
    for (const how of ['disconnect', 'project change', 'close'] as const) {
      hardware();
      const r = rig();
      const core = makeCore();
      const view = dom.render(<Harness deps={r.deps} core={core} />);
      await view.user.click(dom.screen.getByRole('button', { name: feed() }));
      await view.user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.confirm') }));
      await dom.screen.findByRole('checkbox', { name: dom.t('plant.ioMode.mirror') });
      await view.user.click(dom.screen.getByRole('checkbox', { name: dom.t('plant.ioMode.mirror') }));
      expect([how, r.board.state.active, r.board.state.mirror]).toEqual([how, true, true]);
      await dom.act(async () => {
        if (how === 'disconnect') publishCommandState({ connected: false });
        else if (how === 'project change') view.rerender(<Harness deps={r.deps} core={makeCore()} />);
        else window.dispatchEvent(new Event('beforeunload'));
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      });
      expect([how, r.board.state.active, r.board.state.mirror]).toEqual([how, false, false]);
      view.unmount();
    }
  });

  it('FND-002 plant.feedBoard stays a person-only command: the binding refuses it outside hardware mode', () => {
    resetCommandsForTest();
    const unbind = bindCommands({});
    publishCommandState({ mode: 'simulate', connected: true });
    runCommand('plant.feedBoard');
    expect(getIoModeStatus().confirming).toBe(false);
    unbind();
  });

  const settle = (ms = 40) => dom.act(async () => void (await new Promise<void>((resolve) => setTimeout(resolve, ms))));
  /** The board's `enter` answers only when the gate is released: the mode stays in `starting` meanwhile. */
  function gated() {
    const r = rig();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const port = r.deps.port();
    const inner = port.enter;
    (port as { enter: typeof inner }).enter = async (request) => (await gate, inner(request));
    return { ...r, release };
  }
  const confirmEntry = async (user: { click: (element: Element) => Promise<void> }) => {
    await user.click(dom.screen.getByRole('button', { name: feed() }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('plant.ioMode.confirm') }));
    await settle(10);
  };

  it('LNK-009 every ending while the mode is entering leaves the board inactive once the entry is answered', async () => {
    for (const how of ['unmount', 'project change', 'plant change', 'disconnect', 'close'] as const) {
      hardware();
      const g = gated();
      const view = dom.render(<Harness deps={g.deps} core={makeCore()} />);
      await confirmEntry(view.user);
      expect([how, getIoModeStatus().state]).toEqual([how, 'starting']);
      await dom.act(async () => {
        if (how === 'unmount') view.unmount();
        else if (how === 'project change') dom.patchStore(useIDEStore, { directoryHandle: { name: `other-${how}` } as never });
        else if (how === 'plant change') view.rerender(<Harness deps={g.deps} core={makeCore()} />);
        else if (how === 'disconnect') publishCommandState({ connected: false });
        else window.dispatchEvent(new Event('beforeunload'));
      });
      await dom.act(async () => g.release());
      await settle(80);
      const frames = g.board.state.frames;
      await settle(60);
      expect([how, g.log.enters, g.board.state.active, g.board.state.mirror, g.board.state.frames - frames]).toEqual([
        how,
        1,
        false,
        false,
        0,
      ]);
      expect([how, getIoModeStatus().state]).toEqual([how, 'off']);
      if (how !== 'unmount') view.unmount();
    }
  });

  it('LNK-008 Stop pressed while the mode starts is honoured: the board exits as soon as the entry is answered', async () => {
    hardware();
    const g = gated();
    const view = dom.render(<Harness deps={g.deps} core={makeCore()} />);
    await confirmEntry(view.user);
    const stop = dom.screen.getByRole('button', { name: dom.t('plant.ioMode.stop') }) as HTMLButtonElement;
    expect(stop.disabled).toBe(false);
    await view.user.click(stop);
    await dom.act(async () => g.release());
    await settle(80);
    expect([g.board.state.active, g.board.state.mirror, getIoModeStatus().state]).toEqual([false, false, 'off']);
    expect(getIoModeStatus().failure).toBeNull();
    await dom.screen.findByRole('button', { name: feed() });
    view.unmount();
  });

  it('PLS-008 the Online menu lists the action once, and that entry opens the dialog and starts nothing', async () => {
    const title = dom.t('command.online.feedBoardFromPlant');
    expect(menuCommands.filter((command) => command.titleKey.includes('feedBoard') && command.category === 'online')).toEqual([
      expect.objectContaining({ id: 'online.feedBoardFromPlant' }),
    ]);
    expect(title).toBe(feed());
    hardware();
    const r = rig();
    dom.render(<Harness deps={r.deps} core={makeCore()} />);
    expect(runCommand('online.feedBoardFromPlant', { respectEnabled: true })).toBe('ran');
    await dom.screen.findByRole('alertdialog');
    expect(r.log).toEqual({ controllers: 0, enters: 0 });
    requestFeedBoard(false);
  });

  it('LNK-012 a connected board without the PLANT capability shows the action disabled, with the reason as text', async () => {
    hardware();
    const r = rig({ supported: false });
    const { user } = dom.render(<Harness deps={r.deps} core={makeCore()} />);
    const button = dom.screen.getByRole('button', { name: feed() }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.body.textContent).toContain(dom.t('plant.ioMode.unsupported', { reason: dom.t('plantIo.unsupported.firmware') }));
    await user.click(button);
    expect(dom.screen.queryByRole('alertdialog')).toBeNull();
    expect([getCommandState().plantFeedable, runCommand('online.feedBoardFromPlant', { respectEnabled: true })]).toEqual([
      false,
      'unavailable',
    ]);
    expect(r.log).toEqual({ controllers: 0, enters: 0 });
  });

  it('LNK-007 with no compiled program the action is disabled with the reason as text, and nothing is built', async () => {
    hardware();
    const r = rig();
    const { user } = dom.render(<Harness deps={r.deps} core={makeCore()} io={{ inputs: [], outputs: [] }} />);
    const button = dom.screen.getByRole('button', { name: feed() }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.body.textContent).toContain(dom.t('plant.ioMode.noProgram'));
    await user.click(button);
    expect(dom.screen.queryByRole('alertdialog')).toBeNull();
    expect([getCommandState().plantFeedable, r.log]).toEqual([false, { controllers: 0, enters: 0 }]);
  });

  it('PLS-008 the component renders nothing while the action is neither offered nor explained', () => {
    hardware();
    const view = dom.render(<PlantIoMode boardConnected={false} />);
    expect(view.container.innerHTML).toBe('');
  });
});
