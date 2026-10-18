/** What the shared announcer says about the force state of the debugger (UX-026), worked out from two snapshots of it. */
import { t } from '../i18n';
import type { Politeness } from './announce';

export interface ForceSnapshot { paths: readonly string[]; unconfirmed: boolean }
export interface Spoken { message: string; politeness: Politeness }

export function forceAnnouncements(previous: ForceSnapshot, next: ForceSnapshot): Spoken[] {
  const spoken: Spoken[] = [];
  const added = next.paths.filter((path) => !previous.paths.includes(path));
  const released = previous.paths.filter((path) => !next.paths.includes(path));
  for (const path of added) spoken.push({ message: t('announce.forceSet', { path }), politeness: 'polite' });
  if (released.length > 1 && next.paths.length === 0) spoken.push({ message: t('announce.forcesReleased'), politeness: 'polite' });
  else for (const path of released) spoken.push({ message: t('announce.forceReleased', { path }), politeness: 'polite' });
  if (next.unconfirmed && !previous.unconfirmed) spoken.push({ message: t('announce.forcesUnconfirmed'), politeness: 'assertive' });
  return spoken;
}
