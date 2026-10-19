// UX-033: a rung uses the width of the view, and scrolls sideways only when its content is wider.
import { describe, expect, it } from 'bun:test';
import { drawnRungWidth } from './rungWidth';

describe('UX-033 the width a rung is drawn at', () => {
  it('fills a view that is wider than the content, so the right rail is at its edge', () => {
    expect(drawnRungWidth(640, 1280)).toBe(1280);
    expect(drawnRungWidth(640, 1280.7)).toBe(1280);
  });

  it('keeps the width of the content when the view is narrower, which is what makes the rung scroll', () => {
    expect(drawnRungWidth(1100, 800)).toBe(1100);
  });

  it('draws the content at its own width until the view has been measured', () => {
    expect(drawnRungWidth(640, 0)).toBe(640);
  });
});
