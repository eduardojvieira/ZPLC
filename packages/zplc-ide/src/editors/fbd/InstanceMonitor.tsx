/**
 * @file InstanceMonitor.tsx
 * @brief Modal dialog for inspecting Function Block instance internals
 *
 * Shows the internal state of a Function Block instance including:
 * - Input values (IN, PT, R, etc.)
 * - Output values (Q, ET, CV, etc.)
 * - Internal state (running, elapsed time, etc.)
 *
 * Supports live value updates during debugging.
 */

import React, { useEffect } from 'react';
import { X, RefreshCw, Clock, Hash, ToggleLeft, Zap } from 'lucide-react';
import { useDebugValues } from '../../hooks/useDebugValue';
import { useIDEStore } from '../../store/useIDEStore';
import { getDefaultPorts } from '../../models/fbd';

// =============================================================================
// Types
// =============================================================================

interface InstanceMonitorProps {
  /** Instance name (e.g., "Timer1", "Counter_Main") */
  instanceName: string;
  /** Block type (e.g., "TON", "CTU") */
  blockType: string;
  /** Callback to close the monitor */
  onClose: () => void;
}

interface PortValue {
  name: string;
  type: string;
  value: unknown;
  direction: 'input' | 'output';
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get icon for a data type
 */
function getTypeIcon(type: string): React.ReactNode {
  switch (type.toUpperCase()) {
    case 'BOOL':
      return <ToggleLeft size={12} className="text-blue-400" />;
    case 'TIME':
      return <Clock size={12} className="text-amber-400" />;
    case 'INT':
    case 'DINT':
    case 'UINT':
    case 'UDINT':
      return <Hash size={12} className="text-green-400" />;
    default:
      return <Zap size={12} className="text-purple-400" />;
  }
}

/**
 * Format a value based on its type
 */
function formatPortValue(value: unknown, type: string): string {
  if (value === undefined || value === null) return '---';
  
  if (type.toUpperCase() === 'BOOL') {
    return value ? 'TRUE' : 'FALSE';
  }
  
  if (type.toUpperCase() === 'TIME') {
    const ms = typeof value === 'number' ? value : 0;
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    return `${ms}ms`;
  }
  
  if (typeof value === 'number') {
    return value.toString();
  }
  
  return String(value);
}

/**
 * Get color for boolean value
 */
function getBoolColor(value: unknown): string {
  if (value === true) return 'text-green-400';
  if (value === false) return 'text-red-400';
  return 'text-slate-400';
}

// =============================================================================
// Component
// =============================================================================

export function InstanceMonitor({
  instanceName,
  blockType,
  onClose,
}: InstanceMonitorProps): React.ReactElement {
  const debugMode = useIDEStore((state) => state.debug.mode);
  const addWatchVariable = useIDEStore((state) => state.addWatchVariable);
  
  // Get port definitions for this block type
  const ports = getDefaultPorts(blockType);
  
  // Build variable paths for all ports
  const inputPaths = ports.inputs.map((p) => `${instanceName}.${p.name}`);
  const outputPaths = ports.outputs.map((p) => `${instanceName}.${p.name}`);
  const allPaths = [...inputPaths, ...outputPaths];
  
  // Subscribe to live values for all ports
  const liveValues = useDebugValues(allPaths);
  
  // Auto-add to watch list on mount
  useEffect(() => {
    allPaths.forEach((path) => addWatchVariable(path));
  }, [allPaths, addWatchVariable]);
  
  // Build port values with live data
  const inputValues: PortValue[] = ports.inputs.map((port) => ({
    name: port.name,
    type: port.type,
    value: liveValues.get(`${instanceName}.${port.name}`)?.value,
    direction: 'input' as const,
  }));
  
  const outputValues: PortValue[] = ports.outputs.map((port) => ({
    name: port.name,
    type: port.type,
    value: liveValues.get(`${instanceName}.${port.name}`)?.value,
    direction: 'output' as const,
  }));

  // Block type color
  const getHeaderColor = () => {
    if (['TON', 'TOF', 'TP'].includes(blockType)) return 'bg-amber-600';
    if (['CTU', 'CTD', 'CTUD'].includes(blockType)) return 'bg-emerald-600';
    if (['R_TRIG', 'F_TRIG'].includes(blockType)) return 'bg-purple-600';
    if (['SR', 'RS'].includes(blockType)) return 'bg-blue-600';
    return 'bg-slate-600';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--color-surface-800)] rounded-lg shadow-2xl border border-[var(--color-surface-600)] min-w-[320px] max-w-[480px]">
        {/* Header */}
        <div className={`${getHeaderColor()} px-4 py-3 rounded-t-lg flex items-center justify-between`}>
          <div>
            <h2 className="text-white font-bold text-lg">{blockType}</h2>
            <p className="text-white/80 text-sm font-mono">{instanceName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Status bar */}
        <div className="px-4 py-2 bg-[var(--color-surface-700)] border-b border-[var(--color-surface-600)] flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            debugMode !== 'none' ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
          }`} />
          <span className="text-xs text-[var(--color-surface-300)]">
            {debugMode !== 'none' ? 'Live' : 'Offline'}
          </span>
          {debugMode !== 'none' && (
            <RefreshCw size={12} className="text-[var(--color-surface-400)] animate-spin" />
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Inputs */}
          <div>
            <h3 className="text-xs font-medium text-[var(--color-surface-400)] uppercase tracking-wide mb-2">
              Inputs
            </h3>
            <div className="space-y-1">
              {inputValues.map((pv) => (
                <div
                  key={pv.name}
                  className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-700)] rounded"
                >
                  <div className="flex items-center gap-2">
                    {getTypeIcon(pv.type)}
                    <span className="font-mono text-sm text-[var(--color-surface-200)]">
                      {pv.name}
                    </span>
                    <span className="text-[10px] text-[var(--color-surface-500)]">
                      {pv.type}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-sm font-medium ${
                      pv.type === 'BOOL' ? getBoolColor(pv.value) : 'text-blue-400'
                    }`}
                  >
                    {formatPortValue(pv.value, pv.type)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Outputs */}
          <div>
            <h3 className="text-xs font-medium text-[var(--color-surface-400)] uppercase tracking-wide mb-2">
              Outputs
            </h3>
            <div className="space-y-1">
              {outputValues.map((pv) => (
                <div
                  key={pv.name}
                  className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-700)] rounded"
                >
                  <div className="flex items-center gap-2">
                    {getTypeIcon(pv.type)}
                    <span className="font-mono text-sm text-[var(--color-surface-200)]">
                      {pv.name}
                    </span>
                    <span className="text-[10px] text-[var(--color-surface-500)]">
                      {pv.type}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-sm font-medium ${
                      pv.type === 'BOOL' ? getBoolColor(pv.value) : 'text-blue-400'
                    }`}
                  >
                    {formatPortValue(pv.value, pv.type)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[var(--color-surface-700)] rounded-b-lg border-t border-[var(--color-surface-600)]">
          <p className="text-[10px] text-[var(--color-surface-500)] text-center">
            Values auto-added to Watch panel
          </p>
        </div>
      </div>
    </div>
  );
}

export default InstanceMonitor;
