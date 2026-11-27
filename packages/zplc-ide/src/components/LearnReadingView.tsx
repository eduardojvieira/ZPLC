/**
 * The full-screen reading page of a lesson (LRN-039): opened by starting a lesson that has one, over the whole workbench (GDE-006:
 * the shell mounts it at its root, and raises `useLearnLayout.reading` while it shows). It only renders; the try-it labs inside the
 * page reach the simulator through their own seam. Practice shows the exercise in the lesson layout (GDE-007; it starts the lesson
 * when its workspace is not open yet), Escape closes the page, and both hand the focus to the lesson panel; Back to course opens
 * the Learn home.
 */
import { BookOpen } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { useT } from '../i18n';
import { buildCourseView } from '../learn/course';
import { useLearnUi } from '../learn/learnUi';
import { useLearnProgress } from '../learn/progressState';
import { useAppSettings } from '../store/useAppSettings';
import { applyLessonLayout, useLearnLayout } from '../store/useLearnLayout';
import { useIDEStore } from '../store/useIDEStore';
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
  const progress = useLearnProgress((state) => state.document);
  const unlockAll = useAppSettings((state) => state.settings.unlockAllLessons);
  // R-G3: the place in the path the lesson belongs to, else in its module.
  const course = buildCourseView(LESSON_INDEX, progress, { locale, unlockAll });
  const path = course.paths.find((candidate) => candidate.lessons.some((item) => item.id === lessonId));
  const siblings = path?.lessons ?? course.modules.find((module) => module.id === entry?.module)?.lessons ?? [];
  const position = { n: siblings.findIndex((item) => item.id === lessonId) + 1, total: siblings.length };
  const moduleTitle = LESSON_INDEX.course.modules.find((module) => module.id === entry?.module)?.title[locale] ?? '';

  // Practice shows the exercise: with the lesson's workspace open it only closes the page; otherwise (a page opened from the course
  // outline) it starts the lesson, and closes the page once the workspace is open (`startLesson` reopens it for a lesson that has one;
  // Read again in the Guide brings it back). A start that does not open leaves the page where it was.
  const practice = (): void => {
    leaving.current = 'panel';
    const ui = useLearnUi.getState();
    if (ui.workspace?.lessonId === lessonId && ui.workspace.session === useIDEStore.getState().projectSession) {
      ui.closeReading();
      applyLessonLayout(lessonId);
      return;
    }
    if (ui.starting) return;
    void ui.startLesson(lessonId).then((opened) => {
      if (!opened) return;
      useLearnUi.getState().closeReading();
      applyLessonLayout(lessonId);
    });
  };
  const back = (): void => {
    leaving.current = 'home';
    useLearnUi.getState().showHome();
  };
  useEffect(() => {
    useLearnLayout.getState().setReading(true);
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
      useLearnLayout.getState().setReading(false);
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
        'absolute inset-0 z-40 overflow-y-auto bg-[var(--color-surface-900)] px-4 py-6 font-sans text-sm ' +
        'text-[var(--color-surface-200)]'
      }
    >
      <div className="mx-auto max-w-[70ch]">
        <header className="border-b border-[var(--color-surface-600)] pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" data-learn-reading-back onClick={back}>
              {t('learnReading.view.back')}
            </Button>
            <Button variant="primary" data-learn-reading-practice onClick={practice}>
              {t('learnReading.view.practice')}
            </Button>
          </div>
          <p className="mt-3 text-xs text-[var(--color-surface-400)]">
            {t('learn.home.module', { number: entry.module, title: moduleTitle })} ·{' '}
            {t('learnReading.view.minutes', { minutes: entry.estimatedMinutes })}
            {position.n > 0 && (
              <>
                {' '}
                · <span data-reading-position>{t('u3Guide.position', position)}</span>
              </>
            )}
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
      </div>
    </section>
  );
}
