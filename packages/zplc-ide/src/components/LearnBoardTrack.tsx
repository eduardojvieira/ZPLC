/**
 * The hardware track of the Learn home (LRN-013, LRN-024): the learner's board, and the lessons passed on hardware, named
 * apart from the course's passes, which are graded in simulation. It wraps the home: the home scrolls above, the strip stays
 * below it. Choosing a board connects to nothing (LRN-015).
 */
import type { ReactNode } from 'react';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { useT } from '../i18n';
import { buildCourseView } from '../learn/course';
import { LEARNER_BOARDS, isLearnerBoard, useLearnBoard, type LearnerBoard } from '../learn/learnBoard';
import { useLearnProgress } from '../learn/progressState';
import { ToggleGroup } from '../ui';
import { BOARD_LABEL, chooseLearnerBoard } from './learnBoardWords';

/** The two learner boards as one group of the kit (LRN-013): keyboard operable, the chosen one pressed. */
export function LearnBoardPicker({ board, onChoose, className }: { board: LearnerBoard | null; onChoose(board: LearnerBoard): void; className?: string }) {
  const { t } = useT();
  return (
    <ToggleGroup
      label={t('learn.hardware.board')}
      className={className}
      value={board ?? ''}
      onValueChange={(value) => { if (isLearnerBoard(value)) onChoose(value); }}
      options={LEARNER_BOARDS.map((id) => ({ value: id, label: t(BOARD_LABEL[id]) }))}
    />
  );
}

export interface LearnBoardTrackViewProps {
  board: LearnerBoard | null;
  /** The titles of the lessons that have a passing hardware grade. */
  passedOnHardware: readonly string[];
  onChoose(board: LearnerBoard): void;
  children?: ReactNode;
}

export function LearnBoardTrackView({ board, passedOnHardware, onChoose, children }: LearnBoardTrackViewProps) {
  const { t } = useT();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">{children}</div>
      <section aria-labelledby="learn-hardware-title" data-learn-hardware className="shrink-0 border-t border-[var(--color-surface-600)] bg-[var(--color-surface-900)] px-4 py-3 font-sans text-sm text-[var(--color-surface-200)]">
        <div className="mx-auto max-w-4xl">
          <h2 id="learn-hardware-title" className="font-semibold text-[var(--color-surface-100)]">{t('learn.hardware.title')}</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--color-surface-300)]">{t('learn.hardware.intro')}</p>
          <LearnBoardPicker board={board} onChoose={onChoose} className="mt-2 flex-wrap" />
          <p data-learn-hardware-board className="mt-2 text-xs leading-5 text-[var(--color-surface-300)]">{board ? t('learn.hardware.board.chosen', { board: t(BOARD_LABEL[board]) }) : t('learn.hardware.board.none')}</p>
          <p data-learn-hardware-passed className="mt-1 text-xs leading-5 text-[var(--color-surface-300)]">{passedOnHardware.length > 0 ? t('learn.hardware.passedList', { lessons: passedOnHardware.join(', ') }) : t('learn.hardware.passedNone')}</p>
        </div>
      </section>
    </div>
  );
}

/** The strip bound to the board setting and the progress. */
export function LearnBoardTrack({ children }: { children: ReactNode }) {
  const { t, locale } = useT();
  const board = useLearnBoard((state) => state.board);
  const document = useLearnProgress((state) => state.document);
  const { titles } = buildCourseView(LESSON_INDEX, document, { locale, unlockAll: false });
  const passedOnHardware = Object.keys(document?.lessons ?? {}).sort().filter((id) => document!.lessons[id]!.hardware !== null && titles[id] !== undefined).map((id) => titles[id]!);
  return <LearnBoardTrackView board={board} passedOnHardware={passedOnHardware} onChoose={(chosen) => chooseLearnerBoard(chosen, t)}>{children}</LearnBoardTrackView>;
}
