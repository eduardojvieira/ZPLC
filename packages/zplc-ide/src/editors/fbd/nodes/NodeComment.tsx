/**
 * NodeComment - Editable comment display for FBD nodes
 * 
 * Shows a comment label below a node that can be edited inline.
 * Used by all node types to provide consistent comment editing UX.
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react';

interface NodeCommentProps {
  nodeId: string;
  comment?: string;
  onChange?: (nodeId: string, data: Record<string, unknown>) => void;
  readOnly?: boolean;
}

const NodeComment = memo(({ nodeId, comment, onChange, readOnly = false }: NodeCommentProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment || '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when comment prop changes
  useEffect(() => {
    if (!isEditing) {
      setDraft(comment || '');
    }
  }, [comment, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    const trimmed = draft.trim();
    onChange?.(nodeId, { comment: trimmed || undefined });
    setIsEditing(false);
  }, [nodeId, draft, onChange]);

  const handleCancel = useCallback(() => {
    setDraft(comment || '');
    setIsEditing(false);
  }, [comment]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
    // Stop propagation to prevent ReactFlow from handling these keys
    e.stopPropagation();
  }, [handleSave, handleCancel]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!readOnly) setIsEditing(true);
  }, [readOnly]);

  if (isEditing) {
    return (
      <div className="absolute top-full left-1/2 z-10 mt-1 w-[120px] -translate-x-1/2 px-1" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full text-[10px] italic bg-[var(--color-surface-700)] border border-[var(--border-color)]
                     rounded px-1 py-0.5 text-[var(--text-secondary)] focus:outline-none focus:border-[var(--color-accent-blue)]
                     text-center"
          placeholder="Add comment..."
        />
      </div>
    );
  }

  return (
    <div
      className="absolute top-full left-1/2 z-10 mt-1 w-[120px] -translate-x-1/2 px-1 cursor-pointer"
      onDoubleClick={handleDoubleClick}
      title="Double-click to edit comment"
    >
      <div className={`text-[10px] italic text-center truncate max-w-[120px] ${
        comment ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
      }`}>
        {comment || '(+ comment)'}
      </div>
    </div>
  );
});

NodeComment.displayName = 'NodeComment';

export default NodeComment;
