/**
 * The tab of one configuration editor in the tab bar of the editor area, and the question asked when its close would lose edits (UX-013).
 */
import { X } from 'lucide-react';
import { useT } from '../i18n';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';
import { Button, IconButton } from '../ui';
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
        `group flex h-full select-none items-center gap-1 border-r border-[var(--color-surface-600)] pl-2 pr-1 ` +
        `transition-colors ${
          selected
            ? 'bg-[var(--color-surface-700)] text-[var(--color-surface-100)]'
            : 'bg-[var(--color-surface-800)] ' + 'text-[var(--color-surface-300)] hover:bg-[var(--color-surface-700)]'
        }`
      }
    >
      <Button
        id={`editor-tab-${viewId}`}
        variant="ghost"
        size="sm"
        role="tab"
        aria-selected={selected}
        aria-controls={panelId}
        tabIndex={selected ? 0 : -1}
        onClick={() => onSelect(kind)}
        onKeyDown={(event) => onKeyDown(event, viewId)}
        className="gap-2 px-1"
      >
        <Icon size={14} className="text-[var(--color-accent-blue)]" aria-hidden />
        <span className="whitespace-nowrap">{title}</span>
      </Button>
      <IconButton label={t('configEditor.close', { title })} size="sm" icon={<X size={14} />} onClick={() => onClose(kind)} />
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
