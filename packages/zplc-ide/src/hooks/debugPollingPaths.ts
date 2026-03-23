import { findVariable, type DebugMap } from '../compiler';

export interface PolledDebugVariableDescriptor {
  name: string;
  address: number;
  type: 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'BYTE' | 'WORD' | 'DWORD' | 'TIME' | 'STRING';
  forceable: boolean;
  bitOffset?: number;
  maxLength?: number;
}

function mapDebugType(type: string): PolledDebugVariableDescriptor['type'] {
  const normalized = type.toUpperCase();

  if (normalized === 'BOOL') return 'BOOL';
  if (normalized === 'INT' || normalized === 'SINT' || normalized === 'USINT' || normalized === 'UINT') return 'INT';
  if (normalized === 'DINT' || normalized === 'UDINT' || normalized === 'LINT' || normalized === 'ULINT') return 'DINT';
  if (normalized === 'REAL' || normalized === 'LREAL') return 'REAL';
  if (normalized === 'BYTE') return 'BYTE';
  if (normalized === 'WORD') return 'WORD';
  if (normalized === 'DWORD' || normalized === 'LWORD') return 'DWORD';
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
): string[] {
  const pathSet = new Set<string>(watchVariables);

  if (!livePreviewEnabled || !debugMap || pathSet.size >= cap) {
    return Array.from(pathSet).slice(0, cap);
  }

  outer: for (const [, pouInfo] of Object.entries(debugMap.pou)) {
    for (const varName of Object.keys(pouInfo.vars)) {
      if (pathSet.size >= cap) {
        break outer;
      }
      pathSet.add(varName);
    }
  }

  return Array.from(pathSet);
}
