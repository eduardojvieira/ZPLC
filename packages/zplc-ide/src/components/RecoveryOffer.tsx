/**
 * After a crash, offers back the modified files that Studio kept (IDE-006): one row per file with its name and the time
 * its content was kept, and Restore or Discard for each. Nothing is restored or removed without the user's choice,
 * except an entry that equals the file on disk or whose file is gone. Closing the dialog decides nothing: the entries
 * stay for the next start.
 */
import { useCallback, useEffect, useState } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { adoptRecovered } from '../store/recoveryPersistence';
import { discardRecovery, listRecovery } from '../ipc/recoveryBridge';
import { projectRootId } from '../ipc/projectFilesHandles';
import { fileTreeFileId, findFileInTree, readFileContent } from '../utils/fileSystem';
import { formatKeptAt, offerRows, type OfferRow } from '../utils/recoveryOffer';
import { Modal } from './Modal';

const BUTTON = 'px-3 py-1.5 text-sm rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)] disabled:cursor-not-allowed disabled:opacity-50';

export function RecoveryOffer() {
  const isProjectOpen = useIDEStore((state) => state.isProjectOpen);
  const projectSession = useIDEStore((state) => state.projectSession);
  const directoryHandle = useIDEStore((state) => state.directoryHandle);
  const rootId = projectRootId(directoryHandle);
  // Rows belong to the project session that listed them: another project never shows them.
  const [offer, setOffer] = useState<{ session: number; rows: OfferRow[] }>({ session: -1, rows: [] });
  const rows = isProjectOpen && offer.session === projectSession ? offer.rows : [];
  const setRows = useCallback((update: (previous: OfferRow[]) => OfferRow[]) => setOffer((previous) => ({ ...previous, rows: update(previous.rows) })), []);
  const bridge = typeof window === 'undefined' ? undefined : window.electronAPI?.recovery;

  useEffect(() => {
    if (!isProjectOpen || rootId === null || !bridge) return;
    let current = true;
    void (async () => {
      const entries = await listRecovery(bridge, rootId);
      if (entries.length === 0 || !current) return;
      const tree = useIDEStore.getState().fileTree;
      const disk = new Map<string, string | null>();
      for (const entry of entries) {
        const node = tree ? findFileInTree(tree, entry.path) : null;
        if (!node?.handle) { disk.set(entry.path, null); continue; }
        try { disk.set(entry.path, await readFileContent(node.handle)); } catch { /* unreadable now: kept for the next start */ }
      }
      const found = offerRows(entries, disk);
      await Promise.all(found.drop.map((path) => discardRecovery(bridge, rootId, path)));
      if (current) setOffer({ session: projectSession, rows: found.rows });
    })();
    return () => { current = false; };
  }, [bridge, isProjectOpen, projectSession, rootId]);

  const restore = useCallback(async (row: OfferRow) => {
    const store = useIDEStore.getState();
    const fileId = fileTreeFileId(row.path);
    await store.openFile(fileId);
    if (!useIDEStore.getState().loadedFiles.has(fileId)) return;
    if (rootId !== null) adoptRecovered(rootId, row.path, row.content);
    useIDEStore.getState().updateFileContent(fileId, row.content);
    setRows((previous) => previous.filter((other) => other.path !== row.path));
  }, [rootId, setRows]);

  const discard = useCallback(async (row: OfferRow) => {
    if (bridge && rootId !== null) await discardRecovery(bridge, rootId, row.path);
    setRows((previous) => previous.filter((other) => other.path !== row.path));
  }, [bridge, rootId, setRows]);

  if (rows.length === 0) return null;
  const everyRow = (action: (row: OfferRow) => Promise<void>) => () => { void (async () => { for (const row of rows) await action(row); })(); };
  return (
    <Modal isOpen onClose={() => setRows(() => [])} title="Recover unsaved changes" widthClass="max-w-lg" showCloseButton={false}>
      <div className="p-4" data-recovery-offer>
        <p className="mb-3 text-sm text-[var(--color-surface-200)]">
          Studio did not close properly last time. These files had changes that were not saved. Restore puts the changes
          back in the editor, still unsaved; Discard removes them.
        </p>
        <ul className="mb-4 space-y-2">
          {rows.map((row) => (
            <li key={row.path} data-recovery-file={row.path} className="flex items-center justify-between gap-3 rounded border border-[var(--color-surface-600)] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--color-surface-100)]">{row.name}</p>
                <p className="truncate text-xs text-[var(--color-surface-400)]">{row.path} · kept at {formatKeptAt(row.savedAt)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" aria-label={`Discard ${row.name}`} onClick={() => { void discard(row); }} className={`${BUTTON} bg-[var(--color-surface-600)] text-[var(--color-surface-100)] hover:bg-[var(--color-surface-500)]`}>Discard</button>
                <button type="button" aria-label={`Restore ${row.name}`} onClick={() => { void restore(row); }} className={`${BUTTON} bg-[var(--color-accent-blue)] text-white hover:bg-[var(--color-accent-blue)]/80`}>Restore</button>
              </div>
            </li>
          ))}
        </ul>
        {rows.length > 1 && (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={everyRow(discard)} className={`${BUTTON} bg-[var(--color-surface-600)] text-[var(--color-surface-100)] hover:bg-[var(--color-surface-500)]`}>Discard all</button>
            <button type="button" onClick={everyRow(restore)} className={`${BUTTON} bg-[var(--color-accent-blue)] text-white hover:bg-[var(--color-accent-blue)]/80`}>Restore all</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
