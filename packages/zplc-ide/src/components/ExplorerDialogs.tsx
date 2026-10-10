/**
 * The questions of the project tree operations (IDE-004): a name (new folder, rename), a destination (move) and the
 * confirmation to delete a folder. Each one runs the operation itself and shows the refusal in its own words without
 * closing, so the user can correct the name or choose another folder. Escape and the backdrop cancel.
 */
import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';

const BUTTON = 'px-4 py-2 text-sm rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-50';
const FIELD = 'w-full px-3 py-2 bg-[var(--color-surface-900)] border border-[var(--color-surface-500)] rounded text-sm text-[var(--color-surface-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]';
const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'The operation failed. Try again.');

export interface FolderChoice { path: string; label: string }

function Actions({ busy, submitLabel, onCancel, danger = false }: { busy: boolean; submitLabel: string; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-5">
      <button type="button" disabled={busy} onClick={onCancel} className={`${BUTTON} bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-100)]`}>Cancel</button>
      <button type="submit" disabled={busy} className={`${BUTTON} text-white ${danger ? 'bg-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/80' : 'bg-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/80'}`}>{busy ? 'Working…' : submitLabel}</button>
    </div>
  );
}

function useAttempt() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = async (run: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await run(); } catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  };
  return { busy, error, attempt };
}

/** A name, and for a new folder the folder to make it in. */
export function EntryNameDialog({ title, initialName, submitLabel, folders, initialFolder, onSubmit, onCancel }: {
  title: string;
  initialName: string;
  submitLabel: string;
  /** Offered only when the entry is made in a folder the user picks. */
  folders?: FolderChoice[];
  initialFolder?: string;
  onSubmit: (name: string, folder: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [folder, setFolder] = useState(initialFolder ?? '');
  const { busy, error, attempt } = useAttempt();
  const submit = (event: FormEvent) => { event.preventDefault(); void attempt(() => onSubmit(name, folder)); };
  return (
    <Modal isOpen onClose={() => { if (!busy) onCancel(); }} title={title} widthClass="max-w-md" showCloseButton={!busy}>
      <form className="p-4" onSubmit={submit} data-entry-dialog>
        {folders && (
          <div className="mb-3">
            <label htmlFor="entry-folder" className="block text-sm text-[var(--color-surface-200)] mb-1">Folder</label>
            <select id="entry-folder" value={folder} onChange={(event) => setFolder(event.target.value)} className={FIELD}>
              {folders.map((choice) => <option key={choice.path} value={choice.path}>{choice.label}</option>)}
            </select>
          </div>
        )}
        <label htmlFor="entry-name" className="block text-sm text-[var(--color-surface-200)] mb-1">Name</label>
        <input id="entry-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} onFocus={(event) => event.currentTarget.select()} autoComplete="off" spellCheck={false} aria-invalid={error !== null} aria-describedby={error ? 'entry-error' : undefined} className={FIELD} />
        {error && <p id="entry-error" role="alert" className="mt-2 text-sm text-[var(--color-accent-red)]">{error}</p>}
        <Actions busy={busy} submitLabel={submitLabel} onCancel={onCancel} />
      </form>
    </Modal>
  );
}

/** The folder to move an entry into. */
export function MoveDialog({ name, folders, initialFolder, onMove, onCancel }: {
  name: string;
  folders: FolderChoice[];
  initialFolder: string;
  onMove: (folder: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [folder, setFolder] = useState(initialFolder);
  const { busy, error, attempt } = useAttempt();
  const submit = (event: FormEvent) => { event.preventDefault(); void attempt(() => onMove(folder)); };
  return (
    <Modal isOpen onClose={() => { if (!busy) onCancel(); }} title={`Move ${name}`} widthClass="max-w-md" showCloseButton={!busy}>
      <form className="p-4" onSubmit={submit} data-entry-dialog>
        <label htmlFor="entry-folder" className="block text-sm text-[var(--color-surface-200)] mb-1">Move to folder</label>
        <select id="entry-folder" autoFocus value={folder} onChange={(event) => setFolder(event.target.value)} className={FIELD}>
          {folders.map((choice) => <option key={choice.path} value={choice.path}>{choice.label}</option>)}
        </select>
        {error && <p role="alert" className="mt-2 text-sm text-[var(--color-accent-red)]">{error}</p>}
        <Actions busy={busy} submitLabel="Move" onCancel={onCancel} />
      </form>
    </Modal>
  );
}

/** Deleting a folder removes everything in it from the disk; modified files that are open in it are named. */
export function DeleteFolderDialog({ name, modifiedFiles, onConfirm, onCancel }: {
  name: string;
  modifiedFiles: string[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const { busy, error, attempt } = useAttempt();
  const submit = (event: FormEvent) => { event.preventDefault(); void attempt(onConfirm); };
  return (
    <Modal isOpen onClose={() => { if (!busy) onCancel(); }} title="Delete folder" widthClass="max-w-sm" showCloseButton={!busy}>
      <form className="p-4" onSubmit={submit} data-entry-dialog>
        <p className="text-[var(--color-surface-200)]">Delete <strong>{name}</strong> and everything in it?</p>
        <p className="mt-1 text-sm text-[var(--color-surface-400)]">This permanently removes the folder from disk and cannot be undone.</p>
        {modifiedFiles.length > 0 && (
          <div className="mt-3 text-sm text-[var(--color-accent-orange)]">
            <p>These files have changes that are not saved and will be lost:</p>
            <ul className="mt-1 list-disc pl-5">{modifiedFiles.map((file) => <li key={file}>{file}</li>)}</ul>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-[var(--color-accent-red)]">{error}</p>}
        <Actions busy={busy} submitLabel="Delete folder" onCancel={onCancel} danger />
      </form>
    </Modal>
  );
}
