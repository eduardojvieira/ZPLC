import { describe, expect, it } from 'bun:test';

import { compileSingleFileWithTask, type DebugMap } from '../compiler';
import { compileScenario, runScenario, type ScenarioRuntimePort } from './index';

const debugMap = (): DebugMap => ({
  version: '1.0.0', programName: 'Motor', compilerVersion: 'test', generatedAt: '',
  memoryLayout: { ipiBase: 0, ipiSize: 1, opiBase: 0x1000, opiSize: 1, workBase: 0x2000, workSize: 1, retainBase: 0x3000, retainSize: 1, codeBase: 0x4000, codeSize: 1 },
  pou: { Motor: { type: 'PROGRAM', sourceMap: [], breakpoints: [], vars: {
    Start: { addr: 0, bitOffset: 0, type: 'BOOL', region: 'IPI', size: 1 },
    Stop: { addr: 0, bitOffset: 1, type: 'BOOL', region: 'IPI', size: 1 },
    Forward: { addr: 0x1000, bitOffset: 0, type: 'BOOL', region: 'OPI', size: 1 },
    Reverse: { addr: 0x1000, bitOffset: 1, type: 'BOOL', region: 'OPI', size: 1 },
    Local: { addr: 0x2000, bitOffset: 0, type: 'BOOL', region: 'WORK', size: 1 },
    Word: { addr: 0, type: 'INT', region: 'IPI', size: 2 },
  } } },
});

const debugMapWithOutputs = (count: number): DebugMap => ({
  ...debugMap(),
  memoryLayout: { ...debugMap().memoryLayout, opiSize: count },
  pou: { Motor: { ...debugMap().pou.Motor!, vars: {
    ...debugMap().pou.Motor!.vars,
    ...Object.fromEntries(Array.from({ length: count }, (_, index) => [`Output${index}`, {
      addr: 0x1000 + index, bitOffset: 0, type: 'BOOL', region: 'OPI', size: 1,
    }])),
  } } },
});

const debugMapWithStopAlias = (): DebugMap => {
  const map = debugMap();
  map.pou.Motor!.vars.StopAlias = { ...map.pou.Motor!.vars.Stop! };
  return map;
};

const motorPlantDebugMap = (): DebugMap => ({
  version: '1.0.0', programName: 'MotorPlant', compilerVersion: 'test', generatedAt: '',
  memoryLayout: { ipiBase: 0, ipiSize: 1, opiBase: 0x1000, opiSize: 1, workBase: 0x2000, workSize: 1, retainBase: 0x3000, retainSize: 1, codeBase: 0x4000, codeSize: 1 },
  pou: { MotorPlant: { type: 'PROGRAM', sourceMap: [], breakpoints: [], vars: {
    Start: { addr: 0, bitOffset: 0, type: 'BOOL', region: 'IPI', size: 1 },
    Stop: { addr: 0, bitOffset: 1, type: 'BOOL', region: 'IPI', size: 1 },
    AtSpeed: { addr: 0, bitOffset: 2, type: 'BOOL', region: 'IPI', size: 1 },
    AtSpeedAlias: { addr: 0, bitOffset: 2, type: 'BOOL', region: 'IPI', size: 1 },
    Command: { addr: 0x1000, bitOffset: 0, type: 'BOOL', region: 'OPI', size: 1 },
    Running: { addr: 0x1000, bitOffset: 1, type: 'BOOL', region: 'OPI', size: 1 },
  } } },
});

const motorPlantDebugMapWithOutputs = (): DebugMap => {
  const map = motorPlantDebugMap();
  map.memoryLayout.opiSize = 65;
  Object.assign(map.pou.MotorPlant!.vars, Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`Output${index}`, {
    addr: 0x1001 + index, bitOffset: 0, type: 'BOOL', region: 'OPI', size: 1,
  }])));
  return map;
};

const motorPlantScenario = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1, id: 'motor-plant', plant: 'motor-v1', tickMs: 10, durationMs: 40,
  events: [
    { atMs: 0, set: { 'MotorPlant.Start': false, 'MotorPlant.Stop': false } },
    { atMs: 10, set: { 'MotorPlant.Start': true } },
    { atMs: 20, set: { 'MotorPlant.Start': false } },
    { atMs: 40, set: { 'MotorPlant.Stop': true } },
  ],
  expectations: [
    { kind: 'AT', atMs: 30, condition: { 'MotorPlant.Running': true } },
  ],
  ...overrides,
});

const conveyorDebugMap = (): DebugMap => ({
  version: '1.0.0', programName: 'Conveyor', compilerVersion: 'test', generatedAt: '',
  memoryLayout: { ipiBase: 0, ipiSize: 1, opiBase: 0x1000, opiSize: 1, workBase: 0x2000, workSize: 1, retainBase: 0x3000, retainSize: 1, codeBase: 0x4000, codeSize: 1 },
  pou: { Conveyor: { type: 'PROGRAM', sourceMap: [], breakpoints: [], vars: {
    Start: { addr: 0, bitOffset: 0, type: 'BOOL', region: 'IPI', size: 1 }, Stop: { addr: 0, bitOffset: 1, type: 'BOOL', region: 'IPI', size: 1 }, Reset: { addr: 0, bitOffset: 2, type: 'BOOL', region: 'IPI', size: 1 },
    PartAtClassifier: { addr: 0, bitOffset: 3, type: 'BOOL', region: 'IPI', size: 1 }, PartAtClassifierAlias: { addr: 0, bitOffset: 3, type: 'BOOL', region: 'IPI', size: 1 }, MetalDetected: { addr: 0, bitOffset: 4, type: 'BOOL', region: 'IPI', size: 1 }, PartAtDiverter: { addr: 0, bitOffset: 5, type: 'BOOL', region: 'IPI', size: 1 }, JamDetected: { addr: 0, bitOffset: 6, type: 'BOOL', region: 'IPI', size: 1 },
    BeltCommand: { addr: 0x1000, bitOffset: 0, type: 'BOOL', region: 'OPI', size: 1 }, DiverterCommand: { addr: 0x1000, bitOffset: 1, type: 'BOOL', region: 'OPI', size: 1 }, FaultLamp: { addr: 0x1000, bitOffset: 2, type: 'BOOL', region: 'OPI', size: 1 },
  } } },
});
const conveyorScenario = (overrides: Record<string, unknown> = {}) => ({ schemaVersion: 1, id: 'Conveyor01', plant: 'conveyor-v1', tickMs: 10, durationMs: 80, events: [{ atMs: 0, set: { 'Conveyor.Start': false, 'Conveyor.Stop': false, 'Conveyor.Reset': false } }, { atMs: 10, set: { 'Conveyor.Start': true } }, { atMs: 20, set: { 'Conveyor.Start': false } }], expectations: [{ kind: 'AT', atMs: 10, condition: { 'Conveyor.BeltCommand': true } }], ...overrides });

const tankDebugMap = (): DebugMap => ({
  version: '1.0.0', programName: 'TankLevel', compilerVersion: 'test', generatedAt: '',
  memoryLayout: { ipiBase: 0, ipiSize: 1, opiBase: 0x1000, opiSize: 1, workBase: 0x2000, workSize: 1, retainBase: 0x3000, retainSize: 1, codeBase: 0x4000, codeSize: 1 },
  pou: { TankLevel: { type: 'PROGRAM', sourceMap: [], breakpoints: [], vars: {
    AutoEnable: { addr: 0, bitOffset: 0, type: 'BOOL', region: 'IPI', size: 1 }, LevelLow: { addr: 0, bitOffset: 1, type: 'BOOL', region: 'IPI', size: 1 }, LevelLowAlias: { addr: 0, bitOffset: 1, type: 'BOOL', region: 'IPI', size: 1 }, LevelHigh: { addr: 0, bitOffset: 2, type: 'BOOL', region: 'IPI', size: 1 }, LevelHighAlias: { addr: 0, bitOffset: 2, type: 'BOOL', region: 'IPI', size: 1 }, PumpFault: { addr: 0, bitOffset: 3, type: 'BOOL', region: 'IPI', size: 1 }, EStop: { addr: 0, bitOffset: 4, type: 'BOOL', region: 'IPI', size: 1 }, Reset: { addr: 0, bitOffset: 5, type: 'BOOL', region: 'IPI', size: 1 },
    Pump: { addr: 0x1000, bitOffset: 0, type: 'BOOL', region: 'OPI', size: 1 }, Alarm: { addr: 0x1000, bitOffset: 1, type: 'BOOL', region: 'OPI', size: 1 },
  } } },
});
const tankScenario = (overrides: Record<string, unknown> = {}) => ({ schemaVersion: 1, id: 'TankLevel', plant: 'tank-v1', tickMs: 10, durationMs: 80, events: [{ atMs: 0, set: { 'TankLevel.AutoEnable': false, 'TankLevel.PumpFault': false, 'TankLevel.EStop': false, 'TankLevel.Reset': false } }, { atMs: 10, set: { 'TankLevel.AutoEnable': true } }], expectations: [{ kind: 'AT', atMs: 10, condition: { 'TankLevel.Pump': true } }, { kind: 'NEVER', condition: { 'TankLevel.Pump': true, 'TankLevel.Alarm': true } }], ...overrides });

const pedestrianDebugMap = (): DebugMap => ({
  version: '1.0.0', programName: 'PedestrianCrossing', compilerVersion: 'test', generatedAt: '',
  memoryLayout: { ipiBase: 0, ipiSize: 1, opiBase: 0x1000, opiSize: 1, workBase: 0x2000, workSize: 1, retainBase: 0x3000, retainSize: 1, codeBase: 0x4000, codeSize: 1 },
  pou: { PedestrianCrossing: { type: 'PROGRAM', sourceMap: [], breakpoints: [], vars: {
    PedRequest: { addr: 0, bitOffset: 0, type: 'BOOL', region: 'IPI', size: 1 }, PedRequestAlias: { addr: 0, bitOffset: 0, type: 'BOOL', region: 'IPI', size: 1 },
    PedWalk: { addr: 0x1000, bitOffset: 0, type: 'BOOL', region: 'OPI', size: 1 },
  } } },
});
const pedestrianScenario = (overrides: Record<string, unknown> = {}) => ({ schemaVersion: 1, id: 'PedestrianCrossing', plant: 'pedestrian-v1', tickMs: 10, durationMs: 100, events: [], expectations: [{ kind: 'AT', atMs: 60, condition: { 'PedestrianCrossing.PedWalk': true } }], ...overrides });

class ConveyorPort extends FakePort {
  requested = false; faulted = false; metal = false;
  async step(atMs: number): Promise<void> {
    this.calls.push(`step:${atMs}`);
    if (this.inputs.get('0.6')) this.faulted = true;
    if (this.inputs.get('0.1')) this.requested = false;
    else if (this.inputs.get('0.0') && !this.faulted) this.requested = true;
    if (this.inputs.get('0.2') && !this.inputs.get('0.6')) this.faulted = false;
    if (this.inputs.get('0.3') && this.inputs.get('0.4')) this.metal = true;
    const belt = this.requested && !this.faulted;
    this.outputs.set('4096.0', belt); this.outputs.set('4096.1', belt && this.inputs.get('0.5') === true && this.metal); this.outputs.set('4096.2', this.faulted || this.inputs.get('0.6') === true);
  }
}

const scenario = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1, id: 'motor-start', tickMs: 10, durationMs: 20,
  events: [{ atMs: 0, set: { 'Motor.Start': true } }],
  expectations: [{ kind: 'AT', atMs: 10, condition: { 'Motor.Forward': true } }],
  ...overrides,
});

class FakePort implements ScenarioRuntimePort {
  calls: string[] = [];
  forced = false;
  inputs = new Map<string, boolean>();
  outputs = new Map<string, boolean>();
  async loadProgram(): Promise<void> { this.calls.push('load'); }
  async reset(): Promise<void> { this.calls.push('reset'); }
  async hasForces(): Promise<boolean> { this.calls.push('forces'); return this.forced; }
  async setInput(address: number, bitOffset: number, value: boolean): Promise<void> { this.calls.push(`set:${address}.${bitOffset}=${value}`); this.inputs.set(`${address}.${bitOffset}`, value); }
  async step(atMs: number): Promise<void> { this.calls.push(`step:${atMs}`); this.outputs.set('4096.0', this.inputs.get('0.0') === true); }
  async readOutput(address: number, bitOffset: number): Promise<boolean> { this.calls.push(`read:${address}.${bitOffset}`); return this.outputs.get(`${address}.${bitOffset}`) ?? false; }
}

class MotorPlantPort extends FakePort {
  requested = false;
  async step(atMs: number): Promise<void> {
    this.calls.push(`step:${atMs}`);
    if (this.inputs.get('0.1') === true) this.requested = false;
    else if (this.inputs.get('0.0') === true) this.requested = true;
    this.outputs.set('4096.0', this.requested);
    this.outputs.set('4096.1', this.requested && this.inputs.get('0.2') === true);
  }
}

class TankPort extends FakePort {
  faulted = false; pumpLatched = false; resetArmed = false;
  async step(atMs: number): Promise<void> {
    this.calls.push(`step:${atMs}`);
    if (this.inputs.get('0.3') || this.inputs.get('0.4')) { this.pumpLatched = false; this.faulted = true; this.resetArmed = false; }
    else if (this.faulted) { this.pumpLatched = false; if (!this.inputs.get('0.5')) this.resetArmed = true; else if (this.resetArmed) { this.faulted = false; this.resetArmed = false; } }
    else if (!this.inputs.get('0.0') || this.inputs.get('0.2')) this.pumpLatched = false;
    else if (this.inputs.get('0.1')) this.pumpLatched = true;
    const pump = this.pumpLatched && this.inputs.get('0.0') === true && !this.inputs.get('0.2') && !this.inputs.get('0.4') && !this.inputs.get('0.3') && !this.faulted;
    this.outputs.set('4096.0', pump); this.outputs.set('4096.1', this.faulted);
  }
}

class PedestrianPort extends FakePort {
  async step(atMs: number): Promise<void> {
    this.calls.push(`step:${atMs}`);
    this.outputs.set('4096.0', this.inputs.get('0.0') === true && atMs >= 60 && atMs < 90);
  }
}

describe('temporal Test Engine Slice 0', () => {
  it('closes the pedestrian-v1 request loop deterministically and never lets an event own its input', async () => {
    const compiled = compileScenario(pedestrianScenario(), pedestrianDebugMap());
    expect(compiled.plant).toMatchObject({ kind: 'pedestrian-v1', pedRequest: { signal: 'PedestrianCrossing.PedRequest' }, pedWalk: { signal: 'PedestrianCrossing.PedWalk' } });
    for (const invalid of [
      { ...pedestrianScenario(), tickMs: 20 },
      { ...pedestrianScenario(), events: [{ atMs: 10, set: { 'PedestrianCrossing.PedRequest': true } }] },
      { ...pedestrianScenario(), events: [{ atMs: 10, set: { 'PedestrianCrossing.PedRequestAlias': true } }] },
    ]) expect(() => compileScenario(invalid, pedestrianDebugMap())).toThrow();
    const first = await runScenario(compiled, new Uint8Array([1]), new PedestrianPort());
    const second = await runScenario(compiled, new Uint8Array([1]), new PedestrianPort());
    expect(second).toEqual(first);
    expect(first.trace.map((sample) => sample.plant)).toEqual(expect.arrayContaining([
      { kind: 'pedestrian-v1', requestInput: false, phaseAfterTick: 'approaching' },
      { kind: 'pedestrian-v1', requestInput: true, phaseAfterTick: 'waiting' },
      { kind: 'pedestrian-v1', requestInput: true, phaseAfterTick: 'crossing' },
      { kind: 'pedestrian-v1', requestInput: false, phaseAfterTick: 'cleared' },
    ]));
  });
  it('compiles only fixed tank-v1 signals, reserves both sensors, and closes the deterministic level loop', async () => {
    const compiled = compileScenario(tankScenario(), tankDebugMap());
    expect(compiled.plant).toMatchObject({ kind: 'tank-v1', pump: { signal: 'TankLevel.Pump' }, levelLow: { signal: 'TankLevel.LevelLow' }, levelHigh: { signal: 'TankLevel.LevelHigh' } });
    expect(Object.isFrozen(compiled.plant)).toBe(true);
    for (const invalid of [
      { ...tankScenario(), plant: 'unknown' }, { ...tankScenario(), tickMs: 20 },
      { ...tankScenario(), events: [{ atMs: 0, set: { 'TankLevel.LevelLow': true } }] },
      { ...tankScenario(), events: [{ atMs: 0, set: { 'TankLevel.LevelHighAlias': true } }] },
    ]) expect(() => compileScenario(invalid, tankDebugMap())).toThrow();
    for (const mutate of [
      (map: DebugMap) => { map.pou.TankLevel!.vars.LevelHigh!.type = 'INT'; },
      (map: DebugMap) => { map.pou.TankLevel!.vars.Pump!.region = 'IPI'; },
      (map: DebugMap) => { delete map.pou.TankLevel!.vars.LevelLow!.bitOffset; },
    ]) { const map = tankDebugMap(); mutate(map); expect(() => compileScenario(tankScenario(), map)).toThrow(); }
    const first = await runScenario(compiled, new Uint8Array([1]), new TankPort());
    const second = await runScenario(compiled, new Uint8Array([1]), new TankPort());
    expect(second).toEqual(first);
    expect(first.trace).toEqual(expect.arrayContaining([
      expect.objectContaining({ plant: { kind: 'tank-v1', levelLowInput: true, levelHighInput: false, levelPermilleAfterTick: 280 } }),
      expect.objectContaining({ plant: { kind: 'tank-v1', levelLowInput: false, levelHighInput: true, levelPermilleAfterTick: 760 } }),
    ]));
  });
  it('compiles the fixed conveyor mapping and rejects invalid or plant-owned writes', () => {
    const compiled = compileScenario(conveyorScenario(), conveyorDebugMap());
    expect(compiled.plant).toMatchObject({ kind: 'conveyor-v1', beltCommand: { signal: 'Conveyor.BeltCommand' }, jamDetected: { signal: 'Conveyor.JamDetected' } });
    for (const invalid of [
      { ...conveyorScenario(), plant: 'unknown' }, { ...conveyorScenario(), tickMs: 20 },
    ]) expect(() => compileScenario(invalid, conveyorDebugMap())).toThrow();
    for (const signal of ['PartAtClassifier', 'MetalDetected', 'PartAtDiverter', 'JamDetected', 'PartAtClassifierAlias']) expect(() => compileScenario({ ...conveyorScenario(), events: [{ atMs: 0, set: { [`Conveyor.${signal}`]: true } }] }, conveyorDebugMap())).toThrow();
    for (const mutate of [
      (map: DebugMap) => { map.pou.Conveyor!.vars.MetalDetected!.type = 'INT'; },
      (map: DebugMap) => { map.pou.Conveyor!.vars.BeltCommand!.region = 'IPI'; },
      (map: DebugMap) => { delete map.pou.Conveyor!.vars.JamDetected!.bitOffset; },
      (map: DebugMap) => { map.pou.Conveyor!.vars.PartAtDiverter!.bitOffset = 8; },
      (map: DebugMap) => { map.pou.Conveyor!.vars.PartAtClassifier!.addr = 1; },
    ]) { const map = conveyorDebugMap(); mutate(map); expect(() => compileScenario(conveyorScenario(), map)).toThrow(); }
  });

  it('runs conveyor-v1 deterministically through classification and terminal jam', async () => {
    const compiled = compileScenario(conveyorScenario(), conveyorDebugMap());
    const first = await runScenario(compiled, new Uint8Array([1]), new ConveyorPort());
    const second = await runScenario(compiled, new Uint8Array([1]), new ConveyorPort());
    expect(second).toEqual(first);
    expect(first.trace.map((sample) => sample.plant)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'conveyor-v1', partAtClassifierInput: true, metalDetectedInput: true }),
      expect.objectContaining({ kind: 'conveyor-v1', partAtDiverterInput: true, classifiedCountAfterTick: 1 }),
      expect.objectContaining({ kind: 'conveyor-v1', jamDetectedInput: true, classifiedCountAfterTick: 1 }),
    ]));
    expect(first.trace.at(-1)?.plant).toMatchObject({ kind: 'conveyor-v1', jamDetectedInput: true, classifiedCountAfterTick: 1 });
  });

  it('fails closed before publishing a conveyor sample when runtime input, scan, or command read fails', async () => {
    const compiled = compileScenario(conveyorScenario(), conveyorDebugMap());
    const setFailure = new ConveyorPort(); setFailure.setInput = async () => { throw new Error('set failed'); };
    await expect(runScenario(compiled, new Uint8Array([1]), setFailure)).rejects.toThrow('set failed');
    expect(setFailure.calls).toEqual(['forces', 'load', 'reset']);
    const stepFailure = new ConveyorPort(); stepFailure.step = async () => { throw new Error('step failed'); };
    await expect(runScenario(compiled, new Uint8Array([1]), stepFailure)).rejects.toThrow('step failed');
    const readFailure = new ConveyorPort(); readFailure.readOutput = async () => { throw new Error('read failed'); };
    await expect(runScenario(compiled, new Uint8Array([1]), readFailure)).rejects.toThrow('read failed');
  });
  it('compiles only the fixed motor-v1 plant and reserves its sensor location', () => {
    const compiled = compileScenario(motorPlantScenario(), motorPlantDebugMap());
    expect(compiled.plant).toMatchObject({ kind: 'motor-v1', command: { signal: 'MotorPlant.Command' }, atSpeed: { signal: 'MotorPlant.AtSpeed' } });
    expect(Object.isFrozen(compiled.plant)).toBe(true);
    for (const invalid of [
      { ...motorPlantScenario(), plant: 'unknown' },
      { ...motorPlantScenario(), tickMs: 20, durationMs: 40 },
      { ...motorPlantScenario(), events: [{ atMs: 0, set: { 'MotorPlant.AtSpeed': true } }] },
      { ...motorPlantScenario(), events: [{ atMs: 0, set: { 'MotorPlant.AtSpeedAlias': true } }] },
    ]) expect(() => compileScenario(invalid, motorPlantDebugMap())).toThrow();
    expect(() => compileScenario({ ...motorPlantScenario(), expectations: [{ kind: 'ALWAYS', condition: Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`MotorPlant.Output${index}`, true])) }] }, motorPlantDebugMapWithOutputs())).toThrow('observation budget exceeded');
  });

  it('closes the fixed motor-v1 loop deterministically and records plant state', async () => {
    const compiled = compileScenario(motorPlantScenario(), motorPlantDebugMap());
    const first = await runScenario(compiled, new Uint8Array([1]), new MotorPlantPort());
    const second = await runScenario(compiled, new Uint8Array([1]), new MotorPlantPort());
    expect(second).toEqual(first);
    expect(first.trace).toEqual([
      { atMs: 0, outputs: { 'MotorPlant.Command': false, 'MotorPlant.Running': false }, plant: { kind: 'motor-v1', atSpeedInput: false, speedPermilleAfterTick: 0 } },
      { atMs: 10, outputs: { 'MotorPlant.Command': true, 'MotorPlant.Running': false }, plant: { kind: 'motor-v1', atSpeedInput: false, speedPermilleAfterTick: 500 } },
      { atMs: 20, outputs: { 'MotorPlant.Command': true, 'MotorPlant.Running': false }, plant: { kind: 'motor-v1', atSpeedInput: false, speedPermilleAfterTick: 1000 } },
      { atMs: 30, outputs: { 'MotorPlant.Command': true, 'MotorPlant.Running': true }, plant: { kind: 'motor-v1', atSpeedInput: true, speedPermilleAfterTick: 1000 } },
      { atMs: 40, outputs: { 'MotorPlant.Command': false, 'MotorPlant.Running': false }, plant: { kind: 'motor-v1', atSpeedInput: true, speedPermilleAfterTick: 0 } },
    ]);
    expect(first.passed).toBe(true);
  });

  it('fails closed when a motor-v1 runtime operation fails', async () => {
    const compiled = compileScenario(motorPlantScenario(), motorPlantDebugMap());
    const port = new MotorPlantPort();
    port.setInput = async () => { throw new Error('set failed'); };
    await expect(runScenario(compiled, new Uint8Array([1]), port)).rejects.toThrow('set failed');
    expect(port.calls).toEqual(['forces', 'load', 'reset']);
    const stepFailure = new MotorPlantPort();
    stepFailure.step = async () => { throw new Error('step failed'); };
    await expect(runScenario(compiled, new Uint8Array([1]), stepFailure)).rejects.toThrow('step failed');
    expect(stepFailure.calls).toEqual(['forces', 'load', 'reset', 'set:0.2=false', 'set:0.0=false', 'set:0.1=false']);
    const readFailure = new MotorPlantPort();
    readFailure.readOutput = async () => { throw new Error('read failed'); };
    await expect(runScenario(compiled, new Uint8Array([1]), readFailure)).rejects.toThrow('read failed');
    expect(readFailure.calls).toEqual(['forces', 'load', 'reset', 'set:0.2=false', 'set:0.0=false', 'set:0.1=false', 'step:0']);
  });
  it('rejects a strict invalid schema before resolving or running', () => {
    const invalid = [
      {}, { ...scenario(), extra: true }, { ...scenario(), id: '' }, { ...scenario(), tickMs: 0 },
      { ...scenario(), durationMs: 21 }, { ...scenario(), expectations: [] },
      { ...scenario(), events: [{ atMs: 1, set: { 'Motor.Start': true } }] },
      { ...scenario(), events: [{ atMs: 30, set: { 'Motor.Start': true } }] },
      { ...scenario(), events: [{ atMs: 0, set: { Start: true } }] },
      { ...scenario(), events: [{ atMs: 0, set: { 'Motor.Start': true } }, { atMs: 0, set: { 'Motor.Start': false } }] },
      { ...scenario(), events: [{ atMs: 0, set: { 'Motor.Start': true }, extra: true }] },
      { ...scenario(), expectations: [{ kind: 'WITHIN', fromMs: 10, withinMs: 20, condition: { 'Motor.Forward': true } }] },
      { ...scenario(), expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Forward': true }, extra: true }] },
      { ...scenario(), expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Local': true } }] },
      { ...scenario(), expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Word': true } }] },
      { ...scenario(), expectations: [{ kind: 'AT', atMs: 0, condition: { 'Unknown.Forward': true } }] },
    ];
    for (const input of invalid) expect(() => compileScenario(input, debugMap())).toThrow();
    const badBit = debugMap();
    badBit.pou.Motor!.vars.Start!.bitOffset = 8;
    expect(() => compileScenario(scenario(), badBit)).toThrow();
    const outside = debugMap();
    outside.pou.Motor!.vars.Forward!.addr = 0x1001;
    expect(() => compileScenario(scenario(), outside)).toThrow();
    expect(() => compileScenario({ ...scenario(), events: [{ atMs: 0, set: { 'Motor.Forward': true } }] }, debugMap())).toThrow();
    expect(() => compileScenario({ ...scenario(), expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Start': true } }] }, debugMap())).toThrow();
    const noBit = debugMap();
    delete noBit.pou.Motor!.vars.Start!.bitOffset;
    expect(() => compileScenario(scenario(), noBit)).toThrow();
    expect(() => compileScenario({ ...scenario(), events: [{ atMs: 0, set: { 'Motor.Missing': true } }] }, debugMap())).toThrow();
  });

  it('allows an assertion-only deterministic scenario', () => {
    const compiled = compileScenario({
      schemaVersion: 1,
      id: 'static-output',
      tickMs: 10,
      durationMs: 10,
      events: [],
      expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Forward': false } }],
    }, debugMap());

    expect(compiled.events).toEqual([]);
  });

  it('accepts only plain, own-data JSON objects without invoking getters', () => {
    class ScenarioInput { constructor() { Object.assign(this, scenario()); } }
    expect(() => compileScenario(new ScenarioInput(), debugMap())).toThrow();
    expect(() => compileScenario(Object.create(scenario()), debugMap())).toThrow();
    let accessed = false;
    const getter = scenario();
    Object.defineProperty(getter, 'schemaVersion', { enumerable: true, get: () => { accessed = true; return 1; } });
    expect(() => compileScenario(getter, debugMap())).toThrow();
    expect(accessed).toBe(false);

    expect(() => compileScenario({ ...scenario(), events: new Array(1) }, debugMap())).toThrow();
    expect(() => compileScenario({ ...scenario(), expectations: new Array(1) }, debugMap())).toThrow();
    const eventGetter = [{ atMs: 0, set: { 'Motor.Start': true } }];
    Object.defineProperty(eventGetter, '0', { enumerable: true, get: () => { accessed = true; return {}; } });
    expect(() => compileScenario({ ...scenario(), events: eventGetter }, debugMap())).toThrow();
    expect(accessed).toBe(false);
  });

  it('bounds unique output storage and repeated assertion work before runtime access', () => {
    const outputMap = debugMapWithOutputs(65);
    const sixtyFour = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`Motor.Output${index}`, true]));
    expect(() => compileScenario({ ...scenario(), expectations: [
      { kind: 'ALWAYS', condition: sixtyFour },
      { kind: 'ALWAYS', condition: { 'Motor.Output64': true } },
    ] }, outputMap)).toThrow();
    const repeatedMap = debugMapWithOutputs(64);
    expect(() => compileScenario({
      ...scenario(), durationMs: 990,
      expectations: Array.from({ length: 256 }, () => ({ kind: 'ALWAYS', condition: sixtyFour })),
    }, repeatedMap)).toThrow();
  });

  it('resolves only root BOOL IPI events and BOOL OPI conditions, including bit siblings', () => {
    const compiled = compileScenario({
      ...scenario(),
      events: [{ atMs: 0, set: { 'Motor.Stop': false, 'Motor.Start': true } }],
      expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Forward': true, 'Motor.Reverse': false } }],
    }, debugMap());
    expect(compiled.events[0]?.writes).toEqual([
      { signal: 'Motor.Start', address: 0, bitOffset: 0, value: true },
      { signal: 'Motor.Stop', address: 0, bitOffset: 1, value: false },
    ]);
    expect(compiled.expectations[0]?.reads).toEqual([
      { signal: 'Motor.Forward', address: 0x1000, bitOffset: 0, value: true },
      { signal: 'Motor.Reverse', address: 0x1000, bitOffset: 1, value: false },
    ]);
  });

  it('runs in deterministic order and evaluates inclusive AT/WITHIN/ALWAYS/NEVER windows', async () => {
    const compiled = compileScenario({
      ...scenario(), durationMs: 20,
      expectations: [
        { kind: 'AT', atMs: 10, condition: { 'Motor.Forward': true } },
        { kind: 'WITHIN', fromMs: 0, withinMs: 10, condition: { 'Motor.Forward': true } },
        { kind: 'ALWAYS', condition: { 'Motor.Reverse': false } },
        { kind: 'NEVER', condition: { 'Motor.Forward': true, 'Motor.Reverse': true } },
      ],
    }, debugMap());
    const port = new FakePort();
    const result = await runScenario(compiled, new Uint8Array([1]), port);
    expect(result.passed).toBe(true);
    expect(result.assertions.map((assertion) => assertion.passed)).toEqual([true, true, true, true]);
    expect(result.trace.map((sample) => sample.atMs)).toEqual([0, 10, 20]);
    expect(result.trace.every((sample) => sample.plant === undefined)).toBe(true);
    expect(port.calls).toEqual([
      'forces', 'load', 'reset',
      'set:0.0=true', 'step:0', 'read:4096.0', 'read:4096.1',
      'step:10', 'read:4096.0', 'read:4096.1',
      'step:20', 'read:4096.0', 'read:4096.1',
    ]);
  });

  it('reports the first match/failure and never mutates a runtime with active forces', async () => {
    const compiled = compileScenario(scenario({ expectations: [
      { kind: 'WITHIN', fromMs: 10, withinMs: 10, condition: { 'Motor.Forward': true } },
      { kind: 'ALWAYS', condition: { 'Motor.Forward': true } },
      { kind: 'NEVER', condition: { 'Motor.Forward': true } },
    ] }), debugMap());
    const port = new FakePort();
    port.forced = true;
    await expect(runScenario(compiled, new Uint8Array([1]), port)).rejects.toThrow('active forces');
    expect(port.calls).toEqual(['forces']);

    port.forced = false;
    const result = await runScenario(compiled, new Uint8Array([1]), port);
    expect(result.assertions.map((assertion) => [assertion.passed, assertion.atMs])).toEqual([
      [true, 10], [true, undefined], [false, 0],
    ]);
  });

  it('runs only immutable ASTs emitted by compileScenario', async () => {
    const compiled = compileScenario(scenario(), debugMap());
    const port = new FakePort();
    const forged = { ...compiled, tickMs: 0 };
    await expect(runScenario(forged as typeof compiled, new Uint8Array([1]), port)).rejects.toThrow();
    await expect(runScenario({ ...compiled } as typeof compiled, new Uint8Array([1]), port)).rejects.toThrow();
    expect(port.calls).toEqual([]);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.events)).toBe(true);
    expect(Object.isFrozen(compiled.events[0]!.writes[0]!)).toBe(true);
    expect(() => { (compiled as unknown as { tickMs: number }).tickMs = 0; }).toThrow();
    expect(() => { (compiled.events as unknown as unknown[]).push({}); }).toThrow();
    expect(() => { (compiled.events[0]!.writes[0] as unknown as { value: boolean }).value = false; }).toThrow();
    expect(compiled.tickMs).toBe(10);
    expect(compiled.events[0]!.writes[0]!.value).toBe(true);
    await expect(runScenario(compiled, new Uint8Array([1]), port)).resolves.toMatchObject({ passed: true });
  });

  it('evaluates strong exclusive UNTIL from local deterministic input state', async () => {
    const terminalImmediate = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': true, 'Motor.Stop': true } }] }),
      expectations: [{ kind: 'UNTIL', fromMs: 0, condition: { 'Motor.Forward': true }, until: { 'Motor.Stop': true } }],
    }, debugMap());
    const immediate = await runScenario(terminalImmediate, new Uint8Array([1]), new FakePort());
    expect(immediate.assertions).toEqual([{ kind: 'UNTIL', passed: true, atMs: 0 }]);

    const terminalAllowsConditionDrop = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': true } }, { atMs: 10, set: { 'Motor.Start': false, 'Motor.Stop': true } }] }),
      expectations: [{ kind: 'UNTIL', fromMs: 0, condition: { 'Motor.Forward': true }, until: { 'Motor.Stop': true } }],
    }, debugMap());
    expect(await runScenario(terminalAllowsConditionDrop, new Uint8Array([1]), new FakePort())).toMatchObject({ assertions: [{ kind: 'UNTIL', passed: true, atMs: 10 }] });

    const fallsBeforeTerminal = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': true } }, { atMs: 10, set: { 'Motor.Start': false } }, { atMs: 20, set: { 'Motor.Stop': true } }] }),
      expectations: [{ kind: 'UNTIL', fromMs: 0, condition: { 'Motor.Forward': true }, until: { 'Motor.Stop': true } }],
    }, debugMap());
    expect(await runScenario(fallsBeforeTerminal, new Uint8Array([1]), new FakePort())).toMatchObject({ assertions: [{ kind: 'UNTIL', passed: false, atMs: 10 }] });

    const noTerminal = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': true } }] }),
      expectations: [{ kind: 'UNTIL', fromMs: 0, condition: { 'Motor.Forward': true }, until: { 'Motor.Stop': true } }],
    }, debugMap());
    expect(await runScenario(noTerminal, new Uint8Array([1]), new FakePort())).toMatchObject({ assertions: [{ kind: 'UNTIL', passed: false, atMs: 20 }] });
    expect(Object.isFrozen(noTerminal.expectations[0]!.untilReads)).toBe(true);
  });

  it('tracks UNTIL terminal inputs by physical IPI location, including aliases', async () => {
    const map = debugMapWithStopAlias();
    const compiled = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': true } }, { atMs: 10, set: { 'Motor.StopAlias': true } }] }),
      expectations: [{ kind: 'UNTIL', fromMs: 0, condition: { 'Motor.Forward': true }, until: { 'Motor.Stop': true } }],
    }, map);
    expect(await runScenario(compiled, new Uint8Array([1]), new FakePort())).toMatchObject({ assertions: [{ kind: 'UNTIL', passed: true, atMs: 10 }] });
    expect(() => compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Stop': false, 'Motor.StopAlias': true } }] }),
      expectations: [{ kind: 'AT', atMs: 0, condition: { 'Motor.Forward': false } }],
    }, map)).toThrow();
  });

  it('evaluates RISING and FALLING only on a destination sample in an inclusive window', async () => {
    const edges = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': false } }, { atMs: 10, set: { 'Motor.Start': true } }, { atMs: 20, set: { 'Motor.Start': false } }] }),
      expectations: [
        { kind: 'RISING', fromMs: 10, withinMs: 0, condition: { 'Motor.Forward': true } },
        { kind: 'FALLING', fromMs: 20, withinMs: 0, condition: { 'Motor.Forward': false } },
        { kind: 'RISING', fromMs: 0, withinMs: 0, condition: { 'Motor.Forward': true } },
      ],
    }, debugMap());
    const result = await runScenario(edges, new Uint8Array([1]), new FakePort());
    expect(result.assertions.map(({ kind, passed, atMs }) => ({ kind, passed, atMs }))).toEqual([
      { kind: 'RISING', passed: true, atMs: 10 },
      { kind: 'FALLING', passed: true, atMs: 20 },
      { kind: 'RISING', passed: false, atMs: 0 },
    ]);
  });

  it('evaluates FOR over every sample of its inclusive window', async () => {
    const passing = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': true } }, { atMs: 10, set: { 'Motor.Start': false } }] }),
      expectations: [{ kind: 'FOR', fromMs: 10, forMs: 10, condition: { 'Motor.Forward': false } }],
    }, debugMap());
    expect(passing.expectations[0]).toMatchObject({ kind: 'FOR', fromMs: 10, forMs: 10 });
    expect(Object.isFrozen(passing.expectations[0])).toBe(true);
    expect(await runScenario(passing, new Uint8Array([1]), new FakePort())).toMatchObject({ assertions: [{ kind: 'FOR', passed: true, atMs: 20 }] });

    const firstFailure = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': false } }, { atMs: 10, set: { 'Motor.Start': true } }] }),
      expectations: [{ kind: 'FOR', fromMs: 0, forMs: 20, condition: { 'Motor.Forward': false } }],
    }, debugMap());
    expect(await runScenario(firstFailure, new Uint8Array([1]), new FakePort())).toMatchObject({ assertions: [{ kind: 'FOR', passed: false, atMs: 10 }] });

    const finalFailure = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': false } }, { atMs: 20, set: { 'Motor.Start': true } }] }),
      expectations: [{ kind: 'FOR', fromMs: 0, forMs: 20, condition: { 'Motor.Forward': false } }],
    }, debugMap());
    expect(await runScenario(finalFailure, new Uint8Array([1]), new FakePort())).toMatchObject({ assertions: [{ kind: 'FOR', passed: false, atMs: 20 }] });

    const point = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': false } }] }),
      expectations: [{ kind: 'FOR', fromMs: 10, forMs: 0, condition: { 'Motor.Forward': false } }],
    }, debugMap());
    expect(await runScenario(point, new Uint8Array([1]), new FakePort())).toMatchObject({ assertions: [{ kind: 'FOR', passed: true, atMs: 10 }] });
  });

  it('evaluates bounded EVENTUALLY in an inclusive window', async () => {
    const passing = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': false } }, { atMs: 10, set: { 'Motor.Start': true } }] }),
      expectations: [{ kind: 'EVENTUALLY', fromMs: 0, withinMs: 20, condition: { 'Motor.Forward': true } }],
    }, debugMap());
    expect(passing.expectations[0]).toMatchObject({ kind: 'EVENTUALLY', fromMs: 0, withinMs: 20 });
    expect(Object.isFrozen(passing.expectations[0])).toBe(true);
    expect(await runScenario(passing, new Uint8Array([1]), new FakePort())).toMatchObject({ assertions: [{ kind: 'EVENTUALLY', passed: true, atMs: 10 }] });

    const failing = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': false } }] }),
      expectations: [{ kind: 'EVENTUALLY', fromMs: 0, withinMs: 20, condition: { 'Motor.Forward': true } }],
    }, debugMap());
    expect(await runScenario(failing, new Uint8Array([1]), new FakePort())).toMatchObject({ assertions: [{ kind: 'EVENTUALLY', passed: false, atMs: 20 }] });

    const point = compileScenario({
      ...scenario({ events: [{ atMs: 0, set: { 'Motor.Start': false } }, { atMs: 10, set: { 'Motor.Start': true } }] }),
      expectations: [{ kind: 'EVENTUALLY', fromMs: 10, withinMs: 0, condition: { 'Motor.Forward': true } }],
    }, debugMap());
    expect(await runScenario(point, new Uint8Array([1]), new FakePort())).toMatchObject({ assertions: [{ kind: 'EVENTUALLY', passed: true, atMs: 10 }] });
  });

  it('rejects invalid temporal kind schemas, regions, values, edge signals, and budgets', () => {
    const invalid = [
      { kind: 'UNTIL', fromMs: 0, condition: { 'Motor.Forward': true }, until: { 'Motor.Forward': true } },
      { kind: 'UNTIL', fromMs: 1, condition: { 'Motor.Forward': true }, until: { 'Motor.Stop': true } },
      { kind: 'UNTIL', fromMs: 0, condition: { 'Motor.Forward': true }, until: { 'Motor.Stop': 'true' } },
      { kind: 'RISING', fromMs: 0, withinMs: 0, condition: { 'Motor.Forward': false } },
      { kind: 'FALLING', fromMs: 0, withinMs: 0, condition: { 'Motor.Forward': true } },
      { kind: 'RISING', fromMs: 10, withinMs: 20, condition: { 'Motor.Forward': true } },
      { kind: 'RISING', fromMs: 0, withinMs: 0, condition: { 'Motor.Forward': true, 'Motor.Reverse': true } },
      { kind: 'RISING', fromMs: 0, withinMs: 0, condition: { 'Motor.Start': true } },
      { kind: 'FALLING', fromMs: 0, withinMs: 0, condition: { 'Motor.Forward': false }, extra: true },
      { kind: 'FOR', fromMs: 0, forMs: 10, condition: { 'Motor.Forward': false }, extra: true },
      { kind: 'FOR', fromMs: 0, condition: { 'Motor.Forward': false } },
      { kind: 'FOR', fromMs: -1, forMs: 10, condition: { 'Motor.Forward': false } },
      { kind: 'FOR', fromMs: 1, forMs: 10, condition: { 'Motor.Forward': false } },
      { kind: 'FOR', fromMs: 10, forMs: -1, condition: { 'Motor.Forward': false } },
      { kind: 'FOR', fromMs: 10, forMs: 1, condition: { 'Motor.Forward': false } },
      { kind: 'FOR', fromMs: 20, forMs: 10, condition: { 'Motor.Forward': false } },
      { kind: 'EVENTUALLY', fromMs: 0, withinMs: 10, condition: { 'Motor.Forward': true }, extra: true },
      { kind: 'EVENTUALLY', fromMs: 0, condition: { 'Motor.Forward': true } },
      { kind: 'EVENTUALLY', fromMs: -1, withinMs: 10, condition: { 'Motor.Forward': true } },
      { kind: 'EVENTUALLY', fromMs: 1, withinMs: 10, condition: { 'Motor.Forward': true } },
      { kind: 'EVENTUALLY', fromMs: 10, withinMs: -1, condition: { 'Motor.Forward': true } },
      { kind: 'EVENTUALLY', fromMs: 10, withinMs: 1, condition: { 'Motor.Forward': true } },
      { kind: 'EVENTUALLY', fromMs: 20, withinMs: 10, condition: { 'Motor.Forward': true } },
      { kind: 'EVENTUALLY', condition: { 'Motor.Forward': true } },
    ];
    for (const expectation of invalid) expect(() => compileScenario(scenario({ expectations: [expectation] }), debugMap())).toThrow();
    const reads = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`Motor.Output${index}`, true]));
    expect(() => compileScenario({ ...scenario(), expectations: [{ kind: 'ALWAYS', condition: reads }, { kind: 'UNTIL', fromMs: 0, condition: { 'Motor.Forward': true }, until: { 'Motor.Stop': true } }] }, debugMapWithOutputs(64))).toThrow();
  });

  it('uses the canonical compiler debug map for explicit hardware-facing signals', async () => {
    const source = `PROGRAM Motor
VAR
  Start AT %IX0.0 : BOOL;
  Stop AT %IX0.1 : BOOL;
  EStop AT %IX0.2 : BOOL;
  Overload AT %IX0.3 : BOOL;
  Running : BOOL := FALSE;
END_VAR
VAR_OUTPUT
  Forward AT %QX0.0 : BOOL;
  Reverse AT %QX0.1 : BOOL;
END_VAR
Running := (Running OR Start) AND NOT Stop AND NOT EStop AND NOT Overload;
Forward := Running;
Reverse := FALSE;
END_PROGRAM`;
    const compiledProgram = compileSingleFileWithTask(source, 'ST', { programName: 'Motor' });
    const map = compiledProgram.debugMap;
    expect(map.pou.Motor?.vars.Start).toMatchObject({ addr: 0, bitOffset: 0 });
    expect(map.pou.Motor?.vars.Stop).toMatchObject({ addr: 0, bitOffset: 1 });
    expect(map.pou.Motor?.vars.Forward).toMatchObject({ addr: 0x1000, bitOffset: 0 });
    expect(map.pou.Motor?.vars.Reverse).toMatchObject({ addr: 0x1000, bitOffset: 1 });

    const test = compileScenario({
      ...scenario(),
      events: [
        { atMs: 0, set: { 'Motor.Start': true, 'Motor.Stop': false, 'Motor.EStop': false, 'Motor.Overload': false } },
        { atMs: 10, set: { 'Motor.Start': false } },
        { atMs: 20, set: { 'Motor.EStop': true } },
      ],
      expectations: [
        { kind: 'AT', atMs: 0, condition: { 'Motor.Forward': true } },
        { kind: 'AT', atMs: 10, condition: { 'Motor.Forward': true } },
        { kind: 'AT', atMs: 20, condition: { 'Motor.Forward': false } },
        { kind: 'NEVER', condition: { 'Motor.Forward': true, 'Motor.Reverse': true } },
      ],
    }, map);
    const port = new FakePort();
    let running = false;
    port.step = async (atMs) => {
      port.calls.push(`step:${atMs}`);
      const safe = !port.inputs.get('0.2') && !port.inputs.get('0.3') && !port.inputs.get('0.1');
      running = (running || port.inputs.get('0.0') === true) && safe;
      port.outputs.set('4096.0', running);
      port.outputs.set('4096.1', false);
    };
    expect((await runScenario(test, compiledProgram.zplcFile, port)).passed).toBe(true);
  });
});
