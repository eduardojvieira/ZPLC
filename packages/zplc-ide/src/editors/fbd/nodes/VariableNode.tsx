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
import type { FBDPort } from '../../../models/fbd';

interface VariableData {
  type: 'variable' | 'input' | 'output';
  variableName?: string;
  dataType?: string;
  address?: string;  // e.g., "%Q0.0" for physical I/O
  comment?: string;
  onChangeData?: (nodeId: string, data: Record<string, unknown>) => void;
  readOnly?: boolean;
  inputs?: FBDPort[];
  outputs?: FBDPort[];
}

const VariableNode = memo(({ id, data, selected }: NodeProps) => {
  const { 
    type = 'variable', 
    variableName = '???', 
    dataType,
    address,
    comment,
    onChangeData, readOnly, inputs, outputs,
  } = data as unknown as VariableData;

  const isInput = outputs ? outputs.length > 0 : type === 'input' || type === 'variable';
  const isOutput = inputs ? inputs.length > 0 : type === 'output' || type === 'variable';

  // Direction is a reference, not an energized/fault state.
  const getBorderColor = () => {
    return 'border-[var(--color-accent-blue)]';
  };

  const getHeaderColor = () => {
    return 'bg-[var(--color-accent-blue)]';
  };

  const getIcon = () => {
    if (type === 'input') return '→';
    if (type === 'output') return '←';
    return '↔';
  };

  return (
    <div className="zplc-visual-node flex flex-col items-center">
      <div
        className={`
          min-w-[124px] rounded border-2 shadow-md
          zplc-visual-card bg-[var(--visual-node)]
          ${getBorderColor()}
          ${selected ? 'ring-2 ring-blue-400/50' : ''}
        `}
        title={comment}
      >
        {/* Header */}
        <div className={`${getHeaderColor()} px-2 py-1 flex items-center justify-center gap-1 rounded-t`}>
          <span className="text-[var(--color-surface-800)] text-xs">{getIcon()}</span>
          <span className="text-[var(--color-surface-800)] font-mono text-xs font-medium">
            {type.toUpperCase()}
          </span>
        </div>

        {/* Variable name */}
        <div className="px-3 py-2 text-center relative">
          <span className="block max-w-[156px] break-words text-[var(--text-primary)] font-mono text-sm" title={variableName}>
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
          <div className="bg-[var(--color-surface-700)] px-2 py-0.5 text-center rounded-b border-t border-[var(--border-color)]">
            <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
              {address || dataType}
            </span>
          </div>
        )}
      </div>

      {/* Editable comment below node */}
      <NodeComment nodeId={id} comment={comment} onChange={onChangeData} readOnly={readOnly} />
    </div>
  );
});

VariableNode.displayName = 'VariableNode';

export default VariableNode;
