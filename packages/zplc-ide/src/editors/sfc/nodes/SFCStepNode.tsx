/**
 * SFCStepNode - Custom ReactFlow node for SFC Steps
 * 
 * Renders a Step box per IEC 61131-3 SFC specification:
 * - Single border for regular steps
 * - Double border for initial step
 * - Attached action block showing associated actions
 * - Debug mode: Shows active state with animation and time in step
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Timer, Activity } from 'lucide-react';

interface StepAction {
  qualifier: string;
  actionName: string;
}

interface StepData {
  name: string;
  isInitial: boolean;
  actions?: StepAction[];
  comment?: string;
  // Debug properties
  debugActive?: boolean;
  isActive?: boolean;
  timeInStep?: number; // milliseconds
  activationCount?: number;
  readOnly?: boolean;
  onChangeData?: (nodeId: string, data: Record<string, unknown>) => void;
}

/**
 * Format time for display (e.g., 1.5s, 250ms)
 */
function formatTime(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

const SFCStepNode = memo(({ id, data, selected }: NodeProps) => {
  const { 
    name, 
    isInitial, 
    actions, 
    comment,
    debugActive = false,
    isActive = false,
    timeInStep,
    activationCount,
    readOnly = false,
    onChangeData,
  } = data as unknown as StepData;
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing || readOnly || debugActive) {
      setEditName(name);
      if (readOnly || debugActive) setIsEditing(false);
    }
  }, [name, isEditing, readOnly, debugActive]);

  const handleSave = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== name) {
      onChangeData?.(id, { name: trimmed });
    }
    setIsEditing(false);
  }, [id, editName, name, onChangeData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditName(name);
      setIsEditing(false);
    }
    e.stopPropagation();
  }, [handleSave, name]);

  // Determine visual state based on debug mode
  const isStepActive = debugActive && isActive;
  
  // Dynamic classes based on state
  const stepBoxClasses = `
    relative h-[56px] w-[120px] rounded-[2px] transition-all duration-200
    ${isInitial 
      ? isStepActive
        ? 'border-4 border-double border-green-400 bg-green-900/90 shadow-lg shadow-green-500/30'
        : 'border-4 border-double border-[var(--color-accent-blue)] bg-[var(--visual-node)]'
      : isStepActive
        ? 'border-2 border-green-400 bg-green-900/80 shadow-lg shadow-green-500/30'
        : 'border-2 border-[var(--border-color)] bg-[var(--visual-node)]'
    }
    ${selected ? 'ring-2 ring-blue-400/50' : ''}
  `;

  return (
    <div className="zplc-visual-node sfc-step-node relative h-[56px] w-[120px]">
      {/* Top connection point */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="!h-3 !w-3 !-top-1.5 !border-2 !border-[var(--color-accent-blue)] !bg-[var(--color-accent-blue)] transition-colors"
      />
      
      {/* Step box */}
      <div className={`sfc-step-box flex h-full w-full items-center justify-center ${stepBoxClasses}`} title={comment}>
        {/* Active indicator pulse */}
        {isStepActive && (
          <div className="absolute -inset-1 rounded bg-green-400/20 animate-pulse" />
        )}
        
        {/* Step name */}
        <div 
          className="relative w-full cursor-pointer px-3 text-center"
          onDoubleClick={() => !debugActive && !readOnly && setIsEditing(true)}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent text-center text-[var(--text-primary)] font-semibold
                         border-b border-[var(--border-color)] outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={`block max-h-[36px] overflow-hidden break-words text-center font-semibold leading-tight ${isStepActive ? 'text-green-200' : 'text-[var(--text-primary)]'}`}>
              {name}
            </span>
          )}
        </div>

      </div>

      {/* Debug information is an annotation; it must not change the IEC block geometry. */}
      {debugActive && (
          <div className={`absolute top-full left-1/2 z-10 mt-1 w-[120px] -translate-x-1/2 px-2 py-1 text-center border ${
            isStepActive 
              ? 'bg-green-800/50 border-green-600' 
              : 'bg-[var(--color-surface-700)] border-[var(--border-color)]'
          }`}>
            <div className="flex items-center justify-center gap-2 text-[10px]">
              {/* Active status */}
              <div className={`flex items-center gap-1 ${
                isStepActive ? 'text-green-300' : 'text-[var(--text-secondary)]'
              }`}>
                <Activity size={10} className={isStepActive ? 'animate-pulse' : ''} />
                <span>{isStepActive ? 'ACTIVE' : 'IDLE'}</span>
              </div>
              
              {/* Time in step (only when active or has time) */}
              {(isStepActive || timeInStep !== undefined) && timeInStep !== undefined && timeInStep > 0 && (
                <div className="flex items-center gap-1 text-cyan-300">
                  <Timer size={10} />
                  <span className="font-mono">{formatTime(timeInStep)}</span>
                </div>
              )}
            </div>
            
            {/* Activation count */}
            {activationCount !== undefined && activationCount > 0 && (
              <div className="text-[9px] text-[var(--text-tertiary)] mt-0.5">
                Activations: {activationCount}
              </div>
            )}
          </div>
        )}

      {/* Associated actions block (to the right) */}
      {actions && actions.length > 0 && (
        <div data-sfc-actions className="absolute left-full top-1/2 z-10 ml-3 flex -translate-y-1/2 items-center gap-1">
          {/* Connection line */}
          <div className={`h-px w-4 ${isStepActive ? 'bg-green-500' : 'bg-[var(--visual-wire)]'}`} />
          
          {/* Actions box */}
          <div className={`border rounded-[2px] text-xs ${
            isStepActive 
              ? 'border-green-500 bg-green-900/90' 
              : 'border-[var(--border-color)] bg-[var(--color-surface-700)]'
          }`}>
            {actions.map((action, idx) => (
              <div 
                key={idx}
                className={`flex items-center border-b last:border-b-0 ${
                  isStepActive ? 'border-green-600' : 'border-[var(--border-color)]'
                }`}
              >
                {/* Qualifier */}
                <div className={`px-1.5 py-1 font-mono border-r ${
                  isStepActive 
                    ? 'bg-green-700 text-green-200 border-green-500' 
                    : 'bg-[var(--color-surface-600)] text-[var(--text-secondary)] border-[var(--border-color)]'
                }`}>
                  {action.qualifier}
                </div>
                {/* Action name */}
                <div className={`max-w-[132px] break-words px-2 py-1 ${isStepActive ? 'text-green-200' : 'text-[var(--text-secondary)]'}`} title={action.actionName}>
                  {action.actionName}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom connection point */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="!h-3 !w-3 !-bottom-1.5 !border-2 !border-[var(--color-accent-blue)] !bg-[var(--color-accent-blue)] transition-colors"
      />

      {/* Comment (if present and not debugging) */}
      {comment && !debugActive && (
        <div className="absolute top-full left-1/2 mt-1 w-[120px] -translate-x-1/2 px-1 text-[10px] italic text-[var(--text-tertiary)] text-center truncate">
          {comment}
        </div>
      )}
    </div>
  );
});

SFCStepNode.displayName = 'SFCStepNode';

export default SFCStepNode;
