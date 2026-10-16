/**
 * When a tooltip is shown. It appears after a short delay under the pointer and at once on keyboard focus (so a person
 * who cannot use a pointer reads it too), disappears when the pointer or the focus leaves, and Escape dismisses it
 * without moving focus (WCAG 1.4.13: dismissible, hoverable, persistent). A click that moves focus onto the control
 * does not pop it up.
 */
export type TooltipPhase = 'closed' | 'pending' | 'open';

export interface TooltipState { phase: TooltipPhase; hovered: boolean; focused: boolean; suppressed: boolean }
export type TooltipEvent = 'pointer-enter' | 'pointer-leave' | 'focus' | 'blur' | 'delay-elapsed' | 'escape' | 'pointer-down';

export const INITIAL_TOOLTIP: TooltipState = { phase: 'closed', hovered: false, focused: false, suppressed: false };
export const TOOLTIP_DELAY_MS = 500;

export function tooltipTransition(state: TooltipState, event: TooltipEvent): { state: TooltipState; timer: 'start' | 'clear' | null } {
  switch (event) {
    case 'pointer-enter':
      if (state.suppressed || state.phase === 'open') return { state: { ...state, hovered: true }, timer: null };
      return { state: { ...state, hovered: true, phase: 'pending' }, timer: 'start' };
    case 'pointer-leave': {
      const focused = state.focused;
      return { state: { ...state, hovered: false, suppressed: false, phase: focused ? state.phase : 'closed' }, timer: focused ? null : 'clear' };
    }
    case 'focus':
      if (state.suppressed) return { state: { ...state, focused: true }, timer: null };
      return { state: { ...state, focused: true, phase: 'open' }, timer: 'clear' };
    case 'blur':
      return { state: { ...state, focused: false, suppressed: false, phase: state.hovered ? state.phase : 'closed' }, timer: state.hovered ? null : 'clear' };
    case 'delay-elapsed':
      return state.phase === 'pending' ? { state: { ...state, phase: 'open' }, timer: null } : { state, timer: null };
    case 'escape':
      return state.phase === 'closed' ? { state, timer: null } : { state: { ...state, phase: 'closed', suppressed: true }, timer: 'clear' };
    case 'pointer-down':
      return { state: { ...state, phase: 'closed', suppressed: true }, timer: 'clear' };
  }
}
