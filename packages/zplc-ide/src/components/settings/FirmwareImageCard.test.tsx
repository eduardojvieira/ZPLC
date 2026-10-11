import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { FirmwareImage, FirmwareImagesResult } from '../../../electron/firmwareImagesProtocol';
import { presentFirmwareImage } from '../../boards/firmwareImage';
import { FirmwareImageView } from './FirmwareImageCard';

const VERSION = '2.0.0-rc.4';
const pico: FirmwareImage = {
  board: 'rpi_pico', boardId: 'rpi-pico-rp2040', displayName: 'Raspberry Pi Pico (RP2040)', file: `zplc-runtime-${VERSION}-rpi-pico-rp2040.uf2`, format: 'uf2', role: 'flash',
  sha256: 'b'.repeat(64), bytes: 309760, evidenceLevel: 'cross-build', learner: true, flash: { runner: 'uf2', address: null, args: { 'board-id': 'RPI-RP2' } }, bundled: 'verified',
};
const result: FirmwareImagesResult = { status: 'available', version: VERSION, commit: 'c'.repeat(40), folder: '/opt/ZPLC IDE/resources/firmware', images: [pico] };
const view = (shown: ReturnType<typeof presentFirmwareImage>) => renderToStaticMarkup(<FirmwareImageView presentation={shown} />);

describe('the firmware image card (REL-025)', () => {
  it('shows the image, its checksum, where it is, the evidence level and the steps, and offers nothing that flashes', () => {
    const html = view(presentFirmwareImage(result, 'rpi_pico', { version: VERSION, platform: 'linux' }));
    expect(html).toContain('Raspberry Pi Pico (RP2040)');
    expect(html).toContain('learner board, available offline');
    expect(html).toContain(pico.file);
    expect(html).toContain('b'.repeat(64));
    expect(html).toContain('/opt/ZPLC IDE/resources/firmware/');
    expect(html).toContain('data-evidence="cross-build"');
    expect(html).toContain('aria-label="Flashing steps"');
    expect(html).toContain('RPI-RP2');
    expect(html).toContain('Studio does not flash a board');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
  });

  it('says why there is no image instead of leaving the place empty', () => {
    expect(view(presentFirmwareImage({ status: 'absent' }, 'rpi_pico', { version: VERSION, platform: 'linux' }))).toContain('holds no firmware image');
    expect(view(presentFirmwareImage(result, 'my_own_board', { version: VERSION, platform: 'linux' }))).toContain('has no firmware image for this board');
    expect(view(presentFirmwareImage(result, 'custom', { version: VERSION, platform: 'linux' }))).toBe('');
  });
});
