import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onDismiss` when the user presses Escape or presses outside every one of `regions`, while `open`. For a popup
 * that is not modal: a menu, a popover, a context menu.
 */
export function useDismiss(open: boolean, regions: ReadonlyArray<RefObject<HTMLElement | null>>, onDismiss: (reason: 'escape' | 'outside') => void): void {
  const latest = useRef(onDismiss);
  useEffect(() => { latest.current = onDismiss; }, [onDismiss]);
  const targets = useRef(regions);
  useEffect(() => { targets.current = regions; }, [regions]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      const inside = targets.current.some((region) => region.current?.contains(event.target as Node) === true);
      if (!inside) latest.current('outside');
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') latest.current('escape');
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
}
