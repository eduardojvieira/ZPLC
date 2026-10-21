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

import React, { useEffect, useMemo } from 'react';
import { Clock, Hash, ToggleLeft, Zap } from 'lucide-react';
import { useDebugValues } from '../../hooks/useDebugValue';
import { useIDEStore } from '../../store/useIDEStore';
import { getDefaultPorts } from '../../models/fbd';
import { Button, Dialog, SignalValue } from '../../ui';
import { sampleTone } from '../../theme/signalTone';
import { t } from '../../i18n';

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
      return <ToggleLeft size={12} className="text-[var(--text-secondary)]" />;
    case 'TIME':
      return <Clock size={12} className="text-[var(--text-secondary)]" />;
    case 'INT':
    case 'DINT':
    case 'UINT':
    case 'UDINT':
      return <Hash size={12} className="text-[var(--text-secondary)]" />;
    default:
      return <Zap size={12} className="text-[var(--text-secondary)]" />;
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
  const ports = useMemo(() => getDefaultPorts(blockType), [blockType]);
  
  // Build variable paths for all ports
  const allPaths = useMemo(
    () => [
      ...ports.inputs.map((port) => `${instanceName}.${port.name}`),
      ...ports.outputs.map((port) => `${instanceName}.${port.name}`),
    ],
    [instanceName, ports],
  );
  
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

  return (
    <Dialog
      open
      onClose={onClose}
      title={blockType}
      description={<span className="font-mono">{instanceName}</span>}
      size="sm"
      closeButton={false}
      footer={(
        <>
          <p className="mr-auto text-[length:var(--font-size-caption)] text-[var(--color-surface-500)]">{t('editors.fbd.autoAdded')}</p>
          <Button onClick={onClose}>{t('a11y.fbd.closeMonitor')}</Button>
        </>
      )}
    >
      {/* Status bar */}
        <div className="px-4 py-2 bg-[var(--color-surface-700)] border-b border-[var(--color-surface-600)] flex items-center gap-2">
          <SignalValue tone={debugMode !== 'none' ? 'true' : 'unknown'} className="text-xs">
            {debugMode !== 'none' ? t('editors.fbd.live') : t('editors.fbd.offline')}
          </SignalValue>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Inputs */}
          <div>
            <h3 className="text-xs font-medium text-[var(--color-surface-400)] uppercase tracking-wide mb-2">
              {t('editors.fbd.inputs')}
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
                    <span className="text-[length:var(--font-size-caption)] text-[var(--color-surface-500)]">
                      {pv.type}
                    </span>
                  </div>
                  <SignalValue tone={sampleTone({ value: pv.value, type: pv.type })} className="font-mono text-sm font-medium">
                    {formatPortValue(pv.value, pv.type)}
                  </SignalValue>
                </div>
              ))}
            </div>
          </div>

          {/* Outputs */}
          <div>
            <h3 className="text-xs font-medium text-[var(--color-surface-400)] uppercase tracking-wide mb-2">
              {t('editors.fbd.outputs')}
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
                    <span className="text-[length:var(--font-size-caption)] text-[var(--color-surface-500)]">
                      {pv.type}
                    </span>
                  </div>
                  <SignalValue tone={sampleTone({ value: pv.value, type: pv.type })} className="font-mono text-sm font-medium">
                    {formatPortValue(pv.value, pv.type)}
                  </SignalValue>
                </div>
              ))}
            </div>
          </div>
        </div>

    </Dialog>
  );
}

export default InstanceMonitor;
