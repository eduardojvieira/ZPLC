/**
 * When a screen closes it takes the control that had the focus with it, and the focus falls to the page body: a keyboard user
 * starts again from the top of the page and a screen reader says nothing about where they are. This puts the focus on
 * `target` (a named region with tabindex -1) only when the body, or nothing, has it, so a control the person already
 * reached keeps it. Returns whether it moved the focus.
 */
export function claimLostFocus(target: { focus(): void } | null, active: unknown, body: unknown): boolean {
  if (!target || (active !== null && active !== undefined && active !== body)) return false;
  target.focus();
  return true;
}
