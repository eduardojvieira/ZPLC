import { describe, expect, test } from 'bun:test';
import { visibleHints } from './lessonHints';

describe('visibleHints (CRS-017)', () => {
  test('hidden: the last hint is dropped; shown: every hint stays', () => {
    expect(visibleHints(['a', 'b', 'c'], true)).toEqual(['a', 'b']);
    expect(visibleHints(['a', 'b', 'c'], false)).toEqual(['a', 'b', 'c']);
  });
  test('one hint, hidden: none; no hints: none', () => {
    expect(visibleHints(['a'], true)).toEqual([]);
    expect(visibleHints([], true)).toEqual([]);
  });
});
