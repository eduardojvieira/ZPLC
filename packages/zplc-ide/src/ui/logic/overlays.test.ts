import { describe, expect, it } from 'bun:test';
import { INITIAL_TOOLTIP, tooltipTransition, type TooltipEvent, type TooltipState } from './tooltipState';
import { menuKey, menuOpenTarget } from './menuState';

const run = (events: TooltipEvent[]): { state: TooltipState; timers: Array<'start' | 'clear' | null> } => {
  let state = INITIAL_TOOLTIP;
  const timers: Array<'start' | 'clear' | null> = [];
  for (const event of events) {
    const step = tooltipTransition(state, event);
    state = step.state;
    timers.push(step.timer);
  }
  return { state, timers };
};

describe('tooltip behaviour (UX-001, UX-025 stopgap)', () => {
  it('waits for the delay before it shows under the pointer, and hides when the pointer leaves', () => {
    const entered = run(['pointer-enter']);
    expect(entered.state.phase).toBe('pending');
    expect(entered.timers).toEqual(['start']);
    expect(run(['pointer-enter', 'delay-elapsed']).state.phase).toBe('open');
    expect(run(['pointer-enter', 'delay-elapsed', 'pointer-leave']).state.phase).toBe('closed');
    expect(run(['pointer-enter', 'pointer-leave', 'delay-elapsed']).state.phase).toBe('closed');
  });

  it('shows at once on keyboard focus and stays while focus stays, even when the pointer passes', () => {
    expect(run(['focus']).state.phase).toBe('open');
    expect(run(['focus', 'pointer-enter', 'pointer-leave']).state.phase).toBe('open');
    expect(run(['focus', 'blur']).state.phase).toBe('closed');
  });

  it('dismisses on Escape without moving focus, and stays dismissed until the pointer or the focus leaves', () => {
    const dismissed = run(['focus', 'escape']);
    expect(dismissed.state.phase).toBe('closed');
    expect(run(['focus', 'escape', 'pointer-enter', 'delay-elapsed']).state.phase).toBe('closed');
    expect(run(['focus', 'escape', 'blur', 'focus']).state.phase).toBe('open');
  });

  it('does not pop up because a click moved focus onto the control', () => {
    expect(run(['pointer-enter', 'delay-elapsed', 'pointer-down', 'focus']).state.phase).toBe('closed');
  });
});

describe('menu keyboard behaviour (UX-001, UX-025 stopgap)', () => {
  const items = [{ label: 'Compile' }, { label: 'Compile and download', disabled: true }, { label: 'Debug' }, { label: 'Settings' }];
  const idle = { buffer: '', at: 0 };

  it('opens on Enter, Space or ArrowDown at the first enabled item and on ArrowUp at the last', () => {
    expect(menuOpenTarget('Enter', items)).toBe(0);
    expect(menuOpenTarget(' ', items)).toBe(0);
    expect(menuOpenTarget('ArrowDown', items)).toBe(0);
    expect(menuOpenTarget('ArrowUp', items)).toBe(3);
    expect(menuOpenTarget('a', items)).toBeNull();
  });

  it('moves the active item with the arrows, Home and End, skipping a disabled item', () => {
    expect(menuKey('ArrowDown', 0, items, 0, idle).active).toBe(2);
    expect(menuKey('ArrowUp', 0, items, 0, idle).active).toBe(3);
    expect(menuKey('End', 0, items, 0, idle).active).toBe(3);
    expect(menuKey('Home', 3, items, 0, idle).active).toBe(0);
  });

  it('activates the active item on Enter or Space, and never a disabled one', () => {
    expect(menuKey('Enter', 2, items, 0, idle)).toMatchObject({ action: 'activate', active: 2 });
    expect(menuKey(' ', 3, items, 0, idle)).toMatchObject({ action: 'activate', active: 3 });
    expect(menuKey('Enter', 1, items, 0, idle).action).toBe('none');
  });

  it('closes on Escape and returns focus to the trigger, and closes on Tab without trapping it', () => {
    expect(menuKey('Escape', 0, items, 0, idle).action).toBe('close-and-restore');
    expect(menuKey('Tab', 0, items, 0, idle).action).toBe('close');
  });

  it('finds an item by its first letters', () => {
    expect(menuKey('s', 0, items, 10, idle)).toMatchObject({ active: 3, action: 'none' });
    expect(menuKey('d', 0, items, 10, idle).active).toBe(2);
  });
});
