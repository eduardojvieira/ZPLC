import { BookOpen, Copy, FlaskConical, Info, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { buildCourseView, trackSupport } from '../learn/course';
import { useLearnUi } from '../learn/learnUi';
import { useLearnProgress } from '../learn/progressState';
import { isFileSystemAccessSupported } from '../types';
import { useIDEStore } from '../store/useIDEStore';
import { useAppSettings } from '../store/useAppSettings';
import { useT, type MessageKey } from '../i18n';
import type { WorkspaceTestPresentation } from './workspaceTestPresentation';
import { describeFailure } from '../learn/gradeRecord';
import type { GradeRecord, LessonNote } from '../../electron/learnProgressModel';
import { useLessonCheck } from '../learn/useLessonCheck';
import { getFileContent } from '../utils/projectLoader';
import { gradeRecordedScenarioLesson, learnLessonCatalog, type LearnLessonGrade, type LearnLessonId, type LearnLocale } from './learnLesson';
import { announce } from '../utils/announce';
import { useGiveFocusBack } from '../hooks/useGiveFocusBack';
import { AlertDialog, Button, ToggleGroup } from '../ui';
import { LearnBoardLesson } from './LearnBoardLesson';

export function LearnPanel({ workspaceTestPresentation }: { workspaceTestPresentation?: WorkspaceTestPresentation }) {
  const { t, tn } = useT();
  const setActiveConsoleTab = useIDEStore((state) => state.setActiveConsoleTab);
  const projectOpenError = useIDEStore((state) => state.projectOpenError);
  const projectSession = useIDEStore((state) => state.projectSession);
  // What the learner did with a lesson (opened it, showed a hint or the solution) goes to the progress state, shared with the Learn home.
  const progress = useLearnProgress((state) => state.document);
  const progressLoaded = useLearnProgress((state) => state.loaded);
  const progressFailed = useLearnProgress((state) => state.failed);
  const note = (entry: LessonNote) => { void useLearnProgress.getState().note(entry); };
  useEffect(() => { if (!useLearnProgress.getState().loaded) void useLearnProgress.getState().load(); }, []);
  // The lesson language is the language of the application (UX-029, LRN-029): one setting, `auto` resolved from the system, changed here or in Preferences.
  const { locale }: { locale: LearnLocale } = useT();
  const updateSettings = useAppSettings((state) => state.update);
  const unlockAll = useAppSettings((state) => state.settings.unlockAllLessons);
  const hideSolutions = useAppSettings((state) => state.settings.hideSolutions);
  const setLocale = (language: LearnLocale) => updateSettings({ language });
  const view = buildCourseView(LESSON_INDEX, progress, { locale, unlockAll });
  const ordered = view.modules.flatMap((module) => module.lessons);
  const selected = useLearnUi((state) => state.selected);
  const select = useLearnUi((state) => state.select);
  // The passes of the course, as the course counts them: a hardware-only lesson is passed by its hardware check (LRN-024).
  const mastered = new Set(ordered.filter((candidate) => candidate.state === 'passed').map((candidate) => candidate.id));
  // The lesson shown: the one chosen here or in the home, else the last one worked on, else the first of the course.
  const last = progress?.last?.lessonId;
  const lessonId = (ordered.find((candidate) => candidate.id === selected) ?? ordered.find((candidate) => candidate.id === last) ?? ordered[0])?.id as LearnLessonId;
  const starting = useLearnUi((state) => state.starting);
  const workspace = useLearnUi((state) => state.workspace);
  const [startFailed, setStartFailed] = useState(false);
  const [confirm, setConfirm] = useState<'solution' | 'reset' | null>(null);
  const [resetStatus, setResetStatus] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const [shownHere, setShownHere] = useState<ReadonlySet<string>>(new Set());
  const lessons = learnLessonCatalog[locale];
  const lesson = lessons.find((candidate) => candidate.id === lessonId) ?? lessons[0]!;
  const lessonView = ordered.find((candidate) => candidate.id === lesson.id);
  const locked = lessonView?.state === 'locked';
  const folderAccess = isFileSystemAccessSupported();
  // A run recorded in Tests still grades where the host has no lesson check; on the desktop the lesson check grades (LRN-022).
  const grade = gradeRecordedScenarioLesson(lesson, workspaceTestPresentation);
  const lessonCheck = useLessonCheck((record: GradeRecord) => { void useLearnProgress.getState().recordGrade(record); });
  const checkAvailable = lessonCheck.available;
  const checked = lessonCheck.gradeOf(lesson.id);
  const shownGrade: LearnLessonGrade = checkAvailable ? checked ?? { kind: 'not-run' } : grade;
  const refusal = lessonCheck.refusal(lesson.id);
  const alreadyPassed = mastered.has(lesson.id);
  useEffect(() => {
    if (checkAvailable || grade.kind !== 'passed' || !progressLoaded || alreadyPassed || locked) return;
    // Where the host has no lesson check, a passed run of the recorded scenario is the only evidence; it passes the lesson once.
    void useLearnProgress.getState().markPassed(lesson.id);
  }, [checkAvailable, grade.kind, progressLoaded, alreadyPassed, locked, lesson.id]);
  const scenario = lesson.requiredScenario;
  const gradeCopy = shownGrade.kind === 'passed' ? { title: t('learn.grade.passed.title'), body: tn('learn.grade.passed.body', shownGrade.assertions, { scenario }) }
    : shownGrade.kind === 'failed' ? { title: t('learn.grade.failed.title'), body: tn('learn.grade.failed.body', shownGrade.assertions, { scenario }) }
      : shownGrade.kind === 'unrelated' ? { title: t('learn.grade.unrelated.title'), body: t('learn.grade.unrelated.body', { scenario }) }
        : shownGrade.kind === 'unavailable' ? { title: t('learn.grade.unavailable.title'), body: t('learn.grade.unavailable.body') }
          : shownGrade.kind === 'scenario-changed' ? { title: t('learn.grade.changed.title'), body: t('learn.grade.changed.body', { scenario }) }
            : checkAvailable ? { title: t('learn.grade.notChecked.title'), body: t('learn.grade.notChecked.body') }
              : { title: t('learn.grade.notRecorded.title'), body: t('learn.grade.notRecorded.body', { scenario }) };

  const workspaceOpen = workspace?.lessonId === lesson.id && workspace.session === projectSession;
  const startWorkspace = () => {
    if (starting || !folderAccess || locked) return;
    setStartFailed(false);
    void useLearnUi.getState().startLesson(lesson.id).then((opened) => { setStartFailed(!opened); });
  };
  const resetButton = useRef<HTMLButtonElement>(null);
  const resetStarted = useGiveFocusBack(resetStatus === 'working', resetButton);
  const restoreStarter = () => {
    setConfirm(null);
    setResetStatus('working');
    resetStarted();
    void useLearnUi.getState().restoreLesson(lesson.id).then((restored) => {
      setResetStatus(restored ? 'done' : 'failed');
      announce(t(restored ? 'learn.reset.done' : 'learn.reset.failed'));
    });
  };
  const showSolution = () => {
    setConfirm(null);
    setShownHere((previous) => new Set([...previous, lesson.id]));
    note({ lessonId: lesson.id, solution: true });
  };

  const refusalText = refusal
    ? t('learn.refusal', { reason: refusal.codes.join(', ') || refusal.reason })
    : lessonCheck.failed(lesson.id) ? t('learn.checkDidNotFinish') : '';
  // The manifest names the reference solution as `src/<file>`; the example loader keys files by their name under src.
  const solutionFile = lesson.solutionProgram.slice('src/'.length);
  const solutionText = /\.(st|il)$/i.test(solutionFile) ? getFileContent(lesson.referenceExampleId, solutionFile) : null;
  const solutionShown = progress?.lessons[lesson.id]?.solutionShown === true || shownHere.has(lesson.id);
  const testsLabel = t('learn.openTests');
  const masteryCopy = mastered.has(lesson.id)
    ? t('learn.previouslyCompleted')
    : t('learn.notCompleted');
  // A run on a board is labelled apart from the course pass, which is graded in simulation (LRN-024).
  const passedOnHardware = progress?.lessons[lesson.id]?.hardware != null;
  const hardwareCopy = passedOnHardware ? t('learn.hardware.lesson.passed') : trackSupport(LESSON_INDEX, lesson.id, 'hardware', locale).supported ? t('learn.hardware.lesson.notPassed') : '';

  return (
    <section aria-labelledby="learn-title" className="min-h-full p-3 font-sans text-sm text-[var(--color-surface-200)]">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="border-b border-[var(--color-surface-600)] pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="learn-title" className="flex items-center gap-2 text-base font-semibold text-[var(--color-surface-100)]"><BookOpen size={17} aria-hidden="true" />{lesson.title}</h2>
              <p className="mt-1 max-w-[68ch] leading-5 text-[var(--color-surface-300)]">{lesson.summary}</p>
              <ul aria-label={t('learn.learningObjectives')} className="mt-2 list-disc space-y-0.5 pl-5 text-xs leading-5 text-[var(--color-surface-300)]">
                {lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}
              </ul>
            </div>
            <ToggleGroup
              label={t('learn.lessonLanguage')}
              value={locale}
              onValueChange={(value) => setLocale(value as LearnLocale)}
              options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]}
            />
          </div>
          <ToggleGroup
            label={t('learn.lesson')}
            className="mt-3 flex-wrap"
            value={lesson.id}
            onValueChange={(id) => { select(id); setStartFailed(false); setResetStatus('idle'); note({ lessonId: id, started: true, last: true }); }}
            options={ordered.map((candidate) => ({ value: candidate.id, label: `${candidate.title} (${t(`learn.state.${candidate.state}` as MessageKey)})`, disabled: candidate.state === 'locked' || starting }))}
          />
          <p className="mt-3 break-words font-mono text-xs text-[var(--color-surface-400)]">{lesson.sourcePath} · {lesson.scenarioPath}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]">{t('learn.theStarterFailsThis')}</p>
          <p aria-label={t('learn.lessonProgress')} className="mt-2 text-xs text-[var(--color-surface-400)]">{masteryCopy} · {mastered.size}/{lessons.length}{hardwareCopy && <> · <span data-learn-hardware-state={passedOnHardware ? 'passed' : 'not-passed'}>{hardwareCopy}</span></>}</p>
          {locked && <p role="status" data-learn-locked className="mt-1 text-xs text-[var(--color-surface-300)]">{t('learn.lockedLesson', { lessons: (lessonView?.missing ?? []).map((id) => view.titles[id] ?? id).join(', ') })}</p>}
          {progressFailed && <p role="alert" className="mt-1 text-xs text-[var(--color-accent-red)]">{t('learn.home.progressFailed')}</p>}
        </header>

        <section data-learn-grade={shownGrade.kind} aria-label={t('learn.lessonEvidence')} className="border-y border-[var(--color-surface-600)] py-3">
          <div role="status" aria-live="polite" className="flex items-start gap-2">
            {shownGrade.kind === 'passed' ? <FlaskConical size={16} className="mt-0.5 shrink-0 text-[var(--color-accent-green)]" aria-hidden="true" /> : <Info size={16} className="mt-0.5 shrink-0 text-[var(--color-surface-300)]" aria-hidden="true" />}
            <div className="min-w-0">
              <h3 className="font-medium text-[var(--color-surface-100)]">{gradeCopy.title}</h3>
              <p className="mt-1 leading-5 text-[var(--color-surface-300)]">{gradeCopy.body}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]">{lesson.scope}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]"><span className="font-medium text-[var(--color-surface-200)]">{t('learn.faultToCorrect')}</span> {lesson.faultCases.join(' ')}</p>
              {lesson.authorScenarioIds.length > 0 && <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]"><span className="font-medium text-[var(--color-surface-200)]">{t('learn.includedRegressions')}</span> {lesson.authorScenarioIds.join(', ')}</p>}
              {shownGrade.kind === 'failed' && (
                <ul data-learn-failures aria-label={t('learn.failedAssertions')} className="mt-2 space-y-1 text-xs leading-5 text-[var(--color-surface-300)]">
                  {shownGrade.failures.map((failure) => (
                    <li key={failure.index}>
                      {describeFailure(failure, lesson.scenario.expectations[failure.index], locale)}
                      {failure.trace && <> · <code className="break-all text-[var(--color-surface-400)]">{failure.trace.uri}</code></>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <ol className="space-y-3" aria-label={t('learn.lessonSteps')}>
          {lesson.stages.map((stage) => (
            <li key={stage.title} className="border-b border-[var(--color-surface-700)] pb-3">
              <h3 className="font-medium text-[var(--color-surface-100)]">{stage.title}</h3>
              <p className="mt-1 leading-5 text-[var(--color-surface-300)]">{stage.body}</p>
              <details className="mt-2 text-xs text-[var(--color-surface-300)]">
                <summary aria-label={t('learn.showExpectedCheckpointFor', { stage: stage.title })} className="cursor-pointer select-none font-medium text-[var(--color-accent-blue)]">{t('learn.showExpectedCheckpoint')}</summary>
                <p className="mt-1 leading-5">{stage.checkpoint}</p>
              </details>
            </li>
          ))}
        </ol>

        <section aria-label={t('learn.hints')} className="border-b border-[var(--color-surface-700)] pb-3">
          {lesson.hints.map((hint, index) => (
            <details key={index} onToggle={(event) => { if (event.currentTarget.open) note({ lessonId: lesson.id, hint: index === 0 ? 1 : 2 }); }} className="mt-1 text-xs text-[var(--color-surface-300)]">
              <summary className="cursor-pointer select-none font-medium text-[var(--color-accent-blue)]">{t('learn.hint', { value: index + 1 })}</summary>
              <p className="mt-1 leading-5">{hint}</p>
            </details>
          ))}
          {hideSolutions
            ? <p data-learn-solutions-hidden className="mt-2 text-xs leading-5 text-[var(--color-surface-300)]">{t('learn.solutionsHidden')}</p>
            : solutionShown
            ? (
              <div className="mt-2 text-xs text-[var(--color-surface-300)]">
                <h3 className="font-medium text-[var(--color-surface-100)]">{t('learn.solution.shown')}</h3>
                {solutionText !== null
                  ? <pre data-learn-solution className="mt-1 overflow-x-auto bg-[var(--color-surface-800)] p-2 font-mono leading-5">{solutionText}</pre>
                  : <p className="mt-1 leading-5">{t('learn.theReferenceSolutionIs', { referenceExampleId: lesson.referenceExampleId })}</p>}
              </div>
            )
            : <Button variant="secondary" size="sm" className="mt-2" data-learn-show-solution onClick={() => setConfirm('solution')}>{t('learn.showTheReferenceSolution')}</Button>}
        </section>

        <LearnBoardLesson lessonId={lesson.id} />
        <section aria-label={t('learn.lessonActions')} className="border-t border-[var(--color-surface-600)] pt-3">
          <div className="flex flex-wrap gap-2">
            {workspaceOpen
              ? <Button ref={resetButton} variant="secondary" size="sm" data-learn-reset disabled={resetStatus === 'working'} onClick={() => setConfirm('reset')}><RotateCcw size={14} aria-hidden="true" />{t('learn.reset')}</Button>
              : <Button variant="primary" size="sm" data-learn-open-workspace onClick={startWorkspace} disabled={!folderAccess || starting || locked}><Copy size={14} aria-hidden="true" />{starting ? t('learn.workspacePreparing') : t('learn.openWorkspace')}</Button>}
            {checkAvailable && <Button variant="secondary" size="sm" data-learn-check onClick={() => { if (!lessonCheck.running(lesson.id)) void lessonCheck.run(lesson.id); }} disabled={!lessonCheck.canRun} aria-disabled={lessonCheck.running(lesson.id) || undefined}><FlaskConical size={14} aria-hidden="true" />{lessonCheck.running(lesson.id) ? (t('interlock.checking')) : (t('learn.check'))}</Button>}
            {checkAvailable && lessonCheck.running(lesson.id) && <Button variant="secondary" size="sm" onClick={lessonCheck.cancel}>{t('common.cancel')}</Button>}
            <Button variant="primary" size="sm" onClick={() => setActiveConsoleTab('tests')}><FlaskConical size={14} aria-hidden="true" />{testsLabel}</Button>
          </div>
          <p role="status" data-learn-workspace-status className="mt-2 text-xs text-[var(--color-surface-400)]">{!folderAccess ? t('welcome.folderAccessUnavailable') : starting ? t('learn.workspacePreparing') : resetStatus === 'done' ? t('learn.reset.done') : resetStatus === 'failed' ? t('learn.reset.failed') : workspaceOpen ? t('learn.workspaceOpen') : t('learn.workspaceClosed')}</p>
          {checkAvailable && <p role="status" data-learn-check-status className="mt-2 text-xs text-[var(--color-surface-400)]">{!lessonCheck.isProjectOpen ? (t('learn.openTheExerciseFolder')) : lessonCheck.unsaved ? (t('learn.saveYourChangesCtrl')) : refusalText}</p>}
          {startFailed && projectOpenError && <p role="alert" data-learn-copy-error className="mt-2 break-words text-xs text-[var(--color-accent-red)]">{projectOpenError}</p>}
        </section>
      </div>
      <AlertDialog open={confirm === 'solution'} title={t('learn.solution.title')} description={t('learn.solution.description')} actionLabel={t('learn.solution.action')} cancelLabel={t('learn.solution.cancel')} onAction={showSolution} onCancel={() => setConfirm(null)} />
      <AlertDialog open={confirm === 'reset'} title={t('learn.reset.title')} description={t('learn.reset.description')} actionLabel={t('learn.reset.action')} cancelLabel={t('learn.reset.cancel')} destructive onAction={restoreStarter} onCancel={() => setConfirm(null)} />
    </section>
  );
}
