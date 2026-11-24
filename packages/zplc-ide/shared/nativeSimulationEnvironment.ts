import path from 'node:path';

/**
 * COM-009: a simulation talks to the Modbus server and the MQTT broker that its own runtime starts on 127.0.0.1, and to
 * nothing else: a broker named in the environment of the application is not a peer of a simulation. Studio and the
 * command line (`zplc test`, the scenario runner) both build their native-runtime environment through this function.
 */
export function withNativeCommunicationEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnvironment = { ...environment };
  childEnvironment.ZPLC_NATIVE_COMM = '1';
  childEnvironment.ZPLC_NATIVE_LOOPBACK = '1';
  delete childEnvironment.ZPLC_NATIVE_MQTT_BROKER;
  return childEnvironment;
}

/**
 * The environment of the native runtime that Studio starts. Studio keeps its programs and RETAIN records in
 * `<userData>/native-simulation`, not in the `~/.zplc` that the command line and the development builds share. Only an
 * unpackaged app honours a ZPLC_PERSIST_ROOT of its environment (the journeys and the desktop smoke set one): the
 * packaging is the trust boundary, as it is for ZPLC_NATIVE_SIM_BIN.
 */
export function nativeSimulationEnvironment(
  environment: NodeJS.ProcessEnv,
  isDev: boolean,
  resourcesPath: string,
  userDataPath: string,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const childEnvironment = withNativeCommunicationEnvironment(environment);
  delete childEnvironment.ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK;
  if (!isDev || !childEnvironment.ZPLC_PERSIST_ROOT) {
    childEnvironment.ZPLC_PERSIST_ROOT = path.join(userDataPath, 'native-simulation');
  }
  if (!isDev) {
    childEnvironment.ZPLC_NATIVE_SIM_BIN = path.join(
      resourcesPath,
      'native-runtime',
      platform === 'win32' ? 'zplc_runtime.exe' : 'zplc_runtime',
    );
  }
  return childEnvironment;
}

/**
 * ZPLC_RUNTIME=wasm switches the native runtime off, so that a test (the journeys) can show the browser runtime and
 * its degraded label on a machine that has the native one. Only an unpackaged app honours it: the packaging is the
 * trust boundary, as it is for ZPLC_NATIVE_SIM_BIN above, so an installed app cannot be switched by its environment.
 * @returns why the simulation will not start, or null when nothing switched it off
 */
export function nativeRuntimeSwitchedOff(environment: NodeJS.ProcessEnv, isDev: boolean): string | null {
  return isDev && environment.ZPLC_RUNTIME === 'wasm' ? 'Native simulation is switched off by ZPLC_RUNTIME=wasm.' : null;
}
