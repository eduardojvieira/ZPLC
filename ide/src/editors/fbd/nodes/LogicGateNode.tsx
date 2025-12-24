/**
 * LogicGateNode - Custom ReactFlow node for logic gates
 * 
 * Renders AND, OR, NOT, XOR, NAND, NOR gates with IEC-style symbols.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getDefaultPorts } from '../../../models/fbd';
import NodeComment from './NodeComment';

interface LogicGateData {
  type: string;
  comment?: string;
}

const LogicGateNode = memo(({ id, data, selected }: NodeProps) => {
  const { type, comment } = data as unknown as LogicGateData;
  const ports = getDefaultPorts(type);

  // Gate symbol
  const getSymbol = () => {
    switch (type) {
      case 'AND': return '&';
      case 'OR': return '≥1';
      case 'NOT': return '1';
      case 'XOR': return '=1';
      case 'NAND': return '&';
      case 'NOR': return '≥1';
      default: return '?';
    }
  };

  const isInverted = type === 'NAND' || type === 'NOR' || type === 'NOT';
  const inputCount = ports.inputs.length;
  const portHeight = 24;
  const bodyHeight = Math.max(inputCount * portHeight + 16, 50);

  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          w-16 rounded border-2 shadow-md
          ${selected 
            ? 'border-blue-400 ring-2 ring-blue-400/50' 
            : 'border-slate-500'
          }
          bg-slate-800
        `}
        title={comment || type}
      >
        {/* Gate body */}
        <div 
          className="relative flex items-center justify-center"
          style={{ height: bodyHeight }}
        >
          {/* Input handles */}
          {ports.inputs.map((port, idx) => (
            <Handle
              key={port.name}
              type="target"
              position={Position.Left}
              id={port.name}
              className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-600"
              style={{ 
                top: 12 + idx * portHeight + (bodyHeight - inputCount * portHeight) / 2
              }}
            />
          ))}

          {/* Symbol */}
          <span className="text-xl font-bold text-white">
            {getSymbol()}
          </span>

          {/* Output handle with optional inversion bubble */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center">
            {isInverted && (
              <div className="w-2 h-2 rounded-full border-2 border-white bg-slate-800 -mr-1" />
            )}
            <Handle
              type="source"
              position={Position.Right}
              id="OUT"
              className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-600"
            />
          </div>
        </div>

        {/* Type label */}
        <div className="bg-slate-700 px-1 py-0.5 text-center rounded-b border-t border-slate-600">
          <span className="text-[10px] text-slate-400 font-mono">
            {type}
          </span>
        </div>
      </div>

      {/* Editable comment below node */}
      <NodeComment nodeId={id} comment={comment} />
    </div>
  );
});

LogicGateNode.displayName = 'LogicGateNode';

export default LogicGateNode;
