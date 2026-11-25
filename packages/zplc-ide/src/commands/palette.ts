/**
 * The filter of the command palette (UX-015): the person types a few letters of a command and the matches come first.
 * A command matches when the letters of the query appear in order in its title (or in its category and title, so that
 * `build` lists the Build menu); matches that start words and run together rank higher. Pure, so it is tested without
 * the dialog.
 */
import type { Declaration } from '../project/projectDeclarations';
import type { GlobalVariable } from '../project/globalVariables';
import type { Translator } from '../i18n';
import type { ConfigEditorKind } from '../navigator/configEditors';
import type { FileTreeNode, ZPLCProjectConfig } from '../types';
import type { PaletteGroup } from './paletteSources/contracts';
import type { AppSettings } from '../utils/appSettings';

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

/** The kinds of thing the palette finds, in the order its groups come. */
export const GROUP_ORDER: readonly PaletteGroup[] = ['commands', 'files', 'objects', 'io', 'editors', 'lessons', 'preferences', 'scenes'];
/** A group shows this many rows until the person asks for all of them. */
export const GROUP_LIMIT = 8;

export interface GroupedEntry extends PaletteEntry {
  group: PaletteGroup;
}
export interface RankedGroup<E> {
  group: PaletteGroup;
  entries: E[];
  /** How many matched, before the limit. */
  total: number;
}

/** The groups that have a match, in the fixed order; with no query only the commands (a short list on open). */
export function rankGroups<E extends GroupedEntry>(
  query: string,
  entries: readonly E[],
  expanded: ReadonlySet<PaletteGroup> = new Set(),
): RankedGroup<E>[] {
  const searching = query.trim() !== '';
  const ranked: RankedGroup<E>[] = [];
  for (const group of searching ? GROUP_ORDER : (['commands'] as const)) {
    const matches = filterEntries(
      query,
      entries.filter((entry) => entry.group === group),
    );
    if (matches.length === 0) continue;
    const all = !searching || expanded.has(group);
    ranked.push({ group, entries: all ? matches : matches.slice(0, GROUP_LIMIT), total: matches.length });
  }
  return ranked;
}

/** What the providers read, taken once when the palette opens; the actions are what choosing an item does. */
export interface PaletteSnapshot {
  fileTree: FileTreeNode | null;
  /** The scenes of the project folder, by path: the file tree lists none. */
  scenePaths?: readonly string[];
  declarations: readonly Declaration[];
  globals: readonly GlobalVariable[];
  config: ZPLCProjectConfig | null;
  lessons: readonly { id: string; title: string }[];
  t: Translator['t'];
  open: {
    source: (path: string, line: number, column: number) => void;
    editor: (kind: ConfigEditorKind) => void;
    lesson: (id: string) => void;
    preference: (key: keyof AppSettings) => void;
    scenes: () => void;
  };
}
