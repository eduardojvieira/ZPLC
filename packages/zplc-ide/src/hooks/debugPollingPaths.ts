import { findVariable, type DebugMap } from '../compiler';
import { parseMonitorKey, resolveVariable } from '../monitoring/debugVariables';

export interface PolledDebugVariableDescriptor {
  name: string;
  address: number;
  type: 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'BYTE' | 'WORD' | 'DWORD' | 'TIME' | 'STRING' | 'LINT' | 'ULINT' | 'LWORD' | 'LREAL';
  forceable: boolean;
  bitOffset?: number;
  maxLength?: number;
}

function mapDebugType(type: string): PolledDebugVariableDescriptor['type'] {
  const normalized = type.toUpperCase();

  if (normalized === 'BOOL') return 'BOOL';
  if (normalized === 'INT' || normalized === 'SINT' || normalized === 'USINT' || normalized === 'UINT') return 'INT';
  if (normalized === 'DINT' || normalized === 'UDINT') return 'DINT';
  // the 64-bit types are read as their 8 bytes (CMP-015): reading the low 4 bytes showed half of the value
  if (normalized === 'LINT' || normalized === 'ULINT' || normalized === 'LWORD' || normalized === 'LREAL') return normalized;
  if (normalized === 'REAL') return 'REAL';
  if (normalized === 'BYTE') return 'BYTE';
  if (normalized === 'WORD') return 'WORD';
  if (normalized === 'DWORD') return 'DWORD';
  if (normalized === 'TIME') return 'TIME';
  if (normalized === 'STRING') return 'STRING';

  return 'DWORD';
}

export function describePolledDebugVariable(
  debugMap: DebugMap | null,
  varPath: string,
): PolledDebugVariableDescriptor | null {
  if (!debugMap) {
    return null;
  }

  // a variable of an open diagram is named with its file: two programs have a `_rung1_result` (LNG-006)
  const monitored = parseMonitorKey(varPath);
  if (monitored) {
    const variable = resolveVariable(debugMap, monitored.sourceRef, monitored.variable);
    return variable === undefined ? null : {
      name: varPath,
      address: variable.address,
      type: mapDebugType(variable.type),
      forceable: false,
      bitOffset: variable.bitOffset,
      maxLength: variable.type === 'STRING' && variable.size ? Math.max(0, variable.size - 3) : undefined,
    };
  }

  const found = findVariable(debugMap, varPath);
  if (!found) {
    return null;
  }

  return {
    name: varPath,
    address: found.absoluteAddr,
    type: mapDebugType(found.varInfo.type),
    forceable: found.varInfo.region === 'IPI',
    bitOffset: found.varInfo.bitOffset,
    maxLength:
      found.varInfo.type === 'STRING' && found.varInfo.size
        ? Math.max(0, found.varInfo.size - 3)
        : undefined,
  };
}

export function buildPolledDebugPaths(
  watchVariables: string[],
  debugMap: DebugMap | null,
  livePreviewEnabled: boolean,
  cap = 64,
  monitored: readonly string[] = [],
): string[] {
  const pathSet = new Set<string>(watchVariables);

  if (!livePreviewEnabled || !debugMap || pathSet.size >= cap) {
    // what the open diagrams show is read in addition: it is what their editors ask for, whatever the preview is
    return Array.from(new Set([...Array.from(pathSet).slice(0, cap), ...monitored]));
  }

  outer: for (const [, pouInfo] of Object.entries(debugMap.pou)) {
    for (const varName of Object.keys(pouInfo.vars)) {
      if (pathSet.size >= cap) {
        break outer;
      }
      pathSet.add(varName);
    }
  }

  return Array.from(new Set([...pathSet, ...monitored]));
}
