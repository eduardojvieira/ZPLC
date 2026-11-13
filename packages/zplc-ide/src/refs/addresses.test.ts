import { describe, expect, test } from 'bun:test';
import { addressText, parseAddress, sameAddress } from './addresses';

const point = (text: string) => {
  const address = parseAddress(text);
  if (!address) throw new Error(`not an address: ${text}`);
  return address;
};

describe('addresses', () => {
  test('FND-004 %IX0.0 and %I0.0 are the same point', () => {
    expect(sameAddress(point('%IX0.0'), point('%I0.0'))).toBe(true);
    expect(sameAddress(point('%ix3.7'), point('%I3.7'))).toBe(true);
    expect(sameAddress(point('%IX0.0'), point('%IX0.1'))).toBe(false);
    expect(addressText(point('%I0.0'))).toBe('%IX0.0');
  });

  test('FND-004 %IW1 is byte 2 of the input image and not %IX1.0', () => {
    expect(point('%IW1')).toEqual({ area: 'I', byte: 2, width: 16 });
    expect(point('%QD1')).toEqual({ area: 'Q', byte: 4, width: 32 });
    expect(point('%ML1')).toEqual({ area: 'M', byte: 8, width: 64 });
    expect(sameAddress(point('%IW1'), point('%IX1.0'))).toBe(false);
    expect(addressText(point('%IW1'))).toBe('%IW1');
  });

  test('FND-004 an output is not an input and %IB0 is not %IX0.0', () => {
    expect(sameAddress(point('%Q0.0'), point('%I0.0'))).toBe(false);
    expect(sameAddress(point('%IB0'), point('%IX0.0'))).toBe(false);
    expect(sameAddress(point('%IB0'), point('%IB0'))).toBe(true);
  });

  test('FND-004 a malformed address is refused', () => {
    for (const text of ['%X0', '%I', '%IW-1', '', 'IX0.0', '%IX0', '%IB0.1', '%IX0.8', '%IW1.0', '%I0'])
      expect(parseAddress(text)).toBeUndefined();
  });
});
