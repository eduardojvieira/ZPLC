import { describe, expect, it } from 'bun:test';

import type { RecentProject } from '../../electron/projectFilesProtocol';
import { UNAVAILABLE_REASON, formatLastOpened, recentRows } from './welcomeRecent';

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('when a recent project was last opened (IDE-008)', () => {
  it('says how long ago in the units a person thinks in', () => {
    expect(formatLastOpened(NOW, NOW)).toBe('just now');
    expect(formatLastOpened(NOW - 59_000, NOW)).toBe('just now');
    expect(formatLastOpened(NOW - MINUTE, NOW)).toBe('1 minute ago');
    expect(formatLastOpened(NOW - 5 * MINUTE, NOW)).toBe('5 minutes ago');
    expect(formatLastOpened(NOW - HOUR, NOW)).toBe('1 hour ago');
    expect(formatLastOpened(NOW - 23 * HOUR, NOW)).toBe('23 hours ago');
    expect(formatLastOpened(NOW - DAY, NOW)).toBe('yesterday');
    expect(formatLastOpened(NOW - 6 * DAY, NOW)).toBe('6 days ago');
  });

  it('gives the date for anything older than a week, in a fixed English form', () => {
    expect(formatLastOpened(Date.UTC(2026, 8, 12, 8, 0, 0), NOW)).toBe('12 Sep 2026');
    expect(formatLastOpened(NOW - 7 * DAY, NOW)).toBe('2 Oct 2026');
  });

  it('does not claim the future: a clock that moved back reads as just now', () => {
    expect(formatLastOpened(NOW + 5 * DAY, NOW)).toBe('just now');
    expect(formatLastOpened(Number.NaN, NOW)).toBe('earlier');
  });
});

describe('the rows of the Recent section (IDE-008)', () => {
  const entry = (name: string, ago: number, available = true): RecentProject => ({ recentId: `${name}`.padEnd(64, '0'), displayName: name, lastOpenedAt: NOW - ago, available });

  it('keeps the order the main process gave, the most recent first, so that the first row is the last project', () => {
    const rows = recentRows([entry('plant', MINUTE), entry('line', 3 * DAY)], NOW);
    expect(rows.map((row) => row.name)).toEqual(['plant', 'line']);
    expect(rows[0]).toEqual({ recentId: 'plant'.padEnd(64, '0'), name: 'plant', opened: '1 minute ago', available: true, reason: null });
  });

  it('marks a folder that is gone as unavailable and says why, in words that name no path', () => {
    const [row] = recentRows([entry('plant', HOUR, false)], NOW);
    expect(row).toMatchObject({ available: false, reason: UNAVAILABLE_REASON });
    expect(UNAVAILABLE_REASON).not.toMatch(/[\\/]/);
    expect(UNAVAILABLE_REASON.toLowerCase()).toContain('moved or deleted');
  });

  it('shows nothing for an empty list', () => {
    expect(recentRows([], NOW)).toEqual([]);
  });

  it('uses a generic name when the folder name is empty', () => {
    expect(recentRows([entry('', MINUTE)], NOW)[0]!.name).toBe('Project');
  });
});
