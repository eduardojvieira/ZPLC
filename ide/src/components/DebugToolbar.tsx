/**
 * @file DebugToolbar.tsx
 * @brief Debug control toolbar for ZPLC IDE
 *
 * Provides controls for:
 * - Start/Stop simulation or hardware connection
 * - Pause/Resume execution
 * - Step (single cycle)
 * - Debug mode selection (Simulation vs Hardware)
 * - Connection status display
 */

import React, { useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipForward,
  RefreshCw,
  Cpu,
  Radio,
  CircleDot,
  Wifi,
  WifiOff,
  Bug,
  BugOff,
} from 'lucide-react';
import { useIDEStore, type DebugMode } from '../store/useIDEStore';
import type { IDebugAdapter, VMState } from '../runtime/debugAdapter';

// =============================================================================
// Types
// =============================================================================

interface DebugToolbarProps {
  /** Debug adapter instance (WASM or Serial) */
  adapter: IDebugAdapter | null;
  /** Current VM state from adapter */
  vmState: VMState;
  /** Callback to start simulation mode */
  onStartSimulation?: () => void;
  /** Callback to connect to hardware */
  onConnectHardware?: () => void;
  /** Callback to disconnect */
  onDisconnect?: () => void;
}

// =============================================================================
// Sub-components
// =============================================================================

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  variant?: 'default' | 'primary' | 'danger' | 'success';
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled = false,
  active = false,
  variant = 'default',
}: ToolbarButtonProps) {
  const baseClasses = `
    flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium
    transition-colors disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const variantClasses = {
    default: `
      bg-[var(--color-surface-700)] text-[var(--color-surface-200)]
      hover:bg-[var(--color-surface-600)] hover:text-[var(--color-surface-100)]
      ${active ? 'ring-1 ring-blue-500' : ''}
    `,
    primary: `
      bg-blue-600 text-white hover:bg-blue-500
    `,
    danger: `
      bg-red-600 text-white hover:bg-red-500
    `,
    success: `
      bg-green-600 text-white hover:bg-green-500
    `,
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]}`}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function DebugToolbar({
  adapter,
  vmState,
  onStartSimulation,
  onConnectHardware,
  onDisconnect,
}: DebugToolbarProps): React.ReactElement {
  // Store state
  const debugMode = useIDEStore((state) => state.debug.mode);
  const setDebugMode = useIDEStore((state) => state.setDebugMode);
  const breakpointCount = useIDEStore((state) => {
    let count = 0;
    state.debug.breakpoints.forEach((set) => (count += set.size));
    return count;
  });

  // Derived state
  const isConnected = adapter?.connected ?? false;
  const isRunning = vmState === 'running';
  const isPaused = vmState === 'paused';
  const isIdle = vmState === 'idle';
  const canControl = isConnected && (isRunning || isPaused || isIdle);

  // Handlers
  const handleStart = useCallback(async () => {
    if (!adapter) return;
    try {
      await adapter.start();
    } catch (e) {
      console.error('Failed to start:', e);
    }
  }, [adapter]);

  const handlePause = useCallback(async () => {
    if (!adapter) return;
    try {
      await adapter.pause();
    } catch (e) {
      console.error('Failed to pause:', e);
    }
  }, [adapter]);

  const handleResume = useCallback(async () => {
    if (!adapter) return;
    try {
      await adapter.resume();
    } catch (e) {
      console.error('Failed to resume:', e);
    }
  }, [adapter]);

  const handleStop = useCallback(async () => {
    if (!adapter) return;
    try {
      await adapter.stop();
    } catch (e) {
      console.error('Failed to stop:', e);
    }
  }, [adapter]);

  const handleStep = useCallback(async () => {
    if (!adapter) return;
    try {
      await adapter.step();
    } catch (e) {
      console.error('Failed to step:', e);
    }
  }, [adapter]);

  const handleReset = useCallback(async () => {
    if (!adapter) return;
    try {
      await adapter.reset();
    } catch (e) {
      console.error('Failed to reset:', e);
    }
  }, [adapter]);

  const handleModeChange = useCallback(
    (mode: DebugMode) => {
      if (mode === debugMode) return;

      // Disconnect current adapter if changing modes
      if (isConnected && onDisconnect) {
        onDisconnect();
      }

      setDebugMode(mode);

      // Auto-start based on mode
      if (mode === 'simulation' && onStartSimulation) {
        onStartSimulation();
      } else if (mode === 'hardware' && onConnectHardware) {
        onConnectHardware();
      }
    },
    [debugMode, isConnected, onDisconnect, onStartSimulation, onConnectHardware, setDebugMode]
  );

  // Status indicator
  const getStatusInfo = (): { color: string; text: string; icon: React.ReactNode } => {
    if (!isConnected) {
      return {
        color: 'text-[var(--color-surface-400)]',
        text: 'Disconnected',
        icon: <WifiOff size={14} />,
      };
    }

    switch (vmState) {
      case 'running':
        return {
          color: 'text-green-400',
          text: 'Running',
          icon: <Wifi size={14} className="animate-pulse" />,
        };
      case 'paused':
        return {
          color: 'text-yellow-400',
          text: 'Paused',
          icon: <Pause size={14} />,
        };
      case 'idle':
        return {
          color: 'text-blue-400',
          text: 'Idle',
          icon: <CircleDot size={14} />,
        };
      case 'error':
        return {
          color: 'text-red-400',
          text: 'Error',
          icon: <Square size={14} />,
        };
      default:
        return {
          color: 'text-[var(--color-surface-400)]',
          text: vmState,
          icon: <CircleDot size={14} />,
        };
    }
  };

  const status = getStatusInfo();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface-800)] border-b border-[var(--color-surface-600)]">
      {/* Debug Mode Selector */}
      <div className="flex items-center gap-1 mr-2">
        <span className="text-xs text-[var(--color-surface-400)] mr-1">Mode:</span>
        <button
          onClick={() => handleModeChange('simulation')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            debugMode === 'simulation'
              ? 'bg-blue-600 text-white'
              : 'bg-[var(--color-surface-700)] text-[var(--color-surface-300)] hover:bg-[var(--color-surface-600)]'
          }`}
          title="Simulation (WASM)"
        >
          <Cpu size={12} />
          <span className="hidden md:inline">Simulate</span>
        </button>
        <button
          onClick={() => handleModeChange('hardware')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            debugMode === 'hardware'
              ? 'bg-green-600 text-white'
              : 'bg-[var(--color-surface-700)] text-[var(--color-surface-300)] hover:bg-[var(--color-surface-600)]'
          }`}
          title="Hardware (WebSerial)"
        >
          <Radio size={12} />
          <span className="hidden md:inline">Hardware</span>
        </button>
        <button
          onClick={() => handleModeChange('none')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            debugMode === 'none'
              ? 'bg-[var(--color-surface-600)] text-[var(--color-surface-100)]'
              : 'bg-[var(--color-surface-700)] text-[var(--color-surface-400)] hover:bg-[var(--color-surface-600)]'
          }`}
          title="Debug Off"
        >
          <BugOff size={12} />
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-[var(--color-surface-600)]" />

      {/* Execution Controls */}
      <div className="flex items-center gap-1">
        {/* Start/Resume */}
        {isPaused ? (
          <ToolbarButton
            icon={<Play size={14} />}
            label="Resume"
            onClick={handleResume}
            disabled={!canControl}
            variant="success"
          />
        ) : (
          <ToolbarButton
            icon={<Play size={14} />}
            label="Start"
            onClick={handleStart}
            disabled={!isConnected || isRunning}
            variant="success"
          />
        )}

        {/* Pause */}
        <ToolbarButton
          icon={<Pause size={14} />}
          label="Pause"
          onClick={handlePause}
          disabled={!isRunning}
        />

        {/* Stop */}
        <ToolbarButton
          icon={<Square size={14} />}
          label="Stop"
          onClick={handleStop}
          disabled={!canControl || isIdle}
          variant="danger"
        />

        {/* Step */}
        <ToolbarButton
          icon={<SkipForward size={14} />}
          label="Step"
          onClick={handleStep}
          disabled={!isPaused && !isIdle}
        />

        {/* Reset */}
        <ToolbarButton
          icon={<RefreshCw size={14} />}
          label="Reset"
          onClick={handleReset}
          disabled={!isConnected}
        />
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-[var(--color-surface-600)]" />

      {/* Status Display */}
      <div className={`flex items-center gap-1.5 text-xs ${status.color}`}>
        {status.icon}
        <span>{status.text}</span>
      </div>

      {/* Breakpoint Count */}
      {breakpointCount > 0 && (
        <div className="flex items-center gap-1 text-xs text-[var(--color-surface-400)]">
          <Bug size={12} className="text-red-400" />
          <span>{breakpointCount}</span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Connection Button */}
      {debugMode !== 'none' && (
        <>
          {isConnected ? (
            <button
              onClick={onDisconnect}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium
                         bg-[var(--color-surface-700)] text-[var(--color-surface-300)]
                         hover:bg-red-600 hover:text-white transition-colors"
            >
              <WifiOff size={14} />
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          ) : (
            <button
              onClick={debugMode === 'simulation' ? onStartSimulation : onConnectHardware}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium
                         bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            >
              <Wifi size={14} />
              <span className="hidden sm:inline">Connect</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default DebugToolbar;
