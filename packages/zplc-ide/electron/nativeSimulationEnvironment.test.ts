import { describe, expect, it } from 'bun:test';

import { nativeSimulationEnvironment } from './nativeSimulationEnvironment';

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
