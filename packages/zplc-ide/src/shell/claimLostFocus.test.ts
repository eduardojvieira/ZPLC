import { describe, expect, it } from 'bun:test';
import { claimLostFocus } from './claimLostFocus';

/** A stand-in for the elements: only identity and a `focus()` that records the call matter. */
const element = () => { const calls: string[] = []; return { calls, focus: () => { calls.push('focus'); } }; };

describe('the focus that a closed screen leaves behind (UX-025, UX-028)', () => {
  it('goes to the named region when the page body has it, so a keyboard or screen reader user is not sent back to the top', () => {
    const body = element(); const region = element();
    expect(claimLostFocus(region, body, body)).toBe(true);
    expect(region.calls).toEqual(['focus']);
  });

  it('also goes there when nothing has the focus at all', () => {
    const region = element();
    expect(claimLostFocus(region, null, element())).toBe(true);
    expect(region.calls).toEqual(['focus']);
  });

  it('leaves a control the person already reached where it is', () => {
    const body = element(); const region = element(); const control = element();
    expect(claimLostFocus(region, control, body)).toBe(false);
    expect(region.calls).toEqual([]);
  });

  it('does nothing when there is no region to take the focus', () => {
    const body = element();
    expect(claimLostFocus(null, body, body)).toBe(false);
  });
});
