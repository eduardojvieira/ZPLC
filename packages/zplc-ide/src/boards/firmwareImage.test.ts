// REL-025: for the selected board Studio shows the image, its checksum and the flashing steps, and never flashes.
import { describe, expect, it } from 'bun:test';

import type { FirmwareImage, FirmwareImagesResult } from '../../electron/firmwareImagesProtocol';
import { NO_FLASH_NOTICE, flashSteps, orderedFlashImages, presentFirmwareImage } from './firmwareImage';

const VERSION = '2.0.0-rc.4';
const sha = (character: string) => character.repeat(64);

function image(board: string, patch: Partial<FirmwareImage> = {}): FirmwareImage {
  return {
    board, boardId: board.replaceAll('_', '-'), displayName: `Board ${board}`, file: `zplc-runtime-${VERSION}-${board.replaceAll('_', '-')}.bin`, format: 'bin', role: 'flash',
    sha256: sha('a'), bytes: 1000, evidenceLevel: 'cross-build', learner: false, flash: { runner: 'stm32cubeprogrammer', address: '0x08000000', args: { port: 'swd' } }, bundled: 'missing', ...patch,
  };
}

const pico = image('rpi_pico', { file: `zplc-runtime-${VERSION}-rpi-pico-rp2040.uf2`, format: 'uf2', learner: true, bundled: 'verified', flash: { runner: 'uf2', address: null, args: { 'board-id': 'RPI-RP2' } }, sha256: sha('p') });
const esp = image('esp32s3_devkitc', {
  file: `zplc-runtime-${VERSION}-esp32-s3-devkitc.bin`, learner: true, bundled: 'verified', sha256: sha('e'),
  flash: { runner: 'esp32', address: '0x00000000', args: { 'esp-app-address': '0x0', 'esp-flash-size': '8MB', 'esp-flash-freq': '80m', 'esp-flash-mode': 'dio' } },
});
const nucleo = image('nucleo_h743zi', { sha256: sha('n') });
const nucleoElf = image('nucleo_h743zi', { file: `zplc-runtime-${VERSION}-nucleo-h743zi.elf`, format: 'elf', role: 'debug', flash: null, sha256: sha('d') });
const giga = image('arduino_giga_r1', { flash: { runner: 'dfu-util', address: '0x08040000', args: { pid: '2341:0366', alt: '0', dfuse: 'true' } } });

const result = (images: FirmwareImage[], folder = '/opt/ZPLC IDE/resources/firmware'): FirmwareImagesResult => ({ status: 'available', version: VERSION, commit: 'c'.repeat(40), folder, images });
const studio = { version: VERSION, platform: 'linux' };

describe('the image of the selected board (REL-025)', () => {
  const all = result([nucleo, giga, pico, nucleoElf, esp]);

  it('shows the file, its checksum, its size and where it is, for a learner board inside the installation', () => {
    const shown = presentFirmwareImage(all, 'rpi_pico', studio);
    expect(shown.kind).toBe('ready');
    if (shown.kind !== 'ready') return;
    expect(shown.image).toMatchObject({ file: pico.file, sha256: sha('p'), bytes: 1000, offline: true, location: `/opt/ZPLC IDE/resources/firmware/${pico.file}` });
    expect(shown.learner).toBe(true);
    expect(shown.versionNote).toBeNull();
  });

  it('says that a board whose image is not bundled has to be downloaded from its release, and still shows the checksum', () => {
    const shown = presentFirmwareImage(all, 'nucleo_h743zi', studio);
    expect(shown.kind === 'ready' && shown.image).toMatchObject({ offline: false, sha256: sha('n') });
    expect(shown.kind === 'ready' && shown.image.location).toContain('https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.0-rc.4');
    expect(shown.kind === 'ready' && shown.debug).toMatchObject({ file: nucleoElf.file, offline: false });
  });

  it('refuses to point at a bundled file that is not the one the manifest describes', () => {
    const changed = result([{ ...pico, bundled: 'changed' }, esp]);
    const shown = presentFirmwareImage(changed, 'rpi_pico', studio);
    expect(shown.kind === 'ready' && shown.image.offline).toBe(false);
    expect(shown.kind === 'ready' && shown.image.location).toContain('is not the file the manifest describes');
  });

  it('lists the two learner boards first, then the rest in the order of the manifest, and no debug file', () => {
    expect(orderedFlashImages(all.status === 'available' ? all.images : []).map((entry) => entry.board)).toEqual(['rpi_pico', 'esp32s3_devkitc', 'nucleo_h743zi', 'arduino_giga_r1']);
    const shown = presentFirmwareImage(all, 'arduino_giga_r1', studio);
    expect(shown.kind === 'ready' && shown.boards.map((entry) => [entry.board, entry.learner, entry.offline])).toEqual([
      ['rpi_pico', true, true], ['esp32s3_devkitc', true, true], ['nucleo_h743zi', false, false], ['arduino_giga_r1', false, false],
    ]);
  });

  it('labels the image with the evidence level of its board in the words of the hardware support page', () => {
    const shown = presentFirmwareImage(all, 'rpi_pico', studio);
    expect(shown.kind === 'ready' && shown.evidence).toContain('cross-build');
    expect(shown.kind === 'ready' && shown.evidence).toContain('has not been flashed or run on the board');
    const proven = presentFirmwareImage(result([{ ...pico, evidenceLevel: 'human-hil' }]), 'rpi_pico', studio);
    expect(proven.kind === 'ready' && proven.evidence).toContain('check that it names this one');
  });

  it('notes a manifest from another release than this Studio', () => {
    const shown = presentFirmwareImage(all, 'rpi_pico', { version: '2.0.0-rc.3', platform: 'linux' });
    expect(shown.kind === 'ready' && shown.versionNote).toContain('release 2.0.0-rc.4');
  });

  it('says why there is nothing to show instead of an empty card', () => {
    expect(presentFirmwareImage(null, 'rpi_pico', studio)).toMatchObject({ kind: 'unavailable' });
    expect(presentFirmwareImage({ status: 'absent' }, 'rpi_pico', studio)).toMatchObject({ kind: 'unavailable', message: expect.stringContaining('holds no firmware image') });
    expect(presentFirmwareImage({ status: 'invalid' }, 'rpi_pico', studio)).toMatchObject({ kind: 'unavailable', message: expect.stringContaining('could not be read') });
    expect(presentFirmwareImage(all, 'my_own_board', studio)).toMatchObject({ kind: 'no-image' });
    expect(presentFirmwareImage(all, undefined, studio)).toEqual({ kind: 'no-board' });
    expect(presentFirmwareImage(all, 'custom', studio)).toEqual({ kind: 'no-board' });
  });
});

describe('the flashing steps (REL-025)', () => {
  it('copies a UF2 image to the boot drive of the board that the build names', () => {
    const steps = flashSteps(pico, 'linux', true);
    expect(steps.join('\n')).toContain('RPI-RP2');
    expect(steps.join('\n')).toContain(`Copy ${pico.file} onto that drive`);
    expect(steps[1]).toContain(`sha256sum ${pico.file}`);
    expect(steps[1]).toContain(sha('p'));
  });

  it('writes the ESP32-S3 image at the address and with the flash parameters of its own build', () => {
    const text = flashSteps(esp, 'linux', true).join('\n');
    expect(text).toContain('esptool --chip esp32s3 --port <port> write-flash --flash-mode dio --flash-freq 80m --flash-size 8MB 0x00000000');
    expect(text).toContain(esp.file);
  });

  it('writes a DFU board and an ST-LINK board at the address of their build, with the identifier that the build names', () => {
    expect(flashSteps(giga, 'linux', false).join('\n')).toContain('dfu-util -d 2341:0366 -a 0 -s 0x08040000:leave');
    expect(flashSteps(nucleo, 'linux', false).join('\n')).toContain('STM32_Programmer_CLI -c port=SWD -w');
    expect(flashSteps(nucleo, 'linux', false).join('\n')).toContain('0x08000000');
  });

  it('checks the file with the tool of the platform, and says to download it first when it is not inside Studio', () => {
    expect(flashSteps(nucleo, 'darwin', false)[1]).toContain('shasum -a 256');
    expect(flashSteps(nucleo, 'win32', false)[1]).toContain('Get-FileHash');
    expect(flashSteps(nucleo, 'linux', false)[0]).toContain('Download');
    expect(flashSteps(nucleo, 'linux', true)[0]).not.toContain('Download');
  });

  it('has no step for an image that is only for a debugger', () => {
    expect(flashSteps(nucleoElf, 'linux', true)).toHaveLength(2);
  });

  it('is written for a person: Studio runs none of it, and the card says so', () => {
    expect(NO_FLASH_NOTICE).toContain('does not flash');
    const shown = presentFirmwareImage(result([pico, esp]), 'rpi_pico', studio);
    expect(shown.kind === 'ready' && shown.notice).toBe(NO_FLASH_NOTICE);
  });
});
