import type { ConsoleEntry } from '../types';

export const MAX_CONSOLE_ENTRIES = 1000;

export type NewConsoleEntry = Omit<ConsoleEntry, 'id' | 'timestamp'>;

function materializeEntry(entry: NewConsoleEntry): ConsoleEntry {
  return {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date(),
  };
}

export function appendConsoleEntries(
  existingEntries: ConsoleEntry[],
  entries: NewConsoleEntry[],
): ConsoleEntry[] {
  if (entries.length === 0) {
    return existingEntries;
  }

  const nextEntries = [...existingEntries, ...entries.map(materializeEntry)];
  if (nextEntries.length <= MAX_CONSOLE_ENTRIES) {
    return nextEntries;
  }

  return nextEntries.slice(-MAX_CONSOLE_ENTRIES);
}
