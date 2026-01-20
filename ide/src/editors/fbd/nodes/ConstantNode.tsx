/**
 * ConstantNode - Custom ReactFlow node for constant values
 * 
 * Renders BOOL, INT, REAL, TIME constants with appropriate styling.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import NodeComment from './NodeComment';

interface ConstantData {
  dataType?: string;
  value?: unknown;
  comment?: string;
}

const ConstantNode = memo(({ id, data, selected }: NodeProps) => {
  const { dataType = 'ANY', value, comment } = data as ConstantData;

  // Color coding by type
  const getTypeColor = () => {
    switch (dataType) {
      case 'BOOL': return 'bg-purple-700 border-purple-500';
      case 'INT': 
      case 'DINT':
      case 'SINT':
      case 'LINT': return 'bg-blue-700 border-blue-500';
      case 'REAL':
      case 'LREAL': return 'bg-cyan-700 border-cyan-500';
      case 'TIME': return 'bg-amber-700 border-amber-500';
      case 'STRING': return 'bg-green-700 border-green-500';
      default: return 'bg-slate-700 border-slate-500';
    }
  };

  // Format value display
  const formatValue = () => {
    if (value === undefined || value === null) return '?';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'string') {
      // TIME values
      if (value.startsWith('T#')) return value;
      // String values
      return `'${value}'`;
    }
    return String(value);
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          min-w-[80px] rounded border-2 shadow-md
          ${getTypeColor()}
          ${selected ? 'ring-2 ring-blue-400/50' : ''}
        `}
        title={comment}
      >
        {/* Value display */}
        <div className="px-3 py-2 text-center">
          <span className="text-white font-mono text-sm font-medium">
            {formatValue()}
          </span>
        </div>

        {/* Type label */}
        <div className="bg-black/20 px-2 py-0.5 text-center border-t border-white/10">
          <span className="text-[10px] text-white/70 font-mono">
            {dataType}
          </span>
        </div>

        {/* Output handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="OUT"
          className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-600"
        />
      </div>
      <NodeComment nodeId={id} comment={comment} />
    </div>
  );
});

ConstantNode.displayName = 'ConstantNode';

export default ConstantNode;
