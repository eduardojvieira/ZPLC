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
import { getDefaultPorts, isFunctionBlock, type FBDPort } from '../../../models/fbd';
import NodeComment from './NodeComment';
import { Button, SignalValue, Tooltip } from '../../../ui';
import { sampleTone, type SignalTone } from '../../../theme/signalTone';
import { t } from '../../../i18n';

interface FunctionBlockData {
  type: string;
  instanceName?: string;
  comment?: string;
  /** The value each pin holds online, by port: what the debug map says the program holds (LNG-006). */
  pinValues?: Record<string, number | boolean | string | undefined>;
  /** Pins the user forces, or that could not be read: their value is drawn as forced or as a fault (UX-009). */
  pinFlags?: Record<string, { forced?: boolean; fault?: boolean } | undefined>;
  /** Whether debug mode is active */
  debugActive?: boolean;
  /** Callback to open instance monitor */
  onOpenMonitor?: (instanceName: string, blockType: string) => void;
  onChangeData?: (nodeId: string, data: Record<string, unknown>) => void;
  readOnly?: boolean;
  inputs?: FBDPort[];
  outputs?: FBDPort[];
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

const FunctionBlockNode = memo(({ id, data, selected }: NodeProps) => {
  const { type, instanceName, comment, pinValues, pinFlags, debugActive, onOpenMonitor, onChangeData, readOnly, inputs, outputs } =
    data as unknown as FunctionBlockData;

  const defaults = getDefaultPorts(type);
  const ports = { inputs: inputs ?? defaults.inputs, outputs: outputs ?? defaults.outputs };
  const [showMenu, setShowMenu] = useState(false);

  // Handle context menu / right-click
  const handleOpenMonitor = useCallback(() => {
    setShowMenu(false);
    if (onOpenMonitor && instanceName) {
      onOpenMonitor(instanceName, type);
    }
  }, [onOpenMonitor, instanceName, type]);

  // Width needs to be larger when debug is active to show values
  const baseWidth = debugActive ? 160 : 120;
  const maxPorts = Math.max(ports.inputs.length, ports.outputs.length);
  const portHeight = debugActive ? 28 : 24; // More space for value display
  const bodyHeight = Math.max(maxPorts * portHeight + 16, 60);

  // Get live value and metadata for a port
  const getPortValue = (portName: string): { display: string; raw: unknown; type: string; tone: SignalTone } => {
    const port = [...ports.inputs, ...ports.outputs].find((p) => p.name === portName);
    const portType = port?.type || 'INT';

    if (!debugActive) {
      return { display: '', raw: undefined, type: portType, tone: 'unknown' };
    }
    const value = pinValues?.[portName];
    return {
      display: formatLiveValue(value, portType),
      raw: value,
      type: portType,
      tone: sampleTone({
        value,
        type: portType,
        forced: pinFlags?.[portName]?.forced,
        error: pinFlags?.[portName]?.fault ? 'fault' : null,
      }),
    };
  };

  // Check if any output is TRUE (for visual feedback)
  const hasActiveOutput = debugActive && ports.outputs.some((port) => port.type === 'BOOL' && pinValues?.[port.name] === true);

  return (
    <div className="zplc-visual-node flex flex-col items-center relative">
      <Tooltip content={comment}>
        <div
          className={`
            rounded border-2 transition-all duration-200
            ${selected ? 'border-[var(--color-accent-blue)] ring-2 ring-[var(--color-accent-blue)]' : 'border-[var(--border-color)]'}
            zplc-visual-card bg-[var(--visual-node)]
          `}
          style={{ minWidth: baseWidth }}
        >
          {/* Header with type name */}
          <div
            className={
              'bg-[var(--visual-panel)] border-b border-[var(--border-color)] px-3 py-1.5 rounded-t text-center relative ' +
              'flex ' +
              'items-center justify-center gap-2'
            }
          >
            {/* Debug indicator */}
            {debugActive && <Activity size={12} className="absolute left-2 text-[var(--text-secondary)]" aria-hidden="true" />}

            <span className="text-[var(--text-primary)] font-bold text-sm tracking-wide">{type}</span>

            {/* Menu button */}
            {isFunctionBlock(type) && instanceName && (
              <Button
                variant="bare"
                aria-label={t('a11y.fbd.blockMenu')}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className={
                  'focus-ring absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded ' +
                  'hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] text-[var(--text-secondary)] ' +
                  'hover:text-[var(--text-primary)]'
                }
              >
                <MoreVertical size={14} />
              </Button>
            )}
          </div>

          {/* Body with ports */}
          <div className="relative px-2 py-2 flex justify-between gap-2" style={{ minHeight: bodyHeight }}>
            {/* Input ports (left side) */}
            <div className="flex flex-col gap-1">
              {ports.inputs.map((port) => {
                const { display, tone } = getPortValue(port.name);
                return (
                  <div key={port.name} className="flex items-center gap-1 relative" style={{ height: portHeight }}>
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={port.name}
                      className="!w-3 !h-3 !rounded-[2px] !bg-[var(--visual-wire)] !border-2 !border-[var(--color-surface-300)]"
                      style={{ top: '50%' }}
                    />
                    <Tooltip content={port.name}>
                      <span className="max-w-[72px] truncate text-xs text-[var(--text-secondary)] font-mono pl-3">{port.name}</span>
                    </Tooltip>
                    {debugActive && display && (
                      <SignalValue
                        tone={tone}
                        className={
                          'text-[length:var(--font-size-caption)] font-mono ml-1 px-1 py-0.5 ' + 'rounded bg-[var(--color-surface-900)]/50'
                        }
                      >
                        {display}
                      </SignalValue>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Output ports (right side) */}
            <div className="flex flex-col gap-1 items-end">
              {ports.outputs.map((port) => {
                const { display, tone } = getPortValue(port.name);
                return (
                  <div key={port.name} className="flex items-center gap-1 relative" style={{ height: portHeight }}>
                    {debugActive && display && (
                      <SignalValue
                        tone={tone}
                        className={
                          'text-[length:var(--font-size-caption)] font-mono mr-1 px-1 py-0.5 ' + 'rounded bg-[var(--color-surface-900)]/50'
                        }
                      >
                        {display}
                      </SignalValue>
                    )}
                    <Tooltip content={port.name}>
                      <span className="max-w-[72px] truncate text-xs text-[var(--text-secondary)] font-mono pr-3">{port.name}</span>
                    </Tooltip>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={port.name}
                      className="!w-3 !h-3 !rounded-full !bg-[var(--visual-wire)] !border-2 !border-[var(--color-surface-300)]"
                      style={{ top: '50%' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Instance name footer (if applicable) */}
          {isFunctionBlock(type) && instanceName && (
            <div
              className={
                'bg-[var(--color-surface-700)] px-2 py-1 rounded-b border-t border-[var(--border-color)] flex items-center ' +
                'justify-between'
              }
            >
              <Tooltip content={instanceName}>
                <span className="max-w-[110px] truncate text-xs text-[var(--text-tertiary)] font-mono">{instanceName}</span>
              </Tooltip>
              {debugActive && <SignalValue tone={hasActiveOutput ? 'true' : 'false'} className="text-xs" />}
            </div>
          )}
        </div>
      </Tooltip>

      {/* Context Menu */}
      {showMenu && (
        <>
          {/* Backdrop to close menu */}
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div
            className={
              'absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-[var(--color-surface-800)] border ' +
              'border-[var(--border-color)] rounded min-w-[140px]'
            }
          >
            <Button
              variant="bare"
              onClick={handleOpenMonitor}
              className={
                'flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--text-secondary)] ' +
                'hover:bg-[var(--color-surface-700)] rounded'
              }
            >
              <Eye size={14} />
              {t('editors.fbd.instanceMonitor')}
            </Button>
          </div>
        </>
      )}

      {/* Editable comment below node */}
      <NodeComment nodeId={id} comment={comment} onChange={onChangeData} readOnly={readOnly} />
    </div>
  );
});

FunctionBlockNode.displayName = 'FunctionBlockNode';

export default FunctionBlockNode;
