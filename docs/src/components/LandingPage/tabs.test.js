// bun test docs/src/components/LandingPage
import { describe, expect, it } from 'bun:test';

import { nextTab } from './tabs';

describe('the keyboard of the language tabs', () => {
  it('steps with both arrow axes and wraps around at the ends', () => {
    expect([nextTab('ArrowDown', 0, 5), nextTab('ArrowRight', 0, 5)]).toEqual([1, 1]);
    expect([nextTab('ArrowUp', 0, 5), nextTab('ArrowLeft', 0, 5)]).toEqual([4, 4]);
    expect(nextTab('ArrowDown', 4, 5)).toBe(0);
  });

  it('goes to the first and the last tab with Home and End, and ignores any other key', () => {
    expect([nextTab('Home', 3, 5), nextTab('End', 1, 5)]).toEqual([0, 4]);
    expect([nextTab('Enter', 2, 5), nextTab('a', 2, 5)]).toEqual([undefined, undefined]);
  });
});
