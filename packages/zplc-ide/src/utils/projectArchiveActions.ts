/**
 * The two things a person does with a project archive from the workbench (IDE-022), as plain functions over the store:
 * export the open project, and, from the Welcome screen, import one (the dialog in `ImportArchive.tsx` drives that).
 */
import { exportArchive } from '../ipc/projectArchiveBridge';
import { projectRootId } from '../ipc/projectFilesHandles';
import { t } from '../i18n';
import { useIDEStore } from '../store/useIDEStore';
import { redactProjectConfigForExport } from '../project/sensitiveConfig';
import { collectProjectFilesForExport } from './projectExport';

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
    report('warning', 'Save your changes before exporting: an archive holds the project as it is on disk.');
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

/** Downloads the open project as one JSON document, with the sensitive fields of its configuration omitted (`file.exportProjectJson`). */
export async function exportProjectAsJson(): Promise<void> {
  const snapshot = useIDEStore.getState();
  const { projectSession, fileTree: tree, projectConfig: config, addConsoleEntry } = snapshot;
  const files = new Map(snapshot.loadedFiles);

  if (!config || !tree) {
    addConsoleEntry({ type: 'error', message: t('workbench.export.noProject'), source: 'system' });
    return;
  }

  try {
    const fileList = await collectProjectFilesForExport(tree, files);
    const current = useIDEStore.getState();
    if (current.projectSession !== projectSession || current.fileTree !== tree || current.projectConfig !== config) {
      throw new Error(t('workbench.export.projectChanged'));
    }

    const { config: redactedConfig, redactedPaths } = redactProjectConfigForExport(config);
    const exportData = {
      version: '1.0.0',
      config: redactedConfig,
      files: fileList,
      redactedPaths,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name || 'zplc-project'}.zplc.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addConsoleEntry({
      type: 'success',
      message: t('workbench.export.jsonStarted', { name: config.name, count: redactedPaths.length }),
      source: 'system',
    });
  } catch (e) {
    addConsoleEntry({
      type: 'error',
      message: t('workbench.export.jsonFailed', { message: e instanceof Error ? e.message : String(e) }),
      source: 'system',
    });
  }
}
