import { useSyncExternalStore } from 'react';

/** Below this window width (UX-023) the rail shows icons only, the secondary sidebar hides itself and the command bar folds into a menu. */
export const COMPACT_MAX_WIDTH = 1100;
export type ShellDensity = 'regular' | 'compact';

export const shellDensity = (width: number): ShellDensity => (width <= COMPACT_MAX_WIDTH ? 'compact' : 'regular');

const subscribe = (listener: () => void): (() => void) => {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
};

export function useShellDensity(): ShellDensity {
  return useSyncExternalStore(
    subscribe,
    () => shellDensity(window.innerWidth),
    () => 'regular',
  );
}
