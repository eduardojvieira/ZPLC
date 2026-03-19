import { describe, expect, it } from 'bun:test';

import type { ConsoleEntry } from '../types';
import { appendConsoleEntries, MAX_CONSOLE_ENTRIES } from './consoleEntries';

function createExistingEntry(index: number): ConsoleEntry {
  return {
    id: `id-${index}`,
    type: 'info',
    message: `entry-${index}`,
    timestamp: new Date(`2026-03-16T00:00:${String(index % 60).padStart(2, '0')}Z`),
    source: 'device',
  };
}

describe('appendConsoleEntries', () => {
  it('appends multiple entries in one pass', () => {
    const result = appendConsoleEntries([], [
      { type: 'info', message: 'a', source: 'device' },
      { type: 'info', message: 'b', source: 'runtime' },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.message)).toEqual(['a', 'b']);
  });

  it('caps console history to the newest entries', () => {
    const existing = Array.from({ length: MAX_CONSOLE_ENTRIES }, (_, index) => createExistingEntry(index));
    const result = appendConsoleEntries(existing, [
      { type: 'info', message: 'new-entry', source: 'device' },
    ]);

    expect(result).toHaveLength(MAX_CONSOLE_ENTRIES);
    expect(result[0]?.message).toBe('entry-1');
    expect(result[result.length - 1]?.message).toBe('new-entry');
  });
});
