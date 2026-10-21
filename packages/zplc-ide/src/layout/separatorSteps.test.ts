import { describe, expect, it } from 'bun:test';
import { LARGE_STEP, SMALL_STEP, moveSeparator, withLeadingSize } from './separatorSteps';

// A separator's value is the size, in percent, of the panel before it (WAI-ARIA window splitter).
const base = { now: 50, min: 20, max: 80 } as const;

describe('panel separator keyboard steps (UX-017)', () => {
  it('UX-017 moves by the small step with an arrow along the separator axis and by the large step with Shift', () => {
    expect(moveSeparator({ ...base, orientation: 'horizontal', key: 'ArrowRight', shiftKey: false })).toBe(50 + SMALL_STEP);
    expect(moveSeparator({ ...base, orientation: 'horizontal', key: 'ArrowLeft', shiftKey: false })).toBe(50 - SMALL_STEP);
    expect(moveSeparator({ ...base, orientation: 'horizontal', key: 'ArrowRight', shiftKey: true })).toBe(50 + LARGE_STEP);
    expect(moveSeparator({ ...base, orientation: 'vertical', key: 'ArrowDown', shiftKey: true })).toBe(50 + LARGE_STEP);
    expect(moveSeparator({ ...base, orientation: 'vertical', key: 'ArrowUp', shiftKey: false })).toBe(50 - SMALL_STEP);
    expect(LARGE_STEP).toBeGreaterThan(SMALL_STEP);
  });

  it('UX-017 goes to the limits with Home and End and never past them', () => {
    expect(moveSeparator({ ...base, orientation: 'horizontal', key: 'Home', shiftKey: false })).toBe(20);
    expect(moveSeparator({ ...base, orientation: 'horizontal', key: 'End', shiftKey: false })).toBe(80);
    expect(moveSeparator({ now: 78, min: 20, max: 80, orientation: 'horizontal', key: 'ArrowRight', shiftKey: true })).toBe(80);
    expect(moveSeparator({ now: 22, min: 20, max: 80, orientation: 'vertical', key: 'ArrowUp', shiftKey: true })).toBe(20);
  });

  it('UX-017 ignores a key that does not move this separator, and a value it cannot read', () => {
    expect(moveSeparator({ ...base, orientation: 'horizontal', key: 'ArrowDown', shiftKey: false })).toBeNull();
    expect(moveSeparator({ ...base, orientation: 'vertical', key: 'ArrowLeft', shiftKey: true })).toBeNull();
    expect(moveSeparator({ ...base, orientation: 'vertical', key: 'a', shiftKey: false })).toBeNull();
    expect(moveSeparator({ now: Number.NaN, min: 20, max: 80, orientation: 'vertical', key: 'ArrowDown', shiftKey: false })).toBeNull();
  });

  it('UX-017 gives the difference to the panel after the separator, so that the group still adds up to 100', () => {
    const layout = withLeadingSize({ side: 20, middle: 60, right: 20 }, 'side', 'middle', 35);
    expect(layout).toEqual({ side: 35, middle: 45, right: 20 });
    expect(Object.values(layout ?? {}).reduce((sum, size) => sum + size, 0)).toBe(100);
    expect(withLeadingSize({ side: 20, middle: 80 }, 'side', 'missing', 35)).toBeNull();
  });
});
