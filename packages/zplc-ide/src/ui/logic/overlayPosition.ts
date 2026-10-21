/**
 * Where a popup (a tooltip, a menu, a popover) goes next to its anchor: below or above, flipped when it does not fit, clamped to the
 * window.
 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export type Placement = 'top' | 'bottom' | 'top-start' | 'bottom-start' | 'top-end' | 'bottom-end' | 'left' | 'right';

const OPPOSITE: Record<Placement, Placement> = {
  top: 'bottom',
  bottom: 'top',
  'top-start': 'bottom-start',
  'bottom-start': 'top-start',
  'top-end': 'bottom-end',
  'bottom-end': 'top-end',
  left: 'right',
  right: 'left',
};

export function placeOverlay({
  anchor,
  overlay,
  viewport,
  placement,
  gap = 6,
  margin = 8,
}: {
  anchor: Rect;
  overlay: { width: number; height: number };
  viewport: { width: number; height: number };
  placement: Placement;
  gap?: number;
  margin?: number;
}): { left: number; top: number; placement: Placement } {
  const at = (side: Placement): { left: number; top: number } => {
    const [axis, align = 'center'] = side.split('-') as [string, string | undefined];
    if (axis === 'left') return { left: anchor.left - overlay.width - gap, top: anchor.top + (anchor.height - overlay.height) / 2 };
    if (axis === 'right') return { left: anchor.left + anchor.width + gap, top: anchor.top + (anchor.height - overlay.height) / 2 };
    const left =
      align === 'start'
        ? anchor.left
        : align === 'end'
          ? anchor.left + anchor.width - overlay.width
          : anchor.left + (anchor.width - overlay.width) / 2;
    return { left, top: axis === 'top' ? anchor.top - overlay.height - gap : anchor.top + anchor.height + gap };
  };
  const fits = ({ left, top }: { left: number; top: number }, side: Placement): boolean => {
    const vertical = side.startsWith('top') || side.startsWith('bottom');
    return vertical
      ? top >= margin && top + overlay.height <= viewport.height - margin
      : left >= margin && left + overlay.width <= viewport.width - margin;
  };
  let side = placement;
  let position = at(side);
  if (!fits(position, side)) {
    const flipped = at(OPPOSITE[side]);
    if (fits(flipped, OPPOSITE[side])) {
      side = OPPOSITE[side];
      position = flipped;
    }
  }
  const clamp = (value: number, size: number, limit: number): number => Math.max(margin, Math.min(value, limit - size - margin));
  return {
    left: clamp(position.left, overlay.width, viewport.width),
    top: clamp(position.top, overlay.height, viewport.height),
    placement: side,
  };
}
