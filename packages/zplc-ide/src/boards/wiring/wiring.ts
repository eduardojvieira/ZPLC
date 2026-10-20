/**
 * The wiring of a hardware lesson (LRN-013, LRN-014, LRN-016): `lessons/<id>/wiring.json` lists the parts a learner puts
 * on the breadboard and the board channel each one connects to (DO0, DI1, AI0 ...). One file serves both learner
 * boards: the pins come from the board I/O description (firmware/app/boards/boards.json), never from the lesson, so a
 * pin that moves in the firmware moves in every diagram.
 *
 *   {
 *     "schemaVersion": 1,
 *     "parts": [
 *       { "id": "lamp", "kind": "led", "channel": "DO0", "color": "red", "resistorOhms": 330, "label": { "en": "Lamp", "es": "Lámpara" } },
 *       { "id": "start", "kind": "button", "channel": "DI0", "label": { "en": "Start", "es": "Arranque" } },
 *       { "id": "armed", "kind": "jumper", "channel": "DI1", "label": { "en": "Armed", "es": "Armado" } },
 *       { "id": "level", "kind": "potentiometer", "channel": "AI0", "ohms": 10000, "label": { "en": "Level", "es": "Nivel" } },
 *       { "id": "onboard", "kind": "led", "channel": "DO4", "boards": ["rpi-pico-rp2040"], "label": { ... } }
 *     ]
 *   }
 *
 * A button connects the pin to GND and the board's internal pull-up reads it, active low; a jumper is a wire the learner
 * plugs between the pin and GND to hold an input on (a maintained switch); a potentiometer has its ends on 3V3 and GND
 * and its wiper on the analog pin; an LED goes from the pin through its series resistor to GND. `boards` limits a part
 * to some learner boards (the Pico's on-board LED); without it the part is wired on both. A channel whose location in
 * the board description says "on-board" (the Pico LED, the BOOT button of the ESP32-S3) needs no wiring at all.
 *
 * This module has no Node import: the lesson loader, the docs generator and Studio share it.
 */
import type { BoardChannel, BoardIoDescription } from '../boardIo';

export const WIRING_SCHEMA_VERSION = 1 as const;
export const WIRING_FILE = 'wiring.json';
export const WIRING_LOCALES = ['en', 'es'] as const;
export type WiringLocale = typeof WIRING_LOCALES[number];

/** LRN-016: the only parts a lesson may wire, all of them low-voltage and passive. */
export const LOW_VOLTAGE_KINDS = ['led', 'resistor', 'button', 'potentiometer', 'capacitor', 'jumper'] as const;
/** Red, green and yellow LEDs light at about 2 V; blue and white need about 3 V and stay dim at 3.3 V through 330 ohms. */
export const LED_COLORS = ['red', 'green', 'yellow'] as const;
/** 3.3 V through 330 ohms and a red LED is about 4 mA, inside the Pico's default 4 mA drive. */
export const MIN_LED_RESISTOR_OHMS = 330;
/** The logic level of both learner boards. */
export const MAX_VOLTS = 3.3;

const INPUT_KINDS: readonly string[] = ['button', 'jumper', 'potentiometer'];
const OUTPUT_KINDS: readonly string[] = ['led'];

export interface WiringPart {
  readonly id: string;
  readonly kind: string;
  /** The channel id of the board I/O description: DO0, DI1, AI0. */
  readonly channel: string;
  readonly label: Readonly<Record<WiringLocale, string>>;
  /** An LED's colour. */
  readonly color?: string;
  /** The series resistor of an LED, in ohms. */
  readonly resistorOhms?: number;
  /** The value of a resistor or a potentiometer, in ohms. */
  readonly ohms?: number;
  /** The learner boards (board ids of boards.json) the part is wired on; both when absent. */
  readonly boards?: readonly string[];
}

export interface WiringFile {
  readonly schemaVersion: typeof WIRING_SCHEMA_VERSION;
  readonly parts: readonly WiringPart[];
}

/** A learner board as the wiring needs it: its I/O description and where its 3V3 and GND pins are. */
export interface WiringBoard {
  /** The board id of boards.json (`board_id`). */
  readonly boardId: string;
  readonly displayName: string;
  readonly io: BoardIoDescription;
  /** The 3V3 supply pin, as printed on the board: `3V3(OUT) · pin 36`. */
  readonly supply: string;
  readonly ground: string;
  /** The ground a potentiometer returns to (AGND on the Pico). */
  readonly analogGround: string;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isPositiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
const PART_ID = /^[a-z][a-z0-9-]{0,31}$/;
const CHANNEL_ID = /^[A-Z]{2}\d{1,2}$/;
const PART_KEYS = ['id', 'kind', 'channel', 'label', 'color', 'resistorOhms', 'ohms', 'boards'];

/** Every problem of the shape of a wiring file; an empty list means it is well formed. LRN-016 is `wiringSafetyProblems`. */
export function validateWiring(value: unknown): string[] {
  if (!isObject(value)) return ['wiring: must be an object'];
  const problems: string[] = [];
  for (const key of Object.keys(value)) if (key !== 'schemaVersion' && key !== 'parts') problems.push(`wiring: unknown key "${key}"`);
  if (value.schemaVersion !== WIRING_SCHEMA_VERSION) problems.push('wiring.schemaVersion: must be 1');
  if (!Array.isArray(value.parts) || value.parts.length === 0) return [...problems, 'wiring.parts: must list at least one part'];
  const ids = new Set<string>();
  value.parts.forEach((part: unknown, index) => {
    const here = `wiring.parts[${index}]`;
    if (!isObject(part)) { problems.push(`${here}: must be an object`); return; }
    for (const key of Object.keys(part)) if (!PART_KEYS.includes(key)) problems.push(`${here}: unknown key "${key}"`);
    if (typeof part.id !== 'string' || !PART_ID.test(part.id)) problems.push(`${here}.id: must be a lowercase slug`);
    else if (ids.has(part.id)) problems.push(`wiring.parts: part id "${part.id}" is used twice`);
    else ids.add(part.id);
    if (!isText(part.kind)) problems.push(`${here}.kind: must name the kind of part`);
    if (typeof part.channel !== 'string' || !CHANNEL_ID.test(part.channel)) problems.push(`${here}.channel: must be a channel id of the board I/O description, such as DO0 or DI1`);
    const label = part.label;
    if (!isObject(label) || Object.keys(label).length !== WIRING_LOCALES.length || !WIRING_LOCALES.every((locale) => isText(label[locale]))) problems.push(`${here}.label: must be a non-empty string in ${WIRING_LOCALES.join(' and ')}`);
    if ('color' in part && !isText(part.color)) problems.push(`${here}.color: must name a colour`);
    for (const key of ['resistorOhms', 'ohms'] as const) if (key in part && !isPositiveInt(part[key])) problems.push(`${here}.${key}: must be a positive integer number of ohms`);
    if ('boards' in part && (!Array.isArray(part.boards) || part.boards.length === 0 || !part.boards.every(isText))) problems.push(`${here}.boards: must list at least one board id`);
  });
  return problems;
}

/** A channel the board carries itself (an on-board LED, the BOOT button): the learner wires nothing to it. */
export const isOnBoard = (channel: BoardChannel): boolean => /\bon-board\b/i.test(channel.location ?? '');

export const channelOf = (board: WiringBoard, id: string): BoardChannel | undefined => board.io.channels.find((channel) => channel.id === id);

/** The parts wired on this board, in the order of the file. */
export const partsFor = (wiring: WiringFile, board: WiringBoard): WiringPart[] => wiring.parts.filter((part) => part.boards === undefined || part.boards.includes(board.boardId));

/** The parts the learner puts on the breadboard for this board: the parts of the board that are not on-board channels. */
export const externalParts = (wiring: WiringFile, board: WiringBoard): WiringPart[] => partsFor(wiring, board).filter((part) => {
  const channel = channelOf(board, part.channel);
  return channel !== undefined && !isOnBoard(channel);
});

/**
 * The rules between a wiring file and the learner boards: each part's channel exists on every board it is wired on
 * (both boards unless it lists its boards), points the right way, and no two parts share a channel.
 */
export function wiringBoardProblems(wiring: WiringFile, boards: readonly WiringBoard[]): string[] {
  const problems: string[] = [];
  const known = new Set(boards.map((board) => board.boardId));
  for (const part of wiring.parts) for (const id of part.boards ?? []) if (!known.has(id)) problems.push(`part "${part.id}": board "${id}" is not a learner board`);
  for (const board of boards) {
    const taken = new Map<string, string>();
    for (const part of partsFor(wiring, board)) {
      const channel = channelOf(board, part.channel);
      if (!channel) { problems.push(`part "${part.id}": channel ${part.channel} does not exist on ${board.displayName}`); continue; }
      const wanted = INPUT_KINDS.includes(part.kind) ? 'input' : OUTPUT_KINDS.includes(part.kind) ? 'output' : undefined;
      if (wanted && channel.direction !== wanted) problems.push(`part "${part.id}": a ${part.kind} is an ${wanted}, but ${part.channel} is an ${channel.direction}`);
      if (part.kind === 'potentiometer' && channel.kind !== 'analog') problems.push(`part "${part.id}": a potentiometer needs an analog input, but ${part.channel} is digital`);
      const other = taken.get(part.channel);
      if (other) problems.push(`parts "${other}" and "${part.id}" are both wired to ${part.channel} on ${board.displayName}`);
      else taken.set(part.channel, part.id);
    }
  }
  return [...new Set(problems)];
}

/**
 * The rule between a program and its wiring (LRN-014), on each learner board: every process-image address the program
 * locates is a channel of the board that a part is wired to, or an address the project declares virtual (no pin drives
 * it on that board); and every part the board wires is a channel the program uses. `addresses` are normalized
 * (`%IX0.0`, `%QX0.1`, `%IW4`), as `normalizeAddress` of boardIoMapping writes them.
 */
export function programWiringProblems(wiring: WiringFile, boards: readonly WiringBoard[], addresses: readonly string[], virtual: readonly string[]): string[] {
  const problems: string[] = [];
  for (const board of boards) {
    const wired = new Set(partsFor(wiring, board).map((part) => part.channel));
    for (const address of addresses) {
      const channel = board.io.channels.find((entry) => entry.address === address);
      if (!channel) {
        if (!virtual.includes(address)) problems.push(`the program uses ${address}, which ${board.displayName} has no channel for; declare it in io.virtual of the project if no pin drives it there`);
      } else if (!wired.has(channel.id)) problems.push(`the program uses ${address} (${channel.id}) on ${board.displayName}, but no part is wired to it`);
    }
    for (const part of partsFor(wiring, board)) {
      const channel = channelOf(board, part.channel);
      if (channel && !addresses.includes(channel.address)) problems.push(`part "${part.id}" is wired to ${part.channel} on ${board.displayName}, which the program does not use`);
    }
  }
  return problems;
}
