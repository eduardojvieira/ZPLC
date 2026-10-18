import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { animationMs, prefersReducedMotion } from './motion';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const editor = (file: string) => readFileSync(new URL(`../editors/${file}`, import.meta.url), 'utf8');

const withMedia = (reduced: boolean) => {
  (globalThis as { window?: unknown }).window = { matchMedia: (query: string) => ({ matches: reduced && query.includes('prefers-reduced-motion') }) };
};
afterEach(() => { delete (globalThis as { window?: unknown }).window; });

/** UX-027: reduced motion is honoured by every transition and animation, in the stylesheet and in the animations that script starts. */
describe('reduced motion (UX-027)', () => {
  it('UX-027 shortens every transition and animation of the application under the media query', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*([^{}]*\{[^{}]*\})\s*\}/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/\*,\s*\*::before,\s*\*::after/);
    for (const property of ['animation-duration', 'transition-duration', 'scroll-behavior']) expect(block![1]).toContain(property);
    expect(block![1]).toMatch(/animation-iteration-count:\s*1/);
  });

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

  it('pinned source: the diagram editors start no animation of their own length, and no edge is animated', () => {
    for (const file of ['sfc/SFCEditor.tsx', 'fbd/FBDEditor.tsx', 'ld/LDEditor.tsx']) {
      const source = editor(file);
      expect({ file, literal: /duration:\s*\d/.test(source) }).toEqual({ file, literal: false });
      expect({ file, animated: /animated:\s*true/.test(source) }).toEqual({ file, animated: false });
    }
    expect(editor('sfc/SFCEditor.tsx')).toContain('animationMs(');
    expect(editor('fbd/FBDEditor.tsx')).toContain('animationMs(');
  });
});
