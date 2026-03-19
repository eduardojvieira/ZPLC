import type { DebugMap } from '../compiler';

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
