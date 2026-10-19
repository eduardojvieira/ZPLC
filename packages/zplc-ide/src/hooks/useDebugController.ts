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

import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { monitoredKeys, subscribeMonitorKeys } from '../monitoring/registry';
import { useIDEStore } from '../store/useIDEStore';
import type { IDebugAdapter, VMState, VMInfo, DebugAdapterEvents } from '../runtime/debugAdapter';
import { connectSimulationAdapter } from '../runtime/simulationAdapterFactory';
import { NativeAdapter } from '../runtime/nativeAdapter';
import { connectionManager } from '../runtime/connectionManager';
import type { DebugMap } from '../compiler';
import { judgeDebugMapAttachment } from '../compiler';
import { reconcileElementBreakpoints } from '../editors/elementBreakpoints';
import type { UploadTraceEvent } from '../runtime/uploadTrace';
import {
  resolveExecutionLocation,
  type ResolvedExecutionLocation,
} from './debugExecutionLocation';
import { debugLog } from '../utils/debugLog';
import { createBreakpointSyncer, reportBreakpointSync, type BreakpointSyncOutcome } from './useDebugControllerBreakpoints';
import { deriveHardwareDebugState } from '../runtime/debugStatus';
import {
  type DebugCapabilities,
} from '../runtime/debugCapabilities';
import {
  getDebugCapabilitiesForAdapter,
  getDebugFeatureActionability,
} from './debugCapabilityActions';
import { isCurrentSerialAdapter, usesConnectionManager } from './forceReconciliation';
import {
  appendNativeTrace as appendNativeTraceSample,
  canCaptureNativeTrace,
  canCommitNativeLoad,
  canReenableNativeTrace,
} from '../runtime/nativeTrace';

/**
 * Where the VM stopped at a breakpoint, and the Console entry that says so. The adapters report the pc only
 * (onBreakpointHit(pc)), so the line is the one the debug map gives for the pc, the same line the editor highlights.
 * The prefix "Breakpoint hit at PC=0x" is matched by the real-app journeys.
 */
export function describeBreakpointHit(debugMap: DebugMap | null, pc: number, line?: number): { resolved: ResolvedExecutionLocation; message: string } {
  const resolved = resolveExecutionLocation(debugMap, pc, line);
  return {
    resolved,
    message: `Breakpoint hit at PC=0x${pc.toString(16).toUpperCase()}${resolved.line ? `, line ${resolved.line}` : ''}`,
  };
}

// =============================================================================
// Types
// =============================================================================

export type { DebugControllerActions, DebugControllerState, DebugController } from './debugControllerTypes';
import type { DebugController } from './debugControllerTypes';
import { useDeviceLogQueue } from './useDeviceLogQueue';
import { useDebugControllerPolling } from './useDebugControllerPolling';
import { useDebugControllerForces } from './useDebugControllerForces';

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
  const traceEpochRef = useRef(0);
  const traceCaptureEnabledRef = useRef(true);
  const traceBoundCompilerRunIdRef = useRef<number | null>(null);
  // Every push of breakpoints to the runtime (load, sync effect, reset) goes through this one syncer.
  const [breakpointSyncer] = useState(createBreakpointSyncer);

  // Store selectors
  const debugMode = useIDEStore((state) => state.debug.mode);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const watchVariables = useIDEStore((state) => state.debug.watchVariables);
  const breakpointMap = useIDEStore((state) => state.debug.breakpoints);
  const pollingInterval = useIDEStore((state) => state.debug.pollingInterval);
  const isPolling = useIDEStore((state) => state.debug.isPolling);
  const mpeekEnabled = useIDEStore((state) => state.debug.mpeekEnabled);
  // the variables the open diagrams show (LNG-006): the poll restarts when they change
  const monitored = useSyncExternalStore(subscribeMonitorKeys, monitoredKeys);
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
  const setBreakpointsInactiveReason = useIDEStore((state) => state.setBreakpointsInactiveReason);
  const getAllBreakpointPCs = useIDEStore((state) => state.getAllBreakpointPCs);
  const addConsoleEntry = useIDEStore((state) => state.addConsoleEntry);
  const addConsoleEntries = useIDEStore((state) => state.addConsoleEntries);
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

  const { enqueueDeviceLog, flushDeviceLogs } = useDeviceLogQueue(addConsoleEntries);

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
      const { resolved, message } = describeBreakpointHit(debugMap, pc, line);
      debugLog('[Execution] Breakpoint hit resolved', {
        pc,
        requestedLine: line ?? null,
        resolved,
      });
      setCurrentExecution(resolved.pouName, resolved.line, resolved.pc);

      addConsoleEntry({
        type: 'info',
        message,
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

  const pushBreakpoints = useCallback(async (target: IDebugAdapter): Promise<BreakpointSyncOutcome | null> => {
    try {
      const outcome = await breakpointSyncer.sync(
        target,
        () => useIDEStore.getState().getAllBreakpointPCs(),
        () => adapterRef.current === target && target.connected,
      );
      reportBreakpointSync(outcome, { addConsoleEntry, setBreakpointsInactiveReason });
      return outcome;
    } catch (err) {
      console.error('Failed to sync breakpoints:', err);
      return null;
    }
  }, [addConsoleEntry, breakpointSyncer, setBreakpointsInactiveReason]);

  const resetConnectionState = useCallback(() => {
    breakpointSyncer.invalidate();
    setBreakpointsInactiveReason(null);
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
  }, [breakpointSyncer, clearLiveValues, invalidateNativeTrace, setBreakpointsInactiveReason, setCurrentExecution, setDebugMode, setPolling]);

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
      const simulationAdapter = await connectSimulationAdapter({ directory: useIDEStore.getState().directoryHandle, report: addConsoleEntry });

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
  }, [addConsoleEntry, bindAdapterEventHandlers, disconnect, invalidateNativeTrace, resetConnectionState, setDebugMode]);

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
    // a debug map of another build must not be attached to this program (CMP-056)
    if (newDebugMap) {
      const attachment = judgeDebugMapAttachment(newDebugMap, bytecode);
      if (attachment.action === 'refuse') {
        throw new Error(attachment.message);
      }
      if (attachment.action === 'warn') {
        addConsoleEntry({ type: 'warning', message: attachment.message ?? 'The debug map cannot be tied to the program', source: 'debugger' });
      }
    }
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

      // program.load (and a hardware deploy) emptied the runtime's breakpoint table.
      breakpointSyncer.invalidate();

      const ownerIsCurrent = adapterRef.current === currentAdapter;
      if (!canCommitNativeLoad(ownerIsCurrent, loadedCompilerRunId, useIDEStore.getState().compilerRunId)) {
        throw new Error('Program load became stale; compile again before running.');
      }

      if (newDebugMap) {
        setDebugMap(newDebugMap);
      }

      bindAdapterEventHandlers(currentAdapter, true);

      // Sync breakpoints to adapter (skip for hardware if not supported). The sync effect reacts to the
      // debug map stored above; the syncer makes it wait for this round instead of racing it.
      let breakpointsSet = 0;
      if (getAllBreakpointPCs().length > 0) {
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

          const outcome = await pushBreakpoints(currentAdapter);
          breakpointsSet = outcome && !outcome.error ? outcome.pcs.length : 0;
        }
      }

      addConsoleEntry({
        type: 'success',
        message: isHardware
          ? `Program deployed and stopped: ${bytecode.length} bytes, ${breakpointsSet} breakpoints set`
          : `Loaded ${bytecode.length} bytes, ${breakpointsSet} breakpoints set`,
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
  }, [bindAdapterEventHandlers, breakpointSyncer, invalidateNativeTrace, debugCapabilities, debugMode, setDebugMap, getAllBreakpointPCs, addConsoleEntry, logUploadTrace, pushBreakpoints]);

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
      // execution.reset emptied the runtime's breakpoint table but the editor keeps its dots: send them again.
      breakpointSyncer.invalidate();
      if (getDebugFeatureActionability(debugCapabilities, 'breakpoints', 'Breakpoint sync').allowed) {
        await pushBreakpoints(currentAdapter);
      }
    } catch (err) {
      // If reset fails (e.g., connection lost), clear stale local state but
      // keep the failure observable to the caller.
      console.warn('[DebugController] reset failed:', err);
      clearLiveValues();
      setCurrentExecution(null, null, null);
      throw err;
    }
  }, [bindAdapterEventHandlers, breakpointSyncer, clearLiveValues, debugCapabilities, invalidateNativeTrace, pushBreakpoints, setCurrentExecution]);

  // =========================================================================
  // Memory Access
  // =========================================================================

  const { setValue, toggleForceValue, clearAllForcedValues } = useDebugControllerForces({ adapter, adapterRef, forcesUnconfirmed, watchVariables, debugMap });

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

  useDebugControllerPolling({ adapter, adapterRef, vmState, watchVariables, pollingInterval, debugMap, mpeekEnabled, monitored, pollingIntervalRef });

  // =========================================================================
  // Breakpoints on the elements of a diagram
  // =========================================================================

  // A build moves the generated lines that the rungs, blocks and steps stand on: the lines of their breakpoints are worked out
  // again from the new debug map, and the sync below arms them (LNG-004).
  useEffect(() => {
    reconcileElementBreakpoints();
  }, [debugMap]);

  // =========================================================================
  // Sync Breakpoints to Adapter
  // =========================================================================

  useEffect(() => {
    if (!adapter?.connected || !debugMap) return;
    if (!getDebugFeatureActionability(debugCapabilities, 'breakpoints', 'Breakpoint sync').allowed) return;

    debugLog('[Breakpoint] Syncing to adapter', {
      adapterType: adapter.type,
      breakpointFiles: Array.from(breakpointMap.entries()).map(([fileId, lines]) => ({
        fileId,
        lines: Array.from(lines),
      })),
    });
    void pushBreakpoints(adapter);
  }, [adapter, breakpointMap, debugCapabilities, debugMap, pushBreakpoints]);

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
    getHardwareSystemInfo: () => connectionManager.systemInfo,
  };
}

export default useDebugController;

