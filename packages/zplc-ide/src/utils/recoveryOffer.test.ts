import { describe, expect, it } from 'bun:test';

import { formatKeptAt, offerRows } from './recoveryOffer';

const entry = (path: string, content: string, savedAt = 1_700_000_000_000) => ({ path, content, savedAt });

describe('the offer to restore modified files after a crash (IDE-006)', () => {
  it('offers each file whose kept content differs from the file on disk, by file name and in path order', () => {
    const plan = offerRows([entry('src/Pump.st', 'new pump'), entry('lib/Motor.st', 'new motor')], new Map([['src/Pump.st', 'old pump'], ['lib/Motor.st', 'old motor']]));
    expect(plan.rows.map((row) => [row.path, row.name, row.content])).toEqual([['lib/Motor.st', 'Motor.st', 'new motor'], ['src/Pump.st', 'Pump.st', 'new pump']]);
    expect(plan.drop).toEqual([]);
  });

  it('drops without asking an entry that equals the file on disk (it was saved before the crash)', () => {
    const plan = offerRows([entry('src/Motor.st', 'same')], new Map([['src/Motor.st', 'same']]));
    expect(plan.rows).toEqual([]);
    expect(plan.drop).toEqual(['src/Motor.st']);
  });

  it('drops an entry whose file is gone, and keeps one whose file could not be read for the next start', () => {
    const plan = offerRows([entry('src/Gone.st', 'x'), entry('src/Unread.st', 'y')], new Map([['src/Gone.st', null]]));
    expect(plan.rows).toEqual([]);
    expect(plan.drop).toEqual(['src/Gone.st']);
  });

  it('shows the time of the same day as a clock time and an older one with its date', () => {
    const noon = new Date(2026, 9, 10, 12, 5, 0).getTime();
    const sameDay = new Date(2026, 9, 10, 9, 41, 0).getTime();
    const earlier = new Date(2026, 9, 8, 9, 41, 0).getTime();
    expect(formatKeptAt(sameDay, noon)).toMatch(/9:41|09:41/);
    expect(formatKeptAt(sameDay, noon)).not.toMatch(/2026/);
    expect(formatKeptAt(earlier, noon)).toMatch(/2026/);
  });
});
