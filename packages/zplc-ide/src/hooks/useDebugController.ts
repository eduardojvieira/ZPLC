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

import { useState, useEffect, useCallback, useRef } from 'react';
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
  /** Start simulation mode with WASM adapter */
  startSimulation: () => Promise<void>;
  /** Connect to hardware via WebSerial */
  connectHardware: () => Promise<void>;
  /** Disconnect from current adapter */
  disconnect: () => Promise<void>;
  /** Load bytecode into the adapter */
  loadProgram: (bytecode: Uint8Array, debugMap?: DebugMap) => Promise<void>;
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
  const [debugCapabilities, setDebugCapabilities] = useState<DebugCapabilities | null>(null);

  // Refs for polling
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const adapterRef = useRef<IDebugAdapter | null>(null);
  const deviceLogQueueRef = useRef<string[]>([]);
  const deviceLogFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store selectors
  const debugMode = useIDEStore((state) => state.debug.mode);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const watchVariables = useIDEStore((state) => state.debug.watchVariables);
  const breakpointMap = useIDEStore((state) => state.debug.breakpoints);
  const pollingInterval = useIDEStore((state) => state.debug.pollingInterval);
  const isPolling = useIDEStore((state) => state.debug.isPolling);
  const mpeekEnabled = useIDEStore((state) => state.debug.mpeekEnabled);
  const projectConfig = useIDEStore((state) => state.projectConfig);
  const setControllerStatus = useIDEStore((state) => state.setControllerStatus);
  const controllerInfo = useIDEStore((state) => state.controllerInfo);

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

  // Keep adapter ref in sync
  adapterRef.current = adapter;

  useEffect(() => {
    setDebugCapabilities(getDebugCapabilitiesForAdapter(adapter, debugMode, controllerInfo));
  }, [adapter, controllerInfo, debugMode]);


  // =========================================================================
  // Event Handlers
  // =========================================================================

  const createEventHandlers = useCallback((): DebugAdapterEvents => ({
    onStateChange: (state: VMState) => {
      setVmState(state);
    },
    onInfoUpdate: (info: VMInfo) => {
      setVmInfo(info);
    },
    onError: (message: string) => {
      setLastError(message);
      addConsoleEntry({
        type: 'error',
        message: `Debug error: ${message}`,
        source: 'debugger',
      });
    },
    onBreakpointHit: (pc: number, line?: number) => {
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
      const resolved = resolveExecutionLocation(debugMap, pc);
      debugLog('[Execution] Step complete resolved', { pc, resolved });
      setCurrentExecution(resolved.pouName, resolved.line, resolved.pc);
    },
    onGpioChange: (_channel: number, value: number) => {
      // Update OPI-based watch variables
      // The GPIO values are at OPI base addresses
      updateLiveValues(new Map([[`GPIO_OUT`, value]]));
    },
    onSerialData: (line: string) => {
      enqueueDeviceLog(line);
    },
  }), [debugMap, enqueueDeviceLog, setCurrentExecution, addConsoleEntry, updateLiveValues]);

  useEffect(() => {
    if (!adapter) {
      return;
    }

    adapter.setEventHandlers(createEventHandlers());
    debugLog('[Execution] Refreshed adapter event handlers', {
      adapterType: adapter.type,
      hasDebugMap: Boolean(debugMap),
      debugPouKeys: debugMap ? Object.keys(debugMap.pou) : [],
    });
  }, [adapter, createEventHandlers, debugMap]);

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

  const startSimulation = useCallback(async () => {
    try {
      // Disconnect existing adapter
      if (adapterRef.current) {
        await adapterRef.current.disconnect();
      }

      const simulationAdapter = createSimulationAdapter();
      simulationAdapter.setEventHandlers(createEventHandlers());

      await simulationAdapter.connect();

      setAdapter(simulationAdapter);
      setVmState('idle');
      setLastError(null);
      setDebugCapabilities(getDebugCapabilitiesForAdapter(simulationAdapter, 'simulation', controllerInfo));
      setDebugMode('simulation');

      addConsoleEntry({
        type: 'success',
        message: `${simulationAdapter.type === 'native' ? 'Native' : 'WASM'} simulation connected`,
        source: 'debugger',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setLastError(message);
      addConsoleEntry({
        type: 'error',
        message: `Failed to start simulation: ${message}`,
        source: 'debugger',
      });
    }
  }, [createEventHandlers, setDebugMode, addConsoleEntry]);

  const connectHardware = useCallback(async () => {
    try {
      // Disconnect existing adapter
      if (adapterRef.current) {
        await adapterRef.current.disconnect();
      }

      // Use the global connectionManager for hardware connections
      // This ensures ControllerView, Terminal, and DebugController share the same connection
      await connectionManager.connect();
      
      const serialAdapter = connectionManager.serialAdapter;
      if (!serialAdapter) {
        throw new Error('Failed to get serial adapter from connection manager');
      }
      
      // Register event handlers BEFORE reading the current state so that any
      // future state transitions (running → paused, etc.) are captured.
      serialAdapter.setEventHandlers(createEventHandlers());

      // The adapter may have already determined the VM state during connect()
      // (e.g., 'running' if cycles > 0 on the device). Sync that state now
      // instead of forcing 'idle', which would prevent the polling loop from
      // starting when the device is already executing a program.
      const initialState = serialAdapter.state;

      setAdapter(serialAdapter);
      setVmState(initialState);
      setLastError(null);
      setDebugCapabilities(getDebugCapabilitiesForAdapter(serialAdapter, 'hardware', controllerInfo));
      setDebugMode('hardware');

      addConsoleEntry({
        type: 'success',
        message: 'Hardware connected via WebSerial',
        source: 'debugger',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setLastError(message);
      addConsoleEntry({
        type: 'error',
        message: `Failed to connect hardware: ${message}`,
        source: 'debugger',
      });
    }
  }, [createEventHandlers, setDebugMode, addConsoleEntry]);

  const disconnect = useCallback(async () => {
    try {
      if (adapterRef.current) {
        try {
          await adapterRef.current.clearAllForcedValues();
          clearForcedValues();
        } catch (forceErr) {
          console.warn('[DebugController] failed to clear forced values during disconnect:', forceErr);
        }
      }

      // For hardware mode, use connectionManager to disconnect
      // For simulation, disconnect the WASM adapter directly
      if (debugMode === 'hardware') {
        await connectionManager.disconnect();
      } else if (adapterRef.current) {
        await adapterRef.current.disconnect();
      }

      addConsoleEntry({
        type: 'info',
        message: 'Debug session disconnected',
        source: 'debugger',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[DebugController] disconnect error:', err);
      setLastError(message);
      // Still show disconnect message even if there was an error
      addConsoleEntry({
        type: 'warning',
        message: `Disconnected with error: ${message}`,
        source: 'debugger',
      });
    } finally {
      // Always clean up state, even if disconnect threw an error
      setAdapter(null);
      setVmState('disconnected');
      setVmInfo(null);
      setDebugCapabilities(null);
      clearLiveValues();
      clearForcedValues();
      setPolling(false);
      setCurrentExecution(null, null, null);
      setDebugMode('none');
    }
  }, [debugMode, clearForcedValues, clearLiveValues, setPolling, setCurrentExecution, setDebugMode, addConsoleEntry]);

  // =========================================================================
  // Program Loading
  // =========================================================================

  const loadProgram = useCallback(async (bytecode: Uint8Array, newDebugMap?: DebugMap) => {
    if (!adapterRef.current) {
      throw new Error('No adapter connected');
    }

    // For hardware mode, pause polling during entire load operation
    // (upload + breakpoint sync) to avoid serial conflicts
    const isHardware = debugMode === 'hardware';
    if (isHardware) {
      connectionManager.pausePolling();
    }

    try {
      // Upload bytecode
      if (isHardware) {
        if (projectConfig) {
          addConsoleEntry({
            type: 'info',
            message: 'Applying project configuration...',
            source: 'debugger',
          });
          await connectionManager.provisionProjectConfig(projectConfig, logUploadTrace);
        }
        await connectionManager.uploadBytecode(bytecode, { trace: logUploadTrace });

        // Trigger network bring-up in the background AFTER the program is
        // loaded. This is intentionally fire-and-forget: a WiFi connect
        // timeout must never block or fail the upload.
        if (projectConfig) {
          connectionManager.triggerNetworkBringUp(projectConfig).catch((e) => {
            console.warn('[useDebugController] network bring-up error (non-fatal):', e);
          });
        }
      } else {
        await adapterRef.current.loadProgram(bytecode);
      }

      if (newDebugMap) {
        setDebugMap(newDebugMap);
      }

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

            await adapterRef.current.clearBreakpoints();
            for (const pc of breakpointPCs) {
              await adapterRef.current.setBreakpoint(pc);
            }
          }
        } catch (e) {
          // Breakpoints may not be supported on hardware, log but don't fail
          console.warn('Breakpoint sync failed:', e);
        }
      }

      addConsoleEntry({
        type: 'success',
        message: `Loaded ${bytecode.length} bytes, ${breakpointPCs.length} breakpoints set`,
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
  }, [debugCapabilities, debugMode, projectConfig, setDebugMap, getAllBreakpointPCs, addConsoleEntry, logUploadTrace]);

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
    if (!adapterRef.current) return;
    try {
      await adapterRef.current.reset();
      clearLiveValues();
      setCurrentExecution(null, null, null);
    } catch (err) {
      // If reset fails (e.g., connection lost), just clear local state
      console.warn('[DebugController] reset failed:', err);
      clearLiveValues();
      setCurrentExecution(null, null, null);
    }
  }, [clearLiveValues, setCurrentExecution]);

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
      if (!adapterRef.current) return;
      const bytes = valueToBytes(value, type, maxLength);
      await adapterRef.current.setValue(address, bytes);
    },
    []
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
      if (!adapterRef.current) return;

      if (force) {
        const bytes = valueToBytes(value, type, maxLength);
        await adapterRef.current.forceValue(address, bytes);
        setForcedValue(buildForceEntry(path, address, type, bytes, maxLength, WATCH_FORCE_STATE.FORCED));
        return;
      }

      await adapterRef.current.clearForcedValue(address);
      clearForcedValue(path);
    },
    [buildForceEntry, clearForcedValue, setForcedValue],
  );

  const clearAllForcedValues = useCallback(async () => {
    if (!adapterRef.current) return;
    await adapterRef.current.clearAllForcedValues();
    clearForcedValues();
  }, [clearForcedValues]);

  useEffect(() => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter || debugMode === 'none') {
      return;
    }

    void currentAdapter.listForcedValues()
      .then((entries) => {
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
        console.warn('[DebugController] failed to refresh forced values:', err);
      });
  }, [adapter, clearForcedValues, debugMap, debugMode, setForcedValue, watchVariables]);

  const setVirtualInput = useCallback(async (channel: number, value: number) => {
    if (!adapterRef.current) return;
    await adapterRef.current.setVirtualInput(channel, value);
  }, []);

  const getVirtualOutput = useCallback(async (channel: number) => {
    if (!adapterRef.current) return 0;
    return await adapterRef.current.getVirtualOutput(channel);
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
        for (const pc of pcs) {
          debugLog('[Breakpoint] Setting hardware breakpoint', { pc });
          await adapter.setBreakpoint(pc);
        }
      } catch (err) {
        console.error('Failed to sync breakpoints:', err);
      }
    };

    syncBreakpoints();
  }, [adapter, breakpointMap, debugCapabilities, debugMap, getAllBreakpointPCs]);

  // =========================================================================
  // Cleanup on Mode Change
  // =========================================================================

  useEffect(() => {
    if (debugMode === 'none' && adapter) {
      disconnect();
    }
  }, [debugMode, adapter, disconnect]);

  // =========================================================================
  // Cleanup on Unmount
  // =========================================================================

  useEffect(() => {
    return () => {
      if (adapterRef.current) {
        adapterRef.current.disconnect().catch(console.error);
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
  };
}

export default useDebugController;
