import path from 'node:path';

export function nativeSimulationEnvironment(
  environment: NodeJS.ProcessEnv,
  isDev: boolean,
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const childEnvironment = { ...environment };
  delete childEnvironment.ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK;
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
  return isDev && environment.ZPLC_RUNTIME === 'wasm'
    ? 'Native simulation is switched off by ZPLC_RUNTIME=wasm.'
    : null;
}
