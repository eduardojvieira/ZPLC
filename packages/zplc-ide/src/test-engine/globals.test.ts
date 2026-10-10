import { describe, expect, it } from 'bun:test';

import { compileMultiTaskProject, type DebugMap } from '../compiler';
import { compileScenario, findSignalVariable } from './index';

// A global is one variable that every program sees, declared in whichever file of the project. The debug map lists
// it once, in the POU of its file, so a scenario signal that names it has to be looked for there (CMP-042).

const project = () => compileMultiTaskProject(
  {
    name: 'Globals', version: '1.0.0',
    tasks: [
      { name: 'GateTask', trigger: 'cyclic', interval_ms: 10, priority: 0, programs: ['Gate.st'] },
      { name: 'LampTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Lamp.st'] },
    ],
  },
  [
    {
      name: 'Gate.st', language: 'ST', sourceRef: 'src/Gate.st',
      content: 'PROGRAM Gate\nVAR_INPUT go AT %IX0.0 : BOOL; END_VAR\nVAR_OUTPUT open AT %QX0.0 : BOOL; END_VAR\n  open := go AND Enabled;\n  Alarm := NOT Enabled;\nEND_PROGRAM\n',
    },
    {
      name: 'Lamp.st', language: 'ST', sourceRef: 'src/Lamp.st',
      content: 'PROGRAM Lamp\nVAR_OUTPUT lit AT %QX0.2 : BOOL; END_VAR\n  lit := Alarm;\nEND_PROGRAM\n',
    },
    {
      name: 'globals.st', language: 'ST', sourceRef: 'src/globals.st',
      content: 'VAR_GLOBAL\n  Enabled AT %IX0.1 : BOOL;\n  Alarm AT %QX0.1 : BOOL;\n  Scratch : BOOL;\nEND_VAR\n',
    },
  ],
).debugMap;

const scenario = (events: Array<Record<string, unknown>>, expectations: Array<Record<string, unknown>>) => ({
  schemaVersion: 1, id: 'globals', tickMs: 10, durationMs: 30, events, expectations,
});

describe('scenario signals that name a global (CMP-042)', () => {
  it('lists the global once, in the POU of the file that declares it, marked as a global', () => {
    const map = project();
    const lists = Object.entries(map.pou).filter(([, pou]) => pou.vars.Enabled !== undefined).map(([name]) => name);
    expect(lists).toEqual(['globals.st']);
    expect(map.pou['globals.st']!.vars.Enabled).toMatchObject({ addr: 0, bitOffset: 1, region: 'IPI', scope: 'global' });
    expect(map.pou.Gate!.vars.go!.scope).toBeUndefined();
  });

  it('resolves Program.Global, for any program, to the address the map gives the global', () => {
    const map = project();
    const test = compileScenario(scenario(
      [{ atMs: 0, set: { 'Gate.go': true, 'Gate.Enabled': true } }],
      [{ kind: 'AT', atMs: 10, condition: { 'Gate.open': true, 'Gate.Alarm': false, 'Lamp.lit': false } }],
    ), map);
    expect(test.events[0]!.writes.map(({ signal, address, bitOffset }) => ({ signal, address, bitOffset }))).toEqual([
      { signal: 'Gate.Enabled', address: 0, bitOffset: 1 },
      { signal: 'Gate.go', address: 0, bitOffset: 0 },
    ]);
    // Alarm is declared in globals.st and read as seen from Gate and from Lamp: one location
    const reads = test.expectations[0]!.reads;
    expect(reads.find((read) => read.signal === 'Gate.Alarm')).toMatchObject({ address: 0x1000, bitOffset: 1 });
    const fromLamp = compileScenario(scenario([], [{ kind: 'AT', atMs: 10, condition: { 'Lamp.Alarm': false } }]), map);
    expect(fromLamp.expectations[0]!.reads[0]).toMatchObject({ signal: 'Lamp.Alarm', address: 0x1000, bitOffset: 1 });
  });

  it('resolves the name of a global alone, as seen from the first program', () => {
    const test = compileScenario(scenario(
      [{ atMs: 0, set: { Enabled: true } }],
      [{ kind: 'AT', atMs: 10, condition: { Alarm: false } }],
    ), project());
    expect(test.events[0]!.writes[0]).toMatchObject({ signal: 'Gate.Enabled', address: 0, bitOffset: 1, value: true });
    expect(test.expectations[0]!.reads[0]).toMatchObject({ signal: 'Gate.Alarm', address: 0x1000, bitOffset: 1, value: false });
  });

  it('is one location whichever way it is named: two names that disagree on it are refused', () => {
    const expectations = [{ kind: 'AT', atMs: 0, condition: { 'Gate.open': true } }];
    expect(() => compileScenario(scenario([{ atMs: 0, set: { 'Gate.Enabled': true, Enabled: false } }], expectations), project())).toThrow(/conflicting event for IPI location/);
    expect(() => compileScenario(scenario([{ atMs: 0, set: { 'Gate.Enabled': true, Lamp_Alias: true } }], expectations), project())).toThrow(/unknown signal/);
    expect(compileScenario(scenario([{ atMs: 0, set: { 'Gate.Enabled': true, Enabled: true } }], expectations), project()).events[0]!.writes).toHaveLength(2);
  });

  it('does not make a variable of another program, or a global that does not exist, a signal', () => {
    const map = project();
    // lit belongs to Lamp: Gate does not see it
    expect(() => compileScenario(scenario([], [{ kind: 'AT', atMs: 10, condition: { 'Gate.lit': false } }]), map)).toThrow(/unknown signal Gate.lit/);
    expect(() => compileScenario(scenario([], [{ kind: 'AT', atMs: 10, condition: { lit: false } }]), map)).toThrow(/unknown signal lit/);
    expect(() => compileScenario(scenario([], [{ kind: 'AT', atMs: 10, condition: { 'Gate.Missing': false } }]), map)).toThrow(/unknown signal/);
    // a program that does not exist
    expect(() => compileScenario(scenario([], [{ kind: 'AT', atMs: 10, condition: { 'Nobody.Alarm': false } }]), map)).toThrow(/unknown signal/);
    // a global that is not on the process image is still not a signal of one
    expect(() => compileScenario(scenario([{ atMs: 0, set: { 'Gate.Scratch': true } }], [{ kind: 'AT', atMs: 10, condition: { 'Gate.open': true } }]), map)).toThrow(/BOOL IPI signal/);
  });

  it('is answered by the helper the safety check shares, for the same names', () => {
    const map = project();
    expect(findSignalVariable(map, 'Gate.Alarm')?.variable).toMatchObject({ addr: 0x1000, bitOffset: 1 });
    expect(findSignalVariable(map, 'Alarm')?.signal).toBe('Gate.Alarm');
    expect(findSignalVariable(map, 'Gate.open')?.variable.addr).toBe(0x1000);
    expect(findSignalVariable(map, 'Gate.lit')).toBeUndefined();
    expect(findSignalVariable(map, 'a.b.c')).toBeUndefined();
  });

  it('keeps a function variable or a block of the library file out of the signals', () => {
    const map: DebugMap = project();
    map.pou['globals.st']!.vars['Fn.x'] = { addr: 0, bitOffset: 2, type: 'BOOL', region: 'IPI', size: 1 };
    expect(findSignalVariable(map, 'Gate.Fn')).toBeUndefined();
    expect(findSignalVariable(map, 'Gate.x')).toBeUndefined();
  });
});
