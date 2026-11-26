/**
 * An FBD constant of an unsigned type above the DINT range is written as a typed literal, which the compiler reads as that type: a
 * plain `2147483648` is a DINT literal out of range (CONSTANT_OUT_OF_RANGE).
 */
import { describe, expect, it } from 'bun:test';

import { compileMultiTaskProject } from '../compiler';
import { transpileFBDToST } from './fbdToST';
import type { FBDModel } from '../models/fbd';

function selected(type: string, value: number): FBDModel {
  return {
    name: 'Main',
    variables: {
      local: [
        { name: 'G', type: 'BOOL' },
        { name: 'Result', type },
      ],
      outputs: [],
    },
    blocks: [
      { id: 'g', type: 'input', variableName: 'G', position: { x: 0, y: 0 } },
      { id: 'zero', type: 'constant', dataType: type, value: 0, position: { x: 0, y: 60 } },
      { id: 'big', type: 'constant', dataType: type, value, position: { x: 0, y: 120 } },
      { id: 'pick', type: 'SEL', position: { x: 200, y: 0 } },
      { id: 'sink', type: 'output', variableName: 'Result', position: { x: 400, y: 0 } },
    ],
    connections: [
      { id: 'w1', from: { block: 'g', port: 'OUT' }, to: { block: 'pick', port: 'G' } },
      { id: 'w2', from: { block: 'zero', port: 'OUT' }, to: { block: 'pick', port: 'IN0' } },
      { id: 'w3', from: { block: 'big', port: 'OUT' }, to: { block: 'pick', port: 'IN1' } },
      { id: 'w4', from: { block: 'pick', port: 'OUT' }, to: { block: 'sink', port: 'IN' } },
    ],
  };
}

function compiles(model: FBDModel): unknown[] {
  try {
    compileMultiTaskProject(
      { name: 'P', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main'] }] },
      [{ name: 'main', content: JSON.stringify(model), language: 'FBD', sourceRef: 'src/main.fbd.json' }],
    );
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

describe('an FBD constant of an unsigned type above the DINT range', () => {
  it('a DWORD constant 16#80000000 compiles, as the typed literal DWORD#2147483648', () => {
    const model = selected('DWORD', 0x80000000);
    expect(transpileFBDToST(model).source).toContain('SEL(G, 0, DWORD#2147483648)');
    expect(compiles(model)).toEqual([]);
  });

  it('a UDINT constant 4294967295 compiles', () => {
    expect(compiles(selected('UDINT', 4294967295))).toEqual([]);
  });

  it('a DWORD constant inside the DINT range is written as before, a plain number', () => {
    expect(transpileFBDToST(selected('DWORD', 5)).source).toContain('SEL(G, 0, 5)');
  });
});
