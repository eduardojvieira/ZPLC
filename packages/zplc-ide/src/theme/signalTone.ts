/**
 * Signal vocabulary for a watched value (UX-009, stopgap until the shared vocabulary of WP-45):
 * FALSE and unknown are neutral, green is confirmed TRUE only, amber is forced, red is fault only.
 * The text of the value (TRUE, FALSE, ---) and the Force column carry the state; colour never does alone.
 */
export type SignalTone = 'forced' | 'true' | 'false' | 'value';

export interface WatchedValue { forced: boolean; type?: string | null; value?: unknown }

export function signalTone({ forced, type, value }: WatchedValue): SignalTone {
  if (forced) return 'forced';
  if (type !== 'BOOL') return 'value';
  return value ? 'true' : 'false';
}

/** Theme tokens only: stock palette colours do not follow the light, dark and high-contrast themes. */
export const SIGNAL_TEXT_CLASS: Record<SignalTone, string> = {
  forced: 'text-[var(--color-accent-yellow)]',
  true: 'text-[var(--color-accent-green)]',
  false: 'text-[var(--text-secondary)]',
  value: 'text-[var(--color-accent-blue)]',
};
