import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SCENE_INDEX } from '../../generated/sceneIndex';
import type { PlantSceneFile } from '../contracts';
import { checkSceneFacts, expectedHash, runSceneCheck } from './sceneCheck';

const nativeRuntimeBinary =
  process.env.ZPLC_NATIVE_SIM_BIN ?? resolve(import.meta.dir, '../../../../../firmware/lib/zplc_core/build/zplc_runtime');
const hasRuntime = existsSync(nativeRuntimeBinary);
const nativeIt = hasRuntime ? it : it.skip;
if (!hasRuntime)
  console.log(`sceneCheck: native runtime ${nativeRuntimeBinary} is absent; the runtime tests are skipped (bun run build:runtime)`);

const TOP = 0.45;
const fixtureScene: PlantSceneFile = {
  schemaVersion: 1,
  name: 'fixture',
  cameras: [],
  parts: [
    { id: 'belt', part: 'belt', name: 'Belt1', position: [0, TOP, 0], rotationYDeg: 0, config: { length: 4 } },
    { id: 'crate', part: 'box', name: 'crate', position: [-1.2, TOP, 0], rotationYDeg: 0, config: {} },
    { id: 'eye', part: 'sensor-diffuse', name: 'EyeA', position: [0, TOP, -0.5], rotationYDeg: 270, config: { rangeM: 1 } },
  ],
};
const fixtureMap = {
  schemaVersion: 2,
  target: { scene: 'fixture' },
  signals: {
    'Belt1.run': { direction: 'command', type: 'BOOL', point: 'Cell.Belt' },
    'EyeA.detect': { direction: 'sensor', type: 'BOOL', point: 'Cell.Eye' },
  },
};
const header = 'PROGRAM Cell\nVAR_INPUT Eye AT %I0.0 : BOOL; END_VAR\nVAR_OUTPUT Belt AT %Q0.0 : BOOL; END_VAR\n';
const reference = `${header}Belt := NOT Eye;\nEND_PROGRAM\n`;
const starter = `${header}Belt := FALSE;\nEND_PROGRAM\n`;
const fixtureScenario = {
  schemaVersion: 1,
  id: 'fixture-belt-stops-at-eye',
  tickMs: 10,
  durationMs: 3000,
  scene: { file: 'scene.json', map: 'plant-map.json', script: [] },
  events: [],
  expectations: [
    { kind: 'EVENTUALLY', fromMs: 0, withinMs: 3000, condition: { 'fact:count:EyeA': true } },
    { kind: 'AT', atMs: 3000, condition: { 'Cell.Belt': false } },
  ],
};

/** Pinned on Linux; macOS and Windows are pending, as for the P4 hash (compare against this value, a mismatch there is a finding). */
const FIXTURE_HASH_LINUX = '1f4a74fb539f2a7b37b6759ffa887fa5408bc073f50eb75044f88e9d7cffd2cd';
let root: string;
const writeScene = (name: string, over: { scenario?: unknown; reference?: string; starter?: string } = {}) => {
  const dir = join(root, name);
  mkdirSync(dir);
  writeFileSync(join(dir, 'scene.json'), JSON.stringify(fixtureScene));
  writeFileSync(join(dir, 'plant-map.json'), JSON.stringify(fixtureMap));
  writeFileSync(join(dir, 'reference.st'), over.reference ?? reference);
  writeFileSync(join(dir, 'starter.st'), over.starter ?? starter);
  writeFileSync(join(dir, 'scenario.json'), JSON.stringify(over.scenario ?? fixtureScenario));
  return dir;
};
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'zplc-scene-check-'));
  process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const withFacts = (...facts: string[]) => ({
  expectations: [{ kind: 'AT', atMs: 0, condition: Object.fromEntries(facts.map((f) => [`fact:${f}`, false])) }],
});

describe('the fact names a scenario reads', () => {
  it('SCN-004 accepts every name of the fact grammar for parts the scene has', () => {
    const good = withFacts(
      'itemsEmitted',
      'itemsRemoved',
      'itemsDropped',
      'itemsCollided',
      'count:EyeA',
      'delivered:Belt1',
      'emitted:Belt1',
      'position:box:0',
    );
    expect(checkSceneFacts(good, fixtureScene)).toEqual([]);
  });

  it('SCN-004 refuses a misspelled fact with a located message', () => {
    expect(checkSceneFacts(withFacts('itemsRemovd'), fixtureScene)).toEqual([
      'scenario.json expectations[0].condition: "fact:itemsRemovd" is not a plant fact; the facts are itemsEmitted, itemsRemoved, ' +
        'itemsDropped, ' +
        'itemsCollided, emitted:<Name>, delivered:<Name>, count:<Name>, position:<kind>:<index>',
    ]);
    expect(checkSceneFacts(withFacts('position:crate:x'), fixtureScene)).toHaveLength(1);
    expect(checkSceneFacts(withFacts('itemsRemoved:extra'), fixtureScene)).toHaveLength(1);
  });

  it('SCN-004 refuses a fact that names a part the scene does not have', () => {
    expect(checkSceneFacts(withFacts('count:EyeB'), fixtureScene)).toEqual([
      'scenario.json expectations[0].condition: "fact:count:EyeB" names "EyeB", which is not a part of the scene; it has: Belt1, crate, ' +
        'EyeA',
    ]);
  });
});

describe('the pinned hash', () => {
  it('PLT-006 a null platform compares against linux, and a scene without a pin has none', () => {
    const hashes = { linux: { a: 'x' }, darwin: null, win32: { a: 'y' } };
    expect(expectedHash(hashes, 'darwin', 'a')).toBe('x');
    expect(expectedHash(hashes, 'win32', 'a')).toBe('y');
    expect(expectedHash(hashes, 'linux', 'b')).toBeUndefined();
  });
});

describe('runSceneCheck', () => {
  nativeIt(
    'SCN-004 the reference program passes and the starter fails on the fixture scene',
    async () => {
      const result = await runSceneCheck(writeScene('ok'), 'native');
      expect(result.problems).toEqual([]);
      expect(result).toMatchObject({ sceneId: 'ok', solution: 'pass', starter: 'fail' });
      expect(result.traceHash).toMatch(/^[0-9a-f]{64}$/);
    },
    120_000,
  );

  nativeIt(
    'PLT-006 the trace hash of the fixture is the same on every run',
    async () => {
      const dir = writeScene('twice');
      const first = await runSceneCheck(dir, 'native');
      const second = await runSceneCheck(dir, 'native');
      expect(first.traceHash).toBe(second.traceHash);
      if (process.platform === 'linux') expect(first.traceHash).toBe(FIXTURE_HASH_LINUX);
    },
    120_000,
  );

  nativeIt(
    'SCN-004 a scenario that reads a misspelled fact is a problem of the scene',
    async () => {
      const scenario = { ...fixtureScenario, expectations: [{ kind: 'AT', atMs: 3000, condition: { 'fact:itemsRemovd': false } }] };
      const result = await runSceneCheck(writeScene('typo', { scenario }), 'native');
      expect(result.solution).toBe('fail');
      expect(result.problems.join('\n')).toContain('"fact:itemsRemovd" is not a plant fact');
    },
    120_000,
  );

  it('SCN-004 a scene that does not compile names the file', async () => {
    const result = await runSceneCheck(writeScene('broken', { reference: 'PROGRAM Cell\nBelt := ;\nEND_PROGRAM\n' }), 'native');
    expect(result.solution).toBe('fail');
    expect(result.problems.join('\n')).toContain('reference.st');
  });
});

describe('the shipped scenes', () => {
  const hashes = JSON.parse(
    existsSync(join(import.meta.dir, 'sceneHashes.json')) ? readFileSync(join(import.meta.dir, 'sceneHashes.json'), 'utf8') : '{}',
  );
  const platform = process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux';
  for (const entry of SCENE_INDEX) {
    nativeIt(
      `SCN-004 ${entry.id}: the reference passes, the starter fails, and the trace hash is the pinned one (PLT-006)`,
      async () => {
        const result = await runSceneCheck(resolve(import.meta.dir, '../../..', entry.dir), 'native');
        expect(result.problems).toEqual([]);
        expect(result.solution).toBe('pass');
        expect(result.starter).toBe('fail');
        expect(result.traceHash).toBe(expectedHash(hashes, platform, entry.id) ?? 'no pinned hash in sceneHashes.json');
      },
      240_000,
    );
  }
  it('SCN-004 the scene index lists only scenes that have the five files', () => {
    for (const entry of SCENE_INDEX)
      for (const file of ['scene.json', 'plant-map.json', 'reference.st', 'starter.st', 'scenario.json'])
        expect(existsSync(resolve(import.meta.dir, '../../..', entry.dir, file))).toBe(true);
  });
});
