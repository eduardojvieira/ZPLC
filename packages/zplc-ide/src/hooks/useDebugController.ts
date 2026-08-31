/**
 * @file useDebugController.ts
 * @brief Debug Controller Hook for ZPLC IDE
 *
 * This hook manages the lifecycle of debug adapters and provides a unified
 * interface for debug operations. It handles:
 *
 * - Creating and connecting WASM or Serial adapters
 * - Polling for live values at configurable intervals
 * - Syncing breakpoints from store to adapter
 * - Event handling (breakpoint hits, step complete, errors)
 * - Cleanup on unmount or mode change
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useIDEStore, type LiveValue } from '../store/useIDEStore';
import type {
  IDebugAdapter,
  VMState,
  VMInfo,
  DebugAdapterEvents,
  WatchVariable,
  WatchForceEntry,
  WatchForceState,
} from '../runtime/debugAdapter';
import { WATCH_FORCE_STATE, bytesToHex, valueToBytes } from '../runtime/debugAdapter';
import { createSimulationAdapter } from '../runtime/simulationAdapterFactory';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { connectionManager } from '../runtime/connectionManager';
import type { DebugMap } from '../compiler';
import { findVariable } from '../compiler';
import type { UploadTraceEvent } from '../runtime/uploadTrace';
import {
  resolveExecutionLocation,
} from './debugExecutionLocation';
import { buildPolledDebugPaths, describePolledDebugVariable } from './debugPollingPaths';
import { debugLog } from '../utils/debugLog';
import { deriveHardwareDebugState } from '../runtime/debugStatus';
import {
  type DebugCapabilities,
} from '../runtime/debugCapabilities';
import {
  getDebugCapabilitiesForAdapter,
  getDebugFeatureActionability,
} from './debugCapabilityActions';
import { isCurrentSerialAdapter, shouldMarkForceCommandFailureUnconfirmed, usesConnectionManager } from './forceReconciliation';
import {
  appendNativeTrace as appendNativeTraceSample,
  canCaptureNativeTrace,
  canCommitNativeLoad,
  canReenableNativeTrace,
} from '../runtime/nativeTrace';

const DEVICE_LOG_FLUSH_MS = 100;

// =============================================================================
// Types
// =============================================================================

export interface DebugControllerState {
  /** Current debug adapter instance */
  adapter: IDebugAdapter | null;
  /** Current VM state */
  vmState: VMState;
  /** Current VM info (PC, SP, cycles, etc.) */
  vmInfo: VMInfo | null;
  /** Whether currently polling for live values */
  isPolling: boolean;
  /** Last error message */
  lastError: string | null;
  /** Capability model for the active adapter/runtime */
  debugCapabilities: DebugCapabilities | null;
}

export interface DebugControllerActions {
  /** Start simulation mode with the local runtime adapter */
  startSimulation: () => Promise<void>;
  /** Connect to hardware via WebSerial */
  connectHardware: () => Promise<void>;
  /** Disconnect from current adapter */
  disconnect: () => Promise<void>;
  /** Load bytecode into the adapter */
  loadProgram: (bytecode: Uint8Array, debugMap?: DebugMap, projectBoard?: string) => Promise<void>;
  /** Start/resume execution */
  start: () => Promise<void>;
  /** Stop execution */
  stop: () => Promise<void>;
  /** Pause execution */
  pause: () => Promise<void>;
  /** Resume from pause */
  resume: () => Promise<void>;
  /** Execute single step */
  step: () => Promise<void>;
  /** Reset VM */
  reset: () => Promise<void>;
  /** Force a value in IPI */
  setValue: (
    address: number,
    value: number | boolean | string,
    type: WatchVariable['type'],
    maxLength?: number
  ) => Promise<void>;
  /** Enable or disable a runtime-owned forced value */
  toggleForceValue: (
    path: string,
    address: number,
    value: number | boolean | string,
    type: WatchVariable['type'],
    force: boolean,
    maxLength?: number
  ) => Promise<void>;
  /** Clear all forced values before disconnecting */
  clearAllForcedValues: () => Promise<void>;
  /** Set virtual input (WASM only) */
  setVirtualInput: (channel: number, value: number) => Promise<void>;
  /** Get virtual output (WASM only) */
  getVirtualOutput: (channel: number) => Promise<number>;
  /** Stage a closed native-POSIX simulation input and publish its observed snapshot. */
  setSimulationInput: (inputId: 'motor.start' | 'motor.stop' | 'motor.estop', active: boolean) => Promise<void>;
}

export type DebugController = DebugControllerState & DebugControllerActions;

// =============================================================================
// Hook Implementation
// =============================================================================

export function useDebugController(): DebugController {
  // Local state
  const [adapter, setAdapter] = useState<IDebugAdapter | null>(null);
  const [vmState, setVmState] = useState<VMState>('disconnected');
  const [vmInfo, setVmInfo] = useState<VMInfo | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [capabilityRevision, setCapabilityRevision] = useState(0);

  // Refs for polling
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const adapterRef = useRef<IDebugAdapter | null>(null);
  const explicitHardwareDisconnectRef = useRef(false);
  const externalDisconnectReportedRef = useRef(false);
  const deviceLogQueueRef = useRef<string[]>([]);
  const deviceLogFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const traceEpochRef = useRef(0);
  const traceCaptureEnabledRef = useRef(true);
  const traceBoundCompilerRunIdRef = useRef<number | null>(null);

  // Store selectors
  const debugMode = useIDEStore((state) => state.debug.mode);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const watchVariables = useIDEStore((state) => state.debug.watchVariables);
  const breakpointMap = useIDEStore((state) => state.debug.breakpoints);
  const pollingInterval = useIDEStore((state) => state.debug.pollingInterval);
  const isPolling = useIDEStore((state) => state.debug.isPolling);
  const mpeekEnabled = useIDEStore((state) => state.debug.mpeekEnabled);
  const compilerRunId = useIDEStore((state) => state.compilerRunId);
  const setControllerStatus = useIDEStore((state) => state.setControllerStatus);
  const controllerInfo = useIDEStore((state) => state.controllerInfo);
  // Capability events mutate a native adapter in place; revision forces this
  // projection to be recalculated instead of leaving stale controls enabled.
  const debugCapabilities: DebugCapabilities | null = useMemo(
    () => getDebugCapabilitiesForAdapter(adapter, debugMode, controllerInfo),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- native capability events mutate their adapter in place.
    [adapter, capabilityRevision, controllerInfo, debugMode],
  );

  // Store actions
  const setDebugMode = useIDEStore((state) => state.setDebugMode);
  const setDebugMap = useIDEStore((state) => state.setDebugMap);
  const setCurrentExecution = useIDEStore((state) => state.setCurrentExecution);
  const updateLiveValues = useIDEStore((state) => state.updateLiveValues);
  const clearLiveValues = useIDEStore((state) => state.clearLiveValues);
  const setPolling = useIDEStore((state) => state.setPolling);
  const getAllBreakpointPCs = useIDEStore((state) => state.getAllBreakpointPCs);
  const addConsoleEntry = useIDEStore((state) => state.addConsoleEntry);
  const addConsoleEntries = useIDEStore((state) => state.addConsoleEntries);
  const setForcedValue = useIDEStore((state) => state.setForcedValue);
  const clearForcedValue = useIDEStore((state) => state.clearForcedValue);
  const clearForcedValues = useIDEStore((state) => state.clearForcedValues);
  const markForcedValuesUnconfirmed = useIDEStore((state) => state.markForcedValuesUnconfirmed);
  const appendNativeTrace = useIDEStore((state) => state.appendNativeTrace);
  const clearNativeTrace = useIDEStore((state) => state.clearNativeTrace);

  const invalidateNativeTrace = useCallback(() => {
    traceCaptureEnabledRef.current = false;
    traceEpochRef.current += 1;
    clearNativeTrace();
  }, [clearNativeTrace]);
  const forcesUnconfirmed = useIDEStore((state) => state.debug.forcesUnconfirmed);

  const flushDeviceLogs = useCallback(() => {
    if (deviceLogFlushTimerRef.current) {
      clearTimeout(deviceLogFlushTimerRef.current);
      deviceLogFlushTimerRef.current = null;
    }

    if (deviceLogQueueRef.current.length === 0) {
      return;
    }

    const queuedLines = deviceLogQueueRef.current;
    deviceLogQueueRef.current = [];

    addConsoleEntries(
      queuedLines.map((line) => ({
        type: 'info' as const,
        message: line,
        source: 'device',
      })),
    );
  }, [addConsoleEntries]);

  const enqueueDeviceLog = useCallback((line: string) => {
    deviceLogQueueRef.current.push(line);

    if (deviceLogFlushTimerRef.current !== null) {
      return;
    }

    deviceLogFlushTimerRef.current = setTimeout(() => {
      flushDeviceLogs();
    }, DEVICE_LOG_FLUSH_MS);
  }, [flushDeviceLogs]);

  const logUploadTrace = useCallback((event: UploadTraceEvent) => {
    addConsoleEntry({
      type: event.kind === 'command' ? 'command' : 'info',
      message: event.message,
      source: 'runtime',
    });
  }, [addConsoleEntry]);

  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);


  // =========================================================================
  // Event Handlers
  // =========================================================================

  const createEventHandlers = useCallback((owner: IDebugAdapter, traceContext: { compilerRunId: number; epoch: number }): DebugAdapterEvents => {
    const isCurrentOwner = () => adapterRef.current === owner;
    return {
    onStateChange: (state: VMState) => {
      if (!isCurrentOwner()) return;
      setVmState(state);
    },
    onInfoUpdate: (info: VMInfo) => {
      if (!isCurrentOwner()) return;
      setVmInfo(info);
    },
    onError: (message: string) => {
      if (!isCurrentOwner()) return;
      setLastError(message);
      addConsoleEntry({
        type: 'error',
        message: `Debug error: ${message}`,
        source: 'debugger',
      });
    },
    onBreakpointHit: (pc: number, line?: number) => {
      if (!isCurrentOwner()) return;
      const resolved = resolveExecutionLocation(debugMap, pc, line);
      debugLog('[Execution] Breakpoint hit resolved', {
        pc,
        requestedLine: line ?? null,
        resolved,
      });
      setCurrentExecution(resolved.pouName, resolved.line, resolved.pc);

      addConsoleEntry({
        type: 'info',
        message: `Breakpoint hit at PC=0x${pc.toString(16).toUpperCase()}${line ? `, line ${line}` : ''}`,
        source: 'debugger',
      });
    },
    onStepComplete: (pc: number) => {
      if (!isCurrentOwner()) return;
      const resolved = resolveExecutionLocation(debugMap, pc);
      debugLog('[Execution] Step complete resolved', { pc, resolved });
      setCurrentExecution(resolved.pouName, resolved.line, resolved.pc);
    },
    onGpioChange: (_channel: number, value: number) => {
      if (!isCurrentOwner()) return;
      // Update OPI-based watch variables
      // The GPIO values are at OPI base addresses
      updateLiveValues(new Map([[`GPIO_OUT`, value]]));
    },
    onSerialData: (line: string) => {
      if (!isCurrentOwner()) return;
      enqueueDeviceLog(line);
    },
    onRuntimeSnapshot: (snapshot) => {
      const currentState = useIDEStore.getState();
      if (!traceCaptureEnabledRef.current || !canCaptureNativeTrace({
        activeAdapter: adapterRef.current,
        owner,
        snapshot,
        capturedCompilerRunId: traceContext.compilerRunId,
        currentCompilerRunId: currentState.compilerRunId,
        capturedTraceEpoch: traceContext.epoch,
        currentTraceEpoch: traceEpochRef.current,
      })) {
        return;
      }
      const trace = appendNativeTraceSample(currentState.debug.nativeTrace, adapterRef.current, owner, snapshot, {
        compilerRunId: traceContext.compilerRunId,
        receivedAtMs: Date.now(),
      });
      if (trace !== currentState.debug.nativeTrace) {
        appendNativeTrace(trace.at(-1)!);
      }
    },
    onCapabilitiesChange: () => {
      if (isCurrentOwner()) {
        setCapabilityRevision((revision) => revision + 1);
      }
    },
  };
  }, [debugMap, enqueueDeviceLog, setCurrentExecution, addConsoleEntry, updateLiveValues, appendNativeTrace]);

  const bindAdapterEventHandlers = useCallback((owner: IDebugAdapter, enableTrace: boolean) => {
    if (adapterRef.current !== owner) {
      return;
    }
    traceCaptureEnabledRef.current = enableTrace;
    if (enableTrace) {
      traceBoundCompilerRunIdRef.current = useIDEStore.getState().compilerRunId;
    }
    owner.setEventHandlers(createEventHandlers(owner, {
      compilerRunId: useIDEStore.getState().compilerRunId,
      epoch: traceEpochRef.current,
    }));
  }, [createEventHandlers]);

  useEffect(() => {
    if (!adapter) {
      return;
    }

    bindAdapterEventHandlers(adapter, traceCaptureEnabledRef.current);
    debugLog('[Execution] Refreshed adapter event handlers', {
      adapterType: adapter.type,
      hasDebugMap: Boolean(debugMap),
      debugPouKeys: debugMap ? Object.keys(debugMap.pou) : [],
    });
  }, [adapter, bindAdapterEventHandlers, debugMap]);

  useEffect(() => {
    invalidateNativeTrace();
  }, [compilerRunId, invalidateNativeTrace]);

  useEffect(() => {
    if (debugMode !== 'hardware') {
      return;
    }

    return connectionManager.onStatusUpdate((status) => {
      setControllerStatus(status);
      const derivedState = deriveHardwareDebugState(status);
      setVmState(derivedState.vmState);

      if (status.vm) {
        debugLog('[Execution] Hardware status update', {
          state: derivedState.vmState,
          pc: status.vm.pc,
          halted: derivedState.halted,
          error: status.vm.error,
        });
        setVmInfo({
          pc: status.vm.pc,
          sp: status.vm.sp,
          halted: derivedState.halted,
          cycles: status.stats.cycles,
          error: status.vm.error,
        });

        if (derivedState.vmState === 'paused') {
          const resolved = resolveExecutionLocation(debugMap, status.vm.pc);
          debugLog('[Execution] Paused status resolved', { pc: status.vm.pc, resolved });
          setCurrentExecution(resolved.pouName, resolved.line, resolved.pc);
        }
      }
    });
  }, [debugMap, debugMode, setControllerStatus, setCurrentExecution]);

  useEffect(() => {
    return () => {
      flushDeviceLogs();
    };
  }, [flushDeviceLogs]);

  // =========================================================================
  // Adapter Lifecycle
  // =========================================================================

  const resetConnectionState = useCallback(() => {
    invalidateNativeTrace();
    adapterRef.current = null;
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setAdapter(null);
    setVmState('disconnected');
    setVmInfo(null);
    clearLiveValues();
    setPolling(false);
    setCurrentExecution(null, null, null);
    setDebugMode('none');
  }, [clearLiveValues, invalidateNativeTrace, setCurrentExecution, setDebugMode, setPolling]);

  useEffect(() => {
    const currentAdapter = adapter;
    if (currentAdapter?.type !== 'serial') {
      return;
    }

    return connectionManager.onConnectionChange((connected) => {
      if (connected || explicitHardwareDisconnectRef.current || externalDisconnectReportedRef.current) {
        return;
      }
      if (!isCurrentSerialAdapter(adapterRef.current, currentAdapter)) {
        return;
      }

      externalDisconnectReportedRef.current = true;
      markForcedValuesUnconfirmed();
      resetConnectionState();
      setLastError('Hardware connection lost. Force state unconfirmed.');
      addConsoleEntry({
        type: 'warning',
        message: 'Hardware connection lost. Force state is unconfirmed; reconnect and verify before operating.',
        source: 'debugger',
      });
    });
  }, [adapter, addConsoleEntry, markForcedValuesUnconfirmed, resetConnectionState]);

  const disconnect = useCallback(async () => {
    invalidateNativeTrace();
    const currentAdapter = adapterRef.current;
    const isHardware = currentAdapter?.type === 'serial';
    if (isHardware) {
      explicitHardwareDisconnectRef.current = true;
    }
    let forceReleaseFailed = false;
    try {
      if (currentAdapter) {
        try {
          await currentAdapter.clearAllForcedValues();
          if (isHardware && isCurrentSerialAdapter(adapterRef.current, currentAdapter) && currentAdapter.connected) {
            clearForcedValues();
          } else if (!useIDEStore.getState().debug.forcesUnconfirmed) {
            clearForcedValues();
          }
        } catch (forceErr) {
          forceReleaseFailed = true;
          if (isHardware) {
            markForcedValuesUnconfirmed();
          }
          console.warn('[DebugController] failed to clear forced values during disconnect:', forceErr);
        }
      }

      // For hardware mode, use connectionManager to disconnect
      // For simulation, disconnect the WASM adapter directly
      if (isHardware) {
        await connectionManager.disconnect();
      } else if (currentAdapter) {
        await currentAdapter.disconnect();
      }

      if (forceReleaseFailed) {
        setLastError('Force state unconfirmed. Reconnect and verify before operating.');
        addConsoleEntry({
          type: 'warning',
          message: 'Disconnected, but force release could not be confirmed. Reconnect and verify before operating.',
          source: 'debugger',
        });
      } else {
        addConsoleEntry({
          type: 'info',
          message: 'Debug session disconnected',
          source: 'debugger',
        });
        setLastError(null);
      }
    } catch (err) {
      console.error('[DebugController] disconnect error:', err);
      const message = 'Connection close failed. Verify device state before operating.';
      setLastError(message);
      addConsoleEntry({
        type: 'warning',
        message,
        source: 'debugger',
      });
      throw new Error(message);
    } finally {
      // Always clean up state, even if disconnect threw an error
      resetConnectionState();
      explicitHardwareDisconnectRef.current = false;
    }
  }, [clearForcedValues, invalidateNativeTrace, markForcedValuesUnconfirmed, resetConnectionState, addConsoleEntry]);

  const startSimulation = useCallback(async () => {
    try {
      if (adapterRef.current) {
        await disconnect();
      }

      invalidateNativeTrace();
      const simulationAdapter = createSimulationAdapter();
      await simulationAdapter.connect();

      adapterRef.current = simulationAdapter;
      setAdapter(simulationAdapter);
      bindAdapterEventHandlers(simulationAdapter, true);
      setVmState('idle');
      setLastError(null);
      setDebugMode('simulation');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setLastError(message);
      resetConnectionState();
      throw err;
    }
  }, [bindAdapterEventHandlers, disconnect, invalidateNativeTrace, resetConnectionState, setDebugMode]);

  const connectHardware = useCallback(async () => {
    try {
      externalDisconnectReportedRef.current = false;
      explicitHardwareDisconnectRef.current = false;
      if (adapterRef.current) {
        await disconnect();
      }

      invalidateNativeTrace();
      await connectionManager.connect();
      const serialAdapter = connectionManager.serialAdapter;
      if (!serialAdapter) {
        throw new Error('Failed to get serial adapter from connection manager');
      }

      adapterRef.current = serialAdapter;
      setAdapter(serialAdapter);
      bindAdapterEventHandlers(serialAdapter, true);
      setVmState(serialAdapter.state);
      setLastError(null);
      setDebugMode('hardware');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setLastError(message);
      try {
        await connectionManager.disconnect();
      } catch (disconnectError) {
        console.warn('[DebugController] failed to clean up partial hardware connection:', disconnectError);
      }
      resetConnectionState();
      throw err;
    }
  }, [bindAdapterEventHandlers, disconnect, invalidateNativeTrace, resetConnectionState, setDebugMode]);

  // =========================================================================
  // Program Loading
  // =========================================================================

  const loadProgram = useCallback(async (bytecode: Uint8Array, newDebugMap?: DebugMap, projectBoard?: string) => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter) {
      throw new Error('No adapter connected');
    }

    // For hardware mode, pause polling during entire load operation
    // (upload + breakpoint sync) to avoid serial conflicts
    const isHardware = debugMode === 'hardware';
    const loadedCompilerRunId = useIDEStore.getState().compilerRunId;
    invalidateNativeTrace();
    if (isHardware) {
      connectionManager.pausePolling();
    }

    try {
      // Upload bytecode
      if (isHardware) {
        await connectionManager.deployProgram(bytecode, projectBoard, { trace: logUploadTrace });
      } else {
        await currentAdapter.loadProgram(bytecode);
      }

      const ownerIsCurrent = adapterRef.current === currentAdapter;
      if (!canCommitNativeLoad(ownerIsCurrent, loadedCompilerRunId, useIDEStore.getState().compilerRunId)) {
        throw new Error('Program load became stale; compile again before running.');
      }

      if (newDebugMap) {
        setDebugMap(newDebugMap);
      }

      bindAdapterEventHandlers(currentAdapter, true);

      // Sync breakpoints to adapter (skip for hardware if not supported)
      const breakpointPCs = getAllBreakpointPCs();
      if (breakpointPCs.length > 0) {
        try {
          const capability = getDebugFeatureActionability(debugCapabilities, 'breakpoints', 'Breakpoint sync');
          if (!capability.allowed) {
            addConsoleEntry({
              type: 'warning',
              message: capability.message ?? 'Breakpoint sync unavailable in the active runtime',
              source: 'debugger',
            });
          } else {
            if (capability.message) {
              addConsoleEntry({
                type: 'warning',
                message: capability.message,
                source: 'debugger',
              });
            }

            await currentAdapter.clearBreakpoints();
            for (const pc of breakpointPCs) {
              await currentAdapter.setBreakpoint(pc);
            }
          }
        } catch (e) {
          // Breakpoints may not be supported on hardware, log but don't fail
          console.warn('Breakpoint sync failed:', e);
        }
      }

      addConsoleEntry({
        type: 'success',
        message: isHardware
          ? `Program deployed and stopped: ${bytecode.length} bytes, ${breakpointPCs.length} breakpoints set`
          : `Loaded ${bytecode.length} bytes, ${breakpointPCs.length} breakpoints set`,
        source: 'debugger',
      });
    } finally {
      // Resume polling after all operations complete
      // Add small delay to let serial buffer settle
      if (isHardware) {
        await new Promise(r => setTimeout(r, 200));
        connectionManager.resumePolling();
      }
    }
  }, [bindAdapterEventHandlers, invalidateNativeTrace, debugCapabilities, debugMode, setDebugMap, getAllBreakpointPCs, addConsoleEntry, logUploadTrace]);

  // =========================================================================
  // Execution Control
  // =========================================================================

  const start = useCallback(async () => {
    if (!adapterRef.current) return;
    await adapterRef.current.start();
  }, []);

  const stop = useCallback(async () => {
    if (!adapterRef.current) return;
    await adapterRef.current.stop();
    setCurrentExecution(null, null, null);
  }, [setCurrentExecution]);

  const pause = useCallback(async () => {
    if (!adapterRef.current) return;
    const capability = getDebugFeatureActionability(debugCapabilities, 'pause', 'Pause');
    if (!capability.allowed) {
      addConsoleEntry({ type: 'warning', message: capability.message ?? 'Pause unavailable', source: 'debugger' });
      return;
    }
    if (capability.message) {
      addConsoleEntry({ type: 'warning', message: capability.message, source: 'debugger' });
    }
    await adapterRef.current.pause();
  }, [addConsoleEntry, debugCapabilities]);

  const resume = useCallback(async () => {
    if (!adapterRef.current) return;
    const capability = getDebugFeatureActionability(debugCapabilities, 'resume', 'Resume');
    if (!capability.allowed) {
      addConsoleEntry({ type: 'warning', message: capability.message ?? 'Resume unavailable', source: 'debugger' });
      return;
    }
    if (capability.message) {
      addConsoleEntry({ type: 'warning', message: capability.message, source: 'debugger' });
    }
    await adapterRef.current.resume();
  }, [addConsoleEntry, debugCapabilities]);

  const step = useCallback(async () => {
    if (!adapterRef.current) return;
    const capability = getDebugFeatureActionability(debugCapabilities, 'step', 'Step');
    if (!capability.allowed) {
      addConsoleEntry({ type: 'warning', message: capability.message ?? 'Step unavailable', source: 'debugger' });
      return;
    }
    if (capability.message) {
      addConsoleEntry({ type: 'warning', message: capability.message, source: 'debugger' });
    }
    await adapterRef.current.step();
  }, [addConsoleEntry, debugCapabilities]);

  const reset = useCallback(async () => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter) return;
    const currentCompilerRunId = useIDEStore.getState().compilerRunId;
    const reenableTrace = canReenableNativeTrace(
      traceCaptureEnabledRef.current,
      traceBoundCompilerRunIdRef.current,
      currentCompilerRunId,
    );
    invalidateNativeTrace();
    try {
      await currentAdapter.reset();
      clearLiveValues();
      setCurrentExecution(null, null, null);
      if (adapterRef.current === currentAdapter) {
        bindAdapterEventHandlers(currentAdapter, reenableTrace && useIDEStore.getState().compilerRunId === currentCompilerRunId);
      }
    } catch (err) {
      // If reset fails (e.g., connection lost), clear stale local state but
      // keep the failure observable to the caller.
      console.warn('[DebugController] reset failed:', err);
      clearLiveValues();
      setCurrentExecution(null, null, null);
      throw err;
    }
  }, [bindAdapterEventHandlers, clearLiveValues, invalidateNativeTrace, setCurrentExecution]);

  // =========================================================================
  // Memory Access
  // =========================================================================

  const setValue = useCallback(
    async (
      address: number,
      value: number | boolean | string,
      type: WatchVariable['type'],
      maxLength?: number
    ) => {
      const currentAdapter = adapterRef.current;
      if (!currentAdapter) return;
      if (currentAdapter.type === 'serial') {
        throw new Error('Direct value edits are simulation-only. Use Force for hardware.');
      }
      if (forcesUnconfirmed) {
        throw new Error('Force state unconfirmed. Reconnect and verify before operating.');
      }
      const bytes = valueToBytes(value, type, maxLength);
      await currentAdapter.setValue(address, bytes);
    },
    [forcesUnconfirmed]
  );

  const buildForceEntry = useCallback((
    path: string,
    address: number,
    type: WatchVariable['type'],
    bytes: Uint8Array,
    maxLength: number | undefined,
    state: WatchForceState,
  ): WatchForceEntry => ({
    path,
    address,
    size: bytes.length,
    type,
    bytesHex: bytesToHex(bytes),
    maxLength,
    state,
  }), []);

  const toggleForceValue = useCallback(
    async (
      path: string,
      address: number,
      value: number | boolean | string,
      type: WatchVariable['type'],
      force: boolean,
      maxLength?: number,
    ) => {
      if (forcesUnconfirmed) {
        throw new Error('Force state unconfirmed. Reconnect and verify before operating.');
      }
      const currentAdapter = adapterRef.current;
      if (!currentAdapter) return;

      try {
        if (force) {
          const bytes = valueToBytes(value, type, maxLength);
          await currentAdapter.forceValue(address, bytes);
          setForcedValue(buildForceEntry(path, address, type, bytes, maxLength, WATCH_FORCE_STATE.FORCED));
          return;
        }

        await currentAdapter.clearForcedValue(address);
        clearForcedValue(path);
      } catch (error) {
        if (shouldMarkForceCommandFailureUnconfirmed(adapterRef.current, currentAdapter)) {
          markForcedValuesUnconfirmed();
        }
        throw error;
      }
    },
    [buildForceEntry, clearForcedValue, forcesUnconfirmed, markForcedValuesUnconfirmed, setForcedValue],
  );

  const clearAllForcedValues = useCallback(async () => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter) return;
    const isHardware = currentAdapter.type === 'serial';
    try {
      await currentAdapter.clearAllForcedValues();
      if (isHardware && isCurrentSerialAdapter(adapterRef.current, currentAdapter) && currentAdapter.connected) {
        clearForcedValues();
      } else if (!useIDEStore.getState().debug.forcesUnconfirmed) {
        clearForcedValues();
      }
    } catch (error) {
      if (isHardware && isCurrentSerialAdapter(adapterRef.current, currentAdapter)) {
        markForcedValuesUnconfirmed();
      }
      throw error;
    }
  }, [clearForcedValues, markForcedValuesUnconfirmed]);

  useEffect(() => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter || currentAdapter.type !== 'serial') {
      return;
    }
    let cancelled = false;

    void currentAdapter.listForcedValues()
      .then((entries) => {
        if (cancelled || !isCurrentSerialAdapter(adapterRef.current, currentAdapter) || !currentAdapter.connected) {
          return;
        }
        clearForcedValues();

        for (const entry of entries) {
          const matchedPath = watchVariables.find((watchPath) => watchPath === entry.path)
            ?? watchVariables.find((watchPath) => {
              if (!debugMap) {
                return false;
              }
              const found = findVariable(debugMap, watchPath);
              return found?.absoluteAddr === entry.address;
            });

          setForcedValue({
            ...entry,
            path: matchedPath ?? entry.path,
          });
        }
      })
      .catch((err) => {
        if (cancelled || !isCurrentSerialAdapter(adapterRef.current, currentAdapter)) {
          return;
        }
        console.warn('[DebugController] failed to refresh forced values:', err);
        markForcedValuesUnconfirmed();
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, clearForcedValues, debugMap, markForcedValuesUnconfirmed, setForcedValue, watchVariables]);

  const setVirtualInput = useCallback(async (channel: number, value: number) => {
    if (!adapterRef.current) return;
    await adapterRef.current.setVirtualInput(channel, value);
  }, []);

  const getVirtualOutput = useCallback(async (channel: number) => {
    if (!adapterRef.current) return 0;
    return await adapterRef.current.getVirtualOutput(channel);
  }, []);

  const setSimulationInput = useCallback(async (
    inputId: 'motor.start' | 'motor.stop' | 'motor.estop',
    active: boolean,
  ) => {
    const owner = adapterRef.current;
    if (!(owner instanceof NativeAdapter) || !owner.connected || !owner.supportsSimulationInput) {
      throw new Error('Native simulation input controls are unavailable');
    }

    await owner.setSimulationInput(inputId, active);
    if (adapterRef.current !== owner || !owner.connected || !owner.supportsSimulationInput) {
      throw new Error('Native simulation input controls changed before confirmation');
    }

    await owner.getRuntimeSnapshot();
    if (adapterRef.current !== owner || !owner.connected || !owner.supportsSimulationInput) {
      throw new Error('Native simulation input confirmation is no longer current');
    }
  }, []);

  // =========================================================================
  // Polling for Live Values
  // =========================================================================

  useEffect(() => {
    // Poll whenever connected and running/paused.
    // Explicit watch-table variables are always polled.
    // Extra debug-map variables for inline editor preview are only added when
    // the Live button is enabled in hardware mode.
    const shouldPoll =
      adapter?.connected &&
      (vmState === 'running' || vmState === 'paused');

    if (shouldPoll) {
      // Always clear any existing interval before (re-)starting.
      // This ensures that when `debugMap` arrives late via a store update the
      // effect re-runs and the new closure captures the up-to-date debugMap
      // instead of keeping the stale null-closure that was registered first.
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setPolling(true);

      let isPollingWatch = false;
      pollingIntervalRef.current = setInterval(async () => {
        if (!adapterRef.current?.connected) return;
        if (isPollingWatch) return;

        try {
          isPollingWatch = true;
          // Build the set of variable paths to poll.
          // 1. Explicit watch-table variables are always included.
          // 2. Inline editor preview variables are added only when the Live
          //    button is enabled.
          const pathSet = new Set<string>(
            buildPolledDebugPaths(watchVariables, debugMap, mpeekEnabled, 64),
          );

          const variables = Array.from(pathSet)
            .map((varPath) => describePolledDebugVariable(debugMap, varPath))
            .filter((v): v is NonNullable<ReturnType<typeof describePolledDebugVariable>> => v !== null);

          if (variables.length === 0) {
            debugLog('[useDebugController] No variables to poll');
            return;
          }

          debugLog(`[useDebugController] Polling ${variables.length} variables. mpeekEnabled: ${mpeekEnabled}`);

          const results = await adapterRef.current.readWatchVariables(variables, { useMpeek: mpeekEnabled });

          const newValues = new Map<string, LiveValue>();
          for (const result of results) {
            if (result.value !== undefined) {
              newValues.set(result.name, result.value);
            }
          }

          if (newValues.size > 0) {
            debugLog(`[useDebugController] Updating live values with ${newValues.size} items`, Array.from(newValues.entries()));
            updateLiveValues(newValues);
          } else {
            debugLog(`[useDebugController] readWatchVariables returned 0 new values! results:`, results);
          }
        } catch (err) {
          console.error('Polling error:', err);
        } finally {
          isPollingWatch = false;
        }
      }, pollingInterval);
    } else if (!shouldPoll && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      setPolling(false);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [
    adapter,
    vmState,
    watchVariables,
    pollingInterval,
    debugMap,
    mpeekEnabled,
    setPolling,
    updateLiveValues,
  ]);

  // =========================================================================
  // Sync Breakpoints to Adapter
  // =========================================================================

  useEffect(() => {
    let disposed = false;
    const syncBreakpoints = async () => {
      if (!adapter?.connected || !debugMap) return;

      try {
        const pcs = getAllBreakpointPCs();
        const capability = getDebugFeatureActionability(debugCapabilities, 'breakpoints', 'Breakpoint sync');

        if (!capability.allowed) {
          return;
        }

        debugLog('[Breakpoint] Syncing to adapter', {
          adapterType: adapter.type,
          breakpointFiles: Array.from(breakpointMap.entries()).map(([fileId, lines]) => ({
            fileId,
            lines: Array.from(lines),
          })),
          pcs,
        });

        // Clear existing and set new
        await adapter.clearBreakpoints();
        if (disposed || adapterRef.current !== adapter || !adapter.connected) return;
        for (const pc of pcs) {
          if (disposed || adapterRef.current !== adapter || !adapter.connected) return;
          debugLog('[Breakpoint] Setting hardware breakpoint', { pc });
          await adapter.setBreakpoint(pc);
        }
      } catch (err) {
        if (disposed || adapterRef.current !== adapter || !adapter.connected) return;
        console.error('Failed to sync breakpoints:', err);
      }
    };

    void syncBreakpoints();
    return () => { disposed = true; };
  }, [adapter, breakpointMap, debugCapabilities, debugMap, getAllBreakpointPCs]);

  // =========================================================================
  // Cleanup on Unmount
  // =========================================================================

  useEffect(() => {
    return () => {
      const currentAdapter = adapterRef.current;
      if (usesConnectionManager(currentAdapter)) {
        useIDEStore.getState().markForcedValuesUnconfirmed();
        void connectionManager.disconnect().catch(() => undefined);
      } else if (currentAdapter) {
        void currentAdapter.disconnect().catch(() => undefined);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // =========================================================================
  // Return Value
  // =========================================================================

  return {
    // State
    adapter,
    vmState,
    vmInfo,
    isPolling,
    lastError,
    debugCapabilities,
    // Actions
    startSimulation,
    connectHardware,
    disconnect,
    loadProgram,
    start,
    stop,
    pause,
    resume,
    step,
    reset,
    setValue,
    toggleForceValue,
    clearAllForcedValues,
    setVirtualInput,
    getVirtualOutput,
    setSimulationInput,
  };
}

export default useDebugController;
