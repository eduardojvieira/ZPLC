/**
 * Importing a project archive from the Welcome screen (IDE-022). Choosing the archive reads it and writes nothing; the
 * dialog then says what the archive holds, and for a version 1 project the difference that migrating it makes. Only
 * "Choose a folder and import" asks for an empty folder and writes, and the project then opens as any folder does.
 */
import { useState } from 'react';
import { Archive } from 'lucide-react';
import type { ArchiveSummary } from '../../electron/projectArchiveProtocol';
import { extractArchive, inspectArchive } from '../ipc/projectArchiveBridge';
import { reviewArchive } from '../project/archiveReview';
import { useIDEStore } from '../store/useIDEStore';
import { MigrationDifferenceView } from './MigrationDifferenceView';
import { Modal } from './Modal';

const BUTTON = 'px-4 py-2 text-sm rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-50';
const KIB = 1024;
const sizeOf = (bytes: number) => (bytes < KIB * KIB ? `${Math.max(1, Math.round(bytes / KIB))} KiB` : `${(bytes / (KIB * KIB)).toFixed(1)} MiB`);

export function ImportArchive({ disabled = false }: { disabled?: boolean }) {
  const [summary, setSummary] = useState<ArchiveSummary | null>(null);
  const [busy, setBusy] = useState<'reading' | 'importing' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const choose = async () => {
    setBusy('reading');
    setFailure(null);
    const outcome = await inspectArchive(window.electronAPI?.projectFiles);
    setBusy(null);
    if (outcome.status === 'done') setSummary(outcome.value);
    else if (outcome.status === 'failed') setFailure(outcome.message);
    else if (outcome.status === 'unavailable') setFailure('Importing a project archive needs the desktop app.');
  };

  const importIt = async () => {
    if (!summary) return;
    setBusy('importing');
    setFailure(null);
    const outcome = await extractArchive(window.electronAPI?.projectFiles, summary.archiveId);
    if (outcome.status === 'done') {
      // The folder just written is the answer of the next folder dialog, so the project opens as any folder does.
      const opened = await useIDEStore.getState().openProjectFromFolder();
      setBusy(null);
      if (opened) setSummary(null);
      else setFailure('The project was imported, but it could not be opened. Open its folder from Open project.');
      return;
    }
    setBusy(null);
    if (outcome.status === 'failed') setFailure(outcome.message);
    else if (outcome.status === 'unavailable') setFailure('Importing a project archive needs the desktop app.');
    // A cancelled folder dialog leaves the summary where it was: the user can choose again.
  };

  const review = summary ? reviewArchive(summary) : null;

  return (
    <div className="mt-3" data-import-archive>
      <button
        type="button"
        onClick={() => { void choose(); }}
        disabled={disabled || busy !== null}
        data-import-archive-button
        className="inline-flex items-center gap-2 border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--color-surface-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Archive size={16} aria-hidden="true" className="text-[var(--color-accent-blue)]" />
        {busy === 'reading' ? 'Reading the archive…' : 'Import a project archive…'}
      </button>
      {failure && !summary && <p role="alert" data-import-archive-error className="mt-2 break-words text-sm leading-5 text-[var(--color-accent-red)]">{failure}</p>}

      {summary && review && (
        <Modal isOpen onClose={() => busy === null && setSummary(null)} title="Import a project archive" widthClass="max-w-3xl">
          <div className="space-y-3 p-4" data-import-archive-dialog>
            <p className="text-sm text-[var(--color-surface-200)]">
              <span className="font-mono">{summary.fileName}</span> holds {review.fileCount} file{review.fileCount === 1 ? '' : 's'} and {review.folderCount} folder{review.folderCount === 1 ? '' : 's'}, {sizeOf(summary.bytes)}.
              Nothing has been written. Importing asks for an empty folder and puts the project there.
            </p>
            {review.openable ? (
              <p className="text-sm text-[var(--color-surface-100)]" data-import-archive-project>
                Project <strong>{review.name}</strong>, version {review.version}, project format {review.schemaVersion === 1 ? '1 (it migrates to 2 when you save)' : '2'}.
              </p>
            ) : (
              <p role="alert" data-import-archive-problem className="text-sm text-[var(--color-accent-yellow)]">{review.problem}</p>
            )}
            {review.difference && review.difference.changed && (
              <div>
                <p className="mb-2 text-sm text-[var(--color-surface-200)]">The files are imported as they are. Opened, this project is migrated in memory; saving writes this difference to zplc.json:</p>
                <MigrationDifferenceView difference={review.difference} />
              </div>
            )}
            {failure && <p role="alert" data-import-archive-error className="break-words text-sm text-[var(--color-accent-red)]">{failure}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy !== null} onClick={() => setSummary(null)} className={`${BUTTON} bg-[var(--color-surface-600)] text-[var(--color-surface-100)] hover:bg-[var(--color-surface-500)]`}>Cancel</button>
              <button type="button" disabled={busy !== null || !review.openable} onClick={() => { void importIt(); }} data-import-archive-confirm className={`${BUTTON} bg-[var(--color-accent-blue)] text-white hover:bg-[var(--color-accent-blue)]/80`}>
                {busy === 'importing' ? 'Importing…' : 'Choose a folder and import'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
