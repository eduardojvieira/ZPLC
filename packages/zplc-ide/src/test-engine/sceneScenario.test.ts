import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import type { FactValue, PartDefinition, PlantCore, PlantSceneFile, PlantSignalDef } from '../plant/contracts';
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
const bool = (addr: number, bitOffset: number, region: 'IPI' | 'OPI') => ({ addr, bitOffset, type: 'BOOL' as const, region, size: 1 });

const cellMap = (): DebugMap => ({
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
        Eye: bool(0, 0, 'IPI'),
        Start: bool(0, 1, 'IPI'),
        Belt: bool(0x1000, 0, 'OPI'),
        Free: bool(0, 2, 'IPI'),
      },
    },
  },
});

const motorMap = (): DebugMap => ({
  ...cellMap(),
  programName: 'MotorPlant',
  pou: {
    MotorPlant: {
      type: 'PROGRAM',
      sourceMap: [],
      breakpoints: [],
      vars: { Command: bool(0x1000, 0, 'OPI'), AtSpeed: bool(0, 0, 'IPI') },
    },
  },
});

const beltPart: PartDefinition = {
  id: 'belt',
  family: 'conveyors',
  names: { en: 'Belt', es: 'Cinta' },
  config: {},
  signals: () => [],
  actions: ['stall', 'jam'],
  snapPoints: () => [],
  doc: { en: '', es: '' },
};
const catalogue = createCatalogue([beltPart]);
const scene: PlantSceneFile = {
  schemaVersion: 1,
  name: 'cell',
  cameras: [],
  parts: [{ id: 'belt1', part: 'belt', name: 'Belt1', position: [0, 0, 0], rotationYDeg: 0, config: {} }],
};
const map: PlantMapV2 = {
  schemaVersion: 2,
  target: { scene: 'cell' },
  signals: {
    'Belt1.run': { direction: 'command', type: 'BOOL', point: 'Cell.Belt' },
    'EyeA.detect': { direction: 'sensor', type: 'BOOL', point: 'Cell.Eye' },
    'StartButton.pressed': { direction: 'sensor', type: 'BOOL', point: 'Cell.Start' },
  },
};
const signals: PlantSignalDef[] = [
  { name: 'Belt1.run', direction: 'command', type: 'BOOL' },
  { name: 'EyeA.detect', direction: 'sensor', type: 'BOOL' },
  { name: 'StartButton.pressed', direction: 'sensor', type: 'BOOL' },
];

/** A scripted plant: the eye sees an item from 30 ms on; calls are recorded with the time they were made at. */
function fakeCore() {
  const calls: string[] = [];
  let timeMs = 0;
  let removed = 0;
  let pressed = false;
  const core = {
    stepMs: 5,
    signals,
    apply: (commands: Readonly<Record<string, boolean | number>>) => calls.push(`apply@${timeMs}:${JSON.stringify(commands)}`),
    advance: (ms: number) => {
      timeMs += ms;
      calls.push(`advance@${timeMs}`);
      if (timeMs >= 40) removed = 1;
    },
    sense: () => ({ 'EyeA.detect': timeMs >= 30, 'StartButton.pressed': pressed }),
    facts: (): Readonly<Record<string, FactValue>> => ({ itemsRemoved: removed, itemsDropped: 0 }),
    operate: (signal: string, value: boolean | number) => {
      pressed = Boolean(value);
      calls.push(`operate@${timeMs}:${signal}=${value}`);
    },
    act: (part: string, action: string) => calls.push(`act@${timeMs}:${part}.${action}`),
    addItem: (kind: string, at: readonly number[]) => {
      calls.push(`addItem@${timeMs}:${kind}@${at.join(',')}`);
      return 'item-1';
    },
    reset: () => {
      timeMs = 0;
      removed = 0;
      pressed = false;
      calls.push('reset');
    },
  } as unknown as PlantCore;
  return { core, calls };
}

/** The program: the belt runs while the eye sees nothing or the start button is held. */
function fakeRuntime() {
  const calls: string[] = [];
  const inputs = new Map<string, boolean>();
  const outputs = new Map<string, boolean>();
  const runtime: ScenarioRuntimePort = {
    loadProgram: async () => void calls.push('load'),
    reset: async () => void calls.push('reset'),
    hasForces: async () => false,
    setInput: async (address, bit, value) => {
      calls.push('setInput');
      inputs.set(`${address}:${bit}`, value);
    },
    step: async (atMs) => {
      calls.push(`step@${atMs}`);
      outputs.set('4096:0', !(inputs.get('0:0') ?? false) || (inputs.get('0:1') ?? false));
    },
    readOutput: async (address, bit) => {
      calls.push('readOutput');
      return outputs.get(`${address}:${bit}`) ?? false;
    },
  };
  return { runtime, calls };
}

const context = (core: PlantCore): SceneScenarioContext => ({ port: { core, map }, scene, catalogue });
const sceneScenario = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: 'scene-1',
  tickMs: 10,
  durationMs: 60,
  scene: {
    file: 'scene.json',
    map: 'plant-map.json',
    script: [
      { atMs: 10, operate: { signal: 'StartButton.pressed', value: true } },
      { atMs: 20, emit: { kind: 'box', at: [0, 0.5, 0] } },
      { atMs: 30, fault: { part: 'Belt1', action: 'jam' } },
    ],
  },
  events: [],
  expectations: [{ kind: 'EVENTUALLY', fromMs: 0, withinMs: 60, condition: { 'fact:itemsRemoved': true } }],
  ...over,
});

describe('2.0 scenarios are untouched by the scene seam', () => {
  it('PLT-013 a 2.0 scenario compiles to exactly the object it compiled to before the seam', () => {
    const compiled = compileScenario(
      {
        schemaVersion: 1,
        id: 'motor',
        plant: 'motor-v1',
        tickMs: 10,
        durationMs: 20,
        events: [],
        expectations: [{ kind: 'EVENTUALLY', fromMs: 0, withinMs: 20, condition: { 'MotorPlant.Command': true } }],
      },
      motorMap(),
    );
    expect(Object.keys(compiled)).toEqual(['id', 'tickMs', 'durationMs', 'events', 'expectations', 'plant']);
    expect(JSON.parse(JSON.stringify(compiled))).toEqual({
      id: 'motor',
      tickMs: 10,
      durationMs: 20,
      events: [],
      expectations: [
        {
          kind: 'EVENTUALLY',
          reads: [{ signal: 'MotorPlant.Command', address: 4096, bitOffset: 0, value: true }],
          fromMs: 0,
          withinMs: 20,
        },
      ],
      plant: {
        kind: 'motor-v1',
        command: { signal: 'MotorPlant.Command', address: 4096, bitOffset: 0, value: false },
        atSpeed: { signal: 'MotorPlant.AtSpeed', address: 0, bitOffset: 0, value: false },
      },
    });
  });

  it('PLT-013 a scenario without a scene block cannot name a fact, and a scene block needs its plant', () => {
    const base = { schemaVersion: 1, id: 'x', tickMs: 10, durationMs: 20, events: [] };
    expect(() =>
      compileScenario({ ...base, expectations: [{ kind: 'ALWAYS', condition: { 'fact:itemsRemoved': false } }] }, cellMap()),
    ).toThrow('must be a POU.variable signal');
    expect(() => compileScenario(sceneScenario(), cellMap())).toThrow('scene needs the scene plant it runs on');
    expect(() => compileScenario(sceneScenario({ plant: 'motor-v1' }), cellMap(), context(fakeCore().core))).toThrow('exclusive');
  });
});

describe('a scene scenario', () => {
  it('SCN-005 scripts a panel input, an emission and a fault at virtual times', async () => {
    const { core, calls } = fakeCore();
    const { runtime } = fakeRuntime();
    const scenario = compileScenario(sceneScenario(), cellMap(), context(core));
    await runScenario(scenario, new Uint8Array([1]), runtime);
    // an event due at atMs is applied before the advance of the scan at atMs
    expect(calls.filter((call) => /^(operate|addItem|act)@/.test(call))).toEqual([
      'operate@10:StartButton.pressed=true',
      'addItem@20:box@0,0.5,0',
      'act@30:Belt1.jam',
    ]);
    expect(calls[0]).toBe('reset');
  });

  it('SCN-005 an expectation reads a plant fact: a number above 0, a true boolean or a non-empty string', async () => {
    const run = async (condition: Record<string, boolean>, kind: 'EVENTUALLY' | 'ALWAYS' = 'EVENTUALLY') => {
      const { core } = fakeCore();
      const scenario = compileScenario(
        sceneScenario({ expectations: [{ kind, ...(kind === 'ALWAYS' ? {} : { fromMs: 0, withinMs: 60 }), condition }] }),
        cellMap(),
        context(core),
      );
      return (await runScenario(scenario, new Uint8Array([1]), fakeRuntime().runtime)).assertions[0]!;
    };
    expect((await run({ 'fact:itemsRemoved': true })).passed).toBe(true);
    expect((await run({ 'fact:itemsDropped': true })).passed).toBe(false);
    expect((await run({ 'fact:itemsDropped': false }, 'ALWAYS')).passed).toBe(true);
    expect((await run({ 'fact:itemsRemoved': false }, 'ALWAYS')).passed).toBe(false);
  });

  it('PLT-017 the exchange is one write of all sensors per scan and one read of all commands', async () => {
    const { core, calls: coreCalls } = fakeCore();
    const { runtime, calls } = fakeRuntime();
    const scenario = compileScenario(sceneScenario(), cellMap(), context(core));
    await runScenario(scenario, new Uint8Array([1]), runtime);
    const scans = 7; // 0..60 ms every 10 ms
    expect(calls.filter((call) => call === 'setInput')).toHaveLength(scans * 2); // two mapped sensors per scan
    expect(calls.filter((call) => call === 'readOutput')).toHaveLength(scans); // the one mapped command per scan
    expect(coreCalls.filter((call) => call.startsWith('apply@'))).toHaveLength(scans);
    // the plant advances by tickMs once per scan, before the runtime scan, with the command of the scan before
    expect(coreCalls.filter((call) => call.startsWith('advance@'))).toEqual([10, 20, 30, 40, 50, 60, 70].map((ms) => `advance@${ms}`));
    expect(coreCalls.filter((call) => call.startsWith('apply@'))[0]).toBe('apply@0:{"Belt1.run":false}');
    expect(coreCalls.filter((call) => call.startsWith('apply@'))[1]).toBe('apply@10:{"Belt1.run":true}'); // the program ran at 0: eye clear
    expect(calls.indexOf('step@0')).toBeGreaterThan(calls.indexOf('setInput'));
  });

  it('PLT-017 the sensors the plant drives are the ones the program reads at the next scan', async () => {
    const { core } = fakeCore();
    const scenario = compileScenario(sceneScenario({ scene: { ...sceneScenario().scene, script: [] } }), cellMap(), context(core));
    const result = await runScenario(scenario, new Uint8Array([1]), fakeRuntime().runtime);
    // eye sees the item from 30 ms of plant time = the scan at 20 ms (the plant leads the scan by one advance); the belt stops after it
    const belt = result.trace.map((sample) => [sample.atMs, sample.outputs['Cell.Belt']]);
    expect(belt).toEqual([
      [0, true],
      [10, true],
      [20, false],
      [30, false],
      [40, false],
      [50, false],
      [60, false],
    ]);
  });

  it('a scene block with an unknown part action reports a located problem', () => {
    const { core } = fakeCore();
    const bad = sceneScenario({
      scene: {
        file: 'scene.json',
        map: 'plant-map.json',
        script: [
          { atMs: 0, operate: { signal: 'StartButton.pressed', value: true } },
          { atMs: 10, emit: { kind: 'box', at: [0, 0, 0] } },
          { atMs: 20, fault: { part: 'Belt1', action: 'melt' } },
        ],
      },
    });
    expect(() => compileScenario(bad, cellMap(), context(core))).toThrow(
      'scene.script[2].fault.action: "melt" is not an action of Belt1; it has: stall, jam',
    );
  });

  it('SCN-005 a malformed block, an unknown part, an unmapped panel signal and an unaligned time are refused with their path', () => {
    const { core } = fakeCore();
    const compile = (script: unknown) => () =>
      compileScenario(sceneScenario({ scene: { file: 'scene.json', map: 'plant-map.json', script } }), cellMap(), context(core));
    expect(compile([{ atMs: 0 }])).toThrow('scene.script[0]: must have atMs and exactly one of');
    expect(compile([{ atMs: 0, fault: { part: 'Nope', action: 'jam' } }])).toThrow('scene.script[0].fault.part: "Nope"');
    expect(compile([{ atMs: 0, operate: { signal: 'Ghost.pressed', value: true } }])).toThrow('scene.script[0].operate.signal');
    expect(compile([{ atMs: 5, operate: { signal: 'StartButton.pressed', value: true } }])).toThrow('align to tickMs');
    expect(() => compileScenario(sceneScenario({ scene: { file: '../x', map: 'm', script: [] } }), cellMap(), context(core))).toThrow(
      'scene.file',
    );
  });

  it('PLT-017 a scenario event cannot write an input the scene plant owns, and a tick off the plant step is refused', () => {
    const { core } = fakeCore();
    expect(() => compileScenario(sceneScenario({ events: [{ atMs: 0, set: { 'Cell.Eye': true } }] }), cellMap(), context(core))).toThrow(
      'plant-owned',
    );
    expect(() => compileScenario(sceneScenario({ tickMs: 12, durationMs: 60 }), cellMap(), context(core))).toThrow(
      'multiple of the plant step 5',
    );
    expect(() =>
      compileScenario(sceneScenario({ events: [{ atMs: 0, set: { 'Cell.Free': true } }] }), cellMap(), context(core)),
    ).not.toThrow();
  });

  it('PLT-010 running a scene scenario twice gives the same trace (the core is reset first)', async () => {
    const { core } = fakeCore();
    const scenario = compileScenario(sceneScenario(), cellMap(), context(core));
    const first = await runScenario(scenario, new Uint8Array([1]), fakeRuntime().runtime);
    const second = await runScenario(scenario, new Uint8Array([1]), fakeRuntime().runtime);
    expect(second.trace).toEqual(first.trace);
  });
});
