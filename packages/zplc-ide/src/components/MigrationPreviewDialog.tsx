/**
 * The difference that migrating the open version 1 project makes, before it is applied (IDE-022). Opening the project
 * changed nothing on disk; this shows the text of zplc.json as it is, against the text Save will write, and Apply
 * migration is the Save. Closing it leaves the project as it was.
 */
import { useEffect, useState } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { describeMigration, type MigrationDifference } from '../project/migrationDiff';
import { MigrationDifferenceView } from './MigrationDifferenceView';
import { Button } from '../ui';
import { Modal } from './Modal';

export function MigrationPreviewDialog({ onClose }: { onClose: () => void }) {
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
    return () => { current = false; };
  }, [directoryHandle, projectConfig]);

  const apply = async () => {
    setApplying(true);
    await saveProjectConfig();
    onClose();
  };

  return (
    <Modal isOpen onClose={() => !applying && onClose()} title="Migrate the project to version 2" widthClass="max-w-3xl">
      <div className="space-y-3 p-4" data-migration-preview>
        <p className="text-sm text-[var(--color-surface-200)]">
          This project is version {preview?.sourceSchemaVersion ?? 1}. Studio opened it as version 2 and has written nothing: the files on disk are as they were.
          Only <code className="font-mono">zplc.json</code> changes; your programs are not touched. Apply migration writes the text below.
        </p>
        {problem && <p role="alert" className="text-sm text-[var(--color-accent-yellow)]">{problem}</p>}
        {!difference && !problem && <p role="status" className="text-sm text-[var(--color-surface-300)]">Reading zplc.json…</p>}
        {difference && (difference.changed
          ? <MigrationDifferenceView difference={difference} />
          : <p role="status" className="text-sm text-[var(--color-surface-300)]">Nothing in zplc.json differs from what Save writes.</p>)}
        <div className="flex justify-end gap-2">
          <Button disabled={applying} onClick={onClose}>Close</Button>
          <Button variant="primary" disabled={applying || !difference} onClick={() => { void apply(); }}>
            {applying ? 'Applying…' : 'Apply migration'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
