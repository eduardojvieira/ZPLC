import { describe, expect, test } from 'bun:test';
import { deflateSync } from 'node:zlib';

import { decodePng, diffPictures, withinRule } from './compare';

/** A PNG of RGBA pixels (8 bits, filter 0): enough to test the comparison without a library. */
function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4);
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    return Buffer.concat([head, body, Buffer.alloc(4)]); // the checksum is not read
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const grey = (x: number, y: number): [number, number, number, number] => [200 + (x % 3), 200, 200 + (y % 5), 255];
const bump = (x: number, y: number, by: number): [number, number, number, number] => {
  const [r, g, b, a] = grey(x, y);
  return [r + by, g, b, a];
};
const canvas = { x: 10, y: 10, width: 40, height: 40 }; // 1600 px: 0.1 % is 1.6 px, so at most 1 differing pixel

describe('the tolerance of two pictures of one build (UXV-003)', () => {
  const base = png(100, 100, grey);

  test('UXV-003 a picture decodes to its pixels', () => {
    const decoded = decodePng(base);
    expect([decoded.width, decoded.height]).toEqual([100, 100]);
    expect(Array.from(decoded.data.slice(0, 4))).toEqual([200, 200, 200, 255]);
  });

  test('UXV-003 identical pictures are within the rule', () => {
    expect(withinRule(diffPictures(decodePng(base), decodePng(base), [canvas]))).toBe(true);
  });

  test('UXV-003 a pixel outside every canvas that differs by one level breaks the rule', () => {
    const other = png(100, 100, (x, y) => (x === 80 && y === 80 ? bump(x, y, 1) : grey(x, y)));
    const diff = diffPictures(decodePng(base), decodePng(other), [canvas]);
    expect(diff.outside).toBe(1);
    expect(withinRule(diff)).toBe(false);
  });

  test('UXV-003 inside a canvas, one level of difference in a few pixels is within the rule, more is not', () => {
    const near = (n: number) => png(100, 100, (x, y) => (x >= 20 && x < 20 + n && y === 20 ? bump(x, y, 2) : grey(x, y)));
    const one = diffPictures(decodePng(base), decodePng(near(1)), [canvas]);
    expect([one.inside, one.insideMax, one.outside]).toEqual([1, 2, 0]);
    expect(withinRule(one)).toBe(true);
    expect(withinRule(diffPictures(decodePng(base), decodePng(near(2)), [canvas]))).toBe(false); // 2 px of 1600 is over 0.1 %
    const far = png(100, 100, (x, y) => (x === 20 && y === 20 ? bump(x, y, 6) : grey(x, y)));
    expect(withinRule(diffPictures(decodePng(base), decodePng(far), [canvas]))).toBe(false); // 6 levels is over 2
  });

  test('UXV-003 pictures of different sizes are never within the rule', () => {
    expect(withinRule(diffPictures(decodePng(base), decodePng(png(90, 100, grey)), [canvas]))).toBe(false);
  });
});
