import { DEBUG_ADAPTER_TYPE, type DebugAdapterType } from '../runtime/debugAdapter';

export const EXECUTION_MODE = {
  SIMULATE: 'simulate',
  HARDWARE: 'hardware',
} as const;

export type ExecutionMode = (typeof EXECUTION_MODE)[keyof typeof EXECUTION_MODE];

export interface CompileArtifactBundle {
  bytecode: Uint8Array;
  zplcFile: Uint8Array;
}

export function selectRuntimeArtifact(
  executionMode: ExecutionMode,
  adapterType: DebugAdapterType | null,
  artifacts: CompileArtifactBundle,
): Uint8Array {
  if (executionMode === EXECUTION_MODE.HARDWARE) {
    return artifacts.zplcFile;
  }

  if (adapterType === DEBUG_ADAPTER_TYPE.NATIVE) {
    return artifacts.zplcFile;
  }

  return artifacts.bytecode;
}
