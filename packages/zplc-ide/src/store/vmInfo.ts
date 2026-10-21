/**
 * What the last poll said the runtime is doing (program counter, cycles, error). It changes on every poll of a running
 * program, so it lives outside the debug controller's React state: held there, each poll rendered the whole window again
 * and the renderer fell further behind the runtime the longer a program ran. Only the status bar reads it.
 */

import { useSyncExternalStore } from 'react';
import type { VMInfo } from '../runtime/debugAdapter';

let info: VMInfo | null = null;
const listeners = new Set<() => void>();

/** The same values again are not a change: nothing is notified. */
export function publishVmInfo(next: VMInfo | null): void {
  if (
    next === info ||
    (next &&
      info &&
      next.pc === info.pc &&
      next.sp === info.sp &&
      next.halted === info.halted &&
      next.cycles === info.cycles &&
      next.error === info.error)
  )
    return;
  info = next;
  for (const listener of listeners) listener();
}

export const vmInfoNow = (): VMInfo | null => info;

export const subscribeVmInfo = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useVmInfo = (): VMInfo | null => useSyncExternalStore(subscribeVmInfo, vmInfoNow);
