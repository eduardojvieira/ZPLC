import type { DebugMap, DebugPOUInfo } from '../compiler';

function normalizeBreakpointName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').toLowerCase();
}

function findPOU(debugMap: DebugMap, fileName: string): DebugPOUInfo | null {
  const normalizedFileName = normalizeBreakpointName(fileName);
  const fullFileName = fileName.toLowerCase();

  for (const [name, info] of Object.entries(debugMap.pou)) {
    const normalizedPouName = normalizeBreakpointName(name);
    const fullPouName = name.toLowerCase();

    if (
      fullPouName === fullFileName ||
      normalizedPouName === normalizedFileName
    ) {
      return info;
    }
  }

  return null;
}

function getExecutableLines(pouInfo: DebugPOUInfo): Set<number> {
  const lines = new Set<number>();

  for (const breakpoint of pouInfo.breakpoints) {
    if (breakpoint.valid && breakpoint.line > 0) {
      lines.add(breakpoint.line);
    }
  }

  if (lines.size > 0) {
    return lines;
  }

  for (const mapping of pouInfo.sourceMap) {
    if (mapping.line > 0) {
      lines.add(mapping.line);
    }
  }

  return lines;
}

export function getEligibleBreakpointLines(
  debugMap: DebugMap | null,
  fileName: string,
): number[] {
  if (!debugMap || !fileName) {
    return [];
  }

  const pouInfo = findPOU(debugMap, fileName);
  if (!pouInfo) {
    return [];
  }

  return Array.from(getExecutableLines(pouInfo)).sort((a, b) => a - b);
}

export function getBreakpointPCForLine(
  debugMap: DebugMap | null,
  fileName: string,
  lineNumber: number,
): number | null {
  if (!debugMap || !fileName || lineNumber < 1) {
    return null;
  }

  const pouInfo = findPOU(debugMap, fileName);
  if (!pouInfo) {
    return null;
  }

  const breakpoint = pouInfo.breakpoints.find(
    (entry) => entry.valid && entry.line === lineNumber,
  );
  if (breakpoint) {
    return breakpoint.pc;
  }

  const mapping = pouInfo.sourceMap.find((entry) => entry.line === lineNumber);
  return mapping?.pc ?? null;
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

  return getExecutableLines(pouInfo).has(lineNumber);
}

export function filterEligibleBreakpointLines(
  debugMap: DebugMap | null,
  fileName: string,
  lines: Iterable<number>,
): number[] {
  return Array.from(lines).filter((lineNumber) => isLineBreakpointEligible(debugMap, fileName, lineNumber));
}
