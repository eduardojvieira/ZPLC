import { describe, expect, it } from 'bun:test';

import type { IDebugAdapter } from '../runtime/debugAdapter';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { useDebugControllerForces } = await import('../hooks/useDebugControllerForces');

// the runtime holds one force per address, as the native and the serial adapters do
const held = new Set<number>();
const adapter = {
  type: 'native',
  connected: true,
  forceValue: async (address: number) => void held.add(address),
  clearForcedValue: async (address: number) => void held.delete(address),
} as unknown as IDebugAdapter;

let api: ReturnType<typeof useDebugControllerForces>;
function Harness() {
  api = useDebugControllerForces({ adapter, adapterRef: { current: adapter }, forcesUnconfirmed: false, watchVariables: [], debugMap: null });
  return null;
}
const forces = () => Array.from(useIDEStore.getState().debug.forcedValues.keys());
const force = (path: string, value: boolean) => dom.act(() => api.toggleForceValue(path, 0x10, value, 'BOOL', true));
const release = (path: string) => dom.act(() => api.toggleForceValue(path, 0x10, null, 'BOOL', false));

function start() {
  held.clear();
  dom.patchStore(useIDEStore, { debug: { ...useIDEStore.getState().debug, forcedValues: new Map(), forcesUnconfirmed: false } } as never);
  dom.render(<Harness />);
}

describe('A released variable keeps no force, under any spelling of its path (spec 014, found by V-P7)', () => {
  it('forced from the faceplate, edited in the Watch row by its bare name, released from the faceplate: nothing is left', async () => {
    start();
    await force('Motor.Start', true);
    await force('Start', false);
    await release('Motor.Start');
    expect(forces()).toEqual([]);
    expect(Array.from(held)).toEqual([]);
  });

  it('the Watch edit updates the one force the variable holds and the faceplate still reads it as forced', async () => {
    start();
    await force('Motor.Start', true);
    await force('Start', false);
    expect(forces()).toEqual(['Motor.Start']);
    expect(useIDEStore.getState().debug.forcedValues.get('Motor.Start')?.bytesHex).toBe('00');
  });

  it('releasing by the bare name of a force set from the faceplate leaves nothing', async () => {
    start();
    await force('Motor.Start', true);
    await release('Start');
    expect(forces()).toEqual([]);
  });

  it('pinned: forcing and releasing one row from the Watch, and one from the faceplate, still work', async () => {
    start();
    await force('Start', true);
    expect(forces()).toEqual(['Start']);
    await release('Start');
    expect(forces()).toEqual([]);
    await force('Motor.Start', true);
    expect(forces()).toEqual(['Motor.Start']);
    await release('Motor.Start');
    expect(forces()).toEqual([]);
    expect(Array.from(held)).toEqual([]);
  });
});
