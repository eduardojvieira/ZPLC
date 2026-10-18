/**
 * Reduced motion (UX-027). The stylesheet shortens every CSS transition and animation under `prefers-reduced-motion`
 * (src/index.css); an animation that script starts, such as the camera of a diagram, asks here for its length.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** The length in milliseconds of an animation that script starts: none when the system asks for reduced motion. */
export const animationMs = (ms: number): number => (prefersReducedMotion() ? 0 : ms);
