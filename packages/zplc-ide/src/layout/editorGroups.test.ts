import { describe, expect, it } from 'bun:test';
import { ONE_GROUP, clampRatio, closeView, moveToOther, reconcile, shownGroups } from './editorGroups';

describe('editor groups (SHL-006)', () => {
  it('SHL-006 moving the only view of the first group to the second leaves one group', () => {
    expect(moveToOther(ONE_GROUP, 'a', ['a'])).toEqual(ONE_GROUP);
    const split = moveToOther(ONE_GROUP, 'b', ['a', 'b']);
    expect(split).toMatchObject({ second: ['b'], activeSecond: 'b', focused: 'second' });
    expect(moveToOther(split, 'a', ['a', 'b'])).toEqual(ONE_GROUP);
  });

  it('SHL-006 a view moves to the other group and back', () => {
    const split = moveToOther(ONE_GROUP, 'b', ['a', 'b', 'c']);
    expect(moveToOther(split, 'c', ['a', 'b', 'c']).second).toEqual(['b', 'c']);
    const back = moveToOther(moveToOther(split, 'c', ['a', 'b', 'c']), 'b', ['a', 'b', 'c']);
    expect(back).toMatchObject({ second: ['c'], activeSecond: 'c', focused: 'first' });
  });

  it('SHL-006 closing the last view of the second group closes the split', () => {
    const split = moveToOther(ONE_GROUP, 'b', ['a', 'b']);
    expect(closeView(split, 'b')).toEqual(ONE_GROUP);
    expect(closeView(split, 'a')).toEqual(split);
    const two = moveToOther(split, 'c', ['a', 'b', 'c']);
    expect(closeView(two, 'c')).toMatchObject({ second: ['b'], activeSecond: 'b' });
  });

  it('SHL-006 below the compact width two groups show as one, and widening the window brings the split back', () => {
    const split = moveToOther(ONE_GROUP, 'b', ['a', 'b']);
    expect(shownGroups(split, false)).toBe(2);
    expect(shownGroups(split, true)).toBe(1);
    expect(split.second).toEqual(['b']);
    expect(shownGroups(split, false)).toBe(2);
    expect(shownGroups(ONE_GROUP, false)).toBe(1);
  });

  it('SHL-006 views that are no longer open leave the second group, and the ratio stays between 0.2 and 0.8', () => {
    const split = moveToOther(moveToOther(ONE_GROUP, 'b', ['a', 'b', 'c']), 'c', ['a', 'b', 'c']);
    expect(reconcile(split, ['a', 'b'])).toMatchObject({ second: ['b'], activeSecond: 'b' });
    expect(reconcile(split, ['a'])).toEqual(ONE_GROUP);
    expect(reconcile(split, ['b', 'c'])).toEqual(ONE_GROUP);
    expect(clampRatio(0.05)).toBe(0.2);
    expect(clampRatio(0.95)).toBe(0.8);
    expect(clampRatio(Number.NaN)).toBe(0.5);
  });
});
