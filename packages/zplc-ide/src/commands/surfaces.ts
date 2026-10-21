/**
 * Whether the command palette and the shortcut reference are open (UX-015). They are opened by commands, from the menu, a
 * shortcut or each other, so their state is shared rather than held by one component.
 */
import { useSyncExternalStore } from 'react';

export interface CommandSurfaces {
  palette: boolean;
  shortcuts: boolean;
}

let surfaces: CommandSurfaces = { palette: false, shortcuts: false };
const listeners = new Set<() => void>();

function set(next: CommandSurfaces): void {
  if (next.palette === surfaces.palette && next.shortcuts === surfaces.shortcuts) return;
  surfaces = next;
  for (const listener of listeners) listener();
}

/** One of the two is open at a time. */
export const openPalette = (): void => set({ palette: true, shortcuts: false });
export const openShortcuts = (): void => set({ palette: false, shortcuts: true });
export const closeSurfaces = (): void => set({ palette: false, shortcuts: false });
export const getSurfaces = (): CommandSurfaces => surfaces;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useCommandSurfaces(): CommandSurfaces {
  return useSyncExternalStore(subscribe, getSurfaces, getSurfaces);
}
