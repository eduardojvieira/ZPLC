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
