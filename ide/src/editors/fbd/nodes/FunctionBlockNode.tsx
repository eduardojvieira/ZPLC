/**
 * FunctionBlockNode - Custom ReactFlow node for IEC 61131-3 Function Blocks
 * 
 * Renders TON, TOF, TP, CTU, CTD, CTUD, R_TRIG, F_TRIG, SR, RS etc.
 * Industrial-grade styling with input/output handles.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getDefaultPorts, isFunctionBlock } from '../../../models/fbd';
import NodeComment from './NodeComment';

interface FunctionBlockData {
  type: string;
  instanceName?: string;
  comment?: string;
}

const FunctionBlockNode = memo(({ id, data, selected }: NodeProps) => {
  const { type, instanceName, comment } = data as unknown as FunctionBlockData;
  const ports = getDefaultPorts(type);
  
  // Color coding by category
  const getHeaderColor = () => {
    if (['TON', 'TOF', 'TP'].includes(type)) return 'bg-amber-600';
    if (['CTU', 'CTD', 'CTUD'].includes(type)) return 'bg-emerald-600';
    if (['R_TRIG', 'F_TRIG'].includes(type)) return 'bg-purple-600';
    if (['SR', 'RS'].includes(type)) return 'bg-blue-600';
    return 'bg-slate-600';
  };

  const maxPorts = Math.max(ports.inputs.length, ports.outputs.length);
  const portHeight = 24;
  const headerHeight = 32;
  const bodyHeight = Math.max(maxPorts * portHeight + 16, 60);

  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          min-w-[120px] rounded border-2 shadow-lg
          ${selected 
            ? 'border-blue-400 ring-2 ring-blue-400/50' 
            : 'border-slate-500'
          }
          bg-slate-800
        `}
        title={comment}
      >
        {/* Header with type name */}
        <div className={`${getHeaderColor()} px-3 py-1.5 rounded-t text-center`}>
          <span className="text-white font-bold text-sm tracking-wide">
            {type}
          </span>
        </div>

        {/* Body with ports */}
        <div 
          className="relative px-2 py-2 flex justify-between"
          style={{ minHeight: bodyHeight }}
        >
          {/* Input ports (left side) */}
          <div className="flex flex-col gap-1">
            {ports.inputs.map((port, idx) => (
              <div key={port.name} className="flex items-center gap-1 h-6">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={port.name}
                  className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-600"
                  style={{ top: headerHeight + 12 + idx * portHeight }}
                />
                <span className="text-xs text-slate-300 font-mono pl-3">
                  {port.name}
                </span>
              </div>
            ))}
          </div>

          {/* Output ports (right side) */}
          <div className="flex flex-col gap-1 items-end">
            {ports.outputs.map((port, idx) => (
              <div key={port.name} className="flex items-center gap-1 h-6">
                <span className="text-xs text-slate-300 font-mono pr-3">
                  {port.name}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={port.name}
                  className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-600"
                  style={{ top: headerHeight + 12 + idx * portHeight }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Instance name footer (if applicable) */}
        {isFunctionBlock(type) && instanceName && (
          <div className="bg-slate-700 px-2 py-1 rounded-b border-t border-slate-600">
            <span className="text-xs text-slate-400 font-mono">
              {instanceName}
            </span>
          </div>
        )}
      </div>

      {/* Editable comment below node */}
      <NodeComment nodeId={id} comment={comment} />
    </div>
  );
});

FunctionBlockNode.displayName = 'FunctionBlockNode';

export default FunctionBlockNode;
