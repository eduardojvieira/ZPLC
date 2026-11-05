/**
 * A self-check question of a reading page (LRN-041): a radio group and a Check action. The feedback of the chosen option is
 * shown with a word for correct or incorrect, so colour never says it alone. Nothing is graded or stored.
 */
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { Button, cx } from '../../ui';
import { navigationTarget } from '../../ui/logic/keyboard';
import type { QuizData } from '../readingTypes';

export function Quiz({ data }: { data: QuizData }) {
  const { t } = useT();
  const questionId = useId();
  const group = useRef<HTMLDivElement>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [checked, setChecked] = useState<number | null>(null);
  const choose = (index: number): void => {
    setChosen(index);
    setChecked(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number): void => {
    const target = navigationTarget(event.key, index, data.options.length, { orientation: 'both' });
    if (target === null) return;
    event.preventDefault();
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[target]?.focus();
    choose(target);
  };
  const result = checked === null ? undefined : data.options[checked];
  const tabbable = chosen ?? 0;
  return (
    <section
      data-reading-block="quiz"
      aria-label={t('learnReading.quiz.label')}
      className="my-4 rounded border border-[var(--border-color)] p-3"
    >
      <p id={questionId} className="font-semibold text-[var(--text-primary)]">
        {data.question}
      </p>
      <div ref={group} role="radiogroup" aria-labelledby={questionId} className="mt-2 flex flex-col items-start gap-1">
        {data.options.map((option, index) => (
          <Button
            key={index}
            role="radio"
            aria-checked={chosen === index}
            tabIndex={index === tabbable ? 0 : -1}
            variant={chosen === index ? 'primary' : 'secondary'}
            className={cx('text-left')}
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.text}
          </Button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button disabled={chosen === null} onClick={() => setChecked(chosen)}>
          {t('learnReading.quiz.check')}
        </Button>
        <span className="text-xs text-[var(--text-muted)]">{t('learnReading.quiz.notStored')}</span>
      </div>
      <div role="status" data-quiz-result={result ? (result.correct ? 'correct' : 'incorrect') : undefined} className="mt-2 text-sm">
        {result && (
          <>
            <strong>{t(result.correct ? 'learnReading.quiz.correct' : 'learnReading.quiz.incorrect')}</strong> {result.feedback}
          </>
        )}
      </div>
    </section>
  );
}
