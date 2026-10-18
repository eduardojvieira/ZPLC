/**
 * The declarations of the project under the file tree (IDE-023): the function blocks, functions and data types that
 * its Structured Text files declare, grouped under their file, and the library folders. A declaration opens its file at
 * its line. A library folder is a folder of the project whose files every editor offers (the palettes of FBD and LD,
 * the completion and hover of ST); it is named in `zplc.json` under `libraries`.
 */
import { useState, type FormEvent } from 'react';
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
  const tree = useIDEStore((state) => state.fileTree);
  const config = useIDEStore((state) => state.projectConfig);
  const updateProjectConfig = useIDEStore((state) => state.updateProjectConfig);
  const saveProjectConfig = useIDEStore((state) => state.saveProjectConfig);
  const libraries = configuredLibraries(config);
  const choices = libraryChoices(tree, libraries);
  const [folder, setFolder] = useState(choices[0]?.path ?? '');
  const [busy, setBusy] = useState(false);
  const problem = folder === '' ? 'Choose a folder.' : libraryProblem(folder, tree, libraries);

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
    <Modal isOpen onClose={() => { if (!busy) onClose(); }} title="Add a library folder" widthClass="max-w-md" showCloseButton={!busy}>
      <form className="p-4" onSubmit={(event) => { void submit(event); }} data-library-dialog>
        <p className="mb-3 text-sm text-[var(--color-surface-200)]">The function blocks, functions and types declared in the Structured Text files of this folder become available in every editor of the project.</p>
        {choices.length === 0 ? (
          <p role="status" className="text-sm text-[var(--color-surface-300)]">The project has no other folder to add. Create one in the Explorer first.</p>
        ) : (
          <>
            <Select id="library-folder" label="Folder" value={folder} onChange={(event) => setFolder(event.target.value)} error={problem ?? undefined}>
              {choices.map((choice) => <option key={choice.path} value={choice.path}>{choice.label}</option>)}
            </Select>
          </>
        )}
        <div className="flex justify-end gap-2 pt-5">
          <Button disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || problem !== null}>{busy ? 'Adding…' : 'Add library'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ProjectDeclarations() {
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
    <section aria-label="Project declarations" data-project-declarations className="max-h-[45%] shrink-0 overflow-y-auto border-t border-[var(--color-surface-700)] text-xs">
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
            Declarations
            <span className="rounded-full bg-[var(--tone-neutral-bg)] px-1.5 font-normal normal-case text-[var(--tone-neutral-fg)]">{total}</span>
            {unlisted.length > 0 && (
              <span className="rounded-full border border-[var(--color-accent-yellow)] px-1.5 font-normal normal-case text-[var(--color-accent-yellow)]">{unlisted.length} not compiled</span>
            )}
          </Button>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setExpanded(true); setAdding(true); }}
          disabled={migrating}
          tooltip={migrating ? 'Apply the migration of the project first' : 'Add a library folder'}
          aria-label="Add library folder"
          icon={<FolderPlus size={ICON_SIZES.sm} />}
        >
          Library folder…
        </Button>
      </div>

 {expanded && <div id="project-declarations-body">
      {rows.length > 0 && (
        <ul aria-label="Library folders" data-libraries className="px-3 pb-2">
          {rows.map((row) => (
            <li key={row.path} data-library={row.path} className="flex items-center justify-between gap-2 py-0.5">
              <span className="min-w-0 truncate font-mono text-[var(--color-surface-100)]">{row.path}/ <span className="font-sans text-[var(--color-surface-400)]">{row.missing ? 'not in the project' : `${row.files} file${row.files === 1 ? '' : 's'}`}</span></span>
              <IconButton size="sm" label={`Remove library ${row.path}`} tooltip="Stop using as a library" icon={<X size={ICON_SIZES.sm} />} disabled={migrating} onClick={() => { void remove(row.path); }} />
            </li>
          ))}
        </ul>
      )}

      {groups.length === 0 ? (
        <p className="px-3 pb-3 text-[var(--color-surface-400)]">No function block, function or type is declared yet.</p>
      ) : (
        <ul aria-label="Declarations by file" className="max-h-56 overflow-y-auto pb-2">
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
          <p className="text-[var(--color-accent-yellow)]">Not compiled: neither in src nor directly in a library folder.</p>
          <ul aria-label="Files no build reads" className="mt-1">
            {unlistedFolders.map((folder) => {
              const files = unlisted.filter((path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '') === folder);
              const problem = libraryProblem(folder, tree, libraries);
              return (
                <li key={folder} data-unlisted-folder={folder} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="min-w-0 truncate font-mono text-[var(--color-surface-100)]">{folder === '' ? 'project folder' : `${folder}/`} <span className="font-sans text-[var(--color-surface-400)]">{files.length} file{files.length === 1 ? '' : 's'}</span></span>
                  <Button
                    size="sm"
                    onClick={() => { void list(folder); }}
                    disabled={problem !== null || migrating}
                    tooltip={problem ?? (migrating ? 'Apply the migration of the project first' : `List ${folder} under libraries of zplc.json`)}
                    aria-label={`List ${folder === '' ? 'the project folder' : folder} as a library`}
                    className="shrink-0"
                  >
                    List as library
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
