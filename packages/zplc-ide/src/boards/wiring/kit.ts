/**
 * The learner kit of the course (LRN-014, LRN-016): `lessons/kit.json` names the learner boards with the pins of their
 * 3V3 supply and ground, the voltage-limit statement every wiring page shows, and the one bill of materials of the
 * course. The board I/O comes from firmware/app/boards/boards.json and is joined here; nothing reads a file.
 */
import { readBoardIo } from '../boardIo';
import { WIRING_LOCALES, type WiringBoard, type WiringLocale } from './wiring';

export interface KitBoard {
  /** The board id of boards.json (`board_id`). */
  readonly boardId: string;
  readonly supply: string;
  readonly ground: string;
  readonly analogGround: string;
}

export interface LearnerKit {
  readonly schemaVersion: 1;
  readonly boards: readonly KitBoard[];
  /** The voltage-limit statement, sentence by sentence, with the same facts in both languages. */
  readonly voltageLimit: Readonly<Record<WiringLocale, readonly string[]>>;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isSentences = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(isText);

/** Every problem of the kit file; an empty list means it is valid. */
export function validateKit(value: unknown): string[] {
  if (!isObject(value)) return ['kit: must be an object'];
  const problems: string[] = [];
  if (value.schemaVersion !== 1) problems.push('kit.schemaVersion: must be 1');
  if (!Array.isArray(value.boards) || value.boards.length === 0) problems.push('kit.boards: must list the learner boards');
  else value.boards.forEach((board: unknown, index) => {
    if (!isObject(board) || !['boardId', 'supply', 'ground', 'analogGround'].every((key) => isText(board[key]))) problems.push(`kit.boards[${index}]: must name boardId, supply, ground and analogGround`);
  });
  const limit = value.voltageLimit;
  if (!isObject(limit) || !WIRING_LOCALES.every((locale) => isSentences(limit[locale])) || (limit.en as string[]).length !== (limit.es as string[]).length) {
    problems.push(`kit.voltageLimit: must list the same number of non-empty sentences in ${WIRING_LOCALES.join(' and ')}`);
  }
  return problems;
}

/** The learner boards of the kit with their I/O description from the parsed boards.json; a board it cannot join is a problem. */
export function joinLearnerBoards(kit: LearnerKit, manifest: unknown): { boards: WiringBoard[]; problems: string[] } {
  const entries = Array.isArray(manifest) ? (manifest as Array<{ board_id?: unknown; display_name?: unknown; io?: unknown }>) : [];
  const boards: WiringBoard[] = [];
  const problems: string[] = [];
  for (const entry of kit.boards) {
    const board = entries.find((candidate) => candidate.board_id === entry.boardId);
    const io = board ? readBoardIo(board.io) : undefined;
    if (!board || !io || !isText(board.display_name)) { problems.push(`kit.json: board "${entry.boardId}" has no valid I/O description in boards.json`); continue; }
    boards.push({ boardId: entry.boardId, displayName: board.display_name, io, supply: entry.supply, ground: entry.ground, analogGround: entry.analogGround });
  }
  return { boards, problems };
}
