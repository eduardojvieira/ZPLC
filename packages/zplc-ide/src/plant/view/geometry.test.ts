import { describe, expect, it } from 'bun:test';
import { itemSkin, palletBoxes } from './geometry';

describe('item skins', () => {
  it('a metal item is metal; every other skin is unchanged', () => {
    expect(itemSkin({ metal: true })).toBe('metal');
    expect(itemSkin({ kind: 'box' })).toBe('cardboard');
    expect(itemSkin({ colour: 'red' })).toBe('plastic');
    expect(itemSkin({ tag: 'lid' })).toBe('plastic');
    expect(itemSkin({ tag: 'base' })).toBe('plastic');
    expect(itemSkin({ tag: 'crate' })).toBe('cardboard');
    expect(itemSkin({ kind: 'pallet' })).toBe('cardboard');
  });

  it('a pallet is five deck boards and three runners that fill its box', () => {
    const boxes = palletBoxes([1.2, 0.15, 0.8]);
    expect(boxes).toHaveLength(8);
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const b of boxes)
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a]!, b.centre[a]! - b.size[a]! / 2);
        hi[a] = Math.max(hi[a]!, b.centre[a]! + b.size[a]! / 2);
      }
    [1.2, 0.15, 0.8].forEach((s, a) => {
      expect(lo[a]).toBeCloseTo(-s / 2, 9);
      expect(hi[a]).toBeCloseTo(s / 2, 9);
    });
  });
});
