/**
 * Search in the project (UX-011, FND-003): a text field, the matches grouped by file, and a click that opens the file at the line,
 * or, for a match in a diagram, with the element selected as a Problem does.
 */
import { useEffect, useState } from 'react';
import { requestElementSelection } from '../editors/elementSelectionRequests';
import { useT } from '../i18n';
import { describeElement } from '../models/sourceElements';
import { ReferencesPanel } from '../refs/ReferencesPanel';
import { useReferences } from '../refs/useReferences';
import { useIDEStore } from '../store/useIDEStore';
import { loadFileFromTree } from '../utils/fileSystem';
import { Button, Checkbox, TextField, ToggleGroup } from '../ui';
import {
  EMPTY_RESULTS,
  SEARCHABLE_LANGUAGES,
  SEARCH_LIMITS,
  readSearchableFiles,
  searchProject,
  type SearchMatch,
  type SearchResults,
} from './projectSearch';

const SETTLE_MS = 200;

async function readFromDisk(node: Parameters<typeof loadFileFromTree>[0]): Promise<string> {
  const file = await loadFileFromTree(node);
  if (!file) throw new Error('unreadable');
  return file.content;
}

export function SearchView() {
  const { t } = useT();
  const fileTree = useIDEStore((state) => state.fileTree);
  const loadedFiles = useIDEStore((state) => state.loadedFiles);
  const open = useIDEStore((state) => state.navigateToCompilerDiagnostic);
  const mode = useReferences((state) => state.mode);
  const setMode = useReferences((state) => state.setMode);
  // the References mode exists only while there is something to show in it
  const hasReferences = useReferences(
    (state) => state.result !== null || state.choice !== null || state.notice !== null || state.status !== 'idle',
  );
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [settled, setSettled] = useState<{ key: string; results: SearchResults }>({ key: '', results: EMPTY_RESULTS });
  const key = `${caseSensitive ? 1 : 0}:${query}`;
  const blank = query.trim() === '';

  useEffect(() => {
    if (blank) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      void readSearchableFiles({ tree: fileTree, loaded: loadedFiles, read: readFromDisk, languages: SEARCHABLE_LANGUAGES }).then(
        (files) => {
          if (current) setSettled({ key, results: searchProject(files, query, { caseSensitive }) });
        },
      );
    }, SETTLE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [blank, key, query, caseSensitive, fileTree, loadedFiles]);

  // what is shown is the last search that finished for this very text; until then the search is running
  const results = blank || settled.key !== key ? EMPTY_RESULTS : settled.results;
  const place = (match: SearchMatch): string | undefined =>
    match.element ? describeElement(match.element) : match.table !== undefined ? t('search.table', { name: match.table }) : undefined;
  const searching = !blank && settled.key !== key;

  return (
    <div className="flex h-full min-h-0 flex-col font-sans text-sm" data-search-view>
      {hasReferences && (
        <ToggleGroup
          label={t('search.modeLabel')}
          className="m-2 shrink-0"
          options={[
            { value: 'search', label: t('search.modeSearch') },
            { value: 'references', label: t('search.modeReferences') },
          ]}
          value={mode}
          onValueChange={(value) => setMode(value === 'references' ? 'references' : 'search')}
        />
      )}
      {hasReferences && mode === 'references' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ReferencesPanel />
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-2 border-b border-[var(--color-surface-600)] p-2">
            <TextField
              id="project-search"
              label={t('search.query')}
              placeholder={t('search.placeholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Checkbox label={t('search.matchCase')} checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} />
            <p className="text-[length:var(--font-size-caption)] text-[var(--color-surface-300)]">{t('search.scopeAll')}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1" aria-live="polite">
            {searching && <p className="px-3 py-1 text-[var(--color-surface-300)]">{t('search.searching')}</p>}
            {!searching && query.trim() !== '' && results.total === 0 && (
              <p className="px-3 py-1 text-[var(--color-surface-300)]">{t('search.noneSearched', { files: results.searched })}</p>
            )}
            {results.total > 0 && (
              <p className="px-3 py-1 text-[var(--color-surface-300)]" data-search-summary>
                {t('search.summary', { count: results.total, files: results.files.length })}
              </p>
            )}
            {results.truncated && (
              <p className="px-3 py-1 text-[var(--color-accent-yellow)]">{t('search.truncated', { count: SEARCH_LIMITS.matches })}</p>
            )}
            {results.files.map((file) => (
              <section key={file.path} data-search-file={file.path}>
                <h3 className="truncate px-3 pt-2 font-medium text-[var(--color-surface-100)]">{file.path}</h3>
                <ul>
                  {file.matches.map((match, index) => (
                    <li key={`${match.line}:${match.column}:${index}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={
                          place(match)
                            ? t('search.openPlace', { file: file.path, place: place(match)! })
                            : t('search.open', { file: file.path, line: match.line })
                        }
                        onClick={() => {
                          if (match.element) requestElementSelection(file.path, match.element);
                          void open(file.path, match.line, match.column);
                        }}
                        className="h-auto w-full justify-start gap-2 py-0.5 pl-5 pr-2 text-left font-mono"
                      >
                        <span className="text-[var(--color-surface-400)] tabular-nums">{place(match) ?? match.line}</span>
                        <span className="truncate">
                          {match.text.slice(0, match.start)}
                          <mark>{match.text.slice(match.start, match.start + match.length)}</mark>
                          {match.text.slice(match.start + match.length)}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
