import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import type { FactValue, PlantCore, PlantSceneFile } from '../plant/contracts';
import { checkSceneFacts } from '../plant/ci/sceneCheck';
import { createCatalogue } from '../plant/core/catalogue';
import type { PlantMapV2 } from '../plants/plantMap';
import { compileScenario, runScenario, type ScenarioRuntimePort, type SceneScenarioContext } from './index';

const layout = {
  ipiBase: 0,
  ipiSize: 1,
  opiBase: 0x1000,
  opiSize: 1,
  workBase: 0x2000,
  workSize: 1,
  retainBase: 0x3000,
  retainSize: 1,
  codeBase: 0x4000,
  codeSize: 1,
};
const debugMap = (): DebugMap => ({
  version: '1.0.0',
  programName: 'Cell',
  compilerVersion: 'test',
  generatedAt: '',
  memoryLayout: layout,
  pou: {
    Cell: {
      type: 'PROGRAM',
      sourceMap: [],
      breakpoints: [],
      vars: {
        Eye: { addr: 0, bitOffset: 0, type: 'BOOL', region: 'IPI', size: 1 },
        Belt: { addr: 0x1000, bitOffset: 0, type: 'BOOL', region: 'OPI', size: 1 },
      },
    },
  },
});
const scene: PlantSceneFile = { schemaVersion: 1, name: 'cell', cameras: [], parts: [] };
const map: PlantMapV2 = {
  schemaVersion: 2,
  target: { scene: 'cell' },
  signals: {
    'Belt1.run': { direction: 'command', type: 'BOOL', point: 'Cell.Belt' },
    'EyeA.detect': { direction: 'sensor', type: 'BOOL', point: 'Cell.Eye' },
  },
};

/** A stub plant: `stored:Rack` is 0 at the first scan and `rackAt20` after; `level:Tank` is 3 m after 20 ms. */
function stubCore(rackAt20: number, level = 3): PlantCore {
  let timeMs = 0;
  return {
    stepMs: 5,
    signals: [
      { name: 'Belt1.run', direction: 'command', type: 'BOOL' },
      { name: 'EyeA.detect', direction: 'sensor', type: 'BOOL' },
    ],
    apply: () => undefined,
    advance: (ms: number) => void (timeMs += ms),
    sense: () => ({ 'EyeA.detect': false }),
    facts: (): Readonly<Record<string, FactValue>> => ({
      'stored:Rack': timeMs >= 20 ? rackAt20 : 0,
      'level:Tank': timeMs >= 20 ? level : 0,
      'inBand:Tank': true,
      itemsDropped: 0,
    }),
    operate: () => undefined,
    act: () => undefined,
    addItem: () => 'item-1',
    reset: () => void (timeMs = 0),
  } as unknown as PlantCore;
}
const runtime: ScenarioRuntimePort = {
  loadProgram: async () => undefined,
  reset: async () => undefined,
  hasForces: async () => false,
  setInput: async () => undefined,
  step: async () => undefined,
  readOutput: async () => false,
};
const context = (core: PlantCore): SceneScenarioContext => ({ port: { core, map }, scene, catalogue: createCatalogue([]) });
const scenario = (expectations: unknown[]) => ({
  schemaVersion: 1,
  id: 'cmp',
  tickMs: 10,
  durationMs: 40,
  scene: { file: 'scene.json', map: 'plant-map.json', script: [] },
  events: [],
  expectations,
});
const compile = (expectations: unknown[], core = stubCore(3)) => compileScenario(scenario(expectations), debugMap(), context(core));
const run = async (expectations: unknown[], core = stubCore(3)) =>
  (await runScenario(compile(expectations, core), new Uint8Array([1]), runtime)).assertions;
const at = (condition: Record<string, unknown>, atMs = 40) => ({ kind: 'AT', atMs, condition });

describe('SCN-005 numeric and ranged conditions on plant facts', () => {
  it('SCN-005 a fact condition may be an exact number or a min and max', async () => {
    expect((await run([at({ 'fact:stored:Rack': 3 }), at({ 'fact:level:Tank': { min: 2, max: 4 } })])).map((a) => a.passed)).toEqual([
      true,
      true,
    ]);
    expect((await run([at({ 'fact:level:Tank': { min: 3 } }), at({ 'fact:level:Tank': { max: 3 } })])).every((a) => a.passed)).toBe(true);
    expect((await run([at({ 'fact:level:Tank': { min: 3.5 } })]))[0]!.passed).toBe(false);
  });

  it('SCN-005 a stored count of 3 on a rack passes at 3 and fails at 2', async () => {
    expect((await run([at({ 'fact:stored:Rack': 3 })], stubCore(3)))[0]!.passed).toBe(true);
    const failed = (await run([at({ 'fact:stored:Rack': 3 })], stubCore(2)))[0]!;
    expect(failed.passed).toBe(false);
    expect(failed.checks).toEqual([{ signal: 'fact:stored:Rack', expected: 3, observed: 2 }]);
    const range = (await run([at({ 'fact:level:Tank': { min: 1, max: 2 } })]))[0]!;
    expect(range.checks).toEqual([{ signal: 'fact:level:Tank', expected: { min: 1, max: 2 }, observed: 3 }]);
  });

  it('SCN-005 two numeric conditions on one fact, and a boolean one, do not share a trace column', async () => {
    const assertions = await run([at({ 'fact:stored:Rack': 3 }, 10), at({ 'fact:stored:Rack': 0 }, 0), at({ 'fact:stored:Rack': true })]);
    expect(assertions.map((a) => a.passed)).toEqual([true, true, true]);
  });

  it('SCN-005 a numeric condition keeps the trace boolean and its keys valid output names', async () => {
    const result = await runScenario(compile([at({ 'fact:level:Tank': { min: 2.5, max: 4 } })]), new Uint8Array([1]), runtime);
    for (const sample of result.trace)
      for (const [key, value] of Object.entries(sample.outputs)) {
        expect(key).toMatch(/^[A-Za-z][A-Za-z0-9_.:-]*$/);
        expect(typeof value).toBe('boolean');
      }
  });

  it('SCN-005 a scenario with only boolean conditions compiles to the same object as before', () => {
    const compiled = compile([at({ 'fact:itemsDropped': false })]);
    expect(JSON.parse(JSON.stringify(compiled.expectations))).toEqual([
      { kind: 'AT', reads: [{ signal: 'fact:itemsDropped', address: -1, bitOffset: 0, value: false }], atMs: 40 },
    ]);
  });

  it('SCN-005 an exact number on a real fact is refused with a located message', () => {
    expect(() => compile([at({ 'fact:level:Tank': 3 })])).toThrow(/expectations\[0\]\.condition\.fact:level:Tank.*real fact.*range/);
  });

  it('SCN-005 a range on an integer fact is refused with a located message', () => {
    expect(() => compile([at({ 'fact:stored:Rack': { min: 1 } })])).toThrow(/expectations\[0\]\.condition\.fact:stored:Rack.*integer fact/);
  });

  it('SCN-005 a number on a boolean fact, a fractional count and a malformed range are refused', () => {
    expect(() => compile([at({ 'fact:inBand:Tank': 1 })])).toThrow(/inBand:Tank.*boolean fact/);
    expect(() => compile([at({ 'fact:stored:Rack': 2.5 })])).toThrow(/whole number/);
    expect(() => compile([at({ 'fact:level:Tank': {} })])).toThrow(/min and max/);
    expect(() => compile([at({ 'fact:level:Tank': { min: 4, max: 2 } })])).toThrow(/min.*max/);
    expect(() => compile([at({ 'fact:level:Tank': { low: 1 } })])).toThrow(/min and max/);
    expect(() => compile([at({ 'fact:level:Tank': { min: '1' } })])).toThrow(/min and max/);
  });

  it('SCN-005 a numeric condition on a program signal is refused with a located message', () => {
    expect(() => compile([at({ 'Cell.Belt': 1 })])).toThrow('expectations[0].condition.Cell.Belt must be boolean');
    expect(() => compile([at({ 'Cell.Belt': { min: 0 } })])).toThrow('expectations[0].condition.Cell.Belt must be boolean');
  });

  it('SCN-005 a boolean condition on a program signal still reads as before', async () => {
    expect((await run([at({ 'Cell.Belt': false })]))[0]!.passed).toBe(true);
  });
});

describe('SCN-005 the rules on every fact head', () => {
  const INTEGER = [
    'itemsEmitted',
    'itemsRemoved',
    'itemsDropped',
    'itemsCollided',
    'itemsAssembled',
    'emitted:P',
    'delivered:P',
    'count:P',
    'highs:P',
    'picked:P',
    'placed:P',
    'drops:P',
    'sorted:P',
    'misrouted:P',
    'stored:P',
    'produced:P',
    'misfires:P',
    'blocked:P',
    'stacked:pallet:0',
    'layers:pallet:0',
    'loaded:crate:0',
  ];
  const REAL = ['position:box:0', 'level:P', 'volume:P', 'spilledL:P', 'axis:P:y'];
  const BOOLEAN = ['inBand:P', 'cell:P:1:1'];

  const layout = {
    ipiBase: 0,
    ipiSize: 1,
    opiBase: 0x1000,
    opiSize: 1,
    workBase: 0x2000,
    workSize: 1,
    retainBase: 0x3000,
    retainSize: 1,
    codeBase: 0x4000,
    codeSize: 1,
  };
  const debugMap = (): DebugMap => ({
    version: '1.0.0',
    programName: 'Cell',
    compilerVersion: 'probe',
    generatedAt: '',
    memoryLayout: layout,
    pou: {
      Cell: {
        type: 'PROGRAM' as const,
        sourceMap: [],
        breakpoints: [],
        vars: {
          Eye: { addr: 0, bitOffset: 0, type: 'BOOL' as const, region: 'IPI', size: 1 },
          Belt: { addr: 0x1000, bitOffset: 0, type: 'BOOL' as const, region: 'OPI', size: 1 },
          Count: { addr: 0x1000, bitOffset: 1, type: 'BOOL' as const, region: 'OPI', size: 1 },
        },
      },
    },
  });
  const scene: PlantSceneFile = { schemaVersion: 1, name: 'cell', cameras: [], parts: [] };
  const map: PlantMapV2 = {
    schemaVersion: 2,
    target: { scene: 'cell' },
    signals: {
      'Belt1.run': { direction: 'command', type: 'BOOL', point: 'Cell.Belt' },
      'EyeA.detect': { direction: 'sensor', type: 'BOOL', point: 'Cell.Eye' },
    },
  };
  /** Every fact of the grammar holds `value` from the first scan on. */
  function core(value: number): PlantCore {
    const facts: Record<string, number | boolean> = {};
    for (const name of [...INTEGER, ...REAL]) facts[name] = value;
    for (const name of BOOLEAN) facts[name] = true;
    return {
      stepMs: 5,
      signals: [
        { name: 'Belt1.run', direction: 'command', type: 'BOOL' },
        { name: 'EyeA.detect', direction: 'sensor', type: 'BOOL' },
      ],
      apply: () => undefined,
      advance: () => undefined,
      sense: () => ({ 'EyeA.detect': false }),
      facts: () => facts,
      operate: () => undefined,
      act: () => undefined,
      addItem: () => 'item-1',
      reset: () => undefined,
    } as unknown as PlantCore;
  }
  const runtime: ScenarioRuntimePort = {
    loadProgram: async () => undefined,
    reset: async () => undefined,
    hasForces: async () => false,
    setInput: async () => undefined,
    step: async () => undefined,
    readOutput: async () => false,
  };
  const scenario = (expectations: unknown[]) => ({
    schemaVersion: 1,
    id: 'probe',
    tickMs: 10,
    durationMs: 20,
    scene: { file: 'scene.json', map: 'plant-map.json', script: [] },
    events: [],
    expectations,
  });
  const compile = (expectations: unknown[], value = 3) =>
    compileScenario(scenario(expectations), debugMap(), { port: { core: core(value), map }, scene, catalogue: createCatalogue([]) });
  const run = async (expectations: unknown[], value: number) =>
    (await runScenario(compile(expectations, value), new Uint8Array([1]), runtime)).assertions as Array<{
      passed: boolean;
      checks?: unknown;
    }>;
  const at = (condition: Record<string, unknown>) => ({ kind: 'AT', atMs: 20, condition });
  const located = (fact: string) =>
    new RegExp(`^Invalid test scenario: expectations\\[0\\]\\.condition\\.fact:${fact.replaceAll(':', '\\:')} `);

  for (const fact of INTEGER) {
    it(`integer ${fact}: exact 3 passes at 3, fails at 2 with raw detail; 2.5, a range and 3 on a real are refused`, async () => {
      expect((await run([at({ [`fact:${fact}`]: 3 })], 3))[0]!.passed).toBe(true);
      const failed = (await run([at({ [`fact:${fact}`]: 3 })], 2))[0]!;
      expect(failed.passed).toBe(false);
      expect(failed.checks).toEqual([{ signal: `fact:${fact}`, expected: 3, observed: 2 }]);
      expect((await run([at({ [`fact:${fact}`]: 0 })], 0))[0]!.passed).toBe(true);
      expect(() => compile([at({ [`fact:${fact}`]: 2.5 })])).toThrow(located(fact));
      expect(() => compile([at({ [`fact:${fact}`]: 2.5 })])).toThrow(/whole number/);
      expect(() => compile([at({ [`fact:${fact}`]: { min: 1, max: 4 } })])).toThrow(located(fact));
      expect(() => compile([at({ [`fact:${fact}`]: { min: 1 } })])).toThrow(/integer fact/);
      expect(() => compile([at({ [`fact:${fact}`]: { max: 1 } })])).toThrow(/integer fact/);
    });
  }
  for (const fact of REAL) {
    it(`real ${fact}: min only, max only, both, inclusive; exact, empty, non-finite and inverted refused`, async () => {
      const passed = async (cond: unknown, value: number) => (await run([at({ [`fact:${fact}`]: cond })], value))[0]!.passed;
      expect(await passed({ min: 2 }, 2)).toBe(true);
      expect(await passed({ min: 2 }, 1.999)).toBe(false);
      expect(await passed({ max: 2 }, 2)).toBe(true);
      expect(await passed({ max: 2 }, 2.001)).toBe(false);
      expect(await passed({ min: 1.5, max: 2.5 }, 1.5)).toBe(true);
      expect(await passed({ min: 1.5, max: 2.5 }, 2.5)).toBe(true);
      expect(await passed({ min: 1.5, max: 2.5 }, 2.6)).toBe(false);
      expect(await passed({ min: -1, max: -1 }, -1)).toBe(true);
      const failed = (await run([at({ [`fact:${fact}`]: { min: 1.5, max: 2.5 } })], 0.25))[0]!;
      expect(failed.checks).toEqual([{ signal: `fact:${fact}`, expected: { min: 1.5, max: 2.5 }, observed: 0.25 }]);
      expect(() => compile([at({ [`fact:${fact}`]: 3 })])).toThrow(located(fact));
      expect(() => compile([at({ [`fact:${fact}`]: 3 })])).toThrow(/real fact/);
      expect(() => compile([at({ [`fact:${fact}`]: {} })])).toThrow(located(fact));
      expect(() => compile([at({ [`fact:${fact}`]: { min: Number.POSITIVE_INFINITY } })])).toThrow(located(fact));
      expect(() => compile([at({ [`fact:${fact}`]: { max: Number.NaN } })])).toThrow(located(fact));
      expect(() => compile([at({ [`fact:${fact}`]: { min: null } })])).toThrow(located(fact));
      expect(() => compile([at({ [`fact:${fact}`]: { min: 3, max: 2 } })])).toThrow(/min at most max/);
      expect(() => compile([at({ [`fact:${fact}`]: { min: 1, max: 2, step: 1 } })])).toThrow(located(fact));
      expect(() => compile([at({ [`fact:${fact}`]: [1, 2] })])).toThrow(located(fact));
      expect(() => compile([at({ [`fact:${fact}`]: '2' })])).toThrow(located(fact));
      expect(() => compile([at({ [`fact:${fact}`]: null })])).toThrow(located(fact));
    });
  }
  for (const fact of BOOLEAN) {
    it(`boolean ${fact}: any number or range refused; true still reads`, async () => {
      expect(() => compile([at({ [`fact:${fact}`]: 1 })])).toThrow(located(fact));
      expect(() => compile([at({ [`fact:${fact}`]: 1 })])).toThrow(/boolean fact/);
      expect(() => compile([at({ [`fact:${fact}`]: { min: 0 } })])).toThrow(/boolean fact/);
      expect((await run([at({ [`fact:${fact}`]: true })], 3))[0]!.passed).toBe(true);
    });
  }
  it('a number on an unknown head, a program signal, an event write and an until is refused with a located message', () => {
    expect(() => compile([at({ 'fact:nope:P': 1 })])).toThrow(located('nope:P'));
    for (const value of [1, 0, { min: 0 }, { min: 0, max: 1 }]) {
      expect(() => compile([at({ 'Cell.Belt': value })])).toThrow(
        'Invalid test scenario: expectations[0].condition.Cell.Belt must be boolean',
      );
      expect(() => compile([{ kind: 'UNTIL', fromMs: 0, condition: { 'Cell.Belt': false }, until: { 'Cell.Eye': value } }])).toThrow(
        'expectations[0].until.Cell.Eye must be boolean',
      );
    }
    expect(() =>
      compileScenario({ ...scenario([at({ 'Cell.Belt': false })]), events: [{ atMs: 0, set: { 'Cell.Eye': 1 } }] }, debugMap(), {
        port: { core: core(3), map },
        scene,
        catalogue: createCatalogue([]),
      }),
    ).toThrow('events[0].set.Cell.Eye must be boolean');
  });
  it('a numeric fact condition in a scenario without a scene is refused as before', () => {
    expect(() =>
      compileScenario(
        Object.fromEntries(Object.entries(scenario([at({ 'fact:stored:P': 3 })])).filter(([key]) => key !== 'scene')),
        debugMap(),
      ),
    ).toThrow('expectations[0].condition.fact:stored:P must be boolean');
  });
  it('ALWAYS, NEVER, FOR and WITHIN grade a numeric condition at every sample', async () => {
    const window = { fromMs: 0, withinMs: 20 };
    const all = await run(
      [
        { kind: 'ALWAYS', condition: { 'fact:stored:P': 3 } },
        { kind: 'NEVER', condition: { 'fact:stored:P': 4 } },
        { kind: 'FOR', fromMs: 0, forMs: 20, condition: { 'fact:level:P': { min: 3, max: 3 } } },
        { kind: 'WITHIN', ...window, condition: { 'fact:level:P': { max: 3 } } },
        { kind: 'NEVER', condition: { 'fact:stored:P': 3 } },
      ],
      3,
    );
    expect(all.map((a) => a.passed)).toEqual([true, true, true, true, false]);
  });
  it('SCN-005 a string, null or array on an integer or a real fact says what the fact takes', () => {
    for (const bad of ['2', null, [1, 2]]) {
      expect(() => compile([at({ 'fact:stored:P': bad })])).toThrow(
        /expectations\[0\]\.condition\.fact:stored:P is an integer fact: .*whole number/,
      );
      expect(() => compile([at({ 'fact:level:P': bad })])).toThrow(/expectations\[0\]\.condition\.fact:level:P is a real fact: .*"min"/);
    }
  });
  it('SCN-005 every head of the fact grammar of sceneCheck is an integer, a real or a boolean fact in the engine', () => {
    // the grammar is the tail of the message sceneCheck gives for a name that is not a fact
    const [problem] = checkSceneFacts({ expectations: [{ condition: { 'fact:nope': true } }] }, scene);
    const names = problem!.split('the facts are ')[1]!.split(', ');
    expect(names.length).toBeGreaterThan(25);
    const sample = (name: string) =>
      name
        .replace('<Name>', 'P')
        .replace('<kind>', 'box')
        .replace(/<index>/g, '0')
        .replace('<x|y|z>', 'y')
        .replace(/<(column|level)>/g, '1');
    for (const name of names) {
      const fact = sample(name);
      const accepts = (expected: unknown) => {
        try {
          compile([at({ [`fact:${fact}`]: expected })]);
          return true;
        } catch (error) {
          return (error as Error).message;
        }
      };
      const exact = accepts(3);
      const range = accepts({ min: 0 });
      const kind =
        exact === true ? 'integer' : range === true ? 'real' : /boolean fact/.test(String(exact)) ? 'boolean' : `unclassified: ${exact}`;
      expect([name, kind !== 'integer' || range !== true]).toEqual([name, true]);
      expect([name, ['integer', 'real', 'boolean'].includes(kind)]).toEqual([name, true]);
    }
  });
});
