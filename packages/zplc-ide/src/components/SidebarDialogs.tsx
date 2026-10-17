/** The context menu and the confirmations of the Explorer: delete a file, and close the project with unsaved changes. */

import { Trash2 } from 'lucide-react';
import type { FileTreeNode } from '../types';
import { ICON_SIZES } from '../theme/tokens';
import { Button, PointMenu, type MenuItem } from '../ui';
import { useT } from '../i18n';
import { Modal } from './Modal';

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
    { id: 'delete', label: node.type === 'directory' ? t('fileMenu.deleteFolder') : t('fileMenu.delete'), onSelect: onDelete, destructive: true },
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
    <Modal isOpen={isOpen} onClose={isDeleting ? () => {} : onCancel} title={t('deleteFile.title')} widthClass="max-w-sm" showCloseButton={!isDeleting}>
      <div className="p-4">
        <p className="mb-4 text-[var(--text-primary)]">
          {t('deleteFile.confirm', { name: fileName })}
        </p>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          {t('deleteFile.permanent')}
        </p>
        {error && <p role="alert" aria-live="assertive" className="mb-4 text-sm text-[var(--color-accent-red)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} disabled={isDeleting}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={onConfirm} disabled={isDeleting} icon={<Trash2 size={ICON_SIZES.sm} />}>{isDeleting ? t('common.deleting') : t('common.delete')}</Button>
        </div>
      </div>
    </Modal>
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
    <Modal isOpen={isOpen} onClose={onCancel} title={t('closeProject.title')} widthClass="max-w-sm">
      <div className="p-4">
        <p className="text-[var(--text-primary)]">
          {t('closeProject.body')}
        </p>
        <div className="flex justify-end gap-2 pt-5">
          <Button onClick={onCancel}>{t('closeProject.continue')}</Button>
          <Button variant="primary" disabled={busy} onClick={onSave}>{busy ? t('common.saving') : t('closeProject.saveAll')}</Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>{t('closeProject.discard')}</Button>
        </div>
      </div>
    </Modal>
  );
}
