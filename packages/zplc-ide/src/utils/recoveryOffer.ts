/**
 * What the user is offered after a crash (IDE-006): one row per modified file whose kept content is worth restoring.
 * Pure: the component reads the files and does the restoring.
 */
import type { RecoveryEntry } from '../../electron/recoveryStoreProtocol';

export interface OfferRow {
  path: string;
  name: string;
  content: string;
  savedAt: number;
}
export interface Offer {
  rows: OfferRow[];
  /** Paths whose entry is of no use: remove them without asking. */ drop: string[];
}

/**
 * `disk` holds the current content of each file the entries name: a missing key means it could not be read (the entry
 * stays for the next start), and `null` that the file is no longer in the project. An entry equal to the file was saved
 * before the crash; one for a file that is gone has nowhere to be restored to. Neither is worth a question.
 */
export function offerRows(entries: readonly RecoveryEntry[], disk: ReadonlyMap<string, string | null>): Offer {
  const rows: OfferRow[] = [];
  const drop: string[] = [];
  for (const entry of [...entries].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))) {
    const current = disk.get(entry.path);
    if (current === undefined) continue; // not readable now: neither offered nor removed, so that the next start can try again
    if (current !== null && current !== entry.content)
      rows.push({ path: entry.path, name: entry.path.split('/').at(-1) ?? entry.path, content: entry.content, savedAt: entry.savedAt });
    else drop.push(entry.path);
  }
  return { rows, drop };
}

/** The clock time of a moment on the same day as `now`, the date and time of an earlier one. */
export function formatKeptAt(savedAt: number, now: number = Date.now()): string {
  const moment = new Date(savedAt);
  const today = new Date(now);
  const sameDay =
    moment.getFullYear() === today.getFullYear() && moment.getMonth() === today.getMonth() && moment.getDate() === today.getDate();
  return sameDay
    ? moment.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : moment.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
