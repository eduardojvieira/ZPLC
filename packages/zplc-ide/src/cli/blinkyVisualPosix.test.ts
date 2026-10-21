import { describe, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { itNative, nativeRuntimeBinary } from './nativeRuntimeGuard';
import { scenarioRun } from './toolApi';

// Each language of the Blinky tour is its own checked-in project (a build only compiles the files its tasks name).
const projectRoot = (name: string): string => fileURLToPath(new URL(`../../projects/${name}`, import.meta.url));
const visualProjects = [
  {
    name: 'blinky',
    label: 'the canonical checked-in Ladder project',
    scenarioId: 'BlinkyVisual',
    scenarioPath: 'tests/blinky-visual.scenario.json',
    files: ['zplc.json', 'src/main.ld.json', 'tests/blinky-visual.scenario.json'],
  },
  {
    name: 'blinky_fbd',
    label: 'the checked-in FBD project',
    scenarioId: 'BlinkyFBD',
    scenarioPath: 'tests/blinky-fbd.scenario.json',
    files: ['zplc.json', 'src/main.fbd.json', 'tests/blinky-fbd.scenario.json'],
  },
  {
    name: 'blinky_sfc',
    label: 'the checked-in SFC project',
    scenarioId: 'BlinkySFC',
    scenarioPath: 'tests/blinky-sfc.scenario.json',
    files: ['zplc.json', 'src/main.sfc.json', 'tests/blinky-sfc.scenario.json'],
  },
] as const;

const readFiles = (name: string, files: readonly string[]): Promise<Buffer[]> =>
  Promise.all(files.map((path) => readFile(join(projectRoot(name), path))));

function expectValidArtifacts(result: Awaited<ReturnType<typeof scenarioRun>>, scenarioId: string, scenarioPath: string): void {
  expect(result).toMatchObject({
    ok: true,
    summary: {
      backend: 'native-posix',
      mode: 'logical-cyclic-task-set-scan',
      scenarios: [{ id: scenarioId, path: scenarioPath, passed: true }],
    },
    evidence: { operation: 'scenario-run', outcome: 'passed' },
  });
  expect(result.evidence.artifacts.map((artifact) => artifact.kind)).toEqual(['zplc', 'trace']);
  for (const artifact of result.evidence.artifacts) {
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.byteLength).toBeGreaterThan(0);
  }
  expect(result.savedTestInputIdentity).toMatchObject({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/), fileCount: expect.any(Number) });
  expect(result.traceFile).toBeInstanceOf(Uint8Array);
  const trace = JSON.parse(new TextDecoder().decode(result.traceFile!)) as {
    scenarios: Array<{ trace: Array<{ outputs: Record<string, boolean> }> }>;
  };
  expect(trace.scenarios[0]!.trace.map((sample) => sample.outputs['Blinky.LED_Output'])).toEqual(expect.arrayContaining([true, false]));
}

describe('Blinky visual languages on native POSIX', () => {
  for (const { name, label, scenarioId, scenarioPath, files } of visualProjects) {
    itNative(
      `executes ${label} deterministically without mutating it`,
      async () => {
        const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
        process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
        const canonical = await readFiles(name, files);
        try {
          const first = await scenarioRun(projectRoot(name), scenarioId);
          const second = await scenarioRun(projectRoot(name), scenarioId);
          expectValidArtifacts(first, scenarioId, scenarioPath);
          expectValidArtifacts(second, scenarioId, scenarioPath);
          expect(JSON.stringify(second)).toBe(JSON.stringify(first));
          expect(second.evidence.artifacts).toEqual(first.evidence.artifacts);
          expect(Buffer.from(second.traceFile!)).toEqual(Buffer.from(first.traceFile!));
          await expect(readFiles(name, files)).resolves.toEqual(canonical);
        } finally {
          if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
          else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
        }
      },
      30_000,
    );
  }
});
