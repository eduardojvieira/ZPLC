import { describe, expect, it } from 'bun:test';

import { compileMultiTaskProject } from '@zplc/compiler';
import type { DebugMap } from '../compiler';
import { inputRange } from './declaredInputs';
import { listDeclaredOutputs, listIoMap, outputAddressLabel } from './ioMap';

const SOURCE = `PROGRAM Plant
VAR_INPUT
  SensorWest AT %IX0.3 : BOOL;
  Setpoint AT %IW2 : INT;
END_VAR
VAR_OUTPUT
  Beacon AT %QX0.5 : BOOL;
  Level AT %QW2 : INT;
  Dose AT %QD2 : REAL;
  Internal : BOOL;
END_VAR
VAR
  Counter : DINT;
END_VAR
Beacon := SensorWest;
Level := Setpoint;
Counter := Counter + 1;
END_PROGRAM
`;

/** A debug map from the real compiler, so that the listing is exercised on what Studio really receives. */
function compiled(): DebugMap {
  const project = {
    name: 't',
    version: '1',
    tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Plant'] }],
  } as never;
  return compileMultiTaskProject(project, [{ name: 'Plant', content: SOURCE, language: 'ST', sourceRef: 'src/Plant.st' } as never])
    .debugMap as unknown as DebugMap;
}

describe('the I/O map of a program (LRN-017, IDE-024)', () => {
  it("lists every output mapped to the output image, whatever its name, and no variable that is only the program's own", () => {
    const outputs = listDeclaredOutputs(compiled());
    expect(outputs.map((output) => output.name).sort()).toEqual(['Beacon', 'Dose', 'Level']);
    expect(outputs.find((output) => output.name === 'Beacon')).toMatchObject({ path: 'Plant.Beacon', type: 'BOOL', bitOffset: 5, size: 1 });
    expect(outputs.find((output) => output.name === 'Level')).toMatchObject({ type: 'INT', size: 2 });
    expect(outputs.find((output) => output.name === 'Dose')).toMatchObject({ type: 'REAL', size: 4 });
  });

  it('names the direct address of an output as the program wrote it', () => {
    const outputs = listDeclaredOutputs(compiled());
    const label = (name: string) => outputAddressLabel(outputs.find((output) => output.name === name)!);
    expect(label('Beacon')).toBe('%QX0.5');
    expect(label('Level')).toBe('%QW2');
    expect(label('Dose')).toBe('%QD2');
  });

  it('is the inputs and the outputs of one map, in the order of the map, and empty without a map', () => {
    const map = listIoMap(compiled());
    expect(map.inputs.map((input) => input.name)).toEqual(['SensorWest', 'Setpoint']);
    expect(map.outputs.map((output) => output.name).sort()).toEqual(['Beacon', 'Dose', 'Level']);
    expect(listIoMap(null)).toEqual({ inputs: [], outputs: [] });
  });
});

describe('the range of an input that has a slider (LRN-017)', () => {
  const input = (type: string) => ({
    path: 'P.X',
    pou: 'P',
    name: 'X',
    type,
    region: 'IPI' as const,
    address: 0,
    size: 2,
    origin: 'mapped' as const,
  });
  it('comes from the type for the integers up to 16 bits, and there is none for the rest', () => {
    expect(inputRange(input('INT'))).toEqual({ min: -32768, max: 32767 });
    expect(inputRange(input('BYTE'))).toEqual({ min: 0, max: 255 });
    expect(inputRange(input('SINT'))).toEqual({ min: -128, max: 127 });
    expect(inputRange(input('WORD'))).toEqual({ min: 0, max: 65535 });
    for (const type of ['BOOL', 'DINT', 'DWORD', 'REAL', 'TIME', 'LINT', 'LREAL']) expect(inputRange(input(type))).toBeNull();
  });
});
