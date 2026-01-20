/**
 * VariableNode - Custom ReactFlow node for variables (read/write)
 * 
 * Can act as:
 * - Input variable (read): has output handle only
 * - Output variable (write): has input handle only  
 * - Read/Write variable: has both handles
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import NodeComment from './NodeComment';

interface VariableData {
  type: 'variable' | 'input' | 'output';
  variableName?: string;
  dataType?: string;
  address?: string;  // e.g., "%Q0.0" for physical I/O
  comment?: string;
}

const VariableNode = memo(({ id, data, selected }: NodeProps) => {
  const { 
    type = 'variable', 
    variableName = '???', 
    dataType,
    address,
    comment 
  } = data as unknown as VariableData;

  const isInput = type === 'input' || type === 'variable';
  const isOutput = type === 'output' || type === 'variable';

  // Color coding by type
  const getBorderColor = () => {
    if (type === 'input') return 'border-green-500';
    if (type === 'output') return 'border-red-500';
    return 'border-yellow-500';
  };

  const getHeaderColor = () => {
    if (type === 'input') return 'bg-green-700';
    if (type === 'output') return 'bg-red-700';
    return 'bg-yellow-700';
  };

  const getIcon = () => {
    if (type === 'input') return '→';
    if (type === 'output') return '←';
    return '↔';
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          min-w-[100px] rounded border-2 shadow-md
          bg-slate-800
          ${getBorderColor()}
          ${selected ? 'ring-2 ring-blue-400/50' : ''}
        `}
        title={comment}
      >
        {/* Header */}
        <div className={`${getHeaderColor()} px-2 py-1 flex items-center justify-center gap-1 rounded-t`}>
          <span className="text-white text-xs">{getIcon()}</span>
          <span className="text-white font-mono text-xs font-medium">
            {type.toUpperCase()}
          </span>
        </div>

        {/* Variable name */}
        <div className="px-3 py-2 text-center relative">
          <span className="text-white font-mono text-sm">
            {variableName}
          </span>
          
          {/* Input handle (for output/variable types - receives data) */}
          {isOutput && (
            <Handle
              type="target"
              position={Position.Left}
              id="IN"
              className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-600"
            />
          )}

          {/* Output handle (for input/variable types - provides data) */}
          {isInput && (
            <Handle
              type="source"
              position={Position.Right}
              id="OUT"
              className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-600"
            />
          )}
        </div>

        {/* Footer with type/address info */}
        {(dataType || address) && (
          <div className="bg-slate-700 px-2 py-0.5 text-center rounded-b border-t border-slate-600">
            <span className="text-[10px] text-slate-400 font-mono">
              {address || dataType}
            </span>
          </div>
        )}
      </div>

      {/* Editable comment below node */}
      <NodeComment nodeId={id} comment={comment} />
    </div>
  );
});

VariableNode.displayName = 'VariableNode';

export default VariableNode;
