import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { itNative, nativeRuntimeBinary } from '../../cli/nativeRuntimeGuard';
import { SCENE_INDEX } from '../../generated/sceneIndex';
import type { PlantSceneFile } from '../contracts';
import { checkSceneFacts, expectedHash, runSceneCheck } from './sceneCheck';

const nativeIt = itNative;

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
        'itemsCollided, emitted:<Name>, delivered:<Name>, count:<Name>, position:<kind>:<index>, level:<Name>, volume:<Name>, ' +
        'spilledL:<Name>, highs:<Name>, inBand:<Name>, picked:<Name>, placed:<Name>, drops:<Name>, axis:<Name>:<x|y|z>, itemsAssembled, ' +
        'stacked:pallet:<index>, layers:pallet:<index>, sorted:<Name>, misrouted:<Name>, stored:<Name>, produced:<Name>, ' +
        'misfires:<Name>, blocked:<Name>, cell:<Name>:<column>:<level>, loaded:crate:<index>',
    ]);
    expect(checkSceneFacts(withFacts('position:crate:x'), fixtureScene)).toHaveLength(1);
    expect(checkSceneFacts(withFacts('itemsRemoved:extra'), fixtureScene)).toHaveLength(1);
  });

  it('SCN-005 the fact grammar accepts level, volume, spilledL, highs and inBand and names the part', () => {
    const tankScene: PlantSceneFile = {
      ...fixtureScene,
      parts: [{ id: 'tank1', part: 'tank', name: 'Tank1', position: [0, 0, 0], rotationYDeg: 0, config: {} }],
    };
    expect(checkSceneFacts(withFacts('level:Tank1', 'volume:Tank1', 'spilledL:Tank1', 'highs:Tank1', 'inBand:Tank1'), tankScene)).toEqual(
      [],
    );
    expect(checkSceneFacts(withFacts('level:Nope'), tankScene)).toEqual([
      'scenario.json expectations[0].condition: "fact:level:Nope" names "Nope", which is not a part of the scene; it has: Tank1',
    ]);
    expect(checkSceneFacts(withFacts('level'), tankScene)).toHaveLength(1); // a bare name is not a fact
    expect(checkSceneFacts(withFacts('level:Tank1:x'), tankScene)).toHaveLength(1);
    expect(checkSceneFacts(withFacts('levels:Tank1'), tankScene)).toHaveLength(1);
    expect(checkSceneFacts(withFacts('level:Tank1'), tankScene)[0]).toBeUndefined();
  });

  it('SCN-004 the fact grammar accepts the M3 facts and names the unknown ones', () => {
    const gantryScene: PlantSceneFile = {
      ...fixtureScene,
      parts: [{ id: 'gantry1', part: 'gantry', name: 'Gantry1', position: [0, 0, 0], rotationYDeg: 0, config: {} }],
    };
    const good = withFacts(
      'picked:Gantry1',
      'placed:Gantry1',
      'drops:Gantry1',
      'axis:Gantry1:x',
      'axis:Gantry1:y',
      'axis:Gantry1:z',
      'itemsAssembled',
      'stacked:pallet:0',
      'layers:pallet:1',
    );
    expect(checkSceneFacts(good, gantryScene)).toEqual([]);
    for (const bad of ['placed', 'axis:Gantry1', 'axis:Gantry1:w', 'stacked:box:0', 'layers:pallet:x', 'itemsAssembled:1'])
      expect(checkSceneFacts(withFacts(bad), gantryScene)).toHaveLength(1);
    expect(checkSceneFacts(withFacts('placed:Nope'), gantryScene)).toEqual([
      'scenario.json expectations[0].condition: "fact:placed:Nope" names "Nope", which is not a part of the scene; it has: Gantry1',
    ]);
    expect(checkSceneFacts(withFacts('axis:Nope:x'), gantryScene)[0]).toContain('names "Nope"');
    expect(checkSceneFacts(withFacts('placed'), gantryScene)[0]).toContain(
      'picked:<Name>, placed:<Name>, drops:<Name>, axis:<Name>:<x|y|z>',
    );
  });

  it('SCN-004 the fact grammar accepts sorted and misrouted and names the unknown ones', () => {
    const binScene: PlantSceneFile = {
      ...fixtureScene,
      parts: [{ id: 'binred', part: 'remover', name: 'BinRed', position: [0, 0, 0], rotationYDeg: 0, config: {} }],
    };
    expect(checkSceneFacts(withFacts('sorted:BinRed', 'misrouted:BinRed'), binScene)).toEqual([]);
    for (const bad of ['sorted', 'misrouted', 'sorted:BinRed:x', 'sortedd:BinRed'])
      expect(checkSceneFacts(withFacts(bad), binScene)).toHaveLength(1);
    expect(checkSceneFacts(withFacts('sorted'), binScene)[0]).toContain('sorted:<Name>, misrouted:<Name>');
    expect(checkSceneFacts(withFacts('misrouted:Nope'), binScene)).toEqual([
      'scenario.json expectations[0].condition: "fact:misrouted:Nope" names "Nope", which is not a part of the scene; it has: BinRed',
    ]);
  });

  it('SCN-004 the fact grammar accepts stored, produced, misfires, blocked, cell and loaded:crate and names unknown ones', () => {
    const stations: PlantSceneFile = {
      ...fixtureScene,
      parts: [
        { id: 'crane1', part: 'stacker-crane', name: 'Crane1', position: [0, 0, 0], rotationYDeg: 0, config: {} },
        { id: 'mc1', part: 'machining-centre', name: 'Mc1', position: [4, 0, 0], rotationYDeg: 0, config: {} },
      ],
    };
    const good = withFacts('stored:Crane1', 'blocked:Crane1', 'cell:Crane1:2:1', 'produced:Mc1', 'misfires:Mc1', 'loaded:crate:0');
    expect(checkSceneFacts(good, stations)).toEqual([]);
    const bads = ['cell:Crane1:2', 'cell:Crane1:a:1', 'cell:Crane1:2:1:0', 'stored', 'produced:Mc1:x', 'loaded:crate', 'loaded:box:0'];
    for (const bad of [...bads, 'loaded:crate:x']) expect(checkSceneFacts(withFacts(bad), stations)).toHaveLength(1);
    expect(checkSceneFacts(withFacts('cell:Nope:1:1'), stations)).toEqual([
      'scenario.json expectations[0].condition: "fact:cell:Nope:1:1" names "Nope", which is not a part of the scene; it has: Crane1, Mc1',
    ]);
    expect(checkSceneFacts(withFacts('stored:Nope'), stations)[0]).toContain('names "Nope"');
    expect(checkSceneFacts(withFacts('cell:Crane1:2'), stations)[0]).toContain('cell:<Name>:<column>:<level>, loaded:crate:<index>');
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

/** SCN-005 (N10): scenes 7, 10, 11 and 16 state the exact count of their facts; each number is active, one more fails. */
describe('the tightened scenes grade exact counts (SCN-005)', () => {
  for (const id of ['stacker-crane-warehouse', 'lift-stacking', 'three-level-lifts', 'balanced-production-line']) {
    nativeIt(
      `SCN-005 ${id}: the reference passes its exact counts and fails when one count is one more`,
      async () => {
        const dir = resolve(import.meta.dir, '../../../plant-scenes', id);
        const scenario = JSON.parse(readFileSync(join(dir, 'scenario.json'), 'utf8')) as {
          expectations: Array<{ condition: Record<string, unknown> }>;
        };
        const counts = scenario.expectations.flatMap((e) =>
          Object.entries(e.condition).filter(([key, value]) => key.startsWith('fact:') && typeof value === 'number'),
        );
        expect(counts.length).toBeGreaterThan(0);
        const copy = (name: string, body: unknown) => {
          const out = join(root, name);
          mkdirSync(out);
          for (const file of ['scene.json', 'plant-map.json', 'reference.st', 'starter.st'])
            writeFileSync(join(out, file), readFileSync(join(dir, file)));
          writeFileSync(join(out, 'scenario.json'), JSON.stringify(body));
          return out;
        };
        expect((await runSceneCheck(copy(`${id}-exact`, scenario), 'native')).solution).toBe('pass');
        for (const [fact] of counts) {
          const bumped = structuredClone(scenario);
          for (const e of bumped.expectations) if (typeof e.condition[fact] === 'number') (e.condition[fact] as number) += 1;
          const result = await runSceneCheck(copy(`${id}-${fact.replace(/\W/g, '_')}-plus-one`, bumped), 'native');
          expect(result.solution).toBe('fail');
          expect(result.problems.join('\n')).toContain('reference.st: the reference program does not pass');
        }
      },
      600_000,
    );
  }
});
