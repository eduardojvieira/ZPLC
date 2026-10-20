/**
 * The Learn home page (LRN-001, LRN-002, LRN-005, LRN-011): the course as a page of its own, over props only. It reads nothing but
 * what it is given, so it renders with no project, no network and no store; `LearnHome.tsx` binds it to the stores.
 */
import { BookOpen, Circle, CircleCheck, CircleDot, Lock, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useT, type MessageKey } from '../i18n';
import { trackSupport, type CourseLessonView, type CourseModuleView, type CourseView, type LessonState } from '../learn/course';
import type { LessonIndex, LessonLocale } from '../learn/lessonPackage';
import type { TransferStatus } from '../learn/progressState';
import { Button, FileInput, Switch, cx } from '../ui';

const STATE_ICON: Record<LessonState, ReactNode> = {
  locked: <Lock size={14} aria-hidden="true" />,
  available: <Circle size={14} aria-hidden="true" />,
  'in-progress': <CircleDot size={14} aria-hidden="true" />,
  passed: <CircleCheck size={14} aria-hidden="true" />,
};

export interface LearnHomeViewProps {
  view: CourseView;
  index: LessonIndex;
  locale: LessonLocale;
  continueId: string | null;
  /** The learner has not started any lesson: Continue says "Start the course". */
  fresh: boolean;
  loaded: boolean;
  failed: boolean;
  unlockAll: boolean;
  /** The classroom setting: reference solutions are not offered (LRN-033). */
  hideSolutions: boolean;
  folderAccess: boolean;
  busy: boolean;
  transfer: TransferStatus;
  /** Why the last lesson could not be started, when it could not. */
  error?: string | null;
  onUnlockAll(on: boolean): void;
  onHideSolutions(on: boolean): void;
  onStart(id: string): void;
  onClose(): void;
  onExport(): void;
  onImportFile(file: File): void;
}

export function LearnHomeView(props: LearnHomeViewProps) {
  const { view, index, locale, continueId, fresh, loaded, failed, unlockAll, hideSolutions, folderAccess, busy, transfer, error, onUnlockAll, onHideSolutions, onStart, onClose, onExport, onImportFile } = props;
  const { t } = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  // The page takes the keyboard when it opens (UX-025); Escape closes it (bound by `LearnHome`, which owns the state).
  useEffect(() => { heading.current?.focus(); }, []);
  const continueTitle = continueId ? view.titles[continueId] ?? '' : '';
  const levelText = (level: CourseModuleView['level']) => t(`learn.level.${level}` as MessageKey);
  const moduleMeta = (module: CourseModuleView): string => {
    const level = levelText(module.level);
    if (module.lessons.length === 0) return module.requires === null ? t('learn.home.moduleMetaEmptyFirst', { level }) : t('learn.home.moduleMetaEmpty', { level, requires: module.requires });
    return module.requires === null ? t('learn.home.moduleMetaFirst', { level, minutes: module.estimatedMinutes }) : t('learn.home.moduleMeta', { level, requires: module.requires, minutes: module.estimatedMinutes });
  };
  const transferText = (): string => {
    if (transfer === 'idle') return '';
    if (transfer === 'exported') return t('learn.progressExported');
    if (transfer === 'imported') return t('learn.progressImportedAndMerged');
    if (transfer.error === 'failed') return t('learn.progressCouldNotBe');
    if (transfer.error === 'unknown-version') return transfer.version === null ? t('learn.home.transfer.unknown-version-unnumbered') : t('learn.home.transfer.unknown-version', { version: transfer.version });
    return t(`learn.home.transfer.${transfer.error}` as MessageKey);
  };
  const lessonNotes = (lesson: CourseLessonView): ReactNode => {
    const supported = view.tracks.filter((track) => trackSupport(index, lesson.id, track.id, locale).supported);
    return (
      <>
        <p className="mt-1 text-xs leading-5 text-[var(--color-surface-300)]">{t('learn.home.tracksSupported', { tracks: supported.map((track) => track.title).join(', ') })}</p>
        {view.tracks.map((track) => {
          const support = trackSupport(index, lesson.id, track.id, locale);
          return support.supported ? null : <p key={track.id} className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]">{t('learn.home.trackUnsupported', { track: track.title, reason: support.reason, instead: support.instead })}</p>;
        })}
      </>
    );
  };
  const actionFor = (lesson: CourseLessonView) => {
    const label = lesson.state === 'passed' ? t('learn.home.review') : lesson.state === 'in-progress' ? t('learn.home.resume') : t('learn.home.start');
    const full = lesson.state === 'passed' ? t('learn.home.reviewLesson', { title: lesson.title }) : lesson.state === 'in-progress' ? t('learn.home.resumeLesson', { title: lesson.title }) : t('learn.home.startLesson', { title: lesson.title });
    return (
      <Button variant={lesson.state === 'passed' ? 'secondary' : 'primary'} size="sm" aria-label={full} data-learn-start={lesson.id} disabled={lesson.state === 'locked' || busy || !folderAccess} onClick={() => onStart(lesson.id)}>{label}</Button>
    );
  };

  return (
    <section aria-labelledby="learn-home-title" data-learn-home className="h-full min-h-0 overflow-y-auto bg-[var(--color-surface-900)] px-4 py-6 font-sans text-sm text-[var(--color-surface-200)]">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-surface-600)] pb-4">
          <div className="min-w-0">
            <h1 id="learn-home-title" ref={heading} tabIndex={-1} className="flex items-center gap-2 text-xl font-semibold text-[var(--color-surface-100)]"><BookOpen size={20} aria-hidden="true" />{t('learn.home.title')}</h1>
            <p className="mt-1 max-w-[68ch] leading-5 text-[var(--color-surface-300)]">{t('learn.home.intro')}</p>
            <p aria-label={t('learn.lessonProgress')} className="mt-2 text-xs text-[var(--color-surface-400)]">{loaded ? t('learn.home.progress', { passed: view.passed, total: view.total }) : t('learn.home.loading')}</p>
          </div>
          <Button variant="secondary" size="sm" data-learn-close onClick={onClose}><X size={14} aria-hidden="true" />{t('learn.home.close')}</Button>
        </div>

        {failed && <p role="alert" className="text-xs text-[var(--color-accent-red)]">{t('learn.home.progressFailed')}</p>}
        {!folderAccess && <p role="status" className="text-xs text-[var(--color-surface-300)]">{t('learn.home.folderUnavailable')}</p>}
        {error && <p role="alert" data-learn-start-error className="break-words text-xs text-[var(--color-accent-red)]">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          {continueId
            ? <Button variant="primary" data-learn-continue disabled={busy || !folderAccess || !loaded} onClick={() => onStart(continueId)}>{fresh ? t('learn.home.continue.fresh', { title: continueTitle }) : t('learn.home.continue.resume', { title: continueTitle })}</Button>
            : <p role="status" className="font-medium text-[var(--color-surface-100)]">{loaded ? t('learn.home.continue.done') : ''}</p>}
        </div>

        <section aria-labelledby="learn-order-title">
          <h2 id="learn-order-title" className="font-semibold text-[var(--color-surface-100)]">{t('learn.home.whyOrder')}</h2>
          <p data-learn-rationale className="mt-1 max-w-[68ch] leading-5 text-[var(--color-surface-300)]">{view.rationale}</p>
        </section>

        <section aria-labelledby="learn-tracks-title">
          <h2 id="learn-tracks-title" className="font-semibold text-[var(--color-surface-100)]">{t('learn.home.tracks')}</h2>
          <ul className="mt-2 space-y-1">
            {view.tracks.map((track) => <li key={track.id} data-learn-track={track.id} className="leading-5"><span className="font-medium text-[var(--color-surface-100)]">{track.title}.</span> <span className="text-[var(--color-surface-300)]">{track.summary}</span></li>)}
          </ul>
        </section>

        <section aria-labelledby="learn-progress-title" className="space-y-2">
          <h2 id="learn-progress-title" className="font-semibold text-[var(--color-surface-100)]">{t('learn.home.transfer')}</h2>
          <Switch label={t('learn.home.unlockAll')} hint={t('learn.home.unlockAllHint')} data-learn-unlock-all checked={unlockAll} onChange={(event) => onUnlockAll(event.currentTarget.checked)} />
          <Switch label={t('learn.home.hideSolutions')} hint={t('learn.home.hideSolutionsHint')} data-learn-hide-solutions checked={hideSolutions} onChange={(event) => onHideSolutions(event.currentTarget.checked)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" data-learn-export disabled={!loaded} onClick={onExport}>{t('learn.exportProgress')}</Button>
            <Button variant="secondary" size="sm" data-learn-import disabled={!loaded} onClick={() => importRef.current?.click()}>{t('learn.importProgress')}</Button>
            <FileInput ref={importRef} accept="application/json,.json" label={t('learn.selectProgressToImport')} data-learn-import-file onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) onImportFile(file); }} />
          </div>
          <p role="status" aria-live="polite" data-learn-transfer className={cx('text-xs', typeof transfer === 'object' ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-surface-400)]')}>{transferText()}</p>
        </section>

        <section aria-labelledby="learn-modules-title">
          <h2 id="learn-modules-title" className="font-semibold text-[var(--color-surface-100)]">{t('learn.home.modules')}</h2>
          <ol className="mt-2 space-y-4">
            {view.modules.map((module) => (
              <li key={module.id} data-learn-module={module.id} className="border-b border-[var(--color-surface-700)] pb-4">
                <h3 className="font-medium text-[var(--color-surface-100)]">{t('learn.home.module', { number: module.id, title: module.title })}</h3>
                <p className="mt-1 text-xs text-[var(--color-surface-400)]">{moduleMeta(module)}</p>
                <p data-learn-module-why={module.id} className="mt-1 max-w-[68ch] text-xs leading-5 text-[var(--color-surface-300)]">{module.why}</p>
                {module.lessons.length === 0
                  ? <p className="mt-2 text-xs text-[var(--color-surface-400)]">{t('learn.home.moduleEmpty')}</p>
                  : (
                    <>
                      <details className="mt-2 text-xs text-[var(--color-surface-300)]">
                        <summary className="cursor-pointer select-none font-medium text-[var(--color-accent-blue)]">{t('learn.home.objectives')}</summary>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 leading-5">{module.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
                      </details>
                      <ul aria-label={t('learn.home.lessons')} className="mt-2 space-y-2">
                        {module.lessons.map((lesson) => (
                          <li key={lesson.id} data-learn-lesson={lesson.id} data-state={lesson.state} className="flex flex-wrap items-start justify-between gap-2 rounded border border-[var(--color-surface-700)] p-2">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-medium text-[var(--color-surface-100)]">{STATE_ICON[lesson.state]}{lesson.title}<span className="text-xs font-normal text-[var(--color-surface-300)]">{t(`learn.state.${lesson.state}` as MessageKey)}</span></p>
                              <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]">{t('learn.home.lessonMeta', { languages: lesson.languages.join(', '), minutes: lesson.estimatedMinutes })}</p>
                              {lesson.state === 'locked' && <p className="mt-1 text-xs leading-5 text-[var(--color-surface-300)]">{t('learn.home.lockedBecause', { lessons: lesson.missing.map((id) => view.titles[id] ?? id).join(', ') })}</p>}
                              {lessonNotes(lesson)}
                            </div>
                            {actionFor(lesson)}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
