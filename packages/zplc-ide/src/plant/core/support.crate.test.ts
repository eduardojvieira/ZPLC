import { describe, expect, it } from 'bun:test';
import { createSupportTracker, type SupportItem } from './support';

const OUTER: SupportItem['size'] = [0.8, 0.25, 0.6];
const WORKPIECE: SupportItem['size'] = [0.2, 0.1, 0.2];
const AT_REST: SupportItem['v'] = [0, 0, 0];

const crate = (id: string, x: number, z = 0, extra: Partial<SupportItem> = {}): SupportItem => ({
  id,
  kind: 'item',
  tag: 'crate',
  size: OUTER,
  p: [x, OUTER[1] / 2, z],
  v: AT_REST,
  ...extra,
});
// A workpiece whose centre is at (x, y, z).
const wp = (id: string, x: number, y: number, z: number, extra: Partial<SupportItem> = {}): SupportItem => ({
  id,
  kind: 'item',
  size: WORKPIECE,
  p: [x, y, z],
  v: AT_REST,
  ...extra,
});
const factsOf = (items: SupportItem[]) => {
  const t = createSupportTracker();
  t.update(items);
  return t.facts();
};

describe('loaded:crate support fact', () => {
  it('PLT-010 loaded:crate counts items inside a crate and not items beside it or on its rim', () => {
    const f = factsOf([
      crate('c0', 0),
      wp('in1', -0.2, 0.07, 0),
      wp('in2', 0.2, 0.07, 0.1),
      wp('beside', 0.7, 0.05, 0), // outside the walls
      wp('rim', 0.39, 0.3, 0), // above the rim, centre outside the interior
      crate('c1', 3),
      wp('other', 3, 0.07, 0),
    ]);
    expect(f['loaded:crate:0']).toBe(2);
    expect(f['loaded:crate:1']).toBe(1);
  });

  it('PLT-010 loaded:crate is absent when the scene has no crate', () => {
    const f = factsOf([wp('a', 0, 0.05, 0), { ...wp('p', 1, 0.07, 0), kind: 'pallet' }]);
    expect(Object.keys(f).some((k) => k.startsWith('loaded:'))).toBe(false);
  });

  it('PLT-010 a moving item inside a crate is not counted until it rests', () => {
    const t = createSupportTracker();
    t.update([crate('c0', 0), wp('a', 0, 0.07, 0, { v: [0, -1, 0] })]);
    expect(t.facts()['loaded:crate:0']).toBe(0);
    t.update([crate('c0', 0), wp('a', 0, 0.07, 0, { v: [0, 0.01, 0] })]);
    expect(t.facts()['loaded:crate:0']).toBe(1);
  });

  it('PLT-010 a crate and a pallet inside a crate are never counted as loads', () => {
    const f = factsOf([crate('c0', 0), crate('c1', 0.05, 0, { p: [0.05, 0.4, 0] }), { ...wp('p', 0, 0.07, 0), kind: 'pallet' }]);
    expect(f['loaded:crate:0']).toBe(0);
  });

  it('PLT-010 itemsAssembled, stacked:pallet and layers:pallet are unchanged by the crate additions', () => {
    const pallet: SupportItem = { id: 'p', kind: 'pallet', size: [0.8, 0.1, 0.8], p: [0, 0.05, 0], v: AT_REST };
    const box: SupportItem = { id: 'b', kind: 'item', tag: 'box', size: [0.2, 0.1, 0.2], p: [0, 0.15, 0], v: AT_REST };
    const plain = factsOf([pallet, box]);
    const withCrate = factsOf([pallet, box, crate('c0', 5)]);
    expect(plain).toEqual({ itemsAssembled: 0, 'stacked:pallet:0': 1, 'layers:pallet:0': 1 });
    expect(Object.keys(withCrate)).toEqual([...Object.keys(plain), 'loaded:crate:0']);
    expect(withCrate['stacked:pallet:0']).toBe(1);
  });
});
