// The browser flasher of the flashing page (REL-024): what can be tested without a board. Nothing here opens a serial port;
// a flash is started by a person in a browser, and no test, tool or assistant does it (AGENTS.md rule 7).
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { flashInfo, imageName, parseConfig, plannedFormats } from '../../scripts/release/firmware-images';

const ROOT = new URL('../../', import.meta.url).pathname;
const flasher = await import(join(ROOT, 'docs/src/components/FirmwareFlasher/flasher'));

const esp32 = (
  JSON.parse(await Bun.file(join(ROOT, 'firmware/app/boards/boards.json')).text()) as { board_id: string; zephyr_board: string }[]
).find((board) => board.zephyr_board.split('/')[1] === 'esp32s3')!;
const RUNNERS = 'flash-runner: esp32\nargs:\n  esp32:\n    - --esp-app-address=0x0\n    - --esp-flash-size=8MB\n';

describe('browser flasher for the ESP32-S3 (REL-024): the manifest it builds', () => {
  it('names the release image of the ESP32-S3 board of the manifest, with the name the release pipeline gives it', () => {
    const format = plannedFormats(esp32.zephyr_board).find((entry) => entry.role === 'flash')!.format;
    expect(flasher.imageFileName('2.0.0')).toBe(imageName('2.0.0', esp32.board_id, format));
    expect(flasher.imageFileName('2.0.0-rc.4')).toBe('zplc-runtime-2.0.0-rc.4-esp32-s3-devkitc.bin');
  });

  it('writes the merged image at the address that the release manifest names for it', () => {
    const info = flashInfo(parseConfig('CONFIG_FLASH_BASE_ADDRESS=0x0\nCONFIG_FLASH_LOAD_OFFSET=0x0'), RUNNERS, 'bin')!;
    expect(flasher.ESP32S3_OFFSET).toBe(Number(info.address));
    const manifest = flasher.buildFlashManifest({ version: '2.0.0', imageUrl: 'blob:https://example.test/abc' });
    expect(manifest.builds).toEqual([{ chipFamily: 'ESP32-S3', parts: [{ path: 'blob:https://example.test/abc', offset: 0 }] }]);
  });

  it('asks for no erase of the flash unless the person chooses it, and names the image and its version', () => {
    const manifest = flasher.buildFlashManifest({ version: '2.0.0-rc.4', imageUrl: 'blob:x' });
    expect(manifest).toMatchObject({
      name: 'ZPLC runtime for the ESP32-S3-DevKitC-1',
      version: '2.0.0-rc.4',
      new_install_prompt_erase: false,
    });
  });

  it('reads the version out of a downloaded image name, and refuses a file that is not the ESP32-S3 image', () => {
    expect(flasher.versionOfImage('zplc-runtime-2.0.0-rc.4-esp32-s3-devkitc.bin')).toBe('2.0.0-rc.4');
    expect(flasher.versionOfImage('zplc-runtime-2.0.0-rpi-pico-rp2040.uf2')).toBeUndefined();
    expect(flasher.versionOfImage('zplc-runtime-2.0.0-nucleo-h743zi.bin')).toBeUndefined();
    expect(flasher.versionOfImage('firmware.bin')).toBeUndefined();
  });

  it('computes the SHA-256 that the person compares with SHA256SUMS', async () => {
    expect(await flasher.sha256Hex(new TextEncoder().encode('abc').buffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('browser flasher for the ESP32-S3 (REL-024): the browsers', () => {
  it('is offered where Web Serial exists, and the fallback text is shown elsewhere', () => {
    expect(flasher.webSerialSupported({ serial: {} })).toBe(true);
    expect(flasher.webSerialSupported({})).toBe(false);
    expect(flasher.webSerialSupported(undefined)).toBe(false);
  });
});

describe('browser flasher for the ESP32-S3 (REL-024): the component', () => {
  it(
    'renders, before the browser is known, the safety text and the fallback for browsers without Web Serial, and offers no flash ' +
      'button',
    async () => {
      const React = await import(join(ROOT, 'docs/node_modules/react'));
      const { renderToStaticMarkup } = await import(join(ROOT, 'docs/node_modules/react-dom/server'));
      const { default: FirmwareFlasher } = await import(join(ROOT, 'docs/src/components/FirmwareFlasher/index'));
      const html: string = renderToStaticMarkup(React.createElement(FirmwareFlasher, { lang: 'en' }));
      expect(html).toContain('AI never flashes');
      expect(html).toContain('Chrome and Edge');
      expect(html).not.toContain('esp-web-install-button');
    },
  );

  it('says in Spanish, with usted, that a person starts every step', () => {
    expect(flasher.TEXT.es.safety).toMatch(/Usted/);
    expect(flasher.TEXT.es.safety).toMatch(/nunca/i);
    expect(flasher.TEXT.es.unsupported).toContain('Chrome y Edge');
    expect(JSON.stringify(flasher.TEXT.es)).not.toMatch(/\b(tu|tus|usá|elegí|podés)\b/i);
  });
});
