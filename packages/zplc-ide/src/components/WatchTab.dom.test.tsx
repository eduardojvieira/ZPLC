import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { WatchTab } = await import('./WatchTab');

const bool = (bitOffset: number) => ({ addr: 0x0, type: 'BOOL', region: 'IPI', size: 1, bitOffset, tags: {} }) as const;
const program = (vars: Record<string, ReturnType<typeof bool>>) =>
  ({ type: 'PROGRAM', entryPoint: 0, vars, sourceMap: [], breakpoints: [] }) as unknown as DebugMap['pou'][string];

// two programs that each declare a Start; only Motor.Start is fed by the plant
const DEBUG_MAP: DebugMap = {
  version: '1.0.0',
  programName: 'Motor',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-16T00:00:00Z',
  pou: { Motor: program({ Start: bool(0), Stop: bool(1) }), Pump: program({ Start: bool(2) }) },
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

const plantMap = (point: string) =>
  JSON.stringify({ schemaVersion: 2, target: { scene: 'scene.json' }, signals: { go: { direction: 'sensor', type: 'BOOL', point } } });

function prepare(mapText: string | undefined, watch: string[]) {
  dom.patchStore(useIDEStore, {
    loadedFiles: new Map(mapText === undefined ? [] : [['m', { id: 'm', path: 'plant-map.json', content: mapText }]]),
    debug: {
      ...useIDEStore.getState().debug,
      mode: 'simulate',
      debugMap: DEBUG_MAP,
      watchVariables: watch,
      liveValues: new Map(watch.map((path) => [path, false])),
      forcedValues: new Map(),
      forcesUnconfirmed: false,
    },
  } as never);
}

// a fake controller: only what the Watch table calls
const controller = { setValue: async () => {}, toggleForceValue: async () => {} } as never;

const row = (path: string) => dom.screen.getByRole('cell', { name: path }).closest('tr')!;
const fromPlant = () => dom.t('u3Faceplate.fromPlant');

// a Watch row names a variable by its bare name, and the table reads the first program that has it
describe('The Watch tab marks the inputs the plant map drives (PLS-007, LNK-006)', () => {
  it('PLS-007 an input only one program has is marked when the project plant map drives it', () => {
    prepare(plantMap('Motor.Stop'), ['Stop', 'Start']);
    dom.render(<WatchTab />);
    expect(row('Stop').textContent).toContain(fromPlant());
    expect(row('Start').textContent).not.toContain(fromPlant());
  });

  it('PLS-007 a name two programs share is not marked, and stays editable, though one of them is fed', async () => {
    prepare(plantMap('Motor.Start'), ['Start']);
    const { user } = dom.render(<WatchTab controller={controller} />);
    expect(row('Start').textContent).not.toContain(fromPlant());
    await user.dblClick(row('Start').querySelectorAll('td')[1]!);
    expect(dom.screen.getByRole('textbox', { name: dom.t('workbench.watch.newValue', { path: 'Start' }) })).toBeTruthy();
  });

  it('PLS-007 with no plant map, or an invalid one, nothing is marked', () => {
    for (const text of [undefined, '{ not json', JSON.stringify({ schemaVersion: 2 }), plantMap('Motor.Missing')]) {
      prepare(text, ['Stop']);
      const view = dom.render(<WatchTab />);
      expect(row('Stop').textContent).not.toContain(fromPlant());
      view.unmount();
    }
  });
});
