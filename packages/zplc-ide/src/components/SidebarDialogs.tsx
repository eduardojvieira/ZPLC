/** The context menu and the confirmations of the Explorer: delete a file, and close the project with unsaved changes (UX-020). */

import type { FileTreeNode } from '../types';
import { AlertDialog, PointMenu, type MenuItem } from '../ui';
import { useT } from '../i18n';

// =============================================================================
// Context Menu
// =============================================================================

export interface ContextMenuProps {
  x: number;
  y: number;
  node: FileTreeNode;
  onClose: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  onDelete: () => void;
}

/** The Explorer's context menu: the kit's menu, so the arrows, Home, End, type-ahead and Escape work and focus returns. */
export function ContextMenu({ x, y, node, onClose, onNewFolder, onRename, onDuplicate, onMove, onDelete }: ContextMenuProps) {
  const { t } = useT();
  const items: MenuItem[] = [
    ...(node.type === 'directory' ? [{ id: 'new-folder', label: t('fileMenu.newFolder'), onSelect: onNewFolder }] : []),
    { id: 'rename', label: t('fileMenu.rename'), onSelect: onRename },
    ...(node.type === 'file' ? [{ id: 'duplicate', label: t('fileMenu.duplicate'), onSelect: onDuplicate }] : []),
    { id: 'move', label: t('fileMenu.move'), onSelect: onMove },
    {
      id: 'delete',
      label: node.type === 'directory' ? t('fileMenu.deleteFolder') : t('fileMenu.delete'),
      onSelect: onDelete,
      destructive: true,
    },
  ];
  return <PointMenu label={t('fileMenu.actionsFor', { name: node.name })} items={items} x={x} y={y} onClose={onClose} />;
}

// =============================================================================
// Delete Confirmation Modal
// =============================================================================

export interface DeleteModalProps {
  isOpen: boolean;
  fileName: string;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteModal({ isOpen, fileName, isDeleting, error, onConfirm, onCancel }: DeleteModalProps) {
  const { t } = useT();
  return (
    <AlertDialog
      open={isOpen}
      title={t('deleteFile.title')}
      description={`${t('deleteFile.confirm', { name: fileName })} ${t('deleteFile.permanent')}`}
      cancelLabel={t('common.cancel')}
      actionLabel={isDeleting ? t('common.deleting') : t('deleteFile.action')}
      destructive
      busy={isDeleting}
      onAction={onConfirm}
      onCancel={onCancel}
    >
      {error && (
        <p role="alert" aria-live="assertive" className="text-sm text-[var(--color-accent-red)]">
          {error}
        </p>
      )}
    </AlertDialog>
  );
}

export interface CloseProjectModalProps {
  isOpen: boolean;
  busy: boolean;
  onConfirm: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function CloseProjectModal({ isOpen, busy, onConfirm, onSave, onCancel }: CloseProjectModalProps) {
  const { t } = useT();
  return (
    <AlertDialog
      open={isOpen}
      title={t('closeProject.title')}
      description={t('closeProject.body')}
      cancelLabel={t('closeProject.continue')}
      secondary={{ label: t('closeProject.discard'), destructive: true, onSelect: onConfirm }}
      actionLabel={busy ? t('common.saving') : t('closeProject.saveAll')}
      busy={busy}
      onAction={onSave}
      onCancel={onCancel}
    />
  );
}
