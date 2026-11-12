/**
 * Executes the steps of a run plan in order under one notice (spec 013 FLW-001, FLW-002, FLW-006). The plan is the pure
 * function of `runtime/runPlan.ts`; the actions are the handlers the command bar already has, injected. The sequence stops at
 * the first step that fails or is cancelled and runs nothing after it; a plan that is an offer or nothing opens no notice.
 */
import { t } from '../i18n';
import type { RunPlan, RunStep } from '../runtime/runPlan';
import type { NotificationResult } from '../store/notifications';

export interface RunActions {
  save(): Promise<boolean>;
  askToSave(): Promise<'saved' | 'cancelled'>;
  build(): Promise<boolean>;
  startSimulator(): Promise<void>;
  load(): Promise<void>;
  run(): Promise<void>;
  holdBeforeFirstScan(): Promise<void>;
}

export interface RunNotice {
  begin(title: string, onCancel: () => void): string;
  advance(id: string, step: string): void;
  finish(id: string, result: NotificationResult): void;
}

export type RunOutcome = 'done' | 'cancelled' | { failedAt: RunStep; message: string };

const stepTitle = (step: RunStep, plantBound: boolean): string =>
  step === 'run' && plantBound ? t('studio.flow.step.runPlant') : t(`studio.flow.step.${step}`);

export async function runSequence(
  plan: RunPlan,
  actions: RunActions,
  notice: RunNotice,
  options: { plantBound?: boolean } = {},
): Promise<RunOutcome> {
  if (plan.kind !== 'steps') return 'done';
  const plantBound = options.plantBound === true;
  let cancelRequested = false;
  const id = notice.begin(stepTitle(plan.steps[0]!, plantBound), () => {
    cancelRequested = true;
  });
  const cancelled = (): RunOutcome => {
    notice.finish(id, {
      kind: 'run',
      status: 'cancelled',
      title: t('studio.flow.cancelled'),
      detail: t('studio.flow.cancelledDetail'),
      details: 'output',
    });
    return 'cancelled';
  };

  for (const step of plan.steps) {
    if (cancelRequested) return cancelled();
    notice.advance(id, stepTitle(step, plantBound));
    try {
      if (step === 'askToSave') {
        if ((await actions.askToSave()) === 'cancelled') return cancelled();
      } else if (step === 'save') {
        if (!(await actions.save())) throw new Error(t('studio.flow.saveFailed'));
      } else if (step === 'build') {
        if (!(await actions.build())) throw new Error(t('studio.flow.buildFailed'));
      } else {
        await actions[step]();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notice.finish(id, {
        kind: 'run',
        status: 'error',
        title: t('studio.flow.stopped', { step: stepTitle(step, plantBound) }),
        detail: message,
        details: step === 'build' ? 'problems' : 'output',
      });
      return { failedAt: step, message };
    }
  }
  const last = plan.steps[plan.steps.length - 1];
  notice.finish(id, {
    kind: 'run',
    status: 'success',
    title:
      last === 'holdBeforeFirstScan'
        ? t('studio.flow.done.hold')
        : plantBound
          ? t('studio.flow.done.runPlant')
          : t('studio.flow.done.run'),
    details: 'output',
  });
  return 'done';
}
