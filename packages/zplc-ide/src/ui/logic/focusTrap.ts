/**
 * Where Tab goes inside a modal dialog. `count` is the number of focusable controls, `active` the index of the one that
 * has focus (-1 when focus is outside them). Inside the list Tab is the browser's; at either end and from outside the
 * dialog it wraps, so focus never leaves a modal and never needs the mouse to come back (UX-025).
 */
export function trapTab(count: number, active: number, shift: boolean): { prevent: boolean; focus: number } {
  if (count === 0) return { prevent: true, focus: -1 };
  if (active < 0) return { prevent: true, focus: shift ? count - 1 : 0 };
  if (shift && active === 0) return { prevent: true, focus: count - 1 };
  if (!shift && active === count - 1) return { prevent: true, focus: 0 };
  return { prevent: false, focus: active };
}
