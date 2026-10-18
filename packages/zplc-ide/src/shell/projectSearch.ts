/**
 * Search in the project (UX-011): the text of the project's Structured Text and instruction list files, with the matches
 * grouped by file. A pure function over the text of the files and a reader of those files; the view is `SearchView`.
 * Diagrams (ladder, function block, sequential function chart) are stored as JSON models and are not searched.
 */
import type { FileTreeNode, ProjectFileWithHandle } from '../types';

export interface SearchableFile { path: string; content: string }
export interface SearchMatch {
  line: number;
  column: number;
  /** The line without its leading whitespace, shortened to `lineLength` characters. */
  text: string;
  /** Where the match starts in `text`, and how long it is. */
  start: number;
  length: number;
}
export interface SearchFileResult { path: string; matches: SearchMatch[] }
export interface SearchResults { files: SearchFileResult[]; total: number; truncated: boolean }

export const SEARCH_LIMITS = { files: 400, matches: 500, perFile: 100, lineLength: 200 } as const;
/** The languages whose files are text that the search reads. */
export const SEARCHABLE_LANGUAGES: ReadonlySet<string> = new Set(['ST', 'IL']);

export const EMPTY_RESULTS: SearchResults = { files: [], total: 0, truncated: false };

/** The matches of a query in the files, in path order and then line order. A blank query matches nothing. */
export function searchProject(files: readonly SearchableFile[], query: string, options: { caseSensitive?: boolean } = {}): SearchResults {
  if (query.trim() === '') return EMPTY_RESULTS;
  const needle = options.caseSensitive ? query : query.toLowerCase();
  const results: SearchFileResult[] = [];
  let total = 0;
  let truncated = false;
  for (const file of [...files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))) {
    const matches: SearchMatch[] = [];
    const lines = file.content.split(/\r\n|\r|\n/);
    for (let index = 0; index < lines.length && !truncated; index += 1) {
      const raw = lines[index]!;
      const haystack = options.caseSensitive ? raw : raw.toLowerCase();
      for (let from = haystack.indexOf(needle); from !== -1; from = haystack.indexOf(needle, from + needle.length)) {
        if (total >= SEARCH_LIMITS.matches || matches.length >= SEARCH_LIMITS.perFile) { truncated = true; break; }
        const indent = raw.length - raw.trimStart().length;
        const text = raw.trimStart().slice(0, SEARCH_LIMITS.lineLength);
        matches.push({ line: index + 1, column: from + 1, text, start: Math.max(0, from - indent), length: query.length });
        total += 1;
      }
    }
    if (matches.length > 0) results.push({ path: file.path, matches });
    if (total >= SEARCH_LIMITS.matches) { truncated = true; break; }
  }
  return { files: results, total, truncated };
}

export interface ReadSearchableInput {
  tree: FileTreeNode | null;
  loaded: ReadonlyMap<string, ProjectFileWithHandle>;
  read: (node: FileTreeNode) => Promise<string>;
}

/** The text files of the project: the content a file has in its editor when it is open (unsaved edits included), the disk's otherwise. */
export async function readSearchableFiles({ tree, loaded, read }: ReadSearchableInput): Promise<SearchableFile[]> {
  const nodes: FileTreeNode[] = [];
  const visit = (node: FileTreeNode): void => {
    if (node.type === 'file') { if (node.language && SEARCHABLE_LANGUAGES.has(node.language)) nodes.push(node); return; }
    for (const child of node.children ?? []) visit(child);
  };
  if (tree) visit(tree);
  const files = await Promise.all(nodes.slice(0, SEARCH_LIMITS.files).map(async (node): Promise<SearchableFile | null> => {
    const open = loaded.get(node.id);
    if (open) return { path: node.path, content: open.content };
    try { return { path: node.path, content: await read(node) }; } catch { return null; }
  }));
  return files.filter((file): file is SearchableFile => file !== null);
}
