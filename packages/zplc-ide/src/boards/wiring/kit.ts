/**
 * The learner kit of the course (LRN-014, LRN-016): `lessons/kit.json` names the learner boards with the pins of their
 * 3V3 supply and ground, the voltage-limit statement every wiring page shows, and the one bill of materials of the
 * course. The board I/O comes from firmware/app/boards/boards.json and is joined here; nothing reads a file.
 */
import { readBoardIo } from '../boardIo';
import { WIRING_LOCALES, externalParts, type WiringBoard, type WiringFile, type WiringLocale } from './wiring';

export interface KitBoard {
  /** The board id of boards.json (`board_id`). */
  readonly boardId: string;
  readonly supply: string;
  readonly ground: string;
  readonly analogGround: string;
}

/**
 * One line of the bill of materials. `kind` is a wiring kind (led, button ...) or a part that no wiring names (board, cable, breadboard).
 */
export interface BomItem {
  readonly id: string;
  readonly kind: string;
  readonly quantity: number;
  /** The value of a resistor or a potentiometer, in ohms. */
  readonly ohms?: number;
  readonly name: Readonly<Record<WiringLocale, string>>;
  readonly note?: Readonly<Record<WiringLocale, string>>;
}

export interface LearnerKit {
  readonly schemaVersion: 1;
  readonly boards: readonly KitBoard[];
  /** The voltage-limit statement, sentence by sentence, with the same facts in both languages. */
  readonly voltageLimit: Readonly<Record<WiringLocale, readonly string[]>>;
  /** The one bill of materials of the course, the same for either board (LRN-014). */
  readonly bom: readonly BomItem[];
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
  else
    value.boards.forEach((board: unknown, index) => {
      if (!isObject(board) || !['boardId', 'supply', 'ground', 'analogGround'].every((key) => isText(board[key])))
        problems.push(`kit.boards[${index}]: must name boardId, supply, ground and analogGround`);
    });
  const limit = value.voltageLimit;
  if (
    !isObject(limit) ||
    !WIRING_LOCALES.every((locale) => isSentences(limit[locale])) ||
    (limit.en as string[]).length !== (limit.es as string[]).length
  ) {
    problems.push(`kit.voltageLimit: must list the same number of non-empty sentences in ${WIRING_LOCALES.join(' and ')}`);
  }
  const localized = (entry: unknown): boolean => isObject(entry) && WIRING_LOCALES.every((locale) => isText(entry[locale]));
  if (!Array.isArray(value.bom) || value.bom.length === 0) problems.push('kit.bom: must list the bill of materials');
  else
    value.bom.forEach((item: unknown, index) => {
      const ok =
        isObject(item) &&
        isText(item.id) &&
        isText(item.kind) &&
        Number.isInteger(item.quantity) &&
        (item.quantity as number) > 0 &&
        localized(item.name) &&
        (item.note === undefined || localized(item.note)) &&
        (item.ohms === undefined || (Number.isInteger(item.ohms) && (item.ohms as number) > 0));
      if (!ok)
        problems.push(`kit.bom[${index}]: must have an id, a kind, a positive quantity and a name in ${WIRING_LOCALES.join(' and ')}`);
    });
  return problems;
}

/** The learner boards of the kit with their I/O description from the parsed boards.json; a board it cannot join is a problem. */
export function joinLearnerBoards(kit: LearnerKit, manifest: unknown): { boards: WiringBoard[]; problems: string[] } {
  const entries = Array.isArray(manifest)
    ? (manifest as Array<{ board_id?: unknown; display_name?: unknown; io?: unknown; learner?: unknown }>)
    : [];
  const boards: WiringBoard[] = [];
  const problems: string[] = [];
  for (const entry of kit.boards) {
    const board = entries.find((candidate) => candidate.board_id === entry.boardId);
    const io = board ? readBoardIo(board.io) : undefined;
    if (!board || !io || !isText(board.display_name)) {
      problems.push(`kit.json: board "${entry.boardId}" has no valid I/O description in boards.json`);
      continue;
    }
    // zplc_boards.py requires the Spanish text of a board marked learner (LRN-029); an unmarked board would escape it.
    if (board.learner !== true)
      problems.push(
        `kit.json: board "${entry.boardId}" is not marked "learner": true in boards.json, so its Spanish text is not checked (LRN-029)`,
      );
    boards.push({
      boardId: entry.boardId,
      displayName: board.display_name,
      io,
      supply: entry.supply,
      ground: entry.ground,
      analogGround: entry.analogGround,
    });
  }
  return { boards, problems };
}

/** What one lesson needs at once on one board, by bill-of-materials need: `led`, `button`, `resistor 330 Ω`, `jumper wire` ... */
function needsOf(wiring: WiringFile, board: WiringBoard): Map<string, number> {
  const needs = new Map<string, number>();
  const add = (need: string, count = 1): void => {
    needs.set(need, (needs.get(need) ?? 0) + count);
  };
  const parts = externalParts(wiring, board);
  for (const part of parts) {
    if (part.kind === 'jumper') continue;
    add(
      part.kind === 'resistor'
        ? `resistor ${part.ohms ?? 0} Ω`
        : part.kind === 'potentiometer'
          ? `potentiometer ${part.ohms ?? 0} Ω`
          : part.kind,
    );
    if (part.kind === 'led') add(`resistor ${part.resistorOhms ?? 0} Ω`);
  }
  // ponytail: a fixed count of wires per part (one for a jumper switch, two for any other part, two for the 3V3 and GND rails); count the
  // breadboard layout if a lesson ever runs short.
  if (parts.length > 0)
    add(
      'jumper wire',
      parts.filter((part) => part.kind === 'jumper').length + 2 * parts.filter((part) => part.kind !== 'jumper').length + 2,
    );
  return needs;
}

const haveOf = (bom: readonly BomItem[], need: string): number =>
  bom
    .filter((item) => {
      if (need === 'jumper wire') return item.kind === 'jumper';
      const valued = /^(resistor|potentiometer) (\d+) Ω$/.exec(need);
      return valued ? item.kind === valued[1] && item.ohms === Number(valued[2]) : item.kind === need;
    })
    .reduce((sum, item) => sum + item.quantity, 0);

/** The needs of a lesson that the bill of materials does not cover, for every learner board; parts are reused from lesson to lesson. */
export function bomProblems(
  bom: readonly BomItem[],
  lessons: ReadonlyArray<{ readonly id: string; readonly wiring: WiringFile }>,
  boards: readonly WiringBoard[],
): string[] {
  const problems: string[] = [];
  for (const { id, wiring } of lessons) {
    for (const board of boards) {
      for (const [need, count] of needsOf(wiring, board)) {
        const have = haveOf(bom, need);
        if (count > have) problems.push(`${id} on ${board.displayName} needs ${count} of ${need}, the bill of materials has ${have}`);
      }
    }
  }
  return problems;
}
