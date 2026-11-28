import { afterEach, describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { FaceplatePanel } = await import('./FaceplatePanel');
const { registerPlantTransport } = await import('../store/useTransport');

const DEBUG_MAP = {
  version: '1.0.0',
  programName: 'Motor',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-16T00:00:00Z',
  pou: {
    Motor: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: { Start: { addr: 0x0, type: 'BOOL', region: 'IPI', size: 1, bitOffset: 0, tags: {} } },
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
} as unknown as DebugMap;

const controller = (vmState: string) =>
  ({
    adapter: { connected: true, type: 'native', peek: async () => new Uint8Array(1), setValue: async () => undefined },
    vmState,
    debugCapabilities: { features: { 'simulation-inputs': { status: 'supported' } } },
    toggleForceValue: async () => undefined,
  }) as never;
const plant = (state: string, slowdown = 1) => ({ kind: 'plant', state, slowdown, onChange: () => () => undefined }) as never;
const paused = () => dom.t('faceplate.paused');
const inputSwitch = () =>
  document.querySelector('[data-faceplate] [data-input="Motor.Start"] button[role="switch"]') as HTMLButtonElement;

let unregister = () => {};
afterEach(() => unregister());

function open(vmState: string) {
  dom.patchStore(useIDEStore, {
    debug: { ...useIDEStore.getState().debug, mode: 'simulate', debugMap: DEBUG_MAP, forcedValues: new Map(), forcesUnconfirmed: false },
  } as never);
  return dom.render(<FaceplatePanel controller={controller(vmState)} />);
}

describe('The faceplate agrees with the status rail about running (spec 014, found by V-P7)', () => {
  it('a plant running slower than real time while the program reads paused: the faceplate is not paused and its inputs work', async () => {
    unregister = registerPlantTransport(plant('running', 0.5));
    open('paused');
    expect(dom.screen.queryByText(paused())).toBeNull();
    await dom.waitFor(() => expect(inputSwitch().disabled).toBe(false));
  });

  it('a simulation that is really paused still says paused and disables its inputs', () => {
    open('paused');
    expect(dom.screen.getByText(paused())).toBeTruthy();
    expect(inputSwitch().disabled).toBe(true);
  });

  it('a plant that is paused says paused even when the program reads running', () => {
    unregister = registerPlantTransport(plant('paused'));
    open('running');
    expect(dom.screen.getByText(paused())).toBeTruthy();
  });
});
