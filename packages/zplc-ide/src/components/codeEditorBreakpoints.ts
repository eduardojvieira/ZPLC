import type { DebugMap, DebugPOUInfo } from '../compiler';

function toPouName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').toLowerCase();
}

function findPOU(debugMap: DebugMap, fileName: string): DebugPOUInfo | null {
  const pouName = toPouName(fileName);

  for (const [name, info] of Object.entries(debugMap.pou)) {
    if (name.toLowerCase() === pouName) {
      return info;
    }
  }

  return null;
}

export function isLineBreakpointEligible(
  debugMap: DebugMap | null,
  fileName: string,
  lineNumber: number,
): boolean {
  if (!debugMap || !fileName || lineNumber < 1) {
    return false;
  }

  const pouInfo = findPOU(debugMap, fileName);
  if (!pouInfo) {
    return false;
  }

  return pouInfo.breakpoints.some((breakpoint) => breakpoint.valid && breakpoint.line === lineNumber);
}

export function filterEligibleBreakpointLines(
  debugMap: DebugMap | null,
  fileName: string,
  lines: Iterable<number>,
): number[] {
  return Array.from(lines).filter((lineNumber) => isLineBreakpointEligible(debugMap, fileName, lineNumber));
}
