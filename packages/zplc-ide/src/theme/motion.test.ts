import { afterEach, describe, expect, it } from 'bun:test';
import { animationMs, prefersReducedMotion } from './motion';

const withMedia = (reduced: boolean) => {
  (globalThis as { window?: unknown }).window = {
    matchMedia: (query: string) => ({ matches: reduced && query.includes('prefers-reduced-motion') }),
  };
};
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

/** UX-027: the animations that script starts take their length from here; the stylesheet and the editors are checked in journey 46. */
describe('reduced motion (UX-027)', () => {
  it('UX-027 asks for no animation when the system asks for reduced motion', () => {
    withMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(animationMs(200)).toBe(0);
    withMedia(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(animationMs(200)).toBe(200);
  });

  it('UX-027 does not fail where the window has no media queries', () => {
    expect(prefersReducedMotion()).toBe(false);
    expect(animationMs(200)).toBe(200);
  });
});
