import { BookOpen, Copy, FlaskConical, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isFileSystemAccessSupported } from '../types';
import { useIDEStore } from '../store/useIDEStore';
import { useAppSettings } from '../store/useAppSettings';
import { useT } from '../i18n';
import type { WorkspaceTestPresentation } from './workspaceTestPresentation';
import { describeFailure } from '../learn/gradeRecord';
import { LEARN_PROGRESS_MAX_BYTES, passedLessonIds, type GradeRecord, type LessonNote } from '../../electron/learnProgressModel';
import { exportProgress, importProgress, noteLesson, readProgress, recordGrade } from '../learn/progressClient';
import { useLessonCheck } from '../learn/useLessonCheck';
import { getFileContent } from '../utils/projectLoader';
import { gradeRecordedScenarioLesson, learnLessonCatalog, parseLearnMasteryImport, readLearnMastery, recordLearnMastery, replaceLearnMastery, serializeLearnMastery, type LearnLessonGrade, type LearnLessonId, type LearnLocale } from './learnLesson';
import { Button, FileInput, ToggleGroup } from '../ui';

export function LearnPanel({ workspaceTestPresentation }: { workspaceTestPresentation?: WorkspaceTestPresentation }) {
  const { t, tn } = useT();
  const copyExampleProjectToFolder = useIDEStore((state) => state.copyExampleProjectToFolder);
  const setActiveConsoleTab = useIDEStore((state) => state.setActiveConsoleTab);
  const projectOpenError = useIDEStore((state) => state.projectOpenError);
  const desktopProgress = window.electronAPI?.learnProgress;
  // What the learner did with a lesson (opened it, showed a hint or the solution) goes to the progress store of the main process.
  const note = (entry: LessonNote) => { if (desktopProgress) void noteLesson(desktopProgress, entry); };
  // The lesson language is the language of the application (UX-029, LRN-029): one setting, `auto` resolved from the system, changed here or in Preferences.
  const { locale }: { locale: LearnLocale } = useT();
  const updateSettings = useAppSettings((state) => state.update);
  const setLocale = (language: LearnLocale) => updateSettings({ language });
  const [lessonId, setLessonId] = useState<LearnLessonId>('motor-start-stop-safe');
  const [mastered, setMastered] = useState<ReadonlySet<LearnLessonId>>(() => desktopProgress ? new Set() : readLearnMastery());
  const [hydrated, setHydrated] = useState(!desktopProgress);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const [masteryStatus, setMasteryStatus] = useState<'idle' | 'exported' | 'imported' | 'error'>('idle');
  const copyingRef = useRef(false);
  const chosenRef = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const lessons = learnLessonCatalog[locale];
  const lesson = lessons.find((candidate) => candidate.id === lessonId) ?? lessons[0]!;
  const folderAccess = isFileSystemAccessSupported();
  // A run recorded in Tests still grades where the host has no lesson check; on the desktop the lesson check grades (LRN-022).
  const grade = gradeRecordedScenarioLesson(lesson, workspaceTestPresentation);
  const lessonCheck = useLessonCheck((record: GradeRecord) => {
    if (!desktopProgress) return;
    void recordGrade(desktopProgress, record).then((document) => {
      if (!document) { setMasteryStatus('error'); return; }
      const known = new Set<string>(lessons.map(({ id }) => id));
      setMastered(new Set(passedLessonIds(document).filter((id) => known.has(id)) as LearnLessonId[]));
    });
  });
  const checkAvailable = lessonCheck.available;
  const checked = lessonCheck.gradeOf(lesson.id);
  const shownGrade: LearnLessonGrade = checkAvailable ? checked ?? { kind: 'not-run' } : grade;
  const refusal = lessonCheck.refusal(lesson.id);
  useEffect(() => {
    if (!desktopProgress) return;
    let active = true;
    void desktopProgress.read().then((ids) => { if (active) { setMastered((current) => parseLearnMasteryImport(serializeLearnMastery(new Set([...current, ...(ids as LearnLessonId[])]))) ?? current); setHydrated(true); } }).catch(() => { if (active) { setMasteryStatus('error'); setHydrated(true); } });
    // The lesson the learner had open last time, unless they have already chosen one in this window.
    void readProgress(desktopProgress).then((document) => {
      const last = document?.last?.lessonId;
      if (active && !chosenRef.current && last && learnLessonCatalog.en.some(({ id }) => id === last)) setLessonId(last as LearnLessonId);
    });
    return () => { active = false; };
  }, [desktopProgress]);
  useEffect(() => {
    if (checkAvailable) return;
    if (grade.kind !== 'passed' || !hydrated) return;
    // A passed grade is the sole persistence event; the helper returns the prior state otherwise.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizes durable mastery with the current grade.
    setMastered((previous) => {
      if (!desktopProgress) return recordLearnMastery(lesson.id, { kind: 'passed', assertions: 0 }, previous);
      if (previous.has(lesson.id)) return previous;
      const next = parseLearnMasteryImport(serializeLearnMastery(new Set([...previous, lesson.id])));
      if (!next) { setMasteryStatus('error'); return previous; }
      void desktopProgress.merge([...next]).then((ids) => setMastered(new Set(ids as LearnLessonId[]))).catch(() => setMasteryStatus('error'));
      return previous;
    });
  }, [checkAvailable, desktopProgress, grade.kind, hydrated, lesson.id]);
  const scenario = lesson.requiredScenario;
  const gradeCopy = shownGrade.kind === 'passed' ? { title: t('learn.grade.passed.title'), body: tn('learn.grade.passed.body', shownGrade.assertions, { scenario }) }
    : shownGrade.kind === 'failed' ? { title: t('learn.grade.failed.title'), body: tn('learn.grade.failed.body', shownGrade.assertions, { scenario }) }
      : shownGrade.kind === 'unrelated' ? { title: t('learn.grade.unrelated.title'), body: t('learn.grade.unrelated.body', { scenario }) }
        : shownGrade.kind === 'unavailable' ? { title: t('learn.grade.unavailable.title'), body: t('learn.grade.unavailable.body') }
          : shownGrade.kind === 'scenario-changed' ? { title: t('learn.grade.changed.title'), body: t('learn.grade.changed.body', { scenario }) }
            : checkAvailable ? { title: t('learn.grade.notChecked.title'), body: t('learn.grade.notChecked.body') }
              : { title: t('learn.grade.notRecorded.title'), body: t('learn.grade.notRecorded.body', { scenario }) };

  const copyExample = () => {
    if (copyingRef.current || !folderAccess) return;
    copyingRef.current = true;
    setCopyStatus('copying');
    void copyExampleProjectToFolder(lesson.starterExampleId).then((copied) => {
      // A cancelled dialog leaves no error in the store, so it shows nothing; a failure is explained below.
      if (copied) setCopyStatus('copied');
      else if (useIDEStore.getState().projectOpenError) setCopyStatus('failed');
    }).finally(() => {
      copyingRef.current = false;
      setCopyStatus((status) => status === 'copying' ? 'idle' : status);
    });
  };

  const exportMastery = async () => {
    try {
      // On the desktop the file is the whole progress document (grades, hints, last lesson); elsewhere it is the passed lessons.
      const text = desktopProgress ? await exportProgress(desktopProgress) : serializeLearnMastery(mastered);
      if (text === undefined) { setMasteryStatus('error'); return; }
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = desktopProgress ? 'zplc-learn-progress.v2.json' : 'zplc-learn-mastery.v1.json'; document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setMasteryStatus('exported');
    } catch { setMasteryStatus('error'); }
  };

  // Catches its own errors and shows them as the import status; the input starts it with `void`.
  const importMastery = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (desktopProgress && !hydrated) return;
    const input = event.currentTarget; const file = input.files?.[0]; input.value = '';
    if (desktopProgress && file && file.size <= LEARN_PROGRESS_MAX_BYTES) {
      // The main process validates the file and merges it, newest grade first, keeping lessons this build does not know.
      try {
        const merged = await importProgress(desktopProgress, await file.text());
        if (!merged) { setMasteryStatus('error'); return; }
        const known = new Set<string>(lessons.map(({ id }) => id));
        setMastered(new Set(passedLessonIds(merged.progress).filter((id) => known.has(id)) as LearnLessonId[]));
        setMasteryStatus('imported');
      } catch { setMasteryStatus('error'); }
      return;
    }
    if (!file || file.size > 4096) { if (file) setMasteryStatus('error'); return; }
    try {
      const incoming = parseLearnMasteryImport(await file.text());
      if (!incoming) { setMasteryStatus('error'); return; }
      const merged = parseLearnMasteryImport(serializeLearnMastery(new Set([...mastered, ...incoming])));
      if (!merged) { setMasteryStatus('error'); return; }
      const next = desktopProgress ? merged : replaceLearnMastery(merged, mastered);
      if (next === mastered) { setMasteryStatus('error'); return; }
      if (desktopProgress) {
        const saved = await desktopProgress.merge([...next]);
        setMastered(new Set(saved as LearnLessonId[]));
      } else setMastered(next);
      setMasteryStatus('imported');
    } catch { setMasteryStatus('error'); }
  };

  const refusalText = refusal
    ? t('learn.refusal', { reason: refusal.codes.join(', ') || refusal.reason })
    : lessonCheck.failed(lesson.id) ? t('learn.checkDidNotFinish') : '';
  // The manifest names the reference solution as `src/<file>`; the example loader keys files by their name under src.
  const solutionFile = lesson.solutionProgram.slice('src/'.length);
  const solutionText = /\.(st|il)$/i.test(solutionFile) ? getFileContent(lesson.referenceExampleId, solutionFile) : null;
  const copyLabel = t('learn.copyExercise', { title: lesson.title });
  const testsLabel = t('learn.openTests');
  const masteryCopy = mastered.has(lesson.id)
    ? t('learn.previouslyCompleted')
    : t('learn.notCompleted');

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
            value={lessonId}
            onValueChange={(id) => { chosenRef.current = true; setLessonId(id as LearnLessonId); setCopyStatus('idle'); note({ lessonId: id as LearnLessonId, started: true, last: true }); }}
            options={lessons.map((candidate) => ({ value: candidate.id, label: candidate.title, disabled: copyStatus === 'copying' }))}
          />
          <p className="mt-3 break-words font-mono text-xs text-[var(--color-surface-400)]">{lesson.sourcePath} · {lesson.scenarioPath}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]">{t('learn.theStarterFailsThis')}</p>
          <p aria-label={t('learn.lessonProgress')} className="mt-2 text-xs text-[var(--color-surface-400)]">{masteryCopy} · {mastered.size}/{lessons.length}</p>
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
                <summary className="cursor-pointer select-none font-medium text-[var(--color-accent-blue)]">{t('learn.showExpectedCheckpoint')}</summary>
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
          <details onToggle={(event) => { if (event.currentTarget.open) note({ lessonId: lesson.id, solution: true }); }} className="mt-1 text-xs text-[var(--color-surface-300)]">
            <summary className="cursor-pointer select-none font-medium text-[var(--color-accent-blue)]">{t('learn.showTheReferenceSolution')}</summary>
            {solutionText !== null
              ? <pre data-learn-solution className="mt-1 overflow-x-auto bg-[var(--color-surface-800)] p-2 font-mono leading-5">{solutionText}</pre>
              : <p className="mt-1 leading-5">{t('learn.theReferenceSolutionIs', { referenceExampleId: lesson.referenceExampleId })}</p>}
          </details>
        </section>

        <section aria-label={t('learn.lessonActions')} className="border-t border-[var(--color-surface-600)] pt-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={copyExample} disabled={!folderAccess || copyStatus === 'copying'}><Copy size={14} aria-hidden="true" />{copyStatus === 'copying' ? (t('learn.copying')) : copyLabel}</Button>
            {checkAvailable && <Button variant="secondary" size="sm" data-learn-check onClick={() => { void lessonCheck.run(lesson.id); }} disabled={!lessonCheck.canRun || lessonCheck.running(lesson.id)}><FlaskConical size={14} aria-hidden="true" />{lessonCheck.running(lesson.id) ? (t('interlock.checking')) : (t('learn.check'))}</Button>}
            {checkAvailable && lessonCheck.running(lesson.id) && <Button variant="secondary" size="sm" onClick={lessonCheck.cancel}>{t('common.cancel')}</Button>}
            <Button variant="primary" size="sm" onClick={() => setActiveConsoleTab('tests')}><FlaskConical size={14} aria-hidden="true" />{testsLabel}</Button>
            <Button variant="secondary" size="sm" disabled={Boolean(desktopProgress && !hydrated)} onClick={() => { void exportMastery(); }}>{t('learn.exportProgress')}</Button>
            <Button variant="secondary" size="sm" disabled={Boolean(desktopProgress && !hydrated)} onClick={() => importRef.current?.click()}>{t('learn.importProgress')}</Button>
            <FileInput ref={importRef} accept="application/json,.json" label={t('learn.selectProgressToImport')} onChange={(event) => { void importMastery(event); }} />
          </div>
          <p role="status" className="mt-2 text-xs text-[var(--color-surface-400)]">{!folderAccess ? (t('welcome.folderAccessUnavailable')) : copyStatus === 'copying' ? (t('learn.copyingTheExampleInto')) : copyStatus === 'copied' ? (t('learn.exampleCopied')) : (t('learn.chooseTheSavedZplc', { requiredScenario: lesson.requiredScenario }))}</p>
          {checkAvailable && <p role="status" data-learn-check-status className="mt-2 text-xs text-[var(--color-surface-400)]">{!lessonCheck.isProjectOpen ? (t('learn.openTheExerciseFolder')) : lessonCheck.unsaved ? (t('learn.saveYourChangesCtrl')) : refusalText}</p>}
          {copyStatus === 'failed' && projectOpenError && <p role="alert" data-learn-copy-error className="mt-2 break-words text-xs text-[var(--color-accent-red)]">{projectOpenError}</p>}
          <p role="status" aria-live="polite" className="mt-2 text-xs text-[var(--color-surface-400)]">{masteryStatus === 'exported' ? (t('learn.progressExported')) : masteryStatus === 'imported' ? (t('learn.progressImportedAndMerged')) : masteryStatus === 'error' ? (t('learn.progressCouldNotBe')) : ''}</p>
        </section>
      </div>
    </section>
  );
}
