/**
 * How far the diagram editors zoom, and how they fit a diagram in the view (UX-033).
 *
 * The range was 50% to 150%, which could not show a chart of a hundred blocks (it needs about 25%) and could not read
 * the pins of a small block on a large screen. It is 10% to 400%: at 10% a diagram nine times wider than the window is
 * still whole on the screen, and at 400% a pin is as large as a button. Fitting never zooms in past 100%, so a diagram
 * of two blocks is not blown up to the size of the window; the same options serve the fit button of the canvas and the
 * key of the table, so they cannot disagree.
 */

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

export const FIT_VIEW_OPTIONS = { padding: 0.24, minZoom: ZOOM_MIN, maxZoom: 1 } as const;
