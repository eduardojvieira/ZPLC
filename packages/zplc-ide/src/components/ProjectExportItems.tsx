/**
 * The two ways out of the project menu: one archive that imports back into an equivalent project (IDE-022), and the
 * JSON document that lists the files and the configuration with its secrets left out (it does not import).
 */
import { Archive, Download } from 'lucide-react';
import { useT } from '../i18n';
import { exportOpenProjectArchive, exportProjectAsJson } from '../utils/projectArchiveActions';
import { Button } from '../ui';

const ITEM =
  'focus-ring w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--menu-item-bg-active)] ' +
  'transition-colors';

export function ProjectExportItems() {
  const { t } = useT();
  return (
    <>
      <Button
        variant="bare"
        type="button"
        role="menuitem"
        data-command="file.export"
        onClick={() => {
          void exportOpenProjectArchive();
        }}
        className={ITEM}
        aria-label={t('workbench.export.archiveLabel')}
      >
        <Archive size={14} />
        <span>{t('workbench.export.archive')}</span>
      </Button>
      <Button
        variant="bare"
        type="button"
        role="menuitem"
        data-command="file.exportProjectJson"
        onClick={() => {
          void exportProjectAsJson();
        }}
        className={ITEM}
        aria-label={t('workbench.export.projectLabel')}
      >
        <Download size={14} />
        <span>{t('workbench.export.project')}</span>
      </Button>
    </>
  );
}
