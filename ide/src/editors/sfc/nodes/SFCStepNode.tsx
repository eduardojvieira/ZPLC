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
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
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
  } = data as unknown as StepData;
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setNodes } = useReactFlow();

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== name) {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: { ...node.data, name: trimmed },
            };
          }
          return node;
        })
      );
    }
    setIsEditing(false);
  }, [id, editName, name, setNodes]);

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
    min-w-[100px] rounded transition-all duration-200
    ${isInitial 
      ? isStepActive
        ? 'border-4 border-double border-green-400 bg-green-900/90 shadow-lg shadow-green-500/30'
        : 'border-4 border-double border-amber-500 bg-amber-900/80' 
      : isStepActive
        ? 'border-2 border-green-400 bg-green-900/80 shadow-lg shadow-green-500/30'
        : 'border-2 border-slate-400 bg-slate-800'
    }
    ${selected ? 'ring-2 ring-blue-400/50' : ''}
  `;

  return (
    <div className="flex flex-col items-center">
      {/* Top connection point */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className={`!w-3 !h-3 !border-2 !-top-1.5 transition-colors
          ${isStepActive 
            ? '!bg-green-400 !border-green-600' 
            : '!bg-blue-400 !border-blue-600'
          }`}
      />
      
      {/* Step box */}
      <div className={stepBoxClasses} title={comment}>
        {/* Active indicator pulse */}
        {isStepActive && (
          <div className="absolute -inset-1 rounded bg-green-400/20 animate-pulse" />
        )}
        
        {/* Step name */}
        <div 
          className="px-4 py-2 text-center cursor-pointer relative"
          onDoubleClick={() => !debugActive && setIsEditing(true)}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent text-center text-white font-semibold 
                         border-b border-slate-400 outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={`font-semibold ${
              isStepActive 
                ? 'text-green-200' 
                : isInitial 
                  ? 'text-amber-200' 
                  : 'text-white'
            }`}>
              {name}
            </span>
          )}
        </div>

        {/* Debug info bar */}
        {debugActive && (
          <div className={`px-2 py-1 text-center border-t ${
            isStepActive 
              ? 'bg-green-800/50 border-green-600' 
              : 'bg-slate-700/50 border-slate-600'
          }`}>
            <div className="flex items-center justify-center gap-2 text-[10px]">
              {/* Active status */}
              <div className={`flex items-center gap-1 ${
                isStepActive ? 'text-green-300' : 'text-slate-400'
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
              <div className="text-[9px] text-slate-400 mt-0.5">
                Activations: {activationCount}
              </div>
            )}
          </div>
        )}

        {/* Initial step indicator (when not debugging) */}
        {isInitial && !debugActive && (
          <div className="px-2 py-0.5 bg-amber-700/50 text-center border-t border-amber-600">
            <span className="text-[9px] text-amber-300 uppercase tracking-wider">
              Initial
            </span>
          </div>
        )}
      </div>

      {/* Associated actions block (to the right) */}
      {actions && actions.length > 0 && (
        <div className="absolute -right-28 top-0 flex items-start gap-1">
          {/* Connection line */}
          <div className={`w-4 h-px mt-4 ${isStepActive ? 'bg-green-500' : 'bg-slate-500'}`} />
          
          {/* Actions box */}
          <div className={`border rounded text-xs ${
            isStepActive 
              ? 'border-green-500 bg-green-900/90' 
              : 'border-slate-500 bg-slate-700/90'
          }`}>
            {actions.map((action, idx) => (
              <div 
                key={idx}
                className={`flex items-center border-b last:border-b-0 ${
                  isStepActive ? 'border-green-600' : 'border-slate-600'
                }`}
              >
                {/* Qualifier */}
                <div className={`px-1.5 py-1 font-mono border-r ${
                  isStepActive 
                    ? 'bg-green-700 text-green-200 border-green-500' 
                    : 'bg-slate-600 text-slate-300 border-slate-500'
                }`}>
                  {action.qualifier}
                </div>
                {/* Action name */}
                <div className={`px-2 py-1 ${isStepActive ? 'text-green-200' : 'text-slate-200'}`}>
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
        className={`!w-3 !h-3 !border-2 !-bottom-1.5 transition-colors
          ${isStepActive 
            ? '!bg-green-400 !border-green-600' 
            : '!bg-green-400 !border-green-600'
          }`}
      />

      {/* Comment (if present and not debugging) */}
      {comment && !debugActive && (
        <div className="mt-1 px-1 text-[10px] italic text-slate-500 text-center max-w-[120px] truncate">
          {comment}
        </div>
      )}
    </div>
  );
});

SFCStepNode.displayName = 'SFCStepNode';

export default SFCStepNode;
