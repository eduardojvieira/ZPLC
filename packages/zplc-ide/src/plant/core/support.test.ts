import { describe, expect, it } from 'bun:test';
import { createSupportTracker, type SupportItem } from './support';

const BOX: SupportItem['size'] = [0.2, 0.1, 0.2];
const AT_REST: SupportItem['v'] = [0, 0, 0];

// Items are laid out with y up; `bottom` is the underside height.
function item(id: string, x: number, bottom: number, extra: Partial<SupportItem> = {}): SupportItem {
  const size = extra.size ?? BOX;
  return { id, kind: 'item', tag: 'box', size, p: [x, bottom + size[1] / 2, 0], v: AT_REST, ...extra };
}
function pallet(id: string, x: number): SupportItem {
  return { id, kind: 'pallet', size: [0.8, 0.1, 0.8], p: [x, 0.05, 0], v: AT_REST };
}
function run(items: SupportItem[], steps: number) {
  const t = createSupportTracker();
  for (let i = 0; i < steps; i += 1) t.update(items);
  return t;
}

describe('createSupportTracker', () => {
  it('PLT-010 a lid resting on a base for 200 ms counts as assembled once, and removing it later does not uncount it', () => {
    const base = item('base', 0, 0, { tag: 'base' });
    const lid = item('lid', 0.01, 0.1, { tag: 'lid' });
    const t = createSupportTracker();
    for (let i = 0; i < 39; i += 1) t.update([base, lid]);
    expect(t.facts().itemsAssembled).toBe(0);
    t.update([base, lid]); // 40th step: 200 ms at 5 ms
    expect(t.facts().itemsAssembled).toBe(1);
    for (let i = 0; i < 100; i += 1) t.update([base, lid]);
    expect(t.facts().itemsAssembled).toBe(1);
    t.update([base]);
    t.update([base, lid]);
    expect(t.facts().itemsAssembled).toBe(1);
  });

  it('PLT-010 a lid moving over a base does not count', () => {
    const base = item('base', 0, 0, { tag: 'base' });
    const lid = item('lid', 0, 0.1, { tag: 'lid', v: [0.5, 0, 0] });
    expect(run([base, lid], 200).facts().itemsAssembled).toBe(0);
  });

  it('PLT-010 a lid resting on the wrong item does not count, and an interrupted rest restarts the 40 steps', () => {
    const box = item('box', 0, 0, { tag: 'box' });
    const lid = item('lid', 0, 0.1, { tag: 'lid' });
    expect(run([box, lid], 100).facts().itemsAssembled).toBe(0);
    const base = item('base', 0, 0, { tag: 'base' });
    const off = item('lid', 0.5, 0.1, { tag: 'lid' }); // not over the base
    const t = createSupportTracker();
    for (let i = 0; i < 30; i += 1) t.update([base, lid]);
    t.update([base, off]);
    for (let i = 0; i < 39; i += 1) t.update([base, lid]);
    expect(t.facts().itemsAssembled).toBe(0);
    t.update([base, lid]);
    expect(t.facts().itemsAssembled).toBe(1);
  });

  it('PLT-010 five boxes in a 2 by 2 pattern plus one on top give stacked 5 and layers 2 on their pallet', () => {
    const items = [
      pallet('p0', 0),
      item('a', -0.2, 0.1),
      item('b', 0.2, 0.1),
      item('c', -0.2, 0.1, { p: [-0.2, 0.15, 0.3] }),
      item('d', 0.2, 0.1, { p: [0.2, 0.15, 0.3] }),
      item('top', -0.2, 0.2),
    ];
    const f = run(items, 3).facts();
    expect(f['stacked:pallet:0']).toBe(5);
    expect(f['layers:pallet:0']).toBe(2);
  });

  it('PLT-010 a stack that topples loses its facts, and an item removed while stacked is no longer counted', () => {
    const p = pallet('p0', 0);
    const lower = item('lower', 0, 0.1);
    const upper = item('upper', 0, 0.2);
    const t = createSupportTracker();
    t.update([p, lower, upper]);
    expect(t.facts()['layers:pallet:0']).toBe(2);
    t.update([p, lower]); // upper removed
    expect(t.facts()['stacked:pallet:0']).toBe(1);
    expect(t.facts()['layers:pallet:0']).toBe(1);
    t.update([p, item('lower', 0.5, 0.1, { v: [1, 0, 0] }), upper]); // lower toppled away
    expect(t.facts()['stacked:pallet:0']).toBe(0);
    expect(t.facts()['layers:pallet:0']).toBe(0);
  });

  it('PLT-010 layers counts the chain with a gap as broken', () => {
    const items = [pallet('p0', 0), item('lower', 0, 0.1), item('floating', 0, 0.3)];
    const f = run(items, 1).facts();
    expect(f['stacked:pallet:0']).toBe(1);
    expect(f['layers:pallet:0']).toBe(1);
  });

  it('PLT-010 a box carried above a pallet does not count until it rests', () => {
    const p = pallet('p0', 0);
    const t = createSupportTracker();
    t.update([p, item('b', 0, 0.1, { v: [0, -0.3, 0] })]);
    expect(t.facts()['stacked:pallet:0']).toBe(0);
    t.update([p, item('b', 0, 0.1)]);
    expect(t.facts()['stacked:pallet:0']).toBe(1);
    t.update([p, item('b', 0, 0.5)]); // lifted clear
    expect(t.facts()['stacked:pallet:0']).toBe(0);
  });

  it('PLT-010 a box hanging mostly off the pallet edge is not supported', () => {
    const p = pallet('p0', 0);
    expect(run([p, item('edge', 0.45, 0.1)], 1).facts()['stacked:pallet:0']).toBe(0); // 25 % over the pallet
    expect(run([p, item('edge', 0.4, 0.1)], 1).facts()['stacked:pallet:0']).toBe(1); // 50 % over the pallet
  });

  it('PLT-010 two pallets are told apart by creation order index', () => {
    const items = [pallet('p0', -2), pallet('p1', 2), item('a', 2, 0.1), item('b', 2, 0.2)];
    const f = run(items, 1).facts();
    expect(f['stacked:pallet:0']).toBe(0);
    expect(f['stacked:pallet:1']).toBe(2);
    expect(f['layers:pallet:1']).toBe(2);
  });

  it('PLT-008 an item at rest keeps the facts constant for 10 simulated minutes', () => {
    const items = [pallet('p0', 0), item('a', 0, 0.1), item('base', 0.3, 0.1, { tag: 'base' }), item('lid', 0.3, 0.2, { tag: 'lid' })];
    const t = createSupportTracker();
    t.update(items);
    const start = Date.now();
    for (let i = 0; i < 120000; i += 1) t.update(items);
    const f = t.facts();
    expect(f).toEqual({ itemsAssembled: 1, 'stacked:pallet:0': 3, 'layers:pallet:0': 2 });
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('PLT-010 facts is empty of stacked and layers entries when the scene has no pallet', () => {
    const f = run([item('a', 0, 0)], 1).facts();
    expect(Object.keys(f).every((k) => !k.startsWith('stacked') && !k.startsWith('layers'))).toBe(true);
  });

  it('PLT-006 the same inputs give the same facts in the same key order', () => {
    const items = [pallet('p0', 0), pallet('p1', 2), item('a', 0, 0.1)];
    expect(Object.entries(run(items, 3).facts())).toEqual(Object.entries(run(items, 3).facts()));
  });
});
