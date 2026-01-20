/**
 * MathNode - Custom ReactFlow node for math operators
 * 
 * Renders ADD, SUB, MUL, DIV, MOD, ABS blocks.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import NodeComment from './NodeComment';

interface MathData {
  type: string;
  comment?: string;
}

const MathNode = memo(({ id, data, selected }: NodeProps) => {
  const { type, comment } = data as unknown as MathData;

  // Get operator symbol
  const getSymbol = () => {
    switch (type) {
      case 'ADD': return '+';
      case 'SUB': return '−';
      case 'MUL': return '×';
      case 'DIV': return '÷';
      case 'MOD': return '%';
      case 'ABS': return '|x|';
      case 'MAX': return 'MAX';
      case 'MIN': return 'MIN';
      case 'LIMIT': return 'LIM';
      case 'SEL': return 'SEL';
      default: return '?';
    }
  };

  const isSingleInput = type === 'ABS';
  const isThreeInput = type === 'LIMIT';
  
  const inputCount = isThreeInput ? 3 : (isSingleInput ? 1 : 2);
  const portHeight = 20;
  const bodyHeight = Math.max(inputCount * portHeight + 16, 50);

  // Input labels for LIMIT
  const getInputLabels = () => {
    if (type === 'LIMIT') return ['MN', 'IN', 'MX'];
    if (type === 'SEL') return ['G', 'IN0', 'IN1'];
    if (isSingleInput) return ['IN'];
    return ['IN1', 'IN2'];
  };

  const inputLabels = getInputLabels();

  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          w-16 rounded border-2 shadow-md
          bg-teal-800 border-teal-500
          ${selected ? 'ring-2 ring-blue-400/50' : ''}
        `}
        title={comment || type}
      >
        {/* Math body */}
        <div 
          className="relative flex items-center justify-center"
          style={{ height: bodyHeight }}
        >
          {/* Input handles */}
          {inputLabels.map((label, idx) => (
            <Handle
              key={label}
              type="target"
              position={Position.Left}
              id={label}
              className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-600"
              style={{ 
                top: 12 + idx * portHeight + (bodyHeight - inputCount * portHeight) / 2
              }}
            />
          ))}

          {/* Symbol */}
          <span className={`font-bold text-white ${type.length > 1 ? 'text-xs' : 'text-2xl'}`}>
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
        <div className="bg-teal-900 px-1 py-0.5 text-center rounded-b border-t border-teal-600">
          <span className="text-[10px] text-teal-300 font-mono">
            {type}
          </span>
        </div>
      </div>
      <NodeComment nodeId={id} comment={comment} />
    </div>
  );
});

MathNode.displayName = 'MathNode';

export default MathNode;
