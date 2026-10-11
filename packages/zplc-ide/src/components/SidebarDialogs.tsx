/** The context menu and the confirmations of the Explorer: delete a file, and close the project with unsaved changes. */

import { Trash2 } from 'lucide-react';
import type { FileTreeNode } from '../types';
import { ICON_SIZES } from '../theme/tokens';
import { Button, PointMenu, type MenuItem } from '../ui';
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
  const items: MenuItem[] = [
    ...(node.type === 'directory' ? [{ id: 'new-folder', label: 'New folder…', onSelect: onNewFolder }] : []),
    { id: 'rename', label: 'Rename…', onSelect: onRename },
    ...(node.type === 'file' ? [{ id: 'duplicate', label: 'Duplicate', onSelect: onDuplicate }] : []),
    { id: 'move', label: 'Move to…', onSelect: onMove },
    { id: 'delete', label: node.type === 'directory' ? 'Delete folder' : 'Delete', onSelect: onDelete, destructive: true },
  ];
  return <PointMenu label={`Actions for ${node.name}`} items={items} x={x} y={y} onClose={onClose} />;
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
  return (
    <Modal isOpen={isOpen} onClose={isDeleting ? () => {} : onCancel} title="Delete File" widthClass="max-w-sm" showCloseButton={!isDeleting}>
      <div className="p-4">
        <p className="mb-4 text-[var(--text-primary)]">
          Are you sure you want to delete <strong>{fileName}</strong>?
        </p>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          This permanently removes the file from disk and cannot be undone.
        </p>
        {error && <p role="alert" aria-live="assertive" className="mb-4 text-sm text-[var(--color-accent-red)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} disabled={isDeleting}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} disabled={isDeleting} icon={<Trash2 size={ICON_SIZES.sm} />}>{isDeleting ? 'Deleting…' : 'Delete'}</Button>
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
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Discard unsaved changes?" widthClass="max-w-sm">
      <div className="p-4">
        <p className="text-[var(--text-primary)]">
          Changes to this project will be lost when it closes.
        </p>
        <div className="flex justify-end gap-2 pt-5">
          <Button onClick={onCancel}>Continue editing</Button>
          <Button variant="primary" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : 'Save all and close'}</Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>Discard changes and close</Button>
        </div>
      </div>
    </Modal>
  );
}
