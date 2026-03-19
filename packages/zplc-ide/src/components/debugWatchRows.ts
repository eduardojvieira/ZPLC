import { findVariable } from '../compiler';
import type { DebugMap } from '../compiler';
import type { WatchForceEntry } from '../runtime/debugAdapter';
import type { LiveValue } from '../store/useIDEStore';

export interface DebugWatchRowResult {
  value: LiveValue | null;
  type: string | null;
  address: number | null;
  region: string | null;
  size: number | null;
  maxLength?: number;
  loading: boolean;
  exists: boolean;
  error: string | null;
  forced: boolean;
  forceEntry: WatchForceEntry | null;
}

export interface DebugWatchRow {
  path: string;
  result: DebugWatchRowResult;
}

export function buildDebugWatchRows(
  watchVariables: string[],
  debugMap: DebugMap | null,
  liveValues: Map<string, LiveValue>,
  forcedValues: Map<string, WatchForceEntry>,
  isPolling: boolean,
): DebugWatchRow[] {
  return watchVariables.map((path) => {
    if (!path) {
      return {
        path,
        result: {
          value: null,
          type: null,
          address: null,
          region: null,
          size: null,
          loading: false,
          exists: false,
          error: 'No variable path provided',
          forced: false,
          forceEntry: null,
        },
      };
    }

    if (!debugMap) {
      return {
        path,
        result: {
          value: null,
          type: null,
          address: null,
          region: null,
          size: null,
          loading: false,
          exists: false,
          error: 'No debug map available',
          forced: false,
          forceEntry: null,
        },
      };
    }

    const variable = findVariable(debugMap, path);
    if (!variable) {
      return {
        path,
        result: {
          value: null,
          type: null,
          address: null,
          region: null,
          size: null,
          loading: false,
          exists: false,
          error: `Variable "${path}" not found`,
          forced: false,
          forceEntry: null,
        },
      };
    }

    const liveValue = liveValues.get(path) ?? null;
    const forceEntry = forcedValues.get(path)
      ?? Array.from(forcedValues.values()).find((entry) => entry.address === variable.absoluteAddr)
      ?? null;

    return {
      path,
      result: {
        value: liveValue,
        type: variable.varInfo.type,
        address: variable.absoluteAddr,
        region: variable.varInfo.region,
        size: variable.varInfo.size,
        maxLength:
          variable.varInfo.type === 'STRING' && variable.varInfo.size
            ? Math.max(0, variable.varInfo.size - 3)
            : undefined,
        loading: isPolling && liveValue === null,
        exists: true,
        error: null,
        forced: forceEntry !== null,
        forceEntry,
      },
    };
  });
}
