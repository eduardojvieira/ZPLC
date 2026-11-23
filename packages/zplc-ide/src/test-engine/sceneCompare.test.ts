import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import type { FactValue, PlantCore, PlantSceneFile } from '../plant/contracts';
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
