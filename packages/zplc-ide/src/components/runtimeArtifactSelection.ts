export const EXECUTION_MODE = {
  SIMULATE: 'simulate',
  HARDWARE: 'hardware',
} as const;

export type ExecutionMode = (typeof EXECUTION_MODE)[keyof typeof EXECUTION_MODE];

export interface CompileArtifactBundle {
  bytecode: Uint8Array;
  zplcFile: Uint8Array;
}

export function selectRuntimeArtifact(artifacts: CompileArtifactBundle): Uint8Array {
  return artifacts.zplcFile;
}
