/**
 * The run plan (spec 013 FLW-001 to FLW-003, FLW-006, FLW-012, FLW-014): what pressing Run, Step or "Rebuild and restart"
 * has to do from where the project stands. A pure function: no React, no store. The command bar executes the steps in order
 * (Task W6); a board never gets more than `run`, a missing step is an offer.
 */
import type { TransportState } from './transport';

export type RunStep = 'save' | 'askToSave' | 'build' | 'startSimulator' | 'load' | 'run' | 'holdBeforeFirstScan';
export type RunOffer = 'connect' | 'build' | 'deploy';

export interface RunSituation {
  target: 'simulation' | 'board';
  /** Any document, the project configuration included. */
  modified: boolean;
  saveBeforeRun: 'always' | 'ask';
  buildIsCurrent: boolean;
  /** The simulator is started, or the board is connected. */
  sessionOpen: boolean;
  /** The current build is in the runtime. */
  programLoaded: boolean;
  state: TransportState;
  /** Does not change the steps; W6 names the plant in the notice. */
  plantBound: boolean;
}

export type RunPlan = { kind: 'steps'; steps: readonly RunStep[] } | { kind: 'offer'; offer: RunOffer } | { kind: 'nothing' };

export type RunIntent = 'run' | 'step' | 'rebuildAndRestart';

const steps = (list: RunStep[]): RunPlan => ({ kind: 'steps', steps: list });
const offer = (what: RunOffer): RunPlan => ({ kind: 'offer', offer: what });
const NOTHING: RunPlan = { kind: 'nothing' };

function planBoard(s: RunSituation, intent: RunIntent): RunPlan {
  if (intent === 'rebuildAndRestart') return offer('build');
  if (!s.sessionOpen) return offer('connect');
  if (s.modified || !s.buildIsCurrent) return offer('build');
  if (!s.programLoaded) return offer('deploy');
  return s.state === 'running' ? NOTHING : steps(['run']);
}

function planSimulation(s: RunSituation, intent: RunIntent): RunPlan {
  const rebuild = intent === 'rebuildAndRestart';
  const idle = s.state === 'stopped' || s.state === 'faulted';
  if (!rebuild && !idle) {
    // Running does nothing; Pause and Step of a live session are the transport's.
    return s.state !== 'running' && intent === 'run' ? steps(['run']) : NOTHING;
  }
  const list: RunStep[] = [];
  if (s.modified) list.push(s.saveBeforeRun === 'ask' ? 'askToSave' : 'save');
  // A modified project is saved, so its build is no longer the current one.
  const builds = rebuild || s.modified || !s.buildIsCurrent;
  if (builds) list.push('build');
  if (!s.sessionOpen) list.push('startSimulator');
  if (builds || !s.programLoaded) list.push('load');
  list.push(intent === 'step' ? 'holdBeforeFirstScan' : 'run');
  return steps(list);
}

export function planRun(situation: RunSituation, intent: RunIntent): RunPlan {
  return situation.target === 'board' ? planBoard(situation, intent) : planSimulation(situation, intent);
}
