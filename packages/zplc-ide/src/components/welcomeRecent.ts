/**
 * What the Recent section of the Welcome screen shows (IDE-008, UX-022): one row per folder the user opened before,
 * with the folder's name and when it was last opened, or why it cannot be opened now. Pure, so it can be tested without
 * the screen. The main process sends names and times, never paths.
 */
import { t as translateNow, tn as pluralNow, type Translator } from '../i18n';
import type { RecentProject } from '../../electron/projectFilesProtocol';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "yesterday", "6 days ago", then the date ("12 Sep 2026"), in the language of the interface (UX-029). */
export function formatLastOpened(lastOpenedAt: number, now: number, { t, tn }: Pick<Translator, 't' | 'tn'> = { t: translateNow, tn: pluralNow }): string {
  if (!Number.isFinite(lastOpenedAt)) return t('welcome.recent.earlier');
  const age = now - lastOpenedAt;
  if (age < MINUTE) return t('welcome.recent.justNow');
  if (age < HOUR) return tn('welcome.recent.minutesAgo', Math.floor(age / MINUTE));
  if (age < DAY) return tn('welcome.recent.hoursAgo', Math.floor(age / HOUR));
  if (age < 2 * DAY) return t('welcome.recent.yesterday');
  if (age < 7 * DAY) return tn('welcome.recent.daysAgo', Math.floor(age / DAY));
  const date = new Date(lastOpenedAt);
  return t('welcome.recent.date', { day: date.getUTCDate(), month: t('welcome.recent.months').split(',')[date.getUTCMonth()]!, year: date.getUTCFullYear() });
}

export interface RecentRow {
  recentId: string;
  name: string;
  opened: string;
  available: boolean;
  /** Why the row cannot be opened; null when it can. */
  reason: string | null;
}

export function recentRows(projects: readonly RecentProject[], now: number, translator: Pick<Translator, 't' | 'tn'> = { t: translateNow, tn: pluralNow }): RecentRow[] {
  return projects.map((project) => ({
    recentId: project.recentId,
    name: project.displayName || translator.t('welcome.recent.unnamed'),
    opened: formatLastOpened(project.lastOpenedAt, now, translator),
    available: project.available,
    reason: project.available ? null : translator.t('welcome.recent.unavailable'),
  }));
}
