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
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { CheckCircle, XCircle, Zap } from 'lucide-react';

interface TransitionData {
  condition: string;
  comment?: string;
  // Debug properties
  debugActive?: boolean;
  conditionResult?: boolean; // Current evaluation of the condition
  isArmed?: boolean; // True if preceding step is active
  wasFired?: boolean; // True if this transition just fired
  readOnly?: boolean;
  onChangeData?: (nodeId: string, data: Record<string, unknown>) => void;
}

const SFCTransitionNode = memo(({ id, data, selected }: NodeProps) => {
  const { 
    condition, 
    comment,
    debugActive = false,
    conditionResult,
    isArmed = false,
    wasFired = false,
    readOnly = false,
    onChangeData,
  } = data as unknown as TransitionData;
  
  const [isEditing, setIsEditing] = useState(false);
  const [editCondition, setEditCondition] = useState(condition || 'TRUE');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing || readOnly || debugActive) {
      setEditCondition(condition || 'TRUE');
      if (readOnly || debugActive) setIsEditing(false);
    }
  }, [condition, isEditing, readOnly, debugActive]);

  const handleSave = useCallback(() => {
    const trimmed = editCondition.trim() || 'TRUE';
    if (trimmed !== condition) {
      onChangeData?.(id, { condition: trimmed });
    }
    setIsEditing(false);
  }, [id, editCondition, condition, onChangeData]);

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
          ? 'bg-[var(--visual-wire)]'
          : 'bg-[var(--visual-wire)]';

  return (
    <div className="zplc-visual-node sfc-transition-node relative h-[80px] w-[120px]">
      {/* Top connection point */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="!h-3 !w-3 !-top-1.5 !left-[60px] !border-2 !border-[var(--color-accent-blue)] !bg-[var(--color-accent-blue)] transition-colors"
      />
      
      <div className="sfc-transition-axis absolute left-[60px] top-0 h-full border-l-2 border-[var(--visual-wire)]" aria-hidden="true" />
      {/* Transition bar is the IEC flow center; condition is an annotation to its right. */}
      <div className="absolute left-[28px] top-[38px] h-[3px] w-16">
        {/* The horizontal transition bar */}
        <div
          className={`relative
            h-[3px] w-16 transition-all duration-200
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
          data-sfc-guard
          className="absolute left-full top-1/2 ml-3 min-w-[60px] max-w-[180px] -translate-y-1/2 cursor-pointer"
          onDoubleClick={() => !debugActive && !readOnly && setIsEditing(true)}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editCondition}
              onChange={(e) => setEditCondition(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="w-full border-b border-[var(--border-color)] bg-transparent px-1 py-0.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--color-accent-blue)]"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className={`flex items-center gap-1 px-1 py-0.5 font-mono text-xs transition-colors
              ${debugActive
                ? isConditionTrue
                  ? 'text-green-300'
                  : isConditionFalse
                    ? 'text-[var(--text-secondary)]'
                    : 'text-[var(--text-secondary)]'
                : 'text-[var(--text-primary)] hover:text-[var(--color-accent-blue)]'
              }`}
            >
              {/* Condition result icon */}
              {debugActive && conditionResult !== undefined && (
                isConditionTrue 
                  ? <CheckCircle size={10} className="text-green-400 flex-shrink-0" />
                  : <XCircle size={10} className="text-[var(--text-secondary)] flex-shrink-0" />
              )}
              <span className="max-h-[30px] overflow-hidden break-words">{condition || 'TRUE'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Debug status below transition */}
      {debugActive && (
        <div className="absolute left-[132px] top-full mt-1 flex items-center gap-1 text-[9px]">
          {isArmed ? (
            <span className="text-amber-300">Armed</span>
          ) : (
            <span className="text-[var(--text-tertiary)]">Waiting</span>
          )}
          {conditionResult !== undefined && (
            <span className={isConditionTrue ? 'text-green-400' : 'text-[var(--text-secondary)]'}>
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
        className="!h-3 !w-3 !-bottom-1.5 !left-[60px] !border-2 !border-[var(--color-accent-blue)] !bg-[var(--color-accent-blue)] transition-colors"
      />

      {/* Comment (if present and not debugging) */}
      {comment && !debugActive && (
        <div data-sfc-transition-comment className="absolute left-[132px] top-[54px] w-[150px] px-1 text-left text-[10px] italic text-[var(--text-tertiary)] line-clamp-2">
          {comment}
        </div>
      )}
    </div>
  );
});

SFCTransitionNode.displayName = 'SFCTransitionNode';

export default SFCTransitionNode;
