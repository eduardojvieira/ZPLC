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
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { PLC_LANGUAGES, type PLCLanguage, type FileTreeNode } from '../types';
import { Modal } from './Modal';

// =============================================================================
// New File Modal
// =============================================================================

interface NewFileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function NewFileModal({ isOpen, onClose }: NewFileModalProps) {
  const createFile = useIDEStore((s) => s.createFile);
  const [fileName, setFileName] = useState('');
  const [language, setLanguage] = useState<PLCLanguage>('ST');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFileName('');
      setLanguage('ST');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleCreate = async () => {
    if (!fileName.trim()) return;
    try {
      await createFile(fileName.trim(), language);
      onClose();
    } catch (err) {
      console.error('Failed to create file:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New File" widthClass="max-w-md">
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--color-surface-200)] mb-1">
            File Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="my_program"
            className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] placeholder:text-[var(--color-surface-400)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
          />
          <p className="mt-1 text-xs text-[var(--color-surface-400)]">
            Extension will be added automatically
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-surface-200)] mb-1">
            Language
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as PLCLanguage)}
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
            onClick={onClose}
            className="px-4 py-2 text-sm rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!fileName.trim()}
            className="px-4 py-2 text-sm rounded bg-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/80 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create
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
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteModal({ isOpen, fileName, onConfirm, onCancel }: DeleteModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Delete File" widthClass="max-w-sm">
      <div className="p-4">
        <p className="text-[var(--color-surface-200)] mb-4">
          Are you sure you want to delete <strong className="text-[var(--color-surface-100)]">{fileName}</strong>?
        </p>
        <p className="text-sm text-[var(--color-surface-400)] mb-4">
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded bg-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/80 text-white"
          >
            Delete
          </button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// Tree Node Component
// =============================================================================

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  activeFileId: string | null;
  onFileClick: (fileId: string) => void;
  onToggleDir: (dirPath: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void;
}

function TreeNode({ node, depth, activeFileId, onFileClick, onToggleDir, onContextMenu }: TreeNodeProps) {
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
      <div>
        <button
          onClick={() => onToggleDir(node.path)}
          className="w-full flex items-center gap-1 py-1 hover:bg-[var(--color-surface-700)] text-[var(--color-surface-100)] text-sm"
          style={{ paddingLeft }}
        >
          {node.isExpanded ? (
            <ChevronDown size={14} className="text-[var(--color-surface-400)]" />
          ) : (
            <ChevronRight size={14} className="text-[var(--color-surface-400)]" />
          )}
          {getFileIcon()}
          <span className="truncate">{node.name}</span>
        </button>

        {node.isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                activeFileId={activeFileId}
                onFileClick={onFileClick}
                onToggleDir={onToggleDir}
                onContextMenu={onContextMenu}
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
      className={`flex items-center gap-2 py-1 cursor-pointer text-sm transition-colors ${
        isActive
          ? 'bg-[var(--color-surface-600)] text-[var(--color-surface-100)]'
          : 'hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)]'
      }`}
      style={{ paddingLeft }}
      onClick={() => onFileClick(node.id)}
      onContextMenu={(e) => onContextMenu(e, node)}
    >
      {/* Spacer for alignment with folders */}
      <span className="w-3.5" />
      {getFileIcon()}
      <span className="truncate flex-1">{node.name}</span>
    </div>
  );
}

// =============================================================================
// Main Sidebar Component
// =============================================================================

export function Sidebar() {
  const {
    projectName,
    fileTree,
    activeFileId,
    isVirtualProject,
    isSidebarCollapsed,
    toggleSidebar,
    toggleDirectory,
    openFile,
    deleteFile,
    closeProject,
    refreshFileTree,
  } = useIDEStore();

  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileTreeNode } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ fileId: string; fileName: string } | null>(null);

  // Handle collapsed sidebar
  if (isSidebarCollapsed) {
    return (
      <div className="w-12 bg-[var(--color-surface-800)] border-r border-[var(--color-surface-600)] flex flex-col items-center py-2">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)]"
          title="Expand Sidebar"
        >
          <FolderOpen size={20} />
        </button>
      </div>
    );
  }

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, node: FileTreeNode) => {
    if (node.type === 'file') {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, node });
    }
  };

  const handleDelete = async (fileId: string) => {
    await deleteFile(fileId);
    setDeleteConfirm(null);
  };

  const handleFileClick = (fileId: string) => {
    openFile(fileId);
  };

  return (
    <div className="w-64 bg-[var(--color-surface-800)] border-r border-[var(--color-surface-600)] flex flex-col">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[var(--color-surface-600)]">
        <span className="text-xs font-semibold uppercase text-[var(--color-surface-300)]">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsNewFileModalOpen(true)}
            className="p-1 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-300)]"
            title="New File"
          >
            <Plus size={14} />
          </button>
          {!isVirtualProject && (
            <button
              onClick={() => refreshFileTree()}
              className="p-1 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-300)]"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          )}
          <button
            onClick={closeProject}
            className="p-1 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-300)]"
            title="Close Project"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Project Name */}
      <div className="px-3 py-2 border-b border-[var(--color-surface-700)]">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-[var(--color-accent-yellow)]" />
          <span className="text-sm font-medium text-[var(--color-surface-100)] truncate">
            {projectName || 'Project'}
          </span>
          {isVirtualProject && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-accent-purple)]/20 text-[var(--color-accent-purple)]">
              virtual
            </span>
          )}
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {fileTree ? (
          fileTree.children && fileTree.children.length > 0 ? (
            fileTree.children.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                activeFileId={activeFileId}
                onFileClick={handleFileClick}
                onToggleDir={toggleDirectory}
                onContextMenu={handleContextMenu}
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

      {/* Language Legend */}
      <div className="p-3 border-t border-[var(--color-surface-600)]">
        <div className="text-xs text-[var(--color-surface-400)] mb-2">Languages</div>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {Object.values(PLC_LANGUAGES).map((lang) => (
            <div
              key={lang.id}
              className="flex items-center gap-1 text-[var(--color-surface-300)]"
              title={lang.fullName}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  lang.isVisual ? 'bg-[var(--color-accent-purple)]' : 'bg-[var(--color-accent-blue)]'
                }`}
              />
              {lang.name}
            </div>
          ))}
        </div>
      </div>

      {/* New File Modal */}
      <NewFileModal
        isOpen={isNewFileModalOpen}
        onClose={() => setIsNewFileModalOpen(false)}
      />

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={() => {
            setDeleteConfirm({ fileId: contextMenu.node.id, fileName: contextMenu.node.name });
            setContextMenu(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <DeleteModal
          isOpen={true}
          fileName={deleteConfirm.fileName}
          onConfirm={() => handleDelete(deleteConfirm.fileId)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
