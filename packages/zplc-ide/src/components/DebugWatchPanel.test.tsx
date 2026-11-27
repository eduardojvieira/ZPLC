import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import { WATCH_FORCE_STATE } from '../runtime/debugAdapter';
import { plantFedPaths } from '../runtime/faceplateState';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { DebugWatchPanel } = await import('./DebugWatchPanel');

const DEBUG_MAP: DebugMap = {
  version: '1.0.0',
  programName: 'Motor',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-16T00:00:00Z',
  pou: {
    Motor: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: {
        Start: { addr: 0x0, type: 'BOOL', region: 'IPI', size: 1, bitOffset: 0, tags: {} },
        Stop: { addr: 0x0, type: 'BOOL', region: 'IPI', size: 1, bitOffset: 1, tags: {} },
      },
      sourceMap: [],
      breakpoints: [],
    },
  },
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

function prepare(debug: Record<string, unknown> = {}) {
  dom.patchStore(useIDEStore, {
    debug: {
      ...useIDEStore.getState().debug,
      mode: 'simulate',
      debugMap: DEBUG_MAP,
      watchVariables: ['Start', 'Stop'],
      liveValues: new Map([
        ['Start', false],
        ['Stop', false],
      ]),
      forcedValues: new Map(),
      forcesUnconfirmed: false,
      ...debug,
    },
  } as never);
}

const row = (path: string) => dom.screen.getByRole('cell', { name: path }).closest('tr')!;
// the plant map binds Start of the program Motor; the Watch table names a variable by its bare name
const fed = plantFedPaths({ drives: { start: { path: 'Motor.Start' } } });
const fromPlant = () => dom.t('u3Faceplate.fromPlant');

describe('One owner per input in the Watch tab (PLS-007, LNK-006, UX-009)', () => {
  it('PLS-007 an input the plant feeds is read-only in the Watch tab and marked from the plant', async () => {
    prepare();
    const writes: unknown[][] = [];
    const { user } = dom.render(
      <DebugWatchPanel
        plantFed={fed}
        setValue={async (...args) => {
          writes.push(args);
        }}
        toggleForceValue={async () => {}}
      />,
    );
    // the mark is text, not only colour (VIS-003)
    expect(row('Start').textContent).toContain(fromPlant());
    expect(row('Stop').textContent).not.toContain(fromPlant());
    await user.dblClick(row('Start').querySelectorAll('td')[1]!);
    expect(dom.screen.queryByRole('textbox', { name: dom.t('workbench.watch.newValue', { path: 'Start' }) })).toBeNull();
    expect(writes).toEqual([]);
  });

  it('LNK-006 a plant-fed input can still be forced and the force is shown', async () => {
    prepare();
    const forces: unknown[][] = [];
    const { user } = dom.render(
      <DebugWatchPanel
        plantFed={fed}
        toggleForceValue={async (...args) => {
          forces.push(args);
        }}
        setValue={async () => {}}
      />,
    );
    const force = dom.screen.getByRole('checkbox', { name: dom.t('workbench.watch.forcePath', { path: 'Start' }) }) as HTMLInputElement;
    expect(force.disabled).toBe(false);
    await user.click(force);
    expect(forces).toHaveLength(1);
    expect(forces[0]![0]).toBe('Start');
    expect(forces[0]![4]).toBe(true);
  });

  it('LNK-006 a forced plant-fed input shows the force, keeps its mark, and its forced value can be changed', async () => {
    prepare({
      forcedValues: new Map([['Start', { path: 'Start', address: 0, type: 'BOOL', bytesHex: '00', state: WATCH_FORCE_STATE.FORCED }]]),
    });
    const { user } = dom.render(<DebugWatchPanel plantFed={fed} toggleForceValue={async () => {}} setValue={async () => {}} />);
    expect(row('Start').querySelector('[data-forced="true"]')).toBeTruthy();
    expect(row('Start').textContent).toContain(fromPlant());
    await user.dblClick(row('Start').querySelectorAll('td')[1]!);
    expect(dom.screen.getByRole('textbox', { name: dom.t('workbench.watch.newValue', { path: 'Start' }) })).toBeTruthy();
  });

  it('PLS-007 an input with no plant is editable as before', async () => {
    prepare();
    const writes: unknown[][] = [];
    const { user } = dom.render(
      <DebugWatchPanel
        setValue={async (...args) => {
          writes.push(args);
        }}
        toggleForceValue={async () => {}}
      />,
    );
    expect(row('Start').textContent).not.toContain(fromPlant());
    await user.dblClick(row('Start').querySelectorAll('td')[1]!);
    await user.type(dom.screen.getByRole('textbox', { name: dom.t('workbench.watch.newValue', { path: 'Start' }) }), '{Enter}');
    expect(writes).toHaveLength(1);
    expect(writes[0]![0]).toBe(0);
  });
});
