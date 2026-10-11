import { describe, expect, it } from 'bun:test';

import { nativeRuntimeSwitchedOff, nativeSimulationEnvironment } from './nativeSimulationEnvironment';

describe('native simulation child environment', () => {
  it('removes the scenario-only clock flag for development and packaged supervisors', () => {
    const inherited = {
      PATH: '/safe/bin',
      ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1',
      ZPLC_NATIVE_SIM_BIN: '/untrusted/runtime',
    };

    expect(nativeSimulationEnvironment(inherited, true, '/resources', 'linux')).toEqual({
      PATH: '/safe/bin', ZPLC_NATIVE_SIM_BIN: '/untrusted/runtime',
    });
    expect(nativeSimulationEnvironment(inherited, false, '/resources', 'win32')).toEqual({
      PATH: '/safe/bin', ZPLC_NATIVE_SIM_BIN: '/resources/native-runtime/zplc_runtime.exe',
    });
  });
});

describe('the switch that turns the native runtime off for tests', () => {
  it('is honoured by an unpackaged app and ignored by a packaged one', () => {
    expect(nativeRuntimeSwitchedOff({ ZPLC_RUNTIME: 'wasm' }, true)).toContain('ZPLC_RUNTIME=wasm');
    expect(nativeRuntimeSwitchedOff({ ZPLC_RUNTIME: 'wasm' }, false)).toBeNull();
  });

  it('switches nothing off for any other value or for none', () => {
    expect(nativeRuntimeSwitchedOff({}, true)).toBeNull();
    expect(nativeRuntimeSwitchedOff({ ZPLC_RUNTIME: 'native' }, true)).toBeNull();
    expect(nativeRuntimeSwitchedOff({ ZPLC_RUNTIME: '' }, true)).toBeNull();
  });
});
