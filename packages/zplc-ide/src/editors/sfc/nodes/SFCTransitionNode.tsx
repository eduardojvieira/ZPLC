/**
 * SFCTransitionNode - Custom ReactFlow node for SFC Transitions
 * 
 * Renders a Transition bar per IEC 61131-3 SFC specification:
 * - Heavy horizontal bar connecting steps
 * - Small condition text attached to the bar
 * - Editable condition in ST syntax
 * - Debug mode: Shows condition evaluation result and highlights active transitions
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { CheckCircle, XCircle, Zap } from 'lucide-react';

interface TransitionData {
  condition: string;
  comment?: string;
  // Debug properties
  debugActive?: boolean;
  conditionResult?: boolean; // Current evaluation of the condition
  isArmed?: boolean; // True if preceding step is active
  wasFired?: boolean; // True if this transition just fired
}

const SFCTransitionNode = memo(({ id, data, selected }: NodeProps) => {
  const { 
    condition, 
    comment,
    debugActive = false,
    conditionResult,
    isArmed = false,
    wasFired = false,
  } = data as unknown as TransitionData;
  
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

  // Determine visual state
  const isConditionTrue = debugActive && conditionResult === true;
  const isConditionFalse = debugActive && conditionResult === false;
  const showFiredAnimation = debugActive && wasFired;

  // Bar color based on state
  const barColorClass = showFiredAnimation
    ? 'bg-yellow-400 animate-pulse shadow-lg shadow-yellow-500/50'
    : isArmed && isConditionTrue
      ? 'bg-green-400'
      : isArmed
        ? 'bg-amber-400'
        : debugActive
          ? 'bg-slate-500'
          : 'bg-slate-300';

  return (
    <div className="flex flex-col items-center">
      {/* Top connection point */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className={`!w-3 !h-3 !border-2 !-top-1.5 transition-colors
          ${isArmed 
            ? '!bg-amber-400 !border-amber-600' 
            : '!bg-blue-400 !border-blue-600'
          }`}
      />
      
      {/* Transition bar + condition */}
      <div className="flex items-center gap-2">
        {/* The horizontal transition bar */}
        <div
          className={`
            w-16 h-2 rounded-sm transition-all duration-200
            ${barColorClass}
            ${selected ? 'ring-2 ring-blue-400/50' : ''}
          `}
          title={comment || condition}
        >
          {/* Fired indicator */}
          {showFiredAnimation && (
            <Zap size={10} className="absolute -top-2 left-1/2 -translate-x-1/2 text-yellow-300" />
          )}
        </div>
        
        {/* Condition text/editor with debug value */}
        <div
          className="min-w-[60px] cursor-pointer"
          onDoubleClick={() => !debugActive && setIsEditing(true)}
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
            <div className={`px-1 py-0.5 text-xs font-mono rounded border transition-colors flex items-center gap-1
              ${debugActive
                ? isConditionTrue
                  ? 'text-green-300 bg-green-900/80 border-green-600'
                  : isConditionFalse
                    ? 'text-red-300 bg-red-900/50 border-red-600/50'
                    : 'text-slate-400 bg-slate-800/80 border-slate-600'
                : 'text-green-400 bg-slate-800/80 border-slate-600 hover:border-slate-500'
              }`}
            >
              {/* Condition result icon */}
              {debugActive && conditionResult !== undefined && (
                isConditionTrue 
                  ? <CheckCircle size={10} className="text-green-400 flex-shrink-0" />
                  : <XCircle size={10} className="text-red-400 flex-shrink-0" />
              )}
              <span>{condition || 'TRUE'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Debug status below transition */}
      {debugActive && (
        <div className="mt-1 flex items-center gap-1 text-[9px]">
          {isArmed ? (
            <span className="text-amber-300">Armed</span>
          ) : (
            <span className="text-slate-500">Waiting</span>
          )}
          {conditionResult !== undefined && (
            <span className={isConditionTrue ? 'text-green-400' : 'text-red-400'}>
              = {conditionResult ? 'TRUE' : 'FALSE'}
            </span>
          )}
        </div>
      )}

      {/* Bottom connection point */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className={`!w-3 !h-3 !border-2 !-bottom-1.5 transition-colors
          ${isConditionTrue && isArmed
            ? '!bg-green-400 !border-green-600' 
            : '!bg-green-400 !border-green-600'
          }`}
      />

      {/* Comment (if present and not debugging) */}
      {comment && !debugActive && (
        <div className="mt-1 px-1 text-[10px] italic text-slate-500 text-center max-w-[150px] truncate">
          {comment}
        </div>
      )}
    </div>
  );
});

SFCTransitionNode.displayName = 'SFCTransitionNode';

export default SFCTransitionNode;
