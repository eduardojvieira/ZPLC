/**
 * How a panel separator moves from the keyboard (UX-017). The panel library already handles the plain arrows (5 %), Home,
 * End and Enter; Shift with an arrow is the larger step it does not have. The value of a separator is the size, in percent,
 * of the panel that comes before it (the WAI-ARIA window splitter), so the numbers here are the ones in aria-valuenow,
 * aria-valuemin and aria-valuemax.
 */
export type SeparatorOrientation = 'horizontal' | 'vertical';

/** An arrow key: 5 percentage points, the library's own step. */
export const SMALL_STEP = 5;
/** Shift with an arrow key. */
export const LARGE_STEP = 15;

export interface SeparatorMove {
  now: number;
  min: number;
  max: number;
  /** The orientation of the group, as the panel library names it: `horizontal` is side-by-side panels (left and right arrows). */
  orientation: SeparatorOrientation;
  key: string;
  shiftKey: boolean;
}

const BEFORE: Record<SeparatorOrientation, string> = { horizontal: 'ArrowLeft', vertical: 'ArrowUp' };
const AFTER: Record<SeparatorOrientation, string> = { horizontal: 'ArrowRight', vertical: 'ArrowDown' };

/** The value the separator takes for a key, kept between its limits; null when the key does not move this separator. */
export function moveSeparator({ now, min, max, orientation, key, shiftKey }: SeparatorMove): number | null {
  if (![now, min, max].every(Number.isFinite)) return null;
  const clamp = (value: number): number => Math.min(max, Math.max(min, value));
  if (key === 'Home') return min;
  if (key === 'End') return max;
  const step = shiftKey ? LARGE_STEP : SMALL_STEP;
  if (key === BEFORE[orientation]) return clamp(now - step);
  if (key === AFTER[orientation]) return clamp(now + step);
  return null;
}

/** The layout with the leading panel at `size` and the trailing one taking the difference; null when either panel is not in the layout. */
export function withLeadingSize(layout: Record<string, number>, leading: string, trailing: string, size: number): Record<string, number> | null {
  const before = layout[leading];
  const after = layout[trailing];
  if (before === undefined || after === undefined) return null;
  return { ...layout, [leading]: size, [trailing]: after + before - size };
}
