/**
 * Search in the project (UX-011, FND-003): the text of the project's Structured Text and instruction list files, and the
 * names, variables, comments and expressions of ladder, function block and sequential function chart documents, with the
 * matches grouped by file. A pure function over the text of the files and a reader of those files; the view is `SearchView`.
 * A diagram is stored as a JSON model: it is searched by the fields a person reads (`diagramFields`), never by its JSON text.
 */
import { diagramFields } from '../refs/diagramText';
import type { SourceElementId } from '../models/sourceElements';
import type { FileTreeNode, ProjectFileWithHandle } from '../types';

export type DiagramLanguage = 'LD' | 'FBD' | 'SFC';
const DIAGRAM_LANGUAGES: ReadonlySet<string> = new Set<DiagramLanguage>(['LD', 'FBD', 'SFC']);
const isDiagram = (language: string | undefined): language is DiagramLanguage => language !== undefined && DIAGRAM_LANGUAGES.has(language);

export interface SearchableFile {
  path: string;
  content: string;
  /** Set for a diagram (`LD`, `FBD`, `SFC`); a file without it is searched as text. */
  language?: string;
}
export interface SearchMatch {
  line: number;
  column: number;
  /** The line without its leading whitespace, shortened to `lineLength` characters. */
  text: string;
  /** Where the match starts in `text`, and how long it is. */
  start: number;
  length: number;
  /** A match in a diagram: the element that holds it and the field of the element (`line` and `column` are then 1). */
  element?: SourceElementId;
  field?: string;
  /** A match in a row of a variable table of a diagram: the name of the row (the row has no element). */
  table?: string;
}
export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}
export interface SearchResults {
  files: SearchFileResult[];
  total: number;
  truncated: boolean;
  /** How many files were searched. */
  searched: number;
}

export const SEARCH_LIMITS = { files: 400, matches: 500, perFile: 100, lineLength: 200 } as const;
/** The languages whose files are text. */
export const TEXT_LANGUAGES: ReadonlySet<string> = new Set(['ST', 'IL']);
/** The languages the search reads: the five. */
export const SEARCHABLE_LANGUAGES: ReadonlySet<string> = new Set(['ST', 'IL', 'LD', 'FBD', 'SFC']);

export const EMPTY_RESULTS: SearchResults = { files: [], total: 0, truncated: false, searched: 0 };

const byPath = (left: SearchableFile, right: SearchableFile): number => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0);

/** The matches of a query in the files, in path order and then line (or document) order. A blank query matches nothing. */
export function searchProject(files: readonly SearchableFile[], query: string, options: { caseSensitive?: boolean } = {}): SearchResults {
  if (query.trim() === '') return EMPTY_RESULTS;
  const needle = options.caseSensitive ? query : query.toLowerCase();
  const fold = (text: string): string => (options.caseSensitive ? text : text.toLowerCase());
  const results: SearchFileResult[] = [];
  let total = 0;
  let truncated = false;
  /** Add a match; false when a limit was reached (and `truncated` is set). */
  const room = (matches: SearchMatch[]): boolean => {
    if (total >= SEARCH_LIMITS.matches || matches.length >= SEARCH_LIMITS.perFile) {
      truncated = true;
      return false;
    }
    total += 1;
    return true;
  };
  for (const file of [...files].sort(byPath)) {
    const matches: SearchMatch[] = [];
    if (isDiagram(file.language)) {
      const diagramFile = { path: file.path, language: file.language, content: file.content };
      for (const field of diagramFields(diagramFile)) {
        if (truncated) break;
        const raw = field.text.replace(/\s+/g, ' ');
        const haystack = fold(raw);
        const indent = raw.length - raw.trimStart().length;
        for (let from = haystack.indexOf(needle); from !== -1; from = haystack.indexOf(needle, from + needle.length)) {
          if (!room(matches)) break;
          const where =
            field.place.kind === 'element'
              ? { element: field.place.element }
              : { table: field.place.kind === 'table' ? field.place.name : '' };
          matches.push({
            line: 1,
            column: 1,
            text: raw.trimStart().slice(0, SEARCH_LIMITS.lineLength),
            start: Math.max(0, from - indent),
            length: query.length,
            field: field.field,
            ...where,
          });
        }
      }
    } else {
      const lines = file.content.split(/\r\n|\r|\n/);
      for (let index = 0; index < lines.length && !truncated; index += 1) {
        const raw = lines[index]!;
        const haystack = fold(raw);
        for (let from = haystack.indexOf(needle); from !== -1; from = haystack.indexOf(needle, from + needle.length)) {
          if (!room(matches)) break;
          const indent = raw.length - raw.trimStart().length;
          const text = raw.trimStart().slice(0, SEARCH_LIMITS.lineLength);
          matches.push({ line: index + 1, column: from + 1, text, start: Math.max(0, from - indent), length: query.length });
        }
      }
    }
    if (matches.length > 0) results.push({ path: file.path, matches });
    if (total >= SEARCH_LIMITS.matches) {
      truncated = true;
      break;
    }
  }
  return { files: results, total, truncated, searched: files.length };
}

export interface ReadSearchableInput {
  tree: FileTreeNode | null;
  loaded: ReadonlyMap<string, ProjectFileWithHandle>;
  read: (node: FileTreeNode) => Promise<string>;
  /** The languages to read; the text languages when absent (the search view passes `SEARCHABLE_LANGUAGES`). */
  languages?: ReadonlySet<string>;
}

/** The text files of the project: the content a file has in its editor when it is open (unsaved edits included), the disk's otherwise. */
export async function readSearchableFiles({
  tree,
  loaded,
  read,
  languages = TEXT_LANGUAGES,
}: ReadSearchableInput): Promise<SearchableFile[]> {
  const nodes: FileTreeNode[] = [];
  const visit = (node: FileTreeNode): void => {
    if (node.type === 'file') {
      if (node.language && languages.has(node.language)) nodes.push(node);
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  if (tree) visit(tree);
  const files = await Promise.all(
    nodes.slice(0, SEARCH_LIMITS.files).map(async (node): Promise<SearchableFile | null> => {
      const tag = isDiagram(node.language) ? { language: node.language } : {};
      const open = loaded.get(node.id);
      if (open) return { path: node.path, content: open.content, ...tag };
      try {
        return { path: node.path, content: await read(node), ...tag };
      } catch {
        return null;
      }
    }),
  );
  return files.filter((file): file is SearchableFile => file !== null);
}
