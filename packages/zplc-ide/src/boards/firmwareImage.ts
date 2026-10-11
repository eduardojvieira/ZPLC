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

export const NO_FLASH_NOTICE = 'Studio does not flash a board. You follow these steps yourself, on your computer.';

const LEVEL_TEXT: Record<FirmwareEvidenceLevel, string> = {
  'cross-build': 'cross-build: the firmware builds for this board and fits its flash and RAM budget. It has not been flashed or run on the board.',
  'human-hil': 'human-hil: a person ran a recorded procedure on this board. The record names the firmware version and image it covers; check that it names this one.',
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
  const location = offline
    ? `${folder}${separator(folder)}${image.file}`
    : image.bundled === 'changed'
      ? `The copy in this installation (${folder}${separator(folder)}${image.file}) is not the file the manifest describes. Do not use it: download ${image.file} from ${releaseLink(version)}.`
      : `Not inside this installation. Download ${image.file} from ${releaseLink(version)}.`;
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
  steps.push(offline
    ? `Open a terminal in the folder that holds ${image.file}.`
    : `Download ${image.file} from the release into a folder, and open a terminal there.`);
  steps.push(`Check the file: \`${checksumCommand(image.file, platform)}\` must print ${image.sha256}.`);
  if (flash === null) return steps;
  const arg = (name: string): string | undefined => flash.args[name];
  switch (flash.runner) {
    case 'uf2':
      steps.push(
        `Unplug the board. Hold its BOOTSEL button (BOOT on the Waveshare RP2040-Zero), plug the USB cable in and release the button: a drive named ${arg('board-id') ?? 'RPI-RP2'} appears.`,
        `Copy ${image.file} onto that drive with your file manager.`,
        'The board restarts by itself and the drive disappears.',
      );
      break;
    case 'esp32':
      steps.push(
        'Install Espressif\'s esptool (`pip install esptool`); Studio does not include it. If the board does not answer, hold BOOT, press RESET and release BOOT to enter the download mode.',
        `Write the image at ${flash.address ?? '0x00000000'}: \`esptool --chip esp32s3 --port <port> write-flash --flash-mode ${arg('esp-flash-mode') ?? 'dio'} --flash-freq ${arg('esp-flash-freq') ?? '80m'} --flash-size ${arg('esp-flash-size') ?? 'detect'} ${flash.address ?? '0x0'} ${image.file}\` (esptool before version 5 spells it \`esptool.py\` and \`write_flash\`).`,
        'Press RESET.',
      );
      break;
    case 'dfu-util':
      steps.push(
        'Put the board in its bootloader: double-tap the reset button.',
        `Write the image at ${flash.address ?? '0x08040000'}: \`dfu-util -d ${arg('pid') ?? '<vendor:product>'} -a ${arg('alt') ?? '0'} -s ${flash.address ?? '0x08040000'}:leave -D ${image.file}\`.`,
      );
      break;
    case 'stm32cubeprogrammer':
      steps.push(
        'Connect the ST-LINK USB port of the board.',
        `Write the image at ${flash.address ?? '0x08000000'} with STM32CubeProgrammer: \`STM32_Programmer_CLI -c port=SWD -w ${image.file} ${flash.address ?? '0x08000000'} -v -rst\`.`,
      );
      break;
    default:
      steps.push(`Write the image at ${flash.address ?? 'the address of the board'} with your programmer (the build of this image names the \`${flash.runner}\` runner).`);
  }
  steps.push('Then connect Studio to the board over its serial port.');
  return steps;
}

export function presentFirmwareImage(
  result: FirmwareImagesResult | null,
  ideId: string | undefined,
  studio: { version: string; platform: string },
): FirmwareImagePresentation {
  if (ideId === undefined || ideId === '' || ideId === 'custom') return { kind: 'no-board' };
  if (result === null) return { kind: 'unavailable', message: 'The firmware images are not available in this application.' };
  if (result.status === 'absent') {
    return { kind: 'unavailable', message: 'This build of Studio holds no firmware image: images come with a release. Download them from the release page of this project, or build the runtime from source.' };
  }
  if (result.status === 'invalid') {
    return { kind: 'unavailable', message: 'The firmware manifest of this installation could not be read, so no image is shown. Reinstall Studio from a release.' };
  }
  const flash = orderedFlashImages(result.images);
  const image = flash.find((candidate) => candidate.board === ideId);
  if (!image) return { kind: 'no-image', message: `The release ${result.version} has no firmware image for this board.` };
  const debug = result.images.find((candidate) => candidate.board === ideId && candidate.role === 'debug');
  const main = fileView(image, result.folder, result.version);
  return {
    kind: 'ready',
    board: image.board,
    displayName: image.displayName,
    learner: image.learner,
    version: result.version,
    commit: result.commit,
    versionNote: result.version === studio.version ? null : `These images are from release ${result.version}; this Studio is ${studio.version}. Use the images of the release that your firmware tools and your Studio share.`,
    evidenceLevel: image.evidenceLevel,
    evidence: LEVEL_TEXT[image.evidenceLevel],
    image: main,
    debug: debug ? fileView(debug, result.folder, result.version) : null,
    steps: flashSteps(image, studio.platform, main.offline),
    boards: flash.map((candidate) => ({ board: candidate.board, displayName: candidate.displayName, learner: candidate.learner, file: candidate.file, offline: candidate.bundled === 'verified' })),
    notice: NO_FLASH_NOTICE,
  };
}
