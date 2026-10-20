/**
 * The learner's board on the hardware track (LRN-013): the Raspberry Pi Pico or the ESP32-S3-DevKitC-1, by their ids in
 * `firmware/app/boards/boards.json`. It is a setting of this computer, like the lesson workspaces Learn remembers, so it is
 * kept in the window's local storage; a storage that is missing or refuses leaves the choice for this session only.
 *
 * Choosing a board changes what Learn shows (the board's wiring, in phase 2); it connects to nothing (LRN-015).
 */
import { create } from 'zustand';

export const LEARNER_BOARDS = ['rpi-pico-rp2040', 'esp32-s3-devkitc'] as const;
export type LearnerBoard = (typeof LEARNER_BOARDS)[number];
export const LEARN_BOARD_STORAGE_KEY = 'zplc-learn-board';

export interface BoardStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface LearnBoardState { board: LearnerBoard | null; choose(board: LearnerBoard): void }

export const isLearnerBoard = (value: unknown): value is LearnerBoard => (LEARNER_BOARDS as readonly unknown[]).includes(value);

export function createLearnBoardState(storage: BoardStorage | undefined) {
  let stored: string | null = null;
  try { stored = storage?.getItem(LEARN_BOARD_STORAGE_KEY) ?? null; } catch { /* no stored choice */ }
  return create<LearnBoardState>()((set) => ({
    board: isLearnerBoard(stored) ? stored : null,
    choose(board) {
      try { storage?.setItem(LEARN_BOARD_STORAGE_KEY, board); } catch { /* kept for this session only */ }
      set({ board });
    },
  }));
}

export const useLearnBoard = createLearnBoardState(typeof window === 'undefined' ? undefined : (() => { try { return window.localStorage; } catch { return undefined; } })());
