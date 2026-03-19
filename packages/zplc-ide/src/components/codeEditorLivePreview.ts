import type { DebugMode } from '../store/useIDEStore';

export function isInlineLivePreviewEnabled(debugMode: DebugMode, livePreviewEnabled: boolean): boolean {
  if (debugMode === 'simulation') {
    return true;
  }

  if (debugMode === 'hardware') {
    return livePreviewEnabled;
  }

  return false;
}
