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
import type { IDebugAdapter, VMState, VMInfo, DebugAdapterEvents } from '../runtime/debugAdapter';
import { WASMAdapter } from '../runtime/wasmAdapter';
import { SerialAdapter } from '../runtime/serialAdapter';
import type { DebugMap } from '../compiler/debug-map';

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
  forceValue: (address: number, value: number) => Promise<void>;
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

  // Store selectors
  const debugMode = useIDEStore((state) => state.debug.mode);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const watchVariables = useIDEStore((state) => state.debug.watchVariables);
  const pollingInterval = useIDEStore((state) => state.debug.pollingInterval);
  const isPolling = useIDEStore((state) => state.debug.isPolling);

  // Store actions
  const setDebugMode = useIDEStore((state) => state.setDebugMode);
  const setDebugMap = useIDEStore((state) => state.setDebugMap);
  const setCurrentExecution = useIDEStore((state) => state.setCurrentExecution);
  const updateLiveValues = useIDEStore((state) => state.updateLiveValues);
  const clearLiveValues = useIDEStore((state) => state.clearLiveValues);
  const setPolling = useIDEStore((state) => state.setPolling);
  const getAllBreakpointPCs = useIDEStore((state) => state.getAllBreakpointPCs);
  const addConsoleEntry = useIDEStore((state) => state.addConsoleEntry);

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
      // Find the source line from debug map
      if (debugMap) {
        let foundLine = line;
        let foundPOU: string | null = null;

        for (const [pouName, pouInfo] of Object.entries(debugMap.pou)) {
          const mapping = pouInfo.sourceMap.find((m) => m.pc === pc);
          if (mapping) {
            foundLine = mapping.line;
            foundPOU = pouName;
            break;
          }
        }

        setCurrentExecution(foundPOU, foundLine ?? null, pc);
      } else {
        setCurrentExecution(null, line ?? null, pc);
      }

      addConsoleEntry({
        type: 'info',
        message: `Breakpoint hit at PC=0x${pc.toString(16).toUpperCase()}${line ? `, line ${line}` : ''}`,
        source: 'debugger',
      });
    },
    onStepComplete: (pc: number) => {
      // Update current execution after step
      if (debugMap) {
        for (const [pouName, pouInfo] of Object.entries(debugMap.pou)) {
          const mapping = pouInfo.sourceMap.find((m) => m.pc === pc);
          if (mapping) {
            setCurrentExecution(pouName, mapping.line, pc);
            return;
          }
        }
      }
      setCurrentExecution(null, null, pc);
    },
    onGpioChange: (_channel: number, value: number) => {
      // Update OPI-based watch variables
      // The GPIO values are at OPI base addresses
      updateLiveValues(new Map([[`GPIO_OUT`, value]]));
    },
  }), [debugMap, setCurrentExecution, addConsoleEntry, updateLiveValues]);

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

      const serialAdapter = new SerialAdapter();
      serialAdapter.setEventHandlers(createEventHandlers());

      await serialAdapter.connect();

      setAdapter(serialAdapter);
      setVmState('idle');
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
    try {
      if (adapterRef.current) {
        await adapterRef.current.disconnect();
      }

      setAdapter(null);
      setVmState('disconnected');
      setVmInfo(null);
      clearLiveValues();
      setPolling(false);
      setCurrentExecution(null, null, null);
      setDebugMode('none');

      addConsoleEntry({
        type: 'info',
        message: 'Debug session disconnected',
        source: 'debugger',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setLastError(message);
    }
  }, [clearLiveValues, setPolling, setCurrentExecution, setDebugMode, addConsoleEntry]);

  // =========================================================================
  // Program Loading
  // =========================================================================

  const loadProgram = useCallback(async (bytecode: Uint8Array, newDebugMap?: DebugMap) => {
    if (!adapterRef.current) {
      throw new Error('No adapter connected');
    }

    await adapterRef.current.loadProgram(bytecode);

    if (newDebugMap) {
      setDebugMap(newDebugMap);
    }

    // Sync breakpoints to adapter
    const breakpointPCs = getAllBreakpointPCs();
    await adapterRef.current.clearBreakpoints();
    for (const pc of breakpointPCs) {
      await adapterRef.current.setBreakpoint(pc);
    }

    addConsoleEntry({
      type: 'success',
      message: `Loaded ${bytecode.length} bytes, ${breakpointPCs.length} breakpoints set`,
      source: 'debugger',
    });
  }, [setDebugMap, getAllBreakpointPCs, addConsoleEntry]);

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
    await adapterRef.current.reset();
    clearLiveValues();
    setCurrentExecution(null, null, null);
  }, [clearLiveValues, setCurrentExecution]);

  // =========================================================================
  // Memory Access
  // =========================================================================

  const forceValue = useCallback(async (address: number, value: number) => {
    if (!adapterRef.current) return;
    await adapterRef.current.poke(address, value);
  }, []);

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
    // Only poll when running or paused and we have watch variables
    const shouldPoll =
      adapter?.connected &&
      (vmState === 'running' || vmState === 'paused') &&
      watchVariables.length > 0;

    if (shouldPoll && !pollingIntervalRef.current) {
      setPolling(true);

      pollingIntervalRef.current = setInterval(async () => {
        if (!adapterRef.current?.connected) return;

        try {
          // Build watch variable descriptors from debug map
          const variables = watchVariables.map((varPath) => {
            // Look up variable in debug map
            if (debugMap) {
              // Check POU variables (all variables are in POUs)
              for (const [_pouName, pouInfo] of Object.entries(debugMap.pou)) {
                const varInfo = pouInfo.vars[varPath];
                if (varInfo) {
                  // Map debug types to WatchVariable types
                  type WatchType = 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'BYTE' | 'WORD' | 'DWORD' | 'TIME' | 'STRING';
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
                  };
                }
              }
            }

            // Fallback: assume it's a direct memory address
            return {
              name: varPath,
              address: 0,
              type: 'DWORD' as const,
              forceable: false,
            };
          }).filter((v) => v.address !== 0);

          if (variables.length === 0) return;

          const results = await adapterRef.current.readWatchVariables(variables);

          const newValues = new Map<string, LiveValue>();
          for (const result of results) {
            if (result.value !== undefined) {
              newValues.set(result.name, result.value);
            }
          }

          if (newValues.size > 0) {
            updateLiveValues(newValues);
          }
        } catch (err) {
          console.error('Polling error:', err);
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
