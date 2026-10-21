/**
 * The difference that migrating the open version 1 project makes, before it is applied (IDE-022). Opening the project
 * changed nothing on disk; this shows the text of zplc.json as it is, against the text Save will write, and Apply
 * migration is the Save. Closing it leaves the project as it was.
 */
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useIDEStore } from '../store/useIDEStore';
import { describeMigration, type MigrationDifference } from '../project/migrationDiff';
import { MigrationDifferenceView } from './MigrationDifferenceView';
import { Button } from '../ui';
import { Modal } from './Modal';

export function MigrationPreviewDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const directoryHandle = useIDEStore((state) => state.directoryHandle);
  const projectConfig = useIDEStore((state) => state.projectConfig);
  const preview = useIDEStore((state) => state.projectMigrationPreview);
  const saveProjectConfig = useIDEStore((state) => state.saveProjectConfig);
  const [difference, setDifference] = useState<MigrationDifference | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        if (!directoryHandle || !projectConfig) throw new Error('no project');
        const text = await (await (await directoryHandle.getFileHandle('zplc.json')).getFile()).text();
        if (current) setDifference(describeMigration(text, projectConfig));
      } catch {
        if (current) setProblem('zplc.json could not be read to show the difference.');
      }
    })();
    return () => {
      current = false;
    };
  }, [directoryHandle, projectConfig]);

  const apply = async () => {
    setApplying(true);
    await saveProjectConfig();
    onClose();
  };

  return (
    <Modal isOpen onClose={() => !applying && onClose()} title={t('workbench.migration.title')} widthClass="max-w-3xl">
      <div className="space-y-3 p-4" data-migration-preview>
        <p className="text-sm text-[var(--color-surface-200)]">
          {t('workbench.migration.intro', { version: preview?.sourceSchemaVersion ?? 1 })} {t('workbench.migration.onlyBefore')}
          <code className="font-mono">zplc.json</code>
          {t('workbench.migration.onlyAfter')}
        </p>
        {problem && (
          <p role="alert" className="text-sm text-[var(--color-accent-yellow)]">
            {problem}
          </p>
        )}
        {!difference && !problem && (
          <p role="status" className="text-sm text-[var(--color-surface-300)]">
            {t('workbench.migration.reading')}
          </p>
        )}
        {difference &&
          (difference.changed ? (
            <MigrationDifferenceView difference={difference} />
          ) : (
            <p role="status" className="text-sm text-[var(--color-surface-300)]">
              {t('workbench.migration.nothing')}
            </p>
          ))}
        <div className="flex justify-end gap-2">
          <Button disabled={applying} onClick={onClose}>
            {t('workbench.migration.close')}
          </Button>
          <Button
            variant="primary"
            disabled={applying || !difference}
            onClick={() => {
              void apply();
            }}
          >
            {applying ? t('workbench.migration.applying') : t('workbench.migration.apply')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
