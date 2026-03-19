import type { DebugMap } from '../compiler';

export interface ResolvedExecutionLocation {
  line: number | null;
  pc: number;
  pouName: string | null;
}

export function resolveExecutionLocation(
  debugMap: DebugMap | null,
  pc: number,
  line?: number
): ResolvedExecutionLocation {
  if (!debugMap) {
    return {
      line: line ?? null,
      pc,
      pouName: null,
    };
  }

  for (const [pouName, pouInfo] of Object.entries(debugMap.pou)) {
    const mapping = pouInfo.sourceMap.find((item) => item.pc === pc);
    if (mapping) {
      return {
        line: mapping.line,
        pc,
        pouName,
      };
    }
  }

  return {
    line: line ?? null,
    pc,
    pouName: null,
  };
}
