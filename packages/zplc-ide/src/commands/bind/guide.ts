/** The Guide commands (plan-u3.md: G2 binds the lesson ones here; G5 binds the jump to the command bar). */
import { useEffect } from 'react';
import { bindCommands } from '../bus';

/** The control that had the focus when the person jumped to the command bar; a second press, or Escape, gives it back. */
let origin: HTMLElement | null = null;

const commandBar = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-command-bar]');

/** An open menu or popup in the bar owns Escape: it closes first, and the next Escape goes back. */
const popupOwnsEscape = (active: Element | null): boolean =>
  Boolean(active?.closest('[role="menu"], [role="listbox"], [role="dialog"]')) || active?.getAttribute('aria-expanded') === 'true';

const giveFocusBack = (): void => {
  const target = origin;
  origin = null;
  if (target?.isConnected) target.focus();
  else document.querySelector<HTMLElement>('main')?.focus();
};

/** `view.focusCommandBar` (FND-002, UX-025): to the command bar from anywhere, back to where the person was on a second press. */
export function focusCommandBar(): void {
  const bar = commandBar();
  if (!bar) return;
  if (bar.contains(document.activeElement)) return giveFocusBack();
  const first = bar.querySelector<HTMLElement>('button:not(:disabled)');
  if (!first) return;
  origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  first.focus();
}

export function useGuideCommands(): void {
  useEffect(() => {
    const unbind = bindCommands({ 'view.focusCommandBar': focusCommandBar });
    const onKeyDown = (event: KeyboardEvent): void => {
      const active = document.activeElement;
      if (event.key === 'Escape' && origin && commandBar()?.contains(active) && !popupOwnsEscape(active)) {
        event.preventDefault();
        giveFocusBack();
      }
    };
    // The capture phase: the bar's controls open a tooltip on focus, and the tooltip stops Escape from bubbling (Tooltip.tsx).
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      unbind();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}
