import { BookOpen, Eye, FlaskConical, RotateCcw } from 'lucide-react';
import type { Ref } from 'react';
import { useT } from '../../i18n';
import { Button } from '../../ui';

export interface GuideActionBarProps {
  check: { available: boolean; running: boolean; canRun: boolean; onCheck(): void; onCancel(): void };
  /** Where the host has no lesson check, the way to a result is the Tests tab, as in 2.0. */
  onOpenTests(): void;
  resetRef: Ref<HTMLButtonElement>;
  reset: { enabled: boolean; working: boolean; onReset(): void };
  onReadAgain: (() => void) | null;
  /** `null` when the learner turned solutions off or the solution is already shown. */
  onSolution: (() => void) | null;
}

/** Fixed at the bottom edge of the sidebar: Check first (primary), then Reset, Read again and Solution (GDE-003). */
export function GuideActionBar({ check, onOpenTests, resetRef, reset, onReadAgain, onSolution }: GuideActionBarProps) {
  const { t } = useT();
  return (
    <section
      data-guide-actions
      aria-label={t('learn.lessonActions')}
      className="shrink-0 border-t border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-2"
    >
      {/* in a narrow sidebar a button wider than the row wraps its own text instead of running out of the panel */}
      <div
        className={
          'flex flex-wrap gap-2 [&>button]:h-auto [&>button]:max-w-full [&>button]:py-1 [&>button]:whitespace-normal [&>button]:text-left'
        }
      >
        {check.available ? (
          <Button
            variant="primary"
            size="sm"
            data-learn-check
            onClick={check.onCheck}
            disabled={!check.canRun}
            aria-disabled={check.running || undefined}
          >
            <FlaskConical size={14} aria-hidden="true" />
            {check.running ? t('interlock.checking') : t('learn.check')}
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={onOpenTests}>
            <FlaskConical size={14} aria-hidden="true" />
            {t('learn.openTests')}
          </Button>
        )}
        {check.available && check.running && (
          <Button variant="secondary" size="sm" onClick={check.onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button
          ref={resetRef}
          variant="secondary"
          size="sm"
          data-learn-reset
          disabled={!reset.enabled || reset.working}
          onClick={reset.onReset}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {t('learn.reset')}
        </Button>
        {onReadAgain && (
          <Button variant="secondary" size="sm" data-learn-read-again onClick={onReadAgain}>
            <BookOpen size={14} aria-hidden="true" />
            {t('learnReading.view.readAgain')}
          </Button>
        )}
        {onSolution && (
          <Button variant="secondary" size="sm" data-learn-show-solution onClick={onSolution}>
            <Eye size={14} aria-hidden="true" />
            {t('u3Guide.solution')}
          </Button>
        )}
      </div>
    </section>
  );
}
