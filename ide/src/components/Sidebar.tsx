/**
 * Sidebar Component
 * 
 * File explorer and project navigation with:
 * - New File dialog
 * - Context menu for rename/delete
 * - Import/Export project
 */

import {
  FolderOpen,
  File,
  FileCode,
  ChevronRight,
  ChevronDown,
  Plus,
  Download,
  Upload,
  Trash2,
  Edit3,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { PLC_LANGUAGES, type PLCLanguage } from '../types';
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

  const handleCreate = () => {
    if (!fileName.trim()) return;
    createFile(fileName.trim(), language);
    onClose();
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
  fileId: string;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function ContextMenu({ x, y, onClose, onRename, onDelete }: ContextMenuProps) {
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
        onClick={onRename}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-surface-200)] hover:bg-[var(--color-surface-600)]"
      >
        <Edit3 size={14} />
        Rename
      </button>
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
// Rename Input (inline)
// =============================================================================

interface RenameInputProps {
  currentName: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

function RenameInput({ currentName, onConfirm, onCancel }: RenameInputProps) {
  // Extract base name without extension
  const baseName = currentName.replace(/\.(st|il|ld\.json|ld|fbd\.json|fbd|sfc\.json|sfc)$/i, '');
  const [value, setValue] = useState(baseName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (value.trim()) onConfirm(value.trim());
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleBlur = () => {
    if (value.trim() && value.trim() !== baseName) {
      onConfirm(value.trim());
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="flex-1 bg-[var(--color-surface-600)] border border-[var(--color-accent-blue)] rounded px-1 text-sm text-[var(--color-surface-100)] outline-none"
    />
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
// Main Sidebar Component
// =============================================================================

export function Sidebar() {
  const {
    files,
    activeFileId,
    projectConfig,
    setActiveFile,
    isSidebarCollapsed,
    toggleSidebar,
    deleteFile,
    renameFile,
    exportProject,
    importProject,
  } = useIDEStore();

  const [isProjectExpanded, setIsProjectExpanded] = useState(true);
  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fileId: string } | null>(null);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ fileId: string; fileName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Get language icon
  const getLanguageIcon = (lang: string) => {
    const info = PLC_LANGUAGES[lang as keyof typeof PLC_LANGUAGES];
    if (info?.isVisual) {
      return <FileCode size={16} className="text-[var(--color-accent-purple)]" />;
    }
    return <File size={16} className="text-[var(--color-accent-blue)]" />;
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, fileId });
  };

  const handleRename = (fileId: string, newName: string) => {
    renameFile(fileId, newName);
    setRenamingFileId(null);
  };

  const handleDelete = (fileId: string) => {
    deleteFile(fileId);
    setDeleteConfirm(null);
  };

  // Export project as JSON download
  const handleExport = () => {
    const project = exportProject();
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectConfig.name.replace(/\s+/g, '_')}.zplc.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import project from JSON file
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const project = JSON.parse(event.target?.result as string);
        if (project.version && project.config && project.files) {
          importProject(project);
        } else {
          console.error('Invalid project file format');
        }
      } catch (err) {
        console.error('Failed to parse project file:', err);
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be selected again
    e.target.value = '';
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
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-300)]"
            title="Open Project"
          >
            <Upload size={14} />
          </button>
          <button
            onClick={handleExport}
            className="p-1 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-300)]"
            title="Download Project"
          >
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.zplc.json"
        onChange={handleImport}
        className="hidden"
      />

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Project Folder */}
        <button
          onClick={() => setIsProjectExpanded(!isProjectExpanded)}
          className="w-full flex items-center gap-1 px-2 py-1 hover:bg-[var(--color-surface-700)] text-[var(--color-surface-100)] text-sm"
        >
          {isProjectExpanded ? (
            <ChevronDown size={16} className="text-[var(--color-surface-300)]" />
          ) : (
            <ChevronRight size={16} className="text-[var(--color-surface-300)]" />
          )}
          <FolderOpen size={16} className="text-[var(--color-accent-yellow)]" />
          <span className="font-medium truncate">{projectConfig.name}</span>
        </button>

        {isProjectExpanded && (
          <div className="ml-4">
            {files.map((file) => (
              <div
                key={file.id}
                onContextMenu={(e) => handleContextMenu(e, file.id)}
                className={`flex items-center gap-2 px-2 py-1 text-sm transition-colors cursor-pointer ${
                  activeFileId === file.id
                    ? 'bg-[var(--color-surface-600)] text-[var(--color-surface-100)]'
                    : 'hover:bg-[var(--color-surface-700)] text-[var(--color-surface-200)]'
                }`}
                onClick={() => {
                  if (renamingFileId !== file.id) setActiveFile(file.id);
                }}
              >
                {getLanguageIcon(file.language)}
                
                {renamingFileId === file.id ? (
                  <RenameInput
                    currentName={file.name}
                    onConfirm={(newName) => handleRename(file.id, newName)}
                    onCancel={() => setRenamingFileId(null)}
                  />
                ) : (
                  <span className="truncate flex-1">{file.name}</span>
                )}

                {file.isModified && renamingFileId !== file.id && (
                  <span className="ml-auto text-[var(--color-accent-orange)]">●</span>
                )}
              </div>
            ))}

            {files.length === 0 && (
              <div className="px-2 py-4 text-xs text-[var(--color-surface-400)] text-center">
                No files. Click + to create one.
              </div>
            )}
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
          fileId={contextMenu.fileId}
          onClose={() => setContextMenu(null)}
          onRename={() => {
            setRenamingFileId(contextMenu.fileId);
            setContextMenu(null);
          }}
          onDelete={() => {
            const file = files.find((f) => f.id === contextMenu.fileId);
            if (file) {
              setDeleteConfirm({ fileId: file.id, fileName: file.name });
            }
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
