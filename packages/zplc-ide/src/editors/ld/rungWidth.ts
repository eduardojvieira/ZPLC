/**
 * How wide a rung is drawn (UX-033): as wide as the view when the view is wider than the rung's content, so the right
 * power rail is at the edge of the view and not in a narrow column; as wide as its content when the view is narrower,
 * and then the rung scrolls sideways. `available` is 0 until the view has been measured.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export const drawnRungWidth = (content: number, available: number): number => Math.max(content, Math.floor(available));

/** The width of the element the ref is put on, kept up to date while it is resized. */
export function useAvailableWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const measure = useCallback(() => setWidth(ref.current?.clientWidth ?? 0), []);
  useEffect(() => {
    measure();
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);
  return [ref, width];
}
