import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect } from 'bun:test';

import { HardwareRuntimePort, withHardwarePort } from '../../../zplc-hil/src/hardwarePort';
import type { ScenarioRuntimePort as HardwarePort } from '../../../zplc-hil/src/hardwarePort';
import { HostRuntimeLink } from '../../../zplc-hil/src/hostLink';
import { compilerCompile } from '../cli/toolApi';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { compileScenario, runScenario } from './index';
import type { ScenarioRuntimePort } from './index';

// HIL-002: the scenario engine's runtime port has an implementation backed by a connected board, so a scenario file used
// on the host runs on hardware. The board here is the native runtime of this tree behind the same device link a serial
// board has (packages/zplc-hil/src/link.ts); what is shown is that the engine drives the hardware port, with time
// taken from the device's clock, the way it drives the host's, and that it releases what it forced.

// Compile-time: the hardware port is assignable to the engine's own port, and the engine's to the hardware package's copy.
const _assignable: ScenarioRuntimePort = null as unknown as HardwareRuntimePort;
const _declaredAgain: HardwarePort = null as unknown as ScenarioRuntimePort;
void [_assignable, _declaredAgain];

const motorStartStop = fileURLToPath(new URL('../../projects/motor_start_stop', import.meta.url));
const scenarioFile = fileURLToPath(new URL('../../projects/motor_start_stop/tests/motor-start-stop.scenario.json', import.meta.url));

describe('the scenario engine on a hardware runtime port (HIL-002)', () => {
  itNative(
    'a scenario file used on the host runs on the device link and passes, with its inputs forced and released',
    async () => {
      const compiled = await compilerCompile(motorStartStop);
      if (!compiled.ok || !compiled.zplcFile) throw new Error('the project does not compile');
      const scenario = compileScenario(await Bun.file(scenarioFile).json(), compiled.debugMap!);
      const persist = await mkdtemp(join(tmpdir(), 'zplc-hil-port-'));
      const link = await HostRuntimeLink.open(nativeRuntimeBinary);
      try {
        const done = await withHardwarePort(link, { toleranceMs: 10_000, timeoutMs: 30_000 }, (port) =>
          runScenario(scenario, compiled.zplcFile!, port),
        );
        expect(done.value.passed).toBe(true);
        expect(done.value.assertions.length).toBeGreaterThan(0);
        expect(done.port.observations).toHaveLength(done.value.trace.length);
        expect(done.release).toEqual({ ok: true, forcesCleared: true, stopped: true, errors: [] });
        expect(await link.forces()).toEqual([]);
        expect((await link.status()).state).not.toBe('running');
        // time comes from the device: every tick was sampled at or after its moment on the device's clock
        for (const observation of done.port.observations) expect(observation.deviceMs).toBeGreaterThanOrEqual(observation.atMs);
      } finally {
        await link.close();
        await rm(persist, { recursive: true, force: true });
      }
    },
    120_000,
  );

  itNative(
    'the same scenario on the same runtime port gives the trace the host gave',
    async () => {
      const compiled = await compilerCompile(motorStartStop);
      if (!compiled.ok || !compiled.zplcFile) throw new Error('the project does not compile');
      const scenario = compileScenario(await Bun.file(scenarioFile).json(), compiled.debugMap!);
      const { createNativeScenarioSession } = await import('../cli/nativeScenarioRuntime');
      const session = await createNativeScenarioSession({ ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary });
      const link = await HostRuntimeLink.open(nativeRuntimeBinary);
      try {
        const onHost = await runScenario(scenario, compiled.zplcFile, session.runtime);
        const onDevice = await runScenario(
          scenario,
          compiled.zplcFile,
          new HardwareRuntimePort(link, { toleranceMs: 10_000, timeoutMs: 30_000 }),
        );
        expect(onDevice.passed).toBe(onHost.passed);
        expect(onDevice.trace.map((sample) => sample.outputs)).toEqual(onHost.trace.map((sample) => sample.outputs));
      } finally {
        const port = new HardwareRuntimePort(link);
        await port.release();
        await link.close();
        await session.close();
      }
    },
    120_000,
  );
});
