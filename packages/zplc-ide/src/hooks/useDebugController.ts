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
} from '../runtime/debugAdapter';
import { valueToBytes } from '../runtime/debugAdapter';
import { WASMAdapter } from '../runtime/wasmAdapter';
import { connectionManager } from '../runtime/connectionManager';
import type { DebugMap } from '../compiler';
import { findVariable } from '../compiler';
import type { UploadTraceEvent } from '../runtime/uploadTrace';
import {
  resolveExecutionLocation,
} from './debugExecutionLocation';

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
  forceValue: (
    address: number,
    value: number | boolean | string,
    type: WatchVariable['type'],
    maxLength?: number
  ) => Promise<void>;
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

  // Refs for polling
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const adapterRef = useRef<IDebugAdapter | null>(null);
  const deviceLogQueueRef = useRef<string[]>([]);
  const deviceLogFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store selectors
  const debugMode = useIDEStore((state) => state.debug.mode);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const watchVariables = useIDEStore((state) => state.debug.watchVariables);
  const pollingInterval = useIDEStore((state) => state.debug.pollingInterval);
  const isPolling = useIDEStore((state) => state.debug.isPolling);
  const mpeekEnabled = useIDEStore((state) => state.debug.mpeekEnabled);
  const projectConfig = useIDEStore((state) => state.projectConfig);

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
      setCurrentExecution(resolved.pouName, resolved.line, resolved.pc);

      addConsoleEntry({
        type: 'info',
        message: `Breakpoint hit at PC=0x${pc.toString(16).toUpperCase()}${line ? `, line ${line}` : ''}`,
        source: 'debugger',
      });
    },
    onStepComplete: (pc: number) => {
      const resolved = resolveExecutionLocation(debugMap, pc);
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

      const wasmAdapter = new WASMAdapter();
      wasmAdapter.setEventHandlers(createEventHandlers());

      await wasmAdapter.connect();

      setAdapter(wasmAdapter);
      setVmState('idle');
      setLastError(null);
      setDebugMode('simulation');

      addConsoleEntry({
        type: 'success',
        message: 'WASM simulation connected',
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
    console.log('[DebugController] disconnect called, debugMode:', debugMode);
    try {
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
      clearLiveValues();
      setPolling(false);
      setCurrentExecution(null, null, null);
      setDebugMode('none');
    }
  }, [debugMode, clearLiveValues, setPolling, setCurrentExecution, setDebugMode, addConsoleEntry]);

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
          await adapterRef.current.clearBreakpoints();
          for (const pc of breakpointPCs) {
            await adapterRef.current.setBreakpoint(pc);
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
  }, [debugMode, projectConfig, setDebugMap, getAllBreakpointPCs, addConsoleEntry, logUploadTrace]);

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
    await adapterRef.current.pause();
  }, []);

  const resume = useCallback(async () => {
    if (!adapterRef.current) return;
    await adapterRef.current.resume();
    setCurrentExecution(null, null, null);
  }, [setCurrentExecution]);

  const step = useCallback(async () => {
    if (!adapterRef.current) return;
    await adapterRef.current.step();
  }, []);

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

  const forceValue = useCallback(
    async (
      address: number,
      value: number | boolean | string,
      type: WatchVariable['type'],
      maxLength?: number
    ) => {
      if (!adapterRef.current) return;
      const bytes = valueToBytes(value, type, maxLength);
      await adapterRef.current.pokeN(address, bytes);
    },
    []
  );

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
    // Poll whenever connected and running/paused — even if no explicit watch
    // variables, because the inline editor overlay also reads from liveValues
    // and relies on debugMap vars being polled automatically.
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
          // Build the set of variable paths to poll:
          //   1. All explicitly added watch variables (shown in Watch panel)
          //   2. All top-level vars from every POU in the debugMap so that
          //      the inline editor overlay shows live values automatically
          //      without requiring the user to add each variable manually.
          //
          // Cap at 64 vars to keep serial traffic reasonable on hardware.
          const pathSet = new Set<string>(watchVariables);

          // Always add all debugMap variables so the inline editor overlay shows live values
          // regardless of the transport mode (peek vs mpeek).
          // mpeekEnabled only controls the serial command used — not which vars are polled.
          if (debugMap) {
            outer: for (const [, pouInfo] of Object.entries(debugMap.pou)) {
              for (const varName of Object.keys(pouInfo.vars)) {
                if (pathSet.size >= 64) break outer;
                pathSet.add(varName);
              }
            }
          }

          // Helper: map a varPath to a WatchVariable descriptor
          type WatchType = 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'BYTE' | 'WORD' | 'DWORD' | 'TIME' | 'STRING';
          const toDescriptor = (varPath: string): { name: string; address: number; type: WatchType; forceable: boolean; bitOffset?: number; maxLength?: number } | null => {
            if (debugMap) {
              const found = findVariable(debugMap, varPath);
              if (found) {
                const varInfo = found.varInfo;
                let mappedType: WatchType = 'DWORD';
                const t = varInfo.type.toUpperCase();
                if (t === 'BOOL') mappedType = 'BOOL';
                else if (t === 'INT' || t === 'SINT' || t === 'USINT' || t === 'UINT') mappedType = 'INT';
                else if (t === 'DINT' || t === 'UDINT' || t === 'LINT' || t === 'ULINT') mappedType = 'DINT';
                else if (t === 'REAL' || t === 'LREAL') mappedType = 'REAL';
                else if (t === 'BYTE') mappedType = 'BYTE';
                else if (t === 'WORD') mappedType = 'WORD';
                else if (t === 'DWORD' || t === 'LWORD') mappedType = 'DWORD';
                else if (t === 'TIME') mappedType = 'TIME';
                else if (t === 'STRING') mappedType = 'STRING';

                return {
                  name: varPath,
                  address: varInfo.addr,
                  type: mappedType,
                  forceable: varInfo.region === 'IPI',
                  bitOffset: varInfo.bitOffset,
                  maxLength: mappedType === 'STRING' && varInfo.size ? Math.max(0, varInfo.size - 3) : undefined,
                };
              }
            }
            return null;
          };

          const variables = Array.from(pathSet)
            .map(toDescriptor)
            .filter((v): v is NonNullable<ReturnType<typeof toDescriptor>> => v !== null && v.address !== 0);

          if (variables.length === 0) {
            console.log('[useDebugController] No variables to poll');
            return;
          }

          console.log(`[useDebugController] Polling ${variables.length} variables. mpeekEnabled: ${mpeekEnabled}`);

          const results = await adapterRef.current.readWatchVariables(variables, { useMpeek: mpeekEnabled });

          const newValues = new Map<string, LiveValue>();
          for (const result of results) {
            if (result.value !== undefined) {
              newValues.set(result.name, result.value);
            }
          }

          if (newValues.size > 0) {
            console.log(`[useDebugController] Updating live values with ${newValues.size} items`, Array.from(newValues.entries()));
            updateLiveValues(newValues);
          } else {
            console.log(`[useDebugController] readWatchVariables returned 0 new values! results:`, results);
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

        // Clear existing and set new
        await adapter.clearBreakpoints();
        for (const pc of pcs) {
          await adapter.setBreakpoint(pc);
        }
      } catch (err) {
        console.error('Failed to sync breakpoints:', err);
      }
    };

    syncBreakpoints();
  }, [adapter, debugMap, getAllBreakpointPCs]);

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
    forceValue,
    setVirtualInput,
    getVirtualOutput,
  };
}

export default useDebugController;
