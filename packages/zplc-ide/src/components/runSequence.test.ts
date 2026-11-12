import { describe, expect, it } from 'bun:test';
import { planRun, type RunSituation } from '../runtime/runPlan';
import type { NotificationResult } from '../store/notifications';
import { runSequence, type RunActions } from './runSequence';

const situation: RunSituation = {
  target: 'simulation',
  modified: true,
  saveBeforeRun: 'always',
  buildIsCurrent: false,
  sessionOpen: false,
  programLoaded: false,
  state: 'stopped',
  plantBound: false,
};

/** Fakes that record every call and every notice, in order. */
function harness(over: Partial<RunActions> = {}) {
  const calls: string[] = [];
  const titles: string[] = [];
  const finished: NotificationResult[] = [];
  let cancel: () => void = () => undefined;
  const call = (name: string) => async () => {
    calls.push(name);
  };
  const actions: RunActions = {
    save: async () => (calls.push('save'), true),
    askToSave: async () => (calls.push('askToSave'), 'saved'),
    build: async () => (calls.push('build'), true),
    startSimulator: call('startSimulator'),
    load: call('load'),
    run: call('run'),
    holdBeforeFirstScan: call('holdBeforeFirstScan'),
    ...over,
  };
  const notice = {
    begin: (title: string, onCancel: () => void) => {
      titles.push(title);
      cancel = onCancel;
      return 'n1';
    },
    advance: (_id: string, step: string) => void titles.push(step),
    finish: (_id: string, result: NotificationResult) => void finished.push(result),
  };
  return { actions, notice, calls, titles, finished, cancel: () => cancel() };
}

const plan = (over: Partial<RunSituation> = {}, intent: 'run' | 'step' = 'run') => planRun({ ...situation, ...over }, intent);

describe('runSequence (FLW-001, FLW-006)', () => {
  it('FLW-001 the steps run in order and each is named in the one notice', async () => {
    const h = harness();
    expect(await runSequence(plan(), h.actions, h.notice)).toBe('done');
    expect(h.calls).toEqual(['save', 'build', 'startSimulator', 'load', 'run']);
    expect(h.titles).toEqual(['Saving the project', 'Saving the project', 'Building the project', 'Starting the simulator', 'Loading the program', 'Running']);
    expect(h.finished).toHaveLength(1);
    expect(h.finished[0]).toMatchObject({ kind: 'run', status: 'success' });
  });

  it('FLW-001 a failed build stops the sequence: the simulator is not started and nothing is loaded', async () => {
    const h = harness({ build: async () => (h.calls.push('build'), false) });
    const result = await runSequence(plan(), h.actions, h.notice);
    expect(result).toMatchObject({ failedAt: 'build' });
    expect(h.calls).toEqual(['save', 'build']);
    expect(h.finished).toHaveLength(1);
    expect(h.finished[0]).toMatchObject({ status: 'error', details: 'problems' });
  });

  it('FLW-001 a step that throws stops the sequence at that step with its message', async () => {
    const h = harness({
      startSimulator: async () => {
        h.calls.push('startSimulator');
        throw new Error('the native runtime is missing');
      },
    });
    const result = await runSequence(plan(), h.actions, h.notice);
    expect(result).toEqual({ failedAt: 'startSimulator', message: 'the native runtime is missing' });
    expect(h.calls).toEqual(['save', 'build', 'startSimulator']);
    expect(h.finished[0]).toMatchObject({ status: 'error', detail: 'the native runtime is missing', details: 'output' });
  });

  it('FLW-001 a failed save stops before the build', async () => {
    const h = harness({ save: async () => (h.calls.push('save'), false) });
    expect(await runSequence(plan(), h.actions, h.notice)).toMatchObject({ failedAt: 'save' });
    expect(h.calls).toEqual(['save']);
  });

  it('FLW-001 Cancel during the build stops before the next step', async () => {
    const h = harness({
      build: async () => {
        h.calls.push('build');
        h.cancel();
        return true;
      },
    });
    expect(await runSequence(plan(), h.actions, h.notice)).toBe('cancelled');
    expect(h.calls).toEqual(['save', 'build']);
    expect(h.finished[0]).toMatchObject({ status: 'cancelled' });
  });

  it('FLW-006 with Ask, choosing Cancel saves nothing and runs nothing', async () => {
    const h = harness({ askToSave: async () => (h.calls.push('askToSave'), 'cancelled') });
    expect(await runSequence(plan({ saveBeforeRun: 'ask' }), h.actions, h.notice)).toBe('cancelled');
    expect(h.calls).toEqual(['askToSave']);
    expect(h.finished[0]).toMatchObject({ status: 'cancelled' });
  });

  it('FLW-006 with Ask, choosing Save goes on with the build and the run', async () => {
    const h = harness();
    expect(await runSequence(plan({ saveBeforeRun: 'ask' }), h.actions, h.notice)).toBe('done');
    expect(h.calls).toEqual(['askToSave', 'build', 'startSimulator', 'load', 'run']);
  });

  it('FLW-002 Step from stopped prepares the session and holds before the first scan', async () => {
    const h = harness();
    expect(await runSequence(plan({ modified: false, buildIsCurrent: true }, 'step'), h.actions, h.notice)).toBe('done');
    expect(h.calls).toEqual(['startSimulator', 'load', 'holdBeforeFirstScan']);
    expect(h.finished[0]).toMatchObject({ status: 'success', title: 'Stopped before the first scan' });
  });

  it('FLW-014 a plant in the situation is named in the notice and changes no step', async () => {
    const h = harness();
    await runSequence(plan({ plantBound: true }), h.actions, h.notice, { plantBound: true });
    expect(h.calls).toEqual(['save', 'build', 'startSimulator', 'load', 'run']);
    expect(h.titles.at(-1)).toBe('Running the program and the plant');
  });

  it('an offer or nothing to do runs no step and opens no notice', async () => {
    const h = harness();
    expect(await runSequence({ kind: 'nothing' }, h.actions, h.notice)).toBe('done');
    expect(await runSequence({ kind: 'offer', offer: 'connect' }, h.actions, h.notice)).toBe('done');
    expect(h.calls).toEqual([]);
    expect(h.titles).toEqual([]);
  });
});
