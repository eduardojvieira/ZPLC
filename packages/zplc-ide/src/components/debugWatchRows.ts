import { findVariable } from '../compiler';
import type { DebugMap } from '../compiler';
import type { LiveValue } from '../store/useIDEStore';

export interface DebugWatchRowResult {
  value: LiveValue | null;
  type: string | null;
  address: number | null;
  region: string | null;
  size: number | null;
  loading: boolean;
  exists: boolean;
  error: string | null;
}

export interface DebugWatchRow {
  path: string;
  result: DebugWatchRowResult;
}

export function buildDebugWatchRows(
  watchVariables: string[],
  debugMap: DebugMap | null,
  liveValues: Map<string, LiveValue>,
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
        },
      };
    }

    const liveValue = liveValues.get(path) ?? null;

    return {
      path,
      result: {
        value: liveValue,
        type: variable.varInfo.type,
        address: variable.absoluteAddr,
        region: variable.varInfo.region,
        size: variable.varInfo.size,
        loading: isPolling && liveValue === null,
        exists: true,
        error: null,
      },
    };
  });
}
