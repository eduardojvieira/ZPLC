import { describe, expect, it } from 'bun:test';

import type { DebugMap } from '../compiler';
import type { FactValue, PlantCore, PlantSceneFile } from '../plant/contracts';
import type { PlantMapV2 } from '../plants/plantMap';
import { compileScenario, runScenario, type ScenarioRuntimePort } from './index';

const layout = {
  ipiBase: 0,
  ipiSize: 8,
  opiBase: 0x1000,
  opiSize: 8,
  workBase: 0x2000,
  workSize: 1,
  retainBase: 0x3000,
  retainSize: 1,
  codeBase: 0x4000,
  codeSize: 1,
};
const variable = (addr: number, type: string, size: number, region: 'IPI' | 'OPI', bitOffset?: number) => ({
  addr,
  type,
  region,
  size,
  ...(bitOffset === undefined ? {} : { bitOffset }),
});

const tankMap = (over: Record<string, unknown> = {}): DebugMap =>
  ({
    version: '1.0.0',
    programName: 'Tank',
    compilerVersion: 'test',
    generatedAt: '',
    memoryLayout: layout,
    pou: {
      Tank: {
        type: 'PROGRAM',
        sourceMap: [],
        breakpoints: [],
        vars: {
          Level: variable(4, 'REAL', 4, 'IPI'),
          Pos: variable(2, 'INT', 2, 'IPI'),
          Eye: variable(0, 'BOOL', 1, 'IPI', 0),
          Valve: variable(0x1000, 'INT', 2, 'OPI'),
          Flow: variable(0x1004, 'REAL', 4, 'OPI'),
          Pump: variable(0x1002, 'BOOL', 1, 'OPI', 0),
          ...over,
        },
      },
    },
  }) as unknown as DebugMap;

const map: PlantMapV2 = {
  schemaVersion: 2,
  target: { scene: 'tank' },
  signals: {
    'Tank1.fill': {
      direction: 'command',
      type: 'INT',
      point: 'Tank.Valve',
      range: { raw_min: 0, raw_max: 1000, eng_min: 0, eng_max: 100, unit: '%' },
    },
    'Tank1.flowReq': {
      direction: 'command',
      type: 'REAL',
      point: 'Tank.Flow',
      range: { raw_min: 0, raw_max: 10, eng_min: 0, eng_max: 50, unit: 'L/s' },
    },
    'Tank1.level': {
      direction: 'sensor',
      type: 'REAL',
      point: 'Tank.Level',
      range: { raw_min: 0, raw_max: 10, eng_min: 0, eng_max: 1, unit: 'm' },
    },
    'Sel1.position': {
      direction: 'sensor',
      type: 'INT',
      point: 'Tank.Pos',
      range: { raw_min: 0, raw_max: 3, eng_min: 0, eng_max: 3, unit: '' },
    },
    'Eye1.detect': { direction: 'sensor', type: 'BOOL', point: 'Tank.Eye' },
  },
};
const scene: PlantSceneFile = { schemaVersion: 1, name: 'tank', cameras: [], parts: [] };

function fakeCore() {
  const applied: Array<Record<string, boolean | number>> = [];
  const core = {
    stepMs: 5,
    signals: [
      { name: 'Tank1.fill', direction: 'command', type: 'REAL' },
      { name: 'Tank1.flowReq', direction: 'command', type: 'REAL' },
      { name: 'Tank1.level', direction: 'sensor', type: 'REAL' },
      { name: 'Sel1.position', direction: 'sensor', type: 'INT' },
      { name: 'Eye1.detect', direction: 'sensor', type: 'BOOL' },
    ],
    apply: (commands: Record<string, boolean | number>) => void applied.push({ ...commands }),
    advance: () => undefined,
    sense: () => ({ 'Tank1.level': 0.5, 'Sel1.position': 2, 'Eye1.detect': true }),
    facts: (): Record<string, FactValue> => ({ filled: 1 }),
    reset: () => undefined,
  } as unknown as PlantCore;
  return { core, applied };
}

const scenarioInput = {
  schemaVersion: 1,
  id: 'numeric',
  tickMs: 10,
  durationMs: 20,
  scene: { file: 'scene.json', map: 'plant-map.json', script: [] },
  events: [],
  expectations: [{ kind: 'EVENTUALLY', fromMs: 0, withinMs: 20, condition: { 'fact:filled': true } }],
};

/** The program holds Valve = 500 and Flow = 2.5 in its output image; the runtime records every numeric call. */
function numericRuntime(withNumeric = true) {
  const calls: string[] = [];
  const written: Array<{ address: number; type: string; raw: number }> = [];
  let bitReads = 0;
  const runtime: ScenarioRuntimePort = {
    loadProgram: async () => void calls.push('load'),
    reset: async () => void calls.push('reset'),
    hasForces: async () => false,
    setInput: async () => void calls.push('setInput'),
    step: async (atMs) => void calls.push(`step@${atMs}`),
    readOutput: async () => (bitReads++, false),
    ...(withNumeric
      ? {
          setInputNumber: async (address: number, type: 'INT' | 'REAL', raw: number) => {
            calls.push('setInputNumber');
            written.push({ address, type, raw });
          },
          readOutputNumber: async (address: number, type: 'INT' | 'REAL') => {
            calls.push(`readOutputNumber:${address}:${type}`);
            return address === 0x1000 ? 500 : 2.5;
          },
        }
      : {}),
  };
  return { runtime, calls, written, bitReads: () => bitReads };
}

describe('numeric scene signals in the graded run', () => {
  it('PLT-017 a numeric scene scenario resolves INT and REAL variables with their sizes', () => {
    const scenario = compileScenario(scenarioInput, tankMap(), { scene, port: { core: fakeCore().core, map } });
    const find = (list: ReadonlyArray<{ name: string }>, name: string) =>
      list.find((entry) => entry.name === name) as never as Record<string, unknown>;
    expect(find(scenario.scene!.commands, 'Tank1.fill')).toMatchObject({ signal: { address: 0x1000 }, numeric: { type: 'INT', size: 2 } });
    expect(find(scenario.scene!.commands, 'Tank1.flowReq')).toMatchObject({
      signal: { address: 0x1004 },
      numeric: { type: 'REAL', size: 4 },
    });
    expect(find(scenario.scene!.sensors, 'Tank1.level')).toMatchObject({ signal: { address: 4 }, numeric: { type: 'REAL', size: 4 } });
    expect(find(scenario.scene!.sensors, 'Sel1.position')).toMatchObject({ numeric: { type: 'INT', size: 2 } });
    expect(find(scenario.scene!.sensors, 'Eye1.detect').numeric).toBeUndefined();
    expect(Object.isFrozen(scenario.scene!.commands[0]!.numeric)).toBe(true);
    // the wrong variable type or the wrong image is a located problem
    expect(() =>
      compileScenario(scenarioInput, tankMap({ Level: variable(4, 'INT', 2, 'IPI') }), { scene, port: { core: fakeCore().core, map } }),
    ).toThrow('scene map: "Tank1.level": Tank.Level must be a REAL IPI signal of 4 bytes');
    expect(() =>
      compileScenario(scenarioInput, tankMap({ Valve: variable(0x1000, 'INT', 2, 'IPI') }), {
        scene,
        port: { core: fakeCore().core, map },
      }),
    ).toThrow('Tank.Valve must be a INT OPI signal');
  });

  it('PLT-017 a graded numeric run drives sensors in raw units and reads commands in raw units', async () => {
    const plant = fakeCore();
    const scenario = compileScenario(scenarioInput, tankMap(), { scene, port: { core: plant.core, map } });
    const fake = numericRuntime();
    const result = await runScenario(scenario, new Uint8Array([1]), fake.runtime);
    expect(result.passed).toBe(true);
    // commands: raw 0 on the first scan (nothing read yet), then the raw 500 and 2.5 the program holds, scaled to engineering units
    expect(plant.applied).toEqual([
      { 'Tank1.fill': 0, 'Tank1.flowReq': 0 },
      { 'Tank1.fill': 50, 'Tank1.flowReq': 12.5 },
      { 'Tank1.fill': 50, 'Tank1.flowReq': 12.5 },
    ]);
    // sensors: level 0.5 m -> raw 5, position 2 -> raw 2, once per scan each, in the signal's own width
    expect(fake.written.filter((write) => write.type === 'REAL')).toEqual([
      { address: 4, type: 'REAL', raw: 5 },
      { address: 4, type: 'REAL', raw: 5 },
      { address: 4, type: 'REAL', raw: 5 },
    ]);
    expect(fake.written.filter((write) => write.type === 'INT')).toHaveLength(3);
    expect(fake.written.find((write) => write.type === 'INT')).toEqual({ address: 2, type: 'INT', raw: 2 });
    expect(fake.calls.filter((call) => call.startsWith('readOutputNumber'))).toHaveLength(6);
    // the numeric commands are never read as bits and the trace holds only the boolean fact
    expect(fake.bitReads()).toBe(0);
    for (const sample of result.trace) expect(Object.keys(sample.outputs)).toEqual(['fact:filled']);
  });

  it('PLT-003 a numeric scene on a runtime without numeric methods is a located compile problem', async () => {
    const scenario = compileScenario(scenarioInput, tankMap(), { scene, port: { core: fakeCore().core, map } });
    const fake = numericRuntime(false);
    expect(runScenario(scenario, new Uint8Array([1]), fake.runtime)).rejects.toThrow(
      'scene map: "Tank1.fill" is INT; the runtime has no numeric methods (setInputNumber, readOutputNumber)',
    );
    expect(fake.calls).toEqual([]); // refused before the program is loaded
  });

  it('PLT-013 a scene with BOOL signals only compiles and runs without numeric fields or numeric calls', async () => {
    const boolMap: PlantMapV2 = {
      schemaVersion: 2,
      target: { scene: 'tank' },
      signals: {
        'Pump1.run': { direction: 'command', type: 'BOOL', point: 'Tank.Pump' },
        'Eye1.detect': { direction: 'sensor', type: 'BOOL', point: 'Tank.Eye' },
      },
    };
    const core = {
      stepMs: 5,
      signals: [
        { name: 'Pump1.run', direction: 'command', type: 'BOOL' },
        { name: 'Eye1.detect', direction: 'sensor', type: 'BOOL' },
      ],
      apply: () => undefined,
      advance: () => undefined,
      sense: () => ({ 'Eye1.detect': true }),
      facts: (): Record<string, FactValue> => ({ filled: 1 }),
      reset: () => undefined,
    } as unknown as PlantCore;
    const scenario = compileScenario(scenarioInput, tankMap(), { scene, port: { core, map: boolMap } });
    expect(JSON.parse(JSON.stringify(scenario.scene!.commands))).toEqual([
      { name: 'Pump1.run', point: 'Tank.Pump', signal: { signal: 'Tank.Pump', address: 0x1002, bitOffset: 0, value: false } },
    ]);
    const fake = numericRuntime(false); // no numeric methods needed
    expect((await runScenario(scenario, new Uint8Array([1]), fake.runtime)).passed).toBe(true);
    expect(fake.calls).toContain('setInput');
  });
});
