import { describe, expect, it } from 'bun:test';
import { navigationTarget } from './keyboard';
import { tabKeyResult } from './tabs';
import { typeahead, type TypeaheadState } from './typeahead';
import { trapTab } from './focusTrap';
import { placeOverlay } from './overlayPosition';

describe('keyboard navigation of a composite widget (UX-001, UX-025)', () => {
  const horizontal = { orientation: 'horizontal' as const };

  it('moves along the axis of the widget and wraps at the ends', () => {
    expect(navigationTarget('ArrowRight', 0, 3, horizontal)).toBe(1);
    expect(navigationTarget('ArrowRight', 2, 3, horizontal)).toBe(0);
    expect(navigationTarget('ArrowLeft', 0, 3, horizontal)).toBe(2);
    expect(navigationTarget('ArrowDown', 0, 3, { orientation: 'vertical' })).toBe(1);
    expect(navigationTarget('ArrowUp', 0, 3, { orientation: 'vertical' })).toBe(2);
  });

  it('ignores the keys of the other axis, so that a horizontal tab list leaves Up and Down to the page', () => {
    expect(navigationTarget('ArrowDown', 0, 3, horizontal)).toBeNull();
    expect(navigationTarget('ArrowLeft', 0, 3, { orientation: 'vertical' })).toBeNull();
    expect(navigationTarget('ArrowDown', 0, 3, { orientation: 'both' })).toBe(1);
    expect(navigationTarget('ArrowRight', 0, 3, { orientation: 'both' })).toBe(1);
  });

  it('goes to the first and the last item with Home and End', () => {
    expect(navigationTarget('Home', 2, 4, horizontal)).toBe(0);
    expect(navigationTarget('End', 0, 4, horizontal)).toBe(3);
  });

  it('does not wrap when looping is off', () => {
    expect(navigationTarget('ArrowRight', 2, 3, { ...horizontal, loop: false })).toBe(2);
    expect(navigationTarget('ArrowLeft', 0, 3, { ...horizontal, loop: false })).toBe(0);
  });

  it('skips a disabled item and returns null when none is enabled', () => {
    const disabled = (index: number) => index === 1;
    expect(navigationTarget('ArrowRight', 0, 3, { ...horizontal, isDisabled: disabled })).toBe(2);
    expect(navigationTarget('Home', 2, 3, { ...horizontal, isDisabled: (index) => index === 0 })).toBe(1);
    expect(navigationTarget('ArrowRight', 0, 2, { ...horizontal, isDisabled: () => true })).toBeNull();
  });

  it('starts at the first or the last enabled item when nothing has focus yet', () => {
    expect(navigationTarget('ArrowDown', -1, 3, { orientation: 'vertical' })).toBe(0);
    expect(navigationTarget('ArrowUp', -1, 3, { orientation: 'vertical' })).toBe(2);
  });

  it('does not answer a key that is not a navigation key, or an empty widget', () => {
    expect(navigationTarget('a', 0, 3, horizontal)).toBeNull();
    expect(navigationTarget('Enter', 0, 3, horizontal)).toBeNull();
    expect(navigationTarget('ArrowRight', 0, 0, horizontal)).toBeNull();
  });
});

describe('tabs keyboard behaviour (UX-001)', () => {
  const tabs = [{}, { disabled: true }, {}];

  it('moves focus and selects with automatic activation', () => {
    expect(tabKeyResult('ArrowRight', 0, tabs, 'horizontal', 'automatic')).toEqual({ focus: 2, select: 2 });
  });

  it('moves focus only with manual activation, and selects on Enter or Space', () => {
    expect(tabKeyResult('ArrowRight', 0, tabs, 'horizontal', 'manual')).toEqual({ focus: 2, select: null });
    expect(tabKeyResult('Enter', 2, tabs, 'horizontal', 'manual')).toEqual({ focus: null, select: 2 });
    expect(tabKeyResult(' ', 0, tabs, 'horizontal', 'manual')).toEqual({ focus: null, select: 0 });
  });

  it('leaves every other key alone', () => {
    expect(tabKeyResult('Tab', 0, tabs, 'horizontal', 'automatic')).toEqual({ focus: null, select: null });
  });
});

describe('type-ahead (UX-001)', () => {
  const labels = ['Compile', 'Copy', 'Debug', 'Download', 'Disabled item'];
  const start: TypeaheadState = { buffer: '', at: 0 };

  it('moves to the next item that starts with the typed letter', () => {
    expect(typeahead(start, 'd', 10, labels, 0).index).toBe(2);
    expect(typeahead(start, 'd', 10, labels, 2).index).toBe(3);
  });

  it('extends the buffer within the timeout and starts again after it', () => {
    const first = typeahead(start, 'c', 100, labels, 2);
    expect(first.index).toBe(0);
    const second = typeahead(first.state, 'o', 300, labels, 0);
    expect(second.state.buffer).toBe('co');
    expect(second.index).toBe(0);
    const third = typeahead(second.state, 'p', 400, labels, 0);
    expect(third.index).toBe(1);
    expect(typeahead(third.state, 'd', 5000, labels, 1).state.buffer).toBe('d');
  });

  it('skips disabled items and ignores keys that are not printable', () => {
    expect(typeahead(start, 'd', 1, labels, 3, (index) => index === 4).index).toBe(2);
    expect(typeahead(start, 'Enter', 1, labels, 0).index).toBeNull();
    expect(typeahead(start, 'z', 1, labels, 0).index).toBeNull();
  });
});

describe('focus trap (UX-025: no keyboard trap outside a dialog, no escape from one)', () => {
  it('wraps Tab from the last control to the first and Shift+Tab from the first to the last', () => {
    expect(trapTab(3, 2, false)).toEqual({ prevent: true, focus: 0 });
    expect(trapTab(3, 0, true)).toEqual({ prevent: true, focus: 2 });
  });

  it('leaves Tab between controls to the browser', () => {
    expect(trapTab(3, 1, false)).toEqual({ prevent: false, focus: 1 });
    expect(trapTab(3, 1, true)).toEqual({ prevent: false, focus: 1 });
  });

  it('pulls focus back in when it is outside the dialog, and holds it on the dialog when nothing can take focus', () => {
    expect(trapTab(3, -1, false)).toEqual({ prevent: true, focus: 0 });
    expect(trapTab(3, -1, true)).toEqual({ prevent: true, focus: 2 });
    expect(trapTab(0, -1, false)).toEqual({ prevent: true, focus: -1 });
  });
});

describe('overlay placement (UX-001)', () => {
  const viewport = { width: 1000, height: 700 };
  const size = { width: 200, height: 100 };

  it('opens below the anchor, left-aligned, when it fits', () => {
    expect(placeOverlay({ anchor: { left: 100, top: 100, width: 80, height: 30 }, overlay: size, viewport, placement: 'bottom-start' }))
      .toEqual({ left: 100, top: 136, placement: 'bottom-start' });
  });

  it('flips above the anchor when there is no room below', () => {
    const placed = placeOverlay({ anchor: { left: 100, top: 640, width: 80, height: 30 }, overlay: size, viewport, placement: 'bottom-start' });
    expect(placed.placement).toBe('top-start');
    expect(placed.top).toBe(640 - 100 - 6);
  });

  it('keeps the overlay inside the viewport horizontally', () => {
    const placed = placeOverlay({ anchor: { left: 950, top: 100, width: 40, height: 30 }, overlay: size, viewport, placement: 'bottom-start' });
    expect(placed.left + size.width).toBeLessThanOrEqual(viewport.width - 8);
  });

  it('centres a tooltip over its anchor', () => {
    const placed = placeOverlay({ anchor: { left: 100, top: 300, width: 40, height: 30 }, overlay: { width: 80, height: 24 }, viewport, placement: 'top' });
    expect(placed).toEqual({ left: 80, top: 300 - 24 - 6, placement: 'top' });
  });
});
