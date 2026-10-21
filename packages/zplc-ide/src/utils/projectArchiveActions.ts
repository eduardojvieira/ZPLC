/**
 * The two things a person does with a project archive from the workbench (IDE-022), as plain functions over the store:
 * export the open project, and, from the Welcome screen, import one (the dialog in `ImportArchive.tsx` drives that).
 */
import { exportArchive } from '../ipc/projectArchiveBridge';
import { projectRootId } from '../ipc/projectFilesHandles';
import { useIDEStore } from '../store/useIDEStore';

const KIB = 1024;
const sizeOf = (bytes: number) =>
  bytes < KIB * KIB ? `${Math.max(1, Math.round(bytes / KIB))} KiB` : `${(bytes / (KIB * KIB)).toFixed(1)} MiB`;

/** Writes the open project to one archive file the user chooses; the result is a line in the Output panel. */
export async function exportOpenProjectArchive(): Promise<void> {
  const state = useIDEStore.getState();
  const report = (type: 'success' | 'warning' | 'error' | 'info', message: string) =>
    state.addConsoleEntry({ type, message, source: 'system' });
  const rootId = projectRootId(state.directoryHandle);
  if (!state.isProjectOpen || rootId === null) {
    report('error', 'Exporting a project archive needs a project folder opened in the desktop app.');
    return;
  }
  // An archive holds the files as they are on disk; an export that left the typed text out would be a surprise.
  if (state.hasUnsavedChanges()) {
    report('warning', 'Save the modified files before exporting: an archive holds the project as it is on disk.');
    return;
  }
  const outcome = await exportArchive(window.electronAPI?.projectFiles, rootId);
  if (outcome.status === 'done') {
    const { fileName, fileCount, folderCount, bytes, skipped } = outcome.value;
    report(
      'success',
      `Exported ${fileName}: ${fileCount} files and ${folderCount} folders, ${sizeOf(bytes)}${
        skipped > 0 ? `; ${skipped} link${skipped === 1 ? '' : 's'} left out` : ''
      }.`,
    );
  } else if (outcome.status === 'failed') report('error', `Export failed: ${outcome.message}`);
  else if (outcome.status === 'unavailable') report('error', 'Exporting a project archive needs the desktop app.');
}
