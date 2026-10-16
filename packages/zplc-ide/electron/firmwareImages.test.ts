// REL-025: the main process lists the firmware images that this installation carries, and checks each file against the
// checksum of the manifest. It reads a folder and answers data: it opens no port and runs nothing.
import { afterAll, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadFirmwareImages } from './firmwareImages';
import { parseFirmwareImagesResult } from './firmwareImagesProtocol';

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const VERSION = '2.0.0-rc.4';
const COMMIT = 'a'.repeat(40);

function image(board: string, boardId: string, file: string, content: string, patch: Record<string, unknown> = {}) {
  return {
    board, boardId, displayName: board, zephyrBoard: 'x', file, format: file.split('.').at(-1), role: 'flash', sha256: sha(content), bytes: content.length,
    evidenceLevel: 'cross-build', learner: true, flash: { runner: 'uf2', address: null, args: { 'board-id': 'RPI-RP2' } }, ...patch,
  };
}

function folder(options: { manifest?: unknown; files?: Record<string, string>; name?: string } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'zplc-fw-images-'));
  roots.push(root);
  const directory = join(root, 'firmware');
  mkdirSync(directory);
  const manifest = options.manifest ?? {
    schema: 'zplc.firmware-release/1', version: VERSION, commit: COMMIT, builds: {},
    images: [
      image('rpi_pico', 'rpi-pico-rp2040', `zplc-runtime-${VERSION}-rpi-pico-rp2040.uf2`, 'pico'),
      image('nucleo_h743zi', 'nucleo-h743zi', `zplc-runtime-${VERSION}-nucleo-h743zi.bin`, 'nucleo', { learner: false, flash: { runner: 'stm32cubeprogrammer', address: '0x08000000', args: { port: 'swd' } } }),
    ],
  };
  writeFileSync(join(directory, options.name ?? `zplc-runtime-${VERSION}.manifest.json`), JSON.stringify(manifest));
  for (const [name, content] of Object.entries(options.files ?? { [`zplc-runtime-${VERSION}-rpi-pico-rp2040.uf2`]: 'pico' })) writeFileSync(join(directory, name), content);
  return directory;
}

describe('the firmware images of an installation (REL-025)', () => {
  it('lists every image of the manifest, and says which file is inside the installation with the checksum it states', async () => {
    const result = await loadFirmwareImages(folder());
    expect(result.status).toBe('available');
    if (result.status !== 'available') return;
    expect(result).toMatchObject({ version: VERSION, commit: COMMIT });
    expect(result.images.map((entry) => [entry.board, entry.bundled])).toEqual([['rpi_pico', 'verified'], ['nucleo_h743zi', 'missing']]);
    expect(result.images[0]).toMatchObject({ sha256: sha('pico'), format: 'uf2', learner: true, evidenceLevel: 'cross-build', flash: { runner: 'uf2', address: null } });
  });

  it('says changed for a file that is not the one the manifest describes, whatever its size', async () => {
    const same = await loadFirmwareImages(folder({ files: { [`zplc-runtime-${VERSION}-rpi-pico-rp2040.uf2`]: 'PICO' } }));
    expect(same.status === 'available' && same.images[0]!.bundled).toBe('changed');
    const longer = await loadFirmwareImages(folder({ files: { [`zplc-runtime-${VERSION}-rpi-pico-rp2040.uf2`]: 'pico and more' } }));
    expect(longer.status === 'available' && longer.images[0]!.bundled).toBe('changed');
  });

  it('does not follow a link that stands in for an image', async () => {
    const directory = folder({ files: {} });
    const outside = join(directory, '..', 'outside.uf2');
    writeFileSync(outside, 'pico');
    symlinkSync(outside, join(directory, `zplc-runtime-${VERSION}-rpi-pico-rp2040.uf2`));
    const result = await loadFirmwareImages(directory);
    expect(result.status === 'available' && result.images[0]!.bundled).toBe('changed');
  });

  it('answers absent when there is no firmware folder or it is empty, and invalid for a manifest it cannot trust', async () => {
    expect(await loadFirmwareImages(join(tmpdir(), 'zplc-no-such-firmware-folder'))).toEqual({ status: 'absent' });
    const empty = mkdtempSync(join(tmpdir(), 'zplc-fw-images-'));
    roots.push(empty);
    expect(await loadFirmwareImages(empty)).toEqual({ status: 'absent' });
    const bad = (manifest: unknown) => loadFirmwareImages(folder({ manifest }));
    expect(await bad({ schema: 'other/1', version: VERSION, commit: COMMIT, images: [] })).toEqual({ status: 'invalid' });
    expect(await bad({ schema: 'zplc.firmware-release/1', version: 'latest', commit: COMMIT, images: [image('rpi_pico', 'rpi-pico-rp2040', 'zplc-runtime-latest-x.uf2', 'x')] })).toEqual({ status: 'invalid' });
    expect(await bad({ schema: 'zplc.firmware-release/1', version: VERSION, commit: 'unknown', images: [image('rpi_pico', 'rpi-pico-rp2040', `zplc-runtime-${VERSION}-x.uf2`, 'x')] })).toEqual({ status: 'invalid' });
  });

  it('refuses an image whose file name could leave the folder or does not belong to this version', async () => {
    for (const file of ['../zplc-runtime-2.0.0-rc.4-x.uf2', 'zplc-runtime-2.0.0-rc.4-x/../y.uf2', 'zplc-runtime-2.0.0-rc.3-x.uf2', 'zplc-runtime-2.0.0-rc.4-x.exe', '/etc/passwd']) {
      const manifest = { schema: 'zplc.firmware-release/1', version: VERSION, commit: COMMIT, images: [image('rpi_pico', 'rpi-pico-rp2040', file, 'x')] };
      expect({ file, status: (await loadFirmwareImages(folder({ manifest, files: {} }))).status }).toEqual({ file, status: 'invalid' });
    }
  });

  it('refuses a manifest with an unexpected flash runner argument or an address that is not hexadecimal', async () => {
    for (const flash of [{ runner: 'uf2; rm', address: null, args: {} }, { runner: 'esp32', address: '0', args: {} }, { runner: 'esp32', address: '0x00000000', args: { 'a b': '1' } }, { runner: 'esp32', address: '0x00000000', args: { port: '/dev/ttyUSB0 && x' } }]) {
      const manifest = { schema: 'zplc.firmware-release/1', version: VERSION, commit: COMMIT, images: [image('esp32s3_devkitc', 'esp32-s3-devkitc', `zplc-runtime-${VERSION}-esp32-s3-devkitc.bin`, 'x', { flash })] };
      expect((await loadFirmwareImages(folder({ manifest, files: {} }))).status).toBe('invalid');
    }
  });

  it('is validated again by whoever receives the answer', async () => {
    const result = await loadFirmwareImages(folder());
    expect(parseFirmwareImagesResult(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(parseFirmwareImagesResult({ status: 'absent' })).toEqual({ status: 'absent' });
    expect(parseFirmwareImagesResult({ status: 'absent', extra: 1 })).toBeNull();
    expect(parseFirmwareImagesResult({ status: 'available', version: VERSION, commit: COMMIT, folder: '/x', images: [{ board: 'x' }] })).toBeNull();
    expect(parseFirmwareImagesResult(null)).toBeNull();
    expect(parseFirmwareImagesResult('available')).toBeNull();
  });
});
