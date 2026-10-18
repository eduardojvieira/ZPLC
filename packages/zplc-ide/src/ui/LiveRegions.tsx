import { useSyncExternalStore } from 'react';
import { announcementsSnapshot, subscribeAnnouncements, type Announcement } from '../utils/announce';

/** A message said twice in a row is not read again unless the text changes, so the repeat ends with a no-break space. */
const rendered = (entry: Announcement): string => (entry.variant === 0 ? entry.message : `${entry.message}\u00a0`);

/**
 * The two live regions of the shared announcer (UX-026), mounted once for the window and present before the first
 * message, which is what lets a screen reader notice a change in them: a polite status for results, and an assertive
 * alert for faults. Nothing else in the application needs a live region of its own for an event.
 */
export function LiveRegions() {
  const { polite, assertive } = useSyncExternalStore(subscribeAnnouncements, announcementsSnapshot, announcementsSnapshot);
  return (
    <>
      <div className="ui-visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-live-region="polite">{rendered(polite)}</div>
      <div className="ui-visually-hidden" aria-live="assertive" aria-atomic="true" data-live-region="assertive">{rendered(assertive)}</div>
    </>
  );
}
