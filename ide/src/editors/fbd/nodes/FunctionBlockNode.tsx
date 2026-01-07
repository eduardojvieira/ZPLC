/**
 * FunctionBlockNode - Custom ReactFlow node for IEC 61131-3 Function Blocks
 * 
 * Renders TON, TOF, TP, CTU, CTD, CTUD, R_TRIG, F_TRIG, SR, RS etc.
 * Industrial-grade styling with input/output handles.
 * 
 * Supports:
 * - Live value display when debugging with enhanced visibility
 * - Context menu for Instance Monitor
 * - Visual feedback for active outputs
 */

import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Eye, MoreVertical, Activity } from 'lucide-react';
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
 * Format a live value for inline display with enhanced formatting
 */
function formatLiveValue(value: unknown, type: string): string {
  if (value === undefined || value === null) return '—';
  
  if (type === 'BOOL') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (type === 'TIME') {
    const ms = typeof value === 'number' ? value : 0;
    if (ms >= 60000) {
      const mins = Math.floor(ms / 60000);
      const secs = ((ms % 60000) / 1000).toFixed(1);
      return `${mins}m${secs}s`;
    }
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  }
  if (typeof value === 'number') {
    // Format integers without decimals, floats with 2 decimals
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  return String(value);
}

/**
 * Get CSS class for value display based on type and value
 */
function getValueClass(value: unknown, type: string): string {
  if (value === undefined || value === null) return 'text-slate-500';
  
  if (type === 'BOOL') {
    return value ? 'text-green-400 font-bold' : 'text-red-400';
  }
  if (type === 'TIME') {
    return 'text-amber-400';
  }
  return 'text-cyan-400';
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

  // Width needs to be larger when debug is active to show values
  const baseWidth = debugActive ? 160 : 120;
  const maxPorts = Math.max(ports.inputs.length, ports.outputs.length);
  const portHeight = debugActive ? 28 : 24;  // More space for value display
  const headerHeight = 32;
  const bodyHeight = Math.max(maxPorts * portHeight + 16, 60);

  // Get live value and metadata for a port
  const getPortValue = (portName: string): { display: string; raw: unknown; type: string } => {
    const port = [...ports.inputs, ...ports.outputs].find(p => p.name === portName);
    const portType = port?.type || 'INT';
    
    if (!debugActive || !liveValues || !instanceName) {
      return { display: '', raw: undefined, type: portType };
    }
    const key = `${instanceName}.${portName}`;
    const value = liveValues.get(key);
    return { 
      display: formatLiveValue(value, portType), 
      raw: value, 
      type: portType 
    };
  };
  
  // Check if any output is TRUE (for visual feedback)
  const hasActiveOutput = debugActive && instanceName && liveValues && ports.outputs.some(port => {
    const key = `${instanceName}.${port.name}`;
    const value = liveValues.get(key);
    return port.type === 'BOOL' && !!value;
  });

  return (
    <div className="flex flex-col items-center relative">
      <div
        className={`
          rounded border-2 shadow-lg transition-all duration-200
          ${selected 
            ? 'border-blue-400 ring-2 ring-blue-400/50' 
            : hasActiveOutput
              ? 'border-green-500 ring-2 ring-green-500/30'
              : 'border-slate-500'
          }
          bg-slate-800
        `}
        style={{ minWidth: baseWidth }}
        title={comment}
        onContextMenu={handleContextMenu}
      >
        {/* Header with type name */}
        <div className={`${getHeaderColor()} px-3 py-1.5 rounded-t text-center relative flex items-center justify-center gap-2`}>
          {/* Debug indicator */}
          {debugActive && (
            <Activity 
              size={12} 
              className={`absolute left-2 ${hasActiveOutput ? 'text-green-300 animate-pulse' : 'text-white/50'}`}
            />
          )}
          
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
          className="relative px-2 py-2 flex justify-between gap-2"
          style={{ minHeight: bodyHeight }}
        >
          {/* Input ports (left side) */}
          <div className="flex flex-col gap-1">
            {ports.inputs.map((port, idx) => {
              const { display, raw, type: portType } = getPortValue(port.name);
              const valueClass = getValueClass(raw, portType);
              return (
                <div key={port.name} className="flex items-center gap-1 relative" style={{ height: portHeight }}>
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
                  {debugActive && display && (
                    <span className={`text-[10px] font-mono ml-1 px-1 py-0.5 rounded bg-slate-900/50 ${valueClass}`}>
                      {display}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Output ports (right side) */}
          <div className="flex flex-col gap-1 items-end">
            {ports.outputs.map((port, idx) => {
              const { display, raw, type: portType } = getPortValue(port.name);
              const valueClass = getValueClass(raw, portType);
              return (
                <div key={port.name} className="flex items-center gap-1 relative" style={{ height: portHeight }}>
                  {debugActive && display && (
                    <span className={`text-[10px] font-mono mr-1 px-1 py-0.5 rounded bg-slate-900/50 ${valueClass}`}>
                      {display}
                    </span>
                  )}
                  <span className="text-xs text-slate-300 font-mono pr-3">
                    {port.name}
                  </span>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={port.name}
                    className={`!w-3 !h-3 !border-2 ${
                      debugActive && raw && portType === 'BOOL'
                        ? '!bg-green-400 !border-green-600'
                        : '!bg-green-400 !border-green-600'
                    }`}
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
              <span className={`w-2 h-2 rounded-full ${hasActiveOutput ? 'bg-green-500' : 'bg-slate-500'} ${hasActiveOutput ? 'animate-pulse' : ''}`} />
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
