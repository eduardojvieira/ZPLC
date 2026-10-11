/**
 * Arrow-key navigation of a composite widget (tabs, a toggle group, a menu, a list): pure index arithmetic, so the
 * behaviour is proven without a DOM and the components stay thin (UX-001, UX-025).
 */
export type Orientation = 'horizontal' | 'vertical' | 'both';

export interface NavigationOptions {
  orientation?: Orientation;
  /** Wrap past either end; on by default. */
  loop?: boolean;
  isDisabled?: (index: number) => boolean;
}

const FORWARD: Record<Orientation, readonly string[]> = { horizontal: ['ArrowRight'], vertical: ['ArrowDown'], both: ['ArrowRight', 'ArrowDown'] };
const BACKWARD: Record<Orientation, readonly string[]> = { horizontal: ['ArrowLeft'], vertical: ['ArrowUp'], both: ['ArrowLeft', 'ArrowUp'] };

/** The index a key moves to, or null when the key is not one of this widget's navigation keys or nothing can take it. */
export function navigationTarget(key: string, current: number, count: number, options: NavigationOptions = {}): number | null {
  const { orientation = 'both', loop = true, isDisabled = () => false } = options;
  if (count <= 0) return null;
  const enabled = (index: number): boolean => index >= 0 && index < count && !isDisabled(index);
  const scan = (from: number, step: 1 | -1): number | null => {
    for (let taken = 0, index = from; taken < count; taken += 1, index += step) {
      let candidate = index;
      if (candidate < 0 || candidate >= count) {
        if (!loop) return null;
        candidate = ((candidate % count) + count) % count;
      }
      if (enabled(candidate)) return candidate;
    }
    return null;
  };
  if (key === 'Home') return scan(0, 1);
  if (key === 'End') return scan(count - 1, -1);
  if (FORWARD[orientation].includes(key)) {
    if (current < 0) return scan(0, 1);
    const target = scan(current + 1, 1);
    return target ?? (enabled(current) ? current : null);
  }
  if (BACKWARD[orientation].includes(key)) {
    if (current < 0) return scan(count - 1, -1);
    const target = scan(current - 1, -1);
    return target ?? (enabled(current) ? current : null);
  }
  return null;
}
