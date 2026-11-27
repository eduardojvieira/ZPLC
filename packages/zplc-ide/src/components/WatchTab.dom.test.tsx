import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import type { PlantCore, PlantSnapshot } from '../plant/contracts';
import { WATCH_FORCE_STATE } from '../runtime/debugAdapter';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { WatchTab } = await import('./WatchTab');
const { bindPlantMap, usePlantSession } = await import('../plant/ui/usePlantSession');

const bool = (bitOffset: number) => ({ addr: 0x0, type: 'BOOL', region: 'IPI', size: 1, bitOffset, tags: {} }) as const;
const program = (vars: Record<string, ReturnType<typeof bool>>) =>
  ({ type: 'PROGRAM', entryPoint: 0, vars, sourceMap: [], breakpoints: [] }) as unknown as DebugMap['pou'][string];

// two programs that each declare a Start: the Watch table reads the first one for the name `Start`
const DEBUG_MAP: DebugMap = {
  version: '1.0.0',
  programName: 'Motor',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-16T00:00:00Z',
  pou: { Motor: program({ Start: bool(0), Stop: bool(1) }), Pump: program({ Start: bool(2), Flow: bool(3) }) },
  memoryLayout: {
    ipiBase: 0x0000,
    ipiSize: 0x1000,
    opiBase: 0x1000,
    opiSize: 0x1000,
    workBase: 0x2000,
    workSize: 0x2000,
    retainBase: 0x4000,
    retainSize: 0x1000,
    codeBase: 0x5000,
    codeSize: 128,
  },
};

const signals = (...points: string[]) =>
  Object.fromEntries(points.map((point, index) => [`s${index}`, { direction: 'sensor', type: 'BOOL', point }]));
const plantMap = (...points: string[]) => ({ schemaVersion: 2, target: { scene: 'scene.json' }, signals: signals(...points) });

function prepare(watch: string[], debug: Record<string, unknown> = {}, files: Array<[string, string]> = []) {
  dom.patchStore(useIDEStore, {
    loadedFiles: new Map(files.map(([path, content], index) => [`f${index}`, { id: `f${index}`, path, content }])),
    debug: {
      ...useIDEStore.getState().debug,
      mode: 'simulate',
      debugMap: DEBUG_MAP,
      watchVariables: watch,
      liveValues: new Map(watch.map((path) => [path, false])),
      forcedValues: new Map(),
      forcesUnconfirmed: false,
      ...debug,
    },
  } as never);
}

// a fake controller: only what the Watch table calls
const controller = { setValue: async () => {}, toggleForceValue: async () => {} } as never;
const row = (path: string) => dom.screen.getByRole('cell', { name: path }).closest('tr')!;
const fromPlant = () => dom.t('u3Faceplate.fromPlant');
const editorOf = (path: string) => dom.screen.queryByRole('textbox', { name: dom.t('workbench.watch.newValue', { path }) });
const bind = (...points: string[]) => bindPlantMap(plantMap(...points) as never);

describe('The Watch tab marks the inputs the running plant feeds, by the program each row resolves to (PLS-007, LNK-006)', () => {
  it('PLS-007 Motor.Start fed: the row Start reads Motor.Start, so it is marked and read-only', async () => {
    prepare(['Start', 'Stop']);
    const unbind = bind('Motor.Start');
    const { user } = dom.render(<WatchTab controller={controller} />);
    expect(row('Start').textContent).toContain(fromPlant());
    expect(row('Stop').textContent).not.toContain(fromPlant());
    await user.dblClick(row('Start').querySelectorAll('td')[1]!);
    expect(editorOf('Start')).toBeNull();
    unbind();
  });

  it('PLS-007 Pump.Start fed: the row Start reads Motor.Start, so it stays editable and unmarked', async () => {
    prepare(['Start', 'Flow']);
    const unbind = bind('Pump.Start', 'Pump.Flow');
    const { user } = dom.render(<WatchTab controller={controller} />);
    expect(row('Start').textContent).not.toContain(fromPlant());
    expect(row('Flow').textContent).toContain(fromPlant());
    await user.dblClick(row('Start').querySelectorAll('td')[1]!);
    expect(editorOf('Start')).toBeTruthy();
    unbind();
  });

  it('LNK-006 a force set from the faceplate, stored under Motor.Start, unlocks the row Start', async () => {
    prepare(['Start'], {
      forcedValues: new Map([
        ['Motor.Start', { path: 'Motor.Start', address: 0, type: 'BOOL', bytesHex: '01', state: WATCH_FORCE_STATE.FORCED }],
      ]),
    });
    const unbind = bind('Motor.Start');
    const { user } = dom.render(<WatchTab controller={controller} />);
    expect(row('Start').textContent).toContain(fromPlant());
    await user.dblClick(row('Start').querySelectorAll('td')[1]!);
    expect(editorOf('Start')).toBeTruthy();
    unbind();
  });

  it('PLS-007 with no plant session bound nothing is marked, whatever the project files hold', () => {
    prepare(['Start'], {}, [
      ['scene.json', '{}'],
      ['plant-map.json', JSON.stringify(plantMap('Motor.Start'))],
    ]);
    dom.render(<WatchTab controller={controller} />);
    expect(row('Start').textContent).not.toContain(fromPlant());
  });

  it('PLS-007 one signal the program does not declare leaves the other inputs marked', () => {
    prepare(['Stop']);
    const unbind = bind('Motor.Stop', 'Motor.Missing');
    dom.render(<WatchTab controller={controller} />);
    expect(row('Stop').textContent).toContain(fromPlant());
    unbind();
  });

  it('PLS-007 the faceplate row of an input the plant feeds is marked and its switch is disabled until it is forced', () => {
    prepare(['Start']);
    const unbind = bind('Motor.Start');
    dom.render(<WatchTab controller={controller} />);
    const faceplate = document.querySelector('[data-faceplate] [data-input="Motor.Start"]')!;
    expect(faceplate.textContent).toContain(fromPlant());
    expect((faceplate.querySelector('button[role="switch"]') as HTMLButtonElement).disabled).toBe(true);
    const other = document.querySelector('[data-faceplate] [data-input="Motor.Stop"]')!;
    expect(other.textContent).not.toContain(fromPlant());
    unbind();
  });
});

// the map a running plant session binds: of a shipped scene, of a saved scene, or of the project's own scene
const EMPTY_SCENE = JSON.stringify({
  schemaVersion: 1,
  name: 'Empty',
  parts: [],
  cameras: [{ name: 'Overview', position: [0, 8, 8], target: [0, 0, 0] }],
});
const snapshot = (): PlantSnapshot => ({ timeMs: 0, scans: 0, parts: [], items: [], facts: {} });
const core = { snapshot, dispose: () => undefined } as unknown as PlantCore;
const session = () => ({
  state: 'idle',
  slowdown: 1,
  scans: 0,
  heldSteps: 0,
  scanMs: 10,
  start: async () => undefined,
  pause: () => undefined,
  resume: () => undefined,
  step: async () => undefined,
  stop: async () => undefined,
  reset: async () => undefined,
  onChange: () => () => undefined,
  settled: async () => undefined,
});
const runtime = {
  connected: true,
  type: 'native',
  setClockMode: async () => ({ scanIntervalMs: 10 }),
  scenarioStep: async () => undefined,
  getInfo: async () => ({ cycles: 0 }),
  peek: async () => new Uint8Array(1),
  pokeN: async () => undefined,
  reset: async () => undefined,
};
const deps = (shippedMap: string) =>
  ({
    loadEngine: async () => ({
      createPlantCore: async () => core,
      shippedScene: async () => ({ scene: EMPTY_SCENE, map: shippedMap }),
    }),
    createSession: session,
  }) as never;

function Panel({ shipped, own }: { shipped?: string; own?: string }) {
  usePlantSession(
    { adapter: runtime } as never,
    shipped ? { kind: 'shipped', id: 'motor' } : { kind: 'empty' },
    deps(shipped ?? ''),
    own === undefined ? undefined : { scene: EMPTY_SCENE, map: own },
  );
  return <WatchTab controller={controller} />;
}

describe('The Watch tab reads the map the plant session binds (PLS-007)', () => {
  it('PLS-007 the map of a shipped scene marks the input once its session is bound, and unmarks it when the panel goes', async () => {
    prepare(['Stop']);
    const view = dom.render(<Panel shipped={JSON.stringify(plantMap('Motor.Stop'))} />);
    await dom.waitFor(() => expect(row('Stop').textContent).toContain(fromPlant()));
    view.unmount();
    dom.render(<WatchTab controller={controller} />);
    expect(row('Stop').textContent).not.toContain(fromPlant());
  });

  it('PLS-007 the own map of an edited or saved scene marks the input', async () => {
    prepare(['Stop']);
    dom.render(<Panel own={JSON.stringify(plantMap('Motor.Stop'))} />);
    await dom.waitFor(() => expect(row('Stop').textContent).toContain(fromPlant()));
  });
});
