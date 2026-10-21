/**
 * The debug actions of the IDE store: debug mode, breakpoints, watch variables, live values, forces and the native trace (IDE-014: split
 * out of useIDEStore.ts).
 */

import { type StateCreator } from 'zustand';
import { WATCH_FORCE_STATE } from '../runtime/debugAdapter';
import { breakpointFileKey, getBreakpointPCForLine } from '../utils/breakpoints';
import { withLiveValues } from './liveValues';
import { NATIVE_TRACE_LIMIT } from '../runtime/nativeTrace';
import type { IDEState } from './ideStoreTypes';

export const createDebugActions: StateCreator<
  IDEState,
  [],
  [],
  Pick<
    IDEState,
    | 'setDebugMode'
    | 'setDebugMap'
    | 'toggleBreakpoint'
    | 'setBreakpoints'
    | 'setBreakpointsInactiveReason'
    | 'clearBreakpoints'
    | 'setCurrentExecution'
    | 'addWatchVariable'
    | 'removeWatchVariable'
    | 'clearWatchVariables'
    | 'updateLiveValue'
    | 'updateLiveValues'
    | 'clearLiveValues'
    | 'setForcedValue'
    | 'clearForcedValue'
    | 'markForcedValuesUnconfirmed'
    | 'clearForcedValues'
    | 'appendNativeTrace'
    | 'clearNativeTrace'
    | 'setPolling'
    | 'setPollingInterval'
    | 'toggleMpeek'
    | 'getBreakpointsForFile'
    | 'getAllBreakpointPCs'
  >
> = (set, get) => ({
  // ==========================================================================
  // Debug Actions
  // ==========================================================================

  setDebugMode: (mode) =>
    set((state) => ({
      debug: { ...state.debug, mode },
    })),

  setDebugMap: (debugMap) =>
    set((state) => ({
      debug: { ...state.debug, debugMap },
    })),

  toggleBreakpoint: (fileId, line) =>
    set((state) => {
      const newBreakpoints = new Map(state.debug.breakpoints);
      const fileBreakpoints = new Set(newBreakpoints.get(fileId) || []);

      if (fileBreakpoints.has(line)) {
        fileBreakpoints.delete(line);
      } else {
        fileBreakpoints.add(line);
      }

      if (fileBreakpoints.size === 0) {
        newBreakpoints.delete(fileId);
      } else {
        newBreakpoints.set(fileId, fileBreakpoints);
      }

      return {
        debug: { ...state.debug, breakpoints: newBreakpoints },
      };
    }),

  setBreakpoints: (fileId, lines) =>
    set((state) => {
      const newBreakpoints = new Map(state.debug.breakpoints);
      if (lines.length === 0) {
        newBreakpoints.delete(fileId);
      } else {
        newBreakpoints.set(fileId, new Set(lines));
      }
      return {
        debug: { ...state.debug, breakpoints: newBreakpoints },
      };
    }),

  setBreakpointsInactiveReason: (reason) =>
    set((state) =>
      state.debug.breakpointsInactiveReason === reason ? state : { debug: { ...state.debug, breakpointsInactiveReason: reason } },
    ),

  clearBreakpoints: (fileId) =>
    set((state) => {
      if (fileId) {
        const newBreakpoints = new Map(state.debug.breakpoints);
        newBreakpoints.delete(fileId);
        return {
          debug: { ...state.debug, breakpoints: newBreakpoints },
        };
      }
      // Clear all breakpoints
      return {
        debug: { ...state.debug, breakpoints: new Map() },
      };
    }),

  setCurrentExecution: (pou, line, pc) =>
    set((state) => ({
      debug: {
        ...state.debug,
        currentPOU: pou,
        currentLine: line,
        currentPC: pc,
      },
    })),

  addWatchVariable: (varPath) =>
    set((state) => {
      if (state.debug.watchVariables.includes(varPath)) {
        return state; // Already watching
      }
      return {
        debug: {
          ...state.debug,
          watchVariables: [...state.debug.watchVariables, varPath],
        },
      };
    }),

  removeWatchVariable: (varPath) =>
    set((state) => {
      const newLiveValues = new Map(state.debug.liveValues);
      newLiveValues.delete(varPath);
      return {
        debug: {
          ...state.debug,
          watchVariables: state.debug.watchVariables.filter((v) => v !== varPath),
          liveValues: newLiveValues,
        },
      };
    }),

  clearWatchVariables: () =>
    set((state) => ({
      debug: {
        ...state.debug,
        watchVariables: [],
        liveValues: new Map(),
      },
    })),

  updateLiveValue: (varPath, value) => set((state) => withLiveValues(state, [[varPath, value]])),

  updateLiveValues: (values) => set((state) => withLiveValues(state, values)),

  clearLiveValues: () =>
    set((state) => ({
      debug: { ...state.debug, liveValues: new Map() },
    })),

  setForcedValue: (entry) =>
    set((state) => {
      const forcedValues = new Map(state.debug.forcedValues);
      forcedValues.set(entry.path, entry);
      return {
        debug: { ...state.debug, forcedValues },
      };
    }),

  clearForcedValue: (varPath) =>
    set((state) => {
      const forcedValues = new Map(state.debug.forcedValues);
      forcedValues.delete(varPath);
      return {
        debug: { ...state.debug, forcedValues },
      };
    }),

  markForcedValuesUnconfirmed: () =>
    set((state) => {
      const forcedValues = new Map(
        Array.from(state.debug.forcedValues, ([path, entry]) => [path, { ...entry, state: WATCH_FORCE_STATE.UNCONFIRMED }]),
      );
      return {
        debug: { ...state.debug, forcedValues, forcesUnconfirmed: true },
      };
    }),

  clearForcedValues: () =>
    set((state) => ({
      debug: { ...state.debug, forcedValues: new Map(), forcesUnconfirmed: false },
    })),

  appendNativeTrace: (sample) =>
    set((state) => ({
      debug: { ...state.debug, nativeTrace: [...state.debug.nativeTrace, sample].slice(-NATIVE_TRACE_LIMIT) },
    })),

  clearNativeTrace: () =>
    set((state) => ({
      debug: { ...state.debug, nativeTrace: [] },
    })),

  setPolling: (isPolling) =>
    set((state) => ({
      debug: { ...state.debug, isPolling },
    })),

  setPollingInterval: (pollingInterval) =>
    set((state) => ({
      debug: { ...state.debug, pollingInterval },
    })),

  toggleMpeek: () =>
    set((state) => ({
      debug: { ...state.debug, mpeekEnabled: !state.debug.mpeekEnabled },
    })),

  getBreakpointsForFile: (fileId) => {
    const { debug } = get();
    return debug.breakpoints.get(fileId) || new Set();
  },

  getAllBreakpointPCs: () => {
    const { debug, loadedFiles } = get();
    const pcs: number[] = [];

    if (!debug.debugMap) return pcs;

    // For each file's breakpoints, look up the PC from the debug map.
    // fileId is NOT a plain filename — it is a sanitized path key like
    // "file-src-main-st". We must resolve the actual filename via loadedFiles
    // and then strip the extension to get the POU name used in the debug map.
    for (const [fileId, lineNumbers] of debug.breakpoints) {
      // Resolve the project-relative path (e.g. "src/main.st") from the store,
      // the same key the editor uses (breakpointFileKey). Fall back to the raw
      // fileId only if the file is not loaded (shouldn't happen in practice,
      // but keeps us safe).
      const rawName = breakpointFileKey(loadedFiles.get(fileId), fileId);

      for (const line of lineNumbers) {
        const pc = getBreakpointPCForLine(debug.debugMap, rawName, line);
        if (pc !== null) {
          pcs.push(pc);
        }
      }
    }

    return pcs;
  },
});
