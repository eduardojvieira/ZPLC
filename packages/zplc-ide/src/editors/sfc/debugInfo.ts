/**
 * What each step and transition of a chart shows online (LNG-006, UX-009): from the state the monitor read for its
 * element, which variable the debug map names, and whether the user forces it or the poll could not read it.
 */

import type { SFCStep, SFCTransition } from '../../models/sfc';
import { stepElement, transitionElement } from '../../models/sourceElements';
import type { ElementState, FlagsOf } from '../../monitoring/elementStates';

export interface DebugStepInfo {
  isActive: boolean;
  /** The map gave no state for the step, or it was not read. */
  unavailable?: boolean;
  timeInStep?: number;
  activationCount?: number;
  /** The step variable is forced, or could not be read. */
  forced?: boolean;
  fault?: boolean;
}

export interface DebugTransitionInfo {
  conditionResult?: boolean;
  isArmed: boolean;
  wasFired?: boolean;
  /** A variable of the condition is forced, or the condition could not be read. */
  forced?: boolean;
  fault?: boolean;
}

/**
 * The words of a transition condition that can name a variable. A keyword or a literal is a word too: what the debug map
 * does not resolve to a variable of the file (`flagsOf` answers nothing for it) is not one, so only variables count.
 */
export function conditionVariables(condition: string | undefined): string[] {
  const text = (condition ?? '').replace(/'[^']*'/g, ' ').replace(/[A-Za-z0-9_]*#[A-Za-z0-9_.:]*/g, ' ');
  return [...new Set(text.match(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g) ?? [])];
}

export function stepDebugInfoOf(steps: readonly SFCStep[], states: ReadonlyMap<string, ElementState>): Map<string, DebugStepInfo> {
  const info = new Map<string, DebugStepInfo>();
  for (const step of steps) {
    const state = states.get(stepElement(step.id));
    info.set(step.id, {
      isActive: state?.active === true,
      unavailable: state?.active === undefined,
      timeInStep: state?.time,
      ...state?.flags,
    });
  }
  return info;
}

export function transitionDebugInfoOf(
  transitions: readonly SFCTransition[],
  states: ReadonlyMap<string, ElementState>,
  activeSteps: ReadonlySet<string>,
  flagsOf?: FlagsOf,
): Map<string, DebugTransitionInfo> {
  const info = new Map<string, DebugTransitionInfo>();
  for (const transition of transitions) {
    const state = states.get(transitionElement(transition.id));
    // armed: every step the transition leaves is active
    const leaves = transition.fromSteps ?? [transition.fromStep];
    const flags = [state?.flags, ...(flagsOf ? conditionVariables(transition.condition).map(flagsOf) : [])];
    info.set(transition.id, {
      ...(flags.some((flag) => flag?.forced) ? { forced: true } : {}),
      ...(flags.some((flag) => flag?.fault) ? { fault: true } : {}),
      conditionResult: state?.condition,
      isArmed: leaves.length > 0 && leaves.every((id) => activeSteps.has(id)),
      wasFired: state?.fired === true,
    });
  }
  return info;
}

/** The data of a step node that is about the online state. */
export const stepDebugData = (info?: DebugStepInfo): Record<string, unknown> => ({
  isActive: info?.isActive || false,
  stateUnavailable: info?.unavailable === true,
  timeInStep: info?.timeInStep,
  activationCount: info?.activationCount,
  forced: info?.forced === true,
  fault: info?.fault === true,
});

/** The data of a transition node that is about the online state. */
export const transitionDebugData = (info?: DebugTransitionInfo): Record<string, unknown> => ({
  conditionResult: info?.conditionResult,
  isArmed: info?.isArmed || false,
  wasFired: info?.wasFired || false,
  forced: info?.forced === true,
  fault: info?.fault === true,
});
