/** The context menu and the confirmations of the Explorer: delete a file, and close the project with unsaved changes. */

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  Trash2,
} from 'lucide-react';
import type { FileTreeNode } from '../types';
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

export function ContextMenu({ x, y, node, onClose, onNewFolder, onRename, onDuplicate, onMove, onDelete }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // The menu opens where the pointer is, moved back inside the window when it would run off the right or the bottom edge.
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const box = menuRef.current?.getBoundingClientRect();
    if (!box) return;
    const next = { left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)) };
    setPosition((previous) => (previous.left === next.left && previous.top === next.top ? previous : next));
  }, [x, y]);

  const item = 'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-[var(--color-surface-100)] hover:bg-[var(--color-surface-600)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-600)]';
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${node.name}`}
      className="fixed z-50 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded shadow-xl py-1 min-w-[160px]"
      style={position}
    >
      {node.type === 'directory' && <button role="menuitem" onClick={onNewFolder} className={item}>New folder…</button>}
      <button role="menuitem" onClick={onRename} className={item}>Rename…</button>
      {node.type === 'file' && <button role="menuitem" onClick={onDuplicate} className={item}>Duplicate</button>}
      <button role="menuitem" onClick={onMove} className={item}>Move to…</button>
      <button
        role="menuitem"
        onClick={onDelete}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-[var(--color-accent-red)] hover:bg-[var(--color-surface-600)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-600)]"
      >
        <Trash2 size={14} />
        {node.type === 'directory' ? 'Delete folder' : 'Delete'}
      </button>
    </div>
  );
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
        <p className="text-[var(--color-surface-200)] mb-4">
          Are you sure you want to delete <strong className="text-[var(--color-surface-100)]">{fileName}</strong>?
        </p>
        <p className="text-sm text-[var(--color-surface-400)] mb-4">
          This permanently removes the file from disk and cannot be undone.
        </p>
        {error && <p role="alert" aria-live="assertive" className="mb-4 text-sm text-[var(--color-accent-red)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm rounded bg-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/80 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
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
        <p className="text-[var(--color-surface-200)]">
          Changes to this project will be lost when it closes.
        </p>
        <div className="flex justify-end gap-2 pt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]"
          >
            Continue editing
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="px-4 py-2 text-sm rounded bg-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/80 text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]"
          >
            {busy ? 'Saving…' : 'Save all and close'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded bg-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/80 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]"
          >
            Discard changes and close
          </button>
        </div>
      </div>
    </Modal>
  );
}
