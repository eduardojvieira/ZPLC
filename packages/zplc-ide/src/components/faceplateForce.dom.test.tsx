import { useEffect } from 'react';
import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import type { IDebugAdapter } from '../runtime/debugAdapter';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { useDebugControllerForces } = await import('../hooks/useDebugControllerForces');
const { FaceplatePanel } = await import('./FaceplatePanel');

const bit = (addr: number, bitOffset: number) => ({ addr, type: 'BOOL', region: 'IPI', size: 1, bitOffset, tags: {} });
const program = (vars: Record<string, unknown>) => ({ type: 'PROGRAM', entryPoint: 0, vars, sourceMap: [], breakpoints: [] });
const DEBUG_MAP = {
  version: '1.0.0',
  programName: 'Motor',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-16T00:00:00Z',
  pou: { Motor: program({ Start: bit(0, 0), Stop: bit(0, 1) }), Pump: program({ Start: bit(1, 0) }) },
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
} as unknown as DebugMap;

// the runtime double records what it was told, by address and value, as the native and the serial adapters hold forces
const held = new Map<number, string>();
const adapter = {
  type: 'native',
  connected: true,
  peek: async (_address: number, length: number) => new Uint8Array(length),
  setValue: async () => undefined,
  forceValue: async (address: number, bytes: Uint8Array) => void held.set(address, Buffer.from(bytes).toString('hex')),
  clearForcedValue: async (address: number) => void held.delete(address),
} as unknown as IDebugAdapter;
const adapterRef = { current: adapter };

type Api = ReturnType<typeof useDebugControllerForces>;
const mine: { api?: Api } = {};
function Harness() {
  const forces = useDebugControllerForces({ adapter, adapterRef, forcesUnconfirmed: false, watchVariables: [], debugMap: DEBUG_MAP });
  useEffect(() => {
    mine.api = forces;
  }, [forces]);
  const controller = {
    adapter,
    vmState: 'running',
    debugCapabilities: { features: { 'simulation-inputs': { status: 'supported' } } },
    toggleForceValue: forces.toggleForceValue,
  };
  return <FaceplatePanel controller={controller as never} />;
}

const box = (path: string) => document.querySelector(`[data-faceplate] [data-input="${path}"] input[type="checkbox"]`) as HTMLInputElement;
const keys = () => Array.from(useIDEStore.getState().debug.forcedValues.keys());

async function open() {
  held.clear();
  dom.patchStore(useIDEStore, {
    debug: { ...useIDEStore.getState().debug, mode: 'simulate', debugMap: DEBUG_MAP, forcedValues: new Map(), forcesUnconfirmed: false },
  } as never);
  const view = dom.render(<Harness />);
  await dom.waitFor(() => expect(box('Motor.Start').disabled).toBe(false));
  return view.user;
}

describe('The faceplate reads a force by its path, then by its address, as the Watch table does (spec 014)', () => {
  it('P2 a force set from the Watch by the bare name shows as forced in the faceplate, and one click releases it', async () => {
    const user = await open();
    await dom.act(() => mine.api!.toggleForceValue('Start', 0, 1, 'BYTE', true));
    await dom.waitFor(() => expect(box('Motor.Start').checked).toBe(true));
    await user.click(box('Motor.Start'));
    await dom.waitFor(() => expect(keys()).toEqual([]));
    expect(Array.from(held)).toEqual([]);
  });

  it('P6 bits that share a byte are forced and released together, as the runtime does', async () => {
    const user = await open();
    await user.click(box('Motor.Start'));
    await dom.waitFor(() => expect(box('Motor.Start').checked).toBe(true));
    await user.click(box('Motor.Stop'));
    await dom.waitFor(() => expect(box('Motor.Stop').checked).toBe(true));
    expect(keys()).toEqual(['Motor.Start']);
    await user.click(box('Motor.Stop'));
    await dom.waitFor(() => expect(keys()).toEqual([]));
    expect(Array.from(held)).toEqual([]);
  });

  it('P4 two programs: releasing the bare Start leaves the Start of the other program forced', async () => {
    const user = await open();
    await user.click(box('Motor.Start'));
    await dom.waitFor(() => expect(box('Motor.Start').checked).toBe(true));
    await user.click(box('Pump.Start'));
    await dom.waitFor(() => expect(box('Pump.Start').checked).toBe(true));
    await dom.act(() => mine.api!.toggleForceValue('Start', 0, null, 'BYTE', false));
    await dom.waitFor(() => expect(box('Motor.Start').checked).toBe(false));
    expect(box('Pump.Start').checked).toBe(true);
    expect(keys()).toEqual(['Pump.Start']);
    expect(Array.from(held.keys())).toEqual([1]);
  });
});
