import { describe, expect, it } from 'bun:test';

import { bytesToHex } from './debugAdapter';

describe('bytesToHex', () => {
  it('encodes a byte array as uppercase hex without separators', () => {
    expect(bytesToHex(new Uint8Array([0x00, 0x2a, 0xff]))).toBe('002AFF');
  });
});
