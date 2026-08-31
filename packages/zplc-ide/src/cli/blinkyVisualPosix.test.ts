import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scenarioRun } from './toolApi';

const blinky = fileURLToPath(new URL('../../projects/blinky', import.meta.url));
const nativeRuntimeBinary = fileURLToPath(new URL('../../../../firmware/lib/zplc_core/build/zplc_runtime', import.meta.url));
const nativeScenarioBinary = process.env.ZPLC_NATIVE_SIM_BIN ?? nativeRuntimeBinary;
const visualPrograms = [
  ['LD', 'main.ld'] as const,
  ['FBD', 'main.fbd'] as const,
  ['SFC', 'main.sfc'] as const,
];
const canonicalFiles = [
  'zplc.json',
  'src/main.ld.json',
  'src/main.fbd.json',
  'src/main.il',
  'src/main.sfc.json',
  'src/main.st',
  'tests/blinky-visual.scenario.json',
];

async function visualWorkspace(program: string): Promise<{ root: string; canonical: Uint8Array[] }> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-blinky-visual-'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'tests'));
  const canonical = await Promise.all(canonicalFiles.map((path) => readFile(join(blinky, path))));
  await Promise.all(canonicalFiles.map((path, index) => writeFile(join(root, path), canonical[index]!)));
  const manifest = JSON.parse(new TextDecoder().decode(canonical[0]!)) as { tasks: Array<{ programs: string[] }> };
  manifest.tasks[0]!.programs = [program];
  await writeFile(join(root, 'zplc.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, canonical };
}

function expectValidArtifacts(result: Awaited<ReturnType<typeof scenarioRun>>): void {
  expect(result).toMatchObject({
    ok: true,
    summary: { backend: 'native-posix', mode: 'logical-cyclic-task-set-scan', scenarios: [{ id: 'BlinkyVisual', path: 'tests/blinky-visual.scenario.json', passed: true }] },
    evidence: { operation: 'scenario-run', outcome: 'passed' },
  });
  expect(result.evidence.artifacts.map((artifact) => artifact.kind)).toEqual(['zplc', 'trace']);
  for (const artifact of result.evidence.artifacts) {
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.byteLength).toBeGreaterThan(0);
  }
  expect(result.savedTestInputIdentity).toMatchObject({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/), fileCount: expect.any(Number) });
  expect(result.traceFile).toBeInstanceOf(Uint8Array);
  const trace = JSON.parse(new TextDecoder().decode(result.traceFile!)) as { scenarios: Array<{ trace: Array<{ outputs: Record<string, boolean> }> }> };
  expect(trace.scenarios[0]!.trace.map((sample) => sample.outputs['Blinky.LED_Output'])).toEqual(expect.arrayContaining([true, false]));
}

describe('Blinky visual languages on native POSIX', () => {
  it.skipIf(!existsSync(nativeScenarioBinary))('executes the canonical checked-in Ladder project deterministically without mutating it', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    const canonical = await Promise.all(canonicalFiles.map((path) => readFile(join(blinky, path))));
    try {
      const first = await scenarioRun(blinky, 'BlinkyVisual');
      const second = await scenarioRun(blinky, 'BlinkyVisual');
      expectValidArtifacts(first);
      expectValidArtifacts(second);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      expect(second.evidence.artifacts).toEqual(first.evidence.artifacts);
      expect(Buffer.from(second.traceFile!)).toEqual(Buffer.from(first.traceFile!));
      await expect(Promise.all(canonicalFiles.map((path) => readFile(join(blinky, path))))).resolves.toEqual(canonical);
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 30_000);

  it.skipIf(!existsSync(nativeScenarioBinary))('compiles and executes LD, FBD, and SFC deterministically without mutating the checked-in example', async () => {
    const oldBinary = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeScenarioBinary;
    try {
      for (const [, program] of visualPrograms) {
        const { root, canonical } = await visualWorkspace(program);
        try {
          const first = await scenarioRun(root, 'BlinkyVisual');
          const second = await scenarioRun(root, 'BlinkyVisual');
          expectValidArtifacts(first);
          expectValidArtifacts(second);
          expect(JSON.stringify(second)).toBe(JSON.stringify(first));
          expect(second.evidence.artifacts).toEqual(first.evidence.artifacts);
          expect(Buffer.from(second.traceFile!)).toEqual(Buffer.from(first.traceFile!));
          await expect(Promise.all(canonicalFiles.map((path) => readFile(join(blinky, path))))).resolves.toEqual(canonical);
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      }
    } finally {
      if (oldBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = oldBinary;
    }
  }, 60_000);
});
