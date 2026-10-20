import { describe, expect, it } from 'bun:test';

import { compileSingleFileWithTask } from '../compiler';
import type { FBDModel } from '../models/fbd';
import { transpileFBDToST } from './fbdToST';

// A diagram that calls a Modbus client block and an MQTT block of the compiler (LNG-007): the blocks are instances, so the
// generated program declares them, and the program builds.
const read = (id: string, name: string, y: number) => ({ id, type: 'input', variableName: name, position: { x: 0, y } });
const write = (id: string, name: string, y: number) => ({ id, type: 'output', variableName: name, position: { x: 600, y } });
const constant = (id: string, value: string | number, dataType: string, y: number) => ({ id, type: 'constant', value, dataType, position: { x: 0, y } });
const wire = (from: string, fromPort: string, to: string, toPort: string) => ({ id: `${from}_${fromPort}_${to}_${toPort}`, from: { block: from, port: fromPort }, to: { block: to, port: toPort } });

const model: FBDModel = {
  name: 'Main',
  variables: {
    inputs: [{ name: 'Send', type: 'BOOL' }],
    outputs: [{ name: 'Read', type: 'BOOL' }, { name: 'Value', type: 'UINT' }, { name: 'Joined', type: 'BOOL' }],
    local: [],
  },
  blocks: [
    read('send', 'Send', 0),
    constant('host', '127.0.0.1', 'STRING', 100),
    constant('port', 502, 'UINT', 200),
    constant('addr', 8, 'UINT', 300),
    { id: 'rd', type: 'MB_READ_HREG', instanceName: 'Rd', position: { x: 300, y: 0 } },
    { id: 'con', type: 'MQTT_CONNECT', instanceName: 'Con', position: { x: 300, y: 300 } },
    write('read', 'Read', 0),
    write('value', 'Value', 100),
    write('joined', 'Joined', 300),
  ],
  connections: [
    wire('send', 'OUT', 'rd', 'EN'), wire('host', 'OUT', 'rd', 'HOST'), wire('port', 'OUT', 'rd', 'PORT'), wire('addr', 'OUT', 'rd', 'ADDR'),
    wire('rd', 'DONE', 'read', 'IN'), wire('rd', 'VALUE', 'value', 'IN'),
    wire('send', 'OUT', 'con', 'EN'), wire('con', 'DONE', 'joined', 'IN'),
  ],
} as unknown as FBDModel;

describe('communication blocks in a function block diagram (LNG-007)', () => {
  it('LNG-007 declares the instance of a Modbus block and of an MQTT block, and the program builds', () => {
    const translated = transpileFBDToST(model);
    expect(translated.errors).toEqual([]);
    expect(translated.source).toContain('Rd : MB_READ_HREG;');
    expect(translated.source).toContain('Con : MQTT_CONNECT;');
    const built = compileSingleFileWithTask(translated.source, 'ST');
    expect(built.codeSize).toBeGreaterThan(0);
  });

  it('LNG-007 declares an instance once, when the diagram already declares it as a local variable', () => {
    const declared = { ...model, variables: { ...model.variables, local: [{ name: 'Rd', type: 'MB_READ_HREG' }] } } as FBDModel;
    const translated = transpileFBDToST(declared);
    expect(translated.errors).toEqual([]);
    expect(translated.source.match(/\bRd : MB_READ_HREG;/g)).toHaveLength(1);
    expect(() => compileSingleFileWithTask(translated.source, 'ST')).not.toThrow();
  });
});
