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
import { ICON_SIZES } from '../theme/tokens';
import { Button } from '../ui';
import { MigrationDifferenceView } from './MigrationDifferenceView';
import { Modal } from './Modal';
import { useT } from '../i18n';

const KIB = 1024;
const sizeOf = (bytes: number) => (bytes < KIB * KIB ? `${Math.max(1, Math.round(bytes / KIB))} KiB` : `${(bytes / (KIB * KIB)).toFixed(1)} MiB`);

export function ImportArchive({ disabled = false }: { disabled?: boolean }) {
  const { t, tn } = useT();
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
      <Button
        onClick={() => { void choose(); }}
        disabled={disabled || busy !== null}
        data-import-archive-button
        icon={<Archive size={ICON_SIZES.md} className="text-[var(--color-accent-blue)]" />}
      >
        {busy === 'reading' ? t('importArchive.readingTheArchive') : t('importArchive.importAProjectArchive')}
      </Button>
      {failure && !summary && <p role="alert" data-import-archive-error className="mt-2 break-words text-sm leading-5 text-[var(--color-accent-red)]">{failure}</p>}

      {summary && review && (
        <Modal isOpen onClose={() => busy === null && setSummary(null)} title={t('importArchive.importAProjectArchive2')} widthClass="max-w-3xl">
          <div className="space-y-3 p-4" data-import-archive-dialog>
            <p className="text-sm text-[var(--color-surface-200)]">
              <span className="font-mono">{summary.fileName}</span>{' '}{t('importArchive.holds', { files: tn('importArchive.files', review.fileCount), folders: tn('importArchive.folders', review.folderCount), size: sizeOf(summary.bytes) })}
            </p>
            {review.openable ? (
              <p className="text-sm text-[var(--color-surface-100)]" data-import-archive-project>
                {t('welcome.recent.unnamed')}{' '}<strong>{review.name}</strong>{t('importArchive.version')}{' '}{review.version}{t('importArchive.projectFormat')}{' '}{review.schemaVersion === 1 ? t('importArchive.1ItMigratesTo') : '2'}.
              </p>
            ) : (
              <p role="alert" data-import-archive-problem className="text-sm text-[var(--color-accent-yellow)]">{review.problem}</p>
            )}
            {review.difference && review.difference.changed && (
              <div>
                <p className="mb-2 text-sm text-[var(--color-surface-200)]">{t('importArchive.theFilesAreImported')}</p>
                <MigrationDifferenceView difference={review.difference} />
              </div>
            )}
            {failure && <p role="alert" data-import-archive-error className="break-words text-sm text-[var(--color-accent-red)]">{failure}</p>}
            <div className="flex justify-end gap-2">
              <Button disabled={busy !== null} onClick={() => setSummary(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" disabled={busy !== null || !review.openable} onClick={() => { void importIt(); }} data-import-archive-confirm>
                {busy === 'importing' ? t('importArchive.importing') : t('importArchive.chooseAFolderAnd')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
