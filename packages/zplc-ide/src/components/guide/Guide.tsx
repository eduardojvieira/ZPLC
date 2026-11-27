/**
 * The Guide (GDE-003): the lesson of the open lesson workspace, top to bottom: the header, one stage at a time, the result of the
 * last check, and the action bar fixed at the bottom edge. The state is what `LearnPanel` reads today; the lesson text is the generated
 * index's, unchanged.
 */
import { useEffect, useRef, useState } from 'react';
import { LESSON_INDEX } from '../../generated/lessonIndex';
import { buildCourseView, trackSupport } from '../../learn/course';
import { useLearnUi } from '../../learn/learnUi';
import { useLearnProgress } from '../../learn/progressState';
import { useGuideCheckCommand } from '../../commands/bind/guide';
import { useLessonCheck } from '../../learn/useLessonCheck';
import { AskAssistantButton } from '../agent/AskAssistantButton';
import { lessonIntent } from '../../store/useAssistantEntry';
import { useT } from '../../i18n';
import { useGiveFocusBack } from '../../hooks/useGiveFocusBack';
import { useAppSettings } from '../../store/useAppSettings';
import { useIDEStore } from '../../store/useIDEStore';
import { AlertDialog } from '../../ui';
import { announce } from '../../utils/announce';
import { getFileContent } from '../../utils/projectLoader';
import { isFileSystemAccessSupported } from '../../types';
import { visibleHints } from '../../../shared/lessonHints';
import type { GradeRecord, LessonNote } from '../../../shared/learnProgressModel';
import {
  gradeRecordedScenarioLesson,
  learnLessonCatalog,
  type LearnLessonGrade,
  type LearnLessonId,
  type LearnLocale,
} from '../learnLesson';
import { ConnectionIndicator } from '../ConnectionIndicator';
import { presentConnection } from '../connectionPresentation';
import { LearnBoardLesson } from '../LearnBoardLesson';
import type { WorkspaceTestPresentation } from '../workspaceTestPresentation';
import { GuideActionBar } from './GuideActionBar';
import { lessonNeedsComm } from '../../learn/commLimit';
import { GuideHeader } from './GuideHeader';
import { GuideResult } from './GuideResult';
import { GuideStages } from './GuideStages';

export function Guide({ workspaceTestPresentation }: { workspaceTestPresentation?: WorkspaceTestPresentation }) {
  const { t } = useT();
  const { locale }: { locale: LearnLocale } = useT();
  const setActiveConsoleTab = useIDEStore((state) => state.setActiveConsoleTab);
  const projectOpenError = useIDEStore((state) => state.projectOpenError);
  const projectSession = useIDEStore((state) => state.projectSession);
  const progress = useLearnProgress((state) => state.document);
  const progressLoaded = useLearnProgress((state) => state.loaded);
  const progressFailed = useLearnProgress((state) => state.failed);
  const note = (entry: LessonNote) => {
    void useLearnProgress.getState().note(entry);
  };
  useEffect(() => {
    if (!useLearnProgress.getState().loaded) void useLearnProgress.getState().load();
  }, []);
  const unlockAll = useAppSettings((state) => state.settings.unlockAllLessons);
  const hideSolutions = useAppSettings((state) => state.settings.hideSolutions);
  const view = buildCourseView(LESSON_INDEX, progress, { locale, unlockAll });
  const ordered = view.modules.flatMap((module) => module.lessons);
  const selected = useLearnUi((state) => state.selected);
  const mastered = new Set(ordered.filter((candidate) => candidate.state === 'passed').map((candidate) => candidate.id));
  const last = progress?.last?.lessonId;
  const lessonId = (
    ordered.find((candidate) => candidate.id === selected) ??
    ordered.find((candidate) => candidate.id === last) ??
    ordered[0]
  )?.id as LearnLessonId;
  const starting = useLearnUi((state) => state.starting);
  const workspace = useLearnUi((state) => state.workspace);
  const [confirm, setConfirm] = useState<'solution' | 'reset' | null>(null);
  const [resetStatus, setResetStatus] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const [shownHere, setShownHere] = useState<ReadonlySet<string>>(new Set());
  const lessons = learnLessonCatalog[locale];
  const lesson = lessons.find((candidate) => candidate.id === lessonId) ?? lessons[0]!;
  const lessonView = ordered.find((candidate) => candidate.id === lesson.id);
  const locked = lessonView?.state === 'locked';
  const lessonEntry = LESSON_INDEX.lessons.find((candidate) => candidate.id === lesson.id);
  const folderAccess = isFileSystemAccessSupported();
  const grade = gradeRecordedScenarioLesson(lesson, workspaceTestPresentation);
  // FLW-006: Check saves by the preference and runs; it never asks the learner to save first.
  const lessonCheck = useLessonCheck(
    (record: GradeRecord) => {
      void useLearnProgress.getState().recordGrade(record);
    },
    { save: 'per-preference' },
  );
  const checkAvailable = lessonCheck.available;
  const checked = lessonCheck.gradeOf(lesson.id);
  const shownGrade: LearnLessonGrade = checkAvailable ? (checked ?? { kind: 'not-run' }) : grade;
  const refusal = lessonCheck.refusal(lesson.id);
  const alreadyPassed = mastered.has(lesson.id);
  useEffect(() => {
    if (checkAvailable || grade.kind !== 'passed' || !progressLoaded || alreadyPassed || locked) return;
    void useLearnProgress.getState().markPassed(lesson.id);
  }, [checkAvailable, grade.kind, progressLoaded, alreadyPassed, locked, lesson.id]);
  const scenario = lesson.requiredScenario;

  // the button and the command `learn.check` are one function
  const runCheck = () => {
    if (!lessonCheck.running(lesson.id)) void lessonCheck.run(lesson.id);
  };
  useGuideCheckCommand(runCheck);
  const workspaceOpen = workspace?.lessonId === lesson.id && workspace.session === projectSession;
  const resetButton = useRef<HTMLButtonElement>(null);
  const resetStarted = useGiveFocusBack(resetStatus === 'working', resetButton);
  const restoreStarter = () => {
    setConfirm(null);
    setResetStatus('working');
    resetStarted();
    void useLearnUi
      .getState()
      .restoreLesson(lesson.id)
      .then((restored) => {
        setResetStatus(restored ? 'done' : 'failed');
        announce(t(restored ? 'learn.reset.done' : 'learn.reset.failed'));
      });
  };
  const showSolution = () => {
    setConfirm(null);
    setShownHere((previous) => new Set([...previous, lesson.id]));
    note({ lessonId: lesson.id, solution: true });
  };
  const declined = lessonCheck.declined(lesson.id);
  const refusalText = declined
    ? t(`u3Guide.check.${declined}` as 'u3Guide.check.cancelled')
    : refusal
      ? t('learn.refusal', { reason: refusal.codes.join(', ') || refusal.reason })
      : lessonCheck.failed(lesson.id)
        ? t('learn.checkDidNotFinish')
        : '';
  const startNext = async (id: string) => {
    if (starting || !folderAccess) return;
    setResetStatus('idle');
    await useLearnUi.getState().startLesson(id);
  };
  const solutionFile = lesson.solutionProgram.slice('src/'.length);
  const solutionText = /\.(st|il)$/i.test(solutionFile) ? getFileContent(lesson.referenceExampleId, solutionFile) : null;
  const solutionShown = progress?.lessons[lesson.id]?.solutionShown === true || shownHere.has(lesson.id);
  const masteryCopy = mastered.has(lesson.id) ? t('learn.previouslyCompleted') : t('learn.notCompleted');
  const passedOnHardware = progress?.lessons[lesson.id]?.hardware != null;
  const hardwareCopy = passedOnHardware
    ? t('learn.hardware.lesson.passed')
    : trackSupport(LESSON_INDEX, lesson.id, 'hardware', locale).supported
      ? t('learn.hardware.lesson.notPassed')
      : '';
  // R-G3: the place in the first path that holds the lesson, else in its module.
  const record = progress?.lessons[lesson.id]?.grade ?? null;
  const connectionStatus = useIDEStore((state) => state.connection.status);
  const boardLink = presentConnection(
    {
      mode: 'hardware',
      adapterType: 'serial',
      connected: connectionStatus === 'connected',
      connecting: connectionStatus === 'connecting',
      faulted: connectionStatus === 'error',
    },
    t,
  );
  const path = view.paths.find((candidate) => candidate.lessons.some((item) => item.id === lesson.id));
  const siblings = path?.lessons ?? view.modules.find((module) => module.id === lessonView?.module)?.lessons ?? ordered;
  const passedNow = alreadyPassed || shownGrade.kind === 'passed';
  // GDE-008: on the last lesson of a path there is nothing to offer; the course is the Learn activity's, one click away.
  const nextLesson = passedNow ? siblings[siblings.findIndex((item) => item.id === lesson.id) + 1] : undefined;
  const position = {
    n: siblings.findIndex((item) => item.id === lesson.id) + 1,
    total: siblings.length,
    ...(path || !lessonView ? {} : { module: lessonView.module }),
  };

  return (
    <section aria-labelledby="learn-title" className="flex h-full min-h-0 flex-col font-sans text-sm text-[var(--color-surface-200)]">
      <AlertDialog
        open={confirm === 'solution'}
        title={t('learn.solution.title')}
        description={t('learn.solution.description')}
        actionLabel={t('learn.solution.action')}
        cancelLabel={t('learn.solution.cancel')}
        onAction={showSolution}
        onCancel={() => setConfirm(null)}
      />
      <AlertDialog
        open={confirm === 'reset'}
        title={t('learn.reset.title')}
        description={t('learn.reset.description')}
        actionLabel={t('learn.reset.action')}
        cancelLabel={t('learn.reset.cancel')}
        destructive
        onAction={restoreStarter}
        onCancel={() => setConfirm(null)}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <GuideHeader title={lesson.title} position={position}>
          <p className="mt-1 max-w-[68ch] leading-5 text-[var(--color-surface-300)]">{lesson.summary}</p>
          <ul
            aria-label={t('learn.learningObjectives')}
            className="mt-2 list-disc space-y-0.5 pl-5 text-xs leading-5 text-[var(--color-surface-300)]"
          >
            {lesson.objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
          <p aria-label={t('learn.lessonProgress')} className="mt-2 text-xs text-[var(--color-surface-400)]">
            {masteryCopy} · {mastered.size}/{lessons.length}
            {hardwareCopy && (
              <>
                {' '}
                · <span data-learn-hardware-state={passedOnHardware ? 'passed' : 'not-passed'}>{hardwareCopy}</span>
              </>
            )}
          </p>
          {locked && (
            <p role="status" data-learn-locked className="mt-1 text-xs text-[var(--color-surface-300)]">
              {t('learn.lockedLesson', { lessons: (lessonView?.missing ?? []).map((id) => view.titles[id] ?? id).join(', ') })}
            </p>
          )}
          {window.electronAPI?.platform === 'win32' && lessonNeedsComm(lesson.id) && (
            <div
              role="note"
              data-guide-comm-limit
              className={
                'mt-2 max-w-[68ch] rounded border border-[var(--color-accent-yellow)] ' +
                'p-2 text-xs leading-5 text-[var(--color-surface-200)]'
              }
            >
              <p className="font-semibold">{t('u3Guide.commLimit.title')}</p>
              <p>{t('u3Guide.commLimit.body')}</p>
            </div>
          )}
          {progressFailed && (
            <p role="alert" className="mt-1 text-xs text-[var(--color-accent-red)]">
              {t('learn.home.progressFailed')}
            </p>
          )}
        </GuideHeader>

        <GuideStages key={lesson.id} stages={lesson.stages} />

        <section aria-label={t('learn.hints')} className="border-b border-[var(--color-surface-700)] pb-3">
          {visibleHints(lesson.hints, hideSolutions).map((hint, index) => (
            <details
              key={index}
              onToggle={(event) => {
                if (event.currentTarget.open) note({ lessonId: lesson.id, hint: index === 0 ? 1 : 2 });
              }}
              className="mt-1 text-xs text-[var(--color-surface-300)]"
            >
              <summary className="cursor-pointer select-none font-medium text-[var(--color-accent-blue)]">
                {t('learn.hint', { value: index + 1 })}
              </summary>
              <p className="mt-1 leading-5">{hint}</p>
            </details>
          ))}
          <AskAssistantButton
            label={t('assistant.askHint')}
            intent={() => lessonIntent(lesson.id, lesson.title)}
            className="mt-1 underline underline-offset-2"
          />
          {hideSolutions ? (
            <p data-learn-solutions-hidden className="mt-2 text-xs leading-5 text-[var(--color-surface-300)]">
              {t('learn.solutionsHidden')}
            </p>
          ) : (
            solutionShown && (
              <div className="mt-2 text-xs text-[var(--color-surface-300)]">
                <h3 className="font-medium text-[var(--color-surface-100)]">{t('learn.solution.shown')}</h3>
                {solutionText !== null ? (
                  <pre data-learn-solution className="mt-1 overflow-x-auto bg-[var(--color-surface-800)] p-2 font-mono leading-5">
                    {solutionText}
                  </pre>
                ) : (
                  <p className="mt-1 leading-5">{t('learn.theReferenceSolutionIs', { referenceExampleId: lesson.referenceExampleId })}</p>
                )}
              </div>
            )
          )}
        </section>

        <GuideResult grade={shownGrade} checkAvailable={checkAvailable} lesson={lesson} locale={locale} />

        <details data-guide-files className="border-b border-[var(--color-surface-700)] pb-3 text-xs text-[var(--color-surface-400)]">
          <summary className="cursor-pointer select-none font-medium text-[var(--color-accent-blue)]">{t('u3Guide.files.title')}</summary>
          <p className="mt-1 break-words font-mono">
            {lesson.sourcePath} · {lesson.scenarioPath}
          </p>
          <p className="mt-1 break-words font-mono">{t('u3Guide.files.scenario', { scenario })}</p>
          <p className="mt-1 leading-5">{t('learn.theStarterFailsThis')}</p>
          <p className="mt-1 leading-5">
            {record ? t('u3Guide.files.record', { result: record.result, time: record.time }) : t('u3Guide.files.noRecord')}
          </p>
        </details>
        {lessonEntry?.hardware && (
          <details data-guide-board className="border-b border-[var(--color-surface-700)] pb-3">
            <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2 font-medium text-[var(--color-accent-blue)]">
              {t('learn.hardware.lesson.title')}
              <ConnectionIndicator indicator={boardLink} />
            </summary>
            <LearnBoardLesson lessonId={lesson.id} />
          </details>
        )}

        <p role="status" data-learn-workspace-status className="text-xs text-[var(--color-surface-400)]">
          {!folderAccess
            ? t('welcome.folderAccessUnavailable')
            : starting
              ? t('learn.workspacePreparing')
              : resetStatus === 'done'
                ? t('learn.reset.done')
                : resetStatus === 'failed'
                  ? t('learn.reset.failed')
                  : workspaceOpen
                    ? t('learn.workspaceOpen')
                    : t('learn.workspaceClosed')}
        </p>
        {checkAvailable && (
          <p role="status" data-learn-check-status className="text-xs text-[var(--color-surface-400)]">
            {!lessonCheck.isProjectOpen ? t('learn.openTheExerciseFolder') : refusalText}
          </p>
        )}
        {projectOpenError && resetStatus === 'failed' && (
          <p role="alert" data-learn-copy-error className="break-words text-xs text-[var(--color-accent-red)]">
            {projectOpenError}
          </p>
        )}
      </div>

      <GuideActionBar
        check={{
          available: checkAvailable,
          running: lessonCheck.running(lesson.id),
          canRun: lessonCheck.canRun,
          onCheck: runCheck,
          onCancel: lessonCheck.cancel,
        }}
        onOpenTests={() => setActiveConsoleTab('tests')}
        resetRef={resetButton}
        reset={{ enabled: workspaceOpen, working: resetStatus === 'working', onReset: () => setConfirm('reset') }}
        onReadAgain={lessonEntry?.reading ? () => useLearnUi.getState().openReading(lesson.id) : null}
        next={
          nextLesson
            ? { title: nextLesson.title, disabled: nextLesson.state === 'locked' || starting, onNext: () => void startNext(nextLesson.id) }
            : null
        }
        onSolution={hideSolutions || solutionShown ? null : () => setConfirm('solution')}
      />
    </section>
  );
}
