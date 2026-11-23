import type { ConsoleEntry } from '../types';
import type { OutputLevel } from '../utils/appSettings';

export const MAX_CONSOLE_ENTRIES = 1000;

export type NewConsoleEntry = Omit<ConsoleEntry, 'id' | 'timestamp'>;

function materializeEntry(entry: NewConsoleEntry): ConsoleEntry {
  return {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date(),
  };
}

export function appendConsoleEntries(existingEntries: ConsoleEntry[], entries: NewConsoleEntry[]): ConsoleEntry[] {
  if (entries.length === 0) {
    return existingEntries;
  }

  const nextEntries = [...existingEntries, ...entries.map(materializeEntry)];
  if (nextEntries.length <= MAX_CONSOLE_ENTRIES) {
    return nextEntries;
  }

  return nextEntries.slice(-MAX_CONSOLE_ENTRIES);
}

/**
 * What Output shows at a level (MSG-005). The detailed level is everything written. The normal level keeps every error, warning and
 * success, so a message that reports a failure is never hidden, and an info or command line only when its call site marked a step.
 */
export function entriesForLevel(entries: readonly ConsoleEntry[], level: OutputLevel): readonly ConsoleEntry[] {
  if (level === 'detailed') return entries;
  return entries.filter((entry) => entry.type === 'error' || entry.type === 'warning' || entry.type === 'success' || entry.step === true);
}

/** Brings the console's output tab into view, where a failed action reports why. */
export const SHOW_OUTPUT = { activeConsoleTab: 'output', isConsoleCollapsed: false } as const;
