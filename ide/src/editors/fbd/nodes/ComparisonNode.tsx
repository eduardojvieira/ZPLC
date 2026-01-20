/**
 * ComparisonNode - Custom ReactFlow node for comparison operators
 * 
 * Renders EQ, NE, LT, LE, GT, GE blocks.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import NodeComment from './NodeComment';

interface ComparisonData {
  type: string;
  comment?: string;
}

const ComparisonNode = memo(({ id, data, selected }: NodeProps) => {
  const { type, comment } = data as unknown as ComparisonData;

  // Get operator symbol
  const getSymbol = () => {
    switch (type) {
      case 'EQ': return '=';
      case 'NE': return '≠';
      case 'LT': return '<';
      case 'LE': return '≤';
      case 'GT': return '>';
      case 'GE': return '≥';
      default: return '?';
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          w-16 rounded border-2 shadow-md
          bg-indigo-800 border-indigo-500
          ${selected ? 'ring-2 ring-blue-400/50' : ''}
        `}
        title={comment || type}
      >
        {/* Comparison body */}
        <div className="relative h-14 flex items-center justify-center">
          {/* Input handles */}
          <Handle
            type="target"
            position={Position.Left}
            id="IN1"
            className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-600"
            style={{ top: '30%' }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="IN2"
            className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-600"
            style={{ top: '70%' }}
          />

          {/* Symbol */}
          <span className="text-2xl font-bold text-white">
            {getSymbol()}
          </span>

          {/* Output handle */}
          <Handle
            type="source"
            position={Position.Right}
            id="OUT"
            className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-600"
          />
        </div>

        {/* Type label */}
        <div className="bg-indigo-900 px-1 py-0.5 text-center rounded-b border-t border-indigo-600">
          <span className="text-[10px] text-indigo-300 font-mono">
            {type}
          </span>
        </div>
      </div>
      <NodeComment nodeId={id} comment={comment} />
    </div>
  );
});

ComparisonNode.displayName = 'ComparisonNode';

export default ComparisonNode;
