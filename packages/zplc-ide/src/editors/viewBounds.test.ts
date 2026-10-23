// UX-033: the zoom range reaches both a large diagram and a single pin, and fitting never blows a small diagram up.
import { describe, expect, it } from 'bun:test';
import { getViewportForBounds } from '@xyflow/react';
import { FIT_VIEW_OPTIONS, MINIMAP_RESERVE_PX, ZOOM_MAX, ZOOM_MIN } from './viewBounds';

describe('UX-033 the zoom range of the diagram editors', () => {
  it('is wider than the 50% to 150% it had, at both ends', () => {
    expect(ZOOM_MIN).toBeLessThanOrEqual(0.1);
    expect(ZOOM_MAX).toBeGreaterThanOrEqual(4);
  });

  it('lets a fit reach the smallest zoom, and never enlarges a small diagram beyond its natural size', () => {
    expect(FIT_VIEW_OPTIONS.minZoom).toBe(ZOOM_MIN);
    expect(FIT_VIEW_OPTIONS.maxZoom).toBeLessThanOrEqual(1);
  });

  it('UX-033 fits a diagram above the minimap of the canvas, whatever its height', () => {
    const { padding, minZoom, maxZoom } = FIT_VIEW_OPTIONS;
    for (const height of [300, 800, 2000]) {
      const bounds = { x: 0, y: 0, width: 400, height };
      const view = getViewportForBounds(bounds, 1000, 600, minZoom, maxZoom, padding);
      expect(view.y + height * view.zoom).toBeLessThanOrEqual(600 - MINIMAP_RESERVE_PX + 1);
    }
  });
});
