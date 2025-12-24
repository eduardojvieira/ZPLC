/**
 * SFCStepNode - Custom ReactFlow node for SFC Steps
 * 
 * Renders a Step box per IEC 61131-3 SFC specification:
 * - Single border for regular steps
 * - Double border for initial step
 * - Attached action block showing associated actions
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';

interface StepAction {
  qualifier: string;
  actionName: string;
}

interface StepData {
  name: string;
  isInitial: boolean;
  actions?: StepAction[];
  comment?: string;
}

const SFCStepNode = memo(({ id, data, selected }: NodeProps) => {
  const { name, isInitial, actions, comment } = data as unknown as StepData;
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

  return (
    <div className="flex flex-col items-center">
      {/* Top connection point */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-600 !-top-1.5"
      />
      
      {/* Step box */}
      <div
        className={`
          min-w-[100px] rounded
          ${isInitial 
            ? 'border-4 border-double border-amber-500 bg-amber-900/80' 
            : 'border-2 border-slate-400 bg-slate-800'
          }
          ${selected ? 'ring-2 ring-blue-400/50' : ''}
        `}
        title={comment}
      >
        {/* Step name */}
        <div 
          className="px-4 py-2 text-center cursor-pointer"
          onDoubleClick={() => setIsEditing(true)}
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
            <span className={`font-semibold ${isInitial ? 'text-amber-200' : 'text-white'}`}>
              {name}
            </span>
          )}
        </div>

        {/* Initial step indicator */}
        {isInitial && (
          <div className="px-2 py-0.5 bg-amber-700/50 text-center border-t border-amber-600">
            <span className="text-[9px] text-amber-300 uppercase tracking-wider">
              Initial
            </span>
          </div>
        )}
      </div>

      {/* Associated actions block (to the right) */}
      {actions && actions.length > 0 && (
        <div className="absolute -right-24 top-0 flex items-start gap-1">
          {/* Connection line */}
          <div className="w-4 h-px bg-slate-500 mt-4" />
          
          {/* Actions box */}
          <div className="border border-slate-500 bg-slate-700/90 rounded text-xs">
            {actions.map((action, idx) => (
              <div 
                key={idx}
                className="flex items-center border-b last:border-b-0 border-slate-600"
              >
                {/* Qualifier */}
                <div className="px-1.5 py-1 bg-slate-600 text-slate-300 font-mono border-r border-slate-500">
                  {action.qualifier}
                </div>
                {/* Action name */}
                <div className="px-2 py-1 text-slate-200">
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
        className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-600 !-bottom-1.5"
      />

      {/* Comment (if present) */}
      {comment && (
        <div className="mt-1 px-1 text-[10px] italic text-slate-500 text-center max-w-[120px] truncate">
          {comment}
        </div>
      )}
    </div>
  );
});

SFCStepNode.displayName = 'SFCStepNode';

export default SFCStepNode;
