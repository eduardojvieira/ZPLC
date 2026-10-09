/**
 * What the Recent section of the Welcome screen shows (IDE-008, UX-022): one row per folder the user opened before,
 * with the folder's name and when it was last opened, or why it cannot be opened now. Pure, so it can be tested without
 * the screen. The main process sends names and times, never paths.
 */
import type { RecentProject } from '../../electron/projectFilesProtocol';

export const UNAVAILABLE_REASON = 'The folder was not found. It may have been moved or deleted.';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'} ago`;

/** "just now", "5 minutes ago", "yesterday", "6 days ago", then the date ("12 Sep 2026"); English, as the rest of the screen. */
export function formatLastOpened(lastOpenedAt: number, now: number): string {
  if (!Number.isFinite(lastOpenedAt)) return 'earlier';
  const age = now - lastOpenedAt;
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return plural(Math.floor(age / MINUTE), 'minute');
  if (age < DAY) return plural(Math.floor(age / HOUR), 'hour');
  if (age < 2 * DAY) return 'yesterday';
  if (age < 7 * DAY) return plural(Math.floor(age / DAY), 'day');
  const date = new Date(lastOpenedAt);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export interface RecentRow {
  recentId: string;
  name: string;
  opened: string;
  available: boolean;
  /** Why the row cannot be opened; null when it can. */
  reason: string | null;
}

export function recentRows(projects: readonly RecentProject[], now: number): RecentRow[] {
  return projects.map((project) => ({
    recentId: project.recentId,
    name: project.displayName || 'Project',
    opened: formatLastOpened(project.lastOpenedAt, now),
    available: project.available,
    reason: project.available ? null : UNAVAILABLE_REASON,
  }));
}
