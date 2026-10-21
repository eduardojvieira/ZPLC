/**
 * What the shared announcer says about the force state of the debugger (UX-026): a variable forced or released, all forces
 * released at once, and a force that became unconfirmed (a fault). Build, save, deploy, test and connection results are
 * announced where the notification store receives them; run and stop are read from the persistent status of the status
 * bar. The store is not touched: this hook only watches it.
 */
import { useEffect } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { announce } from '../utils/announce';
import { forceAnnouncements, type ForceSnapshot } from '../utils/forceAnnouncements';

const snapshotOf = (state: ReturnType<typeof useIDEStore.getState>): ForceSnapshot => ({
  paths: [...state.debug.forcedValues.keys()],
  unconfirmed: state.debug.forcesUnconfirmed,
});

/** Mounted once, by the application. */
export function useStatusAnnouncements(): void {
  useEffect(() => {
    let last = snapshotOf(useIDEStore.getState());
    return useIDEStore.subscribe((state) => {
      if (state.debug.forcedValues === undefined) return;
      const next = snapshotOf(state);
      for (const { message, politeness } of forceAnnouncements(last, next)) announce(message, politeness);
      last = next;
    });
  }, []);
}
