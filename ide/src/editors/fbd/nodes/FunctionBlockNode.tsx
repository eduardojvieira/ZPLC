/**
 * FunctionBlockNode - Custom ReactFlow node for IEC 61131-3 Function Blocks
 * 
 * Renders TON, TOF, TP, CTU, CTD, CTUD, R_TRIG, F_TRIG, SR, RS etc.
 * Industrial-grade styling with input/output handles.
 * 
 * Supports:
 * - Live value display when debugging
 * - Context menu for Instance Monitor
 */

import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Eye, MoreVertical } from 'lucide-react';
import { getDefaultPorts, isFunctionBlock } from '../../../models/fbd';
import NodeComment from './NodeComment';

interface FunctionBlockData {
  type: string;
  instanceName?: string;
  comment?: string;
  /** Live values for ports (from debug adapter) */
  liveValues?: Map<string, unknown>;
  /** Whether debug mode is active */
  debugActive?: boolean;
  /** Callback to open instance monitor */
  onOpenMonitor?: (instanceName: string, blockType: string) => void;
}

/**
 * Format a live value for inline display
 */
function formatLiveValue(value: unknown, type: string): string {
  if (value === undefined || value === null) return '';
  
  if (type === 'BOOL') {
    return value ? '1' : '0';
  }
  if (type === 'TIME') {
    const ms = typeof value === 'number' ? value : 0;
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return String(value);
}

const FunctionBlockNode = memo(({ id, data, selected }: NodeProps) => {
  const { 
    type, 
    instanceName, 
    comment,
    liveValues,
    debugActive,
    onOpenMonitor,
  } = data as unknown as FunctionBlockData;
  
  const ports = getDefaultPorts(type);
  const [showMenu, setShowMenu] = useState(false);
  
  // Handle context menu / right-click
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(true);
  }, []);

  const handleOpenMonitor = useCallback(() => {
    setShowMenu(false);
    if (onOpenMonitor && instanceName) {
      onOpenMonitor(instanceName, type);
    }
  }, [onOpenMonitor, instanceName, type]);
  
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

  // Get live value for a port
  const getPortValue = (portName: string): string => {
    if (!debugActive || !liveValues || !instanceName) return '';
    const key = `${instanceName}.${portName}`;
    const value = liveValues.get(key);
    const port = [...ports.inputs, ...ports.outputs].find(p => p.name === portName);
    return formatLiveValue(value, port?.type || 'INT');
  };

  return (
    <div className="flex flex-col items-center relative">
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
        onContextMenu={handleContextMenu}
      >
        {/* Header with type name */}
        <div className={`${getHeaderColor()} px-3 py-1.5 rounded-t text-center relative`}>
          <span className="text-white font-bold text-sm tracking-wide">
            {type}
          </span>
          
          {/* Menu button */}
          {isFunctionBlock(type) && instanceName && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-white/20 text-white/70 hover:text-white"
            >
              <MoreVertical size={14} />
            </button>
          )}
        </div>

        {/* Body with ports */}
        <div 
          className="relative px-2 py-2 flex justify-between"
          style={{ minHeight: bodyHeight }}
        >
          {/* Input ports (left side) */}
          <div className="flex flex-col gap-1">
            {ports.inputs.map((port, idx) => {
              const liveVal = getPortValue(port.name);
              return (
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
                  {debugActive && liveVal && (
                    <span className={`text-[10px] font-mono ${
                      port.type === 'BOOL' 
                        ? (liveVal === '1' ? 'text-green-400' : 'text-red-400')
                        : 'text-cyan-400'
                    }`}>
                      {liveVal}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Output ports (right side) */}
          <div className="flex flex-col gap-1 items-end">
            {ports.outputs.map((port, idx) => {
              const liveVal = getPortValue(port.name);
              return (
                <div key={port.name} className="flex items-center gap-1 h-6">
                  {debugActive && liveVal && (
                    <span className={`text-[10px] font-mono ${
                      port.type === 'BOOL' 
                        ? (liveVal === '1' ? 'text-green-400' : 'text-red-400')
                        : 'text-cyan-400'
                    }`}>
                      {liveVal}
                    </span>
                  )}
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
              );
            })}
          </div>
        </div>

        {/* Instance name footer (if applicable) */}
        {isFunctionBlock(type) && instanceName && (
          <div className="bg-slate-700 px-2 py-1 rounded-b border-t border-slate-600 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono">
              {instanceName}
            </span>
            {debugActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {showMenu && (
        <>
          {/* Backdrop to close menu */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-slate-800 border border-slate-600 rounded shadow-lg min-w-[140px]">
            <button
              onClick={handleOpenMonitor}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 rounded"
            >
              <Eye size={14} />
              Instance Monitor
            </button>
          </div>
        </>
      )}

      {/* Editable comment below node */}
      <NodeComment nodeId={id} comment={comment} />
    </div>
  );
});

FunctionBlockNode.displayName = 'FunctionBlockNode';

export default FunctionBlockNode;
