import { describe, expect, it } from 'bun:test';

import vectors from '../../../../../tools/contract/plant_vectors.json';
import { MEMORY_MAP } from '../../runtime/debugAdapter';
import type { ExchangeLayout } from '../session/exchange';
import { descriptorsOf, packValues, unpackValues, valueBytes } from './frameCodec';

const hex = (name: string) => {
  const payload = vectors.vectors.find((v) => v.name === name)!.payload;
  return Uint8Array.from(payload.match(/../g) ?? [], (b) => parseInt(b, 16));
};
const slots = [{ type: 'BOOL' }, { type: 'BOOL' }, { type: 'BOOL' }, { type: 'INT' }, { type: 'REAL' }] as const;

describe('frame codec', () => {
  it('packs the values of the contract vector: bitmap, then INT and REAL in descriptor order', () => {
    const frame = hex('plant_frame_request');
    expect(valueBytes(slots)).toBe(7);
    expect(packValues(slots, [true, false, true, -2, 1.5])).toEqual(frame.slice(6));
    expect(unpackValues(slots, frame.slice(6))).toEqual([true, false, true, -2, 1.5]);
  });

  it('packs and unpacks the output vector (two BOOL in one bitmap byte)', () => {
    const out = [{ type: 'BOOL' }, { type: 'BOOL' }] as const;
    const body = hex('plant_frame_response').slice(14);
    expect(packValues(out, [false, true])).toEqual(body);
    expect(unpackValues(out, body)).toEqual([false, true]);
  });

  it('interleaved numeric types keep descriptor order and the INT and REAL ranges', () => {
    const mixed = [{ type: 'REAL' }, { type: 'INT' }, { type: 'BOOL' }, { type: 'INT' }] as const;
    const values = [-3.4028234663852886e38, 32767, true, -32768];
    expect(unpackValues(mixed, packValues(mixed, values))).toEqual(values);
  });

  it('refuses a body of the wrong length, a set padding bit and a non-finite REAL', () => {
    expect(() => unpackValues(slots, new Uint8Array(6))).toThrow(/7 bytes/);
    const padded = hex('plant_frame_request').slice(6);
    padded[0] = 0x25;
    expect(() => unpackValues(slots, padded)).toThrow(/padding/);
    expect(() => packValues(slots, [true, true, true, 0, Number.NaN])).toThrow(/finite/);
  });

  it('builds the entry descriptors from a layout with IPI and OPI offsets', () => {
    const base = MEMORY_MAP.ipi.baseAddress;
    const out = MEMORY_MAP.opi.baseAddress;
    const layout = {
      inputBase: base + 4,
      inputLength: 3,
      outputBase: out + 8,
      outputLength: 1,
      sensors: [
        { name: 'a', byte: 0, width: 1, type: 'BOOL', bit: 5 },
        { name: 'b', byte: 1, width: 2, type: 'INT' },
      ],
      commands: [{ name: 'c', point: 'P.c', byte: 0, width: 1, type: 'BOOL', bit: 0 }],
    } as ExchangeLayout;
    expect(descriptorsOf(layout)).toEqual({
      inputs: [
        { offset: 4, type: 'BOOL', bit: 5 },
        { offset: 5, type: 'INT' },
      ],
      outputs: [{ offset: 8, type: 'BOOL', bit: 0 }],
    });
  });
});
