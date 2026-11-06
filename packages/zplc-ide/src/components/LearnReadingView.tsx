/**
 * The full-screen reading page of a lesson (LRN-039): opened by starting a lesson that has one, over the workbench where the Learn
 * home is mounted. It only renders; the try-it labs inside the page reach the simulator through their own seam. Practice (and Escape)
 * closes it and hands the focus to the lesson panel; Back to course opens the Learn home.
 */
import { BookOpen } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { useT } from '../i18n';
import { useLearnUi } from '../learn/learnUi';
import { ReadingPage } from '../learn/reading/ReadingPage';
import { lessonImageUrl } from '../learn/reading/lessonImages';
import { parseReading } from '../learn/readingMarkdown';
import { Button } from '../ui';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function LearnReadingView() {
  const lessonId = useLearnUi((state) => state.reading);
  return lessonId === null ? null : <ReadingSurface key={lessonId} lessonId={lessonId} />;
}

function ReadingSurface({ lessonId }: { lessonId: string }) {
  const { t, locale } = useT();
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const leaving = useRef<'panel' | 'home'>('panel');
  const entry = LESSON_INDEX.lessons.find((lesson) => lesson.id === lessonId);
  const page = entry?.reading?.[locale];
  // The React Compiler memoizes this on `page`; the lab does not depend on it, since it is told apart by content (useLdTry.ts).
  const parsed = page === undefined ? null : parseReading(page);
  const moduleTitle = LESSON_INDEX.course.modules.find((module) => module.id === entry?.module)?.title[locale] ?? '';

  const practice = (): void => {
    leaving.current = 'panel';
    useLearnUi.getState().closeReading();
  };
  const back = (): void => {
    leaving.current = 'home';
    useLearnUi.getState().showHome();
  };
  useEffect(() => {
    heading.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        leaving.current = 'panel';
        useLearnUi.getState().closeReading();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // The panel takes the keyboard when the page closes; the home takes it itself when that is where the learner went.
      if (leaving.current === 'panel') document.getElementById('learn-title')?.focus();
    };
  }, []);
  // Focus stays inside the view: Tab wraps at its ends.
  const trap = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Tab' || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!entry) return null;
  return (
    <section
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="learn-reading-title"
      data-learn-reading={lessonId}
      onKeyDown={trap}
      className={
        'absolute inset-0 z-30 overflow-y-auto bg-[var(--color-surface-900)] px-4 py-6 font-sans text-sm ' +
        'text-[var(--color-surface-200)]'
      }
    >
      <div className="mx-auto max-w-[70ch]">
        <header className="border-b border-[var(--color-surface-600)] pb-4">
          <p className="text-xs text-[var(--color-surface-400)]">
            {t('learn.home.module', { number: entry.module, title: moduleTitle })} ·{' '}
            {t('learnReading.view.minutes', { minutes: entry.estimatedMinutes })}
          </p>
          <h1
            id="learn-reading-title"
            ref={heading}
            tabIndex={-1}
            className="mt-1 flex items-center gap-2 text-2xl font-semibold text-[var(--color-surface-100)]"
          >
            <BookOpen size={22} aria-hidden="true" />
            {entry.text[locale].title}
          </h1>
        </header>
        {parsed && parsed.errors.length === 0 && entry.reading ? (
          <ReadingPage
            lessonId={lessonId}
            blocks={parsed.blocks}
            files={entry.reading.files}
            resolveImage={(src) => lessonImageUrl(lessonId, src)}
          />
        ) : (
          <p role="alert" className="mt-4 text-xs text-[var(--color-accent-red)]">
            {t('learnReading.view.error')}
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-2 border-t border-[var(--color-surface-600)] pt-4">
          <Button variant="primary" data-learn-reading-practice onClick={practice}>
            {t('learnReading.view.practice')}
          </Button>
          <Button variant="secondary" data-learn-reading-back onClick={back}>
            {t('learnReading.view.back')}
          </Button>
        </div>
      </div>
    </section>
  );
}
