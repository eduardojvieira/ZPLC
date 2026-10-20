/**
 * The two learner boards as Studio shows them (LRN-013, LRN-014): the kit of the course (`lessons/kit.json`: supply and
 * ground pins, the voltage limit, the bill of materials) joined with the board I/O description of the firmware
 * (`firmware/app/boards/boards.json`). Both files are bundled; nothing is read at run time.
 */
import boardManifest from '../../../../firmware/app/boards/boards.json';
import kit from '../../lessons/kit.json';
import { joinLearnerBoards, type LearnerKit } from '../boards/wiring/kit';
import type { WiringBoard } from '../boards/wiring/wiring';
import type { LearnerBoard } from './learnBoard';

export const LEARNER_KIT = kit as unknown as LearnerKit;
const BOARDS = joinLearnerBoards(LEARNER_KIT, boardManifest).boards;

/** The board as the wiring draws it; undefined only if the bundled files disagree, which the lesson CI refuses. */
export const learnerBoardOf = (id: LearnerBoard): WiringBoard | undefined => BOARDS.find((board) => board.boardId === id);

/** The id the firmware images and the project target use for the board (`ide_id` of boards.json). */
export const ideIdOf = (id: LearnerBoard): string | undefined =>
  (boardManifest as unknown as Array<{ board_id: string; ide_id?: string }>).find((entry) => entry.board_id === id)?.ide_id;
