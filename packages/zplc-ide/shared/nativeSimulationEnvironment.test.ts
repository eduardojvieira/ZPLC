import { describe, expect, it } from 'bun:test';

import { nativeRuntimeSwitchedOff, nativeSimulationEnvironment, withNativeCommunicationEnvironment } from './nativeSimulationEnvironment';

const LOOPBACK = { ZPLC_NATIVE_COMM: '1', ZPLC_NATIVE_LOOPBACK: '1' };

describe('native simulation child environment', () => {
  it('removes the scenario-only clock flag for development and packaged supervisors', () => {
    const inherited = {
      PATH: '/safe/bin',
      ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1',
      ZPLC_NATIVE_SIM_BIN: '/untrusted/runtime',
    };

    expect(nativeSimulationEnvironment(inherited, true, '/resources', 'linux')).toEqual({
      PATH: '/safe/bin',
      ZPLC_NATIVE_SIM_BIN: '/untrusted/runtime',
      ...LOOPBACK,
    });
    expect(nativeSimulationEnvironment(inherited, false, '/resources', 'win32')).toEqual({
      PATH: '/safe/bin',
      ZPLC_NATIVE_SIM_BIN: '/resources/native-runtime/zplc_runtime.exe',
      ...LOOPBACK,
    });
  });

  it('asks the runtime for its own loopback Modbus and MQTT endpoints, and for no other peer (COM-009)', () => {
    const environment = nativeSimulationEnvironment({ PATH: '/safe/bin' }, false, '/resources', 'linux');
    expect(environment.ZPLC_NATIVE_COMM).toBe('1');
    expect(environment.ZPLC_NATIVE_LOOPBACK).toBe('1');
    // a broker the user named in the environment of the application is not a simulation peer: it is dropped
    const named = nativeSimulationEnvironment({ ZPLC_NATIVE_MQTT_BROKER: 'broker.plant.example:1883' }, false, '/resources', 'linux');
    expect(named.ZPLC_NATIVE_MQTT_BROKER).toBeUndefined();
  });
});

describe('the communication environment shared with the command line', () => {
  it('adds the loopback switches, drops a named broker and leaves the rest of the environment alone', () => {
    const input = { PATH: '/bin', ZPLC_NATIVE_MQTT_BROKER: 'broker.plant.example:1883' };
    expect(withNativeCommunicationEnvironment(input)).toEqual({ PATH: '/bin', ...LOOPBACK });
    expect(input.ZPLC_NATIVE_MQTT_BROKER).toBe('broker.plant.example:1883');
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
