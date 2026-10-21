import { describe, expect, it } from 'bun:test';

import { compileMultiTaskProject } from '@zplc/compiler';
import type { DebugMap } from '../compiler';
import { INPUT_TAG, decodeInput, inputReadPlan, inputWrite, listDeclaredInputs, type DeclaredInput } from './declaredInputs';

const SOURCE = `PROGRAM Plant
VAR_INPUT
  SensorWest AT %IX0.3 : BOOL;
  Setpoint AT %IW2 : INT;
  Enable : BOOL;
  Gain : REAL;
END_VAR
VAR_OUTPUT
  Lamp AT %QX0.0 : BOOL;
END_VAR
VAR
  Counter : DINT;
  Raw AT %IB8 : BYTE;
END_VAR
Lamp := SensorWest AND Enable;
Counter := Counter + 1;
END_PROGRAM
`;

/** A debug map from the real compiler, so that the listing is exercised on what Studio really receives. */
function compiled(source = SOURCE): DebugMap {
  const project = {
    name: 't',
    version: '1',
    tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Plant'] }],
  } as never;
  return compileMultiTaskProject(project, [{ name: 'Plant', content: source, language: 'ST', sourceRef: 'src/Plant.st' } as never])
    .debugMap as unknown as DebugMap;
}

const named = (inputs: DeclaredInput[]) => inputs.map((input) => input.name).sort();

describe('the declared inputs of a program (IDE-024)', () => {
  it('lists every input mapped to the input image, whatever its name, with its address, bit and type', () => {
    const inputs = listDeclaredInputs(compiled());
    expect(named(inputs)).toEqual(['Raw', 'SensorWest', 'Setpoint']);
    const west = inputs.find((input) => input.name === 'SensorWest')!;
    expect(west).toMatchObject({ pou: 'Plant', path: 'Plant.SensorWest', type: 'BOOL', address: 0, bitOffset: 3, origin: 'mapped' });
    const setpoint = inputs.find((input) => input.name === 'Setpoint')!;
    expect(setpoint).toMatchObject({ type: 'INT', address: 4, size: 2, origin: 'mapped' });
    expect(inputs.every((input) => input.region === 'IPI')).toBe(true);
  });

  it('lists the plain program inputs that the build marked, and no other variable of the work memory', () => {
    const map = compiled();
    const vars = map.pou.Plant!.vars;
    // The Tool API marks the VAR_INPUT variables that have no direct address when it builds (toolApi.test.ts proves it).
    for (const name of ['Enable', 'Gain']) vars[name] = { ...vars[name]!, tags: { ...(vars[name]!.tags ?? {}), [INPUT_TAG]: true } };
    const inputs = listDeclaredInputs(map);
    expect(named(inputs)).toEqual(['Enable', 'Gain', 'Raw', 'SensorWest', 'Setpoint']);
    expect(inputs.find((input) => input.name === 'Enable')).toMatchObject({ origin: 'program-input', region: 'WORK', type: 'BOOL' });
    expect(named(inputs)).not.toContain('Counter');
    expect(named(inputs)).not.toContain('Lamp');
  });

  it('lists nothing for a program without inputs or a map that is not there', () => {
    expect(listDeclaredInputs(null)).toEqual([]);
    expect(listDeclaredInputs(compiled('PROGRAM Plant\nVAR Counter : DINT; END_VAR\nCounter := Counter + 1;\nEND_PROGRAM\n'))).toEqual([]);
  });

  it('skips variables that are not scalar (a string, a function block instance)', () => {
    const map = compiled();
    map.pou.Plant!.vars.Label = { addr: 12, type: 'STRING', region: 'IPI', size: 82, capacity: 80 } as never;
    map.pou.Plant!.vars.Timer = { addr: 100, type: 'TON', region: 'IPI', size: 16, children: {} } as never;
    expect(named(listDeclaredInputs(map))).not.toContain('Label');
    expect(named(listDeclaredInputs(map))).not.toContain('Timer');
  });
});

const input = (patch: Partial<DeclaredInput>): DeclaredInput => ({
  path: 'P.X',
  pou: 'P',
  name: 'X',
  type: 'BOOL',
  region: 'IPI',
  address: 0,
  size: 1,
  origin: 'mapped',
  ...patch,
});

describe('writing a declared input (IDE-024)', () => {
  it('changes only the bit of a bit-addressed BOOL, keeping the other bits of the byte as they are', () => {
    const west = input({ bitOffset: 3 });
    expect(inputWrite(west, true, 0b0000_0101)).toEqual({ address: 0, bytes: Uint8Array.of(0b0000_1101) });
    expect(inputWrite(west, false, 0b0000_1111)).toEqual({ address: 0, bytes: Uint8Array.of(0b0000_0111) });
  });

  it('writes a whole-byte BOOL as 0 or 1', () => {
    expect(inputWrite(input({ region: 'WORK', address: 0x2000 }), true)).toEqual({ address: 0x2000, bytes: Uint8Array.of(1) });
    expect(inputWrite(input({ region: 'WORK', address: 0x2000 }), false)).toEqual({ address: 0x2000, bytes: Uint8Array.of(0) });
  });

  it('encodes every numeric type little-endian at its own width', () => {
    expect(inputWrite(input({ type: 'INT', size: 2, address: 4 }), -2).bytes).toEqual(Uint8Array.of(0xfe, 0xff));
    expect(inputWrite(input({ type: 'UINT', size: 2 }), 65_535).bytes).toEqual(Uint8Array.of(0xff, 0xff));
    expect(inputWrite(input({ type: 'DINT', size: 4 }), 0x01020304).bytes).toEqual(Uint8Array.of(4, 3, 2, 1));
    expect(inputWrite(input({ type: 'SINT', size: 1 }), -1).bytes).toEqual(Uint8Array.of(0xff));
    expect(inputWrite(input({ type: 'BYTE', size: 1 }), 200).bytes).toEqual(Uint8Array.of(200));
    expect(Array.from(inputWrite(input({ type: 'REAL', size: 4 }), 1.5).bytes)).toEqual([0, 0, 0xc0, 0x3f]);
    expect(Array.from(inputWrite(input({ type: 'LINT', size: 8 }), 5).bytes)).toEqual([5, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('refuses a value that does not fit the type, or a boolean for a number', () => {
    expect(() => inputWrite(input({ type: 'INT', size: 2 }), 40_000)).toThrow('does not fit');
    expect(() => inputWrite(input({ type: 'USINT', size: 1 }), -1)).toThrow('does not fit');
    expect(() => inputWrite(input({ type: 'INT', size: 2 }), 1.5)).toThrow('whole number');
    expect(() => inputWrite(input({ type: 'REAL', size: 4 }), Number.NaN)).toThrow('number');
    expect(() => inputWrite(input({ type: 'INT', size: 2 }), true as never)).toThrow('number');
  });
});

describe('reading declared inputs back (IDE-024)', () => {
  it('plans the reads as few, bounded ranges and decodes each input from them', () => {
    const inputs = [
      input({ path: 'a', address: 0, bitOffset: 3 }),
      input({ path: 'b', type: 'INT', size: 2, address: 4 }),
      input({ path: 'c', type: 'REAL', size: 4, region: 'WORK', address: 0x2000 }),
      input({ path: 'd', type: 'BYTE', size: 1, address: 0x2000 + 4 }),
    ];
    const plan = inputReadPlan(inputs);
    expect(plan).toEqual([
      { address: 0, length: 6 },
      { address: 0x2000, length: 5 },
    ]);
    const memory = new Uint8Array(0x3000);
    memory[0] = 0b0000_1000;
    memory[4] = 0x34;
    memory[5] = 0x12;
    new DataView(memory.buffer).setFloat32(0x2000, 2.5, true);
    memory[0x2004] = 9;
    const at = (address: number, length: number) => memory.slice(address, address + length);
    expect(decodeInput(inputs[0]!, at)).toBe(true);
    expect(decodeInput(inputs[1]!, at)).toBe(0x1234);
    expect(decodeInput(inputs[2]!, at)).toBe(2.5);
    expect(decodeInput(inputs[3]!, at)).toBe(9);
  });

  it('splits a long span into reads the runtime accepts (at most 64 bytes)', () => {
    const many = Array.from({ length: 40 }, (_, index) => input({ path: `v${index}`, type: 'DINT', size: 4, address: index * 4 }));
    const plan = inputReadPlan(many);
    expect(plan.every((range) => range.length >= 1 && range.length <= 64)).toBe(true);
    expect(plan.reduce((total, range) => total + range.length, 0)).toBe(160);
  });
});
