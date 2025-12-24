/**
 * NodeComment - Editable comment display for FBD nodes
 * 
 * Shows a comment label below a node that can be edited inline.
 * Used by all node types to provide consistent comment editing UX.
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useReactFlow } from '@xyflow/react';

interface NodeCommentProps {
  nodeId: string;
  comment?: string;
}

const NodeComment = memo(({ nodeId, comment }: NodeCommentProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const { setNodes } = useReactFlow();

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
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              comment: trimmed || undefined,
            },
          };
        }
        return node;
      })
    );
    setIsEditing(false);
  }, [nodeId, draft, setNodes]);

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
    setIsEditing(true);
  }, []);

  if (isEditing) {
    return (
      <div className="mt-1 px-1" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full text-[10px] italic bg-slate-700 border border-slate-500 
                     rounded px-1 py-0.5 text-slate-200 focus:outline-none focus:border-blue-500
                     text-center"
          placeholder="Add comment..."
        />
      </div>
    );
  }

  return (
    <div
      className="mt-1 px-1 cursor-pointer"
      onDoubleClick={handleDoubleClick}
      title="Double-click to edit comment"
    >
      <div className={`text-[10px] italic text-center truncate max-w-[120px] ${
        comment ? 'text-slate-400' : 'text-slate-600 hover:text-slate-500'
      }`}>
        {comment || '(+ comment)'}
      </div>
    </div>
  );
});

NodeComment.displayName = 'NodeComment';

export default NodeComment;
