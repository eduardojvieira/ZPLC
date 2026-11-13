/** I/O addresses of the process image, normalised so that one point has one identity (plan-u2.md, FND-004). */
import type { NormalizedAddress } from './contracts';

const WIDTH_BYTES = { X: 0, B: 1, W: 2, D: 4, L: 8 } as const;
const PATTERN = /^%([IQM])([XBWDL])?(\d+)(?:\.(\d+))?$/i;

/** `%IX0.0` and `%I0.0` give one point; `%IW1` is byte 2, 16 bits wide. Overlap is not modelled. */
export function parseAddress(text: string): NormalizedAddress | undefined {
  const match = PATTERN.exec(text.trim());
  if (!match) return undefined;
  const area = match[1]!.toUpperCase() as NormalizedAddress['area'];
  const size = (match[2]?.toUpperCase() ?? '') as keyof typeof WIDTH_BYTES | '';
  const index = Number(match[3]);
  if (match[4] === undefined) {
    // No bit part: only a sized access (byte, word, double, long) is an address.
    if (size === '' || size === 'X') return undefined;
    const bytes = WIDTH_BYTES[size];
    return { area, byte: index * bytes, width: (bytes * 8) as NormalizedAddress['width'] };
  }
  if (size !== '' && size !== 'X') return undefined;
  const bit = Number(match[4]);
  if (bit > 7) return undefined;
  return { area, byte: index, bit, width: 1 };
}

export function sameAddress(a: NormalizedAddress, b: NormalizedAddress): boolean {
  return a.area === b.area && a.byte === b.byte && a.bit === b.bit && a.width === b.width;
}

/** The canonical written form: `%IX0.0`, `%IB0`, `%IW1`. */
export function addressText(address: NormalizedAddress): string {
  if (address.width === 1) return `%${address.area}X${address.byte}.${address.bit ?? 0}`;
  const size = address.width === 8 ? 'B' : address.width === 16 ? 'W' : address.width === 32 ? 'D' : 'L';
  return `%${address.area}${size}${address.byte / (address.width / 8)}`;
}
