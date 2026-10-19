import type { DebugMap } from '../compiler';
import type { VMState } from '../runtime/debugAdapter';
import type { ExecutionMode } from './runtimeArtifactSelection';

export const PROGRAM_LOAD_STATE = {
  EMPTY: 'empty',
  LOADED: 'loaded',
} as const;

/** Safe copy when a physical deploy may have started but its result is unknown. */

export type ProgramLoadState = (typeof PROGRAM_LOAD_STATE)[keyof typeof PROGRAM_LOAD_STATE];

/** What the toolbar keeps of the last successful build: the artifacts, and the compiler run that made them. */
export interface LastCompileResult {
  bytecode: Uint8Array;
  zplcFile: Uint8Array;
  assembly: string;
  fileName: string;
  codeSize: number;
  hasTaskSegment: boolean;
  taskCount: number;
  debugMap: DebugMap;
  revision: number;
  compilerRunId: number;
}

export function isCompileResultCurrent(
  compileResultRunId: number | null,
  compilerRunId: number,
): boolean {
  return compileResultRunId === compilerRunId;
}

export function shouldAutoLoadBeforeStart(
  executionMode: ExecutionMode,
  vmState: VMState,
  programLoadState: ProgramLoadState,
): boolean {
  return executionMode === 'simulate' && vmState === 'idle' && programLoadState === PROGRAM_LOAD_STATE.EMPTY;
}

export function canRunCurrentProgram(
  executionMode: ExecutionMode,
  hasCompileResult: boolean,
  programLoadState: ProgramLoadState,
): boolean {
  return hasCompileResult && (executionMode === 'simulate' || programLoadState === PROGRAM_LOAD_STATE.LOADED);
}

export function nextProgramLoadStateAfterCompile(): ProgramLoadState {
  return PROGRAM_LOAD_STATE.EMPTY;
}

export function nextProgramLoadStateAfterConnect(): ProgramLoadState {
  return PROGRAM_LOAD_STATE.EMPTY;
}

export function nextProgramLoadStateAfterDeploy(
  deployedRevision: number,
  currentRevision: number,
  deployedCompilerRunId: number,
  currentCompilerRunId: number,
): ProgramLoadState {
  return deployedRevision === currentRevision
    && isCompileResultCurrent(deployedCompilerRunId, currentCompilerRunId)
    ? PROGRAM_LOAD_STATE.LOADED
    : PROGRAM_LOAD_STATE.EMPTY;
}
