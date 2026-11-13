/**
 * LNK-009 / IDE-031: `testsRun` runs a scenario with a `scene` block headless on the project's scene and map, with the
 * code the Learn Check uses, and reports it like any scenario. Scenarios without the block keep their result.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect } from 'bun:test';

import { itNative, nativeRuntimeBinary } from './nativeRuntimeGuard';
import { testsRun } from './toolApi';

const PROJECTS = new URL('../../projects/', import.meta.url).pathname;
let scratch = '';
let previousBinary: string | undefined;
beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'zplc-scene-tests-api-'));
  previousBinary = process.env.ZPLC_NATIVE_SIM_BIN;
  process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
});
afterAll(() => {
  if (previousBinary === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
  else process.env.ZPLC_NATIVE_SIM_BIN = previousBinary;
  rmSync(scratch, { recursive: true, force: true });
});

function copyOf(project: string, label: string): string {
  const root = join(scratch, label);
  cpSync(join(PROJECTS, project), root, { recursive: true });
  return root;
}

describe('testsRun on a project whose scenario drives a plant scene', () => {
  itNative(
    'passes the solution of a scene lesson',
    async () => {
      const result = await testsRun(join(PROJECTS, 'plant_belt_to_sensor'));
      expect(result.evidence.diagnostics).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.evidence.outcome).toBe('passed');
    },
    30_000,
  );

  itNative(
    'fails the starter with failed assertions, not an invalid scenario',
    async () => {
      const root = copyOf('plant_belt_to_sensor', 'starter');
      const program = join(root, 'src', 'BeltToSensor.st');
      writeFileSync(program, readFileSync(program, 'utf8').replace('Run := Running;', 'Run := FALSE;'));
      const result = await testsRun(root);
      expect(result.ok).toBe(false);
      expect(result.evidence.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['SCENARIO_ASSERTION_FAILED']);
    },
    30_000,
  );

  itNative('names the missing scene file with the located SCENE diagnostic', async () => {
    const root = copyOf('plant_belt_to_sensor', 'no-scene');
    rmSync(join(root, 'scene.json'));
    const result = await testsRun(root);
    expect(result.ok).toBe(false);
    const [diagnostic] = result.evidence.diagnostics;
    expect(result.evidence.diagnostics.length).toBe(1);
    expect(diagnostic!.code).not.toBe('TEST_SCENARIO_INVALID');
    expect(diagnostic!.path).toBe('scene.json');
  });

  itNative('keeps the result of a scenario without a scene block byte-identical to before', async () => {
    // The hashes were taken from the Tool API before scene scenarios were supported.
    const result = await testsRun(join(PROJECTS, 'blinky'));
    expect(result.ok).toBe(true);
    expect(result.evidence.artifacts.map(({ kind, sha256 }) => `${kind}:${sha256}`)).toEqual([
      'zplc:d4546ecb775b638f59bd620222e094b15f21fffcf742ca1b9a2c09206183f292',
      'trace:47b7271f9411b9394c914bb0537d84c230edbfae437abeae885fe307f882cf9b',
    ]);
  });
});
