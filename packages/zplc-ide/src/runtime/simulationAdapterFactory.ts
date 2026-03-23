import type { IDebugAdapter } from './debugAdapter';
import { NativeAdapter } from './nativeAdapter';
import { WASMAdapter } from './wasmAdapter';

function hasNativeSimulationBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.nativeSimulation);
}

export function createSimulationAdapter(): IDebugAdapter {
  if (hasNativeSimulationBridge()) {
    return new NativeAdapter();
  }

  return new WASMAdapter();
}
