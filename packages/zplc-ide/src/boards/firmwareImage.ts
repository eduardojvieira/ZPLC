/**
 * What Studio shows about the firmware image of the selected board (REL-025): the image, its checksum, where the file
 * is, the evidence level of the board and the steps that a person follows to flash it. It is built from the release
 * manifest of the installation (REL-022, read by the main process) and the board the project targets.
 *
 * Studio never flashes (AGENTS.md rule 7: build, flash, deploy and run are separate human actions). Every step below is
 * text for a person; nothing in this module, or in the card that shows it, copies a file to a board or runs a tool.
 */
import type { FirmwareEvidenceLevel, FirmwareImage, FirmwareImagesResult } from '../../electron/firmwareImagesProtocol';
import { RELEASE_URL_PREFIX } from '../../electron/updateCheckProtocol';
import { t, type MessageKey } from '../i18n';

/** The notice of the card, in the language of the interface (src/i18n/catalog/boards.ts). */
export const noFlashNotice = (): string => t('boards.firmware.notice');

const LEVEL_KEY: Record<FirmwareEvidenceLevel, MessageKey> = {
  'cross-build': 'boards.firmware.level.crossBuild',
  'human-hil': 'boards.firmware.level.humanHil',
};

export interface FirmwareFileView {
  file: string;
  format: 'uf2' | 'bin' | 'elf';
  sha256: string;
  bytes: number;
  /** The file is inside this installation, and it is the file that the manifest describes. */
  offline: boolean;
  /** Where the file is: its path in this installation, or where to download it. */
  location: string;
}

export interface FirmwareBoardListEntry {
  board: string;
  displayName: string;
  learner: boolean;
  file: string;
  offline: boolean;
}

export type FirmwareImagePresentation =
  | { kind: 'no-board' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'no-image'; message: string }
  | {
      kind: 'ready';
      board: string;
      displayName: string;
      learner: boolean;
      version: string;
      commit: string;
      /** A different version from this Studio's: the image and the application are not from the same release. */
      versionNote: string | null;
      evidenceLevel: FirmwareEvidenceLevel;
      evidence: string;
      image: FirmwareFileView;
      /** The ELF with symbols that some boards also have: for a debugger, never flashed. */
      debug: FirmwareFileView | null;
      steps: string[];
      /** Every board of the release, the two learner boards first. */
      boards: FirmwareBoardListEntry[];
      notice: string;
    };

function separator(folder: string): string {
  return folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
}

function releaseLink(version: string): string {
  return `${RELEASE_URL_PREFIX}tag/v${version}`;
}

function fileView(image: FirmwareImage, folder: string, version: string): FirmwareFileView {
  const offline = image.bundled === 'verified';
  const path = `${folder}${separator(folder)}${image.file}`;
  const location = offline
    ? path
    : image.bundled === 'changed'
      ? t('boards.firmware.location.changed', { path, file: image.file, url: releaseLink(version) })
      : t('boards.firmware.location.missing', { file: image.file, url: releaseLink(version) });
  return { file: image.file, format: image.format, sha256: image.sha256, bytes: image.bytes, offline, location };
}

/** The images that a person flashes, the two learner boards first and the others in the order of the manifest. */
export function orderedFlashImages(images: readonly FirmwareImage[]): FirmwareImage[] {
  const flash = images.filter((image) => image.role === 'flash');
  return [...flash.filter((image) => image.learner), ...flash.filter((image) => !image.learner)];
}

function checksumCommand(file: string, platform: string): string {
  if (platform === 'win32') return `Get-FileHash .\\${file} -Algorithm SHA256`;
  if (platform === 'darwin') return `shasum -a 256 ${file}`;
  return `sha256sum ${file}`;
}

/** The steps for one image, from the runner and the address that its own build names. */
export function flashSteps(image: FirmwareImage, platform: string, offline: boolean): string[] {
  const flash = image.flash;
  const steps: string[] = [];
  steps.push(
    offline ? t('boards.firmware.step.openFolder', { file: image.file }) : t('boards.firmware.step.download', { file: image.file }),
  );
  steps.push(t('boards.firmware.step.checksum', { command: checksumCommand(image.file, platform), sha256: image.sha256 }));
  if (flash === null) return steps;
  const arg = (name: string): string | undefined => flash.args[name];
  const file = image.file;
  switch (flash.runner) {
    case 'uf2':
      steps.push(
        t('boards.firmware.step.uf2.bootMode', { drive: arg('board-id') ?? 'RPI-RP2' }),
        t('boards.firmware.step.uf2.copy', { file }),
        t('boards.firmware.step.uf2.restart'),
      );
      break;
    case 'esp32':
      // LRN-014: the port marked USB, BOOT and RST for the download mode, esptool v5, then RST (docs/docs/guides/flash-firmware.md).
      steps.push(
        t('boards.firmware.step.esp32.install'),
        t('boards.firmware.step.esp32.port'),
        t('boards.firmware.step.esp32.downloadMode'),
        t('boards.firmware.step.esp32.write', { address: flash.address ?? '0x0', file }),
        t('boards.firmware.step.esp32.reset'),
      );
      break;
    case 'dfu-util':
      steps.push(
        t('boards.firmware.step.dfu.bootMode'),
        t('boards.firmware.step.dfu.write', {
          address: flash.address ?? '0x08040000',
          device: arg('pid') ?? '<vendor:product>',
          alt: arg('alt') ?? '0',
          file,
        }),
      );
      break;
    case 'stm32cubeprogrammer':
      steps.push(
        t('boards.firmware.step.stlink.connect'),
        t('boards.firmware.step.stlink.write', { address: flash.address ?? '0x08000000', file }),
      );
      break;
    default:
      steps.push(
        t('boards.firmware.step.other.write', { address: flash.address ?? t('boards.firmware.step.other.address'), runner: flash.runner }),
      );
  }
  steps.push(t('boards.firmware.step.connect'));
  return steps;
}

export function presentFirmwareImage(
  result: FirmwareImagesResult | null,
  ideId: string | undefined,
  studio: { version: string; platform: string },
): FirmwareImagePresentation {
  if (ideId === undefined || ideId === '' || ideId === 'custom') return { kind: 'no-board' };
  if (result === null) return { kind: 'unavailable', message: t('boards.firmware.unavailable.app') };
  if (result.status === 'absent') return { kind: 'unavailable', message: t('boards.firmware.unavailable.absent') };
  if (result.status === 'invalid') return { kind: 'unavailable', message: t('boards.firmware.unavailable.invalid') };
  const flash = orderedFlashImages(result.images);
  const image = flash.find((candidate) => candidate.board === ideId);
  if (!image) return { kind: 'no-image', message: t('boards.firmware.noImage', { version: result.version }) };
  const debug = result.images.find((candidate) => candidate.board === ideId && candidate.role === 'debug');
  const main = fileView(image, result.folder, result.version);
  return {
    kind: 'ready',
    board: image.board,
    displayName: image.displayName,
    learner: image.learner,
    version: result.version,
    commit: result.commit,
    versionNote:
      result.version === studio.version ? null : t('boards.firmware.versionNote', { version: result.version, studio: studio.version }),
    evidenceLevel: image.evidenceLevel,
    evidence: t(LEVEL_KEY[image.evidenceLevel]),
    image: main,
    debug: debug ? fileView(debug, result.folder, result.version) : null,
    steps: flashSteps(image, studio.platform, main.offline),
    boards: flash.map((candidate) => ({
      board: candidate.board,
      displayName: candidate.displayName,
      learner: candidate.learner,
      file: candidate.file,
      offline: candidate.bundled === 'verified',
    })),
    notice: noFlashNotice(),
  };
}
