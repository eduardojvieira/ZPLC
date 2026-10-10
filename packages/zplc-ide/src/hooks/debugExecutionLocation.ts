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
    // A statement owns every instruction it generates (CMP-055): the pc of any of them resolves to its line,
    // not only the first. A map without ranges (length 0) still matches its start.
    const mapping = pouInfo.sourceMap.find((item) => item.pc === pc)
      ?? pouInfo.sourceMap.find((item) => pc > item.pc && pc < item.pc + item.length);
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
