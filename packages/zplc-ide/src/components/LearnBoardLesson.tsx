/**
 * A lesson on the learner's board (LRN-013, LRN-014, LRN-016): the board picker, the wiring of the lesson as a diagram and
 * as text, the pin of each part, the voltage limit, the parts of the whole course, the firmware with the flashing steps the
 * learner follows, and the check on the board. Everything here is shown, nothing is done to the board (LRN-015).
 */
import { Suspense, lazy, useRef, type ReactNode } from 'react';
import type { LearnerKit } from '../boards/wiring/kit';
import { renderWiringSvg, wiringCard } from '../boards/wiring/render';
import { channelOf, partsFor, type WiringBoard, type WiringFile, type WiringLocale } from '../boards/wiring/wiring';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { useT } from '../i18n';
import { useLearnBoard, type LearnerBoard } from '../learn/learnBoard';
import { LEARNER_KIT, ideIdOf, learnerBoardOf } from '../learn/learnerBoards';
import { Button } from '../ui';
import { LearnBoardCheck } from './LearnBoardCheck';
import { LearnBoardPicker } from './LearnBoardTrack';
import { BOARD_LABEL, chooseLearnerBoard } from './learnBoardWords';

// The firmware card lives with the settings, which the Welcome screen does not load at start (IDE-015): it loads with the lesson.
const FirmwareImageCard = lazy(() => import('./settings/FirmwareImageCard').then((module) => ({ default: module.FirmwareImageCard })));

export interface LearnBoardLessonViewProps {
  board: LearnerBoard | null;
  wiringBoard: WiringBoard | null;
  wiring: WiringFile;
  kit: LearnerKit;
  locale: WiringLocale;
  onChoose(board: LearnerBoard): void;
  firmware?: ReactNode;
  check?: ReactNode;
}

export function LearnBoardLessonView({ board, wiringBoard, wiring, kit, locale, onChoose, firmware, check }: LearnBoardLessonViewProps) {
  const { t } = useT();
  const voltage = useRef<HTMLElement>(null);
  const name = board ? t(BOARD_LABEL[board]) : '';
  return (
    <section
      aria-labelledby="learn-board-lesson-title"
      data-learn-board-lesson
      className="border-b border-[var(--color-surface-700)] pb-3 text-xs leading-5 text-[var(--color-surface-300)]"
    >
      <h3 id="learn-board-lesson-title" className="text-sm font-medium text-[var(--color-surface-100)]">
        {t('learn.hardware.lesson.title')}
      </h3>
      <LearnBoardPicker board={board} onChoose={onChoose} className="mt-2 flex-wrap" />
      {!board || !wiringBoard ? (
        <p className="mt-2">{t('learn.hardware.lesson.noBoard')}</p>
      ) : (
        <div className="mt-2 space-y-3">
          <Button variant="secondary" size="sm" data-learn-voltage-link onClick={() => voltage.current?.focus()}>
            {t('learn.hardware.voltage.link')}
          </Button>
          <figure data-learn-wiring={board}>
            <figcaption className="font-medium text-[var(--color-surface-100)]">
              {t('learn.hardware.wiring.title', { board: name })}
            </figcaption>
            <img
              className="mt-1 h-auto max-w-full"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderWiringSvg(wiringBoard, wiring, locale))}`}
              alt={t('learn.hardware.wiring.alt', { board: name })}
            />
            <ol data-learn-wiring-list className="mt-1 list-decimal space-y-0.5 pl-5">
              {wiringCard(wiringBoard, wiring, locale).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </figure>
          <table data-learn-pin-map className="w-full text-left">
            <caption className="text-left font-medium text-[var(--color-surface-100)]">{t('learn.hardware.pins.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('learn.hardware.pins.part')}</th>
                <th scope="col">{t('learn.hardware.pins.channel')}</th>
                <th scope="col">{t('learn.hardware.pins.pin')}</th>
                <th scope="col">{t('learn.hardware.pins.where')}</th>
              </tr>
            </thead>
            <tbody>
              {partsFor(wiring, wiringBoard).map((part) => {
                const channel = channelOf(wiringBoard, part.channel);
                return (
                  <tr key={part.id} data-learn-pin={part.id}>
                    <td>{part.label[locale]}</td>
                    <td>{part.channel}</td>
                    <td>{channel?.pin ?? ''}</td>
                    <td>{channel?.location ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <section ref={voltage} tabIndex={-1} aria-labelledby="learn-voltage-title" data-learn-voltage>
            <h4 id="learn-voltage-title" className="font-medium text-[var(--color-surface-100)]">
              {t('learn.hardware.voltage.title')}
            </h4>
            <ul className="list-disc space-y-0.5 pl-5">
              {kit.voltageLimit[locale].map((sentence) => (
                <li key={sentence}>{sentence}</li>
              ))}
            </ul>
          </section>
          <details data-learn-bom>
            <summary className="cursor-pointer select-none font-medium text-[var(--color-accent-blue)]">
              {t('learn.hardware.bom.title')}
            </summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {kit.bom.map((item) => (
                <li key={item.id} data-learn-bom-item>
                  {t('learn.hardware.bom.item', { quantity: item.quantity, name: item.name[locale] })}
                </li>
              ))}
            </ul>
          </details>
          <section aria-labelledby="learn-firmware-title" data-learn-firmware>
            <h4 id="learn-firmware-title" className="font-medium text-[var(--color-surface-100)]">
              {t('learn.hardware.firmware.title')}
            </h4>
            {firmware}
          </section>
          {check}
        </div>
      )}
    </section>
  );
}

/** The surface bound to the board setting; nothing for a lesson without the hardware track. */
export function LearnBoardLesson({ lessonId }: { lessonId: string }) {
  const { t, locale } = useT();
  const board = useLearnBoard((state) => state.board);
  const entry = LESSON_INDEX.lessons.find((lesson) => lesson.id === lessonId);
  if (!entry?.hardware) return null;
  return (
    <LearnBoardLessonView
      board={board}
      wiringBoard={board ? (learnerBoardOf(board) ?? null) : null}
      wiring={entry.hardware.wiring}
      kit={LEARNER_KIT}
      locale={locale}
      onChoose={(chosen) => chooseLearnerBoard(chosen, t)}
      firmware={
        <Suspense fallback={null}>
          <FirmwareImageCard ideId={board ? ideIdOf(board) : undefined} />
        </Suspense>
      }
      check={<LearnBoardCheck lessonId={lessonId} />}
    />
  );
}
