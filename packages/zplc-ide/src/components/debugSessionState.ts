import type { VMState } from '../runtime/debugAdapter';

export const PROGRAM_LOAD_STATE = {
  EMPTY: 'empty',
  LOADED: 'loaded',
} as const;

export type ProgramLoadState = (typeof PROGRAM_LOAD_STATE)[keyof typeof PROGRAM_LOAD_STATE];

export function shouldAutoLoadBeforeStart(vmState: VMState, programLoadState: ProgramLoadState): boolean {
  return vmState === 'idle' && programLoadState === PROGRAM_LOAD_STATE.EMPTY;
}
