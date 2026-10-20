// The device trace end to end against the native runtime of this tree (LRN-024): the solution of verify-my-board runs on the
// host runtime with the virtual scenario clock, the runtime keeps its per-scan I/O trace (`trace.*`, the same fields a board
// answers to `zplc dbg trace`), the recorder reads it from the first scan of the run, and the hardware check grades it at the
// device-trace tolerance. The test plays the learner: it starts the virtual clock and holds the button. Host evidence only:
// no board ran this.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect } from 'bun:test';

import { NativeSimulationSupervisor } from '../../electron/nativeSimulationSupervisor';
import { compilerCompile } from '../cli/toolApi';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { nativeDeviceTrace } from '../runtime/deviceTrace';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { createNativeRequest } from '../runtime/nativeProtocol';
import { lessonWatchVariables } from './boardCheck';
import { recordDeviceTrace } from './deviceTraceRecorder';
import { evaluateHardwareTrace } from './hardwareCheck';
import type { ScenarioFile } from './lessonPackage';

const project = fileURLToPath(new URL('../../projects/verify_my_board', import.meta.url));
const scenarioFile = fileURLToPath(new URL('../../lessons/verify-my-board/scenario.json', import.meta.url));

describe('the device trace of the native runtime (LRN-024)', () => {
  itNative('LRN-024 records verify-my-board from the first scan of the run and passes it at the device-trace tolerance', async () => {
    const compiled = await compilerCompile(project);
    if (!compiled.ok || !compiled.zplcFile || !compiled.debugMap) throw new Error('the project does not compile');
    const scenario = await Bun.file(scenarioFile).json() as ScenarioFile;
    const { variables, missing } = lessonWatchVariables(scenario, compiled.debugMap);
    expect(missing).toEqual([]);
    const persist = await mkdtemp(join(tmpdir(), 'zplc-device-trace-'));
    const supervisor = new NativeSimulationSupervisor({
      clientName: 'zplc-test', clientVersion: '0.0.0',
      environment: { ...process.env, ZPLC_NATIVE_SIM_BIN: nativeRuntimeBinary, ZPLC_PERSIST_ROOT: persist, ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK: '1' },
    });
    const adapter = new NativeAdapter(supervisor);
    let requests = 0;
    const trace = nativeDeviceTrace((method, params) => supervisor.request(createNativeRequest(`trace-${++requests}`, method, params)));
    try {
      await adapter.connect();
      await adapter.loadProgram(compiled.zplcFile);
      const button = variables.find((variable) => variable.name === 'VerifyBoard.Button')!;
      // The learner: the program starts with the first step of the clock, and the button is pressed once the LED has blinked, at a time of the learner's own (not the scenario's), and held for 1.8 s.
      let virtualMs = -10;
      const learner = async (ms: number) => {
        for (let step = 0; step < ms; step += 10) {
          virtualMs += 10;
          await adapter.poke(button.address, virtualMs >= 1780 && virtualMs < 3580 ? 1 << (button.bitOffset ?? 0) : 0);
          await adapter.scenarioStep(virtualMs);
        }
      };
      const recording = await recordDeviceTrace({ connected: true, state: 'running' }, trace, variables, {
        awaitRun: true, durationMs: 5200, intervalMs: 100, now: () => Math.max(virtualMs, 0), wait: learner,
      });
      expect(recording).toMatchObject({ ok: true, anchored: true });
      const samples = recording!.trace;
      expect(samples[0]!.atMs).toBe(0);
      expect(samples.slice(1, 4).map((sample) => sample.atMs)).toEqual([10, 20, 30]);
      const result = evaluateHardwareTrace(scenario, samples, { timeMs: 20, analogPercent: 5 }, 'a'.repeat(64), true);
      expect(result.failures).toEqual([]);
      expect(result.passed).toBe(true);
      expect((await trace.status()).armed).toBe(false); // the recorder clears the trace when it ends
    } finally {
      await adapter.disconnect().catch(() => undefined);
      await supervisor.stopSession().catch(() => undefined);
      await rm(persist, { recursive: true, force: true });
    }
  }, 120_000);
});
