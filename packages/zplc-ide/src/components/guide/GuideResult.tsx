/**
 * The result of the last check in the Guide (GDE-004): the verdict as one sentence, then the failed expectations with their time,
 * the expected and the observed value (LRN-026). The Tests surface, the results panel and the Trace tab stay closed.
 */
import { FlaskConical, Info } from 'lucide-react';
import { describeFailure } from '../../learn/gradeRecord';
import { useT } from '../../i18n';
import type { LearnLessonGrade, LearnLocale, learnLessonCatalog } from '../learnLesson';
import { TestVerdict } from '../TestVerdict';

export interface GuideResultProps {
  grade: LearnLessonGrade;
  /** Whether the host grades by the lesson check; without it the grade is the Tests tab's, as in 2.0. */
  checkAvailable: boolean;
  lesson: (typeof learnLessonCatalog)[LearnLocale][number];
  locale: LearnLocale;
}

export function GuideResult({ grade, checkAvailable, lesson, locale }: GuideResultProps) {
  const { t, tn } = useT();
  const scenario = lesson.requiredScenario;
  const copy =
    grade.kind === 'passed'
      ? { title: t('learn.grade.passed.title'), body: tn('learn.grade.passed.body', grade.assertions, { scenario }) }
      : grade.kind === 'failed'
        ? { title: t('learn.grade.failed.title'), body: tn('learn.grade.failed.body', grade.assertions, { scenario }) }
        : grade.kind === 'unrelated'
          ? { title: t('learn.grade.unrelated.title'), body: t('learn.grade.unrelated.body', { scenario }) }
          : grade.kind === 'unavailable'
            ? { title: t('learn.grade.unavailable.title'), body: t('learn.grade.unavailable.body') }
            : grade.kind === 'scenario-changed'
              ? { title: t('learn.grade.changed.title'), body: t('learn.grade.changed.body', { scenario }) }
              : checkAvailable
                ? { title: t('learn.grade.notChecked.title'), body: t('learn.grade.notChecked.body') }
                : { title: t('learn.grade.notRecorded.title'), body: t('learn.grade.notRecorded.body', { scenario }) };
  return (
    <section
      data-learn-grade={grade.kind}
      aria-label={t('learn.lessonEvidence')}
      className="border-y border-[var(--color-surface-600)] py-3"
    >
      <div role="status" aria-live="polite" className="flex items-start gap-2">
        {grade.kind === 'passed' ? (
          <FlaskConical size={16} className="mt-0.5 shrink-0 text-[var(--color-accent-green)]" aria-hidden="true" />
        ) : (
          <Info size={16} className="mt-0.5 shrink-0 text-[var(--color-surface-300)]" aria-hidden="true" />
        )}
        <div className="min-w-0">
          {(grade.kind === 'passed' || grade.kind === 'failed') && (
            <div className="mb-2">
              <TestVerdict
                live={false}
                ok={grade.kind === 'passed'}
                boundary="simulation"
                sentence={t('u2Tests.verdict.counts', { passed: grade.kind === 'passed' ? 1 : 0, total: 1 })}
              />
            </div>
          )}
          <h3 className="font-medium text-[var(--color-surface-100)]">{copy.title}</h3>
          <p className="mt-1 leading-5 text-[var(--color-surface-300)]">{copy.body}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]">{lesson.scope}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]">
            <span className="font-medium text-[var(--color-surface-200)]">{t('learn.faultToCorrect')}</span> {lesson.faultCases.join(' ')}
          </p>
          {lesson.authorScenarioIds.length > 0 && (
            <p className="mt-1 text-xs leading-5 text-[var(--color-surface-400)]">
              <span className="font-medium text-[var(--color-surface-200)]">{t('learn.includedRegressions')}</span>{' '}
              {lesson.authorScenarioIds.join(', ')}
            </p>
          )}
          {grade.kind === 'failed' && (
            <ul
              data-learn-failures
              aria-label={t('learn.failedAssertions')}
              className="mt-2 space-y-1 text-xs leading-5 text-[var(--color-surface-300)]"
            >
              {grade.failures.map((failure) => (
                <li key={failure.index}>
                  {describeFailure(failure, lesson.scenario.expectations[failure.index], locale)}
                  {failure.trace && (
                    <>
                      {' '}
                      · <code className="break-all text-[var(--color-surface-400)]">{failure.trace.uri}</code>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
