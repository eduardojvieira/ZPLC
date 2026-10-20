/**
 * "Check on board" (LRN-013, LRN-024): the button that runs the check of a lesson on the learner's board, what it still
 * waits for, the step the learner is on, and the result with the failed assertions (LRN-026). It never connects, deploys,
 * starts or stops anything (LRN-015): it reads a session the learner opened, through `src/runtime/boardSession.ts`.
 */
import { useRef, useState } from 'react';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { useT } from '../i18n';
import { boardCheckReadiness, boardCheckSteps, lessonWatchVariables, runBoardCheck, type BoardCheckOutcome, type BoardCheckReadiness, type BoardCheckSignal, type BoardCheckStep } from '../learn/boardCheck';
import { describeFailure } from '../learn/gradeRecord';
import { isLearnerBoard, useLearnBoard, type LearnerBoard } from '../learn/learnBoard';
import { learnerBoardOf } from '../learn/learnerBoards';
import type { ScenarioExpectation, ScenarioFile } from '../learn/lessonPackage';
import { useLearnProgress } from '../learn/progressState';
import { boardSessionOf } from '../runtime/boardSession';
import { useDeployedProgram } from '../store/deployedProgram';
import { useIDEStore } from '../store/useIDEStore';
import { Button } from '../ui';
import { announce } from '../utils/announce';
import { BOARD_LABEL } from './learnBoardWords';
import { learnLessonCatalog } from './learnLesson';

type Translate = ReturnType<typeof useT>['t'];

export interface LearnBoardCheckViewProps {
  readiness: BoardCheckReadiness;
  board: LearnerBoard | null;
  /** Signals of the scenario that the build does not have. */
  missing: readonly string[];
  steps: readonly BoardCheckStep[];
  /** The step the learner is on while the check records; -1 once every step was seen; null when no check runs. */
  step: number | null;
  /** The check is armed and waits for the learner to press Run in the toolbar. */
  waitingForRun?: boolean;
  outcome: BoardCheckOutcome | null;
  expectations: readonly ScenarioExpectation[];
  onRun(): void;
  onCancel(): void;
}

function signalAction(signal: BoardCheckSignal, t: Translate): string {
  if (signal.part === null || signal.channel === null) return t('learn.hardware.step.signal', { signal: signal.signal, value: String(signal.value) });
  const words = { part: signal.part, channel: signal.channel };
  if (signal.kind === 'button') return signal.value ? t('learn.hardware.step.press', words) : t('learn.hardware.step.release', words);
  return signal.value ? t('learn.hardware.step.on', words) : t('learn.hardware.step.off', words);
}
const stepAction = (step: BoardCheckStep, t: Translate): string => step.signals.map((signal) => signalAction(signal, t)).join(', ');
const boardName = (id: string, t: Translate): string => (isLearnerBoard(id) ? t(BOARD_LABEL[id]) : id);

function blockText(readiness: BoardCheckReadiness, board: LearnerBoard | null, t: Translate): string {
  if (readiness.ready) return t('learn.hardware.check.ready');
  if (readiness.block === 'wrong-board') return t('learn.hardware.check.block.wrong-board', { reported: boardName(readiness.reported ?? '', t), board: board ? boardName(board, t) : '' });
  return t(`learn.hardware.check.block.${readiness.block}` as 'learn.hardware.check.block.no-board');
}

function outcomeText(outcome: BoardCheckOutcome, t: Translate): string {
  if (outcome.kind === 'cancelled') return t('learn.hardware.check.cancelled');
  if (outcome.kind === 'stopped') return t('learn.hardware.check.stopped');
  const { passed, total } = outcome.record.assertions;
  return outcome.record.result === 'passed' ? t('learn.hardware.check.passed', { passed, total }) : t('learn.hardware.check.failed', { passed, total });
}

export function LearnBoardCheckView({ readiness, board, missing, steps, step, waitingForRun = false, outcome, expectations, onRun, onCancel }: LearnBoardCheckViewProps) {
  const { t, locale } = useT();
  const running = step !== null;
  const status = running
    ? waitingForRun ? t('learn.hardware.check.press-run') : step === -1 ? t('learn.hardware.check.waiting') : t('learn.hardware.check.step', { number: step + 1, total: steps.length, action: steps[step] ? stepAction(steps[step]!, t) : '' })
    : outcome ? outcomeText(outcome, t) : '';
  const failures = outcome?.kind === 'graded' ? outcome.record.failedAssertions : [];
  return (
    <section aria-labelledby="learn-board-check-title" data-learn-board-check-section className="border-t border-[var(--color-surface-700)] pt-3">
      <h4 id="learn-board-check-title" className="font-medium text-[var(--color-surface-100)]">{t('learn.hardware.check.title')}</h4>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" data-learn-board-check disabled={!readiness.ready || running} aria-describedby="learn-board-check-reason" onClick={onRun}>{t('learn.hardware.check.run')}</Button>
        {running && <Button variant="secondary" size="sm" data-learn-board-check-cancel onClick={onCancel}>{t('learn.hardware.check.cancel')}</Button>}
      </div>
      <p id="learn-board-check-reason" data-learn-board-check-reason className="mt-2">{blockText(readiness, board, t)}</p>
      {missing.length > 0 && <p role="alert" className="mt-1 text-[var(--color-accent-red)]">{t('learn.hardware.check.missing', { signals: missing.join(', ') })}</p>}
      {running && (
        <ol aria-label={t('learn.hardware.check.title')} className="mt-2 list-decimal space-y-0.5 pl-5">
          {steps.map((item, index) => <li key={index} aria-current={index === step ? 'step' : undefined} className={index === step ? 'font-medium text-[var(--color-surface-100)]' : undefined}>{stepAction(item, t)}</li>)}
        </ol>
      )}
      {status && <p role="status" data-learn-board-check-status className="mt-2">{status}</p>}
      {failures.length > 0 && (
        <ul data-learn-board-check-failures className="mt-2 space-y-1">
          {failures.map((failure) => (
            <li key={failure.index}>
              {describeFailure(failure, expectations[failure.index], locale)}
              {failure.trace && <> · <code className="break-all text-[var(--color-surface-400)]">{failure.trace.uri}</code></>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The check bound to the board setting, the build of the open project, the board session and the progress. */
export function LearnBoardCheck({ lessonId }: { lessonId: string }) {
  const { t, locale } = useT();
  const board = useLearnBoard((state) => state.board);
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  // The state of the session reaches the store; reading it here makes the check follow the learner's connect, deploy and run.
  useIDEStore((state) => state.connection.status);
  useIDEStore((state) => state.connection.plcState);
  const [step, setStep] = useState<number | null>(null);
  const [waitingForRun, setWaitingForRun] = useState(false);
  const programSha256 = useDeployedProgram((state) => state.sha256);
  const [outcome, setOutcome] = useState<BoardCheckOutcome | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const cancel = useRef<AbortController | null>(null);
  const entry = LESSON_INDEX.lessons.find((lesson) => lesson.id === lessonId);
  const scenario = learnLessonCatalog[locale].find((lesson) => lesson.id === lessonId)?.scenario as ScenarioFile | undefined;
  const view = boardSessionOf();
  const readiness = boardCheckReadiness(board, view, debugMap, scenario ?? null);
  const wiringBoard = board ? learnerBoardOf(board) ?? null : null;
  const steps = debugMap && wiringBoard && entry?.hardware && scenario ? boardCheckSteps(scenario, debugMap, wiringBoard, entry.hardware.wiring, locale) : [];

  const run = async (): Promise<void> => {
    if (!readiness.ready || !view || !debugMap || !entry?.hardware || !scenario || cancel.current) return;
    const { variables, missing: absent } = lessonWatchVariables(scenario, debugMap);
    setMissing(absent);
    if (absent.length > 0) return;
    const controller = new AbortController();
    cancel.current = controller;
    setOutcome(null);
    setStep(0);
    const result = await runBoardCheck({
      lessonId, lessonVersion: entry.version, scenario, scenarioSha256: entry.scenario.sha256, tolerances: entry.hardware.tolerances, debugMap, view, variables,
      now: () => performance.now(), wait: (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); }), cancel: controller.signal, time: () => new Date(),
      programSha256,
      onWaitingForRun: (waiting) => { setWaitingForRun(waiting); if (waiting) announce(t('learn.hardware.check.press-run')); },
      onStep: (next) => {
        setStep(next);
        announce(next === -1 ? t('learn.hardware.check.waiting') : t('learn.hardware.check.step', { number: next + 1, total: steps.length, action: steps[next] ? stepAction(steps[next]!, t) : '' }));
      },
    });
    cancel.current = null;
    setStep(null);
    setWaitingForRun(false);
    setOutcome(result);
    announce(outcomeText(result, t));
    if (result.kind === 'graded') void useLearnProgress.getState().recordGrade(result.record);
  };

  return (
    <LearnBoardCheckView
      readiness={readiness} board={board} missing={missing} steps={steps} step={step} waitingForRun={waitingForRun} outcome={outcome} expectations={scenario?.expectations ?? []}
      onRun={() => { void run(); }} onCancel={() => cancel.current?.abort()}
    />
  );
}
