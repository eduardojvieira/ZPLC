/**
 * The firmware images of the release this Studio belongs to (REL-025): the channel name and the answer, shared by the
 * main process (`firmwareImages.ts`, `main.ts`) and the renderer. Pure TypeScript with no Electron or Node import, so both
 * programs can import it.
 *
 * The answer is data. It carries what the release manifest says (scripts/release/firmware-images.ts) and whether each
 * file is inside this installation with the checksum the manifest states. Nothing here opens a port, copies a file to a
 * board or runs a flasher: a person starts the flash (AGENTS.md rule 7).
 */

export { FIRMWARE_IMAGES_CHANNEL } from './ipcContract.js';

export const FIRMWARE_MANIFEST_SCHEMA = 'zplc.firmware-release/1';

export type FirmwareFormat = 'uf2' | 'bin' | 'elf';
export type FirmwareEvidenceLevel = 'cross-build' | 'human-hil';
/** Whether the file is inside this installation, and whether it is the file the manifest describes. */
export type FirmwareBundled = 'verified' | 'missing' | 'changed';

export interface FirmwareFlash {
  /** The flash runner that the build of the image names: `uf2`, `esp32`, `dfu-util`, `stm32cubeprogrammer`, `openocd`. */
  runner: string;
  address: string | null;
  args: Record<string, string>;
}

export interface FirmwareImage {
  /** The `ide_id` of the board, as Studio's board catalogue keys it. */
  board: string;
  boardId: string;
  displayName: string;
  file: string;
  format: FirmwareFormat;
  role: 'flash' | 'debug';
  sha256: string;
  bytes: number;
  evidenceLevel: FirmwareEvidenceLevel;
  learner: boolean;
  flash: FirmwareFlash | null;
  bundled: FirmwareBundled;
}

export type FirmwareImagesResult =
  | { status: 'absent' }
  | { status: 'invalid' }
  | { status: 'available'; version: string; commit: string; folder: string; images: FirmwareImage[] };

/** What the preload exposes: one call, no arguments. */
export interface FirmwareImagesBridge {
  list(): Promise<unknown>;
}

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IDE_ID = /^[a-z0-9][a-z0-9_]{0,63}$/;
const BOARD_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FILE = /^zplc-runtime-[0-9A-Za-z.-]{1,96}\.(?:uf2|bin|elf)$/;
const RUNNER = /^[a-z0-9][a-z0-9-]{0,31}$/;
const ADDRESS = /^0x[0-9a-f]{8}$/;
const ARGUMENT_NAME = /^[a-z0-9-]{1,32}$/;
const ARGUMENT_VALUE = /^[A-Za-z0-9:._=+-]{1,64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const text = (value: unknown, pattern: RegExp): value is string => typeof value === 'string' && pattern.test(value);

function flashOf(value: unknown): FirmwareFlash | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !text(value.runner, RUNNER)) return undefined;
  if (value.address !== null && !text(value.address, ADDRESS)) return undefined;
  if (!isRecord(value.args) || Object.keys(value.args).length > 16) return undefined;
  const args: Record<string, string> = {};
  for (const [name, argument] of Object.entries(value.args)) {
    if (!text(name, ARGUMENT_NAME) || !text(argument, ARGUMENT_VALUE)) return undefined;
    args[name] = argument;
  }
  return { runner: value.runner, address: value.address as string | null, args };
}

/** One image of the manifest, with the checks that every field of it is a plain value of the shape it names, or undefined. */
export function parseFirmwareImage(value: unknown, bundled: FirmwareBundled): FirmwareImage | undefined {
  if (!isRecord(value)) return undefined;
  const { board, boardId, displayName, file, format, role, sha256, bytes, evidenceLevel, learner } = value;
  if (!text(board, IDE_ID) || !text(boardId, BOARD_ID) || !text(file, FILE) || !text(sha256, SHA256)) return undefined;
  if (typeof displayName !== 'string' || displayName.length === 0 || displayName.length > 128) return undefined;
  if (format !== 'uf2' && format !== 'bin' && format !== 'elf') return undefined;
  if (role !== 'flash' && role !== 'debug') return undefined;
  if (evidenceLevel !== 'cross-build' && evidenceLevel !== 'human-hil') return undefined;
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0 || typeof learner !== 'boolean') return undefined;
  if (!file.endsWith(`.${format}`)) return undefined;
  const flash = flashOf(value.flash);
  if (flash === undefined) return undefined;
  return { board, boardId, displayName, file, format, role, sha256, bytes, evidenceLevel, learner, flash, bundled };
}

/** A fresh, validated answer, or null for anything that is not exactly one. */
export function parseFirmwareImagesResult(value: unknown): FirmwareImagesResult | null {
  if (!isRecord(value)) return null;
  if (value.status === 'absent' || value.status === 'invalid') return Object.keys(value).length === 1 ? { status: value.status } : null;
  if (value.status !== 'available' || !text(value.version, VERSION) || !text(value.commit, COMMIT)) return null;
  if (
    typeof value.folder !== 'string' ||
    value.folder.length === 0 ||
    value.folder.length > 1024 ||
    !Array.isArray(value.images) ||
    value.images.length > 64
  )
    return null;
  const images: FirmwareImage[] = [];
  for (const entry of value.images) {
    const bundled = isRecord(entry) ? entry.bundled : undefined;
    if (bundled !== 'verified' && bundled !== 'missing' && bundled !== 'changed') return null;
    const image = parseFirmwareImage(entry, bundled);
    if (!image) return null;
    images.push(image);
  }
  return { status: 'available', version: value.version, commit: value.commit, folder: value.folder, images };
}
