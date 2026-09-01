/**
 * Sidebar Component
 * 
 * File explorer with hierarchical tree view:
 * - Expandable/collapsible directories
 * - File icons based on language
 * - Context menu for delete
 * - New File dialog
 * - Close project button
 */

import {
  FolderOpen,
  FolderClosed,
  File,
  FileCode,
  ChevronRight,
  ChevronDown,
  Plus,
  X,
  Trash2,
  RefreshCw,
  Database,
  TriangleAlert,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { PLC_LANGUAGES, type PLCLanguage, type FileTreeNode } from '../types';
import { Modal } from './Modal';
import { flattenVisibleTree, resolveTreeFocus, treeNavigation } from './sidebarTreeNavigation';

// =============================================================================
// New File Modal
// =============================================================================

interface NewFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  language: PLCLanguage;
  onFileNameChange: (value: string) => void;
  onLanguageChange: (value: PLCLanguage) => void;
}

function NewFileModal({
  isOpen,
  onClose,
  fileName,
  language,
  onFileNameChange,
  onLanguageChange,
}: NewFileModalProps) {
  const createFile = useIDEStore((s) => s.createFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const timeout = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  const handleClose = () => {
    if (!isCreating) onClose();
  };

  const handleCreate = async () => {
    if (!fileName.trim() || isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      await createFile(fileName.trim(), language);
      onClose();
    } catch (error) {
      setError(error instanceof Error && error.message === 'The file may exist on disk. Refresh the project before trying again.'
        ? error.message
        : 'Could not create the file. Check the name, folder access, and whether it already exists.');
      setTimeout(() => inputRef.current?.select(), 0);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleCreate();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New File" widthClass="max-w-md" showCloseButton={!isCreating}>
      <div className="p-4 space-y-4">
        <div>
          <label htmlFor="new-file-name" className="block text-sm font-medium text-[var(--color-surface-200)] mb-1">
            File Name
          </label>
          <input
            id="new-file-name"
            ref={inputRef}
            type="text"
            value={fileName}
            onChange={(e) => { setError(null); onFileNameChange(e.target.value); }}
            onKeyDown={handleKeyDown}
            readOnly={isCreating}
            placeholder="my_program"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'new-file-name-help new-file-error' : 'new-file-name-help'}
            className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] placeholder:text-[var(--color-surface-400)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
          />
          <p id="new-file-name-help" className="mt-1 text-xs text-[var(--color-surface-400)]">
            Extension will be added automatically
          </p>
          {error && <p id="new-file-error" role="alert" className="mt-2 text-sm text-[var(--color-accent-red)]">{error}</p>}
        </div>

        <div>
          <label htmlFor="new-file-language" className="block text-sm font-medium text-[var(--color-surface-200)] mb-1">
            Language
          </label>
          <select
            id="new-file-language"
            value={language}
            onChange={(e) => { setError(null); onLanguageChange(e.target.value as PLCLanguage); }}
            disabled={isCreating}
            className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
          >
            {Object.values(PLC_LANGUAGES).map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.fullName} ({lang.extension})
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleClose}
            disabled={isCreating}
            className="px-4 py-2 text-sm rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!fileName.trim() || isCreating}
            className="px-4 py-2 text-sm rounded bg-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/80 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// Context Menu
// =============================================================================

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
}

function ContextMenu({ x, y, onClose, onDelete }: ContextMenuProps) {
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

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded shadow-xl py-1 min-w-[140px]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={onDelete}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-accent-red)] hover:bg-[var(--color-surface-600)]"
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  );
}

// =============================================================================
// Delete Confirmation Modal
// =============================================================================

interface DeleteModalProps {
  isOpen: boolean;
  fileName: string;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteModal({ isOpen, fileName, isDeleting, error, onConfirm, onCancel }: DeleteModalProps) {
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

interface CloseProjectModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function CloseProjectModal({ isOpen, onConfirm, onCancel }: CloseProjectModalProps) {
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

// =============================================================================
// Display Name Helper
// =============================================================================

/**
 * Simplify file extensions for display in the explorer.
 * Converts .fbd.json -> .fbd, .ld.json -> .ld, .sfc.json -> .sfc
 */
function getDisplayName(filename: string): string {
  if (filename.endsWith('.fbd.json')) return filename.replace('.fbd.json', '.fbd');
  if (filename.endsWith('.ld.json')) return filename.replace('.ld.json', '.ld');
  if (filename.endsWith('.sfc.json')) return filename.replace('.sfc.json', '.sfc');
  return filename;
}

// =============================================================================
// Tree Node Component
// =============================================================================

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  activeFileId: string | null;
  focusedTreeId: string | null;
  onFileClick: (fileId: string) => void;
  onToggleDir: (dirPath: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, node: FileTreeNode) => void;
  onTreeItemRef: (id: string, element: HTMLDivElement | null) => void;
  onTreeItemFocus: (id: string) => void;
  onTreeItemActivate: (id: string) => void;
}

function TreeNode({ node, depth, activeFileId, focusedTreeId, onFileClick, onToggleDir, onContextMenu, onKeyDown, onTreeItemRef, onTreeItemFocus, onTreeItemActivate }: TreeNodeProps) {
  const paddingLeft = 8 + depth * 16;

  // Get icon for file
  const getFileIcon = () => {
    if (node.type === 'directory') {
      return node.isExpanded 
        ? <FolderOpen size={16} className="text-[var(--color-accent-yellow)]" />
        : <FolderClosed size={16} className="text-[var(--color-accent-yellow)]" />;
    }

    // Special icon for GVL files
    if (node.pouType === 'GVL' || node.name.endsWith('.gvl')) {
      return <Database size={16} className="text-[var(--color-accent-orange)]" />;
    }

    // Visual vs text language
    const lang = node.language || 'ST';
    const info = PLC_LANGUAGES[lang];
    if (info?.isVisual) {
      return <FileCode size={16} className="text-[var(--color-accent-purple)]" />;
    }
    return <File size={16} className="text-[var(--color-accent-blue)]" />;
  };

  // Directory node
  if (node.type === 'directory') {
    return (
      <div
          ref={(element) => onTreeItemRef(node.id, element)}
          role="treeitem"
          data-tree-node-id={node.id}
          aria-level={depth}
          aria-selected={false}
          aria-expanded={node.isExpanded === true}
          tabIndex={node.id === focusedTreeId ? 0 : -1}
          onFocus={(event) => { if (event.target === event.currentTarget) onTreeItemFocus(node.id); }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            onKeyDown(event, node);
            if (event.defaultPrevented) event.stopPropagation();
          }}
          className="group/treeitem outline-none"
        >
          <div
            onClick={() => { onTreeItemActivate(node.id); onToggleDir(node.path); }}
            className="w-full flex items-center gap-1 py-1 cursor-pointer text-sm hover:bg-[var(--color-surface-700)] group-focus-visible/treeitem:ring-2 group-focus-visible/treeitem:ring-inset group-focus-visible/treeitem:ring-[var(--color-accent-blue)] text-[var(--color-surface-100)]"
            style={{ paddingLeft }}
          >
            {node.isExpanded ? (
              <ChevronDown size={14} className="text-[var(--color-surface-400)]" />
            ) : (
              <ChevronRight size={14} className="text-[var(--color-surface-400)]" />
            )}
            {getFileIcon()}
            <span className="truncate">{getDisplayName(node.name)}</span>
          </div>

          {node.isExpanded && node.children && (
            <div role="group">
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                activeFileId={activeFileId}
                focusedTreeId={focusedTreeId}
                onFileClick={onFileClick}
                onToggleDir={onToggleDir}
                onContextMenu={onContextMenu}
                onKeyDown={onKeyDown}
                onTreeItemRef={onTreeItemRef}
                onTreeItemFocus={onTreeItemFocus}
                onTreeItemActivate={onTreeItemActivate}
              />
            ))}
            </div>
          )}
      </div>
    );
  }

  // File node
  const isActive = node.id === activeFileId;

  return (
    <div
      ref={(element) => onTreeItemRef(node.id, element)}
      role="treeitem"
      data-tree-node-id={node.id}
      aria-level={depth}
      aria-selected={isActive}
      tabIndex={node.id === focusedTreeId ? 0 : -1}
      onFocus={(event) => { if (event.target === event.currentTarget) onTreeItemFocus(node.id); }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        onKeyDown(event, node);
        if (event.defaultPrevented) event.stopPropagation();
      }}
      className="group/treeitem outline-none"
    >
      <div
        onClick={() => { onTreeItemActivate(node.id); onFileClick(node.id); }}
        onContextMenu={(event) => { onTreeItemActivate(node.id); onContextMenu(event, node); }}
        className={`w-full flex items-center gap-2 py-1 cursor-pointer text-sm transition-colors group-focus-visible/treeitem:ring-2 group-focus-visible/treeitem:ring-inset group-focus-visible/treeitem:ring-[var(--color-accent-blue)] ${
          isActive
            ? 'bg-[var(--color-surface-600)] text-[var(--color-surface-100)]'
            : 'hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)]'
        }`}
        style={{ paddingLeft }}
      >
        {/* Spacer for alignment with folders */}
        <span className="w-3.5" />
        {getFileIcon()}
        <span className="truncate flex-1">{getDisplayName(node.name)}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Sidebar Component
// =============================================================================

export function Sidebar() {
  const {
    projectName,
    projectMigrationPreview,
    fileTree,
    activeFileId,
    toggleDirectory,
    openFile,
    deleteFile,
    refreshFileTree,
  } = useIDEStore();

  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false);
  const [newFileModalEpoch, setNewFileModalEpoch] = useState(0);
  const [newFileName, setNewFileName] = useState('');
  const [newFileLanguage, setNewFileLanguage] = useState<PLCLanguage>('ST');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileTreeNode; projectSession: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ fileId: string; fileName: string; projectSession: number } | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isCloseProjectModalOpen, setIsCloseProjectModalOpen] = useState(false);
  const [focusedTree, setFocusedTree] = useState<{ id: string | null; ancestorIds: string[] }>({ id: null, ancestorIds: [] });
  const treeItemRefs = useRef(new Map<string, HTMLDivElement>());
  const visibleTree = useMemo(() => flattenVisibleTree(fileTree?.children ?? []), [fileTree]);
  const resolvedTreeFocus = resolveTreeFocus(visibleTree, focusedTree.id, focusedTree.ancestorIds, activeFileId);

  const setTreeItemRef = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) treeItemRefs.current.set(id, element);
    else treeItemRefs.current.delete(id);
  }, []);

  const setTreeFocus = (id: string | null) => {
    const ancestors: string[] = [];
    let parentId = id ? treeNavigation(visibleTree, id).parent : null;
    while (parentId) {
      ancestors.push(parentId);
      parentId = treeNavigation(visibleTree, parentId).parent;
    }
    setFocusedTree({ id, ancestorIds: ancestors });
  };

  const focusTreeItem = (id: string | null) => {
    if (!id) return;
    setTreeFocus(id);
    treeItemRefs.current.get(id)?.focus();
  };

  const handleCloseProject = useCallback(() => {
    const state = useIDEStore.getState();
    const { forcedValues, forcesUnconfirmed } = state.debug;
    const closeBlockedByForces = forcedValues.size > 0 || forcesUnconfirmed;

    if (closeBlockedByForces) {
      state.closeProject();
      requestAnimationFrame(() => document.getElementById('console-tab-watch')?.focus());
      return;
    }
    if (state.hasUnsavedChanges()) {
      setIsCloseProjectModalOpen(true);
      return;
    }
    state.closeProject();
  }, []);

  const handleDiscardAndCloseProject = useCallback(() => {
    const closed = useIDEStore.getState().closeProject({ discardUnsaved: true });
    setIsCloseProjectModalOpen(false);
    if (!closed) requestAnimationFrame(() => document.getElementById('console-tab-watch')?.focus());
  }, []);

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, node: FileTreeNode) => {
    if (node.type === 'file') {
      e.preventDefault();
      setTreeFocus(node.id);
      const state = useIDEStore.getState();
      setContextMenu({ x: e.clientX, y: e.clientY, node, projectSession: state.projectSession });
    }
  };

  const handleDelete = async (fileId: string, expectedProjectSession: number) => {
    if (isDeletingFile) return;
    setIsDeletingFile(true);
    setDeleteError(null);
    const deleted = await deleteFile(fileId, expectedProjectSession);
    if (useIDEStore.getState().projectSession !== expectedProjectSession) {
      setDeleteConfirm(null);
      setIsDeletingFile(false);
      return;
    }
    setIsDeletingFile(false);
    if (deleted) setDeleteConfirm(null);
    else setDeleteError('Could not delete this file. It is still in the project. Try again.');
  };

  const handleFileClick = (fileId: string) => {
    openFile(fileId);
  };

  const handleTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, node: FileTreeNode) => {
    const navigation = treeNavigation(visibleTree, node.id);
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        focusTreeItem(navigation.previous);
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusTreeItem(navigation.next);
        break;
      case 'Home':
        event.preventDefault();
        focusTreeItem(navigation.first);
        break;
      case 'End':
        event.preventDefault();
        focusTreeItem(navigation.last);
        break;
      case 'ArrowRight':
        if (node.type !== 'directory') return;
        event.preventDefault();
        if (!node.isExpanded) onToggleDirectory(node.path);
        else focusTreeItem(navigation.firstChild);
        break;
      case 'ArrowLeft':
        if (node.type !== 'directory' || !node.isExpanded) {
          if (navigation.parent) {
            event.preventDefault();
            focusTreeItem(navigation.parent);
          }
          return;
        }
        event.preventDefault();
        onToggleDirectory(node.path);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (node.type === 'directory') onToggleDirectory(node.path);
        else handleFileClick(node.id);
        break;
      default:
        break;
    }
  };

  const onToggleDirectory = (dirPath: string) => {
    toggleDirectory(dirPath);
  };

  const handleOpenNewFileModal = () => {
    setNewFileName('');
    setNewFileLanguage('ST');
    setNewFileModalEpoch((epoch) => epoch + 1);
    setIsNewFileModalOpen(true);
  };

  return (
    <div className="w-full h-full bg-[var(--color-surface-800)] font-sans flex flex-col">
      <div role="toolbar" className="h-10 flex items-center justify-between gap-2 px-3 border-b border-[var(--color-surface-600)]" aria-label="Explorer actions">
        <div className="min-w-0 flex items-center gap-2">
          <FolderOpen size={16} className="shrink-0 text-[var(--color-accent-yellow)]" />
          <span className="truncate text-sm font-medium text-[var(--color-surface-100)]">{projectName || 'Project'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenNewFileModal}
            className="p-1 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-300)]"
            title="New File"
            aria-label="New File"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => refreshFileTree()}
            className="p-1 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-300)]"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={handleCloseProject}
            className="p-1 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-300)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]"
            title="Close Project"
            aria-label="Close Project"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {projectMigrationPreview && (
        <div className="px-3 py-2 border-b border-[var(--color-surface-700)]">
          <div className="mt-2 border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] p-2 text-xs text-[var(--color-surface-200)]">
            <div className="flex items-start gap-2">
              <TriangleAlert size={15} className="mt-0.5 shrink-0 text-[var(--color-accent-yellow)]" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-medium text-[var(--color-surface-100)]">Migration preview</div>
                <div className="mt-0.5">v{projectMigrationPreview.sourceSchemaVersion} → v2</div>
                <div className="mt-0.5 text-[var(--color-surface-200)]">No project files were changed.</div>
              </div>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-[var(--color-accent-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue)]">
                Review {projectMigrationPreview.changes.length} change{projectMigrationPreview.changes.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto border-t border-[var(--color-surface-600)] pt-2">
                {projectMigrationPreview.changes.map((change) => (
                  <li key={`${change.op}:${change.path}`} className="flex min-w-0 gap-2">
                    <span className="shrink-0 font-medium text-[var(--color-surface-100)]">{change.op === 'add' ? 'Add' : change.op === 'remove' ? 'Remove' : 'Replace'}</span>
                    <code className="min-w-0 break-words font-mono text-[var(--color-surface-200)]">{change.path}</code>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto py-1" role="tree" aria-label="Project files">
        {fileTree ? (
          fileTree.children && fileTree.children.length > 0 ? (
            fileTree.children.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={1}
                activeFileId={activeFileId}
                focusedTreeId={resolvedTreeFocus}
                onFileClick={handleFileClick}
                onToggleDir={onToggleDirectory}
                onContextMenu={handleContextMenu}
                onKeyDown={handleTreeKeyDown}
                onTreeItemRef={setTreeItemRef}
                onTreeItemFocus={setTreeFocus}
                onTreeItemActivate={focusTreeItem}
              />
            ))
          ) : (
            <div className="px-3 py-4 text-xs text-[var(--color-surface-400)] text-center">
              No files. Click + to create one.
            </div>
          )
        ) : (
          <div className="px-3 py-4 text-xs text-[var(--color-surface-400)] text-center">
            Loading...
          </div>
        )}
      </div>

      {/* New File Modal */}
      <NewFileModal
        key={newFileModalEpoch}
        isOpen={isNewFileModalOpen}
        onClose={() => setIsNewFileModalOpen(false)}
        fileName={newFileName}
        language={newFileLanguage}
        onFileNameChange={setNewFileName}
        onLanguageChange={setNewFileLanguage}
      />

      <CloseProjectModal
        isOpen={isCloseProjectModalOpen}
        onConfirm={handleDiscardAndCloseProject}
        onCancel={() => setIsCloseProjectModalOpen(false)}
      />

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={() => {
            setDeleteConfirm({ fileId: contextMenu.node.id, fileName: contextMenu.node.name, projectSession: contextMenu.projectSession });
            setDeleteError(null);
            setContextMenu(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <DeleteModal
          isOpen={true}
          fileName={deleteConfirm.fileName}
          isDeleting={isDeletingFile}
          error={deleteError}
          onConfirm={() => handleDelete(deleteConfirm.fileId, deleteConfirm.projectSession)}
          onCancel={() => { if (!isDeletingFile) setDeleteConfirm(null); }}
        />
      )}
    </div>
  );
}
