/**
 * The filter of the command palette (UX-015): the person types a few letters of a command and the matches come first.
 * A command matches when the letters of the query appear in order in its title (or in its category and title, so that
 * `build` lists the Build menu); matches that start words and run together rank higher. Pure, so it is tested without
 * the dialog.
 */
export interface PaletteEntry {
  id: string;
  title: string;
  category: string;
}

/** The score of a query against a text, or -1 when the query is not a subsequence of it. Higher is better. */
export function fuzzyScore(query: string, text: string): number {
  const needle = query.toLowerCase().replace(/\s+/g, '');
  const haystack = text.toLowerCase();
  if (needle === '') return 0;
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const letter of needle) {
    const at = haystack.indexOf(letter, from);
    if (at < 0) return -1;
    const startsWord = at === 0 || /[\s\-./()]/.test(haystack[at - 1]!);
    score += 1 + (at === previous + 1 ? 3 : 0) + (startsWord ? 2 : 0);
    if (previous === -2) score -= Math.min(at, 8) * 0.25;
    previous = at;
    from = at + 1;
  }
  // A text that is exactly the query, or starts with it, beats a long one that merely contains the letters.
  if (haystack === needle) score += 8;
  else if (haystack.startsWith(needle)) score += 4;
  return score;
}

/** The entries that match, best first; with no query, all of them in the order given. The order of equal scores is kept. */
export function filterEntries<E extends PaletteEntry>(query: string, entries: readonly E[]): E[] {
  if (query.trim() === '') return [...entries];
  const scored: Array<{ entry: E; score: number; index: number }> = [];
  entries.forEach((entry, index) => {
    const own = fuzzyScore(query, entry.title);
    const withCategory = fuzzyScore(query, `${entry.category} ${entry.title}`);
    const score = own >= 0 ? own + 2 : withCategory;
    if (score >= 0) scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map(({ entry }) => entry);
}

/** The index the arrow keys move to; they wrap around the ends. */
export function nextIndex(current: number, delta: 1 | -1, length: number): number {
  return length === 0 ? 0 : (current + delta + length) % length;
}
