/** The words of the learner boards shared by the Learn components (LRN-013), and the one way to choose a board. */
import type { MessageKey, Translator } from '../i18n';
import { useLearnBoard, type LearnerBoard } from '../learn/learnBoard';
import { announce } from '../utils/announce';

export const BOARD_LABEL: Record<LearnerBoard, MessageKey> = {
  'rpi-pico-rp2040': 'learn.hardware.board.pico',
  'esp32-s3-devkitc': 'learn.hardware.board.esp32s3',
};

/** Chooses the learner's board and says so (LRN-013). It connects to nothing (LRN-015). */
export function chooseLearnerBoard(chosen: LearnerBoard, t: Translator['t']): void {
  useLearnBoard.getState().choose(chosen);
  announce(t('learn.hardware.board.chosen', { board: t(BOARD_LABEL[chosen]) }));
}
