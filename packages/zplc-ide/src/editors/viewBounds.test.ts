// UX-033: the zoom range reaches both a large diagram and a single pin, and fitting never blows a small diagram up.
import { describe, expect, it } from 'bun:test';
import { FIT_VIEW_OPTIONS, ZOOM_MAX, ZOOM_MIN } from './viewBounds';

describe('UX-033 the zoom range of the diagram editors', () => {
  it('is wider than the 50% to 150% it had, at both ends', () => {
    expect(ZOOM_MIN).toBeLessThanOrEqual(0.1);
    expect(ZOOM_MAX).toBeGreaterThanOrEqual(4);
  });

  it('lets a fit reach the smallest zoom, and never enlarges a small diagram beyond its natural size', () => {
    expect(FIT_VIEW_OPTIONS.minZoom).toBe(ZOOM_MIN);
    expect(FIT_VIEW_OPTIONS.maxZoom).toBeLessThanOrEqual(1);
  });
});
