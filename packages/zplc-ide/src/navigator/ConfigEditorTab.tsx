/**
 * The tab of one configuration editor in the tab bar of the editor area, and the question asked when its close would lose edits (UX-013).
 */
import { X } from 'lucide-react';
import { useT } from '../i18n';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';
import { Button } from '../ui';
import { CONFIG_EDITOR_ICONS } from './configEditorSections';
import { CONFIG_EDITOR_TITLE_KEYS, configEditorViewId, type ConfigEditorKind } from './configEditors';

interface ConfigEditorTabProps {
  kind: ConfigEditorKind;
  selected: boolean;
  panelId: string;
  onSelect: (kind: ConfigEditorKind) => void;
  onClose: (kind: ConfigEditorKind) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, viewId: string) => void;
}

export function ConfigEditorTab({ kind, selected, panelId, onSelect, onClose, onKeyDown }: ConfigEditorTabProps) {
  const { t } = useT();
  const title = t(CONFIG_EDITOR_TITLE_KEYS[kind]);
  const viewId = configEditorViewId(kind);
  const Icon = CONFIG_EDITOR_ICONS[kind];
  return (
    <div
      role="presentation"
      data-config-tab={kind}
      className={
        'group flex items-center gap-2 px-3 h-full border-r border-[var(--color-surface-600)] cursor-pointer select-none ' +
        'transition-colors ' +
        (selected
          ? 'bg-[var(--color-surface-700)] text-[var(--color-surface-100)]'
          : 'bg-[var(--color-surface-800)] text-[var(--color-surface-300)] hover:bg-[var(--color-surface-700)]')
      }
    >
      <Button
        variant="bare"
        id={`editor-tab-${viewId}`}
        role="tab"
        aria-selected={selected}
        aria-controls={panelId}
        tabIndex={selected ? 0 : -1}
        onClick={() => onSelect(kind)}
        onKeyDown={(event) => onKeyDown(event, viewId)}
        className="flex min-w-0 items-center gap-2 rounded text-left focus-visible:outline"
      >
        <Icon size={14} className="text-[var(--color-accent-blue)]" aria-hidden />
        <span className="text-sm whitespace-nowrap">{title}</span>
      </Button>
      <Button
        variant="bare"
        type="button"
        onClick={() => onClose(kind)}
        className={
          `p-0.5 rounded ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'} ` +
          'hover:bg-[var(--color-surface-500)] focus-visible:opacity-100 focus-visible:outline transition-opacity'
        }
        aria-label={t('configEditor.close', { title })}
        tooltip={t('configEditor.close', { title })}
      >
        <X size={14} />
      </Button>
    </div>
  );
}

/** Save, discard or keep editing, as the alert dialog the file tabs use. */
export function ConfigCloseDialog({ busy, onChoice }: { busy: boolean; onChoice: (choice: 'save' | 'discard' | 'cancel') => void }) {
  const { t } = useT();
  return (
    <UnsavedChangesDialog
      title={t('configEditor.closeDialogTitle')}
      items={[t('configEditor.closeDialogItem')]}
      busy={busy}
      onChoice={onChoice}
    />
  );
}
