/**
 * The declarations of the project under the file tree (IDE-023): the function blocks, functions and data types that
 * its Structured Text files declare, grouped under their file, and the library folders. A declaration opens its file at
 * its line. A library folder is a folder of the project whose files every editor offers (the palettes of FBD and LD,
 * the completion and hover of ST); it is named in `zplc.json` under `libraries`.
 */
import { useState, type FormEvent } from 'react';
import { BookMarked, FileCode2, FolderPlus, X } from 'lucide-react';
import { configuredLibraries, addLibrary, libraryProblem, removeLibrary } from '../project/libraries';
import { useProjectSources } from '../store/projectSources';
import { useIDEStore } from '../store/useIDEStore';
import { Modal } from './Modal';
import { declarationKindLabel, libraryChoices, libraryRows } from './projectDeclarationsPresentation';

const BUTTON = 'px-4 py-2 text-sm rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-50';
const FIELD = 'w-full px-3 py-2 bg-[var(--color-surface-900)] border border-[var(--color-surface-500)] rounded text-sm text-[var(--color-surface-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]';

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
            <label htmlFor="library-folder" className="mb-1 block text-sm text-[var(--color-surface-200)]">Folder</label>
            <select id="library-folder" value={folder} onChange={(event) => setFolder(event.target.value)} className={FIELD}>
              {choices.map((choice) => <option key={choice.path} value={choice.path}>{choice.label}</option>)}
            </select>
            {problem && <p role="alert" className="mt-2 text-sm text-[var(--color-accent-yellow)]">{problem}</p>}
          </>
        )}
        <div className="flex justify-end gap-2 pt-5">
          <button type="button" disabled={busy} onClick={onClose} className={`${BUTTON} bg-[var(--color-surface-600)] text-[var(--color-surface-100)] hover:bg-[var(--color-surface-500)]`}>Cancel</button>
          <button type="submit" disabled={busy || problem !== null} className={`${BUTTON} bg-[var(--color-accent-blue)] text-white hover:bg-[var(--color-accent-blue)]/80`}>{busy ? 'Adding…' : 'Add library'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ProjectDeclarations() {
  const groups = useProjectSources((state) => state.declarations);
  const tree = useIDEStore((state) => state.fileTree);
  const config = useIDEStore((state) => state.projectConfig);
  const migrating = useIDEStore((state) => state.projectMigrationPreview !== null);
  const updateProjectConfig = useIDEStore((state) => state.updateProjectConfig);
  const saveProjectConfig = useIDEStore((state) => state.saveProjectConfig);
  const open = useIDEStore((state) => state.navigateToCompilerDiagnostic);
  const [adding, setAdding] = useState(false);
  const libraries = configuredLibraries(config);
  const rows = libraryRows(libraries, tree);

  const remove = async (path: string) => {
    updateProjectConfig({ libraries: removeLibrary(libraries, path) });
    await saveProjectConfig();
  };

  return (
    <section aria-label="Project declarations" data-project-declarations className="border-t border-[var(--color-surface-700)] text-xs">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <h2 className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.08em] text-[var(--color-surface-200)]"><BookMarked size={13} aria-hidden="true" />Declarations</h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={migrating}
          title={migrating ? 'Apply the migration of the project first' : 'Add a library folder'}
          aria-label="Add library folder"
          className="flex items-center gap-1 rounded px-1.5 py-1 text-[var(--color-accent-blue)] hover:bg-[var(--color-surface-700)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--color-accent-blue)]"
        >
          <FolderPlus size={13} aria-hidden="true" />Library folder…
        </button>
      </div>

      {rows.length > 0 && (
        <ul aria-label="Library folders" data-libraries className="px-3 pb-2">
          {rows.map((row) => (
            <li key={row.path} data-library={row.path} className="flex items-center justify-between gap-2 py-0.5">
              <span className="min-w-0 truncate font-mono text-[var(--color-surface-100)]">{row.path}/ <span className="font-sans text-[var(--color-surface-400)]">{row.missing ? 'not in the project' : `${row.files} file${row.files === 1 ? '' : 's'}`}</span></span>
              <button type="button" onClick={() => { void remove(row.path); }} aria-label={`Remove library ${row.path}`} title="Stop using as a library" disabled={migrating} className="rounded p-0.5 text-[var(--color-surface-300)] hover:bg-[var(--color-surface-700)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--color-accent-blue)]"><X size={12} aria-hidden="true" /></button>
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
                    <button
                      type="button"
                      data-declaration={entry.name}
                      onClick={() => { void open(entry.file, entry.line, entry.column); }}
                      className="flex w-full items-baseline gap-2 py-0.5 pl-8 pr-3 text-left hover:bg-[var(--color-surface-700)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent-blue)]"
                    >
                      <span className="font-medium text-[var(--color-surface-100)]">{entry.name}</span>
                      <span className="text-[var(--color-surface-400)]">{declarationKindLabel(entry.kind)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {adding && <AddLibraryDialog onClose={() => setAdding(false)} />}
    </section>
  );
}
