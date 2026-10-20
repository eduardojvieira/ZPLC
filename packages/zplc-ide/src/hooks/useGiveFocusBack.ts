import { useEffect, useRef, type RefObject } from 'react';
import { claimLostFocus } from '../shell/claimLostFocus';

/**
 * A control that disables itself while its work runs drops the focus to the page body, and a keyboard or screen reader
 * user is sent back to the top without being told (UX-025, UX-028). Call the returned function when this control starts
 * the work; when `busy` ends and the body has the focus, the control gets it back. A person who moved on keeps their place.
 */
export function useGiveFocusBack(busy: boolean, control: RefObject<HTMLElement | null>): () => void {
  const started = useRef(false);
  useEffect(() => {
    if (busy || !started.current) return;
    started.current = false;
    // after the paint in which the control is enabled again
    requestAnimationFrame(() => { claimLostFocus(control.current, document.activeElement, document.body); });
  }, [busy, control]);
  return () => { started.current = true; };
}
