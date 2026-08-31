import type { DebugMap, DebugPOUInfo } from '../compiler';

function normalizeBreakpointName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').toLowerCase();
}

function sourceRefMatchesFile(sourceRef: string, fileName: string): boolean {
  const normalizeModelAlias = (value: string) => value.replace(/\.json$/i, '').toLowerCase();
  return normalizeModelAlias(sourceRef) === normalizeModelAlias(fileName);
}

function findPOU(debugMap: DebugMap, fileName: string): DebugPOUInfo | null {
  const normalizedFileName = normalizeBreakpointName(fileName);
  const fullFileName = fileName.toLowerCase();

  for (const [name, info] of Object.entries(debugMap.pou)) {
    if (info.sourceRef) {
      if (sourceRefMatchesFile(info.sourceRef, fileName)) {
        return info;
      }
      continue;
    }

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

/**
 * Match a paused semantic POU to the editor's physical file.
 * Legacy maps have no sourceRef and retain the historical name-based fallback.
 */
export function doesCurrentPOUMatchFile(
  debugMap: DebugMap | null,
  currentPOU: string | null | undefined,
  fileName: string,
  fileId: string,
): boolean {
  if (!currentPOU) {
    return false;
  }

  const currentInfo = debugMap
    ? Object.entries(debugMap.pou).find(([name]) => name.toLowerCase() === currentPOU.toLowerCase())?.[1]
    : undefined;
  if (currentInfo?.sourceRef) {
    return sourceRefMatchesFile(currentInfo.sourceRef, fileName)
      || sourceRefMatchesFile(currentInfo.sourceRef, fileId);
  }

  const normalizedCurrentPOU = normalizeBreakpointName(currentPOU);
  const normalizedFileName = normalizeBreakpointName(fileName);
  const normalizedFileId = normalizeBreakpointName(fileId.replace(/-/g, '.'));
  return normalizedCurrentPOU === normalizedFileName
    || normalizedCurrentPOU === normalizedFileId
    || fileId.toLowerCase().includes(normalizedCurrentPOU);
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
