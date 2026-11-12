import { describe, expect, it } from 'bun:test';

import { planRun, type RunIntent, type RunPlan, type RunSituation } from './runPlan';
import type { TransportState } from './transport';

const base: RunSituation = {
  target: 'simulation',
  modified: false,
  saveBeforeRun: 'always',
  buildIsCurrent: true,
  sessionOpen: true,
  programLoaded: true,
  state: 'stopped',
  plantBound: false,
};
const plan = (over: Partial<RunSituation>, intent: RunIntent = 'run'): RunPlan => planRun({ ...base, ...over }, intent);
const stepsOf = (p: RunPlan) => (p.kind === 'steps' ? p.steps : p.kind);

const STATES: TransportState[] = ['stopped', 'running', 'paused', 'held', 'faulted'];
const bools = [false, true];
function everySituation(): RunSituation[] {
  const out: RunSituation[] = [];
  for (const target of ['simulation', 'board'] as const)
    for (const modified of bools)
      for (const saveBeforeRun of ['always', 'ask'] as const)
        for (const buildIsCurrent of bools)
          for (const sessionOpen of bools)
            for (const programLoaded of bools)
              for (const state of STATES)
                out.push({ target, modified, saveBeforeRun, buildIsCurrent, sessionOpen, programLoaded, state, plantBound: false });
  return out;
}

describe('the run plan (FLW-001 to FLW-003)', () => {
  it('FLW-001 from a modified program, Run in simulation plans save, build, start the simulator, load and run, in that order', () => {
    const p = plan({ modified: true, buildIsCurrent: false, sessionOpen: false, programLoaded: false });
    expect(stepsOf(p)).toEqual(['save', 'build', 'startSimulator', 'load', 'run']);
  });

  it('FLW-001 nothing already done is done again', () => {
    expect(stepsOf(plan({}))).toEqual(['run']);
    expect(stepsOf(plan({ buildIsCurrent: false }))).toEqual(['build', 'load', 'run']);
    expect(stepsOf(plan({ sessionOpen: false, programLoaded: false }))).toEqual(['startSimulator', 'load', 'run']);
    expect(plan({ state: 'running' }).kind).toBe('nothing');
    expect(stepsOf(plan({ state: 'paused' }))).toEqual(['run']);
  });

  it('FLW-006 with the preference on Ask the plan asks before it saves, and never builds sources that were not saved', () => {
    expect(stepsOf(plan({ modified: true, saveBeforeRun: 'ask' }))).toEqual(['askToSave', 'build', 'load', 'run']);
    for (const s of everySituation()) {
      for (const intent of ['run', 'step', 'rebuildAndRestart'] as const) {
        const p = planRun(s, intent);
        if (p.kind !== 'steps' || !p.steps.includes('build') || !s.modified) continue;
        const first = p.steps.indexOf(s.saveBeforeRun === 'ask' ? 'askToSave' : 'save');
        expect(first).toBeGreaterThanOrEqual(0);
        expect(first).toBeLessThan(p.steps.indexOf('build'));
      }
    }
  });

  it('FLW-002 Step from stopped prepares the session and holds before the first scan', () => {
    expect(stepsOf(plan({ sessionOpen: false, programLoaded: false, buildIsCurrent: false }, 'step'))).toEqual([
      'build',
      'startSimulator',
      'load',
      'holdBeforeFirstScan',
    ]);
    expect(stepsOf(plan({}, 'step'))).toEqual(['holdBeforeFirstScan']);
  });

  it('FLW-003 on a board no plan holds a step other than run: a missing step is an offer', () => {
    for (const s of everySituation().filter((x) => x.target === 'board'))
      for (const intent of ['run', 'step', 'rebuildAndRestart'] as const) {
        const p = planRun(s, intent);
        if (p.kind === 'steps') expect(p.steps).toEqual(['run']);
      }
    const board = { target: 'board' as const };
    expect(plan({ ...board, sessionOpen: false })).toEqual({ kind: 'offer', offer: 'connect' });
    expect(plan({ ...board, buildIsCurrent: false })).toEqual({ kind: 'offer', offer: 'build' });
    expect(plan({ ...board, programLoaded: false })).toEqual({ kind: 'offer', offer: 'deploy' });
    expect(stepsOf(plan(board))).toEqual(['run']);
  });

  it('FLW-012 rebuild and restart is steps in simulation and the offer to build on a board', () => {
    expect(stepsOf(plan({ modified: true, state: 'running' }, 'rebuildAndRestart'))).toEqual(['save', 'build', 'load', 'run']);
    expect(plan({ target: 'board' }, 'rebuildAndRestart')).toEqual({ kind: 'offer', offer: 'build' });
  });

  it('FLW-014 the plan is the same whether or not a plant is bound', () => {
    for (const s of everySituation())
      for (const intent of ['run', 'step', 'rebuildAndRestart'] as const)
        expect(planRun({ ...s, plantBound: true }, intent)).toEqual(planRun(s, intent));
  });
});
