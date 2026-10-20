/**
 * The hardware track of the Learn home (LRN-013, LRN-024): the learner's board, and the lessons passed on hardware, named
 * apart from the course's passes, which are graded in simulation. It wraps the home: the home scrolls above, the strip stays
 * below it. Choosing a board connects to nothing (LRN-015).
 */
import type { ReactNode } from 'react';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { useT, type MessageKey } from '../i18n';
import { buildCourseView } from '../learn/course';
import { LEARNER_BOARDS, isLearnerBoard, useLearnBoard, type LearnerBoard } from '../learn/learnBoard';
import { useLearnProgress } from '../learn/progressState';
import { ToggleGroup } from '../ui';
import { announce } from '../utils/announce';

const BOARD_LABEL: Record<LearnerBoard, MessageKey> = { 'rpi-pico-rp2040': 'learn.hardware.board.pico', 'esp32-s3-devkitc': 'learn.hardware.board.esp32s3' };

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
          <ToggleGroup
            label={t('learn.hardware.board')}
            className="mt-2 flex-wrap"
            value={board ?? ''}
            onValueChange={(value) => { if (isLearnerBoard(value)) onChoose(value); }}
            options={LEARNER_BOARDS.map((id) => ({ value: id, label: t(BOARD_LABEL[id]) }))}
          />
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
  const choose = (chosen: LearnerBoard): void => {
    useLearnBoard.getState().choose(chosen);
    announce(t('learn.hardware.board.chosen', { board: t(BOARD_LABEL[chosen]) }));
  };
  return <LearnBoardTrackView board={board} passedOnHardware={passedOnHardware} onChoose={choose}>{children}</LearnBoardTrackView>;
}
