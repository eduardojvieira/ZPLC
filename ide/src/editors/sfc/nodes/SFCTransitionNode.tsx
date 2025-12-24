/**
 * SFCTransitionNode - Custom ReactFlow node for SFC Transitions
 * 
 * Renders a Transition bar per IEC 61131-3 SFC specification:
 * - Heavy horizontal bar connecting steps
 * - Small condition text attached to the bar
 * - Editable condition in ST syntax
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';

interface TransitionData {
  condition: string;
  comment?: string;
}

const SFCTransitionNode = memo(({ id, data, selected }: NodeProps) => {
  const { condition, comment } = data as unknown as TransitionData;
  const [isEditing, setIsEditing] = useState(false);
  const [editCondition, setEditCondition] = useState(condition || 'TRUE');
  const inputRef = useRef<HTMLInputElement>(null);
  const { setNodes } = useReactFlow();

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    const trimmed = editCondition.trim() || 'TRUE';
    if (trimmed !== condition) {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: { ...node.data, condition: trimmed },
            };
          }
          return node;
        })
      );
    }
    setIsEditing(false);
  }, [id, editCondition, condition, setNodes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditCondition(condition || 'TRUE');
      setIsEditing(false);
    }
    e.stopPropagation();
  }, [handleSave, condition]);

  return (
    <div className="flex flex-col items-center">
      {/* Top connection point */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-600 !-top-1.5"
      />
      
      {/* Transition bar + condition */}
      <div className="flex items-center gap-2">
        {/* The horizontal transition bar */}
        <div
          className={`
            w-16 h-2 bg-slate-300 rounded-sm
            ${selected ? 'ring-2 ring-blue-400/50' : ''}
          `}
          title={comment || condition}
        />
        
        {/* Condition text/editor */}
        <div
          className="min-w-[60px] cursor-pointer"
          onDoubleClick={() => setIsEditing(true)}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editCondition}
              onChange={(e) => setEditCondition(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="w-full px-1 py-0.5 text-xs font-mono bg-slate-700 border border-slate-500 
                         rounded text-green-300 outline-none focus:border-blue-400"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="px-1 py-0.5 text-xs font-mono text-green-400 bg-slate-800/80 
                            rounded border border-slate-600 hover:border-slate-500 transition-colors">
              {condition || 'TRUE'}
            </div>
          )}
        </div>
      </div>

      {/* Bottom connection point */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-600 !-bottom-1.5"
      />

      {/* Comment (if present) */}
      {comment && (
        <div className="mt-1 px-1 text-[10px] italic text-slate-500 text-center max-w-[150px] truncate">
          {comment}
        </div>
      )}
    </div>
  );
});

SFCTransitionNode.displayName = 'SFCTransitionNode';

export default SFCTransitionNode;
