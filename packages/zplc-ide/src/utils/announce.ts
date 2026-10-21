/**
 * The shared announcer (UX-026). Any module says what changed with `announce(message)`; the two live regions of
 * `ui/LiveRegions.tsx` (one polite, one assertive for faults), mounted once for the window, are the only place a screen
 * reader hears it. A panel does not keep a live region of its own for an event.
 *
 * ponytail: the last message of a politeness wins when several arrive before the screen reader has read the first;
 * a queue is the upgrade if the screen-reader check (UX-028) finds that a message is lost.
 */
export type Politeness = 'polite' | 'assertive';
/** `seq` counts every announcement; `variant` flips when a region gets the same text again, so that the text changes. */
export interface Announcement {
  message: string;
  seq: number;
  variant: 0 | 1;
}

const SILENT: Announcement = { message: '', seq: 0, variant: 0 };
let current: Record<Politeness, Announcement> = { polite: SILENT, assertive: SILENT };
let counter = 0;
const listeners = new Set<() => void>();

export function announce(message: string, politeness: Politeness = 'polite'): void {
  const text = message.trim();
  if (text === '') return;
  counter += 1;
  const before = current[politeness];
  current = {
    ...current,
    [politeness]: { message: text, seq: counter, variant: before.message === text ? (before.variant === 0 ? 1 : 0) : 0 },
  };
  for (const listener of [...listeners]) listener();
}

export function subscribeAnnouncements(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The same object until the next announcement, as `useSyncExternalStore` needs. */
export const announcementsSnapshot = (): Record<Politeness, Announcement> => current;

export function resetAnnouncements(): void {
  counter = 0;
  current = { polite: SILENT, assertive: SILENT };
  for (const listener of [...listeners]) listener();
}
