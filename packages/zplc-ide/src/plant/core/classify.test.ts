import { describe, expect, it } from 'bun:test';
import { ACCEPTS, heightClassOf, matches, weightClassOf, type Accepts } from './classify';

const item = (o: Partial<Parameters<typeof matches>[1]> = {}) => ({ size: [0.4, 0.3, 0.3] as [number, number, number], massKg: 2, ...o });

describe('item classes', () => {
  it('PRT-006 heightClassOf puts 0.2, 0.3 and 0.4 into short, medium and tall with 50 mm margin', () => {
    expect([0.2, 0.3, 0.4].map(heightClassOf)).toEqual(['short', 'medium', 'tall']);
    expect([0.25, 0.2501, 0.35, 0.3501].map(heightClassOf)).toEqual(['short', 'medium', 'medium', 'tall']);
  });

  it('PRT-006 weightClassOf puts 2 kg light and 5 kg heavy and 3.5 kg light', () => {
    expect([2, 3.5, 3.51, 5].map(weightClassOf)).toEqual(['light', 'light', 'heavy', 'heavy']);
  });

  it('PLT-010 matches follows rule R4-C1 for every Accepts value, a pallet never matches a class, and any matches everything', () => {
    const red = item({ colour: 'red', metal: true, code: 4, size: [0.2, 0.1, 0.2], massKg: 5 });
    const hits: Accepts[] = ['any', 'red', 'metal', 'heavy', 'short', 'code'];
    for (const a of ACCEPTS) expect(matches(a, red, 4)).toBe(hits.includes(a));
    expect(matches('code', red, 5)).toBe(false);
    // no colour: neither red nor blue; no metal flag: plastic; no code: never matches code
    const plain = item();
    expect([matches('red', plain, 0), matches('blue', plain, 0), matches('plastic', plain, 0), matches('metal', plain, 0)]).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(matches('code', plain, 0)).toBe(false);
    const pallet = { ...item({ massKg: 25 }), pallet: true };
    for (const a of ACCEPTS) expect(matches(a, pallet, 0)).toBe(a === 'any');
  });

  it('PLT-006 matches is pure: the same frozen input gives the same answer every call and is never changed', () => {
    const frozen = Object.freeze({
      ...item({ colour: 'blue', code: 2 }),
      size: Object.freeze([0.4, 0.4, 0.3]) as unknown as [number, number, number],
    });
    for (const a of ACCEPTS) expect(matches(a, frozen, 2)).toBe(matches(a, frozen, 2));
    expect(frozen.colour).toBe('blue');
  });
});
