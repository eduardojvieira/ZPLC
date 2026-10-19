/**
 * The declarations of the project under the file tree (IDE-023): the function blocks, functions and data types that
 * its Structured Text files declare, grouped under their file, and the library folders. A declaration opens its file at
 * its line. A library folder is a folder of the project whose files every editor offers (the palettes of FBD and LD,
 * the completion and hover of ST); it is named in `zplc.json` under `libraries`.
 */
import { useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { BookMarked, ChevronDown, ChevronRight, FileCode2, FolderPlus, X } from 'lucide-react';
import { configuredLibraries, addLibrary, libraryProblem, removeLibrary } from '../project/libraries';
import { useProjectSources } from '../store/projectSources';
import { useIDEStore } from '../store/useIDEStore';
import { ICON_SIZES } from '../theme/tokens';
import { Button, IconButton, Select } from '../ui';
import { Modal } from './Modal';
import { declarationKindLabel, libraryChoices, libraryRows } from './projectDeclarationsPresentation';

const EXPANDED_KEY = 'zplc-ide.declarations-expanded';

/** Whether the section was left open: kept for the window's session, so that leaving the Explorer tab does not close it. */
function readExpanded(): boolean {
  try { return globalThis.sessionStorage?.getItem(EXPANDED_KEY) === '1'; } catch { return false; }
}

function writeExpanded(value: boolean): void {
  try { globalThis.sessionStorage?.setItem(EXPANDED_KEY, value ? '1' : '0'); } catch { /* not remembered */ }
}


function AddLibraryDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const tree = useIDEStore((state) => state.fileTree);
  const config = useIDEStore((state) => state.projectConfig);
  const updateProjectConfig = useIDEStore((state) => state.updateProjectConfig);
  const saveProjectConfig = useIDEStore((state) => state.saveProjectConfig);
  const libraries = configuredLibraries(config);
  const choices = libraryChoices(tree, libraries);
  const [folder, setFolder] = useState(choices[0]?.path ?? '');
  const [busy, setBusy] = useState(false);
  const problem = folder === '' ? t('library.chooseFolder') : libraryProblem(folder, tree, libraries);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    setBusy(true);
    updateProjectConfig({ libraries: addLibrary(libraries, folder) });
    await saveProjectConfig();
    setBusy(false);
    onClose();
  };

  return (
    <Modal isOpen onClose={() => { if (!busy) onClose(); }} title={t('workbench.declarations.addTitle')} widthClass="max-w-md" showCloseButton={!busy}>
      <form className="p-4" onSubmit={(event) => { void submit(event); }} data-library-dialog>
        <p className="mb-3 text-sm text-[var(--color-surface-200)]">{t('workbench.declarations.addIntro')}</p>
        {choices.length === 0 ? (
          <p role="status" className="text-sm text-[var(--color-surface-300)]">{t('workbench.declarations.noFolder')}</p>
        ) : (
          <>
            <Select id="library-folder" label={t('workbench.declarations.folder')} value={folder} onChange={(event) => setFolder(event.target.value)} error={problem ?? undefined}>
              {choices.map((choice) => <option key={choice.path} value={choice.path}>{choice.label}</option>)}
            </Select>
          </>
        )}
        <div className="flex justify-end gap-2 pt-5">
          <Button disabled={busy} onClick={onClose}>{t('workbench.declarations.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={busy || problem !== null}>{busy ? t('workbench.declarations.adding') : t('workbench.declarations.addLibrary')}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ProjectDeclarations() {
  const { t, tn } = useT();
  const groups = useProjectSources((state) => state.declarations);
  const unlisted = useProjectSources((state) => state.unlisted);
  const tree = useIDEStore((state) => state.fileTree);
  const config = useIDEStore((state) => state.projectConfig);
  const migrating = useIDEStore((state) => state.projectMigrationPreview !== null);
  const updateProjectConfig = useIDEStore((state) => state.updateProjectConfig);
  const saveProjectConfig = useIDEStore((state) => state.saveProjectConfig);
  const open = useIDEStore((state) => state.navigateToCompilerDiagnostic);
  const [adding, setAdding] = useState(false);
  // Closed until asked for: the lower panel is short, and the file tree keeps its room.
  const [expanded, setExpandedState] = useState(readExpanded);
  const setExpanded = (next: boolean | ((current: boolean) => boolean)) => {
    setExpandedState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      writeExpanded(value);
      return value;
    });
  };
  const libraries = configuredLibraries(config);
  const total = groups.reduce((sum, group) => sum + group.declarations.length, 0);
  const rows = libraryRows(libraries, tree);
  // The files no build reads, by folder: listing the folder as a library is what makes the build read them.
  const unlistedFolders = [...new Set(unlisted.map((path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')))];

  const remove = async (path: string) => {
    updateProjectConfig({ libraries: removeLibrary(libraries, path) });
    await saveProjectConfig();
  };

  const list = async (path: string) => {
    updateProjectConfig({ libraries: addLibrary(libraries, path) });
    await saveProjectConfig();
  };

  return (
    <section aria-label={t('workbench.declarations.region')} data-project-declarations className="max-h-[45%] shrink-0 overflow-y-auto border-t border-[var(--color-surface-700)] text-xs">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <h2 className="font-semibold uppercase tracking-[0.08em] text-[var(--color-surface-200)]">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls="project-declarations-body"
            onClick={() => setExpanded((value) => !value)}
            className="uppercase"
            icon={<>{expanded ? <ChevronDown size={ICON_SIZES.sm} /> : <ChevronRight size={ICON_SIZES.sm} />}<BookMarked size={ICON_SIZES.sm} /></>}
          >
            {t('workbench.declarations.title')}
            <span className="rounded-full bg-[var(--tone-neutral-bg)] px-1.5 font-normal normal-case text-[var(--tone-neutral-fg)]">{total}</span>
            {unlisted.length > 0 && (
              <span className="rounded-full border border-[var(--color-accent-yellow)] px-1.5 font-normal normal-case text-[var(--color-accent-yellow)]">{t('workbench.declarations.notCompiledCount', { count: unlisted.length })}</span>
            )}
          </Button>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setExpanded(true); setAdding(true); }}
          disabled={migrating}
          tooltip={migrating ? t('workbench.declarations.migrateFirst') : t('workbench.declarations.addTitle')}
          aria-label={t('workbench.declarations.addFolderLabel')}
          icon={<FolderPlus size={ICON_SIZES.sm} />}
        >
          {t('workbench.declarations.libraryFolder')}
        </Button>
      </div>

 {expanded && <div id="project-declarations-body">
      {rows.length > 0 && (
        <ul aria-label={t('workbench.declarations.libraries')} data-libraries className="px-3 pb-2">
          {rows.map((row) => (
            <li key={row.path} data-library={row.path} className="flex items-center justify-between gap-2 py-0.5">
              <span className="min-w-0 truncate font-mono text-[var(--color-surface-100)]">{row.path}/ <span className="font-sans text-[var(--color-surface-400)]">{row.missing ? t('workbench.declarations.missing') : tn('workbench.declarations.files', row.files)}</span></span>
              <IconButton size="sm" label={t('workbench.declarations.removeLibrary', { path: row.path })} tooltip={t('workbench.declarations.stopLibrary')} icon={<X size={ICON_SIZES.sm} />} disabled={migrating} onClick={() => { void remove(row.path); }} />
            </li>
          ))}
        </ul>
      )}

      {groups.length === 0 ? (
        <p className="px-3 pb-3 text-[var(--color-surface-400)]">{t('workbench.declarations.none')}</p>
      ) : (
        <ul aria-label={t('workbench.declarations.byFile')} className="max-h-56 overflow-y-auto pb-2">
          {groups.map((group) => (
            <li key={group.file} data-declaration-file={group.file}>
              <div className="flex items-center gap-1.5 px-3 pt-1 font-mono text-[var(--color-surface-300)]"><FileCode2 size={12} aria-hidden="true" /><span className="truncate">{group.file}</span></div>
              <ul>
                {group.declarations.map((entry) => (
                  <li key={`${entry.kind}:${entry.name}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-declaration={entry.name}
                      onClick={() => { void open(entry.file, entry.line, entry.column); }}
                      className="w-full justify-start gap-2 pl-8 font-normal"
                    >
                      <span className="font-medium text-[var(--text-primary)]">{entry.name}</span>
                      <span className="text-[var(--text-tertiary)]">{declarationKindLabel(entry.kind)}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {unlisted.length > 0 && (
        <div data-unlisted-sources className="border-t border-[var(--color-surface-700)] px-3 py-2">
          <p className="text-[var(--color-accent-yellow)]">{t('workbench.declarations.notCompiled')}</p>
          <ul aria-label={t('workbench.declarations.unread')} className="mt-1">
            {unlistedFolders.map((folder) => {
              const files = unlisted.filter((path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '') === folder);
              const problem = libraryProblem(folder, tree, libraries);
              return (
                <li key={folder} data-unlisted-folder={folder} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="min-w-0 truncate font-mono text-[var(--color-surface-100)]">{folder === '' ? t('workbench.declarations.projectFolder') : `${folder}/`} <span className="font-sans text-[var(--color-surface-400)]">{tn('workbench.declarations.files', files.length)}</span></span>
                  <Button
                    size="sm"
                    onClick={() => { void list(folder); }}
                    disabled={problem !== null || migrating}
                    tooltip={problem ?? (migrating ? t('workbench.declarations.migrateFirst') : t('workbench.declarations.listTooltip', { folder }))}
                    aria-label={t('workbench.declarations.listLabel', { folder: folder === '' ? t('workbench.declarations.theProjectFolder') : folder })}
                    className="shrink-0"
                  >
                    {t('workbench.declarations.listAsLibrary')}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      </div>}
      {adding && <AddLibraryDialog onClose={() => setAdding(false)} />}
    </section>
  );
}
