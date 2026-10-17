/**
 * The questions of the project tree operations (IDE-004): a name (new folder, rename), a destination (move) and the
 * confirmation to delete a folder. Each one runs the operation itself and shows the refusal in its own words without
 * closing, so the user can correct the name or choose another folder. Escape and the backdrop cancel.
 */
import { useState, type FormEvent } from 'react';
import { AlertDialog, Button, Select, TextField } from '../ui';
import { useT } from '../i18n';
import { Modal } from './Modal';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'The operation failed. Try again.');

export interface FolderChoice { path: string; label: string }

function Actions({ busy, submitLabel, onCancel }: { busy: boolean; submitLabel: string; onCancel: () => void }) {
  const { t } = useT();
  return (
    <div className="flex justify-end gap-2 pt-5">
      <Button disabled={busy} onClick={onCancel}>{t('common.cancel')}</Button>
      <Button type="submit" variant="primary" disabled={busy}>{busy ? t('common.working') : submitLabel}</Button>
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
  const { t } = useT();
  const [name, setName] = useState(initialName);
  const [folder, setFolder] = useState(initialFolder ?? '');
  const { busy, error, attempt } = useAttempt();
  const submit = (event: FormEvent) => { event.preventDefault(); void attempt(() => onSubmit(name, folder)); };
  return (
    <Modal isOpen onClose={() => { if (!busy) onCancel(); }} title={title} widthClass="max-w-md" showCloseButton={!busy}>
      <form className="p-4" onSubmit={submit} data-entry-dialog>
        {folders && (
          <Select id="entry-folder" label={t('dialog.folder')} fieldClassName="mb-3" value={folder} onChange={(event) => setFolder(event.target.value)}>
            {folders.map((choice) => <option key={choice.path} value={choice.path}>{choice.label}</option>)}
          </Select>
        )}
        <TextField
          id="entry-name"
          label={t('dialog.name')}
          data-autofocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          autoComplete="off"
          spellCheck={false}
          error={error ?? undefined}
        />
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
  const { t } = useT();
  const [folder, setFolder] = useState(initialFolder);
  const { busy, error, attempt } = useAttempt();
  const submit = (event: FormEvent) => { event.preventDefault(); void attempt(() => onMove(folder)); };
  return (
    <Modal isOpen onClose={() => { if (!busy) onCancel(); }} title={t('dialog.moveTitle', { name })} widthClass="max-w-md" showCloseButton={!busy}>
      <form className="p-4" onSubmit={submit} data-entry-dialog>
        <Select id="entry-folder" label={t('dialog.moveTo')} data-autofocus value={folder} onChange={(event) => setFolder(event.target.value)} error={error ?? undefined}>
          {folders.map((choice) => <option key={choice.path} value={choice.path}>{choice.label}</option>)}
        </Select>
        <Actions busy={busy} submitLabel={t('common.move')} onCancel={onCancel} />
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
  const { t } = useT();
  const { busy, error, attempt } = useAttempt();
  return (
    <AlertDialog
      open
      title={t('fileMenu.deleteFolder')}
      description={`${t('dialog.deleteFolder.confirm', { name })} ${t('dialog.deleteFolder.permanent')}`}
      cancelLabel={t('common.cancel')}
      actionLabel={t('fileMenu.deleteFolder')}
      destructive
      busy={busy}
      onAction={() => { void attempt(onConfirm); }}
      onCancel={onCancel}
    >
      {modifiedFiles.length > 0 && (
        <div className="text-sm text-[var(--color-accent-yellow)]">
          <p>{t('dialog.deleteFolder.unsaved')}</p>
          <ul className="mt-1 list-disc pl-5">{modifiedFiles.map((file) => <li key={file}>{file}</li>)}</ul>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-[var(--color-accent-red)]">{error}</p>}
    </AlertDialog>
  );
}
