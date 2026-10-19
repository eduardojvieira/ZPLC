/**
 * The two ways out of the project menu: one archive that imports back into an equivalent project (IDE-022), and the
 * JSON document that lists the files and the configuration with its secrets left out (it does not import).
 */
import { Archive, Download } from 'lucide-react';
import { useT } from '../i18n';
import { useIDEStore } from '../store/useIDEStore';
import { redactProjectConfigForExport } from '../project/sensitiveConfig';
import { exportOpenProjectArchive } from '../utils/projectArchiveActions';
import { collectProjectFilesForExport } from '../utils/projectExport';

const ITEM = 'focus-ring w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--menu-item-bg-active)] transition-colors';

async function exportProjectAsJson(): Promise<void> {
  const snapshot = useIDEStore.getState();
  const { projectSession, fileTree: tree, projectConfig: config, addConsoleEntry } = snapshot;
  const files = new Map(snapshot.loadedFiles);

  if (!config || !tree) {
    addConsoleEntry({ type: 'error', message: 'No project open', source: 'system' });
    return;
  }

  try {
    const fileList = await collectProjectFilesForExport(tree, files);
    const current = useIDEStore.getState();
    if (current.projectSession !== projectSession || current.fileTree !== tree || current.projectConfig !== config) {
      throw new Error('Project changed while preparing the export; no file was downloaded');
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

    addConsoleEntry({ type: 'success', message: `Project export download started: ${config.name} (${redactedPaths.length} sensitive fields omitted)`, source: 'system' });
  } catch (e) {
    addConsoleEntry({ type: 'error', message: `Failed to export: ${e instanceof Error ? e.message : String(e)}`, source: 'system' });
  }
}

export function ProjectExportItems() {
  const { t } = useT();
  return (
    <>
      <button type="button" role="menuitem" onClick={() => { void exportOpenProjectArchive(); }} className={ITEM} aria-label={t('workbench.export.archiveLabel')}>
        <Archive size={14} />
        <span>{t('workbench.export.archive')}</span>
      </button>
      <button type="button" role="menuitem" onClick={() => { void exportProjectAsJson(); }} className={ITEM} aria-label={t('workbench.export.projectLabel')}>
        <Download size={14} />
        <span>{t('workbench.export.project')}</span>
      </button>
    </>
  );
}
