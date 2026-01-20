/**
 * @file useDebugValue.ts
 * @brief React hook for displaying live variable values during debugging
 *
 * SPDX-License-Identifier: MIT
 *
 * This hook provides a clean interface for components to access live
 * variable values from the ZPLC runtime. It handles:
 * - Looking up variable addresses from the debug map
 * - Reading values from the store's liveValues cache
 * - Providing type information for display formatting
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const { value, type, loading } = useDebugValue('MyTimer.ET');
 *   return <span>{loading ? '...' : value}</span>;
 * }
 * ```
 */

import { useMemo } from 'react';
import { useIDEStore, type LiveValue } from '../store/useIDEStore';
import { findVariable, type DebugDataType, type MemoryRegion } from '../compiler';

/**
 * Result of looking up a debug variable
 */
export interface DebugValueResult {
  /** Current value (null if not available) */
  value: LiveValue | null;
  /** Data type of the variable */
  type: DebugDataType | null;
  /** Memory address of the variable */
  address: number | null;
  /** Memory region where variable is stored */
  region: MemoryRegion | null;
  /** Size in bytes */
  size: number | null;
  /** Whether the value is currently being loaded/polled */
  loading: boolean;
  /** Whether this variable exists in the debug map */
  exists: boolean;
  /** Error message if lookup failed */
  error: string | null;
}

/**
 * Hook to get a live variable value during debugging.
 *
 * @param varPath - Variable path (e.g., "Counter", "MyTimer.ET", "FB1.IN")
 * @returns DebugValueResult with current value and metadata
 *
 * @example
 * ```tsx
 * // Simple variable
 * const counter = useDebugValue('Counter');
 *
 * // FB member
 * const elapsed = useDebugValue('MyTimer.ET');
 *
 * // Display with type formatting
 * function ValueDisplay({ varPath }: { varPath: string }) {
 *   const { value, type, loading, exists } = useDebugValue(varPath);
 *
 *   if (!exists) return <span className="error">Unknown</span>;
 *   if (loading) return <span className="loading">...</span>;
 *
 *   return <span>{formatValue(value, type)}</span>;
 * }
 * ```
 */
export function useDebugValue(varPath: string): DebugValueResult {
  const debug = useIDEStore((state) => state.debug);
  const { debugMap, liveValues, isPolling } = debug;

  // Look up variable info from debug map
  const varInfo = useMemo(() => {
    if (!debugMap || !varPath) {
      return null;
    }
    return findVariable(debugMap, varPath);
  }, [debugMap, varPath]);

  // Get live value from cache
  const liveValue = liveValues.get(varPath) ?? null;

  // Build result
  return useMemo((): DebugValueResult => {
    if (!varPath) {
      return {
        value: null,
        type: null,
        address: null,
        region: null,
        size: null,
        loading: false,
        exists: false,
        error: 'No variable path provided',
      };
    }

    if (!debugMap) {
      return {
        value: null,
        type: null,
        address: null,
        region: null,
        size: null,
        loading: false,
        exists: false,
        error: 'No debug map available (compile with debug enabled)',
      };
    }

    if (!varInfo) {
      return {
        value: null,
        type: null,
        address: null,
        region: null,
        size: null,
        loading: false,
        exists: false,
        error: `Variable "${varPath}" not found in debug map`,
      };
    }

    return {
      value: liveValue,
      type: varInfo.varInfo.type,
      address: varInfo.absoluteAddr,
      region: varInfo.varInfo.region,
      size: varInfo.varInfo.size,
      loading: isPolling && liveValue === null,
      exists: true,
      error: null,
    };
  }, [varPath, debugMap, varInfo, liveValue, isPolling]);
}

/**
 * Hook to get multiple variable values at once.
 * More efficient than multiple useDebugValue calls.
 *
 * @param varPaths - Array of variable paths
 * @returns Map of variable path to DebugValueResult
 */
export function useDebugValues(
  varPaths: string[]
): Map<string, DebugValueResult> {
  const debug = useIDEStore((state) => state.debug);
  const { debugMap, liveValues, isPolling } = debug;

  return useMemo(() => {
    const results = new Map<string, DebugValueResult>();

    for (const varPath of varPaths) {
      if (!varPath) {
        results.set(varPath, {
          value: null,
          type: null,
          address: null,
          region: null,
          size: null,
          loading: false,
          exists: false,
          error: 'No variable path provided',
        });
        continue;
      }

      if (!debugMap) {
        results.set(varPath, {
          value: null,
          type: null,
          address: null,
          region: null,
          size: null,
          loading: false,
          exists: false,
          error: 'No debug map available',
        });
        continue;
      }

      const varInfo = findVariable(debugMap, varPath);
      const liveValue = liveValues.get(varPath) ?? null;

      if (!varInfo) {
        results.set(varPath, {
          value: null,
          type: null,
          address: null,
          region: null,
          size: null,
          loading: false,
          exists: false,
          error: `Variable "${varPath}" not found`,
        });
        continue;
      }

      results.set(varPath, {
        value: liveValue,
        type: varInfo.varInfo.type,
        address: varInfo.absoluteAddr,
        region: varInfo.varInfo.region,
        size: varInfo.varInfo.size,
        loading: isPolling && liveValue === null,
        exists: true,
        error: null,
      });
    }

    return results;
  }, [varPaths, debugMap, liveValues, isPolling]);
}

/**
 * Hook to get the list of watched variables and their values.
 * Useful for the Watch Window component.
 */
export function useWatchVariables(): {
  variables: Array<{ path: string; result: DebugValueResult }>;
  addWatch: (varPath: string) => void;
  removeWatch: (varPath: string) => void;
  clearAll: () => void;
} {
  const watchVariables = useIDEStore((state) => state.debug.watchVariables);
  const addWatchVariable = useIDEStore((state) => state.addWatchVariable);
  const removeWatchVariable = useIDEStore((state) => state.removeWatchVariable);
  const clearWatchVariables = useIDEStore((state) => state.clearWatchVariables);

  const valuesMap = useDebugValues(watchVariables);

  const variables = useMemo(() => {
    return watchVariables.map((path) => ({
      path,
      result: valuesMap.get(path) || {
        value: null,
        type: null,
        address: null,
        region: null,
        size: null,
        loading: false,
        exists: false,
        error: 'Unknown error',
      },
    }));
  }, [watchVariables, valuesMap]);

  return {
    variables,
    addWatch: addWatchVariable,
    removeWatch: removeWatchVariable,
    clearAll: clearWatchVariables,
  };
}

/**
 * Hook to check if a line has a breakpoint set.
 * Useful for editor gutter indicators.
 */
export function useBreakpoint(fileId: string, line: number): boolean {
  const breakpoints = useIDEStore((state) => state.debug.breakpoints);
  const fileBreakpoints = breakpoints.get(fileId);
  return fileBreakpoints?.has(line) ?? false;
}

/**
 * Hook to get all breakpoints for a file.
 * Useful for editor decorations.
 */
export function useFileBreakpoints(fileId: string): Set<number> {
  const breakpoints = useIDEStore((state) => state.debug.breakpoints);
  return breakpoints.get(fileId) ?? new Set();
}

/**
 * Hook to check if current line is at a breakpoint (paused).
 */
export function useCurrentExecution(): {
  isPaused: boolean;
  currentLine: number | null;
  currentPOU: string | null;
  currentPC: number | null;
} {
  const debug = useIDEStore((state) => state.debug);

  return {
    isPaused: debug.currentLine !== null,
    currentLine: debug.currentLine,
    currentPOU: debug.currentPOU,
    currentPC: debug.currentPC,
  };
}

/**
 * Format a value for display based on its type.
 *
 * @param value - The value to format
 * @param type - The data type
 * @returns Formatted string representation
 */
export function formatDebugValue(
  value: LiveValue | null,
  type: DebugDataType | null
): string {
  if (value === null || value === undefined) {
    return '---';
  }

  if (type === null) {
    return String(value);
  }

  switch (type) {
    case 'BOOL':
      return value ? 'TRUE' : 'FALSE';

    case 'BYTE':
    case 'USINT':
      return `16#${(Number(value) & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;

    case 'WORD':
    case 'UINT':
      return `16#${(Number(value) & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;

    case 'DWORD':
    case 'UDINT':
      return `16#${(Number(value) >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

    case 'SINT':
    case 'INT':
    case 'DINT':
    case 'LINT':
      return String(value);

    case 'REAL':
    case 'LREAL':
      // Format with reasonable precision
      if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          return value.toFixed(1);
        }
        return value.toPrecision(6);
      }
      return String(value);

    case 'TIME':
      // Format as T#Xms
      if (typeof value === 'number') {
        if (value >= 1000) {
          return `T#${(value / 1000).toFixed(3)}s`;
        }
        return `T#${value}ms`;
      }
      return String(value);

    case 'STRING':
      return `'${String(value)}'`;

    default:
      // Unknown type or FB type
      return String(value);
  }
}
