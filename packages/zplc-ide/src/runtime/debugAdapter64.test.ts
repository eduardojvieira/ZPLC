// 64-bit integers and LREAL in the watch window (CMP-015): the bytes of the variable are read at their width,
// shown with every digit, and written back as the same 64 bits.
import { describe, expect, it } from 'bun:test';

import { formatDebugValue } from '../hooks/formatDebugValue';
import { describePolledDebugVariable } from '../hooks/debugPollingPaths';
import { bytesToValue, getTypeSize, valueToBytes } from './debugAdapter';
import type { DebugMap } from '../compiler';

function bytes(build: (view: DataView) => void): Uint8Array {
  const out = new Uint8Array(8);
  build(new DataView(out.buffer));
  return out;
}

describe('the size of a 64-bit watch variable', () => {
  it.each(['LINT', 'ULINT', 'LWORD', 'LREAL'] as const)('%s is eight bytes', (type) => {
    expect(getTypeSize(type)).toBe(8);
  });
});

describe('reading a 64-bit value', () => {
  it('reads an LREAL as an IEEE 754 double, not as the REAL of its low word', () => {
    const value = bytesToValue(bytes((view) => view.setFloat64(0, 0.1 + 0.2, true)), 'LREAL');
    expect(value).toBe(0.30000000000000004);
    expect(bytesToValue(bytes((view) => view.setFloat64(0, -1.5e300, true)), 'LREAL')).toBe(-1.5e300);
    expect(bytesToValue(bytes((view) => view.setFloat64(0, Number.POSITIVE_INFINITY, true)), 'LREAL')).toBe(Infinity);
    expect(bytesToValue(bytes((view) => view.setFloat64(0, Number.NaN, true)), 'LREAL')).toBeNaN();
  });

  it('reads a LINT as a number while it is exact as one, and as its decimal text beyond 2^53', () => {
    expect(bytesToValue(bytes((view) => view.setBigInt64(0, -5n, true)), 'LINT')).toBe(-5);
    expect(bytesToValue(bytes((view) => view.setBigInt64(0, 4294967296n, true)), 'LINT')).toBe(4294967296);
    expect(bytesToValue(bytes((view) => view.setBigInt64(0, 9223372036854775807n, true)), 'LINT')).toBe('9223372036854775807');
    expect(bytesToValue(bytes((view) => view.setBigInt64(0, -9223372036854775808n, true)), 'LINT')).toBe('-9223372036854775808');
    expect(bytesToValue(bytes((view) => view.setBigInt64(0, 9007199254740993n, true)), 'LINT')).toBe('9007199254740993');
  });

  it('reads a ULINT and an LWORD as unsigned values', () => {
    expect(bytesToValue(bytes((view) => view.setBigUint64(0, 18446744073709551615n, true)), 'ULINT')).toBe('18446744073709551615');
    expect(bytesToValue(bytes((view) => view.setBigUint64(0, 9223372036854775808n, true)), 'LWORD')).toBe('9223372036854775808');
    expect(bytesToValue(bytes((view) => view.setBigUint64(0, 7n, true)), 'ULINT')).toBe(7);
  });
});

describe('writing a 64-bit value', () => {
  it('writes the 8 bytes of an LREAL', () => {
    const written = valueToBytes(0.1, 'LREAL');
    expect(written).toHaveLength(8);
    expect(new DataView(written.buffer).getFloat64(0, true)).toBe(0.1);
  });

  it('writes a LINT, from a number or from decimal text, with every bit', () => {
    const fromNumber = valueToBytes(-5, 'LINT');
    expect(new DataView(fromNumber.buffer).getBigInt64(0, true)).toBe(-5n);
    const fromText = valueToBytes('9223372036854775807', 'LINT');
    expect(new DataView(fromText.buffer).getBigInt64(0, true)).toBe(9223372036854775807n);
    const unsigned = valueToBytes('18446744073709551615', 'ULINT');
    expect(new DataView(unsigned.buffer).getBigUint64(0, true)).toBe(18446744073709551615n);
  });
});

describe('showing a 64-bit value', () => {
  it('shows every digit of a LINT and a ULINT', () => {
    expect(formatDebugValue('9223372036854775807', 'LINT')).toBe('9223372036854775807');
    expect(formatDebugValue('18446744073709551615', 'ULINT')).toBe('18446744073709551615');
    expect(formatDebugValue(-42, 'LINT')).toBe('-42');
  });

  it('shows an LWORD as 16 hexadecimal digits', () => {
    expect(formatDebugValue('18446744073709551615', 'LWORD')).toBe('16#FFFFFFFFFFFFFFFF');
    expect(formatDebugValue(255, 'LWORD')).toBe('16#00000000000000FF');
  });

  it('shows an LREAL with the digits that tell it from its neighbour', () => {
    expect(formatDebugValue(0.1 + 0.2, 'LREAL')).toBe('0.30000000000000004');
    expect(formatDebugValue(3, 'LREAL')).toBe('3.0');
    expect(formatDebugValue(Number.NaN, 'LREAL')).toBe('NaN');
    expect(formatDebugValue(1.5e300, 'LREAL')).toBe('1.5e+300');
  });
});

describe('polling a 64-bit variable', () => {
  const map: DebugMap = {
    version: '1.0.0',
    programName: 'Main',
    compilerVersion: '2.0.0',
    generatedAt: '2026-10-10T00:00:00Z',
    pou: {
      Main: {
        type: 'PROGRAM',
        entryPoint: 0,
        vars: {
          Wide: { addr: 0x2000, type: 'LINT', region: 'WORK', size: 8 },
          Big: { addr: 0x2008, type: 'ULINT', region: 'WORK', size: 8 },
          Bits: { addr: 0x2010, type: 'LWORD', region: 'WORK', size: 8 },
          Precise: { addr: 0x2018, type: 'LREAL', region: 'WORK', size: 8 },
          Single: { addr: 0x2020, type: 'REAL', region: 'WORK', size: 4 },
        },
        sourceMap: [],
        breakpoints: [],
      },
    },
    memoryLayout: {
      ipiBase: 0, ipiSize: 0x1000, opiBase: 0x1000, opiSize: 0x1000, workBase: 0x2000, workSize: 0x2000,
      retainBase: 0x4000, retainSize: 0x1000, codeBase: 0x5000, codeSize: 128,
    },
  };

  it.each([['Wide', 'LINT'], ['Big', 'ULINT'], ['Bits', 'LWORD'], ['Precise', 'LREAL'], ['Single', 'REAL']] as const)(
    '%s is polled as %s, at its own width',
    (name, type) => {
      expect(describePolledDebugVariable(map, name)?.type).toBe(type);
    },
  );
});
